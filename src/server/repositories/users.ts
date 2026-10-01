import { and, asc, desc, eq, gt, isNull, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { invites, players, users } from "@/server/db/schema";
import { hashPassword, randomToken, verifyPassword } from "@/server/auth/password";
import type { AccessRole } from "@/server/auth/permissions";

export interface UserRecord {
  id: string;
  email: string;
  displayName: string;
  role: AccessRole;
  playerId: string | null;
  playerName: string | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}

export class UserError extends Error {}

function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toRecord(row: typeof users.$inferSelect, playerName: string | null): UserRecord {
  return { id: row.id, email: row.email, displayName: row.displayName, role: row.role, playerId: row.playerId, playerName, isActive: row.isActive, lastLoginAt: row.lastLoginAt, createdAt: row.createdAt };
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

export async function findUserByEmail(db: Db, email: string) {
  const [row] = await db.select().from(users).where(eq(users.email, normaliseEmail(email)));
  return row ?? null;
}

export async function createUser(db: Db, input: { email: string; displayName: string; password: string; role: AccessRole; playerId?: string | null }): Promise<UserRecord> {
  const email = normaliseEmail(input.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new UserError("Enter a valid email address.");
  if (!input.displayName.trim()) throw new UserError("Display name is required.");
  if (await findUserByEmail(db, email)) throw new UserError("An account with that email already exists.");
  if (input.playerId) {
    const [claimed] = await db.select({ id: users.id }).from(users).where(eq(users.playerId, input.playerId));
    if (claimed) throw new UserError("That player profile is already linked to an account.");
  }
  const [row] = await db
    .insert(users)
    .values({ email, displayName: input.displayName.trim(), passwordHash: await hashPassword(input.password), role: input.role, playerId: input.playerId ?? null })
    .returning();
  return (await getUser(db, row!.id))!;
}

export async function authenticate(db: Db, email: string, password: string) {
  const user = await findUserByEmail(db, email);
  if (!user || !user.isActive) return null;
  if (!(await verifyPassword(password, user.passwordHash))) return null;
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  return user;
}

export async function updateUser(db: Db, id: string, patch: Partial<{ role: AccessRole; isActive: boolean; displayName: string; playerId: string | null }>) {
  if (patch.playerId) {
    const [claimed] = await db.select({ id: users.id }).from(users).where(and(eq(users.playerId, patch.playerId), sql`${users.id} <> ${id}`));
    if (claimed) throw new UserError("That player profile is already linked to another account.");
  }
  await db.update(users).set({ ...patch, updatedAt: new Date() }).where(eq(users.id, id));
}

export async function setPassword(db: Db, id: string, password: string) {
  await db.update(users).set({ passwordHash: await hashPassword(password), updatedAt: new Date() }).where(eq(users.id, id));
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
  email: string | null;
  note: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

export async function createInvite(db: Db, input: { role: AccessRole; playerId?: string | null; email?: string | null; note?: string; createdByUserId: string | null; days?: number }): Promise<InviteRecord> {
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
      email: input.email ? normaliseEmail(input.email) : null,
      note: input.note ?? "",
      createdByUserId: input.createdByUserId,
      expiresAt: new Date(Date.now() + (input.days ?? 14) * 86_400_000),
    })
    .returning();
  return (await getInviteById(db, row!.id))!;
}

async function getInviteById(db: Db, id: string): Promise<InviteRecord | null> {
  const [row] = await db.select({ invite: invites, playerName: players.displayName }).from(invites).leftJoin(players, eq(players.id, invites.playerId)).where(eq(invites.id, id));
  return row ? { ...row.invite, playerName: row.playerName ?? null } : null;
}

export async function listInvites(db: Db, options: { includeUsed?: boolean } = {}): Promise<InviteRecord[]> {
  const rows = await db
    .select({ invite: invites, playerName: players.displayName })
    .from(invites)
    .leftJoin(players, eq(players.id, invites.playerId))
    .where(options.includeUsed ? undefined : and(isNull(invites.usedAt), gt(invites.expiresAt, new Date())))
    .orderBy(desc(invites.createdAt));
  return rows.map((r) => ({ ...r.invite, playerName: r.playerName ?? null }));
}

export async function getValidInvite(db: Db, token: string): Promise<InviteRecord | null> {
  const [row] = await db.select({ invite: invites, playerName: players.displayName }).from(invites).leftJoin(players, eq(players.id, invites.playerId)).where(eq(invites.token, token));
  if (!row) return null;
  if (row.invite.usedAt || row.invite.expiresAt.getTime() < Date.now()) return null;
  return { ...row.invite, playerName: row.playerName ?? null };
}

/** Accepts an invite by creating a new account (claiming the linked player profile if any). */
export async function acceptInvite(db: Db, token: string, input: { email: string; displayName: string; password: string }): Promise<UserRecord> {
  const invite = await getValidInvite(db, token);
  if (!invite) throw new UserError("This invite link is invalid, used or expired.");
  const user = await createUser(db, { email: input.email, displayName: input.displayName, password: input.password, role: invite.role, playerId: invite.playerId });
  await db.update(invites).set({ usedAt: new Date(), usedByUserId: user.id }).where(eq(invites.id, invite.id));
  return user;
}

/** Accepts an invite with an existing signed-in account (links the player profile). */
export async function acceptInviteAsExistingUser(db: Db, token: string, userId: string): Promise<void> {
  const invite = await getValidInvite(db, token);
  if (!invite) throw new UserError("This invite link is invalid, used or expired.");
  const user = await getUser(db, userId);
  if (!user) throw new UserError("Account not found.");
  if (invite.playerId) {
    if (user.playerId && user.playerId !== invite.playerId) throw new UserError("Your account is already linked to a different player profile.");
    await updateUser(db, userId, { playerId: invite.playerId });
  }
  await db.update(invites).set({ usedAt: new Date(), usedByUserId: userId }).where(eq(invites.id, invite.id));
}

export async function revokeInvite(db: Db, id: string) {
  await db.delete(invites).where(eq(invites.id, id));
}
