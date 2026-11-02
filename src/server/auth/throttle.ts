import { createHash } from "node:crypto";
import { and, desc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { authFailures } from "@/server/db/schema";

/**
 * Login throttling: a sliding window of failed attempts per key (username + IP, or IP alone),
 * kept in the database (auth_failures) so every server instance sees the same count. Only a
 * SHA-256 hash of the key is stored, never the username or address. The scrypt hash and the fixed
 * delay on failure remain the cost of each guess; this caps how many guesses fit in a window.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 8;

export function throttleKey(login: string, ip: string | null | undefined): string {
  return `${login.trim().toLowerCase()}|${ip ?? "?"}`;
}

function hashKey(key: string): string {
  return createHash("sha256").update(`login-throttle\0${key}`).digest("base64url");
}

/** Seconds to wait before another attempt is allowed, or 0 when the key is not blocked. */
export async function blockedFor(db: Db, key: string, now = new Date()): Promise<number> {
  return waitAfter(db, key, now, MAX_FAILURES);
}

/** Seconds until fewer than `limit` rows of the key are inside the window (0 when already so). */
async function waitAfter(db: Db, key: string, now: Date, limit: number): Promise<number> {
  const recent = await db
    .select({ at: authFailures.at })
    .from(authFailures)
    .where(and(eq(authFailures.keyHash, hashKey(key)), gt(authFailures.at, new Date(now.getTime() - WINDOW_MS))))
    .orderBy(desc(authFailures.at))
    .limit(limit);
  if (recent.length < limit) return 0;
  const oldest = recent[recent.length - 1]!.at.getTime();
  return Math.max(1, Math.ceil((oldest + WINDOW_MS - now.getTime()) / 1000));
}

/**
 * Counts an attempt before it is checked. One row per key is written first and the window is
 * counted with it, so attempts made at the same moment see each other: a burst of parallel
 * requests gets no more tries than the same requests one after another (checking first and
 * recording after the slow password check let every request of a burst through).
 * - `wait` > 0: refused; the attempt's rows are already withdrawn (it was never checked).
 * - Right, or never checked after all (empty fields, an error on the way): call `withdraw()`.
 * - Wrong: do nothing; its rows are its recorded failure.
 */
export async function claimAttempt(db: Db, keys: string[], now = new Date()): Promise<{ wait: number; withdraw: () => Promise<void> }> {
  const ids = (await db.insert(authFailures).values(keys.map((key) => ({ keyHash: hashKey(key), at: now }))).returning({ id: authFailures.id })).map((r) => r.id);
  const withdraw = async () => {
    if (ids.length) await db.delete(authFailures).where(inArray(authFailures.id, ids));
  };
  const wait = Math.max(0, ...(await Promise.all(keys.map((key) => waitAfter(db, key, now, MAX_FAILURES + 1)))));
  if (wait > 0) await withdraw();
  else await db.delete(authFailures).where(lt(authFailures.at, new Date(now.getTime() - WINDOW_MS)));
  return { wait, withdraw };
}

/** Records one failure for each key, and deletes every failure older than the window. */
export async function recordFailure(db: Db, keys: string[], now = new Date()): Promise<void> {
  await db.insert(authFailures).values(keys.map((key) => ({ keyHash: hashKey(key), at: now })));
  await db.delete(authFailures).where(lt(authFailures.at, new Date(now.getTime() - WINDOW_MS)));
}

/**
 * Deletes failures older than the window, at most `limit` per call. New failures already prune
 * them; this catches the rows left when no failure followed (daily housekeeping). Rows inside the
 * window are kept, so a block in force is never lifted by it.
 */
export async function pruneAuthFailures(db: Db, options: { now?: Date; limit?: number } = {}): Promise<number> {
  const now = options.now ?? new Date();
  const batch = db.select({ id: authFailures.id }).from(authFailures).where(lt(authFailures.at, new Date(now.getTime() - WINDOW_MS))).limit(options.limit ?? 5000);
  const rows = await db.delete(authFailures).where(inArray(authFailures.id, batch)).returning({ id: authFailures.id });
  return rows.length;
}

export async function clearFailures(db: Db, key: string): Promise<void> {
  await db.delete(authFailures).where(eq(authFailures.keyHash, hashKey(key)));
}

/** Test hook. */
export async function resetThrottle(db: Db): Promise<void> {
  await db.execute(sql`DELETE FROM auth_failures`);
}
