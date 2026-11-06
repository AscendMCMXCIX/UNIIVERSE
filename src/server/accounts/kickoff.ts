import { sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import type { HistoryBackfill } from "@/server/db/schema";
import { dueForViewRefresh } from "@/domain/account-status";
import { VIEW_REFRESH_LEASE_MS, backgroundRefreshEnabled, claimLease, releaseLease, viewRefreshLeaseKey } from "@/server/jobs/background";
import { listAccountsForPlayer } from "./repository";
import { syncAccount } from "./sync";
import { SCHEDULED_SYNC_LEASE_MS, accountSyncLeaseKey, claimAccountSync } from "./refresh";
import { createRiotClient } from "@/server/riot/api/client";
import { invalidateProficiencyCache } from "@/server/proficiency/service";

/*
  Both background syncs here claim the per-account lease before syncing an account, as the
  scheduler, a profile's Refresh and Retry sync do (server/accounts/refresh.ts), and leave an
  account another sync claimed recently (SCHEDULED_SYNC_LEASE_MS) to that sync. Before they did, a profile view
  and the tick (or a Refresh) could sync one account at the same time: twice the Riot requests on
  a key allowed 100 per two minutes, and a Refresh answering "No new games" because the other
  sync had just stored them. A lease only defers: the account is synced by whoever holds it, and
  by the next sync once the lease has passed.
*/


/**
 * Best-effort first verification of a player's freshly linked accounts, run after the sign-up
 * response has been sent. Riot being slow or down costs nothing: the accounts stay Pending and
 * the account-sync job retries them. Errors are swallowed on purpose (they are recorded on the
 * account rows themselves).
 */
export async function kickoffAccountSync(db: Db, playerId: string, options: { maxMatchesPerRun?: number; deadlineMs?: number } = {}): Promise<void> {
  const startedAt = Date.now();
  const budgetMs = options.deadlineMs ?? 20_000;
  const outOfTime = () => Date.now() - startedAt > budgetMs;
  // The client carries the same deadline, so no request waits for Riot's rate limits past it.
  const client = createRiotClient({ deadline: startedAt + budgetMs });
  if (!client) return;
  try {
    const accounts = (await listAccountsForPlayer(db, playerId)).filter((a) => a.syncStatus === "never" || a.syncStatus === "pending");
    for (const account of accounts) {
      if (outOfTime()) break;
      // A profile view's refresh (or the scheduler) is already verifying this account.
      const claimedAt = new Date();
      if (!(await claimAccountSync(db, account.id, SCHEDULED_SYNC_LEASE_MS, claimedAt))) continue;
      let r: Awaited<ReturnType<typeof syncAccount>>;
      try {
        r = await syncAccount(db, client, account, { maxMatchesPerRun: options.maxMatchesPerRun ?? 20, outOfTime });
      } finally {
        // Done with the account: give its lease back, so the profile the new member is likely
        // looking at can carry its history on at its next render instead of 100 s later. The
        // release follows the sync's last write by one statement; the render that write causes
        // comes only after the page's next poll (within 10 s) and a server render.
        await releaseLease(db, accountSyncLeaseKey(account.id), claimedAt);
      }
      if (r.outOfTime) break;
    }
    invalidateProficiencyCache();
  } catch (err) {
    console.warn("[accounts] first sync skipped:", (err as Error).message);
  }
}

/** How long one slice of a profile view's refresh may run (its Riot client's deadline). */
export const VIEW_REFRESH_BUDGET_MS = 40_000;

/**
 * How far an account's season history has come, as one comparable figure per part: the queues'
 * offsets, the finished queues and whether the season is complete. A slice made progress when any
 * part grew or it folded a game; a history Riot holds at one game (a 5xx for good, a champion
 * still unknown) does not move, and the slice says so (below).
 */
function historyReach(h: HistoryBackfill | null | undefined): number[] {
  if (!h) return [0, 0, 0];
  const queues = Object.values(h.queues ?? {});
  return [queues.reduce((n, q) => n + (q.offset ?? 0), 0), queues.filter((q) => q.done).length, h.completedAt ? 1 : 0];
}
const reached = (before: number[], after: number[]) => after.some((v, i) => v > (before[i] ?? 0));

/**
 * Refresh while someone looks at a player (their overview, profile or Riot settings), after the
 * page has been sent: unverified accounts, accounts still adding this season's history and
 * accounts not refreshed for 15 minutes get one bounded sync (about 40 seconds, 60 matches).
 * The page asks every ten seconds while this runs and reads itself again when the data changed
 * (components/ui/freshness-watcher.tsx), and each render may start the next slice. A two-minute
 * lease per player keeps slices from overlapping; the per-account lease keeps them from
 * overlapping the scheduler, a Refresh or the first sync. A slice's last write lands while its own
 * lease still stands, so the render it causes starts nothing; the player's version
 * (server/ops/freshness.ts) also changes once the lease is over while an account is still adding
 * this season's history, so the open page renders again and starts the next slice. A new account
 * therefore fills in while its profile stays open, and the scheduler (every run until the season
 * history is complete) does the rest. Only after a slice that moved the history on: each slice
 * records in its lease whether it did (`progress`), and a history that does not move (a game Riot
 * answers 5xx for every time) gets one slice per visit or data change, as before, not one every
 * two minutes for as long as the page stays open.
 */
export async function refreshPlayerAccountsIfDue(db: Db, playerId: string, options: { deadlineMs?: number; maxMatchesPerRun?: number } = {}): Promise<number> {
  if (!backgroundRefreshEnabled()) return 0;
  const startedAt = Date.now();
  const budgetMs = options.deadlineMs ?? VIEW_REFRESH_BUDGET_MS;
  const outOfTime = () => Date.now() - startedAt > budgetMs;
  // The client carries the same deadline, so no request waits for Riot's rate limits past it.
  const client = createRiotClient({ deadline: startedAt + budgetMs });
  if (!client) return 0;
  try {
    const now = new Date();
    const due = (await listAccountsForPlayer(db, playerId)).filter((a) => dueForViewRefresh({ syncStatus: a.syncStatus, syncError: a.syncError, lastSyncAt: a.lastSyncAt, puuid: a.puuid, history: a.historyBackfill }, now));
    const sliceKey = viewRefreshLeaseKey(playerId);
    if (due.length === 0 || !(await claimLease(db, sliceKey, VIEW_REFRESH_LEASE_MS, now))) return 0;
    let synced = 0;
    let started = 0;
    let progress = false;
    const reachBefore = new Map(due.map((a) => [a.id, historyReach(a.historyBackfill)]));
    for (const account of due) {
      if (outOfTime()) break;
      // Another sync (the scheduler, a Refresh, the first sync) is on this account or just was.
      // The claim is dated from the slice's start, whenever in the slice it is made: it still
      // outlasts this slice's own sync of the account (40 s plus a request's timeout) and has
      // always ended by the next slice (two minutes on), so a slice never refuses its own last one.
      if (!(await claimAccountSync(db, account.id, SCHEDULED_SYNC_LEASE_MS, now))) continue;
      started += 1;
      const r = await syncAccount(db, client, account, { maxMatchesPerRun: options.maxMatchesPerRun ?? 60, outOfTime });
      // An account whose sync stopped for time before it read anything was not synced.
      if (!r.outOfTime || r.matchesFolded > 0 || r.masteryRows > 0) synced += 1;
      if (r.matchesFolded > 0) progress = true;
      if (r.outOfTime) break;
    }
    if (started > 0) {
      if (!progress) {
        const after = await listAccountsForPlayer(db, playerId);
        progress = after.some((a) => reachBefore.has(a.id) && reached(reachBefore.get(a.id)!, historyReach(a.historyBackfill)));
      }
      // Kept with the lease (its time unchanged, so claims and give-backs work as before): the
      // player's version (server/ops/freshness.ts) carries on by itself only after a slice that did.
      await db.execute(sql`UPDATE app_settings SET value = jsonb_build_object('at', ${now.toISOString()}::text, 'progress', ${progress}::boolean) WHERE key = ${sliceKey} AND updated_at = ${now.toISOString()}::timestamptz`);
    }
    // Every due account was held by another sync (the first sync right after sign-up, say): this
    // slice did nothing, so the next render may start one at once instead of two minutes later.
    if (started === 0) await releaseLease(db, sliceKey, now);
    if (synced) invalidateProficiencyCache();
    return synced;
  } catch (err) {
    console.warn("[accounts] refresh on view skipped:", (err as Error).message);
    return 0;
  }
}
