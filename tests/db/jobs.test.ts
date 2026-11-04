import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { dataRefreshStatus, jobRuns } from "@/server/db/schema";
import { INTERRUPTED_RUN_MESSAGE, JOB_STALE_RUNNING_MS, getRefreshStatuses, startJobRun, type JobKey } from "@/server/ops/refresh-status";
import { TICK_JOB_ORDER, defineJob, getJob, runJob, runTick, setScheduleOverrides } from "@/server/jobs";
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

/*
  Failed and interrupted runs. A job that throws is one failed run, not a failed tick; a run whose
  process died keeps its key for a bounded time only; and two schedulers starting at the same
  moment run the work once. Each test sets up and removes its own rows; the first also replaces a
  job definition in the (module-wide) registry and puts the real one back.
*/
describe("failed and interrupted runs", () => {
  it("a tick carries on past a job that throws, records the failure, and the next good run clears it", async () => {
    const db = handle.db;
    // Any job would do; the first in the tick order makes the point best: everything after it still runs.
    const key = TICK_JOB_ORDER[0]!;
    expect(key).not.toBe("integrity");
    const original = getJob(key)!;
    try {
      await db.delete(dataRefreshStatus).where(eq(dataRefreshStatus.key, key));
      // The Riot jobs stay out of this tick (disabled), so nothing here reaches Riot; `force`
      // still runs the two under test.
      await setScheduleOverrides(db, { intervals: { "account-sync": 0, "rank-checks": 0, "timeline-backfill": 0, "figures-backfill": 0 } });
      defineJob({
        ...original,
        run: async () => {
          throw new Error("boom");
        },
      });

      const tick = await runTick(db, "test", { force: [key, "integrity"] });
      expect(tick.ran.map((r) => r.key)).toEqual([key, "integrity"]);
      expect(tick.ran[0]).toMatchObject({ ok: false, error: "boom" });
      // The integrity job did its work (a skipped run would only say so in its summary).
      expect(tick.ran[1]).toMatchObject({ ok: true });
      expect(tick.ran[1]).not.toHaveProperty("skipped");
      expect(tick.ran[1]!.summary).toHaveProperty("unstuck");
      // The failure is recorded where Settings → Data health reads it, and as a finished run.
      const [failed] = await db.select().from(dataRefreshStatus).where(eq(dataRefreshStatus.key, key));
      expect(failed).toMatchObject({ status: "failed", consecutiveFailures: 1, lastError: "boom" });
      expect(failed!.lastFailureAt).toBeInstanceOf(Date);
      const [run] = await db.select().from(jobRuns).where(eq(jobRuns.job, key)).orderBy(desc(jobRuns.id)).limit(1);
      expect(run).toMatchObject({ ok: "false", error: "boom", trigger: "test" });
      expect(run!.finishedAt).toBeInstanceOf(Date);

      // The next good run clears the failure rather than adding to it.
      defineJob({ ...original, run: async () => ({ ok: true, summary: {} }) });
      const next = await runTick(db, "test", { force: [key] });
      expect(next.ran.find((r) => r.key === key)).toMatchObject({ ok: true });
      const [ok] = await db.select().from(dataRefreshStatus).where(eq(dataRefreshStatus.key, key));
      expect(ok).toMatchObject({ status: "ok", consecutiveFailures: 0, lastError: null });
      expect(ok!.lastSuccessAt).toBeInstanceOf(Date);
    } finally {
      defineJob(original);
      await setScheduleOverrides(db, { intervals: {} });
      await db.delete(dataRefreshStatus).where(eq(dataRefreshStatus.key, key));
    }
  });

  it("the integrity job frees a run left running by a dead process and leaves a recent one alone", async () => {
    const db = handle.db;
    const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);
    // What a killed process leaves behind: "running", with the time it started and nothing since.
    const leftRunning = (key: JobKey, lastStartedAt: Date) =>
      db
        .insert(dataRefreshStatus)
        .values({ key, status: "running", lastStartedAt, updatedAt: lastStartedAt })
        .onConflictDoUpdate({ target: dataRefreshStatus.key, set: { status: "running", lastStartedAt, lastError: null, lastFailureAt: null, updatedAt: lastStartedAt } });
    const statusOf = async (key: JobKey) => (await db.select().from(dataRefreshStatus).where(eq(dataRefreshStatus.key, key)))[0]!;
    try {
      // Two thresholds: a claim treats a run as dead after JOB_STALE_RUNNING_MS (15 minutes, the
      // first test above); the housekeeping marks it failed after 30 minutes.
      await leftRunning("account-sync", minutesAgo(31));
      await leftRunning("rank-checks", minutesAgo(5));
      // Five minutes in, someone is running it: a second start is refused.
      expect(await startJobRun(db, "rank-checks", "test")).toBeNull();

      const result = await runJob(db, "integrity", "test");
      expect(result.ok).toBe(true);
      expect((result.summary as { unstuck: string[] }).unstuck).toEqual(["account-sync"]);
      const freed = await statusOf("account-sync");
      expect(freed.status).toBe("failed");
      expect(freed.lastError).toMatch(/interrupted/);
      expect(freed.lastFailureAt).toBeInstanceOf(Date);
      expect(await statusOf("rank-checks")).toMatchObject({ status: "running", lastError: null, lastFailureAt: null });

      // Marked failed, the key is free: the next run claims it.
      const claim = await startJobRun(db, "account-sync", "test");
      expect(claim).not.toBeNull();
      await claim!({ ok: true, summary: {} });
      expect((await statusOf("account-sync")).status).toBe("ok");
    } finally {
      await db.delete(dataRefreshStatus).where(inArray(dataRefreshStatus.key, ["account-sync", "rank-checks"]));
    }
  });

  it("exactly one of two simultaneous starts claims a job, and the key is free again once it finishes", async () => {
    const db = handle.db;
    const recordedRuns = async () => (await db.select({ id: jobRuns.id }).from(jobRuns).where(eq(jobRuns.job, "timeline-backfill"))).length;
    try {
      const before = await recordedRuns();
      const claims = await Promise.all([startJobRun(db, "timeline-backfill", "a"), startJobRun(db, "timeline-backfill", "b")]);
      const claimed = claims.filter((c): c is NonNullable<typeof c> => c !== null);
      expect(claimed).toHaveLength(1);
      // Only the run that got the key is recorded.
      expect(await recordedRuns()).toBe(before + 1);
      expect((await db.select().from(dataRefreshStatus).where(eq(dataRefreshStatus.key, "timeline-backfill")))[0]?.status).toBe("running");

      await claimed[0]!({ ok: true, summary: {} });
      const next = await startJobRun(db, "timeline-backfill", "test");
      expect(next).not.toBeNull();
      await next!({ ok: true, summary: {} });
    } finally {
      await db.delete(dataRefreshStatus).where(eq(dataRefreshStatus.key, "timeline-backfill"));
    }
  });

  it("records a run whose process died when its key is taken over: a failure counted, its open run closed", async () => {
    const db = handle.db;
    const key: JobKey = "figures-backfill";
    const died = new Date(Date.now() - JOB_STALE_RUNNING_MS - 60_000);
    try {
      await db.insert(dataRefreshStatus).values({ key, status: "running", lastStartedAt: died, consecutiveFailures: 0, updatedAt: died }).onConflictDoUpdate({ target: dataRefreshStatus.key, set: { status: "running", lastStartedAt: died, consecutiveFailures: 0, lastError: null, lastFailureAt: null } });
      const [open] = await db.insert(jobRuns).values({ job: key, trigger: "tick", startedAt: died }).returning({ id: jobRuns.id });
      const finish = await startJobRun(db, key, "test");
      expect(finish).not.toBeNull();
      const [taken] = await db.select().from(dataRefreshStatus).where(eq(dataRefreshStatus.key, key));
      expect(taken).toMatchObject({ status: "running", consecutiveFailures: 1, lastError: INTERRUPTED_RUN_MESSAGE });
      expect(taken!.lastFailureAt?.getTime()).toBe(died.getTime());
      const [closed] = await db.select().from(jobRuns).where(eq(jobRuns.id, open!.id));
      expect(closed).toMatchObject({ ok: "false", error: INTERRUPTED_RUN_MESSAGE });
      expect(closed!.finishedAt).toBeInstanceOf(Date);
      // The new run is its own open row, and finishes as usual.
      expect((await db.select().from(jobRuns).where(and(eq(jobRuns.job, key), isNull(jobRuns.finishedAt)))).length).toBe(1);
      await finish!({ ok: true, summary: {} });
      expect((await db.select().from(dataRefreshStatus).where(eq(dataRefreshStatus.key, key)))[0]).toMatchObject({ status: "ok", consecutiveFailures: 0 });
      expect((await db.select().from(jobRuns).where(and(eq(jobRuns.job, key), isNull(jobRuns.finishedAt)))).length).toBe(0);
    } finally {
      await db.delete(jobRuns).where(eq(jobRuns.job, key));
      await db.delete(dataRefreshStatus).where(eq(dataRefreshStatus.key, key));
    }
  });

  it("the housekeeping frees a run after the same time a new run would take its key over, and records it the same way", async () => {
    const db = handle.db;
    const key: JobKey = "timeline-backfill";
    // Between the takeover time and the old 30-minute rule: before, such a run was neither taken over nor freed by the housekeeping.
    const died = new Date(Date.now() - JOB_STALE_RUNNING_MS - 60_000);
    try {
      await db.insert(dataRefreshStatus).values({ key, status: "running", lastStartedAt: died, updatedAt: died }).onConflictDoUpdate({ target: dataRefreshStatus.key, set: { status: "running", lastStartedAt: died, consecutiveFailures: 0, lastError: null, lastFailureAt: null } });
      const [open] = await db.insert(jobRuns).values({ job: key, trigger: "tick", startedAt: died }).returning({ id: jobRuns.id });
      const result = await runJob(db, "integrity", "test");
      expect((result.summary as { unstuck: string[] }).unstuck).toContain(key);
      expect((await db.select().from(dataRefreshStatus).where(eq(dataRefreshStatus.key, key)))[0]).toMatchObject({ status: "failed", consecutiveFailures: 1, lastError: INTERRUPTED_RUN_MESSAGE });
      expect((await db.select().from(jobRuns).where(eq(jobRuns.id, open!.id)))[0]).toMatchObject({ ok: "false", error: INTERRUPTED_RUN_MESSAGE });
    } finally {
      await db.delete(jobRuns).where(eq(jobRuns.job, key));
      await db.delete(dataRefreshStatus).where(eq(dataRefreshStatus.key, key));
    }
  });
});
