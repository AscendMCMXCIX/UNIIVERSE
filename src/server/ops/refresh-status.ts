import { eq, sql } from "drizzle-orm";
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

/**
 * Records the start of a job and returns a finish function that records the outcome, or null
 * when the same job is already running (another scheduler fired, or the previous run has not
 * finished). The claim is one atomic statement, so two ticks starting at the same second cannot
 * both run the expensive work; a run that died keeps the key for at most JOB_STALE_RUNNING_MS.
 */
export async function startJobRun(db: Db, key: JobKey, trigger: string, options: { allowConcurrent?: boolean } = {}) {
  const startedAt = new Date();
  const staleBefore = new Date(startedAt.getTime() - JOB_STALE_RUNNING_MS);
  await db.insert(dataRefreshStatus).values({ key, status: "never", updatedAt: startedAt }).onConflictDoNothing();
  const claimed = await db
    .update(dataRefreshStatus)
    .set({ status: "running", lastStartedAt: startedAt, updatedAt: startedAt })
    .where(options.allowConcurrent ? eq(dataRefreshStatus.key, key) : sql`${dataRefreshStatus.key} = ${key} AND (${dataRefreshStatus.status} <> 'running' OR ${dataRefreshStatus.lastStartedAt} IS NULL OR ${dataRefreshStatus.lastStartedAt} < ${staleBefore.toISOString()}::timestamptz)`)
    .returning({ key: dataRefreshStatus.key });
  if (claimed.length === 0) return null;
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
