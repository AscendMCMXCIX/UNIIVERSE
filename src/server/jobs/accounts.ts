import { defineJob } from "./registry";
import { createRiotClient } from "@/server/riot/api/client";
import { describeRateLimits } from "@/server/riot/api/rate-limiter";
import { accountsForSyncRun } from "@/server/accounts/repository";
import { currentSeason, syncAccount } from "@/server/accounts/sync";
import { invalidateProficiencyCache } from "@/server/proficiency/service";
import { backfillTimelines, timelineCoverage } from "@/server/accounts/timeline-backfill";

defineJob({
  key: "account-sync",
  description: "Refresh linked Riot accounts, most urgent first (new links, unfinished season history, active players, then the rest): PUUID, rank, mastery and match history.",
  defaultIntervalMinutes: 15,
  run: async (ctx) => {
    const client = createRiotClient();
    if (!client) return { ok: true, degraded: true, error: "RIOT_API_KEY is not configured; linked accounts cannot be synced.", summary: { skipped: true } };
    const outOfTime = () => Date.now() - ctx.startedAt > ctx.budgetMs;
    const due = await accountsForSyncRun(ctx.db, { limit: Number(process.env.ACCOUNT_SYNC_BATCH ?? 12), olderThanMinutes: Number(process.env.ACCOUNT_SYNC_MIN_AGE_MINUTES ?? 180), activeOlderThanMinutes: Number(process.env.ACCOUNT_SYNC_ACTIVE_AGE_MINUTES ?? 45), pendingLimit: Number(process.env.ACCOUNT_SYNC_PENDING_BATCH ?? 10) });
    const season = await currentSeason(ctx.db);
    const results = [];
    for (const account of due) {
      if (outOfTime()) break;
      results.push(await syncAccount(ctx.db, client, account, { outOfTime, log: ctx.log, season, maxMatchesPerRun: Number(process.env.ACCOUNT_SYNC_MATCHES_PER_RUN ?? 80) }));
    }
    if (results.some((r) => r.matchesFolded > 0 || r.masteryRows > 0)) invalidateProficiencyCache();
    const failed = results.filter((r) => r.error).length;
    return { ok: true, degraded: failed > 0 && failed === results.length && results.length > 0, summary: { season, synced: results.length, failed, folded: results.reduce((s, r) => s + r.matchesFolded, 0), seasonHistoryComplete: results.filter((r) => r.history?.complete).length, seasonHistoryInProgress: results.filter((r) => r.history && !r.history.complete).length, requests: client.requestCount, rateLimits: describeRateLimits(client.limiters.configured) } };
  },
});

defineJob({
  key: "timeline-backfill",
  description: "Fetch the match timelines Matchups needs (the linked players' own rift games with a lane opponent), newest first, a few per run, stopping at the first Riot refusal. Timelines Riot no longer provides are recorded and not asked for again.",
  defaultIntervalMinutes: 60,
  run: async (ctx) => {
    const client = createRiotClient({ maxRetries: 0, timeoutMs: 7_000 });
    if (!client) return { ok: true, degraded: true, error: "RIOT_API_KEY is not configured; timelines cannot be fetched.", summary: { skipped: true } };
    const limit = Number(process.env.TIMELINE_BACKFILL_PER_RUN ?? 30);
    const run = await backfillTimelines(ctx.db, client, { limit, deadline: ctx.startedAt + ctx.budgetMs, log: ctx.log });
    const coverage = await timelineCoverage(ctx.db);
    ctx.log(`timelines: fetched ${run.fetched}, unavailable ${run.unavailable}${run.stoppedBy ? `, stopped by ${run.stoppedBy}` : ""}; ${coverage.withFrames} of ${coverage.laneGames} lane games have frames, ${coverage.pending} to go`);
    return { ok: true, degraded: run.stoppedBy !== null && run.stoppedBy !== "time budget" && run.fetched === 0, error: run.stoppedBy && run.fetched === 0 && run.stoppedBy !== "time budget" ? `Stopped: ${run.stoppedBy}` : undefined, summary: { ...run, coverage, requests: client.requestCount } };
  },
});
