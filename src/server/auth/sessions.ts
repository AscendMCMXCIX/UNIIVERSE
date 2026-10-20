import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, inArray, lt, ne, or } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { sessions, users } from "@/server/db/schema";
import { SESSION_MAX_AGE_MS, SESSION_TOUCH_INTERVAL_MS } from "./config";

/**
 * Server-side sessions. The browser only ever holds a random token; the database stores its
 * SHA-256 hash, so neither a database leak nor a log line can be replayed. Logout deletes the
 * row, a password change deletes every row of that user, and expiry is checked on each read.
 * Every session ends 24 hours after sign-in, whatever its stored expiry (rows from before the
 * 24-hour rule carried 30 or 365 days).
 */

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Opaque session tokens carry a short prefix so the route proxy can tell them from legacy JWT cookies. */
export const SESSION_TOKEN_PREFIX = "s1.";

export function looksLikeSessionToken(value: string | undefined | null): boolean {
  return !!value && value.startsWith(SESSION_TOKEN_PREFIX) && value.length >= 40;
}

export async function createSession(db: Db, userId: string, options: { userAgent?: string | null; now?: Date } = {}): Promise<{ token: string; expiresAt: Date }> {
  const now = options.now ?? new Date();
  const token = `${SESSION_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  const expiresAt = new Date(now.getTime() + SESSION_MAX_AGE_MS);
  await db.insert(sessions).values({ userId, tokenHash: hashSessionToken(token), remember: false, userAgent: (options.userAgent ?? "").slice(0, 200), createdAt: now, lastSeenAt: now, expiresAt });
  return { token, expiresAt };
}

/** Sessions created before this moment are over: everyone signs in again every 24 hours. */
function signInCutoff(now: Date): Date {
  return new Date(now.getTime() - SESSION_MAX_AGE_MS);
}

export interface SessionLookup {
  sessionId: string;
  userId: string;
  expiresAt: Date;
}

/** Resolves a token to its live session, bumping last-seen at most once per interval. */
export async function findSession(db: Db, token: string, now: Date = new Date()): Promise<SessionLookup | null> {
  if (!looksLikeSessionToken(token)) return null;
  const [row] = await db
    .select({ id: sessions.id, userId: sessions.userId, expiresAt: sessions.expiresAt, lastSeenAt: sessions.lastSeenAt })
    .from(sessions)
    .where(and(eq(sessions.tokenHash, hashSessionToken(token)), gt(sessions.expiresAt, now), gt(sessions.createdAt, signInCutoff(now))));
  if (!row) return null;
  if (now.getTime() - row.lastSeenAt.getTime() > SESSION_TOUCH_INTERVAL_MS) await db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, row.id));
  return { sessionId: row.id, userId: row.userId, expiresAt: row.expiresAt };
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

/** How long an ended session is kept before the daily housekeeping deletes it (privacy notice). */
export const ENDED_SESSION_KEEP_MS = 7 * 24 * 3_600_000;

/**
 * Deletes sessions that ended more than ENDED_SESSION_KEEP_MS ago, at most `limit` per call (the
 * daily housekeeping job runs it, so a backlog clears over a few days). A session ends at its
 * expiry or 24 hours after sign-in, whichever comes first, and findSession refuses it from then on,
 * so deleting it later changes nothing for anyone signed in. Live sessions, and sessions that ended
 * within the week, are never touched.
 */
export async function deleteEndedSessions(db: Db, options: { now?: Date; limit?: number } = {}): Promise<number> {
  const now = options.now ?? new Date();
  const endedBefore = new Date(now.getTime() - ENDED_SESSION_KEEP_MS);
  const ended = or(lt(sessions.expiresAt, endedBefore), lt(sessions.createdAt, signInCutoff(endedBefore)));
  const batch = db.select({ id: sessions.id }).from(sessions).where(ended).limit(options.limit ?? 1000);
  const rows = await db.delete(sessions).where(inArray(sessions.id, batch)).returning({ id: sessions.id });
  return rows.length;
}

export async function countSessions(db: Db, userId: string): Promise<number> {
  const now = new Date();
  return (await db.select({ id: sessions.id }).from(sessions).where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, now), gt(sessions.createdAt, signInCutoff(now))))).length;
}

export async function userExists(db: Db, userId: string): Promise<boolean> {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId));
  return !!row;
}
