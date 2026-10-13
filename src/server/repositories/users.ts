import { and, asc, desc, eq, gt, isNull, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { invites, players, users } from "@/server/db/schema";
import { hashPassword, randomToken, verifyPassword } from "@/server/auth/password";
import type { AccessRole } from "@/server/auth/permissions";
import { revokeAllSessions } from "@/server/auth/sessions";

export interface UserRecord {
  id: string;
  username: string;
  /** Legacy, optional: accounts created before usernames existed may carry one. */
  email: string | null;
  displayName: string;
  role: AccessRole;
  playerId: string | null;
  playerName: string | null;
  hasPassword: boolean;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
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

function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toRecord(row: typeof users.$inferSelect, playerName: string | null): UserRecord {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    displayName: row.displayName,
    role: row.role,
    playerId: row.playerId,
    playerName,
    hasPassword: !!row.passwordHash,
    isActive: row.isActive,
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
  };
}

export async function countUsers(db: Db): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(users);
  return Number(row?.n ?? 0);
}

export async function listUsers(db: Db): Promise<UserRecord[]> {
  const rows = await db.select({ user: users, playerName: players.displayName }).from(users).leftJoin(players, eq(players.id, users.playerId)).orderBy(asc(users.createdAt));
  return rows.map((r) => toRecord(r.user, r.playerName ?? null));
}

export async function getUser(db: Db, id: string): Promise<UserRecord | null> {
  const [row] = await db.select({ user: users, playerName: players.displayName }).from(users).leftJoin(players, eq(players.id, users.playerId)).where(eq(users.id, id));
  return row ? toRecord(row.user, row.playerName ?? null) : null;
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

/** Legacy lookup for accounts that still carry an email (recovery script, old sessions). */
export async function findUserByEmail(db: Db, email: string) {
  const value = normaliseEmail(email);
  if (!value) return null;
  const [row] = await db.select().from(users).where(eq(users.email, value));
  return row ?? null;
}

/** Finds an account by username, or by legacy email as a fallback. */
export async function findUserByLogin(db: Db, login: string) {
  return (await findUserByUsername(db, login)) ?? (login.includes("@") ? await findUserByEmail(db, login) : null);
}

export interface CreateUserInput {
  username: string;
  /** Optional: accounts can be created without a password (see auth docs). */
  password?: string | null;
  role: AccessRole;
  playerId?: string | null;
  displayName?: string | null;
  email?: string | null;
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
      email: input.email ? normaliseEmail(input.email) : null,
      displayName: (input.displayName ?? "").trim() || username,
      passwordHash: input.password ? await hashPassword(input.password) : null,
      role: input.role,
      playerId: input.playerId ?? null,
    })
    .returning();
  return (await getUser(db, row!.id))!;
}

/**
 * Username (or legacy email) + password. An account without a password can never sign in this
 * way: there is deliberately no username-only login.
 */
export async function authenticate(db: Db, login: string, password: string) {
  const user = await findUserByLogin(db, login);
  if (!user || !user.isActive || !user.passwordHash || !password) return null;
  if (!(await verifyPassword(password, user.passwordHash))) return null;
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  return user;
}

export async function updateUser(db: Db, id: string, patch: Partial<{ role: AccessRole; isActive: boolean; displayName: string; playerId: string | null; username: string }>) {
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

/** Sets (or replaces) the password and signs the user out of every other device. */
export async function setPassword(db: Db, id: string, password: string, options: { keepSessions?: boolean } = {}) {
  await db.update(users).set({ passwordHash: await hashPassword(password), updatedAt: new Date() }).where(eq(users.id, id));
  if (!options.keepSessions) await revokeAllSessions(db, id);
}

export async function deleteUser(db: Db, id: string) {
  await db.delete(users).where(eq(users.id, id));
}

export interface InviteRecord {
  id: string;
  token: string;
  role: AccessRole;
  playerId: string | null;
  playerName: string | null;
  note: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

/** Link-based invites. Optionally bound to a placeholder player profile the invitee will take over. */
export async function createInvite(db: Db, input: { role: AccessRole; playerId?: string | null; note?: string; createdByUserId: string | null; days?: number }): Promise<InviteRecord> {
  if (input.playerId) {
    const [claimed] = await db.select({ id: users.id }).from(users).where(eq(users.playerId, input.playerId));
    if (claimed) throw new UserError("That player profile is already linked to an account.");
  }
  const [row] = await db
    .insert(invites)
    .values({
      token: randomToken(),
      role: input.role,
      playerId: input.playerId ?? null,
      note: input.note ?? "",
      createdByUserId: input.createdByUserId,
      expiresAt: new Date(Date.now() + (input.days ?? 14) * 86_400_000),
    })
    .returning();
  return (await getInviteById(db, row!.id))!;
}

function inviteRecord(row: typeof invites.$inferSelect, playerName: string | null): InviteRecord {
  return { id: row.id, token: row.token, role: row.role, playerId: row.playerId, playerName, note: row.note, expiresAt: row.expiresAt, usedAt: row.usedAt, createdAt: row.createdAt };
}

async function getInviteById(db: Db, id: string): Promise<InviteRecord | null> {
  const [row] = await db.select({ invite: invites, playerName: players.displayName }).from(invites).leftJoin(players, eq(players.id, invites.playerId)).where(eq(invites.id, id));
  return row ? inviteRecord(row.invite, row.playerName ?? null) : null;
}

export async function listInvites(db: Db, options: { includeUsed?: boolean } = {}): Promise<InviteRecord[]> {
  const rows = await db
    .select({ invite: invites, playerName: players.displayName })
    .from(invites)
    .leftJoin(players, eq(players.id, invites.playerId))
    .where(options.includeUsed ? undefined : and(isNull(invites.usedAt), gt(invites.expiresAt, new Date())))
    .orderBy(desc(invites.createdAt));
  return rows.map((r) => inviteRecord(r.invite, r.playerName ?? null));
}

export async function getValidInvite(db: Db, token: string): Promise<InviteRecord | null> {
  const [row] = await db.select({ invite: invites, playerName: players.displayName }).from(invites).leftJoin(players, eq(players.id, invites.playerId)).where(eq(invites.token, token));
  if (!row) return null;
  if (row.invite.usedAt || row.invite.expiresAt.getTime() < Date.now()) return null;
  return inviteRecord(row.invite, row.playerName ?? null);
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
