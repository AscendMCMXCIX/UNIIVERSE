import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatches, matchDetails, riotAccounts, type MatchParticipantDetail } from "@/server/db/schema";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { backfillFigures, figuresCoverage } from "@/server/accounts/figures-backfill";
import { accountRows } from "@/server/accounts/account-rows";
import { RiotApiClient, type RiotClientOptions } from "@/server/riot/api/client";
import { RateLimiter } from "@/server/riot/api/rate-limiter";
import fixture from "@/server/riot/fixtures/champions.fixture.json";

/*
  The figures backfill (synthetic data): a linked player's Season 2026 games stored before the extra
  figures were kept get their record fetched again, once each, newest first, and their multikill
  counts copied; a record Riot no longer serves, or one stored as unavailable, is marked and never
  asked for again; games of an earlier season and games that already have figures are left alone;
  a refusal stops the run without marking anything.
*/

let handle: DbHandle;
let account: string;
const keyOf = (id: string) => fixture.champions.find((c) => c.id === id)!.key;
const IN_SEASON = Date.UTC(2026, 5, 1);
const EARLIER = Date.UTC(2025, 5, 1);

/** A stored participant as the details looked before Phase 14: no `stats`. */
const oldPart = (puuid: string, teamId: number): MatchParticipantDetail => ({ puuid, name: null, teamId, championId: "Ahri", championKey: keyOf("Ahri"), champLevel: 15, position: "MIDDLE", win: teamId === 100, kills: 3, deaths: 2, assists: 4, cs: 150, gold: 9000, damage: 12000, damageTaken: 15000, vision: 20, wardsPlaced: 8, items: null, spells: null, runes: null });

/** Riot's record of the same game, which carries the multikill counts. */
function riotMatch(matchId: string, created: number) {
  const participants = Array.from({ length: 10 }, (_, i) => ({
    puuid: i === 0 ? "puuid-me" : `${matchId}-${i}`,
    riotIdGameName: i === 0 ? "Me" : `P${i}`,
    riotIdTagline: "OCE",
    teamId: i < 5 ? 100 : 200,
    championId: keyOf("Ahri"),
    championName: "Ahri",
    champLevel: 16,
    teamPosition: "MIDDLE",
    win: i < 5,
    kills: 6,
    deaths: 2,
    assists: 8,
    totalMinionsKilled: 180,
    neutralMinionsKilled: 12,
    goldEarned: 12_000,
    totalDamageDealtToChampions: 27_000,
    totalDamageTaken: 20_000,
    visionScore: 24,
    wardsPlaced: 10,
    doubleKills: i === 0 ? 3 : 0,
    tripleKills: i === 0 ? 1 : 0,
    quadraKills: 0,
    pentaKills: i === 0 ? 1 : 0,
    largestMultiKill: i === 0 ? 5 : 1,
  }));
  return { metadata: { matchId, participants: participants.map((p) => p.puuid) }, info: { gameCreation: created, gameDuration: 1800, gameVersion: "16.11.1.1", queueId: 420, teams: [{ teamId: 100, win: true, bans: [], objectives: {} }, { teamId: 200, win: false, bans: [], objectives: {} }], participants } };
}

function client(calls: string[], refuse = false, options: Partial<RiotClientOptions> = {}) {
  const fetchImpl = async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    if (refuse) return new Response(JSON.stringify({ status: { message: "Forbidden" } }), { status: 403, headers: { "content-type": "application/json" } });
    const id = /\/matches\/([^/?]+)$/.exec(url)?.[1];
    if (id === "OC1_FIGS" || id === "OC1_FIGS2") return new Response(JSON.stringify(riotMatch(id, IN_SEASON)), { status: 200, headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify({ status: { message: "not found" } }), { status: 404, headers: { "content-type": "application/json" } });
  };
  return new RiotApiClient({ apiKey: "k", fetchImpl, limiter: new RateLimiter([{ requests: 1000, seconds: 1 }]), sleep: async () => {}, ...options });
}

const row = async (matchId: string) => (await handle.db.select().from(accountMatches).where(eq(accountMatches.matchId, matchId)))[0]!;

beforeAll(async () => {
  handle = await testDb();
  const db = handle.db;
  await syncStaticData(db, new FixtureStaticProvider(), { fingerprint: false });
  const teamId = (await getOrCreateTeam(db)).id;
  const p = await createPlayer(db, teamId, { displayName: "Figures", primaryRole: "MID", primaryPool: ["Ahri"] });
  [{ id: account }] = (await db.insert(riotAccounts).values({ ownerType: "player", playerId: p.id, gameName: "me", tagLine: "OCE", platform: "oc1", puuid: "puuid-me", label: "main" }).returning({ id: riotAccounts.id })) as [{ id: string }];
  const game = (matchId: string, gameCreation: number, extraStats: Record<string, number> | null = null) => ({ accountId: account, matchId, gameCreation, queueId: 420, championId: "Ahri", role: "MID", win: true, patch: gameCreation === EARLIER ? "15.11" : "16.11", gameDuration: 1800, kills: 6, deaths: 2, assists: 8, extraStats, summarisedAt: new Date() });
  await db.insert(accountMatches).values([
    game("OC1_FIGS", IN_SEASON + 3_000),
    game("OC1_FIGS2", IN_SEASON + 2_000),
    game("OC1_GONE", IN_SEASON + 1_000),
    game("OC1_UNAVAILABLE", IN_SEASON),
    game("OC1_HAS", IN_SEASON, { doubleKills: 1, tripleKills: 0, quadraKills: 0, pentaKills: 0 }),
    game("OC1_2025", EARLIER),
  ]);
  const details = (matchId: string, created: number, participants: MatchParticipantDetail[]) => ({ matchId, platform: "oc1", queueId: 420, gameCreation: created, gameDuration: 1800, gameVersion: "16.11.1.1", teams: [], participants });
  await db.insert(matchDetails).values([
    details("OC1_FIGS", IN_SEASON + 3_000, [oldPart("puuid-me", 100), oldPart("x", 200)]),
    details("OC1_FIGS2", IN_SEASON + 2_000, [oldPart("puuid-me", 100), oldPart("y", 200)]),
    details("OC1_GONE", IN_SEASON + 1_000, [oldPart("puuid-me", 100)]),
    // Stored as unavailable before (no players): nothing to ask Riot for.
    details("OC1_UNAVAILABLE", IN_SEASON, []),
    details("OC1_HAS", IN_SEASON, [{ ...oldPart("puuid-me", 100), stats: { doubleKills: 1 } }]),
    details("OC1_2025", EARLIER, [oldPart("puuid-me", 100)]),
  ]);
}, 60_000);
afterAll(async () => {
  await handle.close();
});

describe("figures backfill", () => {
  it("stops at a refusal without marking anything", async () => {
    const calls: string[] = [];
    const run = await backfillFigures(handle.db, client(calls, true), { limit: 10, deadline: Date.now() + 60_000 });
    expect(run).toMatchObject({ fetched: 0, unavailable: 0, stoppedBy: "Riot answered 403" });
    expect(calls).toHaveLength(1);
    expect((await row("OC1_FIGS")).extraStats).toBeNull();
    // The record stored as unavailable needs no request: it is marked checked at once.
    expect((await row("OC1_UNAVAILABLE")).extraStats).toEqual({});
  });

  it("stops for time, not as a refusal, when Riot's rate limits would keep the next request waiting past the deadline", async () => {
    let t = Date.now();
    const now = () => t;
    const sleep = async (ms: number) => void (t += ms);
    const limiter = new RateLimiter([{ requests: 100, seconds: 120 }], now, sleep);
    limiter.pause(90);
    const calls: string[] = [];
    const run = await backfillFigures(handle.db, client(calls, false, { limiter, now, sleep, maxRetries: 0, deadline: t + 25_000 }), { limit: 10, deadline: t + 25_000 });
    expect(run).toEqual({ fetched: 0, unavailable: 0, skipped: [], stoppedBy: "time budget" });
    expect(calls).toHaveLength(0);
    expect((await row("OC1_FIGS")).extraStats).toBeNull();
  });

  it("fetches each Season 2026 game's record once, newest first, and copies its counts", async () => {
    // The account has since moved server: its old games are still asked for where they were played.
    await handle.db.update(riotAccounts).set({ platform: "euw1" }).where(eq(riotAccounts.id, account));
    const calls: string[] = [];
    const run = await backfillFigures(handle.db, client(calls), { limit: 2, deadline: Date.now() + 60_000 });
    expect(run).toEqual({ fetched: 2, unavailable: 0, skipped: [], stoppedBy: null });
    expect(calls.map((u) => /\/matches\/([^/?]+)$/.exec(u)?.[1])).toEqual(["OC1_FIGS", "OC1_FIGS2"]);
    expect(calls[0]).toContain("sea.api.riotgames.com/lol/match/v5/matches/OC1_FIGS");
    expect(await row("OC1_FIGS")).toMatchObject({ extraStats: { doubleKills: 3, tripleKills: 1, quadraKills: 0, pentaKills: 1 } });
    // The stored record now has the figures too (match history reads them from there).
    const [details] = await handle.db.select().from(matchDetails).where(eq(matchDetails.matchId, "OC1_FIGS"));
    expect(details!.participants.find((p) => p.puuid === "puuid-me")?.stats).toMatchObject({ doubleKills: 3, pentaKills: 1 });
  });

  it("marks a record Riot no longer serves, and asks for nothing twice", async () => {
    const calls: string[] = [];
    const run = await backfillFigures(handle.db, client(calls), { limit: 10, deadline: Date.now() + 60_000 });
    expect(run).toEqual({ fetched: 0, unavailable: 1, skipped: [], stoppedBy: null });
    expect(calls.map((u) => /\/matches\/([^/?]+)$/.exec(u)?.[1])).toEqual(["OC1_GONE"]);
    expect((await row("OC1_GONE")).extraStats).toEqual({});
    // Nothing left: another run asks Riot for nothing.
    const again: string[] = [];
    expect(await backfillFigures(handle.db, client(again), { limit: 10, deadline: Date.now() + 60_000 })).toEqual({ fetched: 0, unavailable: 0, skipped: [], stoppedBy: null });
    expect(again).toEqual([]);
  });

  it("leaves earlier seasons and games that already had figures alone", async () => {
    expect((await row("OC1_2025")).extraStats).toBeNull();
    expect((await row("OC1_HAS")).extraStats).toEqual({ doubleKills: 1, tripleKills: 0, quadraKills: 0, pentaKills: 0 });
  });

  it("reports the coverage and gives profiles counts, never zeros, for unavailable games", async () => {
    expect(await figuresCoverage(handle.db)).toEqual({ games: 5, withFigures: 3, unavailable: 2, pending: 0 });
    const games = await accountRows(handle.db, "games", [account]);
    const by = Object.fromEntries(games.map((g) => [g.matchId, g.multikills]));
    expect(by).toMatchObject({ OC1_FIGS: "3,1,0,1", OC1_HAS: "1,0,0,0", OC1_GONE: "-", OC1_UNAVAILABLE: "-", OC1_2025: null });
  });
});
