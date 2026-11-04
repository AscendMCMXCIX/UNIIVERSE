import { defineJob } from "./registry";
import { unstickDeadRuns } from "@/server/ops/refresh-status";
import { deleteEndedSessions } from "@/server/auth/sessions";
import { pruneAuthFailures } from "@/server/auth/throttle";
import { reconcileErasures } from "@/server/privacy/reconcile";

defineJob({
  key: "integrity",
  description: "Housekeeping: mark job runs left running by an interrupted process as failed; delete sign-in sessions that ended over a week ago and failed sign-ins past the throttling window; keep personal-data erasures in force on what was stored lately.",
  defaultIntervalMinutes: 24 * 60,
  run: async (ctx) => {
    // A run still "running" after the time a new run would take its key over (ops/refresh-status):
    // marked failed, counted as a failure, its open run closed.
    const unstuck = await unstickDeadRuns(ctx.db);
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
      summary: { unstuck, endedSessionsDeleted, oldFailedSignInsDeleted, erasures: { records: erasures.records, unusable: erasures.unusable, people: erasures.people, traces: erasures.traces } },
    };
  },
});
