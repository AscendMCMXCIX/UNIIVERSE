import { desc, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { dataRefreshStatus, jobRuns, matchFetchQueue, rankedMatches } from "@/server/db/schema";
import { deploymentInfo } from "./deployment";

export interface Diagnostics {
  build: { commit: string | null; region: string | null; node: string; uptimeSeconds: number; memoryMb: number };
  db: { pingMs: number; description: string; poolMax: number };
  recentRuns: Array<{ id: number; job: string; trigger: string; startedAt: Date; durationMs: number | null; ok: boolean | null; error: string | null }>;
  jobs: Array<{ key: string; status: string; lastSuccessAt: Date | null; lastDurationMs: number | null; consecutiveFailures: number; lastError: string | null }>;
  queue: { pending: number; failed: number; unaggregated: number };
  recentErrors: Array<{ job: string; at: Date; error: string }>;
  /** Longest-running jobs in the last 24 hours. */
  slowestRuns: Array<{ job: string; durationMs: number; at: Date }>;
}

/**
 * Owner-only operational snapshot: which build answers, how fast the database responds from
 * here, recent job durations and errors, backlog. Cheap (status tables and the last few job
 * runs), never touches external providers, never includes secrets.
 */
export async function getDiagnostics(db: Db, description: string): Promise<Diagnostics> {
  const t = performance.now();
  await db.execute(sql`select 1`);
  const pingMs = Math.round((performance.now() - t) * 10) / 10;
  const since = new Date(Date.now() - 86_400_000);
  const [runs, statuses, queue, unagg] = await Promise.all([
    db.select({ id: jobRuns.id, job: jobRuns.job, trigger: jobRuns.trigger, startedAt: jobRuns.startedAt, durationMs: jobRuns.durationMs, ok: jobRuns.ok, error: jobRuns.error }).from(jobRuns).orderBy(desc(jobRuns.startedAt)).limit(40),
    db.select().from(dataRefreshStatus),
    db.select({ status: matchFetchQueue.status, n: sql<number>`count(*)` }).from(matchFetchQueue).groupBy(matchFetchQueue.status),
    db.select({ n: sql<number>`count(*)` }).from(rankedMatches).where(sql`${rankedMatches.aggregatedAt} is null`),
  ]);
  const q = (s: string) => Number(queue.find((r) => r.status === s)?.n ?? 0);
  const info = deploymentInfo();
  return {
    build: { commit: info.commit, region: info.region, node: process.version, uptimeSeconds: Math.round(process.uptime()), memoryMb: Math.round(process.memoryUsage().rss / 1048576) },
    db: { pingMs, description, poolMax: Number(process.env.DATABASE_POOL_MAX ?? 5) },
    recentRuns: runs.slice(0, 15).map((r) => ({ ...r, ok: r.ok === null ? null : r.ok === "true" })),
    jobs: statuses.map((s) => ({ key: s.key, status: s.status, lastSuccessAt: s.lastSuccessAt, lastDurationMs: s.lastDurationMs, consecutiveFailures: s.consecutiveFailures, lastError: s.lastError })),
    queue: { pending: q("pending"), failed: q("failed"), unaggregated: Number(unagg[0]?.n ?? 0) },
    recentErrors: runs.filter((r) => r.error).slice(0, 8).map((r) => ({ job: r.job, at: r.startedAt, error: r.error! })),
    slowestRuns: runs.filter((r) => r.durationMs !== null && r.startedAt > since).sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0)).slice(0, 5).map((r) => ({ job: r.job, durationMs: r.durationMs!, at: r.startedAt })),
  };
}
