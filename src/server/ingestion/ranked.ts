import { and, asc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { champions, matchFetchQueue, rankedBans, rankedMatches, rankedParticipants, trackedSummoners } from "@/server/db/schema";
import { RiotApiError, type RiotApiClient, type Tier } from "@/server/riot/api/client";
import { normaliseMatch } from "./normalise";

export interface IngestionContext {
  db: Db;
  client: RiotApiClient;
  log: (message: string) => void;
  /** Return true when the job should stop and resume next run. */
  outOfTime: () => boolean;
}

export interface DiscoverOptions {
  platforms: string[];
  tiers: Tier[];
  maxPlayersPerTier: number;
  lookbackDays: number;
  maxPlayersPerRun: number;
}

/**
 * Step 1+2 of the pipeline: refresh the high-Elo player list and collect new match ids.
 * Everything is incremental: each player keeps a cursor so match lists are never re-downloaded.
 */
export async function discoverRankedMatches(ctx: IngestionContext, options: DiscoverOptions): Promise<{ playersUpserted: number; puuidsResolved: number; playersScanned: number; matchesQueued: number; errors: number }> {
  const { db, client, log } = ctx;
  let playersUpserted = 0;
  let puuidsResolved = 0;
  let errors = 0;

  // League lists are cheap (one request per tier) and give us the population to follow.
  for (const platform of options.platforms) {
    for (const tier of options.tiers) {
      if (ctx.outOfTime()) break;
      try {
        const list = await client.leagueList(platform, tier);
        const entries = [...list.entries].sort((a, b) => b.leaguePoints - a.leaguePoints).slice(0, options.maxPlayersPerTier);
        for (const e of entries) {
          let puuid = e.puuid;
          if (!puuid && e.summonerId) {
            if (ctx.outOfTime()) break;
            try {
              puuid = await client.puuidBySummonerId(platform, e.summonerId);
              puuidsResolved += 1;
            } catch (err) {
              errors += 1;
              log(`puuid lookup failed on ${platform}: ${(err as Error).message}`);
              continue;
            }
          }
          if (!puuid) continue;
          await db
            .insert(trackedSummoners)
            .values({ puuid, platform, tier, leaguePoints: e.leaguePoints, lastSeenInLeagueAt: new Date() })
            .onConflictDoUpdate({ target: trackedSummoners.puuid, set: { tier, leaguePoints: e.leaguePoints, lastSeenInLeagueAt: new Date() } });
          playersUpserted += 1;
        }
        log(`${platform} ${tier}: ${entries.length} players`);
      } catch (err) {
        errors += 1;
        log(`league list failed for ${platform} ${tier}: ${(err as Error).message}`);
      }
    }
  }

  // Match id discovery for the players least recently scanned.
  const lookbackStart = Math.floor(Date.now() / 1000) - options.lookbackDays * 86_400;
  const players = await db
    .select()
    .from(trackedSummoners)
    .where(inArray(trackedSummoners.platform, options.platforms))
    .orderBy(sql`${trackedSummoners.lastMatchListAt} ASC NULLS FIRST`)
    .limit(options.maxPlayersPerRun);
  let playersScanned = 0;
  let matchesQueued = 0;
  for (const p of players) {
    if (ctx.outOfTime()) break;
    try {
      const startTime = p.matchListCursor ? Math.max(lookbackStart, p.matchListCursor - 3600) : lookbackStart;
      const ids = await client.matchIdsByPuuid(p.platform, p.puuid, { startTime, queue: 420, count: 100 });
      if (ids.length) {
        const inserted = await db
          .insert(matchFetchQueue)
          .values(ids.map((matchId) => ({ matchId, platform: p.platform })))
          .onConflictDoNothing()
          .returning({ matchId: matchFetchQueue.matchId });
        matchesQueued += inserted.length;
      }
      await db.update(trackedSummoners).set({ lastMatchListAt: new Date(), matchListCursor: Math.floor(Date.now() / 1000) }).where(eq(trackedSummoners.puuid, p.puuid));
      playersScanned += 1;
    } catch (err) {
      errors += 1;
      log(`match list failed for ${p.puuid.slice(0, 8)}…: ${(err as Error).message}`);
      if (err instanceof RiotApiError && err.status === 403) break; // bad/expired key: stop early
    }
  }
  return { playersUpserted, puuidsResolved, playersScanned, matchesQueued, errors };
}

export interface IngestOptions {
  batchSize: number;
  maxAttempts: number;
  allowedQueueIds?: number[];
}

/**
 * Steps 3–8: fetch queued matches, validate, normalise and store. Duplicate ids are impossible
 * (primary keys) and a failed match never blocks the rest of the batch.
 */
export async function ingestQueuedMatches(ctx: IngestionContext, options: IngestOptions): Promise<{ fetched: number; inserted: number; duplicates: number; skipped: number; failed: number; newestGameAt: number | null }> {
  const { db, client, log } = ctx;
  const keyToId = new Map((await db.select({ key: champions.key, id: champions.id }).from(champions)).map((c) => [c.key, c.id]));
  const pending = await db
    .select()
    .from(matchFetchQueue)
    .where(and(eq(matchFetchQueue.status, "pending"), lt(matchFetchQueue.attempts, options.maxAttempts)))
    .orderBy(asc(matchFetchQueue.discoveredAt))
    .limit(options.batchSize);

  let fetched = 0;
  let inserted = 0;
  let duplicates = 0;
  let skipped = 0;
  let failed = 0;
  let newestGameAt: number | null = null;

  for (const item of pending) {
    if (ctx.outOfTime()) break;
    const existing = await db.select({ id: rankedMatches.matchId }).from(rankedMatches).where(eq(rankedMatches.matchId, item.matchId)).limit(1);
    if (existing.length) {
      duplicates += 1;
      await db.update(matchFetchQueue).set({ status: "done", updatedAt: new Date() }).where(eq(matchFetchQueue.matchId, item.matchId));
      continue;
    }
    try {
      const raw = await client.match(item.platform, item.matchId);
      fetched += 1;
      const result = normaliseMatch(raw, item.platform, keyToId, { allowedQueueIds: options.allowedQueueIds });
      if (!result.ok) {
        skipped += 1;
        await db.update(matchFetchQueue).set({ status: "skipped", lastError: result.reason, updatedAt: new Date() }).where(eq(matchFetchQueue.matchId, item.matchId));
        continue;
      }
      const { match, participants, bans } = result.value;
      await db.transaction(async (tx) => {
        const rows = await tx.insert(rankedMatches).values(match).onConflictDoNothing().returning({ id: rankedMatches.matchId });
        if (rows.length === 0) {
          duplicates += 1;
          return;
        }
        await tx.insert(rankedParticipants).values(participants).onConflictDoNothing();
        if (bans.length) await tx.insert(rankedBans).values(bans).onConflictDoNothing();
        await tx.update(matchFetchQueue).set({ status: "done", updatedAt: new Date() }).where(eq(matchFetchQueue.matchId, item.matchId));
        inserted += 1;
        newestGameAt = Math.max(newestGameAt ?? 0, match.gameCreation);
      });
    } catch (err) {
      failed += 1;
      const message = (err as Error).message;
      const permanent = err instanceof RiotApiError && !err.retryable && err.status !== 0;
      await db
        .update(matchFetchQueue)
        .set({ attempts: item.attempts + 1, lastError: message, status: permanent && err.status === 404 ? "failed" : "pending", updatedAt: new Date() })
        .where(eq(matchFetchQueue.matchId, item.matchId));
      log(`match ${item.matchId} failed: ${message}`);
      if (err instanceof RiotApiError && (err.status === 403 || err.status === 401)) break;
    }
  }
  return { fetched, inserted, duplicates, skipped, failed, newestGameAt };
}

export async function queueStats(db: Db): Promise<{ pending: number; done: number; failed: number }> {
  const rows = await db.select({ status: matchFetchQueue.status, n: sql<number>`count(*)` }).from(matchFetchQueue).groupBy(matchFetchQueue.status);
  const get = (s: string) => Number(rows.find((r) => r.status === s)?.n ?? 0);
  return { pending: get("pending"), done: get("done"), failed: get("failed") };
}

/** Housekeeping: drop old completed queue rows and retry transient failures. */
export async function pruneQueue(db: Db, olderThanDays = 7): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanDays * 86_400_000);
  const deleted = await db
    .delete(matchFetchQueue)
    .where(and(or(eq(matchFetchQueue.status, "done"), eq(matchFetchQueue.status, "skipped")), lt(matchFetchQueue.updatedAt, cutoff)))
    .returning({ id: matchFetchQueue.matchId });
  return deleted.length;
}

export async function unaggregatedCount(db: Db): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(rankedMatches).where(isNull(rankedMatches.aggregatedAt));
  return Number(row?.n ?? 0);
}
