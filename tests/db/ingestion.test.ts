import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { championMatchups, championRoleStats, championSynergies, matchFetchQueue, rankedMatches, rankedParticipants, statPeriods, trackedSummoners } from "@/server/db/schema";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { RiotApiClient } from "@/server/riot/api/client";
import { RateLimiter } from "@/server/riot/api/rate-limiter";
import type { RiotMatch } from "@/server/riot/api/schemas";
import { discoverRankedMatches, ingestQueuedMatches } from "@/server/ingestion/ranked";
import { aggregateRankedMatches } from "@/server/ingestion/aggregate";
import { normaliseMatch } from "@/server/ingestion/normalise";
import { loadStatsProvider } from "@/server/stats/loader";
import { coverageWarnings, getGlobalCoverage } from "@/server/ops/coverage";
import { regionStatus, statRankPeriods, statRegionPeriods } from "@/server/db/schema";
import fixture from "@/server/riot/fixtures/champions.fixture.json";

const keyOf = (id: string) => fixture.champions.find((c) => c.id === id)!.key;

function fakeMatch(matchId: string, blue: string[], red: string[], blueWins = true, overrides: Partial<RiotMatch["info"]> = {}): RiotMatch {
  const positions = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];
  const participants = [
    ...blue.map((id, i) => ({ puuid: `b${i}-${matchId}`, teamId: 100, championId: keyOf(id), teamPosition: positions[i]!, win: blueWins, kills: 1, deaths: 1, assists: 1 })),
    ...red.map((id, i) => ({ puuid: `r${i}-${matchId}`, teamId: 200, championId: keyOf(id), teamPosition: positions[i]!, win: !blueWins, kills: 1, deaths: 1, assists: 1 })),
  ];
  return {
    metadata: { matchId },
    info: {
      gameCreation: Date.now(),
      gameDuration: 1800,
      gameVersion: "15.19.712.1",
      queueId: 420,
      teams: [
        { teamId: 100, win: blueWins, bans: [{ championId: keyOf("Darius"), pickTurn: 1 }] },
        { teamId: 200, win: !blueWins, bans: [{ championId: keyOf("Jinx"), pickTurn: 2 }] },
      ],
      participants,
      ...overrides,
    },
  };
}

/** Fake fetch serving the Riot API routes we use. */
function fakeRiotFetch(matches: Record<string, RiotMatch>, behaviour: { rateLimitFirst?: boolean; calls: string[] }) {
  let limited = behaviour.rateLimitFirst ?? false;
  return async (input: string | URL | Request): Promise<Response> => {
    const url = String(input);
    behaviour.calls.push(url);
    if (limited) {
      limited = false;
      return new Response("", { status: 429, headers: { "retry-after": "0" } });
    }
    const m = /\/lol\/match\/v5\/matches\/([^/?]+)$/.exec(url);
    if (m) {
      const match = matches[decodeURIComponent(m[1]!)];
      if (!match) return new Response(JSON.stringify({ status: { message: "not found" } }), { status: 404 });
      return new Response(JSON.stringify(match), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response("{}", { status: 404 });
  };
}

let handle: DbHandle;
beforeAll(async () => {
  handle = await testDb();
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
});
afterAll(async () => {
  await handle.close();
});

describe("match normalisation", () => {
  const keyToId = new Map(fixture.champions.map((c) => [c.key, c.id]));
  it("rejects remakes and non-ranked queues", () => {
    const m = fakeMatch("EUW1_1", ["Gwen", "Viego", "Orianna", "Jinx", "Lulu"], ["Camille", "LeeSin", "Ahri", "Kaisa", "Nautilus"]);
    expect(normaliseMatch({ ...m, info: { ...m.info, gameDuration: 200 } }, "euw1", keyToId).ok).toBe(false);
    expect(normaliseMatch({ ...m, info: { ...m.info, queueId: 400 } }, "euw1", keyToId).ok).toBe(false);
    const ok = normaliseMatch(m, "euw1", keyToId);
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.value.match.patch).toBe("15.19");
      expect(ok.value.rolesReliable).toBe(true);
      expect(ok.value.participants.find((p) => p.puuid === "b0-EUW1_1")?.championId).toBe("Gwen");
    }
  });
  it("marks inconsistent positions as unreliable instead of dropping the match", () => {
    const m = fakeMatch("EUW1_2", ["Gwen", "Viego", "Orianna", "Jinx", "Lulu"], ["Camille", "LeeSin", "Ahri", "Kaisa", "Nautilus"]);
    m.info.participants[1]!.teamPosition = "TOP";
    const r = normaliseMatch(m, "euw1", keyToId);
    expect(r.ok && r.value.rolesReliable).toBe(false);
  });
});

describe("ranked ingestion", () => {
  it("ingests queued matches once, skips duplicates and tolerates missing matches", async () => {
    const db = handle.db;
    const matches = {
      EUW1_100: fakeMatch("EUW1_100", ["Gwen", "Viego", "Orianna", "Jinx", "Lulu"], ["Camille", "LeeSin", "Ahri", "Kaisa", "Nautilus"], true),
      EUW1_101: fakeMatch("EUW1_101", ["Ornn", "Sejuani", "Azir", "Varus", "Braum"], ["Gwen", "Viego", "Orianna", "Jinx", "Lulu"], false),
    };
    const calls: string[] = [];
    const client = new RiotApiClient({ apiKey: "test", fetchImpl: fakeRiotFetch(matches, { calls }), limiter: new RateLimiter([{ requests: 100, seconds: 1 }]), sleep: async () => {} });
    await db.insert(matchFetchQueue).values([{ matchId: "EUW1_100", platform: "euw1" }, { matchId: "EUW1_101", platform: "euw1" }, { matchId: "EUW1_404", platform: "euw1" }]).onConflictDoNothing();
    // Queueing the same id twice is impossible.
    await db.insert(matchFetchQueue).values([{ matchId: "EUW1_100", platform: "euw1" }]).onConflictDoNothing();
    const ctx = { db, client, log: () => {}, outOfTime: () => false };
    const first = await ingestQueuedMatches(ctx, { batchSize: 10, maxAttempts: 3 });
    expect(first.inserted).toBe(2);
    expect(first.failed).toBe(1);
    expect(await db.select().from(rankedMatches)).toHaveLength(2);
    expect(await db.select().from(rankedParticipants)).toHaveLength(20);

    // Re-queue an already stored match: it must not be fetched or stored again.
    await db.update(matchFetchQueue).set({ status: "pending" }).where(eq(matchFetchQueue.matchId, "EUW1_100"));
    const callsBefore = calls.length;
    const second = await ingestQueuedMatches(ctx, { batchSize: 10, maxAttempts: 3 });
    expect(second.duplicates).toBe(1);
    expect(second.inserted).toBe(0);
    expect(calls.length).toBe(callsBefore); // nothing fetched: duplicate skipped, 404 already failed
    expect(await db.select().from(rankedMatches)).toHaveLength(2);
  });

  it("aggregates each match exactly once, even when run repeatedly", async () => {
    const db = handle.db;
    const first = await aggregateRankedMatches(db);
    expect(first.matches).toBe(2);
    const again = await aggregateRankedMatches(db);
    expect(again.matches).toBe(0);
    const gwen = await db.select().from(championRoleStats).where(eq(championRoleStats.championId, "Gwen"));
    expect(gwen).toHaveLength(1);
    expect(gwen[0]?.games).toBe(2);
    expect(gwen[0]?.wins).toBe(2); // won both (blue win in 100, red win in 101)
    const period = await db.select().from(statPeriods);
    expect(period.find((p) => p.source === "ranked")?.games).toBe(2);
    const lane = await db.select().from(championMatchups).where(eq(championMatchups.championId, "Gwen"));
    expect(lane.some((l) => l.enemyChampionId === "Camille" && l.enemyRole === "TOP" && l.games === 1 && l.wins === 1)).toBe(true);
    const syn = await db.select().from(championSynergies);
    expect(syn.some((s) => (s.championAId === "Gwen" && s.championBId === "Viego") || (s.championAId === "Viego" && s.championBId === "Gwen"))).toBe(true);

    // The engine's provider now sees ranked data (not demo) for this patch.
    const stats = await loadStatsProvider(db);
    expect(stats.describe().sources).toContain("ranked");
    expect(stats.strength("Gwen", "TOP").games).toBe(2);
  });
});

describe("riot client", () => {
  it("retries after a 429 and honours Retry-After", async () => {
    const calls: string[] = [];
    const m = fakeMatch("EUW1_7", ["Gwen", "Viego", "Orianna", "Jinx", "Lulu"], ["Camille", "LeeSin", "Ahri", "Kaisa", "Nautilus"]);
    const client = new RiotApiClient({ apiKey: "k", fetchImpl: fakeRiotFetch({ EUW1_7: m }, { rateLimitFirst: true, calls }), limiter: new RateLimiter([{ requests: 100, seconds: 1 }], () => Date.now(), async () => {}), sleep: async () => {} });
    const result = await client.match("euw1", "EUW1_7");
    expect(result.metadata.matchId).toBe("EUW1_7");
    expect(calls).toHaveLength(2);
  });

  it("rate limiter blocks once the window is full", async () => {
    let t = 0;
    const sleeps: number[] = [];
    const limiter = new RateLimiter([{ requests: 2, seconds: 1 }], () => t, async (ms) => { sleeps.push(ms); t += ms; });
    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();
    expect(sleeps.length).toBeGreaterThan(0);
    expect(t).toBeGreaterThanOrEqual(1000);
  });

  it("discovery prunes players the league lists no longer return and drops ids the key cannot read", async () => {
    const db = handle.db;
    // Two rows from an earlier run: one still on the ladder, one stored under a previous key.
    const earlier = new Date(Date.now() - 3600_000);
    await db.insert(trackedSummoners).values([
      { puuid: "old-key-puuid", platform: "oc1", tier: "CHALLENGER", leaguePoints: 900, lastSeenInLeagueAt: earlier },
      { puuid: "still-here", platform: "oc1", tier: "CHALLENGER", leaguePoints: 800, lastSeenInLeagueAt: earlier },
      { puuid: "other-platform", platform: "kr", tier: "CHALLENGER", leaguePoints: 700, lastSeenInLeagueAt: earlier },
    ]);
    const calls: string[] = [];
    const fetchImpl = async (input: string | URL | Request): Promise<Response> => {
      const url = String(input);
      calls.push(url);
      if (url.includes("/lol/league/v4/")) return new Response(JSON.stringify({ tier: "CHALLENGER", entries: [{ puuid: "still-here", leaguePoints: 850 }, { puuid: "unreadable", leaguePoints: 700 }] }), { status: 200 });
      if (url.includes("/by-puuid/unreadable/")) return new Response(JSON.stringify({ status: { message: "Bad Request - Exception decoding path parameter", status_code: 400 } }), { status: 400 });
      if (url.includes("/by-puuid/still-here/")) return new Response(JSON.stringify(["OC1_1", "OC1_2"]), { status: 200 });
      return new Response("{}", { status: 404 });
    };
    const client = new RiotApiClient({ apiKey: "RGAPI-test", fetchImpl, limiter: new RateLimiter([{ requests: 100, seconds: 1 }]), sleep: async () => {} });
    const result = await discoverRankedMatches({ db, client, log: () => {}, outOfTime: () => false }, { platforms: ["oc1"], tiers: ["CHALLENGER"], maxPlayersPerTier: 10, lookbackDays: 7, maxPlayersPerRun: 10 });
    expect(result.playersPruned).toBe(1); // old-key-puuid: not in this run's league list
    expect(result.playersDropped).toBe(1); // unreadable: Riot answered 400
    expect(result.playersScanned).toBe(1);
    expect(result.matchesQueued).toBe(2);
    const left = (await db.select({ puuid: trackedSummoners.puuid }).from(trackedSummoners)).map((r) => r.puuid).sort();
    expect(left).toEqual(["other-platform", "still-here"]); // other platforms are untouched
  });

  it("always leaves time to scan match lists: ladder refreshes stop at their share of the run", async () => {
    const db = handle.db;
    await db.insert(trackedSummoners).values([{ puuid: "tw-known", platform: "tw2", tier: "CHALLENGER", leaguePoints: 900, lastSeenInLeagueAt: new Date(Date.now() - 86_400_000) }]);
    const calls: string[] = [];
    const fetchImpl = async (input: string | URL | Request): Promise<Response> => {
      const url = String(input);
      calls.push(url);
      if (url.includes("/by-puuid/tw-known/")) return new Response(JSON.stringify(["TW2_9", "TW2_10"]), { status: 200 });
      return new Response(JSON.stringify({ tier: "CHALLENGER", entries: [] }), { status: 200 });
    };
    const client = new RiotApiClient({ apiKey: "RGAPI-test", fetchImpl, limiter: new RateLimiter([{ requests: 100, seconds: 1 }]), sleep: async () => {} });
    // The refresh share is already used up (as when ladder pages are slow): no ladder request is
    // made, the region stays due for a refresh, and the run still scans and queues new match ids.
    const result = await discoverRankedMatches({ db, client, log: () => {}, outOfTime: () => false, refreshOutOfTime: () => true }, { platforms: ["tw2"], tiers: ["CHALLENGER"], maxPlayersPerTier: 10, lookbackDays: 7, maxPlayersPerRun: 10 });
    expect(calls.some((u) => u.includes("/lol/league/v4/"))).toBe(false);
    expect(result.leaguesRefreshed).toEqual([]);
    expect(result.playersPruned).toBe(0);
    expect(result.playersScanned).toBe(1);
    expect(result.matchesQueued).toBe(2);
    const [status] = await db.select().from(regionStatus).where(eq(regionStatus.platform, "tw2"));
    expect(status?.lastLeagueRefreshAt ?? null).toBeNull();
  });

  it("collects region by region: ladders refreshed in parallel per host, errors recorded per region, coverage reported honestly", async () => {
    const db = handle.db;
    const calls: string[] = [];
    const fetchImpl = async (input: string | URL | Request): Promise<Response> => {
      const url = String(input);
      calls.push(url);
      const host = new URL(url).hostname.split(".")[0]!;
      if (url.includes("/lol/league/v4/")) {
        if (host === "jp1") return new Response(JSON.stringify({ status: { message: "Service unavailable", status_code: 503 } }), { status: 503 });
        return new Response(JSON.stringify({ tier: "CHALLENGER", entries: [{ puuid: `${host}-p1`, leaguePoints: 900 }, { puuid: `${host}-p2`, leaguePoints: 800 }] }), { status: 200 });
      }
      const m = /\/by-puuid\/([^/]+)\/ids/.exec(url);
      if (m) return new Response(JSON.stringify([`${m[1]!.split("-")[0]!.toUpperCase()}_${m[1]}_1`]), { status: 200 });
      return new Response("{}", { status: 404 });
    };
    const client = new RiotApiClient({ apiKey: "RGAPI-test", fetchImpl, limiter: new RateLimiter([{ requests: 1000, seconds: 1 }]), sleep: async () => {}, maxRetries: 0 });
    const platforms = ["na1", "jp1", "br1", "la1"];
    const result = await discoverRankedMatches({ db, client, log: () => {}, outOfTime: () => false }, { platforms, tiers: ["CHALLENGER"], maxPlayersPerTier: 10, lookbackDays: 7, maxPlayersPerRun: 8, maxLeagueRefreshesPerRun: 3, leagueRefreshMinutes: 60 });
    // Only three ladders per run (stalest first; all equal here → the first three configured); jp1 fails.
    expect(result.leaguesRefreshed.sort()).toEqual(["br1", "na1"]);
    expect(result.platformErrors.jp1).toMatch(/Riot API 503/);
    expect(result.playersUpserted).toBe(4);
    // Match lists: a fair share per platform (2 each for na1 and br1; jp1 and la1 have no players yet).
    expect(result.playersScanned).toBe(4);
    expect(result.matchesQueued).toBe(4);
    const statuses = await db.select().from(regionStatus);
    expect(statuses.find((s) => s.platform === "jp1")?.lastError).toMatch(/503/);
    expect(statuses.find((s) => s.platform === "na1")?.lastLeagueRefreshAt).not.toBeNull();
    expect(statuses.find((s) => s.platform === "na1")?.lastDiscoverAt).not.toBeNull();
    // A second run refreshes the ladder that was skipped (la1) and retries jp1, never the fresh ones.
    const second = await discoverRankedMatches({ db, client, log: () => {}, outOfTime: () => false }, { platforms, tiers: ["CHALLENGER"], maxPlayersPerTier: 10, lookbackDays: 7, maxPlayersPerRun: 8, maxLeagueRefreshesPerRun: 3, leagueRefreshMinutes: 60 });
    expect(second.leaguesRefreshed).toContain("la1");
    expect(second.leaguesRefreshed).not.toContain("na1");

    // Coverage: configured regions without games are "no data"/"error", never healthy.
    const coverage = await getGlobalCoverage(db, { platformSpec: "na1,jp1,br1,la1,kr", currentPatch: "15.19", riotConfigured: true });
    const by = Object.fromEntries(coverage.regions.map((r) => [r.platform, r]));
    expect(by.na1!.configured).toBe(true);
    expect(by.na1!.status).toBe("no-data"); // scanned, matches queued, none stored yet
    expect(by.jp1!.status).toBe("error");
    expect(by.kr!.status).toBe("pending"); // configured, never reached
    expect(by.oc1!.status).toBe("not-configured");
    expect(by.euw1!.status).toBe("not-configured"); // has data from the earlier test but is not in this spec
    expect(by.euw1!.totalGames).toBe(2);
    expect(coverage.withCurrentData).toBe(0);
    const warnings = coverageWarnings(coverage, true);
    expect(warnings.join(" ")).toMatch(/5 of 5 configured regions have no current-patch games/);
    expect(warnings.join(" ")).toMatch(/JP/);
    // The aggregated sample from the earlier test records its region provenance.
    const periods = await db.select().from(statRegionPeriods);
    expect(periods.find((p) => p.platform === "euw1" && p.source === "ranked")?.games).toBe(2);
    expect(periods[0]?.tierPopulation).toBe("EMERALD+");
    const stats = await loadStatsProvider(db);
    expect(stats.describe().provenance?.regions).toEqual(["euw1"]);
    // Region coverage reports current-patch games for euw1 once matches exist on that patch.
    const withGames = await getGlobalCoverage(db, { platformSpec: "all", currentPatch: "15.19", riotConfigured: true });
    expect(withGames.regions.find((r) => r.platform === "euw1")?.currentPatchGames).toBe(2);
    expect(withGames.configured.length).toBeGreaterThanOrEqual(16);
  });

  it("samples Emerald and Diamond ladders by division page and keeps the band from player to aggregate", async () => {
    const db = handle.db;
    const calls: string[] = [];
    const match = fakeMatch("EUN1_900", ["Gwen", "Viego", "Orianna", "Jinx", "Lulu"], ["Camille", "LeeSin", "Ahri", "Kaisa", "Nautilus"], true);
    const fetchImpl = async (input: string | URL | Request): Promise<Response> => {
      const url = String(input);
      calls.push(url);
      const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
      if (url.includes("/challengerleagues/")) return json({ tier: "CHALLENGER", entries: [{ puuid: "eun-chall", leaguePoints: 1200 }] });
      const page = /\/entries\/RANKED_SOLO_5x5\/(EMERALD|DIAMOND)\/(I|II|III|IV)\?page=(\d+)/.exec(url);
      if (page) return json([{ puuid: `eun-${page[1]!.toLowerCase()}-${page[2]}-a`, leaguePoints: 60 }, { puuid: `eun-${page[1]!.toLowerCase()}-${page[2]}-b`, leaguePoints: 40 }]);
      if (url.includes("/by-puuid/eun-emerald-I-a/ids")) return json(["EUN1_900"]);
      if (url.includes("/ids?")) return json([]);
      if (url.includes("/lol/match/v5/matches/EUN1_900")) return json(match);
      return json({}, 404);
    };
    const client = new RiotApiClient({ apiKey: "RGAPI-test", fetchImpl, limiter: new RateLimiter([{ requests: 1000, seconds: 1 }]), sleep: async () => {}, maxRetries: 0 });
    const ctx = { db, client, log: () => {}, outOfTime: () => false };
    const result = await discoverRankedMatches(ctx, { platforms: ["eun1"], tiers: ["CHALLENGER", "DIAMOND", "EMERALD"], maxPlayersPerTier: 10, maxPlayersPerSampledTier: 4, samplePage: 2, lookbackDays: 7, maxPlayersPerRun: 20 });
    // One apex list plus one page per division for each sampled tier; one player per division page (4 per tier).
    expect(calls.filter((u) => u.includes("/entries/RANKED_SOLO_5x5/EMERALD/")).length).toBe(4);
    expect(calls.some((u) => u.includes("/EMERALD/III?page=2"))).toBe(true);
    expect(result.playersUpserted).toBe(1 + 4 + 4);
    const tracked = await db.select().from(trackedSummoners).where(eq(trackedSummoners.platform, "eun1"));
    expect(new Set(tracked.map((t) => t.tier))).toEqual(new Set(["CHALLENGER", "DIAMOND", "EMERALD"]));
    const queued = await db.select().from(matchFetchQueue).where(eq(matchFetchQueue.matchId, "EUN1_900"));
    expect(queued[0]?.tierBand).toBe("EMERALD");
    await ingestQueuedMatches(ctx, { batchSize: 10, maxAttempts: 3, platforms: ["eun1"] });
    const stored = await db.select().from(rankedMatches).where(eq(rankedMatches.matchId, "EUN1_900"));
    expect(stored[0]?.tierBand).toBe("EMERALD");
    await aggregateRankedMatches(db);
    const bands = await db.select().from(statRankPeriods);
    expect(bands.find((b) => b.tierBand === "EMERALD" && b.patch === "15.19")?.games).toBe(1);
    const roleRows = await db.select().from(championRoleStats).where(eq(championRoleStats.tierBand, "EMERALD"));
    expect(roleRows.length).toBe(10);
    // Provenance reaches the statistics description: the band and its weight are visible.
    const stats = await loadStatsProvider(db);
    expect(stats.describe().provenance?.tierBands?.EMERALD).toBe(1);
    expect(stats.describe().provenance?.tierWeights?.EMERALD).toBeLessThan(1);
    // A second refresh never prunes sampled players that were simply not on this run's page.
    const again = await discoverRankedMatches(ctx, { platforms: ["eun1"], tiers: ["CHALLENGER", "DIAMOND", "EMERALD"], maxPlayersPerTier: 10, maxPlayersPerSampledTier: 4, samplePage: 3, lookbackDays: 7, maxPlayersPerRun: 20, leagueRefreshMinutes: 0 });
    expect(again.playersPruned).toBe(0);
  });

  it("ingests queued matches for several regions in parallel, each on its own host budget", async () => {
    const db = handle.db;
    const matches = {
      KR_300: fakeMatch("KR_300", ["Gwen", "Viego", "Orianna", "Jinx", "Lulu"], ["Camille", "LeeSin", "Ahri", "Kaisa", "Nautilus"], true),
      NA1_301: fakeMatch("NA1_301", ["Ornn", "Sejuani", "Azir", "Varus", "Braum"], ["Gwen", "Viego", "Orianna", "Jinx", "Lulu"], false),
      OC1_302: fakeMatch("OC1_302", ["Ornn", "Sejuani", "Azir", "Varus", "Braum"], ["Gwen", "Viego", "Orianna", "Jinx", "Lulu"], true),
    };
    const calls: string[] = [];
    const client = new RiotApiClient({ apiKey: "test", fetchImpl: fakeRiotFetch(matches, { calls }), sleep: async () => {} });
    // Ids queued by the discovery test above are not served by this fake: park them first.
    await db.update(matchFetchQueue).set({ status: "skipped" }).where(eq(matchFetchQueue.status, "pending"));
    await db.insert(matchFetchQueue).values([{ matchId: "KR_300", platform: "kr" }, { matchId: "NA1_301", platform: "na1" }, { matchId: "OC1_302", platform: "oc1" }]).onConflictDoNothing();
    const result = await ingestQueuedMatches({ db, client, log: () => {}, outOfTime: () => false }, { batchSize: 10, maxAttempts: 3 });
    expect(result.inserted).toBe(3);
    expect(result.byPlatform).toEqual({ kr: 1, na1: 1, oc1: 1 });
    expect(new Set(calls.map((u) => new URL(u).hostname.split(".")[0]))).toEqual(new Set(["asia", "americas", "sea"]));
    expect(client.limiters.report().map((r) => r.host).sort()).toEqual(["americas", "asia", "sea"]);
    const statuses = await db.select().from(regionStatus);
    for (const p of ["kr", "na1", "oc1"]) expect(statuses.find((s) => s.platform === p)?.lastIngestAt).not.toBeNull();
  });
});
