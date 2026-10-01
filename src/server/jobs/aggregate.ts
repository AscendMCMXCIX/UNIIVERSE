import { defineJob } from "./registry";
import { aggregateProGames, aggregateRankedMatches } from "@/server/ingestion/aggregate";
import { unaggregatedCount } from "@/server/ingestion/ranked";
import { invalidateStatsCache } from "@/server/stats/loader";

defineJob({
  key: "aggregate",
  description: "Fold new ranked and professional games into matchup, synergy and pick/ban statistics.",
  defaultIntervalMinutes: 30,
  run: async (ctx) => {
    const outOfTime = () => Date.now() - ctx.startedAt > ctx.budgetMs;
    const ranked = await aggregateRankedMatches(ctx.db, { outOfTime });
    const pro = await aggregateProGames(ctx.db, { outOfTime });
    if (ranked.matches > 0 || pro.games > 0) invalidateStatsCache();
    const backlog = await unaggregatedCount(ctx.db);
    return { ok: true, summary: { rankedMatches: ranked.matches, proGames: pro.games, backlog } };
  },
});
