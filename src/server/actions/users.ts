"use server";

import { revalidatePath } from "next/cache";
import { getAppDb } from "@/server/bootstrap";
import { requirePermission, requireSession } from "@/server/auth/session";
import type { AccessRole } from "@/server/auth/permissions";
import { temporaryPassword, validatePasswordStrength, verifyPassword } from "@/server/auth/password";
import { createInvite, deleteUser, getUser, reissueAccountInvite, revokeInvite, setPassword, updateUser, UserError } from "@/server/repositories/users";
import { completeLegacyProfile, createPlayerAccount, type RiotIdInput } from "@/server/auth/signup";
import { signIn } from "@/server/auth/session";
import { users as usersTable } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import type { Role } from "@/domain/roles";
import { after } from "next/server";
import { kickoffAccountSync } from "@/server/accounts/kickoff";

type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };

const fail = (err: unknown): Result<never> => ({ ok: false, error: err instanceof UserError ? err.message : (err as Error).message });

export async function createInviteAction(input: { role: AccessRole; playerId?: string | null; note?: string }): Promise<Result<{ id: string; token: string; role: AccessRole; playerName: string | null; expiresAt: string }>> {
  try {
    const session = await requirePermission("manage-users");
    const db = await getAppDb();
    const invite = await createInvite(db, { role: input.role, playerId: input.playerId ?? null, note: input.note ?? "", createdByUserId: session.userId });
    revalidatePath("/settings");
    return { ok: true, data: { id: invite.id, token: invite.token, role: invite.role, playerName: invite.playerName, expiresAt: invite.expiresAt.toISOString() } };
  } catch (err) {
    return fail(err);
  }
}

export async function revokeInviteAction(id: string): Promise<Result> {
  try {
    await requirePermission("manage-users");
    const db = await getAppDb();
    await revokeInvite(db, id);
    revalidatePath("/settings");
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

export async function updateUserAction(userId: string, patch: { role?: AccessRole; draftLead?: boolean; isActive?: boolean; playerId?: string | null }): Promise<Result> {
  try {
    const session = await requirePermission("manage-users");
    if (session.userId === userId && (patch.role && patch.role !== "owner")) return { ok: false, error: "You cannot remove your own owner role." };
    if (session.userId === userId && patch.isActive === false) return { ok: false, error: "You cannot deactivate yourself." };
    const db = await getAppDb();
    await updateUser(db, userId, patch);
    touchAdmin();
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

function touchAdmin() {
  for (const path of ["/settings", "/players", "/team", "/admin/users", "/admin/players"]) revalidatePath(path);
}

export interface CreatedAccountView {
  userId: string;
  playerId: string;
  username: string;
  inviteToken: string;
  expiresAt: string;
}

/**
 * Admin → Players → Add Player Account: username + Riot ID become a user account, a player
 * profile and the primary Riot account in one step, plus the invite link to send the player.
 */
export async function createPlayerAccountAction(input: { username: string; riotId: string; platform?: string | null; group?: "main" | "other" }): Promise<Result<CreatedAccountView>> {
  try {
    const session = await requirePermission("manage-users");
    const db = await getAppDb();
    const created = await createPlayerAccount(db, { username: input.username, riotId: input.riotId, platform: input.platform ?? null, group: input.group ?? "main", createdByUserId: session.userId });
    after(() => kickoffAccountSync(db, created.playerId));
    touchAdmin();
    return { ok: true, data: { userId: created.user.id, playerId: created.playerId, username: created.user.username, inviteToken: created.invite.token, expiresAt: created.invite.expiresAt.toISOString() } };
  } catch (err) {
    return fail(err);
  }
}

/** A fresh invite link for an account that has not finished its setup (older links stop working). */
export async function reissueInviteAction(userId: string): Promise<Result<{ inviteToken: string; expiresAt: string }>> {
  try {
    const session = await requirePermission("manage-users");
    const db = await getAppDb();
    const invite = await reissueAccountInvite(db, userId, session.userId);
    touchAdmin();
    return { ok: true, data: { inviteToken: invite.token, expiresAt: invite.expiresAt.toISOString() } };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteUserAction(userId: string): Promise<Result> {
  try {
    const session = await requirePermission("manage-users");
    if (session.userId === userId) return { ok: false, error: "You cannot delete your own account." };
    const db = await getAppDb();
    await deleteUser(db, userId);
    revalidatePath("/settings");
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Sets or changes the signed-in user's password. An account created without a password sets
 * its first one here (no current password to check). Other devices are signed out; this one
 * gets a fresh session so the user stays signed in.
 */
export async function changeOwnPasswordAction(input: { current: string; next: string }): Promise<Result> {
  try {
    const session = await requireSession();
    if (!session.userId) return { ok: false, error: "No account session." };
    const weak = validatePasswordStrength(input.next);
    if (weak) return { ok: false, error: weak };
    const db = await getAppDb();
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, session.userId));
    if (!user) return { ok: false, error: "Account not found." };
    if (user.passwordHash && !(await verifyPassword(input.current, user.passwordHash))) return { ok: false, error: "Current password is incorrect." };
    await setPassword(db, user.id, input.next);
    await signIn(db, user, { remember: true });
    revalidatePath("/me");
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

/** One-time completion for an account that predates automatic player profiles. */
export async function completeProfileAction(input: { riotId: string; platform: string; extraRiot?: RiotIdInput[]; primaryRole: Role; secondaryRole?: Role | null }): Promise<Result<{ playerId: string }>> {
  try {
    const session = await requireSession();
    if (!session.userId) return { ok: false, error: "No account session." };
    const db = await getAppDb();
    const user = await completeLegacyProfile(db, session.userId, { primaryRiot: { riotId: input.riotId, platform: input.platform }, extraRiot: input.extraRiot ?? [], primaryRole: input.primaryRole, secondaryRole: input.secondaryRole ?? null });
    if (user.playerId) after(() => kickoffAccountSync(db, user.playerId!));
    revalidatePath("/me");
    revalidatePath("/team");
    revalidatePath("/players");
    return { ok: true, data: { playerId: user.playerId! } };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Owner-only: sets a one-time temporary password for a member who forgot theirs and returns it
 * once (show it to them in person or over a private channel; they change it under My profile).
 */
export async function resetMemberPasswordAction(userId: string): Promise<Result<{ temporaryPassword: string }>> {
  try {
    const session = await requirePermission("manage-users");
    if (session.userId === userId) return { ok: false, error: "Change your own password under My profile instead." };
    const db = await getAppDb();
    const user = await getUser(db, userId);
    if (!user) return { ok: false, error: "Account not found." };
    const next = temporaryPassword();
    await setPassword(db, userId, next);
    revalidatePath("/settings");
    return { ok: true, data: { temporaryPassword: next } };
  } catch (err) {
    return fail(err);
  }
}
