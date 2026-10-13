"use server";

import { revalidatePath } from "next/cache";
import { getAppDb } from "@/server/bootstrap";
import { requirePermission, requireSession } from "@/server/auth/session";
import type { AccessRole } from "@/server/auth/permissions";
import { temporaryPassword, validatePasswordStrength, verifyPassword } from "@/server/auth/password";
import { createInvite, deleteUser, getUser, revokeInvite, setPassword, updateUser, UserError } from "@/server/repositories/users";
import { completeLegacyProfile, type RiotIdInput } from "@/server/auth/signup";
import { signIn } from "@/server/auth/session";
import { users as usersTable } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import type { Role } from "@/domain/roles";

type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };

const fail = (err: unknown): Result<never> => ({ ok: false, error: err instanceof UserError ? err.message : (err as Error).message });

export async function createInviteAction(input: { role: AccessRole; playerId?: string | null; note?: string }): Promise<Result<{ token: string }>> {
  try {
    const session = await requirePermission("manage-users");
    const db = await getAppDb();
    const invite = await createInvite(db, { role: input.role, playerId: input.playerId ?? null, note: input.note ?? "", createdByUserId: session.userId });
    revalidatePath("/settings");
    return { ok: true, data: { token: invite.token } };
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

export async function updateUserAction(userId: string, patch: { role?: AccessRole; isActive?: boolean; playerId?: string | null }): Promise<Result> {
  try {
    const session = await requirePermission("manage-users");
    if (session.userId === userId && (patch.role && patch.role !== "owner")) return { ok: false, error: "You cannot remove your own owner role." };
    if (session.userId === userId && patch.isActive === false) return { ok: false, error: "You cannot deactivate yourself." };
    const db = await getAppDb();
    await updateUser(db, userId, patch);
    revalidatePath("/settings");
    return { ok: true, data: null };
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
