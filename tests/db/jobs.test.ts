import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { dataRefreshStatus } from "@/server/db/schema";
import { JOB_STALE_RUNNING_MS, getRefreshStatuses, startJobRun } from "@/server/ops/refresh-status";
import { getDataHealth } from "@/server/ops/status";
import { runMigrations } from "@/server/db/migrator";

let handle: DbHandle;
beforeAll(async () => {
  handle = await testDb();
});
afterAll(async () => {
  await handle.close();
});

describe("job scheduling guards", () => {
  it("lets only one run of a job start at a time, and frees a run that died", async () => {
    const db = handle.db;
    const first = await startJobRun(db, "account-sync", "test");
    expect(first).not.toBeNull();
    // A second scheduler firing while the first run is active gets nothing to do.
    expect(await startJobRun(db, "account-sync", "test")).toBeNull();
    await first!({ ok: true, summary: {} });
    // Finished: the next run claims normally.
    const third = await startJobRun(db, "account-sync", "test");
    expect(third).not.toBeNull();
    // Simulate a process that died mid-run: the status stays "running" with an old start time.
    await db.update(dataRefreshStatus).set({ lastStartedAt: new Date(Date.now() - JOB_STALE_RUNNING_MS - 1000) }).where(eq(dataRefreshStatus.key, "account-sync"));
    const fourth = await startJobRun(db, "account-sync", "test");
    expect(fourth).not.toBeNull();
    await fourth!({ ok: true, summary: {} });
    await third!({ ok: true, summary: {} });
    // Read-only jobs may overlap.
    const a = await startJobRun(db, "perf-probe", "test", { allowConcurrent: true });
    const b = await startJobRun(db, "perf-probe", "test", { allowConcurrent: true });
    expect(a && b).toBeTruthy();
    await a!({ ok: true });
    await b!({ ok: true });
  });

  it("skips the migration lock and transaction when everything is already applied", async () => {
    const db = handle.db;
    const [before] = await db.select({ n: sql<number>`count(*)` }).from(dataRefreshStatus);
    const result = await runMigrations(db, { useAdvisoryLock: true });
    expect(result.applied).toEqual([]);
    const [after] = await db.select({ n: sql<number>`count(*)` }).from(dataRefreshStatus);
    expect(Number(after!.n)).toBe(Number(before!.n));
  });
});

describe("job status reads", () => {
  it("leave out each run's summary but still know which degraded runs were only skipped", async () => {
    const db = handle.db;
    const at = new Date();
    // A degraded run warns unless its summary says it was skipped (a provider not configured);
    // "skipped" counts as JavaScript would test it: any value but false, 0, "" or null.
    const runs: Array<[string, Record<string, unknown>, boolean]> = [
      ["skip-true", { skipped: true, reason: "x".repeat(5000) }, true],
      ["skip-list", { skipped: [] }, true],
      ["skip-false", { skipped: false }, false],
      ["skip-zero", { skipped: 0 }, false],
      ["skip-empty", { skipped: "" }, false],
      ["skip-null", { skipped: null }, false],
      ["no-flag", { checked: 3 }, false],
    ];
    for (const [key, details] of runs) await db.insert(dataRefreshStatus).values({ key, status: "degraded", lastError: `${key} failed`, lastSuccessAt: at, details, updatedAt: at });
    const statuses = await getRefreshStatuses(db);
    for (const [key, , skipped] of runs) {
      const s = statuses.find((x) => x.key === key)!;
      expect(s.skipped, key).toBe(skipped);
      expect(s, key).not.toHaveProperty("details");
    }
    const { warnings, jobs } = await getDataHealth(db);
    for (const [key, , skipped] of runs) expect(warnings.includes(`${key}: ${key} failed`), key).toBe(!skipped);
    expect(jobs.find((j) => j.key === "skip-true")).not.toHaveProperty("details");
    await db.delete(dataRefreshStatus).where(sql`${dataRefreshStatus.key} like 'skip-%' or ${dataRefreshStatus.key} = 'no-flag'`);
  });
});
