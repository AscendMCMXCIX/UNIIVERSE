import type { Db } from "@/server/db/types";
import { dueForViewRefresh } from "@/domain/account-status";
import { backgroundRefreshEnabled, claimLease } from "@/server/jobs/background";
import { listAccountsForPlayer } from "./repository";
import { syncAccount } from "./sync";
import { createRiotClient } from "@/server/riot/api/client";
import { invalidateProficiencyCache } from "@/server/proficiency/service";

/**
 * Best-effort first verification of a player's freshly linked accounts, run after the sign-up
 * response has been sent. Riot being slow or down costs nothing: the accounts stay Pending and
 * the account-sync job retries them. Errors are swallowed on purpose (they are recorded on the
 * account rows themselves).
 */
export async function kickoffAccountSync(db: Db, playerId: string, options: { maxMatchesPerRun?: number; deadlineMs?: number } = {}): Promise<void> {
  const client = createRiotClient();
  if (!client) return;
  const startedAt = Date.now();
  const deadline = options.deadlineMs ?? 20_000;
  try {
    const accounts = (await listAccountsForPlayer(db, playerId)).filter((a) => a.syncStatus === "never" || a.syncStatus === "pending");
    for (const account of accounts) {
      if (Date.now() - startedAt > deadline) break;
      await syncAccount(db, client, account, { maxMatchesPerRun: options.maxMatchesPerRun ?? 20, outOfTime: () => Date.now() - startedAt > deadline });
    }
    invalidateProficiencyCache();
  } catch (err) {
    console.warn("[accounts] first sync skipped:", (err as Error).message);
  }
}

/**
 * Refresh while someone looks at a player (their overview, profile or Riot settings), after the
 * page has been sent: unverified accounts, accounts still adding this season's history and
 * accounts not refreshed for 15 minutes get one bounded sync (about 40 seconds, 60 matches).
 * The page asks every ten seconds while this runs and reads itself again when the data changed
 * (components/ui/freshness-watcher.tsx), and each render may start the next slice, so a new account
 * fills in while it is being watched and nobody needs a Retry button. A two-minute lease per player keeps slices from overlapping.
 */
export async function refreshPlayerAccountsIfDue(db: Db, playerId: string, options: { deadlineMs?: number; maxMatchesPerRun?: number; refreshAfterMs?: number } = {}): Promise<number> {
  if (!backgroundRefreshEnabled()) return 0;
  const client = createRiotClient();
  if (!client) return 0;
  try {
    const now = new Date();
    const due = (await listAccountsForPlayer(db, playerId)).filter((a) => dueForViewRefresh({ syncStatus: a.syncStatus, syncError: a.syncError, lastSyncAt: a.lastSyncAt, puuid: a.puuid, history: a.historyBackfill }, now, options.refreshAfterMs));
    if (due.length === 0 || !(await claimLease(db, `account_refresh:${playerId}`, 2 * 60_000, now))) return 0;
    const startedAt = Date.now();
    const deadline = options.deadlineMs ?? 40_000;
    let synced = 0;
    for (const account of due) {
      if (Date.now() - startedAt > deadline) break;
      await syncAccount(db, client, account, { maxMatchesPerRun: options.maxMatchesPerRun ?? 60, outOfTime: () => Date.now() - startedAt > deadline });
      synced += 1;
    }
    if (synced) invalidateProficiencyCache();
    return synced;
  } catch (err) {
    console.warn("[accounts] refresh on view skipped:", (err as Error).message);
    return 0;
  }
}
