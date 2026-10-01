"use server";

import { revalidatePath } from "next/cache";
import { getAppDb } from "@/server/bootstrap";
import { requirePermission, requireSession } from "@/server/auth/session";
import type { AccessRole } from "@/server/auth/permissions";
import { validatePasswordStrength, verifyPassword } from "@/server/auth/password";
import { createInvite, deleteUser, findUserByEmail, revokeInvite, setPassword, updateUser, UserError } from "@/server/repositories/users";

type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };

const fail = (err: unknown): Result<never> => ({ ok: false, error: err instanceof UserError ? err.message : (err as Error).message });

export async function createInviteAction(input: { role: AccessRole; playerId?: string | null; email?: string | null; note?: string }): Promise<Result<{ token: string }>> {
  try {
    const session = await requirePermission("manage-users");
    const db = await getAppDb();
    const invite = await createInvite(db, { role: input.role, playerId: input.playerId ?? null, email: input.email ?? null, note: input.note ?? "", createdByUserId: session.userId });
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

export async function changeOwnPasswordAction(input: { current: string; next: string }): Promise<Result> {
  try {
    const session = await requireSession();
    if (!session.userId || !session.email) return { ok: false, error: "No account session." };
    const weak = validatePasswordStrength(input.next);
    if (weak) return { ok: false, error: weak };
    const db = await getAppDb();
    const user = await findUserByEmail(db, session.email);
    if (!user || !(await verifyPassword(input.current, user.passwordHash))) return { ok: false, error: "Current password is incorrect." };
    await setPassword(db, user.id, input.next);
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}
