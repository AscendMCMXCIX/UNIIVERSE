"use server";

import { revalidatePath } from "next/cache";
import { getAppDb } from "@/server/bootstrap";
import { requirePermission, requireRiotAccountEditor } from "@/server/auth/session";
import { AccountError, addAccount, listAccountsForPlayer, listPendingAccounts, removeAccount, setMainAccount, type RiotAccountRecord } from "@/server/accounts/repository";
import { syncAccount } from "@/server/accounts/sync";
import { changeAccountRiotId, type RiotIdChange } from "@/server/accounts/change-riot-id";
import { createRiotClient, parsePlatforms } from "@/server/riot/api/client";
import { checkRiotCredential, type CredentialState } from "@/server/riot/credential";
import { invalidateProficiencyCache } from "@/server/proficiency/service";
import { defaultPlatform } from "@/server/auth/signup";

type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };
const fail = (err: unknown): Result<never> => ({ ok: false, error: err instanceof AccountError ? err.message : (err as Error).message });

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
    await requireRiotAccountEditor(playerId);
    const db = await getAppDb();
    const account = await addAccount(db, { ownerType: "player", playerId, riotId: input.riotId, platform: input.platform?.trim() || defaultPlatform() });
    // Resolve immediately when a key is available so the user sees whether the Riot ID exists.
    const client = createRiotClient();
    if (client) await syncAccount(db, client, account, { maxMatchesPerRun: 20 });
    invalidateProficiencyCache();
    touch();
    const fresh = (await listAccountsForPlayer(db, playerId)).find((a) => a.id === account.id) ?? account;
    return { ok: true, data: fresh };
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

export async function syncPlayerAccountAction(playerId: string, accountId: string): Promise<Result<{ status: "ok" | "pending" | "unresolved" | "failed"; error?: string }>> {
  try {
    await requireRiotAccountEditor(playerId);
    const db = await getAppDb();
    const client = createRiotClient();
    if (!client) return { ok: false, error: "RIOT_API_KEY is not configured on the server, so accounts cannot be synced yet." };
    const account = (await listAccountsForPlayer(db, playerId)).find((a) => a.id === accountId);
    if (!account) return { ok: false, error: "Account not found." };
    const r = await syncAccount(db, client, account, { maxMatchesPerRun: 60 });
    invalidateProficiencyCache();
    touch();
    return { ok: true, data: { status: r.status, error: r.error } };
  } catch (err) {
    return fail(err);
  }
}

export async function listPlayerAccountsAction(playerId: string): Promise<RiotAccountRecord[]> {
  await requirePermission("view-players");
  const db = await getAppDb();
  return listAccountsForPlayer(db, playerId);
}

/** Owner: re-run the sync for every linked account that is not currently synced (bounded). */
export async function retryPendingAccountsAction(): Promise<Result<{ attempted: number; synced: number; pending: number; failed: number }>> {
  try {
    await requirePermission("manage-data");
    const db = await getAppDb();
    const client = createRiotClient();
    if (!client) return { ok: false, error: "RIOT_API_KEY is not configured on the server." };
    const pending = await listPendingAccounts(db, 20);
    let synced = 0;
    let stillPending = 0;
    let failed = 0;
    const started = Date.now();
    for (const account of pending) {
      if (Date.now() - started > 40_000) break;
      const r = await syncAccount(db, client, account, { maxMatchesPerRun: 20 });
      if (r.status === "ok") synced += 1;
      else if (r.status === "pending") stillPending += 1;
      else failed += 1;
    }
    invalidateProficiencyCache();
    touch();
    revalidatePath("/settings");
    return { ok: true, data: { attempted: pending.length, synced, pending: stillPending, failed } };
  } catch (err) {
    return fail(err);
  }
}

/** Owner: one cheap Riot request to learn whether the configured key is accepted right now. */
export async function checkRiotKeyAction(): Promise<Result<{ state: CredentialState; message: string; statusCode: number | null }>> {
  try {
    await requirePermission("manage-data");
    const db = await getAppDb();
    const client = createRiotClient();
    if (!client) return { ok: true, data: { state: "not-configured", message: "RIOT_API_KEY is not configured on the server.", statusCode: null } };
    const r = await checkRiotCredential(db, client, parsePlatforms(process.env.RIOT_PLATFORMS)[0] ?? "oc1");
    revalidatePath("/settings");
    return { ok: true, data: { state: r.state, message: r.message, statusCode: r.statusCode } };
  } catch (err) {
    return fail(err);
  }
}
