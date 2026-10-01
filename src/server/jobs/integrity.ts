import { and, eq, lt, sql } from "drizzle-orm";
import { defineJob } from "./registry";
import { dataRefreshStatus, matchFetchQueue, rankedMatches } from "@/server/db/schema";
import { pruneQueue } from "@/server/ingestion/ranked";
import { getCurrentPatch } from "@/server/repositories/champions";
import { comparePatches } from "@/domain/patch";
import { runJob } from "./registry";

defineJob({
  key: "integrity",
  description: "Housekeeping: unstick stale job states, prune the match queue, detect patch drift.",
  defaultIntervalMinutes: 24 * 60,
  run: async (ctx) => {
    const stuckCutoff = new Date(Date.now() - 30 * 60_000);
    const unstuck = await ctx.db
      .update(dataRefreshStatus)
      .set({ status: "failed", lastError: "Run never finished (process was interrupted).", lastFailureAt: new Date() })
      .where(and(eq(dataRefreshStatus.status, "running"), lt(dataRefreshStatus.lastStartedAt, stuckCutoff)))
      .returning({ key: dataRefreshStatus.key });
    const pruned = await pruneQueue(ctx.db, Number(process.env.QUEUE_RETENTION_DAYS ?? 7));
    // Retry transiently failed queue items once per day.
    const retried = await ctx.db
      .update(matchFetchQueue)
      .set({ status: "pending", attempts: 0 })
      .where(and(eq(matchFetchQueue.status, "pending"), sql`${matchFetchQueue.attempts} >= 5`))
      .returning({ id: matchFetchQueue.matchId });
    // Patch drift: match data newer than the synced static patch means a version check is overdue.
    const current = await getCurrentPatch(ctx.db);
    const [newest] = await ctx.db.select({ patch: sql<string>`max(${rankedMatches.patch})` }).from(rankedMatches);
    let driftFixed = false;
    if (current && newest?.patch && comparePatches(newest.patch, current.patch) > 0) {
      await runJob(ctx.db, "version-check", "integrity");
      driftFixed = true;
    }
    return { ok: true, summary: { unstuck: unstuck.map((u) => u.key), pruned, retried: retried.length, driftFixed } };
  },
});
