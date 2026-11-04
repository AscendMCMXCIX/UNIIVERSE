import { and, eq, lt } from "drizzle-orm";
import { defineJob } from "./registry";
import { dataRefreshStatus } from "@/server/db/schema";
import { deleteEndedSessions } from "@/server/auth/sessions";
import { pruneAuthFailures } from "@/server/auth/throttle";
import { reconcileErasures } from "@/server/privacy/reconcile";
import { clearCachesAfterErasure } from "@/server/privacy/after-erasure";

defineJob({
  key: "integrity",
  description: "Housekeeping: unstick job states left running by an interrupted process; delete sign-in sessions that ended over a week ago and failed sign-ins past the throttling window; keep personal-data erasures in force on what was stored lately.",
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
    // Erasures stay in force: anything stored in the last two days that names an erased person
    // is removed again (the sync should never store it; this is the safety net).
    const erasures = await reconcileErasures(ctx.db, { mode: "recent" });
    // What it removed must not live on in this instance's caches either (the same list as an
    // administrator's erasure).
    if (erasures.people || erasures.traces) clearCachesAfterErasure();
    const unusable = erasures.unusable ? `${erasures.unusable} erasure record(s) were made under another UNIIVERSE_AUTH_SECRET and cannot be applied (docs/BACKUPS.md).` : undefined;
    return {
      ok: true,
      degraded: !!unusable,
      error: unusable,
      summary: { unstuck: unstuck.map((u) => u.key), endedSessionsDeleted, oldFailedSignInsDeleted, erasures: { records: erasures.records, unusable: erasures.unusable, people: erasures.people, traces: erasures.traces } },
    };
  },
});
