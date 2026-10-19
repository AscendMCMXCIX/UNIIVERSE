import { createHash } from "node:crypto";
import { and, desc, eq, gt, lt, sql } from "drizzle-orm";
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
  const recent = await db
    .select({ at: authFailures.at })
    .from(authFailures)
    .where(and(eq(authFailures.keyHash, hashKey(key)), gt(authFailures.at, new Date(now.getTime() - WINDOW_MS))))
    .orderBy(desc(authFailures.at))
    .limit(MAX_FAILURES);
  if (recent.length < MAX_FAILURES) return 0;
  const oldest = recent[recent.length - 1]!.at.getTime();
  return Math.max(1, Math.ceil((oldest + WINDOW_MS - now.getTime()) / 1000));
}

/** Records one failure for each key, and deletes every failure older than the window. */
export async function recordFailure(db: Db, keys: string[], now = new Date()): Promise<void> {
  await db.insert(authFailures).values(keys.map((key) => ({ keyHash: hashKey(key), at: now })));
  await db.delete(authFailures).where(lt(authFailures.at, new Date(now.getTime() - WINDOW_MS)));
}

export async function clearFailures(db: Db, key: string): Promise<void> {
  await db.delete(authFailures).where(eq(authFailures.keyHash, hashKey(key)));
}

/** Test hook. */
export async function resetThrottle(db: Db): Promise<void> {
  await db.execute(sql`DELETE FROM auth_failures`);
}
