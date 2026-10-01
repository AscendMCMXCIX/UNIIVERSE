"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Role } from "@/domain/roles";
import { getAppDb } from "@/server/bootstrap";
import { requirePermission } from "@/server/auth/session";
import { AccountError, addAccount, removeAccount, listAccountsForOpponentPlayers } from "@/server/accounts/repository";
import { syncAccount } from "@/server/accounts/sync";
import { createRiotClient } from "@/server/riot/api/client";
import { addOpponentPlayer, createOpponentTeam, deleteOpponentPlayer, deleteOpponentTeam, findOpponentByName, getOrCreateTeamId, OpponentError, updateOpponentPlayer, updateOpponentTeam, type ScoutConfidence } from "@/server/repositories/opponents";
import { updateDraftMeta } from "@/server/repositories/drafts";
import { invalidateProficiencyCache } from "@/server/proficiency/service";

type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };
const fail = (err: unknown): Result<never> => ({ ok: false, error: err instanceof OpponentError || err instanceof AccountError ? err.message : (err as Error).message });

function touch(id?: string) {
  revalidatePath("/opponents");
  if (id) revalidatePath(`/opponents/${id}`);
  revalidatePath("/draft");
}

export async function createOpponentAction(input: { name: string; aliases?: string[]; notes?: string; draftId?: string }): Promise<Result<{ id: string }>> {
  try {
    await requirePermission("manage-opponents");
    const db = await getAppDb();
    const teamId = await getOrCreateTeamId(db);
    const existing = await findOpponentByName(db, teamId, input.name);
    const team = existing ?? (await createOpponentTeam(db, teamId, input));
    if (input.draftId) await updateDraftMeta(db, input.draftId, { opponentTeamId: team.id, opponentName: team.name });
    touch(team.id);
    return { ok: true, data: { id: team.id } };
  } catch (err) {
    return fail(err);
  }
}

export async function updateOpponentAction(id: string, patch: { name?: string; aliases?: string[]; notes?: string; archived?: boolean }): Promise<Result> {
  try {
    await requirePermission("manage-opponents");
    const db = await getAppDb();
    await updateOpponentTeam(db, id, { name: patch.name, aliases: patch.aliases, notes: patch.notes, ...(patch.archived !== undefined ? { archivedAt: patch.archived ? new Date() : null } : {}) });
    touch(id);
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteOpponentAction(id: string): Promise<void> {
  await requirePermission("manage-opponents");
  const db = await getAppDb();
  await deleteOpponentTeam(db, id);
  touch();
  redirect("/opponents");
}

export interface QuickPlayerInput {
  label: string;
  riotId?: string;
  platform?: string;
  likelyRole?: Role | null;
  altRole?: Role | null;
  confidence?: ScoutConfidence;
  notes?: string;
}

/** Clash quick entry: label + optional Riot ID in one go; resolves and syncs immediately when a key exists. */
export async function addOpponentPlayerAction(opponentTeamId: string, input: QuickPlayerInput): Promise<Result<{ playerId: string; accountStatus: string | null }>> {
  try {
    await requirePermission("manage-opponents");
    const db = await getAppDb();
    const player = await addOpponentPlayer(db, opponentTeamId, { label: input.label, likelyRole: input.likelyRole ?? null, altRole: input.altRole ?? null, confidence: input.confidence ?? (input.riotId ? "medium" : "unknown"), notes: input.notes ?? "" });
    let accountStatus: string | null = null;
    if (input.riotId?.includes("#")) {
      const account = await addAccount(db, { ownerType: "opponent", opponentPlayerId: player.id, riotId: input.riotId, platform: input.platform ?? "euw1", label: "main", role: input.likelyRole ?? null });
      const client = createRiotClient();
      if (client) {
        const r = await syncAccount(db, client, account, { maxMatchesPerRun: 40, lookbackDays: 60 });
        accountStatus = r.error ? `failed: ${r.error}` : "synced";
      } else accountStatus = "saved (no Riot key configured)";
      invalidateProficiencyCache();
    }
    touch(opponentTeamId);
    return { ok: true, data: { playerId: player.id, accountStatus } };
  } catch (err) {
    return fail(err);
  }
}

export async function updateOpponentPlayerAction(opponentTeamId: string, playerId: string, patch: { label?: string; likelyRole?: Role | null; altRole?: Role | null; confidence?: ScoutConfidence; notes?: string }): Promise<Result> {
  try {
    await requirePermission("manage-opponents");
    const db = await getAppDb();
    await updateOpponentPlayer(db, playerId, patch);
    touch(opponentTeamId);
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteOpponentPlayerAction(opponentTeamId: string, playerId: string): Promise<Result> {
  try {
    await requirePermission("manage-opponents");
    const db = await getAppDb();
    await deleteOpponentPlayer(db, playerId);
    touch(opponentTeamId);
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

export async function addOpponentAccountAction(opponentTeamId: string, playerId: string, input: { riotId: string; platform: string }): Promise<Result<{ status: string }>> {
  try {
    await requirePermission("manage-opponents");
    const db = await getAppDb();
    const account = await addAccount(db, { ownerType: "opponent", opponentPlayerId: playerId, riotId: input.riotId, platform: input.platform, label: "main" });
    const client = createRiotClient();
    let status = "saved (no Riot key configured)";
    if (client) {
      const r = await syncAccount(db, client, account, { maxMatchesPerRun: 40, lookbackDays: 60 });
      status = r.error ? `failed: ${r.error}` : "synced";
    }
    invalidateProficiencyCache();
    touch(opponentTeamId);
    return { ok: true, data: { status } };
  } catch (err) {
    return fail(err);
  }
}

export async function removeOpponentAccountAction(opponentTeamId: string, accountId: string): Promise<Result> {
  try {
    await requirePermission("manage-opponents");
    const db = await getAppDb();
    await removeAccount(db, accountId);
    invalidateProficiencyCache();
    touch(opponentTeamId);
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

export async function syncOpponentAction(opponentTeamId: string): Promise<Result<{ synced: number; failed: number }>> {
  try {
    await requirePermission("manage-opponents");
    const db = await getAppDb();
    const client = createRiotClient();
    if (!client) return { ok: false, error: "RIOT_API_KEY is not configured on the server." };
    const { getOpponentTeam } = await import("@/server/repositories/opponents");
    const team = await getOpponentTeam(db, opponentTeamId);
    if (!team) return { ok: false, error: "Opponent not found." };
    const accounts = await listAccountsForOpponentPlayers(db, team.players.map((p) => p.id));
    let synced = 0;
    let failed = 0;
    for (const a of accounts) {
      const r = await syncAccount(db, client, a, { maxMatchesPerRun: 40, lookbackDays: 60 });
      if (r.error) failed += 1;
      else synced += 1;
    }
    invalidateProficiencyCache();
    touch(opponentTeamId);
    return { ok: true, data: { synced, failed } };
  } catch (err) {
    return fail(err);
  }
}
