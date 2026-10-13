import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt, ne } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { sessions, users } from "@/server/db/schema";
import { SESSION_TOUCH_INTERVAL_MS, sessionDays } from "./config";

/**
 * Server-side sessions. The browser only ever holds a random token; the database stores its
 * SHA-256 hash, so neither a database leak nor a log line can be replayed. Logout deletes the
 * row, a password change deletes every row of that user, and expiry is checked on each read.
 */

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Opaque session tokens carry a short prefix so the route proxy can tell them from legacy JWT cookies. */
export const SESSION_TOKEN_PREFIX = "s1.";

export function looksLikeSessionToken(value: string | undefined | null): boolean {
  return !!value && value.startsWith(SESSION_TOKEN_PREFIX) && value.length >= 40;
}

export async function createSession(db: Db, userId: string, options: { remember: boolean; userAgent?: string | null; now?: Date }): Promise<{ token: string; expiresAt: Date }> {
  const now = options.now ?? new Date();
  const token = `${SESSION_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  const expiresAt = new Date(now.getTime() + sessionDays(options.remember) * 86_400_000);
  await db.insert(sessions).values({ userId, tokenHash: hashSessionToken(token), remember: options.remember, userAgent: (options.userAgent ?? "").slice(0, 200), createdAt: now, lastSeenAt: now, expiresAt });
  return { token, expiresAt };
}

export interface SessionLookup {
  sessionId: string;
  userId: string;
  remember: boolean;
  expiresAt: Date;
}

/** Resolves a token to its live session, bumping last-seen at most once per interval. */
export async function findSession(db: Db, token: string, now: Date = new Date()): Promise<SessionLookup | null> {
  if (!looksLikeSessionToken(token)) return null;
  const [row] = await db
    .select({ id: sessions.id, userId: sessions.userId, remember: sessions.remember, expiresAt: sessions.expiresAt, lastSeenAt: sessions.lastSeenAt })
    .from(sessions)
    .where(and(eq(sessions.tokenHash, hashSessionToken(token)), gt(sessions.expiresAt, now)));
  if (!row) return null;
  if (now.getTime() - row.lastSeenAt.getTime() > SESSION_TOUCH_INTERVAL_MS) await db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, row.id));
  return { sessionId: row.id, userId: row.userId, remember: row.remember, expiresAt: row.expiresAt };
}

export async function revokeSession(db: Db, token: string): Promise<void> {
  if (!looksLikeSessionToken(token)) return;
  await db.delete(sessions).where(eq(sessions.tokenHash, hashSessionToken(token)));
}

/** Signs the user out everywhere (password change, reset, deactivation). */
export async function revokeAllSessions(db: Db, userId: string): Promise<number> {
  const rows = await db.delete(sessions).where(eq(sessions.userId, userId)).returning({ id: sessions.id });
  return rows.length;
}

/** Signs the user out of every device except the one holding `keepToken` (after choosing a new password). */
export async function revokeOtherSessions(db: Db, userId: string, keepToken: string | null | undefined): Promise<number> {
  const keep = keepToken && looksLikeSessionToken(keepToken) ? hashSessionToken(keepToken) : null;
  const rows = await db
    .delete(sessions)
    .where(keep ? and(eq(sessions.userId, userId), ne(sessions.tokenHash, keep)) : eq(sessions.userId, userId))
    .returning({ id: sessions.id });
  return rows.length;
}

export async function purgeExpiredSessions(db: Db, now: Date = new Date()): Promise<number> {
  const rows = await db.delete(sessions).where(lt(sessions.expiresAt, now)).returning({ id: sessions.id });
  return rows.length;
}

export async function countSessions(db: Db, userId: string): Promise<number> {
  return (await db.select({ id: sessions.id }).from(sessions).where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, new Date())))).length;
}

export async function userExists(db: Db, userId: string): Promise<boolean> {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId));
  return !!row;
}
