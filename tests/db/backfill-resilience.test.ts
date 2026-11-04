import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatches, matchDetails, matchTimelines } from "@/server/db/schema";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { addAccount, listAccountsForPlayer, type RiotAccountRecord } from "@/server/accounts/repository";
import { DETAILS_UNAVAILABLE, syncAccount } from "@/server/accounts/sync";
import { backfillFigures } from "@/server/accounts/figures-backfill";
import { backfillTimelines } from "@/server/accounts/timeline-backfill";
import { getMatchHistory } from "@/server/players/match-history";
import { MAX_SKIPPED_RECORDS, RiotApiClient, recordFailure, RiotApiError } from "@/server/riot/api/client";
import { RateLimiter } from "@/server/riot/api/rate-limiter";
import fixture from "@/server/riot/fixtures/champions.fixture.json";

/*
  One game Riot cannot serve never holds up the games behind it. Riot answers 5xx for some games
  for good (a corrupted game), and every collection here reads games newest first and used to stop
  at the first error: one such game at the head of a queue's season list stopped that queue's
  collection for the account, and one at the head of the figures and timeline backfills and of the
  sync's catch-up of older games stopped those, on every run, forever. Now such a game is passed
  over, a few a run, asked for again later, and never marked as anything it is not; a refused key,
  a full rate limit and an unreachable Riot still stop a run at once.
*/

const keyOf = (id: string) => fixture.champions.find((c) => c.id === id)!.key;
const DAY = 86_400_000;
const IN_SEASON = Date.UTC(2026, 5, 1);
type Spec = { created: number; answer?: number | "shape" };
const matchIdOf = (url: string) => decodeURIComponent(/\/lol\/match\/v5\/matches\/([^/?]+)(?:\/timeline)?$/.exec(url)?.[1] ?? "");

/** Riot, for one account on OCE: lists the games, serves each game and its timeline, and fails the ones the spec says. */
function riot(puuid: string, games: Record<string, Spec>, options: { calls?: string[]; refuseAll?: number } = {}) {
  const fetchImpl = async (input: string | URL | Request): Promise<Response> => {
    const url = String(input);
    options.calls?.push(url);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "retry-after": "1" } });
    if (options.refuseAll) return json({ status: { message: "no" } }, options.refuseAll);
    if (url.includes("/riot/account/v1/region/by-game/lol/by-puuid/")) return json({ puuid, game: "lol", region: "OC1" });
    if (url.includes("/riot/account/v1/accounts/by-riot-id/")) {
      const parts = url.split("/by-riot-id/")[1]!.split("/");
      return json({ puuid, gameName: decodeURIComponent(parts[0]!), tagLine: decodeURIComponent(parts[1]!) });
    }
    if (url.includes("/lol/league/v4/entries/by-puuid/")) return json([]);
    if (url.includes("/lol/champion-mastery/v4/")) return json([]);
    if (url.includes("/ids?")) {
      const q = new URL(url).searchParams;
      if (Number(q.get("queue")) !== 420) return json([]);
      const start = Number(q.get("start") ?? 0);
      const count = Number(q.get("count") ?? 20);
      const ids = Object.entries(games)
        .sort((a, b) => b[1].created - a[1].created)
        .map(([id]) => id);
      return json(ids.slice(start, start + count));
    }
    const id = matchIdOf(url);
    const spec = games[id];
    if (!spec) return json({ status: { message: "not found" } }, 404);
    if (spec.answer === "shape") return json({ metadata: { matchId: id }, info: { oops: true } });
    if (typeof spec.answer === "number") return json({ status: { message: "no" } }, spec.answer);
    if (url.endsWith("/timeline")) return json({ metadata: { matchId: id, participants: [puuid] }, info: { participants: [{ participantId: 1, puuid }], frames: [{ timestamp: 0, participantFrames: { "1": { totalGold: 500, xp: 0, minionsKilled: 0 } }, events: [] }, { timestamp: 60_000, participantFrames: { "1": { totalGold: 700, xp: 300, minionsKilled: 5 } }, events: [] }] } });
    const positions = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];
    const participants = Array.from({ length: 10 }, (_, i) => ({ puuid: i === 0 ? puuid : `${id}-${i}`, teamId: i < 5 ? 100 : 200, championId: i === 0 ? keyOf("Gwen") : keyOf("Ahri"), teamPosition: positions[i % 5], win: i < 5, kills: 2, deaths: 1, assists: 3, totalMinionsKilled: 150, neutralMinionsKilled: 10, totalDamageDealtToChampions: 15_000, visionScore: 20, doubleKills: 1, tripleKills: 0, quadraKills: 0, pentaKills: 0 }));
    return json({ metadata: { matchId: id }, info: { gameCreation: spec.created, gameDuration: 1800, gameVersion: "16.11.1.1", queueId: 420, teams: [], participants } });
  };
  return new RiotApiClient({ apiKey: "k", fetchImpl, limiter: new RateLimiter([{ requests: 10_000, seconds: 1 }]), sleep: async () => {}, maxRetries: 0 });
}

let handle: DbHandle;
let account: RiotAccountRecord;
let playerId: string;
const PUUID = "puuid-resilient";
/** Newest first: the unreadable game is the newest, the two readable ones behind it. */
const games: Record<string, Spec> = {
  OC1_POISON: { created: IN_SEASON + 3 * DAY, answer: 500 },
  OC1_OK_1: { created: IN_SEASON + 2 * DAY },
  OC1_OK_2: { created: IN_SEASON + DAY },
};
const ids = () => Object.keys(games);
const fresh = async () => (await listAccountsForPlayer(handle.db, playerId)).find((a) => a.id === account.id)!;
const asked = (calls: string[]) => calls.map(matchIdOf).filter(Boolean);
const storedKills = async () => Object.fromEntries((await handle.db.select({ matchId: accountMatches.matchId, kills: accountMatches.kills }).from(accountMatches).where(eq(accountMatches.accountId, account.id))).map((r) => [r.matchId, r.kills]));

beforeAll(async () => {
  handle = await testDb();
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
  const team = await getOrCreateTeam(handle.db);
  playerId = (await createPlayer(handle.db, team.id, { displayName: "Resilient", primaryRole: "TOP", primaryPool: ["Gwen"] })).id;
  account = await addAccount(handle.db, { ownerType: "player", playerId, riotId: "Resilient#OCE", platform: "oc1" });
}, 60_000);
afterAll(async () => {
  await handle.close();
});

describe("how a failed request for one record is treated", () => {
  it("stops the run for the key, the rate limit and an unreachable Riot; marks a 404; passes over the rest", () => {
    const err = (status: number) => new RiotApiError("x", status, status === 429 || status >= 500 || status === 0);
    expect([401, 403, 429, 0].map((s) => recordFailure(err(s)))).toEqual(["stop", "stop", "stop", "stop"]);
    expect(recordFailure(err(404))).toBe("unavailable");
    expect([500, 502, 503, 400, 415, 200].map((s) => recordFailure(err(s)))).toEqual(["skip", "skip", "skip", "skip", "skip", "skip"]);
    // Anything that is not a Riot answer (a programming error) stops the run rather than being swallowed.
    expect(recordFailure(new TypeError("x"))).toBe("stop");
  });
});

describe("a game Riot cannot serve at the head of a queue's season list", () => {
  it("is passed over: the games behind it are collected, the list's offset moves on, and it is asked for again next run", async () => {
    const calls: string[] = [];
    const lines: string[] = [];
    const first = await syncAccount(handle.db, riot(PUUID, games, { calls }), account, { season: 16, log: (m) => lines.push(m) });
    expect(first.status).toBe("ok");
    expect(first.matchesFolded).toBe(2);
    expect(await storedKills()).toEqual({ OC1_OK_1: 2, OC1_OK_2: 2 });
    expect(first.history).toMatchObject({ complete: true, queuesDone: 7 });
    expect(lines.some((l) => /match OC1_POISON fetch failed/.test(l))).toBe(true);
    expect(lines.some((l) => /could not read OC1_POISON/.test(l))).toBe(true);
    // Next run: the two stored games cost nothing; the unreadable one is asked for again, and stays unstored.
    const again: string[] = [];
    const second = await syncAccount(handle.db, riot(PUUID, games, { calls: again }), await fresh(), { season: 16 });
    expect(second.status).toBe("ok");
    expect(asked(again)).toEqual(["OC1_POISON"]);
    expect(Object.keys(await storedKills()).sort()).toEqual(["OC1_OK_1", "OC1_OK_2"]);
  });

  it("a full rate limit still stops the page at once, storing nothing", async () => {
    const calls: string[] = [];
    const r = await syncAccount(handle.db, riot(PUUID, { ...games, OC1_NEW: { created: IN_SEASON + 4 * DAY } }, { calls, refuseAll: 429 }), await fresh(), { season: 16 });
    expect(r.status).toBe("pending");
    expect(r.matchesFolded).toBe(0);
  });
});

describe("a game Riot cannot serve at the head of the sync's catch-up of older games", () => {
  it("is passed over for the figures (2b) and the records (2c), with a bound on the requests a run spends", async () => {
    const a = await fresh();
    // The games were stored before per-game figures and full records were kept.
    const poisons = Object.fromEntries(Array.from({ length: MAX_SKIPPED_RECORDS + 1 }, (_, i) => [`OC1_POISON_${i}`, { created: IN_SEASON + (10 + i) * DAY, answer: 500 } as Spec]));
    await handle.db.insert(accountMatches).values(Object.entries(poisons).map(([matchId, spec]) => ({ accountId: a.id, matchId, gameCreation: spec.created, queueId: 420, championId: "Gwen", role: "TOP", win: true, patch: "16.11", gameDuration: 1800 })));
    await handle.db.update(accountMatches).set({ kills: null, deaths: null, assists: null, cs: null, damage: null, visionScore: null }).where(eq(accountMatches.accountId, a.id));
    await handle.db.delete(matchDetails).where(inArray(matchDetails.matchId, [...ids(), ...Object.keys(poisons)]));
    const all = { ...games, ...poisons };
    // Four unreadable games sit ahead of the readable ones. The bound is one run's: the listed game
    // (step 1) is the first pass, two of the catch-up's games the second and third; the fourth
    // failure stops the catch-up, and the records' catch-up stops at its first failure likewise.
    const calls: string[] = [];
    const capped = await syncAccount(handle.db, riot(PUUID, all, { calls }), a, { season: 16 });
    expect(capped.status).toBe("ok");
    expect(asked(calls)).toEqual(["OC1_POISON", "OC1_POISON_3", "OC1_POISON_2", "OC1_POISON_1", "OC1_POISON_3"]);
    expect(await handle.db.select({ matchId: accountMatches.matchId }).from(accountMatches).where(and(eq(accountMatches.accountId, a.id), isNull(accountMatches.kills)))).toHaveLength(ids().length - 1 + Object.keys(poisons).length);
    // With one unreadable game ahead, the readable ones behind it get their figures (2b) and their records (2c) in one run.
    await handle.db.delete(accountMatches).where(inArray(accountMatches.matchId, Object.keys(poisons).slice(1)));
    const one = { ...games, OC1_POISON_0: poisons.OC1_POISON_0! };
    const again: string[] = [];
    const lines: string[] = [];
    const r = await syncAccount(handle.db, riot(PUUID, one, { calls: again }), await fresh(), { season: 16, log: (m) => lines.push(m) });
    expect(r.status).toBe("ok");
    expect(await storedKills()).toEqual({ OC1_OK_1: 2, OC1_OK_2: 2, OC1_POISON_0: null });
    const records = await handle.db.select({ matchId: matchDetails.matchId }).from(matchDetails).where(inArray(matchDetails.matchId, Object.keys(one)));
    expect(records.map((d) => d.matchId).sort()).toEqual(["OC1_OK_1", "OC1_OK_2"]);
    expect(lines.some((l) => /could not read OC1_POISON_0, OC1_POISON/.test(l) || /could not read OC1_POISON, OC1_POISON_0/.test(l))).toBe(true);
    await handle.db.delete(accountMatches).where(eq(accountMatches.matchId, "OC1_POISON_0"));
  });
});

describe("a game Riot no longer serves (404) in the sync's catch-up", () => {
  it("is marked on the ledger row and stored as an unavailable record, so the match history says the record is gone", async () => {
    const a = await fresh();
    await handle.db.insert(accountMatches).values({ accountId: a.id, matchId: "OC1_GONE", gameCreation: IN_SEASON + 5 * DAY, queueId: 420, championId: "Gwen", role: "TOP", win: true, patch: "16.11", gameDuration: 1800 });
    const calls: string[] = [];
    const r = await syncAccount(handle.db, riot(PUUID, games, { calls }), a, { season: 16 });
    expect(r.status).toBe("ok");
    expect(asked(calls)).toContain("OC1_GONE");
    expect((await storedKills()).OC1_GONE).toBe(DETAILS_UNAVAILABLE.kills);
    const [record] = await handle.db.select({ participants: matchDetails.participants }).from(matchDetails).where(eq(matchDetails.matchId, "OC1_GONE"));
    expect(record?.participants).toEqual([]);
    const page = await getMatchHistory(handle.db, playerId, { per: 25, season: 16 });
    expect(page.rows.find((row) => row.matchId === "OC1_GONE")).toMatchObject({ record: "unavailable", kills: null });
    // Another run asks for it no more.
    const again: string[] = [];
    await syncAccount(handle.db, riot(PUUID, games, { calls: again }), await fresh(), { season: 16 });
    expect(asked(again)).not.toContain("OC1_GONE");
    await handle.db.delete(accountMatches).where(eq(accountMatches.matchId, "OC1_GONE"));
    await handle.db.delete(matchDetails).where(eq(matchDetails.matchId, "OC1_GONE"));
  });
});

describe("the figures and timeline backfills", () => {
  it("pass over a record Riot cannot serve, fetch the ones behind it, mark nothing, and ask for it again next run", async () => {
    const a = await fresh();
    await handle.db.insert(accountMatches).values({ accountId: a.id, matchId: "OC1_POISON", gameCreation: games.OC1_POISON!.created, queueId: 420, championId: "Gwen", role: "TOP", win: true, patch: "16.11", gameDuration: 1800, kills: 2, deaths: 1, assists: 3, enemyChampionId: "Ahri", summarisedAt: new Date() });
    await handle.db.insert(matchDetails).values({ matchId: "OC1_POISON", platform: "oc1", queueId: 420, gameCreation: games.OC1_POISON!.created, gameDuration: 1800, gameVersion: "16.11.1.1", teams: [], participants: [{ puuid: PUUID, name: null, teamId: 100, championId: "Gwen", championKey: keyOf("Gwen"), champLevel: 15, position: "TOP", win: true, kills: 2, deaths: 1, assists: 3, cs: 160, gold: 9000, damage: 15_000, damageTaken: 15_000, vision: 20, wardsPlaced: 8, items: null, spells: null, runes: null }] });
    await handle.db.update(accountMatches).set({ extraStats: null, enemyChampionId: "Ahri" }).where(eq(accountMatches.accountId, a.id));
    const calls: string[] = [];
    const figures = await backfillFigures(handle.db, riot(PUUID, games, { calls }), { limit: 10, deadline: Date.now() + 60_000 });
    expect(figures).toEqual({ fetched: 2, unavailable: 0, skipped: ["OC1_POISON"], stoppedBy: null });
    expect(asked(calls)).toEqual(["OC1_POISON", "OC1_OK_1", "OC1_OK_2"]);
    const stats = Object.fromEntries((await handle.db.select({ matchId: accountMatches.matchId, extraStats: accountMatches.extraStats }).from(accountMatches).where(eq(accountMatches.accountId, a.id))).map((r) => [r.matchId, r.extraStats]));
    expect(stats.OC1_OK_1).toMatchObject({ doubleKills: 1 });
    expect(stats.OC1_POISON).toBeNull();
    const again: string[] = [];
    expect(await backfillFigures(handle.db, riot(PUUID, games, { calls: again }), { limit: 10, deadline: Date.now() + 60_000 })).toEqual({ fetched: 0, unavailable: 0, skipped: ["OC1_POISON"], stoppedBy: null });
    expect(asked(again)).toEqual(["OC1_POISON"]);

    const tl: string[] = [];
    const timelines = await backfillTimelines(handle.db, riot(PUUID, games, { calls: tl }), { limit: 10, deadline: Date.now() + 60_000 });
    expect(timelines).toEqual({ fetched: 2, unavailable: 0, skipped: ["OC1_POISON"], stoppedBy: null });
    expect(asked(tl)).toEqual(["OC1_POISON", "OC1_OK_1", "OC1_OK_2"]);
    expect((await handle.db.select({ matchId: matchTimelines.matchId }).from(matchTimelines)).map((t) => t.matchId).sort()).toEqual(["OC1_OK_1", "OC1_OK_2"]);
  });

  it("stop after MAX_SKIPPED_RECORDS unreadable records, so an outage costs a run that many requests", async () => {
    const a = await fresh();
    const many = Object.fromEntries(Array.from({ length: MAX_SKIPPED_RECORDS + 2 }, (_, i) => [`OC1_DOWN_${i}`, { created: IN_SEASON + (20 + i) * DAY, answer: i === 0 ? ("shape" as const) : 503 } as Spec]));
    await handle.db.insert(accountMatches).values(Object.entries(many).map(([matchId, spec]) => ({ accountId: a.id, matchId, gameCreation: spec.created, queueId: 420, championId: "Gwen", role: "TOP", win: true, patch: "16.11", gameDuration: 1800, kills: 2, deaths: 1, assists: 3, enemyChampionId: "Ahri", summarisedAt: new Date() })));
    await handle.db.insert(matchDetails).values(Object.entries(many).map(([matchId, spec]) => ({ matchId, platform: "oc1", queueId: 420, gameCreation: spec.created, gameDuration: 1800, gameVersion: "16.11.1.1", teams: [], participants: [{ puuid: PUUID, name: null, teamId: 100, championId: "Gwen", championKey: keyOf("Gwen"), champLevel: 15, position: "TOP", win: true, kills: 2, deaths: 1, assists: 3, cs: 160, gold: 9000, damage: 15_000, damageTaken: 15_000, vision: 20, wardsPlaced: 8, items: null, spells: null, runes: null }] })));
    const calls: string[] = [];
    const run = await backfillFigures(handle.db, riot(PUUID, { ...games, ...many }, { calls }), { limit: 10, deadline: Date.now() + 60_000 });
    expect(run.fetched).toBe(0);
    expect(run.skipped).toHaveLength(MAX_SKIPPED_RECORDS);
    expect(run.stoppedBy).toBe(`${MAX_SKIPPED_RECORDS} records could not be read`);
    expect(asked(calls)).toHaveLength(MAX_SKIPPED_RECORDS + 1);
    const tl: string[] = [];
    const t = await backfillTimelines(handle.db, riot(PUUID, { ...games, ...many }, { calls: tl }), { limit: 10, deadline: Date.now() + 60_000 });
    expect(t).toMatchObject({ fetched: 0, stoppedBy: `${MAX_SKIPPED_RECORDS} records could not be read` });
    expect(t.skipped).toHaveLength(MAX_SKIPPED_RECORDS);
    // A refused key and a full rate limit still stop a run at its first request, passing over nothing.
    for (const status of [403, 429]) {
      const c: string[] = [];
      expect(await backfillFigures(handle.db, riot(PUUID, games, { calls: c, refuseAll: status }), { limit: 10, deadline: Date.now() + 60_000 })).toEqual({ fetched: 0, unavailable: 0, skipped: [], stoppedBy: `Riot answered ${status}` });
      expect(c).toHaveLength(1);
    }
  });
});
