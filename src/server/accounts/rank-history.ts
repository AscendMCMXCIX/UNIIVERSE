import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { rankSnapshots, riotAccounts } from "@/server/db/schema";
import { snapshotChanged, type RankQueue, type RankSnapshot } from "@/domain/rank-progress";

/*
  Rank history per account and queue (see domain/rank-progress). Written by account sync from the
  league entries it already reads; read by the profile's Ranked progress.
*/

const QUEUE_OF: Record<string, RankQueue> = { RANKED_SOLO_5x5: "solo", RANKED_FLEX_SR: "flex" };

export interface LeagueEntryLike {
  queueType: string;
  tier?: string | null;
  rank?: string | null;
  leaguePoints: number;
  wins: number;
  losses: number;
}

/**
 * Stores a snapshot per ranked queue when the reading differs from the last stored one (the first
 * reading is always stored). A queue that has a stored rank but is missing from Riot's answer is
 * recorded once as unranked (a season reset or decay off the ladder). Returns the rows written.
 */
export async function recordRankSnapshots(db: Db, accountId: string, entries: readonly LeagueEntryLike[], now = new Date()): Promise<number> {
  let written = 0;
  for (const queue of ["solo", "flex"] as const) {
    const entry = entries.find((e) => QUEUE_OF[e.queueType] === queue);
    const [last] = await db.select().from(rankSnapshots).where(and(eq(rankSnapshots.accountId, accountId), eq(rankSnapshots.queue, queue))).orderBy(desc(rankSnapshots.capturedAt)).limit(1);
    const next = entry
      ? { tier: entry.tier ?? null, division: entry.rank ?? null, leaguePoints: entry.leaguePoints, wins: entry.wins, losses: entry.losses }
      : last && last.tier
        ? { tier: null, division: null, leaguePoints: null, wins: null, losses: null }
        : null;
    if (!next) continue; // never ranked in this queue: nothing to record
    if (!snapshotChanged(last ?? null, next)) continue;
    await db.insert(rankSnapshots).values({ accountId, queue, ...next, capturedAt: now });
    written += 1;
  }
  return written;
}

/**
 * The rank stored on the account (what the profile header, cards and leaderboards show) from one
 * league answer: Solo/Duo first, Flex as fallback. When Riot reports neither queue the stored rank
 * is cleared, as recordRankSnapshots records the reset, so the header never keeps a rank the
 * history already shows as gone. The earlier readings stay in rank_snapshots.
 */
export function storedRankFrom(entries: readonly LeagueEntryLike[], now = new Date()) {
  const entry = entries.find((e) => QUEUE_OF[e.queueType] === "solo") ?? entries.find((e) => QUEUE_OF[e.queueType] === "flex");
  if (!entry) return { tier: null, division: null, leaguePoints: null, rankedWins: null, rankedLosses: null, rankQueue: null, rankUpdatedAt: now };
  return { tier: entry.tier ?? null, division: entry.rank ?? null, leaguePoints: entry.leaguePoints, rankedWins: entry.wins, rankedLosses: entry.losses, rankQueue: QUEUE_OF[entry.queueType]!, rankUpdatedAt: now };
}

export interface RankHistoryAccount {
  id: string;
  label: string;
  riotId: string;
  snapshots: RankSnapshot[];
}

/** A player's linked accounts (Main first) with their rank snapshots, oldest first, and when they were read. */
export async function loadRankHistory(db: Db, playerId: string): Promise<{ accounts: RankHistoryAccount[]; readAt: number }> {
  return { accounts: await rankHistoryAccounts(db, playerId), readAt: Date.now() };
}

async function rankHistoryAccounts(db: Db, playerId: string): Promise<RankHistoryAccount[]> {
  const accounts = await db
    .select({ id: riotAccounts.id, label: riotAccounts.label, gameName: riotAccounts.gameName, tagLine: riotAccounts.tagLine })
    .from(riotAccounts)
    .where(and(eq(riotAccounts.playerId, playerId), eq(riotAccounts.ownerType, "player")));
  if (accounts.length === 0) return [];
  const rows = await db
    .select()
    .from(rankSnapshots)
    .where(inArray(rankSnapshots.accountId, accounts.map((a) => a.id)))
    .orderBy(asc(rankSnapshots.capturedAt));
  return accounts
    .sort((a, b) => (a.label === "main" ? -1 : b.label === "main" ? 1 : a.gameName.localeCompare(b.gameName)))
    .map((a) => ({
      id: a.id,
      label: a.label,
      riotId: `${a.gameName}#${a.tagLine}`,
      snapshots: rows
        .filter((r) => r.accountId === a.id)
        .map((r) => ({ queue: r.queue as RankQueue, tier: r.tier, division: r.division, leaguePoints: r.leaguePoints, wins: r.wins, losses: r.losses, capturedAt: r.capturedAt.getTime() })),
    }));
}
