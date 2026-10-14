import { and, asc, desc, eq, gt, isNull, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { invites, players, users } from "@/server/db/schema";
import { hashPassword, randomToken, temporaryPassword, verifyPassword } from "@/server/auth/password";
import { sanitiseCapabilities, STANDARD_PLAYER, type AccessRole, type Capability } from "@/server/auth/permissions";
import { revokeAllSessions } from "@/server/auth/sessions";

export interface UserRecord {
  id: string;
  username: string;
  displayName: string;
  role: AccessRole;
  playerId: string | null;
  playerName: string | null;
  hasPassword: boolean;
  /** Holds a temporary password from an admin: must choose a permanent one at next sign-in. */
  mustChangePassword: boolean;
  temporaryPasswordExpiresAt: Date | null;
  isActive: boolean;
  /** Null while an admin-created account has not finished its first-login setup. */
  setupCompletedAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  /** Effective capabilities for a non-owner (custom set, else preset, else the default preset). */
  capabilities: Capability[];
  permissionPresetId: string | null;
  /** True when an admin chose individual capabilities instead of a preset. */
  hasCustomCapabilities: boolean;
  /** Profile picture version (null = none); the picture lives at avatarUrl(id, version). */
  avatarVersion: number | null;
}

/** Public URL of a profile picture; the version makes it safe to cache forever. */
export function avatarUrl(userId: string, version: number | null): string | null {
  return version ? `/api/avatars/${userId}?v=${version}` : null;
}

export class UserError extends Error {}

/** Usernames: 2–32 characters, letters, digits, spaces and . _ - ; compared case-insensitively. */
export const USERNAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,30}[\p{L}\p{N}]$/u;

export function normaliseUsername(username: string): string {
  return username.trim().replace(/\s+/g, " ");
}

export function validateUsername(username: string): string | null {
  const value = normaliseUsername(username);
  if (!value) return "Username is required.";
  if (value.length < 2) return "Username must be at least 2 characters.";
  if (value.length > 32) return "Username must be 32 characters or fewer.";
  if (!USERNAME_PATTERN.test(value)) return "Usernames may contain letters, digits, spaces, dots, underscores and hyphens.";
  return null;
}

/** The user's effective capabilities: custom set, else their preset, else the default preset (one correlated subquery). */
const effectiveCapabilities = sql<unknown>`coalesce(${users.customCapabilities}, (select p.capabilities from permission_presets p where p.id = ${users.permissionPresetId} or p.is_default order by (p.id = ${users.permissionPresetId}) desc nulls last limit 1))`;

function toRecord(row: typeof users.$inferSelect, playerName: string | null, capabilities: unknown): UserRecord {
  return {
    capabilities: capabilities === null || capabilities === undefined ? [...STANDARD_PLAYER] : sanitiseCapabilities(capabilities),
    permissionPresetId: row.permissionPresetId,
    hasCustomCapabilities: row.customCapabilities !== null && row.customCapabilities !== undefined,
    avatarVersion: row.avatarVersion,
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    role: row.role,
    playerId: row.playerId,
    playerName,
    hasPassword: !!row.passwordHash,
    mustChangePassword: row.mustChangePassword,
    temporaryPasswordExpiresAt: row.temporaryPasswordExpiresAt,
    isActive: row.isActive,
    setupCompletedAt: row.setupCompletedAt,
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
  };
}

export async function countUsers(db: Db): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(users);
  return Number(row?.n ?? 0);
}

export async function listUsers(db: Db): Promise<UserRecord[]> {
  const rows = await db.select({ user: users, playerName: players.displayName, capabilities: effectiveCapabilities }).from(users).leftJoin(players, eq(players.id, users.playerId)).orderBy(asc(users.createdAt));
  return rows.map((r) => toRecord(r.user, r.playerName ?? null, r.capabilities));
}

export async function getUser(db: Db, id: string): Promise<UserRecord | null> {
  const [row] = await db.select({ user: users, playerName: players.displayName, capabilities: effectiveCapabilities }).from(users).leftJoin(players, eq(players.id, users.playerId)).where(eq(users.id, id));
  return row ? toRecord(row.user, row.playerName ?? null, row.capabilities) : null;
}

/** Case-insensitive username lookup (raw row, for authentication). */
export async function findUserByUsername(db: Db, username: string) {
  const value = normaliseUsername(username);
  if (!value) return null;
  const [row] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.username}) = lower(${value})`);
  return row ?? null;
}

/** Finds an account by its login name (the username; there is no email login). */
export async function findUserByLogin(db: Db, login: string) {
  return findUserByUsername(db, login);
}

export interface CreateUserInput {
  username: string;
  /** Optional: accounts can be created without a password (see auth docs). */
  password?: string | null;
  role: AccessRole;
  playerId?: string | null;
  displayName?: string | null;
  /** Accounts that register themselves are set up at once; admin-created shells finish setup on their first visit. */
  setupCompletedAt?: Date | null;
}

/**
 * Creates a bare account row. Normal sign-ups go through `registerAccount` (auth/signup.ts),
 * which also creates the player profile in the same transaction; this is the low-level insert.
 */
export async function createUser(db: Db, input: CreateUserInput): Promise<UserRecord> {
  const username = normaliseUsername(input.username);
  const invalid = validateUsername(username);
  if (invalid) throw new UserError(invalid);
  if (await findUserByUsername(db, username)) throw new UserError("That username is already taken.");
  if (input.playerId) {
    const [claimed] = await db.select({ id: users.id }).from(users).where(eq(users.playerId, input.playerId));
    if (claimed) throw new UserError("That player profile is already linked to an account.");
  }
  const [row] = await db
    .insert(users)
    .values({
      username,
      displayName: (input.displayName ?? "").trim() || username,
      passwordHash: input.password ? await hashPassword(input.password) : null,
      role: input.role,
      playerId: input.playerId ?? null,
      setupCompletedAt: input.setupCompletedAt === undefined ? new Date() : input.setupCompletedAt,
    })
    .returning();
  return (await getUser(db, row!.id))!;
}

/**
 * Username + password. An account without a password can never sign in: there is deliberately
 * no username-only login. A temporary password stops working when it expires (and, being
 * replaced by the permanent one, as soon as the player has chosen theirs).
 */
export async function authenticate(db: Db, login: string, password: string, now: Date = new Date()) {
  const user = await findUserByLogin(db, login);
  if (!user || !user.isActive || !user.passwordHash || !password) return null;
  if (user.mustChangePassword && user.temporaryPasswordExpiresAt && user.temporaryPasswordExpiresAt <= now) return null;
  if (!(await verifyPassword(password, user.passwordHash))) return null;
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  return user;
}

export async function updateUser(db: Db, id: string, patch: Partial<{ role: AccessRole; isActive: boolean; displayName: string; playerId: string | null; username: string; setupCompletedAt: Date | null }>) {
  if (patch.playerId) {
    const [claimed] = await db.select({ id: users.id }).from(users).where(and(eq(users.playerId, patch.playerId), sql`${users.id} <> ${id}`));
    if (claimed) throw new UserError("That player profile is already linked to another account.");
  }
  if (patch.username !== undefined) {
    const username = normaliseUsername(patch.username);
    const invalid = validateUsername(username);
    if (invalid) throw new UserError(invalid);
    const other = await findUserByUsername(db, username);
    if (other && other.id !== id) throw new UserError("That username is already taken.");
    patch = { ...patch, username };
  }
  await db.update(users).set({ ...patch, updatedAt: new Date() }).where(eq(users.id, id));
  if (patch.isActive === false) await revokeAllSessions(db, id);
}

/** Sets (or replaces) the user's own permanent password, ends any temporary-password state, and signs the user out of every other device. */
export async function setPassword(db: Db, id: string, password: string, options: { keepSessions?: boolean } = {}) {
  await db.update(users).set({ passwordHash: await hashPassword(password), mustChangePassword: false, temporaryPasswordExpiresAt: null, updatedAt: new Date() }).where(eq(users.id, id));
  if (!options.keepSessions) await revokeAllSessions(db, id);
}

export const TEMPORARY_PASSWORD_DAYS = 7;

/**
 * Admin-issued temporary password (new account or reset): random, stored only as a hash,
 * valid for TEMPORARY_PASSWORD_DAYS, and it must be replaced at the next sign-in. Replaces any
 * previous password and signs the account out everywhere. Returns the plain password once.
 */
export async function setTemporaryPassword(db: Db, id: string, options: { now?: Date; days?: number } = {}): Promise<{ password: string; expiresAt: Date }> {
  const now = options.now ?? new Date();
  const password = temporaryPassword();
  const expiresAt = new Date(now.getTime() + (options.days ?? TEMPORARY_PASSWORD_DAYS) * 86_400_000);
  await db.update(users).set({ passwordHash: await hashPassword(password), mustChangePassword: true, temporaryPasswordExpiresAt: expiresAt, updatedAt: now }).where(eq(users.id, id));
  await revokeAllSessions(db, id);
  return { password, expiresAt };
}

export async function deleteUser(db: Db, id: string) {
  await db.delete(users).where(eq(users.id, id));
}

export interface InviteRecord {
  id: string;
  token: string;
  role: AccessRole;
  /** The account this invite belongs to (admin-created accounts); null for older open invites. */
  userId: string | null;
  username: string | null;
  playerId: string | null;
  playerName: string | null;
  note: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

/** Link-based invites. Optionally bound to a placeholder player profile the invitee will take over. */
export async function createInvite(db: Db, input: { role: AccessRole; userId?: string | null; playerId?: string | null; note?: string; createdByUserId: string | null; days?: number }): Promise<InviteRecord> {
  if (input.playerId && !input.userId) {
    const [claimed] = await db.select({ id: users.id }).from(users).where(eq(users.playerId, input.playerId));
    if (claimed) throw new UserError("That player profile is already linked to an account.");
  }
  const [row] = await db
    .insert(invites)
    .values({
      token: randomToken(),
      role: input.role,
      userId: input.userId ?? null,
      playerId: input.playerId ?? null,
      note: input.note ?? "",
      createdByUserId: input.createdByUserId,
      expiresAt: new Date(Date.now() + (input.days ?? 14) * 86_400_000),
    })
    .returning();
  return (await getInviteById(db, row!.id))!;
}

function inviteRecord(row: typeof invites.$inferSelect, playerName: string | null, username: string | null): InviteRecord {
  return { id: row.id, token: row.token, role: row.role, userId: row.userId, username, playerId: row.playerId, playerName, note: row.note, expiresAt: row.expiresAt, usedAt: row.usedAt, createdAt: row.createdAt };
}

const inviteSelect = { invite: invites, playerName: players.displayName, username: users.username };

async function getInviteById(db: Db, id: string): Promise<InviteRecord | null> {
  const [row] = await db.select(inviteSelect).from(invites).leftJoin(players, eq(players.id, invites.playerId)).leftJoin(users, eq(users.id, invites.userId)).where(eq(invites.id, id));
  return row ? inviteRecord(row.invite, row.playerName ?? null, row.username ?? null) : null;
}

/** The open invites of one account (an admin-created account that has not finished setup). */
export async function listInvitesForUser(db: Db, userId: string): Promise<InviteRecord[]> {
  const rows = await db
    .select(inviteSelect)
    .from(invites)
    .leftJoin(players, eq(players.id, invites.playerId))
    .leftJoin(users, eq(users.id, invites.userId))
    .where(and(eq(invites.userId, userId), isNull(invites.usedAt), gt(invites.expiresAt, new Date())))
    .orderBy(desc(invites.createdAt));
  return rows.map((r) => inviteRecord(r.invite, r.playerName ?? null, r.username ?? null));
}

/** A fresh invite link for an account that has not finished setup; older links for it stop working. */
export async function reissueAccountInvite(db: Db, userId: string, createdByUserId: string | null): Promise<InviteRecord> {
  const user = await getUser(db, userId);
  if (!user) throw new UserError("Account not found.");
  if (user.setupCompletedAt) throw new UserError("That account has already finished its setup; use a password reset instead.");
  await db.delete(invites).where(and(eq(invites.userId, userId), isNull(invites.usedAt)));
  return createInvite(db, { role: user.role, userId, playerId: user.playerId, createdByUserId });
}

export async function listInvites(db: Db, options: { includeUsed?: boolean } = {}): Promise<InviteRecord[]> {
  const rows = await db
    .select(inviteSelect)
    .from(invites)
    .leftJoin(players, eq(players.id, invites.playerId))
    .leftJoin(users, eq(users.id, invites.userId))
    .where(options.includeUsed ? undefined : and(isNull(invites.usedAt), gt(invites.expiresAt, new Date())))
    .orderBy(desc(invites.createdAt));
  return rows.map((r) => inviteRecord(r.invite, r.playerName ?? null, r.username ?? null));
}

export async function getValidInvite(db: Db, token: string): Promise<InviteRecord | null> {
  const [row] = await db.select(inviteSelect).from(invites).leftJoin(players, eq(players.id, invites.playerId)).leftJoin(users, eq(users.id, invites.userId)).where(eq(invites.token, token));
  if (!row) return null;
  if (row.invite.usedAt || row.invite.expiresAt.getTime() < Date.now()) return null;
  return inviteRecord(row.invite, row.playerName ?? null, row.username ?? null);
}

/** Marks an invite used; returns false when it was already used or has expired (race-safe). */
export async function consumeInvite(db: Db, inviteId: string, userId: string): Promise<boolean> {
  const rows = await db
    .update(invites)
    .set({ usedAt: new Date(), usedByUserId: userId })
    .where(and(eq(invites.id, inviteId), isNull(invites.usedAt), gt(invites.expiresAt, new Date())))
    .returning({ id: invites.id });
  return rows.length === 1;
}

/** Accepts an invite with an existing signed-in account (takes over the placeholder profile if any). */
export async function acceptInviteAsExistingUser(db: Db, token: string, userId: string): Promise<void> {
  const invite = await getValidInvite(db, token);
  if (!invite) throw new UserError("This invite link is invalid, used or expired.");
  const user = await getUser(db, userId);
  if (!user) throw new UserError("Account not found.");
  if (invite.playerId) {
    if (user.playerId && user.playerId !== invite.playerId) throw new UserError("Your account is already linked to a different player profile.");
    await updateUser(db, userId, { playerId: invite.playerId });
  }
  if (!(await consumeInvite(db, invite.id, userId))) throw new UserError("This invite link was just used.");
}

export async function revokeInvite(db: Db, id: string) {
  await db.delete(invites).where(eq(invites.id, id));
}
