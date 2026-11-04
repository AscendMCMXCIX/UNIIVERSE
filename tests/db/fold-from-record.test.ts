import { afterAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountChampionHistory, accountMatches, matchDetails } from "@/server/db/schema";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { addAccount, listAccountsForPlayer } from "@/server/accounts/repository";
import { syncAccount } from "@/server/accounts/sync";
import { RiotApiClient } from "@/server/riot/api/client";
import { RateLimiter } from "@/server/riot/api/rate-limiter";
import fixture from "@/server/riot/fixtures/champions.fixture.json";

/*
  A game several members played is fetched from Riot once: the next member's sync folds it from
  the record the first one stored. The stored game must be exactly what fetching it would have
  stored (checked against a run where the second member fetches everything from Riot), and the
  record is only used when it lists the account (a record stored under an earlier Riot key, or of a
  game Riot no longer serves, sends the sync back to Riot).
*/

const keyOf = (id: string) => fixture.champions.find((c) => c.id === id)!.key;
const NOW = Date.now();
const DAY = 86_400_000;
const handles: DbHandle[] = [];
afterAll(async () => {
  for (const h of handles) await h.close();
});

interface Game {
  created: number;
  /** puuid → [champion, teamPosition, team] */
  players: Record<string, [string, string, number]>;
  blueWins: boolean;
  queue?: number;
}

/** Riot as seen by every account: each game lists all its players; each account lists its own games. */
function world(games: Record<string, Game>, calls: string[]) {
  return async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    calls.push(url);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    const byRiotId = /\/riot\/account\/v1\/accounts\/by-riot-id\/([^/]+)\/([^/?]+)/.exec(url);
    if (byRiotId) return json({ puuid: `puuid-${decodeURIComponent(byRiotId[1]!)}`, gameName: decodeURIComponent(byRiotId[1]!), tagLine: decodeURIComponent(byRiotId[2]!) });
    const region = /\/region\/by-game\/lol\/by-puuid\/([^/?]+)/.exec(url);
    if (region) return json({ puuid: region[1], game: "lol", region: "OC1" });
    if (url.includes("/lol/league/v4/entries/by-puuid/")) return json([]);
    if (url.includes("/lol/champion-mastery/v4/")) return json([]);
    const ids = /\/lol\/match\/v5\/matches\/by-puuid\/([^/]+)\/ids\?(.*)$/.exec(url);
    if (ids) {
      const q = new URLSearchParams(ids[2]);
      const puuid = decodeURIComponent(ids[1]!);
      const queue = Number(q.get("queue"));
      const startTime = Number(q.get("startTime") ?? 0) * 1000;
      const endTime = q.get("endTime") ? Number(q.get("endTime")) * 1000 : Infinity;
      const start = Number(q.get("start") ?? 0);
      const count = Number(q.get("count") ?? 20);
      const list = Object.entries(games)
        .filter(([, g]) => (g.queue ?? 420) === queue && puuid in g.players && g.created >= startTime && g.created < endTime)
        .sort((a, b) => b[1].created - a[1].created)
        .map(([id]) => id);
      return json(list.slice(start, start + count));
    }
    const m = /\/lol\/match\/v5\/matches\/([^/?]+)$/.exec(url);
    if (m) {
      const g = games[decodeURIComponent(m[1]!)];
      if (!g) return json({}, 404);
      const named = Object.entries(g.players).map(([puuid, [champion, position, teamId]], i) => ({ puuid, teamId, championId: keyOf(champion), teamPosition: position, win: teamId === 100 ? g.blueWins : !g.blueWins, kills: 2 + i, deaths: 5 - (i % 5), assists: 3 * i, totalMinionsKilled: 120 + i, neutralMinionsKilled: i, totalDamageDealtToChampions: 15_000 + 100 * i, visionScore: 18 + i, riotIdGameName: puuid.replace("puuid-", ""), riotIdTagline: "OCE" }));
      return json({ metadata: { matchId: m[1] }, info: { gameCreation: g.created, gameDuration: 1700, gameVersion: "16.21.700.1", queueId: g.queue ?? 420, teams: [], participants: named } });
    }
    return json({}, 404);
  };
}

const POS = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];
/** Ten players: Ace and Bea where asked, strangers elsewhere. */
function game(created: number, members: Record<string, [string, number]>, blueWins: boolean): Game {
  const players: Game["players"] = {};
  const taken = { 100: 0, 200: 0 } as Record<number, number>;
  for (const [puuid, [champion, team]] of Object.entries(members)) players[puuid] = [champion, POS[taken[team]!++]!, team];
  for (const team of [100, 200]) while (taken[team]! < 5) players[`puuid-stranger-${created}-${team}-${taken[team]}`] = ["Ahri", POS[taken[team]!]!, team], taken[team]! += 1;
  return { created, players, blueWins };
}

async function setup(games: Record<string, Game>) {
  const handle = await testDb();
  handles.push(handle);
  const db = handle.db;
  await syncStaticData(db, new FixtureStaticProvider(), { fingerprint: false });
  const team = await getOrCreateTeam(db);
  const ace = await createPlayer(db, team.id, { displayName: "Ace", primaryRole: "TOP", primaryPool: [] });
  const bea = await createPlayer(db, team.id, { displayName: "Bea", primaryRole: "JUNGLE", primaryPool: [] });
  await addAccount(db, { ownerType: "player", playerId: ace.id, riotId: "Ace#OCE", platform: "oc1" });
  await addAccount(db, { ownerType: "player", playerId: bea.id, riotId: "Bea#OCE", platform: "oc1" });
  const calls: string[] = [];
  const client = new RiotApiClient({ apiKey: "k", fetchImpl: world(games, calls), limiter: new RateLimiter([{ requests: 10_000, seconds: 1 }]), sleep: async () => {} });
  const sync = async (playerId: string) => {
    const [account] = await listAccountsForPlayer(db, playerId);
    calls.length = 0;
    const r = await syncAccount(db, client, account!, { maxMatchesPerRun: 200, season: 16 });
    return { result: r, matchRequests: calls.filter((u) => /\/lol\/match\/v5\/matches\/[A-Z0-9]+_\d+$/.test(u)).map((u) => u.split("/").pop()!) };
  };
  return { db, ace: ace.id, bea: bea.id, sync };
}

/** A player's stored games and champion history, as comparable rows. */
async function stored(db: DbHandle["db"], playerId: string) {
  const [account] = await listAccountsForPlayer(db, playerId);
  const games = await db
    .select({ matchId: accountMatches.matchId, championId: accountMatches.championId, role: accountMatches.role, win: accountMatches.win, enemy: accountMatches.enemyChampionId, patch: accountMatches.patch, duration: accountMatches.gameDuration, queue: accountMatches.queueId, created: accountMatches.gameCreation, kills: accountMatches.kills, deaths: accountMatches.deaths, assists: accountMatches.assists, cs: accountMatches.cs, damage: accountMatches.damage, vision: accountMatches.visionScore, teamId: accountMatches.teamId, gold: accountMatches.gold, teamKills: accountMatches.teamKills })
    .from(accountMatches)
    .where(eq(accountMatches.accountId, account!.id))
    .orderBy(accountMatches.matchId);
  const history = await db
    .select({ championId: accountChampionHistory.championId, role: accountChampionHistory.role, queueGroup: accountChampionHistory.queueGroup, patch: accountChampionHistory.patch, games: accountChampionHistory.games, wins: accountChampionHistory.wins, kills: accountChampionHistory.kills, deaths: accountChampionHistory.deaths, assists: accountChampionHistory.assists })
    .from(accountChampionHistory)
    .where(eq(accountChampionHistory.accountId, account!.id))
    .orderBy(accountChampionHistory.championId, accountChampionHistory.role);
  return { games, history };
}

const GAMES: Record<string, Game> = {
  OC1_1: game(NOW - 1 * DAY, { "puuid-Ace": ["Riven", 100], "puuid-Bea": ["Viego", 100] }, true),
  OC1_2: game(NOW - 2 * DAY, { "puuid-Ace": ["Riven", 100], "puuid-Bea": ["Viego", 200] }, false),
  OC1_3: game(NOW - 3 * DAY, { "puuid-Ace": ["Gwen", 200] }, true),
  OC1_4: game(NOW - 4 * DAY, { "puuid-Bea": ["Viego", 100] }, true),
  OC1_5: game(NOW - 5 * DAY, { "puuid-Ace": ["Riven", 200], "puuid-Bea": ["Ahri", 200] }, false),
};

describe("folding a shared game from its stored record", () => {
  it("asks Riot once for a game two members played, and stores the second member's game exactly as Riot's answer would", async () => {
    const a = await setup(GAMES);
    const first = await a.sync(a.ace);
    expect(first.matchRequests.sort()).toEqual(["OC1_1", "OC1_2", "OC1_3", "OC1_5"]);
    const second = await a.sync(a.bea);
    // Bea's shared games come from the records Ace's sync stored: only her own game is asked for.
    expect(second.matchRequests).toEqual(["OC1_4"]);
    expect(second.result.matchesFromRecords).toBe(3);
    expect(second.result.matchesFolded).toBe(4);

    // The control: Bea syncs first, so every game of hers comes from Riot.
    const b = await setup(GAMES);
    const control = await b.sync(b.bea);
    expect(control.matchRequests.sort()).toEqual(["OC1_1", "OC1_2", "OC1_4", "OC1_5"]);
    expect(control.result.matchesFromRecords ?? 0).toBe(0);

    const viaRecords = await stored(a.db, a.bea);
    const viaRiot = await stored(b.db, b.bea);
    expect(viaRecords.games).toEqual(viaRiot.games);
    expect(viaRecords.history).toEqual(viaRiot.history);
    expect(viaRecords.games).toHaveLength(4);
    // The figures and sides really are there (not two equally empty copies).
    expect(viaRecords.games.find((g) => g.matchId === "OC1_1")).toMatchObject({ championId: "Viego", role: "JUNGLE", win: true, teamId: 100 });
    expect(viaRecords.games.every((g) => g.kills !== null && g.cs !== null && g.enemy !== null)).toBe(true);
  });

  it("asks Riot when the record does not list the account (stored under an earlier Riot key)", async () => {
    const a = await setup({ OC1_7: game(NOW - DAY, { "puuid-Ace": ["Riven", 100], "puuid-Bea": ["Viego", 100] }, true) });
    await a.sync(a.ace);
    // The record keeps Bea's old id: her current one is not in it.
    await a.db.execute(sql`UPDATE match_details SET participants = (SELECT jsonb_agg(CASE WHEN p->>'puuid' = 'puuid-Bea' THEN jsonb_set(p, '{puuid}', '"old-key-bea"') ELSE p END) FROM jsonb_array_elements(participants) p) WHERE match_id = 'OC1_7'`);
    const second = await a.sync(a.bea);
    expect(second.matchRequests).toEqual(["OC1_7"]);
    expect(second.result.matchesFromRecords ?? 0).toBe(0);
    const [row] = await a.db.select({ championId: accountMatches.championId }).from(accountMatches).where(and(eq(accountMatches.matchId, "OC1_7"), sql`${accountMatches.championId} IS NOT NULL`));
    expect(row).toBeTruthy();
  });

  it("asks Riot when the stored record has no players (a game Riot no longer served)", async () => {
    const a = await setup({ OC1_8: game(NOW - DAY, { "puuid-Bea": ["Viego", 100] }, true) });
    await a.db.insert(matchDetails).values({ matchId: "OC1_8", gameCreation: NOW - DAY, gameDuration: 0, teams: [], participants: [] });
    const r = await a.sync(a.bea);
    expect(r.matchRequests).toEqual(["OC1_8"]);
    expect(r.result.matchesFolded).toBe(1);
  });
});
