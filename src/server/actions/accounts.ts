"use server";

import { publicErrorMessage } from "@/server/errors";
import { releaseLease } from "@/server/jobs/background";
import { revalidatePath } from "next/cache";
import { getAppDb } from "@/server/bootstrap";
import { requirePermission, requireRiotAccountEditor } from "@/server/auth/session";
import { AccountError, accountForBrowser, addAccount, listAccountsForPlayer, listPendingAccounts, removeAccount, reorderAccounts, setMainAccount, withoutRank, type RiotAccountRecord } from "@/server/accounts/repository";
import { syncAccount } from "@/server/accounts/sync";
import { accountSyncLeaseKey, accountSyncRetryIn, claimAccountSync, isSyncableAccount, REFRESH_COOLDOWN_MS, SCHEDULED_SYNC_LEASE_MS } from "@/server/accounts/refresh";
import { changeAccountRiotId, type RiotIdChange } from "@/server/accounts/change-riot-id";
import { createRiotClient, parsePlatforms } from "@/server/riot/api/client";
import { browserTestRiotClient } from "@/server/riot/browser-test";
import { checkRiotCredential, riotKeyCheckLimits, type CredentialState } from "@/server/riot/credential";
import { invalidateProficiencyCache } from "@/server/proficiency/service";
import { defaultPlatform } from "@/server/auth/signup";
import { canViewPlayerStats } from "@/server/auth/permissions";

type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };
const fail = (err: unknown): Result<never> => ({ ok: false, error: err instanceof AccountError ? err.message : publicErrorMessage(err) });

function touch() {
  revalidatePath("/team");
  revalidatePath("/players");
  revalidatePath("/me");
}

/**
 * Links a Riot ID to a player. Only the Riot ID is needed: Riot confirms the server during the
 * first sync (the configured default platform is the fallback until then), and accounts carry no
 * type or role of their own: the role belongs to the player profile.
 */
export async function addPlayerAccountAction(playerId: string, input: { riotId: string; platform?: string }): Promise<Result<RiotAccountRecord>> {
  try {
    const session = await requireRiotAccountEditor(playerId);
    const db = await getAppDb();
    const account = await addAccount(db, { ownerType: "player", playerId, riotId: input.riotId, platform: input.platform?.trim() || defaultPlatform() });
    // Resolve immediately when a key is available so the user sees whether the Riot ID exists
    // (under the account's sync lease, like every sync: a view's slice must not start on the new
    // row while this runs). The claim is given back as soon as the sync is done, as the sign-up
    // kickoff does, so the page's own refresh carries the history on at once, not 100 s later.
    const client = createRiotClient();
    const claimedAt = new Date();
    if (client && (await claimAccountSync(db, account.id, SCHEDULED_SYNC_LEASE_MS, claimedAt))) {
      try {
        await syncAccount(db, client, account, { maxMatchesPerRun: 20 });
      } finally {
        await releaseLease(db, accountSyncLeaseKey(account.id), claimedAt);
      }
    }
    invalidateProficiencyCache();
    touch();
    const fresh = (await listAccountsForPlayer(db, playerId)).find((a) => a.id === account.id) ?? account;
    // The answer reaches the browser: never the PUUID, and a teammate's rank only for those who may see it.
    return { ok: true, data: canViewPlayerStats(session, playerId) ? accountForBrowser(fresh) : withoutRank(accountForBrowser(fresh)) };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Change the Riot ID of a linked account. A rename of the same Riot account updates the name and
 * keeps everything; a different Riot account needs `confirmReplace` (the UI asks first).
 */
export async function changeRiotIdAction(playerId: string, accountId: string, riotId: string, options: { confirmReplace?: boolean } = {}): Promise<Result<RiotIdChange>> {
  try {
    await requireRiotAccountEditor(playerId);
    const db = await getAppDb();
    const client = createRiotClient();
    if (!client) return { ok: false, error: "Riot verification is not available right now, so nothing was changed." };
    const account = (await listAccountsForPlayer(db, playerId)).find((a) => a.id === accountId);
    if (!account) return { ok: false, error: "Account not found." };
    const r = await changeAccountRiotId(db, client, account, riotId, options);
    if (r.kind !== "different-account") {
      invalidateProficiencyCache();
      touch();
    }
    return { ok: true, data: r };
  } catch (err) {
    return fail(err);
  }
}

export async function removePlayerAccountAction(playerId: string, accountId: string): Promise<Result> {
  try {
    await requireRiotAccountEditor(playerId);
    const db = await getAppDb();
    // The account must belong to the player the caller may edit (never someone else's).
    if (!(await listAccountsForPlayer(db, playerId)).some((a) => a.id === accountId)) return { ok: false, error: "Account not found." };
    await removeAccount(db, accountId);
    invalidateProficiencyCache();
    touch();
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

/** Makes one of the player's linked accounts their Main (the others become Alts; all keep counting). */
export async function setMainAccountAction(playerId: string, accountId: string): Promise<Result> {
  try {
    await requireRiotAccountEditor(playerId);
    const db = await getAppDb();
    await setMainAccount(db, playerId, accountId);
    touch();
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

/** Saves the player's order of their linked accounts (the Main stays first). Presentation only. */
export async function reorderAccountsAction(playerId: string, orderedIds: string[]): Promise<Result> {
  try {
    await requireRiotAccountEditor(playerId);
    if (!Array.isArray(orderedIds) || orderedIds.length > 50 || orderedIds.some((id) => typeof id !== "string")) return { ok: false, error: "That order could not be read." };
    const db = await getAppDb();
    await reorderAccounts(db, playerId, orderedIds);
    touch();
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Retry sync, on an account that is Delayed or needs attention: the full sync of that one account,
 * under the same per-account lease and cooldown as a profile's Refresh (server/accounts/refresh.ts),
 * so repeated clicks, or a retry beside a Refresh or the scheduler, never ask Riot twice. It says
 * what the sync found, never "up to date" for the click alone.
 */
export async function syncPlayerAccountAction(playerId: string, accountId: string): Promise<Result<{ status: "ok" | "pending" | "unresolved" | "failed"; newGames: number; error?: string } | { status: "recent"; retryInSeconds: number }>> {
  try {
    await requireRiotAccountEditor(playerId);
    const db = await getAppDb();
    const client = createRiotClient() ?? browserTestRiotClient();
    if (!client) return { ok: false, error: "RIOT_API_KEY is not configured on the server, so accounts cannot be synced yet." };
    const account = (await listAccountsForPlayer(db, playerId)).find((a) => a.id === accountId);
    if (!account) return { ok: false, error: "Account not found." };
    if (!isSyncableAccount(account)) return { ok: false, error: "Demo accounts are not read from Riot; their games are sample data." };
    if (!(await claimAccountSync(db, account.id, REFRESH_COOLDOWN_MS))) return { ok: true, data: { status: "recent", retryInSeconds: await accountSyncRetryIn(db, [account.id]) } };
    const r = await syncAccount(db, client, account, { maxMatchesPerRun: 60 });
    if (r.matchesFolded > 0 || r.masteryRows > 0) invalidateProficiencyCache();
    touch();
    return { ok: true, data: { status: r.status, newGames: r.matchesFolded, error: r.error } };
  } catch (err) {
    return fail(err);
  }
}

/** Owner: re-run the sync for every linked account that is not currently synced (bounded). */
export async function retryPendingAccountsAction(): Promise<Result<{ attempted: number; synced: number; pending: number; failed: number; skipped: number }>> {
  try {
    await requirePermission("manage-data");
    const db = await getAppDb();
    const started = Date.now();
    // The client carries the 40-second budget, so no request waits for Riot's rate limits past it.
    const client = createRiotClient({ deadline: started + 40_000 });
    if (!client) return { ok: false, error: "RIOT_API_KEY is not configured on the server." };
    const pending = await listPendingAccounts(db, 20);
    let attempted = 0;
    let skipped = 0;
    let synced = 0;
    let stillPending = 0;
    let failed = 0;
    for (const account of pending) {
      if (Date.now() - started > 40_000) break;
      // An account the scheduler or a Refresh is syncing right now is left to that run.
      if (!(await claimAccountSync(db, account.id, SCHEDULED_SYNC_LEASE_MS))) {
        skipped += 1;
        continue;
      }
      attempted += 1;
      const r = await syncAccount(db, client, account, { maxMatchesPerRun: 20 });
      if (r.status === "ok") synced += 1;
      else if (r.status === "pending") stillPending += 1;
      else failed += 1;
      // Out of time (the account is left as it was): the next one would wait the same way.
      if (r.outOfTime) break;
    }
    invalidateProficiencyCache();
    touch();
    revalidatePath("/settings");
    return { ok: true, data: { attempted, synced, pending: stillPending, failed, skipped } };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Owner: whether the configured key is accepted right now (checkRiotCredential). One platform-status
 * request; while a refusal is recorded, also the requests an account sync makes for at most one
 * linked account per server. Bounded by the key check's deadline (riotKeyCheckLimits: 30 s).
 */
export async function checkRiotKeyAction(): Promise<Result<{ state: CredentialState; message: string; statusCode: number | null }>> {
  try {
    await requirePermission("manage-data");
    const started = Date.now();
    const db = await getAppDb();
    const client = createRiotClient(riotKeyCheckLimits(started));
    if (!client) return { ok: true, data: { state: "not-configured", message: "RIOT_API_KEY is not configured on the server.", statusCode: null } };
    const r = await checkRiotCredential(db, client, parsePlatforms(process.env.RIOT_PLATFORMS)[0] ?? "oc1");
    revalidatePath("/settings");
    return { ok: true, data: { state: r.state, message: r.message, statusCode: r.statusCode } };
  } catch (err) {
    return fail(err);
  }
}
