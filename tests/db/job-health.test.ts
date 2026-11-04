import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { dataRefreshStatus } from "@/server/db/schema";
import { GET as health } from "@/app/api/health/route";

/*
  What the owner is told about the data jobs: /api/health (read by every scheduled Data jobs run,
  which fails while `failingJobs` lists anything, so GitHub's email is the alert). Runs that keep
  dying must show there, never as a plain success.
*/

let handle: DbHandle;

beforeAll(async () => {
  handle = await testDb();
  // The health endpoint opens the app's own database handle; this one stands in for it.
  globalThis.__uniiverseDb = Promise.resolve(handle);
});
afterAll(async () => {
  globalThis.__uniiverseDb = undefined;
  await handle.close();
});

async function readHealth() {
  const res = await health();
  return { status: res.status, body: (await res.json()) as { ok: boolean; failingJobs: string[]; jobs: Array<{ key: string }> } };
}

describe("/api/health", () => {
  it("lists a job whose run died, or that is being retried after failing, as failing", async () => {
    const db = handle.db;
    const now = Date.now();
    const rows = [
      // Killed: still says "running" long after any run could have finished.
      { key: "h-dead", status: "running" as const, lastStartedAt: new Date(now - 20 * 60_000), consecutiveFailures: 0 },
      // Failed twice and running again: failing until a run succeeds.
      { key: "h-retrying", status: "running" as const, lastStartedAt: new Date(now - 60_000), consecutiveFailures: 2 },
      { key: "h-failed", status: "failed" as const, lastStartedAt: new Date(now - 60 * 60_000), consecutiveFailures: 1 },
      // Healthy: a first run going, a success and a partial success.
      { key: "h-running", status: "running" as const, lastStartedAt: new Date(now - 60_000), consecutiveFailures: 0 },
      { key: "h-ok", status: "ok" as const, lastStartedAt: new Date(now - 60 * 60_000), consecutiveFailures: 0 },
      { key: "h-degraded", status: "degraded" as const, lastStartedAt: new Date(now - 60 * 60_000), consecutiveFailures: 0 },
    ];
    await db.insert(dataRefreshStatus).values(rows.map((r) => ({ ...r, updatedAt: new Date(now) })));
    const { body } = await readHealth();
    expect(body.failingJobs.filter((k) => k.startsWith("h-")).sort()).toEqual(["h-dead", "h-failed", "h-retrying"]);
    expect(body.jobs.map((j) => j.key)).toEqual(expect.arrayContaining(rows.map((r) => r.key)));
    await db.delete(dataRefreshStatus).where(inArray(dataRefreshStatus.key, rows.map((r) => r.key)));
  });
});
