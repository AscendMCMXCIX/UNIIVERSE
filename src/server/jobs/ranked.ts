import { defineJob } from "./registry";
import { createRiotClient, parsePlatforms, type Tier } from "@/server/riot/api/client";
import { discoverRankedMatches, ingestQueuedMatches, queueStats } from "@/server/ingestion/ranked";

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
  description: "Refresh the high-Elo player list and queue new ranked match ids (incremental).",
  defaultIntervalMinutes: 60,
  run: async (ctx) => {
    const client = createRiotClient();
    if (!client) return { ok: true, degraded: true, error: NO_KEY, summary: { skipped: true } };
    const result = await discoverRankedMatches(
      { db: ctx.db, client, log: ctx.log, outOfTime: () => Date.now() - ctx.startedAt > ctx.budgetMs },
      {
        platforms: parsePlatforms(process.env.RIOT_PLATFORMS),
        tiers: tiers(),
        maxPlayersPerTier: Number(process.env.RIOT_MAX_PLAYERS_PER_TIER ?? 300),
        lookbackDays: Number(process.env.RIOT_LOOKBACK_DAYS ?? 7),
        maxPlayersPerRun: Number(process.env.RIOT_MAX_PLAYERS_PER_RUN ?? 40),
      },
    );
    const queue = await queueStats(ctx.db);
    const { lastError, ...counts } = result;
    const allFailed = result.errors > 0 && result.playersScanned === 0 && result.playersUpserted === 0;
    return { ok: true, summary: { ...counts, queue, requests: client.requestCount, keyInUse: client.keyFingerprint }, degraded: allFailed, error: allFailed ? [`All Riot requests failed. ${lastError ?? "Check the API key."}`, `Key in use ends with ${client.keyFingerprint}.`, client.keyWarning].filter(Boolean).join(" ") : undefined };
  },
});

defineJob({
  key: "ranked-ingest",
  description: "Fetch queued ranked matches, validate and store them (incremental, rate limited).",
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
    return { ok: !allFailed || result.failed < 3, degraded: allFailed, error: allFailed ? [`Match fetches are failing. ${lastError ?? "Check the API key and rate limits."}`, `Key in use ends with ${client.keyFingerprint}.`, client.keyWarning].filter(Boolean).join(" ") : undefined, summary: { ...counts, queue, requests: client.requestCount, keyInUse: client.keyFingerprint } };
  },
});
