import { and, desc, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { accountMatches, clashScoutAccounts, clashScouts, matchDetails, riotAccounts, players, users } from "@/server/db/schema";
import type { ScoutContent } from "@/domain/clash-scout/types";

/*
  Saved scouts, always within one team. Every function takes the team's id and every query is
  filtered by it, so a scout id from another team reads as "not found": there is no lookup by id
  alone. Writes keep the small index of verified accounts (clash_scout_accounts) in step with the
  snapshot in the same transaction.
*/

export interface ScoutSummary {
  id: string;
  opponentName: string;
  platform: string;
  tournamentName: string | null;
  playersCaptured: number;
  playersVerified: number;
  archived: boolean;
  scoutedAt: Date;
  createdBy: string | null;
  createdByName: string | null;
}

export interface SavedScout extends ScoutSummary {
  content: ScoutContent;
  updatedAt: Date;
}

const summaryColumns = {
  id: clashScouts.id,
  opponentName: clashScouts.opponentName,
  platform: clashScouts.platform,
  tournamentName: clashScouts.tournamentName,
  playersCaptured: clashScouts.playersCaptured,
  playersVerified: clashScouts.playersVerified,
  archivedAt: clashScouts.archivedAt,
  scoutedAt: clashScouts.scoutedAt,
  createdBy: clashScouts.createdBy,
  createdByName: users.displayName,
};

type SummaryRow = { [K in keyof typeof summaryColumns]: unknown } & Record<string, unknown>;
const toSummary = (r: SummaryRow): ScoutSummary => ({
  id: r.id as string,
  opponentName: r.opponentName as string,
  platform: r.platform as string,
  tournamentName: (r.tournamentName as string | null) ?? null,
  playersCaptured: Number(r.playersCaptured),
  playersVerified: Number(r.playersVerified),
  archived: !!r.archivedAt,
  scoutedAt: r.scoutedAt as Date,
  createdBy: (r.createdBy as string | null) ?? null,
  createdByName: (r.createdByName as string | null) ?? null,
});

/** The derived columns of a snapshot. */
function derived(content: ScoutContent) {
  const named = content.players.filter((p) => p.name.trim());
  const verified = content.players.filter((p) => p.verification === "verified" && p.puuid);
  const search = [content.opponentName, content.tournament.name ?? "", ...content.players.map((p) => p.name), ...verified.map((p) => p.riotId ?? "")].join(" \u0001 ").normalize("NFKC").toLocaleLowerCase("en");
  return {
    opponentName: content.opponentName.trim() || "Unnamed opponent",
    platform: content.platform,
    tournamentName: content.tournament.name?.trim() || null,
    playersCaptured: named.length,
    playersVerified: verified.length,
    searchText: search,
    accounts: verified.map((p) => ({ slot: p.slot, puuid: p.puuid! })),
  };
}

export async function createScout(db: Db, teamId: string, userId: string | null, content: ScoutContent): Promise<string> {
  const d = derived(content);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(clashScouts)
      .values({ teamId, content, opponentName: d.opponentName, platform: d.platform, tournamentName: d.tournamentName, playersCaptured: d.playersCaptured, playersVerified: d.playersVerified, searchText: d.searchText, createdBy: userId, updatedBy: userId })
      .returning({ id: clashScouts.id });
    if (d.accounts.length) await tx.insert(clashScoutAccounts).values(d.accounts.map((a) => ({ scoutId: row!.id, teamId, slot: a.slot, puuid: a.puuid })));
    return row!.id;
  });
}

export class ScoutConflictError extends Error {
  constructor() {
    super("Someone else changed this scout meanwhile. Reload it to see their changes.");
    this.name = "ScoutConflictError";
  }
}

/** Replaces a saved scout's snapshot; `expectedUpdatedAt` guards against overwriting another member's newer edit. */
export async function updateScout(db: Db, teamId: string, scoutId: string, userId: string | null, content: ScoutContent, expectedUpdatedAt: Date | null): Promise<Date> {
  const d = derived(content);
  return db.transaction(async (tx) => {
    const [current] = await tx.select({ updatedAt: clashScouts.updatedAt }).from(clashScouts).where(and(eq(clashScouts.id, scoutId), eq(clashScouts.teamId, teamId))).for("update");
    if (!current) throw new Error("Scout not found.");
    if (expectedUpdatedAt && current.updatedAt.getTime() !== expectedUpdatedAt.getTime()) throw new ScoutConflictError();
    const now = new Date();
    await tx
      .update(clashScouts)
      .set({ content, opponentName: d.opponentName, platform: d.platform, tournamentName: d.tournamentName, playersCaptured: d.playersCaptured, playersVerified: d.playersVerified, searchText: d.searchText, updatedBy: userId, updatedAt: now })
      .where(and(eq(clashScouts.id, scoutId), eq(clashScouts.teamId, teamId)));
    await tx.delete(clashScoutAccounts).where(eq(clashScoutAccounts.scoutId, scoutId));
    if (d.accounts.length) await tx.insert(clashScoutAccounts).values(d.accounts.map((a) => ({ scoutId, teamId, slot: a.slot, puuid: a.puuid })));
    return now;
  });
}

export async function getScout(db: Db, teamId: string, scoutId: string): Promise<SavedScout | null> {
  if (!/^[0-9a-f-]{36}$/i.test(scoutId)) return null;
  const [row] = await db
    .select({ ...summaryColumns, content: clashScouts.content, updatedAt: clashScouts.updatedAt })
    .from(clashScouts)
    .leftJoin(users, eq(users.id, clashScouts.createdBy))
    .where(and(eq(clashScouts.id, scoutId), eq(clashScouts.teamId, teamId)));
  return row ? { ...toSummary(row), content: row.content, updatedAt: row.updatedAt } : null;
}

/** The team's saved scouts, newest first: active or archived, optionally matching a search (opponent, tournament, player names or verified Riot IDs). */
export async function listScouts(db: Db, teamId: string, options: { archived?: boolean; query?: string; limit?: number } = {}): Promise<ScoutSummary[]> {
  const q = (options.query ?? "").normalize("NFKC").toLocaleLowerCase("en").trim();
  const rows = await db
    .select(summaryColumns)
    .from(clashScouts)
    .leftJoin(users, eq(users.id, clashScouts.createdBy))
    .where(and(eq(clashScouts.teamId, teamId), options.archived ? isNotNull(clashScouts.archivedAt) : isNull(clashScouts.archivedAt), q ? sql`strpos(${clashScouts.searchText}, ${q}) > 0` : undefined))
    .orderBy(desc(clashScouts.scoutedAt))
    .limit(Math.min(options.limit ?? 50, 200));
  return rows.map(toSummary);
}

export async function setScoutArchived(db: Db, teamId: string, scoutId: string, archived: boolean): Promise<boolean> {
  const rows = await db
    .update(clashScouts)
    .set({ archivedAt: archived ? new Date() : null })
    .where(and(eq(clashScouts.id, scoutId), eq(clashScouts.teamId, teamId)))
    .returning({ id: clashScouts.id });
  return rows.length > 0;
}

export async function deleteScout(db: Db, teamId: string, scoutId: string): Promise<boolean> {
  const rows = await db.delete(clashScouts).where(and(eq(clashScouts.id, scoutId), eq(clashScouts.teamId, teamId))).returning({ id: clashScouts.id });
  return rows.length > 0;
}

/** Who created a scout (for "edit your own" permissions), or undefined when the scout is not the team's. */
export async function scoutCreator(db: Db, teamId: string, scoutId: string): Promise<{ createdBy: string | null } | undefined> {
  const [row] = await db.select({ createdBy: clashScouts.createdBy }).from(clashScouts).where(and(eq(clashScouts.id, scoutId), eq(clashScouts.teamId, teamId)));
  return row;
}

export interface EarlierScout {
  puuid: string;
  scoutId: string;
  opponentName: string;
  scoutedAt: Date;
}

/**
 * The team's earlier saved scouts that contain any of these verified accounts (by PUUID only,
 * never by name), newest first, at most three per account. The current scout is left out.
 */
export async function earlierScoutsOf(db: Db, teamId: string, puuids: string[], excludeScoutId: string | null = null): Promise<EarlierScout[]> {
  const ids = [...new Set(puuids.filter(Boolean))].slice(0, 10);
  if (!ids.length) return [];
  if (excludeScoutId && !/^[0-9a-f-]{36}$/i.test(excludeScoutId)) excludeScoutId = null;
  const rows = await db
    .select({ puuid: clashScoutAccounts.puuid, scoutId: clashScouts.id, opponentName: clashScouts.opponentName, scoutedAt: clashScouts.scoutedAt })
    .from(clashScoutAccounts)
    .innerJoin(clashScouts, eq(clashScouts.id, clashScoutAccounts.scoutId))
    .where(and(eq(clashScoutAccounts.teamId, teamId), eq(clashScouts.teamId, teamId), inArray(clashScoutAccounts.puuid, ids), excludeScoutId ? ne(clashScouts.id, excludeScoutId) : undefined))
    .orderBy(desc(clashScouts.scoutedAt));
  const perAccount = new Map<string, number>();
  return rows.filter((r) => {
    const n = (perAccount.get(r.puuid) ?? 0) + 1;
    perAccount.set(r.puuid, n);
    return n <= 3;
  });
}

export interface ScoutMatch {
  matchId: string;
  gameCreation: number;
  /** How many of the scout's verified accounts played against the team in it. */
  opponentsFound: number;
  win: boolean | null;
}

/**
 * Stored games of the team, from the day before the scout on, in which at least two of the scout's
 * verified accounts played on the other side: evidence that this is the scouted match (never
 * assumed from the scout alone). Reads only the team's own games in that window.
 */
export async function matchesForScout(db: Db, teamId: string, scout: { scoutedAt: Date; content: ScoutContent }): Promise<ScoutMatch[]> {
  const opponents = new Set(scout.content.players.filter((p) => p.verification === "verified" && p.puuid).map((p) => p.puuid!));
  if (opponents.size < 2) return [];
  const since = scout.scoutedAt.getTime() - 86_400_000;
  const rows = await db
    .selectDistinct({ matchId: matchDetails.matchId, gameCreation: matchDetails.gameCreation, participants: matchDetails.participants, accountPuuid: riotAccounts.puuid })
    .from(accountMatches)
    .innerJoin(riotAccounts, eq(riotAccounts.id, accountMatches.accountId))
    .innerJoin(players, eq(players.id, riotAccounts.playerId))
    .innerJoin(matchDetails, eq(matchDetails.matchId, accountMatches.matchId))
    .where(
      and(
        eq(players.teamId, teamId),
        sql`${accountMatches.gameCreation} >= ${since}`,
        sql`${accountMatches.gameCreation} <= ${since + 8 * 86_400_000}`,
        // Only games with one of the scouted accounts in them leave the database (match records are large).
        sql`exists (select 1 from jsonb_array_elements(${matchDetails.participants}) as p(x) where x->>'puuid' in (${sql.join([...opponents].map((v) => sql`${v}`), sql`, `)}))`,
      ),
    )
    .limit(200);
  const seen = new Set<string>();
  const out: ScoutMatch[] = [];
  for (const r of rows) {
    if (seen.has(r.matchId)) continue;
    const me = r.participants.find((p) => p.puuid === r.accountPuuid);
    if (!me) continue;
    const against = r.participants.filter((p) => p.teamId !== me.teamId && p.puuid && opponents.has(p.puuid)).length;
    if (against < 2) continue;
    seen.add(r.matchId);
    out.push({ matchId: r.matchId, gameCreation: r.gameCreation, opponentsFound: against, win: typeof me.win === "boolean" ? me.win : null });
  }
  return out.sort((a, b) => a.gameCreation - b.gameCreation);
}

/** The server most of the team's own accounts play on: the opponents' likely server (a default the member can change). */
export async function teamPlatform(db: Db, teamId: string): Promise<string | null> {
  const [row] = await db
    .select({ platform: riotAccounts.platform, n: sql<number>`count(*)` })
    .from(riotAccounts)
    .innerJoin(players, eq(players.id, riotAccounts.playerId))
    .where(eq(players.teamId, teamId))
    .groupBy(riotAccounts.platform)
    .orderBy(desc(sql`count(*)`))
    .limit(1);
  return row?.platform ?? null;
}
