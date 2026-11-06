import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { desc, eq, sql } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { champions, dataRefreshStatus, jobRuns } from "@/server/db/schema";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { getCurrentPatchRow, syncStaticData } from "@/server/riot/static/sync";
import { runJob } from "@/server/jobs";
import { getDataHealth } from "@/server/ops/status";

/*
  The version-check job while Data Dragon cannot be reached. The job builds its DataDragonProvider
  inside each run on the global fetch, so a fetch that refuses every connection is what an outage
  looks like to it. What must hold: the run finishes "degraded", not failed (nothing is wrong with
  the site); the champions and patch already stored stay as they were (last known good); and
  Settings → Data health shows the provider's message as a warning.
*/

let handle: DbHandle;
const unreachable = vi.fn<typeof fetch>(async () => {
  throw new Error("ECONNREFUSED");
});

beforeAll(async () => {
  handle = await testDb();
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
  vi.stubGlobal("fetch", unreachable);
}, 60_000);
afterAll(async () => {
  vi.unstubAllGlobals();
  await handle.close();
});

const championCount = async () => Number((await handle.db.select({ n: sql<number>`count(*)` }).from(champions))[0]!.n);

describe("version-check with Data Dragon unreachable", () => {
  it("finishes degraded, keeps the last known good data and warns in Data health", async () => {
    const db = handle.db;
    const before = { champions: await championCount(), patch: await getCurrentPatchRow(db) };
    expect(before.champions).toBeGreaterThan(0);
    expect(before.patch).not.toBeNull();

    const result = await runJob(db, "version-check", "test");
    // The job really asked Data Dragon for its versions list and got no answer.
    expect(unreachable).toHaveBeenCalled();
    expect(String(unreachable.mock.calls[0]![0])).toMatch(/\/api\/versions\.json$/);
    expect(result.ok).toBe(true);
    expect(result.degraded).toBe(true);
    expect(result.error).toMatch(/^Provider unavailable: Could not reach Data Dragon \(.*\/api\/versions\.json\): ECONNREFUSED\. Existing data preserved\.$/);
    expect(result.summary).toMatchObject({ changed: false, usedFixture: false, version: null, patch: null, championsUpserted: 0 });

    // Last known good: nothing stored moved.
    expect(await championCount()).toBe(before.champions);
    expect(await getCurrentPatchRow(db)).toEqual(before.patch);

    // Recorded as a degraded success: the warning carries the provider's message, no failure is counted.
    const [status] = await db.select().from(dataRefreshStatus).where(eq(dataRefreshStatus.key, "version-check"));
    expect(status).toMatchObject({ status: "degraded", lastError: result.error, consecutiveFailures: 0, lastFailureAt: null });
    expect(status!.lastSuccessAt).toBeInstanceOf(Date);
    const [run] = await db.select().from(jobRuns).where(eq(jobRuns.job, "version-check")).orderBy(desc(jobRuns.id)).limit(1);
    expect(run).toMatchObject({ ok: "true", error: result.error, trigger: "test" });

    const health = await getDataHealth(db);
    expect(health.warnings).toContain(`version-check: ${result.error}`);
    expect(health.jobs.find((j) => j.key === "version-check")).toMatchObject({ status: "degraded", lastError: result.error, consecutiveFailures: 0 });
  });
});
