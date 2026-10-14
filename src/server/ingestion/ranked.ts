import { and, asc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { champions, matchFetchQueue, rankedBans, rankedMatches, rankedParticipants, regionStatus, trackedSummoners } from "@/server/db/schema";
import { explainRiotError, regionFor, RiotApiError, type RiotApiClient, type Tier } from "@/server/riot/api/client";
import { platformLabel } from "@/domain/riot-platforms";
import { APEX_TIERS, DIVISIONS, tierBandFor } from "@/domain/stats/tiers";
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
  /** Players kept per apex tier (Challenger, Grandmaster, Master are one list each). */
  maxPlayersPerTier: number;
  /** Players sampled per paged tier (Diamond, Emerald): a fair share of each division's page. */
  maxPlayersPerSampledTier?: number;
  /** Which page of each division to sample (default: rotates so refreshes see different players). */
  samplePage?: number;
  /** Sampled-tier players unseen for this long are dropped so the pool stays bounded. */
  sampledRetentionDays?: number;
  lookbackDays: number;
  /** Match-list scans per run, shared fairly across the configured platforms. */
  maxPlayersPerRun: number;
  /** League lists are refreshed for at most this many platforms per run, stalest first. */
  maxLeagueRefreshesPerRun?: number;
  /** A platform's league lists are considered fresh for this long. */
  leagueRefreshMinutes?: number;
  /** Parallel league refreshes (each platform host has its own rate budget). */
  concurrency?: number;
}

export interface DiscoverResult {
  playersUpserted: number;
  puuidsResolved: number;
  playersScanned: number;
  playersDropped: number;
  playersPruned: number;
  playersTracked: number;
  matchesQueued: number;
  errors: number;
  lastError?: string;
  /** Platforms whose league lists were refreshed this run. */
  leaguesRefreshed: string[];
  /** Platforms that produced an error this run, with the plain-language cause. */
  platformErrors: Record<string, string>;
}

/** Marks a platform's step as done (or failed) in region_status. */
export async function touchRegion(db: Db, platform: string, patch: { leagueRefresh?: boolean; discover?: boolean; ingest?: boolean; error?: string | null }): Promise<void> {
  const now = new Date();
  const set: Partial<typeof regionStatus.$inferInsert> = { updatedAt: now };
  if (patch.leagueRefresh) set.lastLeagueRefreshAt = now;
  if (patch.discover) set.lastDiscoverAt = now;
  if (patch.ingest) set.lastIngestAt = now;
  if (patch.error) {
    set.lastError = patch.error;
    set.lastErrorAt = now;
  }
  const insert: typeof regionStatus.$inferInsert = { platform, ...set, consecutiveErrors: patch.error ? 1 : 0 };
  await db
    .insert(regionStatus)
    .values(insert)
    .onConflictDoUpdate({
      target: regionStatus.platform,
      set: {
        ...set,
        consecutiveErrors: patch.error ? sql`${regionStatus.consecutiveErrors} + 1` : patch.error === null || patch.leagueRefresh || patch.discover || patch.ingest ? 0 : regionStatus.consecutiveErrors,
        ...(patch.error === null ? { lastError: null } : {}),
      },
    });
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Step 1+2 of the pipeline: refresh the high-Elo player lists and collect new match ids.
 *
 * Region-aware and bounded: each run refreshes the league lists of the stalest few platforms
 * (platform hosts are rate limited independently, so they run in parallel), then scans the
 * match lists of the players least recently scanned, taking a fair share from every configured
 * platform so a big region never starves a small one. Every player keeps a cursor, so match
 * lists are never re-downloaded; the queue's primary key makes duplicate match ids impossible.
 */
export async function discoverRankedMatches(ctx: IngestionContext, options: DiscoverOptions): Promise<DiscoverResult> {
  const { db, client, log } = ctx;
  const result: DiscoverResult = { playersUpserted: 0, puuidsResolved: 0, playersScanned: 0, playersDropped: 0, playersPruned: 0, playersTracked: 0, matchesQueued: 0, errors: 0, leaguesRefreshed: [], platformErrors: {} };
  const platforms = [...new Set(options.platforms.map((p) => p.toLowerCase()))];
  if (platforms.length === 0) return result;
  const runStart = new Date();
  const refreshEvery = (options.leagueRefreshMinutes ?? 360) * 60_000;
  const maxRefresh = options.maxLeagueRefreshesPerRun ?? 6;

  // Which platforms are due a league refresh? Stalest first, never-refreshed first of all.
  const statuses = await db.select().from(regionStatus).where(inArray(regionStatus.platform, platforms));
  const lastRefresh = new Map(statuses.map((s) => [s.platform, s.lastLeagueRefreshAt?.getTime() ?? 0]));
  const due = platforms
    .filter((p) => runStart.getTime() - (lastRefresh.get(p) ?? 0) >= refreshEvery)
    .sort((a, b) => (lastRefresh.get(a) ?? 0) - (lastRefresh.get(b) ?? 0))
    .slice(0, maxRefresh);

  const errorRecorded = new Set<string>();
  const noteError = (platform: string, err: unknown) => {
    result.errors += 1;
    result.lastError = explainRiotError(err);
    result.platformErrors[platform] = result.lastError;
  };

  await mapLimit(due, options.concurrency ?? 4, async (platform) => {
    if (ctx.outOfTime()) return;
    let tiersFetched = 0;
    let apexFetched = 0;
    let failure: string | null = null;
    const apexTiers = options.tiers.filter((t) => APEX_TIERS.has(t));
    const sampledLimit = options.maxPlayersPerSampledTier ?? 150;
    for (const tier of options.tiers) {
      if (ctx.outOfTime()) break;
      try {
        let entries: Array<{ puuid?: string; summonerId?: string; leaguePoints: number }>;
        if (APEX_TIERS.has(tier)) {
          const list = await client.leagueList(platform, tier);
          entries = [...list.entries].sort((a, b) => b.leaguePoints - a.leaguePoints).slice(0, options.maxPlayersPerTier);
        } else {
          // Paged ladders: one page per division (about 200 players each), a fair share of each.
          // The page rotates between refreshes so the sample is not always the same players.
          const page = options.samplePage ?? 1 + (Math.floor(runStart.getTime() / refreshEvery) % 3);
          const perDivision = Math.max(1, Math.ceil(sampledLimit / DIVISIONS.length));
          entries = [];
          for (const division of DIVISIONS) {
            if (ctx.outOfTime()) break;
            const pageEntries = await client.leaguePage(platform, tier, division, page);
            entries.push(...[...pageEntries].sort((a, b) => b.leaguePoints - a.leaguePoints).slice(0, perDivision));
          }
        }
        const rows: Array<typeof trackedSummoners.$inferInsert> = [];
        for (const e of entries) {
          let puuid = e.puuid;
          if (!puuid && e.summonerId) {
            if (ctx.outOfTime()) break;
            try {
              puuid = await client.puuidBySummonerId(platform, e.summonerId);
              result.puuidsResolved += 1;
            } catch (err) {
              noteError(platform, err);
              log(`puuid lookup failed on ${platform}: ${(err as Error).message}`);
              continue;
            }
          }
          if (puuid) rows.push({ puuid, platform, tier, leaguePoints: e.leaguePoints, lastSeenInLeagueAt: new Date() });
        }
        // One statement per 200 players instead of one per player: a full ladder is ~900 rows.
        for (let i = 0; i < rows.length; i += 200) {
          await db
            .insert(trackedSummoners)
            .values(rows.slice(i, i + 200))
            .onConflictDoUpdate({ target: trackedSummoners.puuid, set: { tier: sql`excluded.tier`, leaguePoints: sql`excluded.league_points`, lastSeenInLeagueAt: sql`excluded.last_seen_in_league_at` } });
        }
        result.playersUpserted += rows.length;
        log(`${platform} ${tier}: ${entries.length} players`);
        tiersFetched += 1;
        if (APEX_TIERS.has(tier)) apexFetched += 1;
      } catch (err) {
        noteError(platform, err);
        failure = explainRiotError(err);
        log(`league list failed for ${platform} ${tier}: ${(err as Error).message}`);
        if (err instanceof RiotApiError && (err.status === 401 || err.status === 403)) break;
      }
    }
    if (tiersFetched === options.tiers.length) {
      // With every apex tier refreshed, apex rows this run did not touch are players who left the
      // ladder, or ids fetched under a previous API key (Riot encrypts player ids per key, so
      // those can never be read again). Sampled-tier players are a rotating sample: they are kept
      // until unseen for a while, so the pool stays bounded without churning every refresh.
      const retention = new Date(runStart.getTime() - (options.sampledRetentionDays ?? 45) * 86_400_000);
      const apexCondition = apexFetched === apexTiers.length && apexTiers.length > 0 ? and(inArray(trackedSummoners.tier, apexTiers), lt(trackedSummoners.lastSeenInLeagueAt, runStart)) : sql`false`;
      const pruned = await db
        .delete(trackedSummoners)
        .where(and(eq(trackedSummoners.platform, platform), or(apexCondition, lt(trackedSummoners.lastSeenInLeagueAt, retention))))
        .returning({ puuid: trackedSummoners.puuid });
      result.playersPruned += pruned.length;
      if (pruned.length) log(`${platform}: pruned ${pruned.length} players no longer on the ladder (or stored under a previous key)`);
      result.leaguesRefreshed.push(platform);
      await touchRegion(db, platform, { leagueRefresh: true, error: null });
    } else if (failure) {
      await touchRegion(db, platform, { error: failure });
      errorRecorded.add(platform);
    }
  });

  // Match id discovery for the players least recently scanned, a fair share per platform.
  const lookbackStart = Math.floor(Date.now() / 1000) - options.lookbackDays * 86_400;
  const perPlatform = Math.max(1, Math.ceil(options.maxPlayersPerRun / platforms.length));
  const ranked = db
    .select({ puuid: trackedSummoners.puuid, platform: trackedSummoners.platform, tier: trackedSummoners.tier, matchListCursor: trackedSummoners.matchListCursor, rn: sql<number>`row_number() over (partition by ${trackedSummoners.platform} order by ${trackedSummoners.lastMatchListAt} asc nulls first)`.as("rn") })
    .from(trackedSummoners)
    .where(inArray(trackedSummoners.platform, platforms))
    .as("ranked");
  const players = await db
    .select({ puuid: ranked.puuid, platform: ranked.platform, tier: ranked.tier, matchListCursor: ranked.matchListCursor, rn: ranked.rn })
    .from(ranked)
    .where(sql`${ranked.rn} <= ${perPlatform}`)
    .orderBy(asc(ranked.rn), asc(ranked.platform))
    .limit(options.maxPlayersPerRun);

  const scannedPlatforms = new Set<string>();
  const haltedPlatforms = new Set<string>();
  for (const p of players) {
    if (ctx.outOfTime()) break;
    if (haltedPlatforms.has(p.platform)) continue;
    try {
      const startTime = p.matchListCursor ? Math.max(lookbackStart, p.matchListCursor - 3600) : lookbackStart;
      const ids = await client.matchIdsByPuuid(p.platform, p.puuid, { startTime, queue: 420, count: 100 });
      if (ids.length) {
        const inserted = await db
          .insert(matchFetchQueue)
          .values(ids.map((matchId) => ({ matchId, platform: p.platform, tierBand: tierBandFor(p.tier) })))
          .onConflictDoNothing()
          .returning({ matchId: matchFetchQueue.matchId });
        result.matchesQueued += inserted.length;
      }
      await db.update(trackedSummoners).set({ lastMatchListAt: new Date(), matchListCursor: Math.floor(Date.now() / 1000) }).where(eq(trackedSummoners.puuid, p.puuid));
      result.playersScanned += 1;
      scannedPlatforms.add(p.platform);
    } catch (err) {
      noteError(p.platform, err);
      log(`match list failed for ${p.puuid.slice(0, 8)}… (${platformLabel(p.platform)}): ${(err as Error).message}`);
      if (err instanceof RiotApiError && (err.status === 403 || err.status === 401)) break; // bad/expired key: stop early
      if (err instanceof RiotApiError && err.status === 429) haltedPlatforms.add(p.platform); // let the other regions use the run
      if (err instanceof RiotApiError && (err.status === 400 || err.status === 404)) {
        // Riot cannot decode this player id with the current key (ids are encrypted per key, so
        // this happens after RIOT_API_KEY changes) or the player no longer exists. Keeping the row
        // would make every run retry the same dead ids first; drop it and let the league list
        // re-add the player under an id this key can read.
        await db.delete(trackedSummoners).where(eq(trackedSummoners.puuid, p.puuid));
        result.playersDropped += 1;
      }
    }
  }
  for (const platform of scannedPlatforms) {
    await touchRegion(db, platform, { discover: true, error: result.platformErrors[platform] ?? null });
    errorRecorded.add(platform);
  }
  for (const [platform, error] of Object.entries(result.platformErrors)) if (!errorRecorded.has(platform)) await touchRegion(db, platform, { error });
  const [tracked] = await db.select({ n: sql<number>`count(*)` }).from(trackedSummoners).where(inArray(trackedSummoners.platform, platforms));
  result.playersTracked = Number(tracked?.n ?? 0);
  return result;
}

export interface IngestOptions {
  batchSize: number;
  maxAttempts: number;
  allowedQueueIds?: number[];
  /** Restrict to these platforms (default: whatever is queued). */
  platforms?: string[];
  /** Parallel regional workers (each holds one database connection while it fetches). */
  concurrency?: number;
}

export interface IngestResult {
  fetched: number;
  inserted: number;
  duplicates: number;
  skipped: number;
  failed: number;
  newestGameAt: number | null;
  lastError?: string;
  /** Matches stored per platform this run. */
  byPlatform: Record<string, number>;
  platformErrors: Record<string, string>;
}

/**
 * Steps 3–8: fetch queued matches, validate, normalise and store. Duplicate ids are impossible
 * (primary keys) and a failed match never blocks the rest of the batch.
 *
 * The queue is drained per regional host in parallel: Riot rate-limits each host separately, so
 * four regions ingest four times as fast as one, and a 429 on one host never stalls another.
 */
export async function ingestQueuedMatches(ctx: IngestionContext, options: IngestOptions): Promise<IngestResult> {
  const { db, client, log } = ctx;
  const keyToId = new Map((await db.select({ key: champions.key, id: champions.id }).from(champions)).map((c) => [c.key, c.id]));
  const result: IngestResult = { fetched: 0, inserted: 0, duplicates: 0, skipped: 0, failed: 0, newestGameAt: null, byPlatform: {}, platformErrors: {} };
  let keyRejected = false;

  const pendingPlatforms = (
    await db
      .select({ platform: matchFetchQueue.platform })
      .from(matchFetchQueue)
      .where(and(eq(matchFetchQueue.status, "pending"), lt(matchFetchQueue.attempts, options.maxAttempts)))
      .groupBy(matchFetchQueue.platform)
  )
    .map((r) => r.platform)
    .filter((p) => !options.platforms || options.platforms.includes(p));
  const byRegion = new Map<string, string[]>();
  for (const p of pendingPlatforms) {
    let region: string;
    try {
      region = regionFor(p);
    } catch {
      log(`skipping queued matches for unknown platform ${p}`);
      continue;
    }
    byRegion.set(region, [...(byRegion.get(region) ?? []), p]);
  }
  if (byRegion.size === 0) return result;
  const perRegionBatch = Math.max(5, Math.ceil(options.batchSize / byRegion.size));

  const worker = async (platforms: string[]) => {
    for (;;) {
      if (ctx.outOfTime() || keyRejected) return;
      // Round-robin across the host's servers and ladder bands (oldest first within each), so one
      // busy server or band never takes a whole host's share: production had OCE at 65 % of games
      // and Emerald at 1 % with Emerald matches waiting in the queue (docs/DATA_AUDIT.md).
      const fair = db
        .select({ matchId: matchFetchQueue.matchId, rn: sql<number>`row_number() over (partition by ${matchFetchQueue.platform}, coalesce(${matchFetchQueue.tierBand}, '') order by ${matchFetchQueue.discoveredAt} asc)`.as("rn") })
        .from(matchFetchQueue)
        .where(and(eq(matchFetchQueue.status, "pending"), lt(matchFetchQueue.attempts, options.maxAttempts), inArray(matchFetchQueue.platform, platforms)))
        .as("fair");
      const order = await db.select({ matchId: fair.matchId }).from(fair).orderBy(asc(fair.rn), asc(fair.matchId)).limit(perRegionBatch);
      const position = new Map(order.map((r, i) => [r.matchId, i]));
      const pending = order.length
        ? (await db.select().from(matchFetchQueue).where(inArray(matchFetchQueue.matchId, order.map((r) => r.matchId)))).sort((a, b) => (position.get(a.matchId) ?? 0) - (position.get(b.matchId) ?? 0))
        : [];
      if (pending.length === 0) return;
      let failedInBatch = 0;
      const touched = new Set<string>();
      for (const item of pending) {
        if (ctx.outOfTime() || keyRejected) break;
        const existing = await db.select({ id: rankedMatches.matchId }).from(rankedMatches).where(eq(rankedMatches.matchId, item.matchId)).limit(1);
        if (existing.length) {
          result.duplicates += 1;
          await db.update(matchFetchQueue).set({ status: "done", updatedAt: new Date() }).where(eq(matchFetchQueue.matchId, item.matchId));
          continue;
        }
        try {
          const raw = await client.match(item.platform, item.matchId);
          result.fetched += 1;
          const normalised = normaliseMatch(raw, item.platform, keyToId, { allowedQueueIds: options.allowedQueueIds });
          if (!normalised.ok) {
            result.skipped += 1;
            await db.update(matchFetchQueue).set({ status: "skipped", lastError: normalised.reason, updatedAt: new Date() }).where(eq(matchFetchQueue.matchId, item.matchId));
            continue;
          }
          const { match, participants, bans } = normalised.value;
          await db.transaction(async (tx) => {
            const rows = await tx.insert(rankedMatches).values({ ...match, tierBand: item.tierBand ?? null }).onConflictDoNothing().returning({ id: rankedMatches.matchId });
            if (rows.length === 0) {
              result.duplicates += 1;
              return;
            }
            await tx.insert(rankedParticipants).values(participants).onConflictDoNothing();
            if (bans.length) await tx.insert(rankedBans).values(bans).onConflictDoNothing();
            await tx.update(matchFetchQueue).set({ status: "done", updatedAt: new Date() }).where(eq(matchFetchQueue.matchId, item.matchId));
            result.inserted += 1;
            result.byPlatform[item.platform] = (result.byPlatform[item.platform] ?? 0) + 1;
            result.newestGameAt = Math.max(result.newestGameAt ?? 0, match.gameCreation);
            touched.add(item.platform);
          });
        } catch (err) {
          result.failed += 1;
          failedInBatch += 1;
          const message = (err as Error).message;
          result.lastError = explainRiotError(err);
          result.platformErrors[item.platform] = result.lastError;
          const permanent = err instanceof RiotApiError && !err.retryable && err.status !== 0;
          await db
            .update(matchFetchQueue)
            .set({ attempts: item.attempts + 1, lastError: message, status: permanent && err.status === 404 ? "failed" : "pending", updatedAt: new Date() })
            .where(eq(matchFetchQueue.matchId, item.matchId));
          log(`match ${item.matchId} failed: ${message}`);
          if (err instanceof RiotApiError && (err.status === 403 || err.status === 401)) {
            keyRejected = true;
            break;
          }
        }
      }
      for (const platform of touched) await touchRegion(db, platform, { ingest: true, error: null });
      // Stop this region when its queue is drained, the budget is spent, the key was rejected, or
      // the batch hit failures (they stay pending for the next run instead of a tight retry loop).
      if (keyRejected || pending.length < perRegionBatch || failedInBatch > 0 || ctx.outOfTime()) return;
    }
  };

  // Bounded parallelism: ingestion must leave database connections for the people using the app.
  await mapLimit([...byRegion.values()], options.concurrency ?? 4, (platforms) => worker(platforms));
  for (const [platform, error] of Object.entries(result.platformErrors)) await touchRegion(db, platform, { error });
  return result;
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
