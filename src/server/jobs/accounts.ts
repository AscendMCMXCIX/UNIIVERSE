import { defineJob } from "./registry";
import { createRiotClient } from "@/server/riot/api/client";
import { accountsForSyncRun } from "@/server/accounts/repository";
import { syncAccount } from "@/server/accounts/sync";
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
    const results = [];
    for (const account of due) {
      if (outOfTime()) break;
      results.push(await syncAccount(ctx.db, client, account, { outOfTime, log: ctx.log }));
    }
    if (results.some((r) => r.matchesFolded > 0 || r.masteryRows > 0)) invalidateProficiencyCache();
    const failed = results.filter((r) => r.error).length;
    return { ok: true, degraded: failed > 0 && failed === results.length && results.length > 0, summary: { synced: results.length, failed, folded: results.reduce((s, r) => s + r.matchesFolded, 0), requests: client.requestCount } };
  },
});
