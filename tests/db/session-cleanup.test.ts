import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { auditEvents, authFailures, sessions, users } from "@/server/db/schema";
import { createUser } from "@/server/repositories/users";
import { createSession, deleteEndedSessions, findSession, hashSessionToken } from "@/server/auth/sessions";
import { blockedFor, pruneAuthFailures, recordFailure, throttleKey } from "@/server/auth/throttle";
import { runJob } from "@/server/jobs";

/*
  Retention of sign-in records (privacy notice): the daily housekeeping (integrity job) deletes
  sessions a week after they ended, in bounded batches, and failed sign-ins past the throttling
  window. Live sessions, sessions ended within the week, a throttle block in force and the admin
  activity log are never touched.
*/

let handle: DbHandle;
let userId: string;
const DAY = 86_400_000;
const HOUR = 3_600_000;

async function addSession(token: string, createdAgoMs: number, expiresInMs: number) {
  const now = Date.now();
  await handle.db.insert(sessions).values({ userId, tokenHash: hashSessionToken(token), createdAt: new Date(now - createdAgoMs), lastSeenAt: new Date(now - createdAgoMs), expiresAt: new Date(now + expiresInMs) });
}
const remaining = async () => (await handle.db.select({ hash: sessions.tokenHash }).from(sessions)).map((r) => r.hash);

beforeAll(async () => {
  handle = await testDb();
  const user = await createUser(handle.db, { username: "Retention Ann", password: "a-good-long-passphrase", role: "player" });
  userId = user.id;
});
afterAll(async () => {
  await handle.close();
});

describe("ended sessions", () => {
  it("are deleted a week after they end; live ones and those ended within the week stay", async () => {
    const live = await createSession(handle.db, userId);
    await addSession("s1.ended-yesterday-0000000000000000000000000000000000", 2 * DAY, -1 * DAY);
    await addSession("s1.ended-eight-days-ago-000000000000000000000000000000", 9 * DAY, -8 * DAY);
    // Stored with a long expiry (before the 24-hour rule), but signed in 9 days ago: ended 8 days ago.
    await addSession("s1.legacy-long-ended-0000000000000000000000000000000000", 9 * DAY, 300 * DAY);
    // Signed in 7 days ago, so ended 6 days ago: still within the week.
    await addSession("s1.legacy-long-recent-000000000000000000000000000000000", 7 * DAY, 300 * DAY);
    const audits = (await handle.db.select({ n: sql<number>`count(*)::int` }).from(auditEvents))[0]!.n;

    const result = await runJob(handle.db, "integrity", "cli");
    expect(result.ok).toBe(true);
    expect((result.summary as { endedSessionsDeleted: number }).endedSessionsDeleted).toBe(2);

    const left = await remaining();
    expect(left).toContain(hashSessionToken(live.token));
    expect(left).toContain(hashSessionToken("s1.ended-yesterday-0000000000000000000000000000000000"));
    expect(left).toContain(hashSessionToken("s1.legacy-long-recent-000000000000000000000000000000000"));
    expect(left).not.toContain(hashSessionToken("s1.ended-eight-days-ago-000000000000000000000000000000"));
    expect(left).not.toContain(hashSessionToken("s1.legacy-long-ended-0000000000000000000000000000000000"));
    // The live session still signs in; an ended one never comes back, deleted or not.
    expect(await findSession(handle.db, live.token)).not.toBeNull();
    expect(await findSession(handle.db, "s1.ended-yesterday-0000000000000000000000000000000000")).toBeNull();
    expect(await findSession(handle.db, "s1.ended-eight-days-ago-000000000000000000000000000000")).toBeNull();
    // The admin activity log is not touched.
    expect((await handle.db.select({ n: sql<number>`count(*)::int` }).from(auditEvents))[0]!.n).toBe(audits);
    // A second run finds nothing more.
    expect(await deleteEndedSessions(handle.db)).toBe(0);
  });

  it("are deleted in bounded batches", async () => {
    for (let i = 0; i < 25; i++) await addSession(`s1.batch-${String(i).padStart(2, "0")}-ended-long-ago-000000000000000000000000000`, 30 * DAY, -20 * DAY);
    expect(await deleteEndedSessions(handle.db, { limit: 10 })).toBe(10);
    expect(await deleteEndedSessions(handle.db, { limit: 10 })).toBe(10);
    expect(await deleteEndedSessions(handle.db, { limit: 10 })).toBe(5);
    expect(await deleteEndedSessions(handle.db, { limit: 10 })).toBe(0);
  });
});

describe("failed sign-ins", () => {
  it("past the window are deleted; a block in force stays", async () => {
    const now = new Date();
    const blocked = throttleKey("retention ann", "203.0.113.7");
    for (let i = 0; i < 8; i++) await recordFailure(handle.db, [blocked], now);
    expect(await blockedFor(handle.db, blocked, now)).toBeGreaterThan(0);
    // Left behind when no later failure pruned them: 20 minutes and a day old.
    await handle.db.insert(authFailures).values([
      { keyHash: "old-key-a", at: new Date(now.getTime() - 20 * 60_000) },
      { keyHash: "old-key-b", at: new Date(now.getTime() - 24 * HOUR) },
    ]);
    const result = await runJob(handle.db, "integrity", "cli");
    expect((result.summary as { oldFailedSignInsDeleted: number }).oldFailedSignInsDeleted).toBe(2);
    expect(await handle.db.select().from(authFailures).where(eq(authFailures.keyHash, "old-key-a"))).toHaveLength(0);
    expect(await blockedFor(handle.db, blocked, now)).toBeGreaterThan(0);
    expect(await pruneAuthFailures(handle.db, { now })).toBe(0);
  });
});

describe("the user's other data", () => {
  it("is untouched", async () => {
    expect(await handle.db.select({ id: users.id }).from(users).where(eq(users.id, userId))).toHaveLength(1);
  });
});
