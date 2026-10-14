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
 * Order matters: static data first, then our own players' accounts (small, and what the team
 * looks at), then discovery, then aggregation of what earlier ticks collected, and global match
 * ingestion last with whatever time is left. Ingestion goes last because a single fetch can wait
 * on Riot's two-minute rate-limit window and overrun its slice; before this order a tick that
 * overran skipped aggregation every time (production, 2026-10-14). Aggregation therefore trails
 * ingestion by one tick, which is harmless.
 */
const TICK_ORDER: JobKey[] = ["version-check", "account-sync", "ranked-discover", "pro-sync", "aggregate", "integrity", "ranked-ingest"];

/**
 * Budget shares inside one tick. Every job before ingestion is capped so ingestion (limited by
 * Riot's rate limits, not by work, and able to use every second it gets) always has time; it runs
 * last and keeps a margin for a fetch that is waiting on a rate-limit window when time runs out.
 */
const MAX_JOB_MS: Partial<Record<JobKey, number>> = { "account-sync": 75_000, "ranked-discover": 40_000, "pro-sync": 40_000, aggregate: 60_000, integrity: 20_000 };
/** The fold-in after ingestion starts only before this point of a tick (the function may run 300 s). */
const AGGREGATE_AFTER_INGEST_DEADLINE_MS = 265_000;
/** Kept free after ranked-ingest's budget: an in-flight fetch may still finish inside it. */
const INGEST_OVERRUN_MARGIN_MS = 30_000;

/** How long a job may run inside a tick with `remainingMs` left. */
export function tickJobBudget(key: JobKey, remainingMs: number): number {
  let budget = Math.min(remainingMs - 2_000, 180_000, MAX_JOB_MS[key] ?? Infinity);
  if (key === "ranked-ingest") budget = Math.min(budget, remainingMs - INGEST_OVERRUN_MARGIN_MS);
  return budget;
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
    const jobBudget = tickJobBudget(key, remaining);
    if (jobBudget < 5_000) {
      skipped.push(`${key}: out of time budget`);
      continue;
    }
    ran.push(await runJob(db, key, trigger, { budgetMs: jobBudget }));
  }
  // Fold what this tick collected into the statistics straight away (cheap: a few seconds), so
  // new games reach the engine, Trends and recommendations in the same tick.
  const ingest = ran.find((r) => r.key === "ranked-ingest");
  const inserted = Number((ingest?.summary as { inserted?: number } | undefined)?.inserted ?? 0);
  // Ingestion may overrun its slice while a fetch waits on a rate-limit window, so this step is
  // measured against the function's hard limit (300 s) rather than the tick budget: one batch of
  // 300 games takes about three seconds (production, 2026-10-14).
  const elapsed = Date.now() - started;
  if (inserted > 0 && elapsed < AGGREGATE_AFTER_INGEST_DEADLINE_MS && jobs.has("aggregate")) ran.push(await runJob(db, "aggregate", trigger, { budgetMs: Math.max(5_000, Math.min(budgetMs - elapsed, 20_000)) }));
  else if (inserted > 0) skipped.push("aggregate (after ingest): out of time; the next tick folds these games in");
  return { ran, skipped };
}
