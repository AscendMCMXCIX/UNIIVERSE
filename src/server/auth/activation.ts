import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { activationCodes, users } from "@/server/db/schema";
import { findUserByUsername, UserError } from "@/server/repositories/users";

/*
  Passwordless sign-in for players: single-use activation codes.

  - 12 characters from a 31-symbol alphabet without look-alikes (≈ 59 bits), shown once as
    XXXX-XXXX-XXXX. Only the SHA-256 hash is stored; a code that cannot be guessed needs no slow
    hash, and the hash makes a database leak useless.
  - Expires after ACTIVATION_CODE_DAYS, is consumed atomically (a second use, or two racing
    uses, fail), and is burned after MAX_CODE_ATTEMPTS wrong guesses against its account.
  - Issuing a new code revokes the account's unused ones. Deactivated accounts cannot redeem.
  - Admin accounts that have a password never accept codes: their sign-in stays the password,
    so nobody can take over an admin by issuing a code.
*/

export const ACTIVATION_CODE_DAYS = 7;
export const MAX_CODE_ATTEMPTS = 5;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".replace("L", ""); // 31 symbols, no 0/O/1/I/L
const CODE_LENGTH = 12;

export function generateActivationCode(): string {
  let raw = "";
  for (let i = 0; i < CODE_LENGTH; i++) raw += ALPHABET[randomInt(ALPHABET.length)];
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
}

/** What the player typed, in canonical form: case, spaces and dashes do not matter. */
export function normaliseActivationCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** True when the input has the shape of an activation code (so the login form can tell it from a password). */
export function looksLikeActivationCode(input: string): boolean {
  const n = normaliseActivationCode(input);
  return n.length === CODE_LENGTH && [...n].every((c) => ALPHABET.includes(c));
}

export function hashActivationCode(code: string): string {
  return createHash("sha256").update(`uniiverse-activation:${normaliseActivationCode(code)}`).digest("hex");
}

/** Whether codes may be issued to this account (players, and admins who have not set a password yet). */
export function acceptsActivationCodes(user: { role: string; passwordHash?: string | null; hasPassword?: boolean }): boolean {
  const hasPassword = user.hasPassword ?? !!user.passwordHash;
  return !(user.role === "owner" && hasPassword);
}

export interface IssuedCode {
  code: string;
  expiresAt: Date;
}

/** Issues a fresh code for an account and revokes its unused ones. The plain code is returned once and never stored. */
export async function issueActivationCode(db: Db, userId: string, createdByUserId: string | null, options: { now?: Date; days?: number } = {}): Promise<IssuedCode> {
  const now = options.now ?? new Date();
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) throw new UserError("Account not found.");
  if (!user.isActive) throw new UserError("This account is deactivated. Reactivate it first.");
  if (!acceptsActivationCodes(user)) throw new UserError("Admin accounts with a password sign in with their password; activation codes are for players.");
  const code = generateActivationCode();
  const expiresAt = new Date(now.getTime() + (options.days ?? ACTIVATION_CODE_DAYS) * 86_400_000);
  await db.transaction(async (tx) => {
    await tx.update(activationCodes).set({ revokedAt: now }).where(and(eq(activationCodes.userId, userId), isNull(activationCodes.usedAt), isNull(activationCodes.revokedAt)));
    await tx.insert(activationCodes).values({ userId, codeHash: hashActivationCode(code), createdByUserId, createdAt: now, expiresAt });
  });
  return { code, expiresAt };
}

export interface CodeStatus {
  state: "none" | "open" | "expired" | "used" | "locked";
  expiresAt: Date | null;
  createdAt: Date | null;
}

/** The latest code of an account, for the admin view (never the code itself). */
export async function activationCodeStatus(db: Db, userId: string, now: Date = new Date()): Promise<CodeStatus> {
  const [row] = await db.select().from(activationCodes).where(eq(activationCodes.userId, userId)).orderBy(desc(activationCodes.createdAt)).limit(1);
  if (!row) return { state: "none", expiresAt: null, createdAt: null };
  const state = row.usedAt ? "used" : row.revokedAt ? (row.failedAttempts >= MAX_CODE_ATTEMPTS ? "locked" : "expired") : row.expiresAt <= now ? "expired" : "open";
  return { state, expiresAt: row.expiresAt, createdAt: row.createdAt };
}

export type RedeemResult = { ok: true; user: typeof users.$inferSelect } | { ok: false; reason: "invalid" | "locked" };

function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Username + activation code → the account, exactly once. A wrong code counts against the
 * account's open code and burns it after MAX_CODE_ATTEMPTS; the right code is consumed in one
 * conditional UPDATE, so a replay or a race finds nothing to consume. A legacy player password
 * is cleared on the first successful redemption: from then on the player is passwordless.
 */
export async function redeemActivationCode(db: Db, username: string, code: string, now: Date = new Date()): Promise<RedeemResult> {
  const hash = hashActivationCode(code);
  const user = await findUserByUsername(db, username);
  if (!user || !user.isActive || !acceptsActivationCodes(user)) return { ok: false, reason: "invalid" };
  const [open] = await db
    .select()
    .from(activationCodes)
    .where(and(eq(activationCodes.userId, user.id), isNull(activationCodes.usedAt), isNull(activationCodes.revokedAt), gt(activationCodes.expiresAt, now)))
    .orderBy(desc(activationCodes.createdAt))
    .limit(1);
  if (!open) return { ok: false, reason: "invalid" };
  if (!sameHash(open.codeHash, hash)) {
    const [after] = await db
      .update(activationCodes)
      .set({ failedAttempts: sql`${activationCodes.failedAttempts} + 1` })
      .where(eq(activationCodes.id, open.id))
      .returning({ failedAttempts: activationCodes.failedAttempts });
    if ((after?.failedAttempts ?? 0) >= MAX_CODE_ATTEMPTS) {
      await db.update(activationCodes).set({ revokedAt: now }).where(and(eq(activationCodes.id, open.id), isNull(activationCodes.revokedAt)));
      return { ok: false, reason: "locked" };
    }
    return { ok: false, reason: "invalid" };
  }
  const consumed = await db
    .update(activationCodes)
    .set({ usedAt: now })
    .where(and(eq(activationCodes.id, open.id), isNull(activationCodes.usedAt), isNull(activationCodes.revokedAt), gt(activationCodes.expiresAt, now), lt(activationCodes.failedAttempts, MAX_CODE_ATTEMPTS)))
    .returning({ id: activationCodes.id });
  if (consumed.length !== 1) return { ok: false, reason: "invalid" };
  const patch: Partial<typeof users.$inferInsert> = { lastLoginAt: now, updatedAt: now };
  if (user.role !== "owner") patch.passwordHash = null;
  await db.update(users).set(patch).where(eq(users.id, user.id));
  return { ok: true, user: { ...user, ...patch } as typeof users.$inferSelect };
}

/** Revokes every unused code of an account (deactivation, deletion). */
export async function revokeActivationCodes(db: Db, userId: string, now: Date = new Date()): Promise<void> {
  await db.update(activationCodes).set({ revokedAt: now }).where(and(eq(activationCodes.userId, userId), isNull(activationCodes.usedAt), isNull(activationCodes.revokedAt)));
}
