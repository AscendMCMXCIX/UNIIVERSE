import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { appSettings } from "@/server/db/schema";

/*
  When the five-minute rank schedule (pg_cron, docs/RANKED_PROGRESS.md) last reached the app: every
  authorised direct call of /api/jobs/rank-watch, which is what the schedule sends, whether the run
  then goes ahead or is skipped as already running. A tick's own rank watch (GitHub's hourly run,
  Vercel's daily cron, visits, the ten-minute pg_cron tick) is not such a call, so this is the
  schedule's own sign of life, which /api/health reads. A timestamp only. No dependencies on the
  jobs, so the public health route can read it without loading them.
*/

export const RANK_SCHEDULE_CALL_KEY = "rank-schedule:last-call";

export async function markRankScheduleCall(db: Db, now = new Date()): Promise<void> {
  const value = { at: now.toISOString() };
  await db.insert(appSettings).values({ key: RANK_SCHEDULE_CALL_KEY, value, updatedAt: now }).onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: now } });
}

/** The last call's time in ms, or 0 when the schedule never called. */
export async function lastRankScheduleCall(db: Db): Promise<number> {
  const [row] = await db.select({ at: appSettings.updatedAt }).from(appSettings).where(eq(appSettings.key, RANK_SCHEDULE_CALL_KEY));
  return row?.at?.getTime() ?? 0;
}
