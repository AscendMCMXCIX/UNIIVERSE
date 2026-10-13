"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getAppDb } from "@/server/bootstrap";
import { requirePermission, requireSession, signIn } from "@/server/auth/session";
import { temporaryPassword, validatePasswordStrength, verifyPassword } from "@/server/auth/password";
import { getUser, setPassword, UserError } from "@/server/repositories/users";
import { completeLegacyProfile, defaultPlatform, type RiotIdInput } from "@/server/auth/signup";
import { createVerifiedPlayerAccount, deleteAccount, deleteProfile, setAccountActive, setAccountRole } from "@/server/auth/account-admin";
import { issueActivationCode } from "@/server/auth/activation";
import { revokeAllSessions } from "@/server/auth/sessions";
import { createVerificationClient, verifyRiotIdentity, type IdentityCheck } from "@/server/riot/verify-identity";
import { users as usersTable } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import type { Role } from "@/domain/roles";
import type { PlayerGroup } from "@/domain/roster";
import { kickoffAccountSync } from "@/server/accounts/kickoff";

/*
  Account management for admins: the same actions back Admin → Players & Accounts and
  Admin → Users & Permissions. Every action checks the caller's rights on the server; the rules
  themselves (last admin, self-protection, atomic creation) live in auth/account-admin.ts.
*/

type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };

const fail = (err: unknown): Result<never> => ({ ok: false, error: err instanceof UserError || (err as Error).name === "NotAuthorizedError" ? (err as Error).message : "Something went wrong. Please try again." });

function touchAdmin() {
  for (const path of ["/settings", "/players", "/team", "/admin/users", "/admin/players"]) revalidatePath(path);
}

/** Step 1 of creating a player: ask Riot whether the Riot ID exists and is not already ours. */
export async function verifyRiotIdAction(riotId: string): Promise<Result<IdentityCheck>> {
  try {
    await requirePermission("manage-users");
    const db = await getAppDb();
    return { ok: true, data: await verifyRiotIdentity(db, riotId, createVerificationClient(), { platformHint: defaultPlatform() }) };
  } catch (err) {
    return fail(err);
  }
}

export interface CreatedAccountView {
  userId: string;
  playerId: string;
  username: string;
  riotId: string;
  code: string;
  expiresAt: string;
  reusedProfile: boolean;
}

/**
 * Step 2: create the account. Riot is asked again here (a client can be tampered with); only a
 * verified Riot ID creates anything. History, mastery and proficiency follow in the background.
 */
export async function createPlayerAccountAction(input: { username: string; riotId: string; group?: PlayerGroup }): Promise<Result<CreatedAccountView>> {
  try {
    const session = await requirePermission("manage-users");
    const db = await getAppDb();
    const identity = await verifyRiotIdentity(db, input.riotId, createVerificationClient(), { platformHint: defaultPlatform() });
    if (identity.status !== "verified") return { ok: false, error: identity.message };
    const created = await createVerifiedPlayerAccount(db, { username: input.username, identity, group: input.group ?? "main", createdByUserId: session.userId });
    after(() => kickoffAccountSync(db, created.playerId));
    touchAdmin();
    return { ok: true, data: { userId: created.user.id, playerId: created.playerId, username: created.user.username, riotId: identity.riotId, code: created.code, expiresAt: created.expiresAt.toISOString(), reusedProfile: created.reusedProfile } };
  } catch (err) {
    return fail(err);
  }
}

/** A new single-use activation code (lost device, expired code). Older unused codes stop working; optionally signs the account out everywhere. */
export async function issueActivationCodeAction(userId: string, options: { signOutEverywhere?: boolean } = {}): Promise<Result<{ code: string; expiresAt: string }>> {
  try {
    const session = await requirePermission("manage-users");
    const db = await getAppDb();
    const issued = await issueActivationCode(db, userId, session.userId);
    if (options.signOutEverywhere) await revokeAllSessions(db, userId);
    touchAdmin();
    return { ok: true, data: { code: issued.code, expiresAt: issued.expiresAt.toISOString() } };
  } catch (err) {
    return fail(err);
  }
}

export async function setAccountActiveAction(userId: string, active: boolean): Promise<Result> {
  try {
    const session = await requirePermission("manage-users");
    await setAccountActive(await getAppDb(), session.userId, userId, active);
    touchAdmin();
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteAccountAction(userId: string, options: { eraseProfile?: boolean } = {}): Promise<Result> {
  try {
    const session = await requirePermission("manage-users");
    await deleteAccount(await getAppDb(), session.userId, userId, { eraseProfile: !!options.eraseProfile });
    touchAdmin();
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

/** Permanently deletes a player profile that has no account. */
export async function deleteProfileAction(playerId: string): Promise<Result> {
  try {
    await requirePermission("manage-users");
    await deleteProfile(await getAppDb(), playerId);
    touchAdmin();
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

export async function setAccountRoleAction(userId: string, role: "owner" | "player"): Promise<Result> {
  try {
    const session = await requirePermission("manage-users");
    if (role !== "owner" && role !== "player") return { ok: false, error: "Unknown role." };
    await setAccountRole(await getAppDb(), session.userId, userId, role);
    touchAdmin();
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Admin password change: the current password re-authenticates the admin, the new one is typed
 * twice, other devices are signed out and this one gets a fresh session. An admin account that
 * has no password yet (just promoted, signed in with a code) sets its first one here. Players
 * have no password: they sign in with activation codes.
 */
export async function changeOwnPasswordAction(input: { current: string; next: string; confirm: string }): Promise<Result> {
  try {
    const session = await requireSession();
    if (!session.userId) return { ok: false, error: "No account session." };
    if (session.role !== "owner") return { ok: false, error: "Players sign in with activation codes and have no password." };
    if (input.next !== input.confirm) return { ok: false, error: "The two new passwords do not match." };
    const weak = validatePasswordStrength(input.next);
    if (weak) return { ok: false, error: weak };
    const db = await getAppDb();
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, session.userId));
    if (!user) return { ok: false, error: "Account not found." };
    if (user.passwordHash && !(await verifyPassword(input.current, user.passwordHash))) return { ok: false, error: "Current password is incorrect." };
    await setPassword(db, user.id, input.next);
    await signIn(db, user, { remember: true });
    revalidatePath("/settings");
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

/** One-time completion for an account that predates automatic profiles. */
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

/** Admin only, for another admin account that lost its password: a one-time temporary password shown once. Players get activation codes instead. */
export async function resetAdminPasswordAction(userId: string): Promise<Result<{ temporaryPassword: string }>> {
  try {
    const session = await requirePermission("manage-users");
    if (session.userId === userId) return { ok: false, error: "Change your own password under Settings instead." };
    const db = await getAppDb();
    const user = await getUser(db, userId);
    if (!user) return { ok: false, error: "Account not found." };
    if (user.role !== "owner") return { ok: false, error: "Players sign in with activation codes: issue a new code instead." };
    const next = temporaryPassword();
    await setPassword(db, userId, next);
    touchAdmin();
    return { ok: true, data: { temporaryPassword: next } };
  } catch (err) {
    return fail(err);
  }
}
