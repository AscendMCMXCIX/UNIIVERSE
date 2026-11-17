import { eq, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { appSettings } from "@/server/db/schema";

/*
  When the database's own tick schedule last reached the app: production's ten-minute
  `uniiverse-tick`, which pg_cron runs and pg_net sends (docs/DEPLOYMENT.md, 4 c). Every authorised
  call of /api/jobs/tick that pg_net sends is recorded as it arrives, whether the tick then runs
  jobs or finds nothing due. pg_net names itself in the User-Agent header ("pg_net/<version>"): its
  releases (0.7 to 0.20.4 at least) add that header to every request, after the command's own
  headers, and its unreleased code after 0.20.4 leaves it out when the command sets one. So a
  command that sends a User-Agent of its own is never recognised: the app reads the command's
  first (Node keeps the first of two; a proxy that joins them puts the command's first too). The
  tick's other callers never send pg_net's: GitHub's Data jobs runs (curl), Vercel's daily cron
  ("vercel-cron/1.0") and visits, which send no request at all. The five-minute rank schedule is
  pg_net too, but it calls /api/jobs/rank-watch, recorded apart (rank-schedule-calls.ts).

  The time of the call before the last is kept too, so /api/health waits four of the schedule's
  own intervals, within the bounds below: a schedule with longer gaps between its calls (one that
  runs less often than every four hours, or pauses, say by night) is listed in each of them
  (docs/DEPLOYMENT.md, 4 c). Timestamps only. No dependencies on the jobs, so the public health
  route can read it without loading them.
*/

export const TICK_SCHEDULE_CALL_KEY = "tick-schedule:last-call";
/** The shortest silence /api/health reports: four calls of the ten-minute schedule. */
export const TICK_SCHEDULE_SILENT_MIN_MS = 40 * 60_000;
/** The longest, whatever the last interval was (the first call after a pause, an hourly schedule). */
export const TICK_SCHEDULE_SILENT_MAX_MS = 4 * 3_600_000;

/** Whether a request was sent by pg_net, from the User-Agent it gives every request. */
export function sentByDatabase(userAgent: string | null): boolean {
  return /^pg_net\//i.test(userAgent ?? "");
}

/** Records a call of the database's tick schedule, and keeps the one before it. */
export async function markTickScheduleCall(db: Db, now = new Date()): Promise<void> {
  const at = now.toISOString();
  await db
    .insert(appSettings)
    .values({ key: TICK_SCHEDULE_CALL_KEY, value: { at }, updatedAt: now })
    // In the update, the table's name is the row already stored: its time becomes the previous call.
    .onConflictDoUpdate({ target: appSettings.key, set: { value: sql`jsonb_build_object('at', ${at}::text, 'previousAt', ${appSettings.value} -> 'at')`, updatedAt: now } });
}

/** The last call's time in ms (0 when the schedule never called) and the one before it (null before a second call). */
export async function lastTickScheduleCalls(db: Db): Promise<{ at: number; previousAt: number | null }> {
  const [row] = await db.select({ value: appSettings.value, updatedAt: appSettings.updatedAt }).from(appSettings).where(eq(appSettings.key, TICK_SCHEDULE_CALL_KEY));
  if (!row) return { at: 0, previousAt: null };
  const previous = Date.parse(String((row.value as { previousAt?: unknown } | null)?.previousAt ?? ""));
  return { at: row.updatedAt.getTime(), previousAt: Number.isFinite(previous) ? previous : null };
}

/** How long the schedule may go without calling before /api/health lists it: four of its last intervals, within the bounds above. */
export function tickScheduleSilentMs(calls: { at: number; previousAt: number | null }): number {
  const interval = calls.previousAt === null ? 0 : calls.at - calls.previousAt;
  return Math.min(TICK_SCHEDULE_SILENT_MAX_MS, Math.max(TICK_SCHEDULE_SILENT_MIN_MS, 4 * interval));
}
