import { and, eq, lt, sql } from "drizzle-orm";
import { defineJob } from "./registry";
import { dataRefreshStatus } from "@/server/db/schema";
import { INTERRUPTED_RUN_ERROR, closeInterruptedRuns } from "@/server/ops/refresh-status";
import { deleteEndedSessions } from "@/server/auth/sessions";
import { pruneAuthFailures } from "@/server/auth/throttle";
import { reconcileErasures } from "@/server/privacy/reconcile";

defineJob({
  key: "integrity",
  description: "Housekeeping: unstick job states left running by an interrupted process (each counts as a failed run) and close the runs left open; delete sign-in sessions that ended over a week ago and failed sign-ins past the throttling window; keep personal-data erasures in force on what was stored lately.",
  defaultIntervalMinutes: 24 * 60,
  run: async (ctx) => {
    // A job still "running" after half an hour died with its process. It counts as one more
    // failure in a row, as when its next run takes the key over (startJobRun), so a job killed on
    // every run is reported as failing. Every run row left open that long is closed as a failed
    // run, whichever job it belongs to: the next start of a job closes only its own.
    const now = new Date();
    const stuckCutoff = new Date(now.getTime() - 30 * 60_000);
    const unstuck = await ctx.db
      .update(dataRefreshStatus)
      .set({ status: "failed", lastError: INTERRUPTED_RUN_ERROR, lastFailureAt: now, consecutiveFailures: sql`${dataRefreshStatus.consecutiveFailures} + 1`, updatedAt: now })
      .where(and(eq(dataRefreshStatus.status, "running"), lt(dataRefreshStatus.lastStartedAt, stuckCutoff)))
      .returning({ key: dataRefreshStatus.key });
    const interruptedRunsClosed = await closeInterruptedRuns(ctx.db, { startedBefore: stuckCutoff, at: now });
    // Retention (privacy notice): bounded batches, so one run stays small however much piled up.
    const endedSessionsDeleted = await deleteEndedSessions(ctx.db);
    const oldFailedSignInsDeleted = await pruneAuthFailures(ctx.db);
    // Erasures stay in force: anything stored in the last two days that names an erased person
    // is removed again (the sync should never store it; this is the safety net).
    const erasures = await reconcileErasures(ctx.db, { mode: "recent" });
    const unusable = erasures.unusable ? `${erasures.unusable} erasure record(s) were made under another UNIIVERSE_AUTH_SECRET and cannot be applied (docs/BACKUPS.md).` : undefined;
    return {
      ok: true,
      degraded: !!unusable,
      error: unusable,
      summary: { unstuck: unstuck.map((u) => u.key), interruptedRunsClosed, endedSessionsDeleted, oldFailedSignInsDeleted, erasures: { records: erasures.records, unusable: erasures.unusable, people: erasures.people, traces: erasures.traces } },
    };
  },
});
