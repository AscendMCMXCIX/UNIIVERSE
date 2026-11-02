import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { blockedFor, claimAttempt, clearFailures, recordFailure, resetThrottle, throttleKey } from "@/server/auth/throttle";

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

describe("attempts counted before they are checked", () => {
  it("lets no more of a parallel burst through than of the same attempts one after another", async () => {
    const keys = [throttleKey("owner", "9.9.9.9"), throttleKey("*", "9.9.9.9")];
    // Twenty wrong guesses at once: each claims its rows first, so at most eight see room.
    const results = await Promise.all(Array.from({ length: 20 }, () => claimAttempt(handle.db, keys, at(0))));
    expect(results.filter((r) => r.wait === 0).length).toBeLessThanOrEqual(8);
    // The refused ones left nothing behind (all twenty may be refused when they all claim before
    // any counts: then no guess was checked at all); the ones let through stay as failures.
    const through = results.filter((r) => r.wait === 0).length;
    expect(await rowList()).toHaveLength(through * keys.length);
  });

  it("refuses the ninth of nine simultaneous attempts after eight failures, as one after another", async () => {
    const key = throttleKey("owner", "7.7.7.7");
    for (let i = 0; i < 8; i++) await recordFailure(handle.db, [key], at(i));
    const burst = await Promise.all(Array.from({ length: 5 }, () => claimAttempt(handle.db, [key], at(100))));
    expect(burst.every((r) => r.wait > 0)).toBe(true);
    expect(await rowList()).toHaveLength(8);
  });

  it("withdraws a right attempt and a refused one, and keeps a wrong one", async () => {
    const key = throttleKey("member", "8.8.8.8");
    const right = await claimAttempt(handle.db, [key], at(0));
    expect(right.wait).toBe(0);
    await right.succeeded();
    expect(await rowList()).toEqual([]);
    for (let i = 0; i < 8; i++) expect((await claimAttempt(handle.db, [key], at(i + 1))).wait).toBe(0); // eight wrong ones stay
    const refused = await claimAttempt(handle.db, [key], at(20));
    // Until the first of the eight (at 1 ms) leaves the 15-minute window, from 20 ms: 899.981 s.
    expect(refused.wait).toBe(15 * 60);
    expect(await rowList()).toHaveLength(8);
  });
});
