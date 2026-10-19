import { and, eq, lt } from "drizzle-orm";
import { defineJob } from "./registry";
import { dataRefreshStatus } from "@/server/db/schema";

defineJob({
  key: "integrity",
  description: "Housekeeping: unstick job states left running by an interrupted process.",
  defaultIntervalMinutes: 24 * 60,
  run: async (ctx) => {
    const stuckCutoff = new Date(Date.now() - 30 * 60_000);
    const unstuck = await ctx.db
      .update(dataRefreshStatus)
      .set({ status: "failed", lastError: "Run never finished (process was interrupted).", lastFailureAt: new Date() })
      .where(and(eq(dataRefreshStatus.status, "running"), lt(dataRefreshStatus.lastStartedAt, stuckCutoff)))
      .returning({ key: dataRefreshStatus.key });
    return { ok: true, summary: { unstuck: unstuck.map((u) => u.key) } };
  },
});
