import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import type { Db } from "@/server/db/types";
import { dataRefreshStatus, jobRuns } from "@/server/db/schema";
import { JOB_STALE_RUNNING_MS, getRefreshStatuses, startJobRun, type JobKey } from "@/server/ops/refresh-status";
import { getDataHealth } from "@/server/ops/status";
import { runMigrations } from "@/server/db/migrator";
import { runJob } from "@/server/jobs";

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

/** Makes a job's open run look as if its process was killed `minutes` ago: the status row and the run row. */
async function killOpenRun(db: Db, key: JobKey, minutes: number) {
  const at = new Date(Date.now() - minutes * 60_000);
  await db.update(dataRefreshStatus).set({ lastStartedAt: at }).where(eq(dataRefreshStatus.key, key));
  await db.update(jobRuns).set({ startedAt: at }).where(and(eq(jobRuns.job, key), isNull(jobRuns.finishedAt)));
}
const statusOf = async (db: Db, key: string) => (await db.select().from(dataRefreshStatus).where(eq(dataRefreshStatus.key, key)))[0]!;

describe("interrupted runs", () => {
  it("count as failed runs once the next run finds them, so a job killed on every run is reported as failing", async () => {
    const db = handle.db;
    const key: JobKey = "skin-audit";
    // Every run is killed before it finishes (a function timeout, a crash): none records an outcome.
    expect(await startJobRun(db, key, "test")).not.toBeNull();
    for (let killed = 1; killed <= 3; killed++) {
      await killOpenRun(db, key, 20);
      expect(await startJobRun(db, key, "test")).not.toBeNull();
      const s = await statusOf(db, key);
      expect(s.status).toBe("running");
      expect(s.consecutiveFailures).toBe(killed);
      expect(s.lastFailureAt).not.toBeNull();
    }
    // Each run that died is closed as a failed run; only the live one is still open.
    const runs = await db.select().from(jobRuns).where(eq(jobRuns.job, key)).orderBy(asc(jobRuns.id));
    expect(runs.map((r) => r.ok)).toEqual(["false", "false", "false", null]);
    for (const r of runs.slice(0, 3)) {
      expect(r.finishedAt).not.toBeNull();
      expect(r.error).toMatch(/interrupted/);
    }
    // Admin Mode says so while the fourth attempt runs, and once that one has died too.
    expect((await getDataHealth(db)).warnings).toContain(`${key} has failed 3 times in a row`);
    await killOpenRun(db, key, 20);
    expect((await getDataHealth(db)).warnings).toContain(`${key} has failed 4 times in a row`);
    // A run that finishes resets the count.
    const finish = await startJobRun(db, key, "test");
    expect((await statusOf(db, key)).consecutiveFailures).toBe(4);
    await finish!({ ok: true, summary: {} });
    expect((await statusOf(db, key)).consecutiveFailures).toBe(0);
    expect((await getDataHealth(db)).warnings.filter((w) => w.startsWith(key))).toEqual([]);
  });

  it("never count a run of a concurrent job that is still going", async () => {
    const db = handle.db;
    const a = await startJobRun(db, "perf-probe", "test", { allowConcurrent: true });
    const b = await startJobRun(db, "perf-probe", "test", { allowConcurrent: true });
    expect((await statusOf(db, "perf-probe")).consecutiveFailures).toBe(0);
    await a!({ ok: true });
    await b!({ ok: true });
    expect(await db.select().from(jobRuns).where(and(eq(jobRuns.job, "perf-probe"), isNull(jobRuns.finishedAt)))).toEqual([]);
  });

  it("are counted by the daily housekeeping too, which closes every run left open", async () => {
    const db = handle.db;
    const key: JobKey = "db-usage";
    expect(await startJobRun(db, key, "test")).not.toBeNull();
    await killOpenRun(db, key, 40);
    // A run of another job left open long ago, whose status row has moved on since.
    const [orphan] = await db.insert(jobRuns).values({ job: "egress", trigger: "tick", startedAt: new Date(Date.now() - 2 * 86_400_000) }).returning({ id: jobRuns.id });
    const result = await runJob(db, "integrity", "test");
    expect(result.ok).toBe(true);
    expect((result.summary as { unstuck: string[] }).unstuck).toEqual([key]);
    const s = await statusOf(db, key);
    expect(s.status).toBe("failed");
    expect(s.consecutiveFailures).toBe(1);
    expect(s.lastError).toMatch(/interrupted/);
    const closed = await db.select().from(jobRuns).where(inArray(jobRuns.job, [key, "egress"]));
    expect(closed.map((r) => r.id)).toContain(orphan!.id);
    for (const r of closed) {
      expect(r.ok, r.job).toBe("false");
      expect(r.finishedAt, r.job).not.toBeNull();
      expect(r.error, r.job).toMatch(/interrupted/);
    }
    // The next run starts normally and does not count the same run twice.
    const next = await startJobRun(db, key, "test");
    expect((await statusOf(db, key)).consecutiveFailures).toBe(1);
    await next!({ ok: true });
  });
});
