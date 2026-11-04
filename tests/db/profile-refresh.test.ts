import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatches, appSettings, matchDetails, riotAccounts, type MatchParticipantDetail } from "@/server/db/schema";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { backfillFigures, pendingFiguresForPlayer } from "@/server/accounts/figures-backfill";
import { CATCH_UP_LIMIT, REFRESH_COOLDOWN_MS, catchUpPlayerFigures, figuresCatchUpLeaseKey } from "@/server/accounts/refresh";
import { RiotApiClient } from "@/server/riot/api/client";
import { RateLimiter } from "@/server/riot/api/rate-limiter";
import fixture from "@/server/riot/fixtures/champions.fixture.json";

/*
  A profile's Refresh, second step (synthetic data): the multikill counts of one player's own older
  games are fetched on demand, newest first, up to CATCH_UP_LIMIT at a time, never another
  player's; one catch-up per player per cooldown whoever asks; the answer says how many are left,
  and "complete" once none is.
*/

let handle: DbHandle;
const players: Record<"me" | "mate", { id: string; account: string }> = { me: { id: "", account: "" }, mate: { id: "", account: "" } };
const keyOf = (id: string) => fixture.champions.find((c) => c.id === id)!.key;
const IN_SEASON = Date.UTC(2026, 5, 1);

const oldPart = (puuid: string, teamId: number): MatchParticipantDetail => ({ puuid, name: null, teamId, championId: "Ahri", championKey: keyOf("Ahri"), champLevel: 15, position: "MIDDLE", win: teamId === 100, kills: 3, deaths: 2, assists: 4, cs: 150, gold: 9000, damage: 12000, damageTaken: 15000, vision: 20, wardsPlaced: 8, items: null, spells: null, runes: null });

function riotMatch(matchId: string, created: number, puuid: string) {
  const participants = Array.from({ length: 10 }, (_, i) => ({
    puuid: i === 0 ? puuid : `${matchId}-${i}`,
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
    doubleKills: i === 0 ? 2 : 0,
    tripleKills: 0,
    quadraKills: 0,
    pentaKills: 0,
    largestMultiKill: i === 0 ? 2 : 1,
  }));
  return { metadata: { matchId, participants: participants.map((p) => p.puuid) }, info: { gameCreation: created, gameDuration: 1800, gameVersion: "16.11.1.1", queueId: 420, teams: [{ teamId: 100, win: true, bans: [], objectives: {} }, { teamId: 200, win: false, bans: [], objectives: {} }], participants } };
}

/** Riot's records: every stored game is still there. */
function client(calls: string[]) {
  const fetchImpl = async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const id = /\/matches\/([^/?]+)$/.exec(url)?.[1] ?? "";
    const created = Number(id.split("_")[2] ?? IN_SEASON);
    return new Response(JSON.stringify(riotMatch(id, created, id.startsWith("OC1_ME") ? "puuid-me" : "puuid-mate")), { status: 200, headers: { "content-type": "application/json" } });
  };
  return new RiotApiClient({ apiKey: "k", fetchImpl, limiter: new RateLimiter([{ requests: 1000, seconds: 1 }]), sleep: async () => {} });
}

const askedFor = (calls: string[]) => calls.map((u) => /\/matches\/([^/?]+)$/.exec(u)?.[1]);

beforeAll(async () => {
  handle = await testDb();
  const db = handle.db;
  await syncStaticData(db, new FixtureStaticProvider(), { fingerprint: false });
  const teamId = (await getOrCreateTeam(db)).id;
  for (const who of ["me", "mate"] as const) {
    const p = await createPlayer(db, teamId, { displayName: `Refresh ${who}`, primaryRole: "MID", primaryPool: ["Ahri"] });
    const [{ id }] = (await db.insert(riotAccounts).values({ ownerType: "player", playerId: p.id, gameName: who, tagLine: "OCE", platform: "oc1", puuid: `puuid-${who}`, label: "main" }).returning({ id: riotAccounts.id })) as [{ id: string }];
    players[who] = { id: p.id, account: id };
  }
  // Mine: CATCH_UP_LIMIT + 5 games without counts; the teammate's: 3.
  const games: Array<{ who: "me" | "mate"; matchId: string; created: number }> = [];
  for (let i = 0; i < CATCH_UP_LIMIT + 5; i++) games.push({ who: "me", matchId: `OC1_ME_${IN_SEASON + i * 1000}`, created: IN_SEASON + i * 1000 });
  for (let i = 0; i < 3; i++) games.push({ who: "mate", matchId: `OC1_MATE_${IN_SEASON + i * 1000}`, created: IN_SEASON + i * 1000 });
  await db.insert(accountMatches).values(games.map((g) => ({ accountId: players[g.who].account, matchId: g.matchId, gameCreation: g.created, queueId: 420, championId: "Ahri", role: "MID", win: true, patch: "16.11", gameDuration: 1800, kills: 6, deaths: 2, assists: 8, extraStats: null, summarisedAt: new Date() })));
  await db.insert(matchDetails).values(games.map((g) => ({ matchId: g.matchId, platform: "oc1", queueId: 420, gameCreation: g.created, gameDuration: 1800, gameVersion: "16.11.1.1", teams: [], participants: [oldPart(`puuid-${g.who}`, 100), oldPart("x", 200)] })));
}, 60_000);
afterAll(async () => {
  await handle.close();
});

describe("a profile's Refresh: multikill counts on demand", () => {
  it("counts only the player's own games still waiting", async () => {
    expect(await pendingFiguresForPlayer(handle.db, players.me.id)).toBe(CATCH_UP_LIMIT + 5);
    expect(await pendingFiguresForPlayer(handle.db, players.mate.id)).toBe(3);
  });

  it("a player-scoped backfill never asks for another player's games", async () => {
    const calls: string[] = [];
    const run = await backfillFigures(handle.db, client(calls), { limit: 2, deadline: Date.now() + 60_000, playerId: players.mate.id });
    expect(run).toEqual({ fetched: 2, unavailable: 0, skipped: [], stoppedBy: null });
    expect(askedFor(calls).every((id) => id?.startsWith("OC1_MATE"))).toBe(true);
    expect(await pendingFiguresForPlayer(handle.db, players.mate.id)).toBe(1);
    expect(await pendingFiguresForPlayer(handle.db, players.me.id)).toBe(CATCH_UP_LIMIT + 5);
  });

  it("fetches up to the limit, newest first, then waits out the cooldown, then finishes", async () => {
    let clock = Date.UTC(2026, 9, 22, 4, 0, 0);
    const now = () => new Date(clock);
    const calls: string[] = [];
    const first = await catchUpPlayerFigures(handle.db, client(calls), players.me.id, { now });
    expect(first).toEqual({ status: "fetched", fetched: CATCH_UP_LIMIT, unavailable: 0, remaining: 5 });
    expect(calls).toHaveLength(CATCH_UP_LIMIT);
    expect(askedFor(calls)[0]).toBe(`OC1_ME_${IN_SEASON + (CATCH_UP_LIMIT + 4) * 1000}`);
    // The counts arrived with the records.
    const [newest] = await handle.db.select().from(accountMatches).where(eq(accountMatches.matchId, askedFor(calls)[0]!));
    expect(newest!.extraStats).toMatchObject({ doubleKills: 2 });

    // Again at once (another tab, a teammate admin): nothing asked, the wait is said.
    clock += 30_000;
    const again: string[] = [];
    const second = await catchUpPlayerFigures(handle.db, client(again), players.me.id, { now });
    expect(second).toMatchObject({ status: "recent", remaining: 5 });
    expect((second as { retryInSeconds: number }).retryInSeconds).toBeGreaterThan(0);
    expect((second as { retryInSeconds: number }).retryInSeconds).toBeLessThanOrEqual(REFRESH_COOLDOWN_MS / 1000);
    expect(again).toEqual([]);

    // After the cooldown the rest arrive, and the answer says it is complete.
    clock += REFRESH_COOLDOWN_MS;
    const last: string[] = [];
    expect(await catchUpPlayerFigures(handle.db, client(last), players.me.id, { now })).toEqual({ status: "complete", fetched: 5 });
    expect(last).toHaveLength(5);
    // Nothing left: complete at once, without Riot and without taking the lease.
    await handle.db.delete(appSettings).where(inArray(appSettings.key, [figuresCatchUpLeaseKey(players.me.id)]));
    const none: string[] = [];
    expect(await catchUpPlayerFigures(handle.db, client(none), players.me.id, { now })).toEqual({ status: "complete", fetched: 0 });
    expect(none).toEqual([]);
    expect(await handle.db.select().from(appSettings).where(eq(appSettings.key, figuresCatchUpLeaseKey(players.me.id)))).toEqual([]);
  });
});
