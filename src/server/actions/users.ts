"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getAppDb } from "@/server/bootstrap";
import { requirePermission, requireSession, SESSION_COOKIE } from "@/server/auth/session";
import { validatePasswordStrength, verifyPassword } from "@/server/auth/password";
import { setPassword, UserError } from "@/server/repositories/users";
import { completeLegacyProfile, defaultPlatform, type RiotIdInput } from "@/server/auth/signup";
import { createVerifiedPlayerAccount, deleteAccount, deleteProfile, resetPasswordToTemporary, setAccountActive, setAccountRole, setAdministrator } from "@/server/auth/account-admin";
import { revokeOtherSessions } from "@/server/auth/sessions";
import { cookies } from "next/headers";
import { createVerificationClient, verifyRiotIdentity, type IdentityCheck } from "@/server/riot/verify-identity";
import { users as usersTable } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import type { Role } from "@/domain/roles";
import { kickoffAccountSync } from "@/server/accounts/kickoff";
import { auditPlayerName, auditPresetName, auditUserName, recordAudit } from "@/server/audit/log";

/*
  Account management for administrators (Admin Mode → Users & Permissions). Every action checks
  the caller's rights on the server; the rules themselves (last administrator, self-protection,
  the Owner account, atomic creation) live in auth/account-admin.ts.
*/

type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };

const fail = (err: unknown): Result<never> => ({ ok: false, error: err instanceof UserError || (err as Error).name === "NotAuthorizedError" || (err as Error).name === "PlayerValidationError" ? (err as Error).message : "Something went wrong. Please try again." });

function touchAdmin() {
  for (const path of ["/settings", "/players", "/team", "/admin", "/admin/people", "/admin/audit"]) revalidatePath(path);
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
  temporaryPassword: string;
  expiresAt: string;
  reusedProfile: boolean;
  teamMember: boolean;
}

/**
 * Step 2: create the account. Riot is asked again here (a client can be tampered with); only a
 * verified Riot ID creates anything. History, mastery and proficiency follow in the background.
 */
export async function createPlayerAccountAction(input: { username: string; riotId: string; teamMember?: boolean }): Promise<Result<CreatedAccountView>> {
  try {
    const session = await requirePermission("manage-users");
    const db = await getAppDb();
    const identity = await verifyRiotIdentity(db, input.riotId, createVerificationClient(), { platformHint: defaultPlatform() });
    if (identity.status !== "verified") return { ok: false, error: identity.message };
    if (typeof input.teamMember !== "boolean") return { ok: false, error: "Choose whether they join the team or use the app for themselves." };
    const created = await createVerifiedPlayerAccount(db, { username: input.username, identity, teamMember: input.teamMember, createdByUserId: session.userId });
    await recordAudit(db, session, { action: "account.create", target: { type: "user", id: created.user.id, name: created.user.username }, details: { teamMember: input.teamMember } });
    after(() => kickoffAccountSync(db, created.playerId));
    touchAdmin();
    return { ok: true, data: { userId: created.user.id, playerId: created.playerId, username: created.user.username, riotId: identity.riotId, temporaryPassword: created.temporaryPassword, expiresAt: created.expiresAt.toISOString(), reusedProfile: created.reusedProfile, teamMember: input.teamMember } };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Team membership for a player profile (Admin only): the team workspace, the Players directory
 * and the lineup, or personal use only. Nothing of the person's own data changes either way.
 */
export async function setTeamMemberAction(playerId: string, member: boolean): Promise<Result> {
  try {
    const session = await requirePermission("manage-users");
    if (typeof member !== "boolean") return { ok: false, error: "Choose team member or personal use." };
    const db = await getAppDb();
    const { getOrCreateTeam, setTeamMember } = await import("@/server/repositories/team");
    await setTeamMember(db, (await getOrCreateTeam(db)).id, playerId, member);
    await recordAudit(db, session, { action: "account.team-member", target: { type: "player", id: playerId, name: await auditPlayerName(db, playerId) }, details: { teamMember: member } });
    touchAdmin();
    revalidatePath("/team");
    revalidatePath("/players");
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

/** Admin password reset: a new random temporary password, shown once. The old password stops working and the account is signed out everywhere. */
export async function resetPasswordAction(userId: string): Promise<Result<{ temporaryPassword: string; expiresAt: string }>> {
  try {
    const session = await requirePermission("manage-users");
    const db = await getAppDb();
    const issued = await resetPasswordToTemporary(db, session.userId, userId);
    await recordAudit(db, session, { action: "account.password-reset", target: { type: "user", id: userId } });
    touchAdmin();
    return { ok: true, data: { temporaryPassword: issued.password, expiresAt: issued.expiresAt.toISOString() } };
  } catch (err) {
    return fail(err);
  }
}

export async function setAccountActiveAction(userId: string, active: boolean): Promise<Result> {
  try {
    const session = await requirePermission("manage-users");
    const db = await getAppDb();
    await setAccountActive(db, session.userId, userId, active);
    await recordAudit(db, session, { action: active ? "account.activate" : "account.deactivate", target: { type: "user", id: userId } });
    touchAdmin();
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteAccountAction(userId: string, options: { eraseProfile?: boolean } = {}): Promise<Result> {
  try {
    const session = await requirePermission("manage-users");
    const db = await getAppDb();
    const name = await auditUserName(db, userId);
    await deleteAccount(db, session.userId, userId, { eraseProfile: !!options.eraseProfile });
    await recordAudit(db, session, { action: "account.delete", target: { type: "user", id: userId, name }, details: { profileErased: !!options.eraseProfile } });
    touchAdmin();
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

/** Permanently deletes a player profile that has no account. */
export async function deleteProfileAction(playerId: string): Promise<Result> {
  try {
    const session = await requirePermission("manage-users");
    const db = await getAppDb();
    const name = await auditPlayerName(db, playerId);
    await deleteProfile(db, playerId);
    await recordAudit(db, session, { action: "profile.delete", target: { type: "player", id: playerId, name } });
    touchAdmin();
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Administrator access on or off for another account (any administrator; never your own; the
 * Owner always has it). Recorded in the audit log; it applies from that account's next request.
 */
export async function setAdministratorAction(userId: string, on: boolean): Promise<Result> {
  try {
    const session = await requirePermission("manage-users");
    if (typeof on !== "boolean") return { ok: false, error: "Choose whether they are an administrator." };
    const db = await getAppDb();
    const { user, changed } = await setAdministrator(db, session.userId, userId, on);
    if (changed) await recordAudit(db, session, { action: on ? "account.admin-grant" : "account.admin-revoke", target: { type: "user", id: userId, name: user.username } });
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
    const db = await getAppDb();
    await setAccountRole(db, session.userId, userId, role);
    await recordAudit(db, session, { action: "account.role", target: { type: "user", id: userId }, details: { role } });
    touchAdmin();
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Change your own password (everyone): the current password re-authenticates the change, the
 * new one is typed twice, and every other device is signed out (this one stays signed in). An
 * account that has no password yet (from the short-lived passwordless sign-in) sets its first
 * one here while its session lasts.
 */
export async function changeOwnPasswordAction(input: { current: string; next: string; confirm: string }): Promise<Result> {
  try {
    const session = await requireSession();
    if (!session.userId) return { ok: false, error: "No account session." };
    if (input.next !== input.confirm) return { ok: false, error: "The two new passwords do not match." };
    const weak = validatePasswordStrength(input.next);
    if (weak) return { ok: false, error: weak };
    const db = await getAppDb();
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, session.userId));
    if (!user) return { ok: false, error: "Account not found." };
    if (user.passwordHash && !(await verifyPassword(input.current, user.passwordHash))) return { ok: false, error: "Current password is incorrect." };
    if (user.passwordHash && (await verifyPassword(input.next, user.passwordHash))) return { ok: false, error: "Choose a password different from the current one." };
    await setPassword(db, user.id, input.next, { keepSessions: true });
    await revokeOtherSessions(db, user.id, (await cookies()).get(SESSION_COOKIE)?.value);
    await recordAudit(db, session, { action: "password.change", target: { type: "user", id: user.id, name: user.username } });
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

/* ---------------- Permissions (administrators only: no level or group holds "manage-users") ---------------- */

/** Assign a player a preset (null = the default preset) or a custom set of capabilities. */
export async function setUserPermissionsAction(userId: string, choice: { presetId: string | null } | { custom: string[] }): Promise<Result> {
  try {
    const session = await requirePermission("manage-users");
    const { setUserPermissions } = await import("@/server/repositories/permissions");
    const db = await getAppDb();
    await setUserPermissions(db, userId, choice);
    await recordAudit(db, session, { action: "account.permissions", target: { type: "user", id: userId }, details: "custom" in choice ? { level: "custom", capabilities: choice.custom.length } : { level: (choice.presetId && (await auditPresetName(db, choice.presetId))) || "default" } });
    touchAdmin();
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

/** Set an account's access level: Owner, a preset level, or Custom (see setAccessLevel for the protections). */
export async function setAccessLevelAction(userId: string, choice: { level: "owner" } | { level: "preset"; presetId: string } | { level: "custom"; capabilities: string[] }): Promise<Result> {
  try {
    const session = await requirePermission("manage-users");
    if (!choice || !["owner", "preset", "custom"].includes(choice.level)) return { ok: false, error: "Choose an access level." };
    const { setAccessLevel } = await import("@/server/repositories/permissions");
    const db = await getAppDb();
    await setAccessLevel(db, session.userId, userId, choice);
    await recordAudit(db, session, { action: "account.access", target: { type: "user", id: userId }, details: { level: choice.level === "preset" ? ((await auditPresetName(db, choice.presetId)) ?? "preset") : choice.level } });
    touchAdmin();
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

/** Additional access groups for an account (administrators only; never your own; groups never include administrator rights). */
export async function setAccessGroupsAction(userId: string, groups: string[]): Promise<Result> {
  try {
    const session = await requirePermission("manage-users");
    if (!Array.isArray(groups)) return { ok: false, error: "Choose the additional access." };
    const { setAccessGroups } = await import("@/server/repositories/permissions");
    const db = await getAppDb();
    await setAccessGroups(db, session.userId, userId, groups);
    await recordAudit(db, session, { action: "account.groups", target: { type: "user", id: userId }, details: { groups: groups.join(", ") || "none" } });
    touchAdmin();
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

export async function savePermissionPresetAction(input: { id?: string | null; name: string; description?: string; capabilities: string[] }): Promise<Result<{ id: string }>> {
  try {
    const session = await requirePermission("manage-users");
    const { savePermissionPreset } = await import("@/server/repositories/permissions");
    const db = await getAppDb();
    const id = await savePermissionPreset(db, input);
    await recordAudit(db, session, { action: "preset.save", target: { type: "preset", id, name: input.name }, details: { capabilities: input.capabilities.length } });
    touchAdmin();
    return { ok: true, data: { id } };
  } catch (err) {
    return fail(err);
  }
}

export async function deletePermissionPresetAction(id: string): Promise<Result> {
  try {
    const session = await requirePermission("manage-users");
    const { deletePermissionPreset } = await import("@/server/repositories/permissions");
    const db = await getAppDb();
    const name = await auditPresetName(db, id);
    await deletePermissionPreset(db, id);
    await recordAudit(db, session, { action: "preset.delete", target: { type: "preset", id, name } });
    touchAdmin();
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}
