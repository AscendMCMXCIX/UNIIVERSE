import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { appSettings, dataRefreshStatus } from "@/server/db/schema";
import { listJobs, runJob, type RunJobResult } from "./registry";
import type { JobKey } from "@/server/ops/refresh-status";
import { renewTickLease } from "./background";

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

/**
 * Order matters: static data first, then our own players' accounts (what the team looks at),
 * housekeeping, then the two backfills last with small capped slices: the timelines (Matchups)
 * and the older games' extra figures (multikills), a few requests an hour each against the same
 * Riot limits.
 */
const TICK_ORDER: JobKey[] = ["version-check", "account-sync", "integrity", "timeline-backfill", "figures-backfill"];

/** Budget caps inside one tick, so one job cannot take the whole tick. */
const MAX_JOB_MS: Partial<Record<JobKey, number>> = { "account-sync": 75_000, integrity: 20_000, "timeline-backfill": 25_000, "figures-backfill": 25_000 };

/** How long a job may run inside a tick with `remainingMs` left. */
export function tickJobBudget(key: JobKey, remainingMs: number): number {
  return Math.min(remainingMs - 2_000, 180_000, MAX_JOB_MS[key] ?? Infinity);
}

/** Tick order, exported for tests. */
export const TICK_JOB_ORDER: readonly JobKey[] = TICK_ORDER;

/**
 * Scheduler tick: runs every job whose interval has elapsed, in dependency order, within a time
 * budget. Any external scheduler that can hit a URL every few minutes is enough; the intervals
 * themselves live in Settings and need no deployment to change.
 */
export async function runTick(db: Db, trigger: string, options: { budgetMs?: number; force?: JobKey[]; leaseClaimed?: boolean } = {}): Promise<{ ran: RunJobResult[]; skipped: string[] }> {
  const budgetMs = options.budgetMs ?? 240_000;
  const started = Date.now();
  // Every tick marks the lease so visits do not start another one on top of it.
  if (!options.leaseClaimed) await renewTickLease(db).catch(() => undefined);
  const overrides = await getScheduleOverrides(db);
  const statuses = await db.select({ key: dataRefreshStatus.key, status: dataRefreshStatus.status, lastStartedAt: dataRefreshStatus.lastStartedAt, lastSuccessAt: dataRefreshStatus.lastSuccessAt, lastFailureAt: dataRefreshStatus.lastFailureAt }).from(dataRefreshStatus);
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
    const jobBudget = tickJobBudget(key, remaining);
    if (jobBudget < 5_000) {
      skipped.push(`${key}: out of time budget`);
      continue;
    }
    ran.push(await runJob(db, key, trigger, { budgetMs: jobBudget }));
  }
  return { ran, skipped };
}
