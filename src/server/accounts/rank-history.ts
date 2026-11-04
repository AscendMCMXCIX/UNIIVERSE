import { orderAccounts } from "@/domain/account-order";
import { and, asc, desc, eq, gt, inArray, lte, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { rankSnapshots, riotAccounts } from "@/server/db/schema";
import { rankProgress, snapshotChanged, type RankQueue, type RankSnapshot } from "@/domain/rank-progress";
import { RANKED_YEAR_START } from "@/domain/ranked-year";
import { REMAKE_MAX_S } from "@/domain/lp-attribution";

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
 * answer is recorded once as unranked (a season reset or decay off the ladder). Each queue's
 * reading is one transaction holding a lock on that account and queue, so two overlapping runs
 * (account sync and the rank watch) never store the same values twice, and a reading older than
 * the newest one recorded (a slow answer overtaken) changes nothing. Returns the rows written.
 */
export async function recordRankSnapshots(db: Db, accountId: string, entries: readonly LeagueEntryLike[], now = new Date()): Promise<number> {
  let written = 0;
  for (const queue of ["solo", "flex"] as const) {
    const entry = entries.find((e) => QUEUE_OF[e.queueType] === queue);
    written += await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`rank_snapshots:${accountId}:${queue}`}))`);
      const [last] = await tx.select().from(rankSnapshots).where(and(eq(rankSnapshots.accountId, accountId), eq(rankSnapshots.queue, queue))).orderBy(desc(rankSnapshots.capturedAt)).limit(1);
      const next = entry
        ? { tier: entry.tier ?? null, division: entry.rank ?? null, leaguePoints: entry.leaguePoints, wins: entry.wins, losses: entry.losses }
        : last && last.tier
          ? { tier: null, division: null, leaguePoints: null, wins: null, losses: null }
          : null;
      if (!next) return 0; // never ranked in this queue, or still unranked: nothing to record
      if (last && now.getTime() <= Math.max(last.capturedAt.getTime(), last.confirmedAt?.getTime() ?? 0)) return 0;
      if (last && !snapshotChanged(last, next)) {
        await tx.update(rankSnapshots).set({ confirmedAt: now }).where(eq(rankSnapshots.id, last.id));
        return 0;
      }
      await tx.insert(rankSnapshots).values({ accountId, queue, ...next, capturedAt: now });
      return 1;
    });
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
  /** The 2026 ranked year's stored games by week (Monday 00:00 UTC, ms) and queue: games Riot counts (remakes left out). */
  weeks: Record<RankQueue, Array<{ week: number; wins: number; losses: number }>>;
}

/** Monday 5 January 2026, 00:00 UTC: the first week of the 2026 ranked year (it opened on Thursday 8 January). */
const WEEKS_FROM = Date.UTC(2026, 0, 5);
const WEEK_MS = 7 * 86_400_000;

/** The stored ranked games of the 2026 ranked year per account, queue and week, counted in the database (one row a week). */
async function rankedWeeks(db: Db, accountIds: string[]): Promise<Map<string, RankHistoryAccount["weeks"]>> {
  const out = new Map<string, RankHistoryAccount["weeks"]>(accountIds.map((id) => [id, { solo: [], flex: [] }]));
  if (accountIds.length === 0) return out;
  const result = await db.execute(sql`
    SELECT account_id, queue_id, floor((game_creation - ${WEEKS_FROM}) / ${WEEK_MS})::int AS w,
      count(*) FILTER (WHERE win)::int AS wins, count(*) FILTER (WHERE NOT win)::int AS losses
    FROM account_matches
    WHERE account_id IN (${sql.join(accountIds.map((id) => sql`${id}::uuid`), sql`, `)})
      AND queue_id IN (420, 440) AND game_creation >= ${RANKED_YEAR_START} AND game_creation < ${Date.UTC(2027, 0, 1)} AND game_duration >= ${REMAKE_MAX_S}
    GROUP BY 1, 2, 3`);
  const rows = ((result as unknown as { rows?: unknown[] }).rows ?? (result as unknown as unknown[])) as Array<{ account_id: string; queue_id: number; w: number; wins: number; losses: number }>;
  for (const r of rows) {
    const queue: RankQueue = Number(r.queue_id) === 440 ? "flex" : "solo";
    out.get(r.account_id)?.[queue].push({ week: WEEKS_FROM + Number(r.w) * WEEK_MS, wins: Number(r.wins), losses: Number(r.losses) });
  }
  for (const weeks of out.values()) for (const q of ["solo", "flex"] as const) weeks[q].sort((a, b) => a.week - b.week);
  return out;
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
  const [rows, weeks] = await Promise.all([
    db
      .select()
      .from(rankSnapshots)
      .where(inArray(rankSnapshots.accountId, accounts.map((a) => a.id)))
      .orderBy(asc(rankSnapshots.capturedAt)),
    rankedWeeks(
      db,
      accounts.map((a) => a.id),
    ),
  ]);
  // The player's one account order: the Main, then the alternatives as arranged.
  return orderAccounts(accounts)
    .map((a) => ({
      id: a.id,
      label: a.label,
      riotId: `${a.gameName}#${a.tagLine}`,
      snapshots: rows
        .filter((r) => r.accountId === a.id)
        .map((r) => ({ queue: r.queue as RankQueue, tier: r.tier, division: r.division, leaguePoints: r.leaguePoints, wins: r.wins, losses: r.losses, capturedAt: r.capturedAt.getTime(), confirmedAt: r.confirmedAt?.getTime() ?? null })),
      weeks: weeks.get(a.id) ?? { solo: [], flex: [] },
    }));
}

export type RankChange = NonNullable<ReturnType<typeof rankProgress>["change"]> & { queue: RankQueue };

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
    const snapshots = rows.filter((r) => r.accountId === account.id).map((r) => ({ queue: r.queue as RankQueue, tier: r.tier, division: r.division, leaguePoints: r.leaguePoints, wins: r.wins, losses: r.losses, capturedAt: r.capturedAt.getTime() }));
    const change = rankProgress(queue, snapshots, now).change;
    out.set(p.id, change ? { ...change, queue } : null);
  }
  return out;
}

/**
 * One account's ladder change over the last `windowDays` in one queue (the Match History summary).
 * Only the readings that decide it are read: those inside the window and the last one before it.
 * The answer is rankProgress's over every reading: season segments are decided by consecutive
 * readings, and nothing before the last reading ahead of the window can be the window's start.
 */
export async function ladderChange(db: Db, accountId: string, queue: RankQueue, now = Date.now(), windowDays = 30): Promise<RankChange | null> {
  const since = new Date(now - windowDays * 86_400_000);
  const columns = { tier: rankSnapshots.tier, division: rankSnapshots.division, leaguePoints: rankSnapshots.leaguePoints, wins: rankSnapshots.wins, losses: rankSnapshots.losses, capturedAt: rankSnapshots.capturedAt };
  const mine = and(eq(rankSnapshots.accountId, accountId), eq(rankSnapshots.queue, queue));
  const [inside, before] = await Promise.all([
    db.select(columns).from(rankSnapshots).where(and(mine, gt(rankSnapshots.capturedAt, since))),
    db.select(columns).from(rankSnapshots).where(and(mine, lte(rankSnapshots.capturedAt, since))).orderBy(desc(rankSnapshots.capturedAt)).limit(1),
  ]);
  const snapshots = [...before, ...inside].map((r) => ({ queue, tier: r.tier, division: r.division, leaguePoints: r.leaguePoints, wins: r.wins, losses: r.losses, capturedAt: r.capturedAt.getTime() }));
  const change = rankProgress(queue, snapshots, now, windowDays).change;
  return change ? { ...change, queue } : null;
}
