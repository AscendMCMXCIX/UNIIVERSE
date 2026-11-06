import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { accountMatches, appSettings, riotAccounts } from "@/server/db/schema";
import { normaliseRiotKey, type RiotApiClient } from "@/server/riot/api/client";
import { browserTestRiot } from "@/server/riot/browser-test";
import { accountSyncLeaseKey, claimLease, figuresCatchUpLeaseKey } from "@/server/jobs/background";
import { listAccountsForPlayer } from "./repository";
import { currentSeason, syncAccount } from "./sync";
import { backfillFigures, pendingFiguresForPlayer } from "./figures-backfill";
import { CATCH_UP_LIMIT, REFRESH_COOLDOWN_SECONDS } from "@/domain/refresh";

export { CATCH_UP_LIMIT };

/*
  "Refresh matches" on a player's Match History. New games normally arrive through the scheduled
  account sync, which reaches an active account at most every 45 minutes and only when a
  scheduler tick runs (visits start one every 30 minutes; the hourly GitHub run is best effort),
  so a game played just now can take an hour or more to show. A refresh runs the same sync for
  the player's accounts right away, limited to what a refresh needs (the newest page of each
  queue and the games on it that are not stored yet).

  Riot's quota is shared by the whole site, so every account sync, whether the scheduler's, a
  refresh, Retry sync, a profile view's background refresh or the first sync after sign-up
  (server/accounts/kickoff.ts), first claims a per-account lease (one atomic upsert in
  app_settings): two of them never sync the same account at once, and an account checked within
  the cooldown is not asked again by a refresh. The first sync after sign-up gives its claim back
  as soon as it is done, so a Refresh, Retry sync, the scheduler or a view's slice may follow it at
  once (their cooldown runs from their own claim). Riot itself may take a few minutes after a game
  ends before the game is listed, so a refresh can honestly find nothing new.
*/

/** One refresh per account per this long (covers the run itself, so it doubles as the in-flight guard). */
export const REFRESH_COOLDOWN_MS = REFRESH_COOLDOWN_SECONDS * 1000;
/**
 * Background syncs (the scheduler, a profile view's refresh, the first sync after sign-up) skip an
 * account another sync claimed this recently. It outlasts the longest a sync started by the
 * scheduler can hold an account: no Riot request starts after the run's deadline (the tick's
 * account-sync cap, ACCOUNT_SYNC_TICK_MS), and the last one sent ends within one request's timeout.
 * So it outlasts every shorter one too (a Refresh, a view's slice, the first sync): two never sync
 * one account at once, which would double the Riot requests and let the last writer roll back the
 * other's season-history position. It stays under a view's two-minute slice lease
 * (VIEW_REFRESH_LEASE_MS, jobs/background.ts), and a slice dates its claims from its own start, so
 * a watched account's next slice is never refused by its own last one.
 * Not covered, as they can hold an account for longer than this, so a background sync may join
 * them: a direct run of the account-sync job (Data jobs → account-sync, `pnpm job account-sync`),
 * whose budget is UNIIVERSE_JOB_BUDGET_MS, 240 s by default. The syncs of the Riot accounts panel
 * (Retry sync, linking, a replaced Riot ID: actions/accounts.ts) are covered: their Riot client
 * carries ACCOUNT_ACTION_BUDGET_MS, so each ends within one request's timeout of that.
 */
export const SCHEDULED_SYNC_LEASE_MS = 100_000;
/**
 * A refresh stops starting new work after this long, so the button answers within a minute. Its
 * Riot client carries the same deadline (actions/match-history.ts), so no request waits past it.
 */
export const REFRESH_BUDGET_MS = 40_000;
/**
 * The syncs a person waits on in the Riot accounts panel (Retry sync, linking an account, a
 * replaced Riot ID's lookup and first sync): the same budget as a Refresh, carried by their Riot
 * client, so each ends within one request's timeout of it, well inside SCHEDULED_SYNC_LEASE_MS:
 * the scheduler or a view's slice never starts the same account meanwhile.
 */
export const ACCOUNT_ACTION_BUDGET_MS = REFRESH_BUDGET_MS;
/** New games fetched per account per refresh (each one is one Riot request). */
const REFRESH_MATCHES_PER_ACCOUNT = 15;

export { accountSyncLeaseKey, figuresCatchUpLeaseKey };

/** A demo account's games are seeded, never read from Riot: neither the scheduler nor a refresh asks for it. */
export const isSyncableAccount = (a: { label: string; syncStatus: string }) => a.label !== "demo" && a.syncStatus !== "demo";

/** Claims the account's sync lease; false when another sync claimed it within `minIntervalMs`. */
export function claimAccountSync(db: Db, accountId: string, minIntervalMs: number, now: Date = new Date()): Promise<boolean> {
  return claimLease(db, accountSyncLeaseKey(accountId), minIntervalMs, now);
}

/** Seconds until these accounts may be read again on request (their latest claim plus the cooldown), between 5 s and the cooldown. */
export async function accountSyncRetryIn(db: Db, accountIds: string[], now: Date = new Date()): Promise<number> {
  const leases = accountIds.length ? await db.select({ at: appSettings.updatedAt }).from(appSettings).where(inArray(appSettings.key, accountIds.map(accountSyncLeaseKey))) : [];
  const lastClaim = Math.max(0, ...leases.map((l) => l.at.getTime()));
  return Math.max(5, Math.min(REFRESH_COOLDOWN_SECONDS, Math.ceil((lastClaim + REFRESH_COOLDOWN_MS - now.getTime()) / 1000)));
}

/** Whether a profile's Refresh can reach Riot on this server: a Riot key, or the browser tests' stand-in. */
export function refreshAvailable(): boolean {
  return !!normaliseRiotKey(process.env.RIOT_API_KEY) || browserTestRiot();
}

export interface MatchSyncStatus {
  /** Linked accounts that can be synced (resolved or still to be resolved). */
  accounts: number;
  /** Of them, the ones Riot can be asked about (demo accounts are not). */
  syncable: number;
  /** When every linked account was last read successfully (the oldest of them), ISO; null if one never was. */
  checkedAt: string | null;
  /** The latest attempt to read any of them, successful or not, ISO. */
  attemptedAt: string | null;
  /** The newest stored game of any linked account, ISO. */
  newestGameAt: string | null;
  /** The plain-language problem of an account whose last sync failed, if any. */
  problem: string | null;
}

/** What the Match History header says about freshness. Two small queries. */
export async function getMatchSyncStatus(db: Db, playerId: string): Promise<MatchSyncStatus> {
  const accounts = await db
    .select({ id: riotAccounts.id, cursor: riotAccounts.syncCursor, status: riotAccounts.syncStatus, error: riotAccounts.syncError, label: riotAccounts.label, attempted: riotAccounts.lastSyncAt })
    .from(riotAccounts)
    .where(and(eq(riotAccounts.ownerType, "player"), eq(riotAccounts.playerId, playerId)));
  if (accounts.length === 0) return { accounts: 0, syncable: 0, checkedAt: null, attemptedAt: null, newestGameAt: null, problem: null };
  const [newest] = await db
    .select({ at: accountMatches.gameCreation })
    .from(accountMatches)
    .where(and(inArray(accountMatches.accountId, accounts.map((a) => a.id)), isNotNull(accountMatches.championId)))
    .orderBy(desc(accountMatches.gameCreation))
    .limit(1);
  // The times are Riot's: a demo account's (seeded, never read) say nothing about them.
  const read = accounts.filter((a) => isSyncableAccount({ label: a.label, syncStatus: a.status }));
  const cursors = read.map((a) => a.cursor);
  const checked = cursors.length > 0 && cursors.every((c): c is number => typeof c === "number" && c > 0) ? Math.min(...cursors) * 1000 : null;
  const failing = accounts.find((a) => a.status !== "ok" && a.status !== "never" && a.error);
  const attempted = Math.max(0, ...read.map((a) => a.attempted?.getTime() ?? 0));
  return {
    accounts: accounts.length,
    syncable: read.length,
    checkedAt: checked ? new Date(checked).toISOString() : null,
    attemptedAt: attempted ? new Date(attempted).toISOString() : null,
    newestGameAt: newest?.at ? new Date(Number(newest.at)).toISOString() : null,
    problem: failing?.error ?? null,
  };
}

/** Accounts a refresh could not read while others were read: said beside the result, never hidden by it. */
export interface RefreshProblem {
  accounts: number;
  message: string;
}

export type RefreshOutcome =
  | { status: "updated"; newGames: number; checkedAt: string; problem?: RefreshProblem }
  | { status: "no-new"; checkedAt: string; problem?: RefreshProblem }
  | { status: "recent"; checkedAt: string | null; retryInSeconds: number }
  | { status: "failed"; message: string }
  | { status: "unavailable"; message: string };

/**
 * Checks the player's linked accounts for new games now. Accounts another sync claimed within
 * the cooldown are skipped; when that is all of them the answer is "recent" (with when they were
 * last read), never a claim that something was updated.
 */
export async function refreshPlayerMatches(db: Db, client: RiotApiClient, playerId: string, options: { now?: () => Date; log?: (m: string) => void } = {}): Promise<RefreshOutcome> {
  const now = options.now ?? (() => new Date());
  const linked = await listAccountsForPlayer(db, playerId);
  if (linked.length === 0) return { status: "unavailable", message: "No Riot account is linked to this profile yet." };
  const accounts = linked.filter(isSyncableAccount);
  if (accounts.length === 0) return { status: "unavailable", message: "Demo accounts are not read from Riot; their games are sample data." };
  const started = now().getTime();
  const season = await currentSeason(db, now());
  const outOfTime = () => now().getTime() - started > REFRESH_BUDGET_MS;
  let folded = 0;
  let succeeded = 0;
  let claimed = 0;
  let failed = 0;
  let firstError: string | null = null;
  for (const account of accounts) {
    if (outOfTime()) break;
    // Each account's lease is claimed right before its sync, never for the ones the budget does
    // not reach: those stay free for the scheduler, and a second press reads them.
    if (!(await claimAccountSync(db, account.id, REFRESH_COOLDOWN_MS, now()))) continue;
    claimed += 1;
    const r = await syncAccount(db, client, account, {
      season,
      now,
      outOfTime,
      log: options.log,
      maxMatchesPerRun: REFRESH_MATCHES_PER_ACCOUNT,
      // A refresh is about new games: older-season collection and backfills stay with the scheduler.
      previousSeason: false,
      performanceBackfill: false,
      detailsBackfill: false,
      refreshRiotId: false,
      // Every queue is asked, the ones without a game yet included (a few list requests, once per cooldown).
      recheckEmptyQueues: true,
    });
    folded += r.matchesFolded;
    if (r.error) {
      failed += 1;
      firstError ??= r.error;
    }
    // Out of time (the client's deadline) before it found anything: the account was not fully
    // checked, so it cannot stand for "no new games". The other accounts would wait the same way.
    else if (!r.outOfTime || r.matchesFolded > 0) succeeded += 1;
    if (r.outOfTime) break;
  }
  if (claimed === 0) {
    const ids = accounts.map((a) => a.id);
    const [reads, retryInSeconds] = await Promise.all([db.select({ cursor: riotAccounts.syncCursor }).from(riotAccounts).where(inArray(riotAccounts.id, ids)), accountSyncRetryIn(db, ids, now())]);
    const lastRead = Math.max(0, ...reads.map((r) => r.cursor ?? 0));
    return { status: "recent", checkedAt: lastRead ? new Date(lastRead * 1000).toISOString() : null, retryInSeconds };
  }
  if (succeeded === 0) return { status: "failed", message: firstError ?? "Riot did not answer in time. Please try again in a few minutes." };
  const checkedAt = now().toISOString();
  // Some accounts read, some not: the result stands for the ones read, and says which could not be.
  const problem = failed > 0 && firstError ? { problem: { accounts: failed, message: firstError } } : {};
  return folded > 0 ? { status: "updated", newGames: folded, checkedAt, ...problem } : { status: "no-new", checkedAt, ...problem };
}

/*
  The second half of a profile's Refresh: the multikill counts (and the other extra figures) of the
  player's own older games, which the figures backfill otherwise fetches a batch an hour for the
  whole team. A Refresh asks Riot again for up to CATCH_UP_LIMIT of this player's records, newest first,
  through the same rate limiter and with the same rules (a record Riot no longer has is marked and
  never asked for again). One catch-up per player per cooldown, whoever asks, so repeated clicks
  cannot use up the team's Riot quota.
*/

/**
 * A catch-up stops starting new requests after this long, so the button answers in under half a
 * minute. Its Riot client carries the same deadline (actions/match-history.ts).
 */
export const CATCH_UP_BUDGET_MS = 25_000;

export type CatchUpOutcome =
  | { status: "fetched"; fetched: number; unavailable: number; remaining: number }
  | { status: "complete"; fetched: number }
  | { status: "recent"; remaining: number; retryInSeconds: number }
  | { status: "failed"; message: string; fetched: number; remaining: number };

/** Fetches the figures of up to CATCH_UP_LIMIT of the player's games that lack them. */
export async function catchUpPlayerFigures(db: Db, client: RiotApiClient, playerId: string, options: { now?: () => Date; log?: (m: string) => void } = {}): Promise<CatchUpOutcome> {
  const now = options.now ?? (() => new Date());
  const pending = await pendingFiguresForPlayer(db, playerId);
  if (pending === 0) return { status: "complete", fetched: 0 };
  if (!(await claimLease(db, figuresCatchUpLeaseKey(playerId), REFRESH_COOLDOWN_MS, now()))) {
    const [lease] = await db.select({ at: appSettings.updatedAt }).from(appSettings).where(eq(appSettings.key, figuresCatchUpLeaseKey(playerId)));
    const retry = lease ? Math.ceil((lease.at.getTime() + REFRESH_COOLDOWN_MS - now().getTime()) / 1000) : REFRESH_COOLDOWN_MS / 1000;
    return { status: "recent", remaining: pending, retryInSeconds: Math.max(5, Math.min(REFRESH_COOLDOWN_MS / 1000, retry)) };
  }
  // The budget is real elapsed time (the backfill checks Date.now()), whatever clock leases use.
  const run = await backfillFigures(db, client, { limit: CATCH_UP_LIMIT, deadline: Date.now() + CATCH_UP_BUDGET_MS, playerId, log: options.log });
  const remaining = await pendingFiguresForPlayer(db, playerId);
  if (run.fetched + run.unavailable === 0 && run.stoppedBy && run.stoppedBy !== "time budget") return { status: "failed", message: "Riot did not answer; please try again in a few minutes.", fetched: 0, remaining };
  return remaining === 0 ? { status: "complete", fetched: run.fetched } : { status: "fetched", fetched: run.fetched, unavailable: run.unavailable, remaining };
}
