import { orderAccounts } from "@/domain/account-order";
import { and, asc, desc, eq, gt, inArray, lte, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { rankSnapshots, riotAccounts } from "@/server/db/schema";
import { snapshotChanged, type RankQueue, type RankSnapshot } from "@/domain/rank-progress";
import { rankMovement, rankTimeline } from "@/domain/rank-timeline";

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
 * Records one reading of an account's league entries, per ranked queue: a row when the reading
 * differs from the last one stored (the first reading is always stored), otherwise the last row's
 * confirmed_at moves on to this reading. A queue that has a stored rank but is missing from Riot's
 * answer is recorded once as unranked (a season reset or decay off the ladder). The reading is one
 * transaction holding a lock on that account's Solo/Duo and then its Flex queue (always in that
 * order, so two overlapping runs, account sync and the rank watch, never wait on each other in a
 * cycle), so they never store the same values twice, and a queue's reading older than the newest
 * one recorded (a slow answer overtaken) changes nothing in that queue. Returns the rows written.
 *
 * Release 19 (HOSTING_USAGE.md, "Rank watch writes"): both queues in one transaction, their last
 * rows read in one statement and their confirmations moved in one, where each queue had its own
 * transaction: 6 statements for an unchanged account instead of 10, the same rows written.
 */
export async function recordRankSnapshots(db: Db, accountId: string, entries: readonly LeagueEntryLike[], now = new Date()): Promise<number> {
  return db.transaction(async (tx) => {
    for (const queue of ["solo", "flex"] as const) await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`rank_snapshots:${accountId}:${queue}`}))`);
    const latest = rowsOf<{ id: string; queue: string; tier: string | null; division: string | null; league_points: number | null; wins: number | null; losses: number | null; captured_at: unknown; confirmed_at: unknown }>(
      await tx.execute(sql`
        SELECT DISTINCT ON (queue) id, queue, tier, division, league_points, wins, losses, captured_at, confirmed_at
        FROM rank_snapshots WHERE account_id = ${accountId}
        ORDER BY queue, captured_at DESC`),
    );
    const confirm: string[] = [];
    const insert: Array<typeof rankSnapshots.$inferInsert> = [];
    for (const queue of ["solo", "flex"] as const) {
      const entry = entries.find((e) => QUEUE_OF[e.queueType] === queue);
      const row = latest.find((r) => r.queue === queue);
      const last = row ? { tier: row.tier, division: row.division, leaguePoints: row.league_points === null ? null : Number(row.league_points), wins: row.wins === null ? null : Number(row.wins), losses: row.losses === null ? null : Number(row.losses), capturedAt: at(row.captured_at) ?? 0, confirmedAt: at(row.confirmed_at) } : null;
      const next = entry
        ? { tier: entry.tier ?? null, division: entry.rank ?? null, leaguePoints: entry.leaguePoints, wins: entry.wins, losses: entry.losses }
        : last && last.tier
          ? { tier: null, division: null, leaguePoints: null, wins: null, losses: null }
          : null;
      if (!next) continue; // never ranked in this queue, or still unranked: nothing to record
      if (last && now.getTime() <= Math.max(last.capturedAt, last.confirmedAt ?? 0)) continue;
      if (row && !snapshotChanged(last, next)) confirm.push(row.id);
      else insert.push({ accountId, queue, ...next, capturedAt: now });
    }
    if (confirm.length) await tx.update(rankSnapshots).set({ confirmedAt: now }).where(inArray(rankSnapshots.id, confirm));
    if (insert.length) await tx.insert(rankSnapshots).values(insert);
    return insert.length;
  });
}

/** postgres-js returns the rows; PGlite wraps them in { rows }. */
const rowsOf = <T,>(result: unknown): T[] => ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];
/** A timestamp as either driver returns it from raw SQL (a Date, or text), in ms; null for none. */
const at = (v: unknown): number | null => (v === null || v === undefined ? null : v instanceof Date ? v.getTime() : new Date(String(v)).getTime());

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
    .select({ id: riotAccounts.id, label: riotAccounts.label, sortOrder: riotAccounts.sortOrder, createdAt: riotAccounts.createdAt, gameName: riotAccounts.gameName, tagLine: riotAccounts.tagLine })
    .from(riotAccounts)
    .where(and(eq(riotAccounts.playerId, playerId), eq(riotAccounts.ownerType, "player")));
  if (accounts.length === 0) return [];
  // The readings alone: the 2026 ranked year's weekly games were counted here too until 20 Nov 2026,
  // for a strip that left the page on 18 Nov (one query fewer per Overview: docs/RANKED_PROGRESS.md).
  const rows = await db
    .select()
    .from(rankSnapshots)
    .where(inArray(rankSnapshots.accountId, accounts.map((a) => a.id)))
    .orderBy(asc(rankSnapshots.capturedAt));
  // The player's one account order: the Main, then the alternatives as arranged.
  return orderAccounts(accounts)
    .map((a) => ({
      id: a.id,
      label: a.label,
      riotId: `${a.gameName}#${a.tagLine}`,
      snapshots: rows
        .filter((r) => r.accountId === a.id)
        .map((r) => ({ queue: r.queue as RankQueue, tier: r.tier, division: r.division, leaguePoints: r.leaguePoints, wins: r.wins, losses: r.losses, capturedAt: r.capturedAt.getTime(), confirmedAt: r.confirmedAt?.getTime() ?? null })),
    }));
}

/** A ladder change over the last `days` (Match History's summary, Team's detail panel). */
export interface RankChange {
  queue: RankQueue;
  days: number;
  /** Ladder points: LP, with 100 for each division gained or lost (the two readings' difference). */
  points: number;
  from: string;
  to: string;
  /** When the start was first seen, when that lies inside the window ("since <date>"); null when it was in effect at the window's start. */
  since: number | null;
}

/**
 * The ladder change over the last `windowDays` in one queue, by Ranked progress's rule
 * (domain/rank-timeline's rankMovement, with confirmations): from the reading in effect when the
 * window began, or, when that is not known (recording began inside the window, or several unseen
 * games straddle its start), from the first reading inside it, with `since` set so the figure
 * never claims days or games that were not read. Null when nothing changed or there is nothing to
 * compare.
 */
function windowChange(queue: RankQueue, snapshots: readonly RankSnapshot[], now: number, windowDays = 30): RankChange | null {
  // Every year's readings: the ranked year's bound would drop the readings of the next one and leave
  // a stale change from the last; a reset (unranked, or a lower game count) ends the ladder anyway.
  const m = rankMovement(rankTimeline(snapshots.filter((s) => s.queue === queue), now, { anyYear: true }), now, windowDays);
  if (!m || m.from === m.to) return null;
  return { queue, days: windowDays, points: m.to.score! - m.from.score!, from: `${m.from.label} ${m.from.lp ?? 0} LP`, to: `${m.to.label} ${m.to.lp ?? 0} LP`, since: m.windowed ? null : m.from.from };
}

/**
 * The 30-day ladder change for several players at once (Team's detail panel): each player's Main
 * account (else the first with readings), in the queue given (else Solo/Duo). Two queries for the
 * whole lineup; null where there are not two readings in the current season to compare.
 */
export async function rankChangesFor(db: Db, players: ReadonlyArray<{ id: string; queue: RankQueue | null }>, now = Date.now()): Promise<Map<string, RankChange | null>> {
  const out = new Map<string, RankChange | null>(players.map((p) => [p.id, null]));
  if (players.length === 0) return out;
  const accounts = await db
    .select({ id: riotAccounts.id, playerId: riotAccounts.playerId, label: riotAccounts.label, sortOrder: riotAccounts.sortOrder, createdAt: riotAccounts.createdAt })
    .from(riotAccounts)
    .where(and(inArray(riotAccounts.playerId, players.map((p) => p.id)), eq(riotAccounts.ownerType, "player")));
  if (accounts.length === 0) return out;
  const rows = await db.select().from(rankSnapshots).where(inArray(rankSnapshots.accountId, accounts.map((a) => a.id)));
  for (const p of players) {
    const queue = p.queue ?? "solo";
    const mine = orderAccounts(accounts.filter((a) => a.playerId === p.id));
    const account = mine.find((a) => a.label === "main") ?? mine.find((a) => rows.some((r) => r.accountId === a.id));
    if (!account) continue;
    const snapshots = rows.filter((r) => r.accountId === account.id).map((r) => ({ queue: r.queue as RankQueue, tier: r.tier, division: r.division, leaguePoints: r.leaguePoints, wins: r.wins, losses: r.losses, capturedAt: r.capturedAt.getTime(), confirmedAt: r.confirmedAt?.getTime() ?? null }));
    out.set(p.id, windowChange(queue, snapshots, now));
  }
  return out;
}

/**
 * One account's ladder change over the last `windowDays` in one queue (the Match History summary).
 * Only the readings that decide it are read: those inside the window and the last one before it.
 * The answer is the same as over every reading: ladders are split by consecutive readings, and
 * nothing before the last reading ahead of the window can be the window's start.
 */
export async function ladderChange(db: Db, accountId: string, queue: RankQueue, now = Date.now(), windowDays = 30): Promise<RankChange | null> {
  const since = new Date(now - windowDays * 86_400_000);
  const columns = { tier: rankSnapshots.tier, division: rankSnapshots.division, leaguePoints: rankSnapshots.leaguePoints, wins: rankSnapshots.wins, losses: rankSnapshots.losses, capturedAt: rankSnapshots.capturedAt, confirmedAt: rankSnapshots.confirmedAt };
  const mine = and(eq(rankSnapshots.accountId, accountId), eq(rankSnapshots.queue, queue));
  const [inside, before] = await Promise.all([
    db.select(columns).from(rankSnapshots).where(and(mine, gt(rankSnapshots.capturedAt, since))),
    db.select(columns).from(rankSnapshots).where(and(mine, lte(rankSnapshots.capturedAt, since))).orderBy(desc(rankSnapshots.capturedAt)).limit(1),
  ]);
  const snapshots = [...before, ...inside].map((r) => ({ queue, tier: r.tier, division: r.division, leaguePoints: r.leaguePoints, wins: r.wins, losses: r.losses, capturedAt: r.capturedAt.getTime(), confirmedAt: r.confirmedAt?.getTime() ?? null }));
  return windowChange(queue, snapshots, now, windowDays);
}
