import { and, eq, lt } from "drizzle-orm";
import { defineJob } from "./registry";
import { dataRefreshStatus } from "@/server/db/schema";
import { deleteEndedSessions } from "@/server/auth/sessions";
import { pruneAuthFailures } from "@/server/auth/throttle";

defineJob({
  key: "integrity",
  description: "Housekeeping: unstick job states left running by an interrupted process; delete sign-in sessions that ended over a week ago and failed sign-ins past the throttling window.",
  defaultIntervalMinutes: 24 * 60,
  run: async (ctx) => {
    const stuckCutoff = new Date(Date.now() - 30 * 60_000);
    const unstuck = await ctx.db
      .update(dataRefreshStatus)
      .set({ status: "failed", lastError: "Run never finished (process was interrupted).", lastFailureAt: new Date() })
      .where(and(eq(dataRefreshStatus.status, "running"), lt(dataRefreshStatus.lastStartedAt, stuckCutoff)))
      .returning({ key: dataRefreshStatus.key });
    // Retention (privacy notice): bounded batches, so one run stays small however much piled up.
    const endedSessionsDeleted = await deleteEndedSessions(ctx.db);
    const oldFailedSignInsDeleted = await pruneAuthFailures(ctx.db);
    return { ok: true, summary: { unstuck: unstuck.map((u) => u.key), endedSessionsDeleted, oldFailedSignInsDeleted } };
  },
});
