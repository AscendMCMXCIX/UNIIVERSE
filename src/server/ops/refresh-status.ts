import { eq, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { dataRefreshStatus, jobRuns } from "@/server/db/schema";

export type JobKey =
  | "version-check"
  | "static-sync"
  | "ranked-discover"
  | "ranked-ingest"
  | "aggregate"
  | "pro-sync"
  | "trends"
  | "integrity"
  | "account-sync"
  | "auth-audit"
  | "tick";

export interface JobOutcome {
  ok: boolean;
  summary?: Record<string, unknown>;
  error?: string;
  /** "degraded" marks a partial success (e.g. provider down but last-known-good data retained). */
  degraded?: boolean;
}

/** Records the start of a job; returns a finish function that records the outcome. */
export async function startJobRun(db: Db, key: JobKey, trigger: string) {
  const startedAt = new Date();
  const [run] = await db.insert(jobRuns).values({ job: key, trigger, startedAt }).returning({ id: jobRuns.id });
  await db
    .insert(dataRefreshStatus)
    .values({ key, status: "running", lastStartedAt: startedAt, updatedAt: startedAt })
    .onConflictDoUpdate({ target: dataRefreshStatus.key, set: { status: "running", lastStartedAt: startedAt, updatedAt: startedAt } });

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

export async function getRefreshStatuses(db: Db) {
  return db.select().from(dataRefreshStatus);
}
