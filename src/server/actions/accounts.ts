"use server";

import { revalidatePath } from "next/cache";
import type { Role } from "@/domain/roles";
import { getAppDb } from "@/server/bootstrap";
import { requirePermission, requirePlayerEditor } from "@/server/auth/session";
import { AccountError, addAccount, listAccountsForPlayer, removeAccount, type RiotAccountRecord } from "@/server/accounts/repository";
import { syncAccount } from "@/server/accounts/sync";
import { createRiotClient } from "@/server/riot/api/client";
import { invalidateProficiencyCache } from "@/server/proficiency/service";

type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };
const fail = (err: unknown): Result<never> => ({ ok: false, error: err instanceof AccountError ? err.message : (err as Error).message });

function touch() {
  revalidatePath("/team");
  revalidatePath("/players");
  revalidatePath("/me");
}

export async function addPlayerAccountAction(playerId: string, input: { riotId: string; platform: string; label: string; role?: Role | null }): Promise<Result<RiotAccountRecord>> {
  try {
    await requirePlayerEditor(playerId);
    const db = await getAppDb();
    const account = await addAccount(db, { ownerType: "player", playerId, riotId: input.riotId, platform: input.platform, label: input.label, role: input.role ?? null });
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

export async function removePlayerAccountAction(playerId: string, accountId: string): Promise<Result> {
  try {
    await requirePlayerEditor(playerId);
    const db = await getAppDb();
    await removeAccount(db, accountId);
    invalidateProficiencyCache();
    touch();
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

export async function syncPlayerAccountAction(playerId: string, accountId: string): Promise<Result<{ status: "ok" | "pending" | "unresolved" | "failed"; error?: string }>> {
  try {
    await requirePlayerEditor(playerId);
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
  await requirePermission("view-analysis");
  const db = await getAppDb();
  return listAccountsForPlayer(db, playerId);
}
