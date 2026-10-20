import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { blockedFor, clearFailures, recordFailure, resetThrottle, throttleKey } from "@/server/auth/throttle";

let handle: DbHandle;
beforeAll(async () => {
  handle = await testDb();
});
afterAll(async () => {
  await handle.close();
});
beforeEach(async () => {
  await resetThrottle(handle.db);
});

const at = (ms: number) => new Date(1_800_000_000_000 + ms);
type Row = { key_hash: string; at: unknown };
async function rowList(): Promise<Row[]> {
  const result = (await handle.db.execute(sql`SELECT key_hash, at FROM auth_failures ORDER BY id`)) as unknown;
  return ((result as { rows?: Row[] }).rows ?? (result as Row[])) as Row[];
}

describe("login throttle (stored in the database)", () => {
  it("blocks after eight failures inside the window and frees up afterwards", async () => {
    const key = throttleKey("Owner ", "1.2.3.4");
    for (let i = 0; i < 7; i++) await recordFailure(handle.db, [key], at(i * 1000));
    expect(await blockedFor(handle.db, key, at(8000))).toBe(0);
    await recordFailure(handle.db, [key], at(8000));
    // Blocked until the oldest of the eight leaves the 15-minute window.
    expect(await blockedFor(handle.db, key, at(9000))).toBe(15 * 60 - 9);
    expect(await blockedFor(handle.db, key, at(16 * 60 * 1000))).toBe(0);
    expect(await blockedFor(handle.db, throttleKey("other", "1.2.3.4"), at(9000))).toBe(0);
    expect(await blockedFor(handle.db, throttleKey("owner", "5.6.7.8"), at(9000))).toBe(0);
  });

  it("treats usernames case- and space-insensitively, and records several keys at once", async () => {
    for (let i = 0; i < 8; i++) await recordFailure(handle.db, [throttleKey(" OWNER", "1.2.3.4"), throttleKey("*", "1.2.3.4")], at(i));
    expect(await blockedFor(handle.db, throttleKey("owner", "1.2.3.4"), at(10))).toBeGreaterThan(0);
    expect(await blockedFor(handle.db, throttleKey("*", "1.2.3.4"), at(10))).toBeGreaterThan(0);
  });

  it("clears a key on success", async () => {
    const key = throttleKey("someone", null);
    for (let i = 0; i < 8; i++) await recordFailure(handle.db, [key], at(i));
    expect(await blockedFor(handle.db, key, at(1000))).toBeGreaterThan(0);
    await clearFailures(handle.db, key);
    expect(await blockedFor(handle.db, key, at(1000))).toBe(0);
  });

  it("stores only a hash of the key, and deletes failures older than the window", async () => {
    await recordFailure(handle.db, [throttleKey("PrivateName", "203.0.113.7")], at(0));
    const stored = await rowList();
    expect(stored).toHaveLength(1);
    expect(stored[0]!.key_hash).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(stored)).not.toMatch(/privatename|203\.0\.113/i);
    // A failure 16 minutes later prunes the first one.
    await recordFailure(handle.db, [throttleKey("someone-else", "198.51.100.1")], at(16 * 60 * 1000));
    expect(await rowList()).toHaveLength(1);
  });
});
