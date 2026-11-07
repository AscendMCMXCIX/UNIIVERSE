import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { dataRefreshStatus, jobRuns } from "@/server/db/schema";

export type JobKey =
  | "version-check"
  | "static-sync"
  | "integrity"
  | "account-sync"
  | "timeline-backfill"
  | "figures-backfill"
  | "rank-checks"
  | "rank-watch"
  | "auth-audit"
  | "access-audit"
  | "perf-probe"
  | "riot-check"
  | "data-audit"
  | "skin-audit"
  | "proficiency-audit"
  | "rank-audit"
  | "db-usage"
  | "egress"
  | "erasure-reconcile"
  | "history-rescan"
  | "rank-schedule"
  | "rank-schedule-off"
  | "rank-schedule-status"
  | "tick";

export interface JobOutcome {
  ok: boolean;
  summary?: Record<string, unknown>;
  error?: string;
  /** "degraded" marks a partial success (e.g. provider down but last-known-good data retained). */
  degraded?: boolean;
}

/** A run older than this that still says "running" is treated as dead (process killed). */
export const JOB_STALE_RUNNING_MS = 15 * 60_000;

/** What a run that never finished is recorded with, once it is found (status row and run row). */
export const INTERRUPTED_RUN_ERROR = "Run never finished (process was interrupted).";

/**
 * Records the start of a job and returns a finish function that records the outcome, or null
 * when the same job is already running (another scheduler fired, or the previous run has not
 * finished). The claim is one atomic statement, so two ticks starting at the same second cannot
 * both run the expensive work; a run that died keeps the key for at most JOB_STALE_RUNNING_MS.
 *
 * A run that died (a function timeout, a crash) records no outcome, so the claim that takes its
 * key over records it: one more failure in a row, its time and INTERRUPTED_RUN_ERROR, in the same
 * statement (two claims cannot both count it), and its run row is closed as a failed run.
 * Otherwise a job killed on every run would never count as failing anywhere.
 */
export async function startJobRun(db: Db, key: JobKey, trigger: string, options: { allowConcurrent?: boolean } = {}) {
  const startedAt = new Date();
  const staleBefore = new Date(startedAt.getTime() - JOB_STALE_RUNNING_MS);
  const at = startedAt.toISOString();
  await db.insert(dataRefreshStatus).values({ key, status: "never", updatedAt: startedAt }).onConflictDoNothing();
  // Read from the row as it was before this claim (an UPDATE's expressions see the old values).
  const died = sql`(${dataRefreshStatus.status} = 'running' AND (${dataRefreshStatus.lastStartedAt} IS NULL OR ${dataRefreshStatus.lastStartedAt} < ${staleBefore.toISOString()}::timestamptz))`;
  const claimed = await db
    .update(dataRefreshStatus)
    .set({
      status: "running",
      lastStartedAt: startedAt,
      updatedAt: startedAt,
      consecutiveFailures: sql`CASE WHEN ${died} THEN ${dataRefreshStatus.consecutiveFailures} + 1 ELSE ${dataRefreshStatus.consecutiveFailures} END`,
      lastFailureAt: sql`CASE WHEN ${died} THEN ${at}::timestamptz ELSE ${dataRefreshStatus.lastFailureAt} END`,
      lastError: sql`CASE WHEN ${died} THEN ${INTERRUPTED_RUN_ERROR} ELSE ${dataRefreshStatus.lastError} END`,
    })
    .where(options.allowConcurrent ? eq(dataRefreshStatus.key, key) : sql`${dataRefreshStatus.key} = ${key} AND (${dataRefreshStatus.status} <> 'running' OR ${died})`)
    // The failure time is this claim's own start only when it recorded a run that died.
    .returning({ key: dataRefreshStatus.key, tookOverDeadRun: sql<boolean>`coalesce(${dataRefreshStatus.lastFailureAt} = ${at}::timestamptz, false)` });
  if (claimed.length === 0) return null;
  if (claimed[0]!.tookOverDeadRun) await closeInterruptedRuns(db, { job: key, startedBefore: staleBefore, at: startedAt });
  const [run] = await db.insert(jobRuns).values({ job: key, trigger, startedAt }).returning({ id: jobRuns.id });

  return async function finish(outcome: JobOutcome) {
    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();
    await db
      .update(jobRuns)
      .set({ finishedAt, ok: outcome.ok ? "true" : "false", durationMs, summary: outcome.summary ?? {}, error: outcome.error ?? null })
      .where(eq(jobRuns.id, run!.id));
    if (outcome.ok) {
      await db
        .update(dataRefreshStatus)
        .set({
          status: outcome.degraded ? "degraded" : "ok",
          lastSuccessAt: finishedAt,
          lastDurationMs: durationMs,
          lastError: outcome.degraded ? (outcome.error ?? null) : null,
          consecutiveFailures: 0,
          details: outcome.summary ?? {},
          updatedAt: finishedAt,
        })
        .where(eq(dataRefreshStatus.key, key));
    } else {
      await db
        .update(dataRefreshStatus)
        .set({
          status: "failed",
          lastFailureAt: finishedAt,
          lastDurationMs: durationMs,
          lastError: outcome.error ?? "Unknown error",
          consecutiveFailures: sql`${dataRefreshStatus.consecutiveFailures} + 1`,
          details: outcome.summary ?? {},
          updatedAt: finishedAt,
        })
        .where(eq(dataRefreshStatus.key, key));
    }
    return { durationMs };
  };
}

/**
 * Closes the runs that never finished, started before `startedBefore`, as failed runs with
 * INTERRUPTED_RUN_ERROR (their process died, so nothing else ever will): one job's, or every
 * job's. Their duration stays unknown. A run that was only slow and finishes after all still
 * records its own outcome over this one. Returns how many were closed.
 */
export async function closeInterruptedRuns(db: Db, { job, startedBefore, at = new Date() }: { job?: string; startedBefore: Date; at?: Date }): Promise<number> {
  const closed = await db
    .update(jobRuns)
    .set({ finishedAt: at, ok: "false", error: INTERRUPTED_RUN_ERROR })
    .where(and(isNull(jobRuns.finishedAt), lt(jobRuns.startedAt, startedBefore), job ? eq(jobRuns.job, job) : undefined))
    .returning({ id: jobRuns.id });
  return closed.length;
}

/**
 * How many runs of a job have failed in a row, as the alerts count them. Only a run that finishes
 * resets the count, so a job being run again after failing (status "running") still has its
 * failures; and a run that still says "running" past JOB_STALE_RUNNING_MS has died, so it counts
 * already, before the next run or the integrity job records it. A job killed on every run is
 * therefore reported like one that fails on every run.
 */
/**
 * How long run records are kept: 60 days. What reads them looks back far less (Admin → Data
 * health's last 40 runs, the rank audit's 21 days, the two-day freshness digest), and a run's
 * summary or error can name an account, so they are not kept for good (docs/PRIVACY.md).
 */
export const JOB_RUN_KEEP_MS = 60 * 86_400_000;

/** Deletes run records older than JOB_RUN_KEEP_MS, a bounded batch a call (the daily integrity job). */
export async function pruneJobRuns(db: Db, options: { now?: Date; limit?: number } = {}): Promise<number> {
  const now = options.now ?? new Date();
  const batch = db.select({ id: jobRuns.id }).from(jobRuns).where(lt(jobRuns.startedAt, new Date(now.getTime() - JOB_RUN_KEEP_MS))).limit(options.limit ?? 5000);
  const rows = await db.delete(jobRuns).where(inArray(jobRuns.id, batch)).returning({ id: jobRuns.id });
  return rows.length;
}

export function failuresInARow(s: { status: string; consecutiveFailures: number; lastStartedAt: Date | null }, now: number = Date.now()): number {
  if (s.status === "failed") return Math.max(1, s.consecutiveFailures);
  if (s.status !== "running") return 0;
  const died = !s.lastStartedAt || now - s.lastStartedAt.getTime() > JOB_STALE_RUNNING_MS;
  return s.consecutiveFailures + (died ? 1 : 0);
}

/**
 * Jobs of removed features (Draft; Meta & Trends; Clash Scout's accuracy check). Their old status
 * rows stay in the database until a cleanup deletes them, and are left out of every status view
 * and warning.
 */
export const RETIRED_JOB_KEYS: ReadonlySet<string> = new Set(["engine-probe", "data-sufficiency", "ranked-discover", "ranked-ingest", "aggregate", "pro-sync", "trends", "lab-benchmark"]);

/**
 * What every status view reads of a job's status. Not `details` (the last run's whole summary,
 * which is most of the table's size): the shell of every page and every scheduler tick only ask
 * whether the run was skipped, which the database answers (with JavaScript's truthiness, as the
 * warnings always tested `details.skipped`).
 */
export const STATUS_COLUMNS = {
  key: dataRefreshStatus.key,
  status: dataRefreshStatus.status,
  lastStartedAt: dataRefreshStatus.lastStartedAt,
  lastSuccessAt: dataRefreshStatus.lastSuccessAt,
  lastFailureAt: dataRefreshStatus.lastFailureAt,
  lastError: dataRefreshStatus.lastError,
  lastDurationMs: dataRefreshStatus.lastDurationMs,
  consecutiveFailures: dataRefreshStatus.consecutiveFailures,
  skipped: sql<boolean>`coalesce(${dataRefreshStatus.details} -> 'skipped' not in ('false'::jsonb, '0'::jsonb, '""'::jsonb, 'null'::jsonb), false)`,
};

export async function getRefreshStatuses(db: Db) {
  return (await db.select(STATUS_COLUMNS).from(dataRefreshStatus)).filter((s) => !RETIRED_JOB_KEYS.has(s.key));
}
