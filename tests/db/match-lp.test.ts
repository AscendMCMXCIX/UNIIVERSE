import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatches, rankSnapshots, riotAccounts } from "@/server/db/schema";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { lpForGames } from "@/server/accounts/match-lp";

/*
  A page of games gets the LP its account's readings prove, read from the store: a game enclosed by
  a reading during it and one just after; "several games" for a run the readings span together;
  Flex apart from Solo/Duo; nothing for a normal game.
*/

let handle: DbHandle;
let accountId: string;
const T0 = Date.UTC(2026, 9, 20, 8, 0);
const at = (min: number) => T0 + min * 60_000;
const page = (ids: string[]) => ids.map((matchId) => ({ matchId, accountId, queueId: matchId.startsWith("F") ? 440 : matchId.startsWith("N") ? 400 : 420, gameCreation: games.find((g) => g.matchId === matchId)!.gameCreation }));
const games: Array<typeof accountMatches.$inferInsert> = [];

beforeAll(async () => {
  handle = await testDb();
  const db = handle.db;
  await syncStaticData(db, new FixtureStaticProvider(), { fingerprint: false });
  const team = await getOrCreateTeam(db);
  const p = await createPlayer(db, team.id, { displayName: "Climber", primaryRole: "MID", primaryPool: ["Ahri"] });
  const [a] = await db.insert(riotAccounts).values({ ownerType: "player", playerId: p.id, gameName: "Climber", tagLine: "T", platform: "oc1", puuid: "p-climber", label: "main" }).returning({ id: riotAccounts.id });
  accountId = a!.id;
  const g = (matchId: string, createdMin: number, minutes: number, win: boolean, queueId = 420) => ({ accountId, matchId, gameCreation: at(createdMin), gameDuration: minutes * 60, queueId, win, patch: "16.21", championId: "Ahri" });
  games.push(
    g("OLD", -3000, 30, true), // before tracking
    g("S1", 20, 25, true), // enclosed: read during it (confirmed at 35), next read at 50
    g("S2", 60, 25, false), // S2 and S3 share one pair of readings
    g("S3", 95, 25, true),
    g("F1", 200, 30, true, 440), // Flex: its own ladder
    g("N1", 300, 30, true, 400), // a normal game: no LP at all
  );
  await db.insert(accountMatches).values(games);
  await db.insert(rankSnapshots).values([
    { accountId, queue: "solo", tier: "GOLD", division: "II", leaguePoints: 46, wins: 1, losses: 0, capturedAt: new Date(at(0)), confirmedAt: new Date(at(35)) },
    { accountId, queue: "solo", tier: "GOLD", division: "II", leaguePoints: 70, wins: 2, losses: 0, capturedAt: new Date(at(50)), confirmedAt: new Date(at(55)) },
    { accountId, queue: "solo", tier: "GOLD", division: "II", leaguePoints: 72, wins: 3, losses: 1, capturedAt: new Date(at(125)) },
    { accountId, queue: "flex", tier: "SILVER", division: "I", leaguePoints: 10, wins: 4, losses: 4, capturedAt: new Date(at(190)), confirmedAt: new Date(at(215)) },
    { accountId, queue: "flex", tier: "SILVER", division: "I", leaguePoints: 31, wins: 5, losses: 4, capturedAt: new Date(at(236)) },
  ]);
}, 60_000);
afterAll(async () => {
  await handle.close();
});

describe("LP on a page of games", () => {
  it("proves each game it can, per queue, and says why for the rest", async () => {
    const lp = await lpForGames(handle.db, page(["OLD", "S1", "S2", "S3", "F1", "N1"]));
    expect(lp.get("OLD")).toMatchObject({ kind: "none", reason: "before-tracking" });
    expect(lp.get("S1")).toMatchObject({ kind: "lp", delta: 24, before: { leaguePoints: 46 }, after: { leaguePoints: 70 } });
    for (const id of ["S2", "S3"]) expect(lp.get(id)).toMatchObject({ kind: "none", reason: "several-games", games: 2 });
    expect(lp.get("F1")).toMatchObject({ kind: "lp", delta: 21 });
    expect(lp.has("N1")).toBe(false);
  });

  it("reads only around the page's games: a page of recent games still finds the reading before them", async () => {
    expect((await lpForGames(handle.db, page(["S1"]))).get("S1")).toMatchObject({ kind: "lp", delta: 24 });
    expect((await lpForGames(handle.db, page(["F1"]))).get("F1")).toMatchObject({ kind: "lp", delta: 21 });
  });
});
