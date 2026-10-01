import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { championMatchups, championRoleStats, championSynergies, matchFetchQueue, rankedMatches, rankedParticipants, statPeriods } from "@/server/db/schema";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { RiotApiClient } from "@/server/riot/api/client";
import { RateLimiter } from "@/server/riot/api/rate-limiter";
import type { RiotMatch } from "@/server/riot/api/schemas";
import { ingestQueuedMatches } from "@/server/ingestion/ranked";
import { aggregateRankedMatches } from "@/server/ingestion/aggregate";
import { normaliseMatch } from "@/server/ingestion/normalise";
import { loadStatsProvider } from "@/server/stats/loader";
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
});
