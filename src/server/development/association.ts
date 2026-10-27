import { and, between, eq, gte, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { accountMatches, rankedBlocks, rankedGames, riotAccounts } from "@/server/db/schema";
import { LATE_GAME_DAYS, planAssociation, SOLO_DUO_QUEUE, type CandidateGame, type SessionWindow } from "@/domain/development/sessions";
import { isRole } from "@/domain/roles";

/*
  Sessions fill themselves: the Solo/Duo games the account sync stores for a player join the
  session they were played in (domain/development/sessions planAssociation decides which, and which
  sessions end). Called after every sync that stored games for the player, and when their Ranked
  Development pages are read, so a game is never missed whichever path stored it. It reads only
  stored rows, never Riot, and is idempotent: a game already in a session is never added again
  (one row per player and Riot match), a game typed in by hand for the same session is linked to
  the synced match instead of being added a second time, and a game the player removed from a
  session stays out.
*/

const DAY = 86_400_000;
/** A synced game may have started this long before the moment its session collects from. */
const IN_PROGRESS_MARGIN_MS = 3 * 3_600_000;
/** A game typed in by hand is matched to the synced game within this window of its start. */
const MANUAL_MATCH_BEFORE_MS = 3_600_000;
const MANUAL_MATCH_AFTER_MS = 4 * 3_600_000;

export interface AssociationResult {
  added: number;
  linked: number;
  ended: number;
}

export async function associateSessionGames(db: Db, ownerPlayerId: string, now: Date = new Date()): Promise<AssociationResult> {
  const result: AssociationResult = { added: 0, linked: 0, ended: 0 };
  const since = new Date(now.getTime() - LATE_GAME_DAYS * DAY);
  const sessions = await db
    .select({ id: rankedBlocks.id, status: rankedBlocks.status, collectsFrom: rankedBlocks.collectsFrom, startedAt: rankedBlocks.startedAt, completedAt: rankedBlocks.completedAt, lastActivityAt: rankedBlocks.lastActivityAt, rule: rankedBlocks.completionRule, accountId: rankedBlocks.accountId, objectiveId: rankedBlocks.objectiveId })
    .from(rankedBlocks)
    .where(and(eq(rankedBlocks.playerId, ownerPlayerId), isNotNull(rankedBlocks.collectsFrom), or(eq(rankedBlocks.status, "active"), gte(rankedBlocks.completedAt, since))));
  if (sessions.length === 0) return result;

  const losses = await db
    .select({ id: rankedGames.blockId, n: sql<number>`count(*) filter (where ${rankedGames.result} = 'loss')` })
    .from(rankedGames)
    .where(and(eq(rankedGames.playerId, ownerPlayerId), inArray(rankedGames.blockId, sessions.map((s) => s.id))))
    .groupBy(rankedGames.blockId);
  const lossesBy = new Map(losses.map((l) => [l.id, Number(l.n)]));

  const accounts = await db.select({ id: riotAccounts.id }).from(riotAccounts).where(eq(riotAccounts.playerId, ownerPlayerId));
  const from = Math.min(...sessions.map((s) => s.collectsFrom!.getTime())) - IN_PROGRESS_MARGIN_MS;
  const rows = accounts.length
    ? await db
        .select({ matchId: accountMatches.matchId, accountId: accountMatches.accountId, gameCreation: accountMatches.gameCreation, gameDuration: accountMatches.gameDuration, win: accountMatches.win, championId: accountMatches.championId, enemyChampionId: accountMatches.enemyChampionId, role: accountMatches.role })
        .from(accountMatches)
        .where(
          and(
            inArray(accountMatches.accountId, accounts.map((a) => a.id)),
            eq(accountMatches.queueId, SOLO_DUO_QUEUE),
            isNotNull(accountMatches.championId),
            isNotNull(accountMatches.win),
            gte(accountMatches.gameCreation, from),
            sql`NOT EXISTS (SELECT 1 FROM ranked_games g WHERE g.player_id = ${ownerPlayerId} AND g.riot_match_id = ${accountMatches.matchId})`,
            // A synced game the player removed from a session never joins one by itself again.
            sql`NOT EXISTS (SELECT 1 FROM ranked_blocks b WHERE b.player_id = ${ownerPlayerId} AND b.dismissed_match_ids @> jsonb_build_array(${accountMatches.matchId}))`,
          ),
        )
        .orderBy(accountMatches.gameCreation, accountMatches.accountId)
    : [];
  // One player cannot be in a match twice; if two linked accounts ever list the same match, the first is kept.
  const byMatch = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!byMatch.has(r.matchId)) byMatch.set(r.matchId, r);

  const windows: SessionWindow[] = sessions.map((s) => ({
    id: s.id,
    startedAt: s.collectsFrom!.getTime(),
    endedAt: s.status === "completed" ? (s.completedAt ?? s.collectsFrom!).getTime() : null,
    lastActivityAt: (s.lastActivityAt ?? s.startedAt).getTime(),
    rule: s.rule === "two-losses" ? "two-losses" : "target",
    losses: lossesBy.get(s.id) ?? 0,
    accountId: s.accountId,
  }));
  const candidates: CandidateGame[] = [...byMatch.values()].map((r) => ({ matchId: r.matchId, accountId: r.accountId, start: r.gameCreation, end: r.gameCreation + (r.gameDuration ?? 0) * 1000, win: !!r.win }));
  const plan = planAssociation(windows, candidates, now.getTime());
  if (plan.assign.length === 0 && plan.end.length === 0) return result;

  const sessionBy = new Map(sessions.map((s) => [s.id, s]));
  await db.transaction(async (tx) => {
    const activity = new Map<string, number>();
    for (const a of plan.assign) {
      const r = byMatch.get(a.matchId)!;
      const session = sessionBy.get(a.sessionId)!;
      const end = r.gameCreation + (r.gameDuration ?? 0) * 1000;
      activity.set(session.id, Math.max(activity.get(session.id) ?? 0, end));
      const outcome = r.win ? "win" : "loss";
      const facts = { riotMatchId: r.matchId, accountId: r.accountId, championId: r.championId!, enemyChampionId: r.enemyChampionId, role: isRole(r.role) ? r.role : null, result: outcome, playedAt: new Date(r.gameCreation) };
      const [typed] = await tx
        .select({ id: rankedGames.id })
        .from(rankedGames)
        .where(and(eq(rankedGames.playerId, ownerPlayerId), eq(rankedGames.blockId, session.id), isNull(rankedGames.riotMatchId), eq(rankedGames.championId, r.championId!), eq(rankedGames.result, outcome), between(rankedGames.playedAt, new Date(r.gameCreation - MANUAL_MATCH_BEFORE_MS), new Date(r.gameCreation + MANUAL_MATCH_AFTER_MS))))
        .orderBy(rankedGames.playedAt)
        .limit(1);
      if (typed) {
        await tx.update(rankedGames).set({ ...facts, updatedAt: now }).where(eq(rankedGames.id, typed.id));
        result.linked += 1;
        continue;
      }
      const inserted = await tx
        .insert(rankedGames)
        .values({ ...facts, blockId: session.id, playerId: ownerPlayerId, source: "auto", objectiveId: session.objectiveId, reviewStatus: "pending", needsConfirmation: !!a.ambiguousWith, alternativeBlockId: a.ambiguousWith })
        .onConflictDoNothing()
        .returning({ id: rankedGames.id });
      result.added += inserted.length;
    }
    for (const [id, at] of activity) await tx.update(rankedBlocks).set({ lastActivityAt: sql`GREATEST(coalesce(${rankedBlocks.lastActivityAt}, ${rankedBlocks.startedAt}), ${new Date(at).toISOString()}::timestamptz)`, updatedAt: now }).where(eq(rankedBlocks.id, id));
    for (const e of plan.end) {
      const ended = await tx
        .update(rankedBlocks)
        .set({ status: "completed", completedAt: new Date(e.at), completedReason: e.reason, updatedAt: now })
        .where(and(eq(rankedBlocks.id, e.sessionId), eq(rankedBlocks.status, "active")))
        .returning({ id: rankedBlocks.id });
      result.ended += ended.length;
    }
  });
  return result;
}

/** Runs the association without ever failing its caller (the account sync, a page). */
export async function associateQuietly(db: Db, ownerPlayerId: string | null | undefined): Promise<void> {
  if (!ownerPlayerId) return;
  try {
    await associateSessionGames(db, ownerPlayerId);
  } catch (err) {
    console.warn("[development] session games not associated:", (err as Error).message);
  }
}
