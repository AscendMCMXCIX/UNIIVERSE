import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { appSettings, dataRefreshStatus } from "@/server/db/schema";
import { listJobs, runJob, type RunJobResult } from "./registry";
import type { JobKey } from "@/server/ops/refresh-status";

export interface ScheduleOverrides {
  /** job key → interval in minutes (0 disables). */
  intervals: Partial<Record<JobKey, number>>;
}

export async function getScheduleOverrides(db: Db): Promise<ScheduleOverrides> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, "schedule"));
  const value = (row?.value ?? {}) as Partial<ScheduleOverrides>;
  return { intervals: value.intervals ?? {} };
}

export async function setScheduleOverrides(db: Db, overrides: ScheduleOverrides): Promise<void> {
  await db
    .insert(appSettings)
    .values({ key: "schedule", value: overrides, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: overrides, updatedAt: new Date() } });
}

/** Order matters: static data before ingestion, ingestion before aggregation, aggregation before trends. */
const TICK_ORDER: JobKey[] = ["version-check", "ranked-discover", "ranked-ingest", "pro-sync", "aggregate", "trends", "integrity"];

/**
 * Scheduler tick: runs every job whose interval has elapsed, in dependency order, within a time
 * budget. Any external scheduler that can hit a URL every few minutes is enough; the intervals
 * themselves live in Settings and need no deployment to change.
 */
export async function runTick(db: Db, trigger: string, options: { budgetMs?: number; force?: JobKey[] } = {}): Promise<{ ran: RunJobResult[]; skipped: string[] }> {
  const budgetMs = options.budgetMs ?? 240_000;
  const started = Date.now();
  const overrides = await getScheduleOverrides(db);
  const statuses = await db.select().from(dataRefreshStatus);
  const statusByKey = new Map(statuses.map((s) => [s.key, s]));
  const jobs = new Map(listJobs().map((j) => [j.key, j]));
  const ran: RunJobResult[] = [];
  const skipped: string[] = [];

  for (const key of TICK_ORDER) {
    const def = jobs.get(key);
    if (!def) continue;
    const interval = overrides.intervals[key] ?? def.defaultIntervalMinutes;
    const forced = options.force?.includes(key) ?? false;
    if (!forced && (interval === null || interval <= 0)) {
      skipped.push(`${key}: disabled`);
      continue;
    }
    const status = statusByKey.get(key);
    const last = status?.lastSuccessAt?.getTime() ?? 0;
    const lastAttempt = Math.max(last, status?.lastFailureAt?.getTime() ?? 0);
    const due = forced || Date.now() - lastAttempt >= (interval ?? 0) * 60_000;
    if (!due) {
      skipped.push(`${key}: not due`);
      continue;
    }
    if (status?.status === "running" && status.lastStartedAt && Date.now() - status.lastStartedAt.getTime() < 15 * 60_000) {
      skipped.push(`${key}: already running`);
      continue;
    }
    const remaining = budgetMs - (Date.now() - started);
    if (remaining < 5_000) {
      skipped.push(`${key}: out of time budget`);
      continue;
    }
    ran.push(await runJob(db, key, trigger, { budgetMs: Math.min(remaining - 2_000, 180_000) }));
  }
  return { ran, skipped };
}
