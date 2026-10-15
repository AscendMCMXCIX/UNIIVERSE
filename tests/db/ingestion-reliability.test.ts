import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { championRoleStats, champions, matchFetchQueue, rankedBans, rankedMatches, rankedParticipants, statPeriods } from "@/server/db/schema";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { RiotApiClient, RiotApiError } from "@/server/riot/api/client";
import { RateLimiter } from "@/server/riot/api/rate-limiter";
import type { RiotMatch } from "@/server/riot/api/schemas";
import { classifyMatchFailure, ingestQueuedMatches } from "@/server/ingestion/ranked";
import { aggregateRankedMatches, UNKNOWN_CHAMPION_GRACE_MS } from "@/server/ingestion/aggregate";
import fixture from "@/server/riot/fixtures/champions.fixture.json";

/*
  Ingestion and aggregation under failure: permanent Riot answers, rate limits, two aggregations at
  once, and a champion the static data does not know yet. Nothing may be lost or counted twice.
*/

const keyOf = (id: string) => Number(fixture.champions.find((c) => c.id === id)!.key);
const POSITIONS = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];

function fakeMatch(matchId: string, blue: Array<string | number>, red: Array<string | number>, gameCreation = Date.now()): RiotMatch {
  const key = (c: string | number) => (typeof c === "number" ? c : keyOf(c));
  return {
    metadata: { matchId },
    info: {
      gameCreation,
      gameDuration: 1800,
      gameVersion: "16.20.712.1",
      queueId: 420,
      teams: [
        { teamId: 100, win: true, bans: [] },
        { teamId: 200, win: false, bans: [] },
      ],
      participants: [
        ...blue.map((c, i) => ({ puuid: `b${i}-${matchId}`, teamId: 100, championId: key(c), teamPosition: POSITIONS[i]!, win: true, kills: 1, deaths: 1, assists: 1 })),
        ...red.map((c, i) => ({ puuid: `r${i}-${matchId}`, teamId: 200, championId: key(c), teamPosition: POSITIONS[i]!, win: false, kills: 1, deaths: 1, assists: 1 })),
      ],
    },
  };
}

const BLUE = ["Gwen", "Viego", "Orianna", "Jinx", "Lulu"];
const RED = ["Camille", "LeeSin", "Ahri", "Kaisa", "Nautilus"];

let handle: DbHandle;
beforeAll(async () => {
  handle = await testDb();
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
});
afterAll(async () => {
  await handle.close();
});

describe("what a failed match fetch means", () => {
  it("fails client errors for good, does not count rate limits, and retries server errors and odd responses", () => {
    expect(classifyMatchFailure(new RiotApiError("x", 404, false))).toBe("permanent");
    expect(classifyMatchFailure(new RiotApiError("x", 400, false))).toBe("permanent");
    expect(classifyMatchFailure(new RiotApiError("x", 429, true))).toBe("rate-limited");
    expect(classifyMatchFailure(new RiotApiError("x", 0, true))).toBe("rate-limited");
    expect(classifyMatchFailure(new RiotApiError("x", 503, true))).toBe("transient");
    // A 200 in an unexpected shape: a Riot-side change must not fail every match for good.
    expect(classifyMatchFailure(new RiotApiError("x", 200, false))).toBe("transient");
    expect(classifyMatchFailure(new RiotApiError("x", 403, false))).toBe("transient");
    expect(classifyMatchFailure(new Error("boom"))).toBe("transient");
  });

  it("a permanent failure no longer stops the region: the rest of the queue is still ingested", async () => {
    const db = handle.db;
    const served: Record<string, RiotMatch> = { EUW1_201: fakeMatch("EUW1_201", BLUE, RED), EUW1_202: fakeMatch("EUW1_202", BLUE, RED), EUW1_203: fakeMatch("EUW1_203", BLUE, RED) };
    const fetchImpl = async (input: string | URL | Request) => {
      const id = decodeURIComponent(/matches\/([^/?]+)$/.exec(String(input))?.[1] ?? "");
      if (id === "EUW1_200") return new Response(JSON.stringify({ status: { message: "bad request" } }), { status: 400 });
      const m = served[id];
      return m ? new Response(JSON.stringify(m), { status: 200, headers: { "content-type": "application/json" } }) : new Response("{}", { status: 404 });
    };
    const client = new RiotApiClient({ apiKey: "test", fetchImpl, limiter: new RateLimiter([{ requests: 100, seconds: 1 }]), sleep: async () => {} });
    // EUW1_200 sorts first, so it fails before the others are reached.
    await db.insert(matchFetchQueue).values(["EUW1_200", "EUW1_201", "EUW1_202", "EUW1_203"].map((matchId) => ({ matchId, platform: "euw1" })));
    const r = await ingestQueuedMatches({ db, client, log: () => {}, outOfTime: () => false }, { batchSize: 2, maxAttempts: 5 });
    expect(r.failed).toBe(1);
    expect(r.inserted).toBe(3);
    const [bad] = await db.select().from(matchFetchQueue).where(eq(matchFetchQueue.matchId, "EUW1_200"));
    expect(bad?.status).toBe("failed");
  });

  it("a rate-limited match keeps its attempts and stays queued", async () => {
    const db = handle.db;
    const client = new RiotApiClient({ apiKey: "test", fetchImpl: async () => new Response("", { status: 429, headers: { "retry-after": "0" } }), limiter: new RateLimiter([{ requests: 100, seconds: 1 }]), sleep: async () => {}, maxRetries: 1 });
    await db.insert(matchFetchQueue).values({ matchId: "EUW1_300", platform: "euw1", attempts: 2 });
    const r = await ingestQueuedMatches({ db, client, log: () => {}, outOfTime: () => false }, { batchSize: 5, maxAttempts: 5 });
    expect(r.failed).toBe(1);
    const [row] = await db.select().from(matchFetchQueue).where(eq(matchFetchQueue.matchId, "EUW1_300"));
    expect(row).toMatchObject({ status: "pending", attempts: 2 });
    await db.delete(matchFetchQueue).where(eq(matchFetchQueue.matchId, "EUW1_300"));
  });
});

async function storeMatch(m: RiotMatch, platform = "euw1") {
  const db = handle.db;
  const keyToId = new Map((await db.select({ key: champions.key, id: champions.id }).from(champions)).map((c) => [c.key, c.id]));
  await db.insert(rankedMatches).values({ matchId: m.metadata.matchId, platform, gameVersion: m.info.gameVersion, patch: "16.20", queueId: 420, gameCreation: m.info.gameCreation, gameDuration: m.info.gameDuration, winningTeamId: 100 });
  await db.insert(rankedParticipants).values(m.info.participants.map((p) => ({ matchId: m.metadata.matchId, puuid: p.puuid, teamId: p.teamId, championKey: p.championId, championId: keyToId.get(p.championId) ?? null, position: p.teamPosition, win: p.win, kills: 1, deaths: 1, assists: 1 })));
}

describe("aggregation under concurrency and unknown champions", () => {
  it("two aggregations at once fold every match exactly once", async () => {
    const db = handle.db;
    await aggregateRankedMatches(db); // fold whatever earlier tests stored
    const before = (await db.select().from(statPeriods).where(eq(statPeriods.patch, "16.20"))).reduce((s, p) => s + p.games, 0);
    const ids = Array.from({ length: 40 }, (_, i) => `EUW1_C${i}`);
    for (const id of ids) await storeMatch(fakeMatch(id, BLUE, RED));
    const [a, b] = await Promise.all([aggregateRankedMatches(db, { batchSize: 7 }), aggregateRankedMatches(db, { batchSize: 7 })]);
    expect(a.matches + b.matches).toBe(40);
    const after = (await db.select().from(statPeriods).where(eq(statPeriods.patch, "16.20"))).reduce((s, p) => s + p.games, 0);
    expect(after - before).toBe(40);
    const unaggregated = await db.select().from(rankedMatches).where(inArray(rankedMatches.matchId, ids));
    expect(unaggregated.every((m) => m.aggregatedAt !== null)).toBe(true);
  });

  it("waits for a champion the static data does not know yet, then folds its role statistics in", async () => {
    const db = handle.db;
    const NEW_KEY = 9901;
    await storeMatch(fakeMatch("EUW1_NEW1", [NEW_KEY, ...BLUE.slice(1)], RED));
    // Older than the grace period: folded in as it is (the unknown champion's lane is lost, as before).
    await storeMatch(fakeMatch("EUW1_OLD1", [NEW_KEY, ...BLUE.slice(1)], RED, Date.now() - UNKNOWN_CHAMPION_GRACE_MS - 60_000));
    const first = await aggregateRankedMatches(db);
    expect(first.deferred).toBe(1);
    expect(first.matches).toBe(1);
    const [waiting] = await db.select().from(rankedMatches).where(eq(rankedMatches.matchId, "EUW1_NEW1"));
    expect(waiting?.aggregatedAt).toBeNull();

    // The next static sync learns the champion: the deferred match now contributes its roles.
    await db.insert(champions).values({ id: "Newcomer", key: NEW_KEY, name: "Newcomer", imageFull: "Newcomer.png", firstSeenVersion: "16.20.1", lastSeenVersion: "16.20.1", source: "fixture" });
    const viegoBefore = (await db.select().from(championRoleStats).where(eq(championRoleStats.championId, "Viego"))).reduce((s, r) => s + r.games, 0);
    const second = await aggregateRankedMatches(db);
    expect(second).toMatchObject({ matches: 1, deferred: 0 });
    const newcomer = await db.select().from(championRoleStats).where(eq(championRoleStats.championId, "Newcomer"));
    expect(newcomer.reduce((s, r) => s + r.games, 0)).toBe(1);
    const viegoAfter = (await db.select().from(championRoleStats).where(eq(championRoleStats.championId, "Viego"))).reduce((s, r) => s + r.games, 0);
    expect(viegoAfter - viegoBefore).toBe(1);
    expect(await db.select().from(rankedBans)).toBeDefined();
  });
});
