import { defineJob } from "./registry";
import { createRiotClient, parsePlatforms, type Tier } from "@/server/riot/api/client";
import { discoverRankedMatches, ingestQueuedMatches, queueStats } from "@/server/ingestion/ranked";
import { describeRateLimits } from "@/server/riot/api/rate-limiter";

function tiers(): Tier[] {
  const list = (process.env.RIOT_TIERS ?? "CHALLENGER,GRANDMASTER,MASTER")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s): s is Tier => s === "CHALLENGER" || s === "GRANDMASTER" || s === "MASTER");
  return list.length ? list : ["CHALLENGER", "GRANDMASTER", "MASTER"];
}

const NO_KEY = "RIOT_API_KEY is not configured. Add it to your environment (see README → Riot API setup) to start ranked ingestion.";

defineJob({
  key: "ranked-discover",
  description: "Refresh the high-Elo player lists region by region and queue new ranked match ids (incremental, bounded per run).",
  defaultIntervalMinutes: 60,
  run: async (ctx) => {
    const client = createRiotClient();
    if (!client) return { ok: true, degraded: true, error: NO_KEY, summary: { skipped: true } };
    const platforms = parsePlatforms(process.env.RIOT_PLATFORMS);
    const result = await discoverRankedMatches(
      { db: ctx.db, client, log: ctx.log, outOfTime: () => Date.now() - ctx.startedAt > ctx.budgetMs },
      {
        platforms,
        tiers: tiers(),
        maxPlayersPerTier: Number(process.env.RIOT_MAX_PLAYERS_PER_TIER ?? 300),
        lookbackDays: Number(process.env.RIOT_LOOKBACK_DAYS ?? 7),
        maxPlayersPerRun: Number(process.env.RIOT_MAX_PLAYERS_PER_RUN ?? 40),
        maxLeagueRefreshesPerRun: Number(process.env.RIOT_LEAGUE_REFRESHES_PER_RUN ?? 6),
        leagueRefreshMinutes: Number(process.env.RIOT_LEAGUE_REFRESH_MINUTES ?? 360),
      },
    );
    const queue = await queueStats(ctx.db);
    const { lastError, ...counts } = result;
    const allFailed = result.errors > 0 && result.playersScanned === 0 && result.playersUpserted === 0;
    if (result.playersDropped > 0) ctx.log(`${result.playersDropped} tracked players dropped: Riot could not read their ids with the current key; they are re-added from the league lists`);
    return {
      ok: true,
      summary: { ...counts, platforms, queue, requests: client.requestCount, requestsByHost: Object.fromEntries(client.requestsByHost), rateLimits: describeRateLimits(client.limiters.configured), keyInUse: client.keyFingerprint },
      degraded: allFailed,
      error: allFailed ? [`All Riot requests failed. ${lastError ?? "Check the API key."}`, `Key in use ends with ${client.keyFingerprint}.`, client.keyWarning].filter(Boolean).join(" ") : undefined,
    };
  },
});

defineJob({
  key: "ranked-ingest",
  description: "Fetch queued ranked matches region by region in parallel, validate and store them (incremental, rate limited per Riot host).",
  defaultIntervalMinutes: 10,
  run: async (ctx) => {
    const client = createRiotClient();
    if (!client) return { ok: true, degraded: true, error: NO_KEY, summary: { skipped: true } };
    const result = await ingestQueuedMatches(
      { db: ctx.db, client, log: ctx.log, outOfTime: () => Date.now() - ctx.startedAt > ctx.budgetMs },
      { batchSize: Number(process.env.RIOT_INGEST_BATCH ?? 60), maxAttempts: 5 },
    );
    const queue = await queueStats(ctx.db);
    const { lastError, ...counts } = result;
    const allFailed = result.failed > 0 && result.inserted === 0 && result.fetched === 0;
    return {
      ok: !allFailed || result.failed < 3,
      degraded: allFailed,
      error: allFailed ? [`Match fetches are failing. ${lastError ?? "Check the API key and rate limits."}`, `Key in use ends with ${client.keyFingerprint}.`, client.keyWarning].filter(Boolean).join(" ") : undefined,
      summary: { ...counts, queue, requests: client.requestCount, requestsByHost: Object.fromEntries(client.requestsByHost), rateLimits: describeRateLimits(client.limiters.configured), keyInUse: client.keyFingerprint },
    };
  },
});
