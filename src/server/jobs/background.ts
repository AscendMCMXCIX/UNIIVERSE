import { sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { log } from "@/server/observability/log";

/*
  Refresh while the team uses the site. External schedulers are best-effort (GitHub delivers
  its cron a few times a day, the Vercel Hobby cron once), so a visit also starts a scheduler
  tick in the background when none has started for a while. The visit never waits for it: the
  page is sent first and the tick runs afterwards in the same invocation (Next.js `after`).

  A lease row in app_settings makes this safe across instances: one atomic upsert claims the
  tick, so many simultaneous visitors start at most one. Every tick, whatever started it,
  renews the lease, so visits never pile on top of a scheduled run.
*/

const LEASE_KEY = "tick_lease";

/** Minutes between visit-started ticks (UNIIVERSE_VISIT_TICK_MINUTES, default 30). */
export function visitTickIntervalMinutes(): number {
  const n = Number(process.env.UNIIVERSE_VISIT_TICK_MINUTES ?? 30);
  return Number.isFinite(n) && n >= 5 ? n : 30;
}

/** On by default on Vercel; elsewhere only when UNIIVERSE_BACKGROUND_REFRESH=true. */
export function backgroundRefreshEnabled(): boolean {
  const flag = process.env.UNIIVERSE_BACKGROUND_REFRESH;
  if (flag === "false") return false;
  return flag === "true" || process.env.VERCEL === "1";
}

const rowsOf = (r: unknown): unknown[] => ((r as { rows?: unknown[] }).rows ?? (r as unknown[])) as unknown[];

/**
 * Claims a named lease when it was last claimed at least `minIntervalMs` ago. Atomic: of many
 * concurrent callers exactly one gets true.
 */
export async function claimLease(db: Db, key: string, minIntervalMs: number, now: Date = new Date()): Promise<boolean> {
  const cutoff = new Date(now.getTime() - minIntervalMs);
  const value = JSON.stringify(now.toISOString());
  const result = await db.execute(sql`
    INSERT INTO app_settings (key, value, updated_at) VALUES (${key}, ${value}::jsonb, ${now.toISOString()}::timestamptz)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
    WHERE app_settings.updated_at < ${cutoff.toISOString()}::timestamptz
    RETURNING key`);
  return rowsOf(result).length > 0;
}

/** Claims the scheduler-tick lease (see claimLease). */
export function claimTickLease(db: Db, minIntervalMs: number, now: Date = new Date()): Promise<boolean> {
  return claimLease(db, LEASE_KEY, minIntervalMs, now);
}

/** Records that a tick started (any trigger), so visits do not start another one right away. */
export async function renewTickLease(db: Db, now: Date = new Date()): Promise<void> {
  const value = JSON.stringify(now.toISOString());
  await db.execute(sql`
    INSERT INTO app_settings (key, value, updated_at) VALUES (${LEASE_KEY}, ${value}::jsonb, ${now.toISOString()}::timestamptz)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`);
}

/** When the last tick started, from the lease. */
export async function lastTickStartedAt(db: Db): Promise<Date | null> {
  const r = rowsOf(await db.execute(sql`SELECT updated_at FROM app_settings WHERE key = ${LEASE_KEY}`))[0] as { updated_at?: string | Date } | undefined;
  return r?.updated_at ? new Date(r.updated_at) : null;
}

declare global {
  var __uniiverseVisitTickCheckedAt: number | undefined;
}

/**
 * Called after a page has been sent. Cheap when nothing is due: one in-memory check per minute
 * per instance, then one conditional upsert. Errors never reach the visitor.
 */
export async function runTickIfDue(db: Db, options: { budgetMs?: number } = {}): Promise<boolean> {
  if (!backgroundRefreshEnabled()) return false;
  const now = Date.now();
  if (globalThis.__uniiverseVisitTickCheckedAt && now - globalThis.__uniiverseVisitTickCheckedAt < 60_000) return false;
  globalThis.__uniiverseVisitTickCheckedAt = now;
  try {
    if (!(await claimTickLease(db, visitTickIntervalMinutes() * 60_000))) return false;
    // Inside the function limit (300 s) with room for the page render and the fold-in after
    // ingestion. 150 s was too short in production: account sync waiting on Riot's two-minute
    // window used 121 s of it and ranked ingestion never ran on visits (2026-10-14).
    // Loaded on demand through the index so every job is registered (and the page bundle stays small).
    const { runTick } = await import("./index");
    const result = await runTick(db, "visit", { budgetMs: options.budgetMs ?? Number(process.env.UNIIVERSE_VISIT_TICK_BUDGET_MS ?? 230_000), leaseClaimed: true });
    log("info", "jobs.visit-tick", { ran: result.ran.map((r) => `${r.key}:${r.ok ? "ok" : "failed"}`).join(" ") });
    return true;
  } catch (err) {
    log("warn", "jobs.visit-tick-failed", { error: (err as Error).message });
    return false;
  }
}
