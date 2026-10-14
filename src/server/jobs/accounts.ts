import { defineJob } from "./registry";
import { createRiotClient } from "@/server/riot/api/client";
import { describeRateLimits } from "@/server/riot/api/rate-limiter";
import { accountsForSyncRun } from "@/server/accounts/repository";
import { currentSeason, syncAccount } from "@/server/accounts/sync";
import { invalidateProficiencyCache } from "@/server/proficiency/service";

defineJob({
  key: "account-sync",
  description: "Refresh linked Riot accounts (ours and scouted opponents): PUUID, rank, mastery and recent champion history.",
  defaultIntervalMinutes: 180,
  run: async (ctx) => {
    const client = createRiotClient();
    if (!client) return { ok: true, degraded: true, error: "RIOT_API_KEY is not configured; linked accounts cannot be synced.", summary: { skipped: true } };
    const outOfTime = () => Date.now() - ctx.startedAt > ctx.budgetMs;
    const due = await accountsForSyncRun(ctx.db, { limit: Number(process.env.ACCOUNT_SYNC_BATCH ?? 12), olderThanMinutes: Number(process.env.ACCOUNT_SYNC_MIN_AGE_MINUTES ?? 120), pendingLimit: Number(process.env.ACCOUNT_SYNC_PENDING_BATCH ?? 10) });
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
