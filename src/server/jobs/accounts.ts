import { defineJob } from "./registry";
import { createRiotClient } from "@/server/riot/api/client";
import { describeRateLimits } from "@/server/riot/api/rate-limiter";
import { accountsForSyncRun } from "@/server/accounts/repository";
import { currentSeason, syncAccount } from "@/server/accounts/sync";
import { SCHEDULED_SYNC_LEASE_MS, claimAccountSync } from "@/server/accounts/refresh";
import { invalidateProficiencyCache } from "@/server/proficiency/service";
import { backfillTimelines, timelineCoverage } from "@/server/accounts/timeline-backfill";
import { backfillFigures, figuresCoverage } from "@/server/accounts/figures-backfill";
import { checkRecentGameRanks, rankLookupClient } from "@/server/players/participant-ranks";

defineJob({
  key: "account-sync",
  description: "Refresh linked Riot accounts, most urgent first (new links, unfinished season history, active players, then the rest): PUUID, rank, mastery and match history.",
  defaultIntervalMinutes: 15,
  run: async (ctx) => {
    // The client carries the run's deadline, so no request waits for Riot's rate limits past it.
    const deadline = ctx.startedAt + ctx.budgetMs;
    const client = createRiotClient({ deadline });
    if (!client) return { ok: true, degraded: true, error: "RIOT_API_KEY is not configured; linked accounts cannot be synced.", summary: { skipped: true } };
    const outOfTime = () => Date.now() > deadline;
    const due = await accountsForSyncRun(ctx.db, { limit: Number(process.env.ACCOUNT_SYNC_BATCH ?? 12), olderThanMinutes: Number(process.env.ACCOUNT_SYNC_MIN_AGE_MINUTES ?? 180), activeOlderThanMinutes: Number(process.env.ACCOUNT_SYNC_ACTIVE_AGE_MINUTES ?? 45), pendingLimit: Number(process.env.ACCOUNT_SYNC_PENDING_BATCH ?? 10) });
    const season = await currentSeason(ctx.db);
    const results = [];
    let skipped = 0;
    for (const account of due) {
      if (outOfTime()) break;
      // A refresh from Match History (or an overlapping run) is syncing this account right now or just did.
      if (!(await claimAccountSync(ctx.db, account.id, SCHEDULED_SYNC_LEASE_MS))) {
        skipped += 1;
        continue;
      }
      const r = await syncAccount(ctx.db, client, account, { outOfTime, log: ctx.log, season, maxMatchesPerRun: Number(process.env.ACCOUNT_SYNC_MATCHES_PER_RUN ?? 80) });
      results.push(r);
      // Riot's rate limits would have kept a request waiting past the deadline: the next account
      // would wait the same way, so stop here rather than claim it and leave it unsynced.
      if (r.outOfTime) break;
    }
    if (results.some((r) => r.matchesFolded > 0 || r.masteryRows > 0)) invalidateProficiencyCache();
    const failed = results.filter((r) => r.error).length;
    const stoppedForTime = results.some((r) => r.outOfTime);
    if (stoppedForTime) ctx.log("out of time: Riot's rate limits would have kept the next request waiting past the run's budget; the next run carries on");
    return { ok: true, degraded: failed > 0 && failed === results.length && results.length > 0, summary: { season, synced: results.length, skippedRecentlySynced: skipped, failed, stoppedForTime, folded: results.reduce((s, r) => s + r.matchesFolded, 0), seasonHistoryComplete: results.filter((r) => r.history?.complete).length, seasonHistoryInProgress: results.filter((r) => r.history && !r.history.complete).length, requests: client.requestCount, rateLimits: describeRateLimits(client.limiters.configured) } };
  },
});

defineJob({
  key: "timeline-backfill",
  description: "Fetch the match timelines Matchups needs (the linked players' own rift games with a lane opponent), newest first, a few per run, stopping at the first Riot refusal. Timelines Riot no longer provides are recorded and not asked for again.",
  defaultIntervalMinutes: 60,
  run: async (ctx) => {
    const deadline = ctx.startedAt + ctx.budgetMs;
    const client = createRiotClient({ maxRetries: 0, timeoutMs: 7_000, deadline });
    if (!client) return { ok: true, degraded: true, error: "RIOT_API_KEY is not configured; timelines cannot be fetched.", summary: { skipped: true } };
    const limit = Number(process.env.TIMELINE_BACKFILL_PER_RUN ?? 30);
    const run = await backfillTimelines(ctx.db, client, { limit, deadline, log: ctx.log });
    const coverage = await timelineCoverage(ctx.db);
    ctx.log(`timelines: fetched ${run.fetched}, unavailable ${run.unavailable}${run.stoppedBy ? `, stopped by ${run.stoppedBy}` : ""}; ${coverage.withFrames} of ${coverage.laneGames} lane games have frames, ${coverage.pending} to go`);
    return { ok: true, degraded: run.stoppedBy !== null && run.stoppedBy !== "time budget" && run.fetched === 0, error: run.stoppedBy && run.fetched === 0 && run.stoppedBy !== "time budget" ? `Stopped: ${run.stoppedBy}` : undefined, summary: { ...run, coverage, requests: client.requestCount } };
  },
});

defineJob({
  key: "figures-backfill",
  description: "Fetch again, once, the full record of the linked players' games stored before multikills and the other extra figures were kept (Season 2026 on), newest first, a few per run, stopping at the first Riot refusal. Records Riot no longer provides are marked and not asked for again.",
  defaultIntervalMinutes: 60,
  run: async (ctx) => {
    const deadline = ctx.startedAt + ctx.budgetMs;
    const client = createRiotClient({ maxRetries: 0, timeoutMs: 7_000, deadline });
    if (!client) return { ok: true, degraded: true, error: "RIOT_API_KEY is not configured; match records cannot be fetched.", summary: { skipped: true } };
    // 60 a run (was 30): the run stops at its 25-second share of the tick and at Riot's limit
    // anyway, and a profile's Refresh now fetches its own player's records on demand.
    const limit = Number(process.env.FIGURES_BACKFILL_PER_RUN ?? 60);
    const run = await backfillFigures(ctx.db, client, { limit, deadline, log: ctx.log });
    const coverage = await figuresCoverage(ctx.db);
    ctx.log(`figures: fetched ${run.fetched}, unavailable ${run.unavailable}${run.stoppedBy ? `, stopped by ${run.stoppedBy}` : ""}; ${coverage.withFigures} of ${coverage.games} games have them, ${coverage.pending} to go`);
    return { ok: true, degraded: run.stoppedBy !== null && run.stoppedBy !== "time budget" && run.fetched === 0, error: run.stoppedBy && run.fetched === 0 && run.stoppedBy !== "time budget" ? `Stopped: ${run.stoppedBy}` : undefined, summary: { ...run, coverage, requests: client.requestCount } };
  },
});

defineJob({
  key: "rank-checks",
  description: "Check the current rank of the other players in the members' games of the last 7 days once each game is collected (LEAGUE-V4, one request a player, at most 30 a run), so every recent game shows the ranks around it whether or not anyone opened it. Within 600 of the 1,000 daily rank checks and half of Riot's rate limits; waits only for Riot's one-second window to turn over, within its 15 seconds.",
  defaultIntervalMinutes: 15,
  run: async (ctx) => {
    const client = rankLookupClient();
    if (!client) return { ok: true, degraded: true, error: "RIOT_API_KEY is not configured; ranks cannot be checked.", summary: { skipped: true } };
    const run = await checkRecentGameRanks(ctx.db, client, { deadline: ctx.startedAt + ctx.budgetMs });
    ctx.log(`ranks: ${run.found} checked, ${run.failed} failed, ${run.skipped} skipped${run.reason ? ` (${run.reason})` : ""}${run.waits ? `, ${run.waits} waits for Riot's one-second window` : ""}; ${run.waiting} players in ${run.games} recent games were waiting`);
    return { ok: true, degraded: run.asked > 0 && run.found === 0 && run.failed > 0, summary: { ...run, requests: client.requestCount } };
  },
});
