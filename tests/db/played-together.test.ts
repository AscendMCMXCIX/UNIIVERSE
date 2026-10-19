import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatches, matchDetails, riotAccounts, type MatchParticipantDetail } from "@/server/db/schema";
import { createPlayer, getOrCreateTeam, setTeamMember } from "@/server/repositories/team";
import { invalidatePlayedTogetherCache, loadPlayedTogether } from "@/server/matches/played-together";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";

/*
  Played together from stored histories (synthetic accounts and games, no Riot request): two or
  more current team members on the same side, one person counted once across their accounts,
  opposite sides never teammates, unknown sides never guessed, personal-use accounts left out,
  and membership changes taking effect at once.
*/

let handle: DbHandle;
let teamId: string;
const ids: Record<string, string> = {};
const acc: Record<string, string> = {};
const part = (puuid: string, teamId: number): MatchParticipantDetail => ({ puuid, name: null, teamId, championId: null, championKey: 0, champLevel: 15, position: null, win: teamId === 100, kills: 3, deaths: 2, assists: 4, cs: 150, gold: 9000, damage: 12000, damageTaken: 15000, vision: 20, wardsPlaced: 8, items: null, spells: null, runes: null });

beforeAll(async () => {
  handle = await testDb();
  const db = handle.db;
  await syncStaticData(db, new FixtureStaticProvider(), { fingerprint: false });
  teamId = (await getOrCreateTeam(db)).id;
  for (const [name, role, champ] of [["Ace", "TOP", "Riven"], ["Bea", "JUNGLE", "Viego"], ["Cy", "MID", "Ahri"], ["Solo", "ADC", "Jinx"]] as const) {
    ids[name] = (await createPlayer(db, teamId, { displayName: name, primaryRole: role, primaryPool: [champ] })).id;
  }
  await setTeamMember(db, teamId, ids.Solo!, false); // personal use
  const account = async (key: string, player: string) => {
    const [r] = await db.insert(riotAccounts).values({ ownerType: "player", playerId: ids[player]!, gameName: key, tagLine: "T", platform: "oc1", puuid: `p-${key}`, label: key }).returning({ id: riotAccounts.id });
    acc[key] = r!.id;
  };
  await account("ace", "Ace");
  await account("ace2", "Ace");
  await account("bea", "Bea");
  await account("cy", "Cy");
  await account("solo", "Solo");
  const game = (key: string, matchId: string, at: number, queueId = 440) => ({ accountId: acc[key]!, matchId, gameCreation: at, queueId, championId: "Ahri", role: "MID", win: true, patch: "16.1", gameDuration: 1800, kills: 4, deaths: 2, assists: 6, cs: 180, damage: 20000, visionScore: 20 });
  await db.insert(accountMatches).values([
    // G1: Ace (on two accounts!) and Bea on blue, Cy on red.
    game("ace", "OC1_1", 5000),
    game("ace2", "OC1_1", 5000),
    game("bea", "OC1_1", 5000),
    game("cy", "OC1_1", 5000),
    // G2: Bea and Cy on opposite sides only: not together.
    game("bea", "OC1_2", 4000),
    game("cy", "OC1_2", 4000),
    // G3: Ace and the personal-use account on one side: not a team game.
    game("ace", "OC1_3", 3000),
    game("solo", "OC1_3", 3000),
    // G4: Ace, Bea and Cy, side unknown (no details stored yet).
    game("ace", "OC1_4", 2000, 420),
    game("bea", "OC1_4", 2000, 420),
    game("cy", "OC1_4", 2000, 420),
  ]);
  const detail = (matchId: string, parts: MatchParticipantDetail[]) => ({ matchId, gameCreation: 1, gameDuration: 1800, teams: [], participants: parts });
  await db.insert(matchDetails).values([
    detail("OC1_1", [part("p-ace", 100), part("p-ace2", 100), part("p-bea", 100), part("p-cy", 200)]),
    detail("OC1_2", [part("p-bea", 100), part("p-cy", 200)]),
    detail("OC1_3", [part("p-ace", 100), part("p-solo", 100)]),
  ]);
  invalidatePlayedTogetherCache();
}, 60_000);
afterAll(async () => {
  await handle.close();
});

describe("played together", () => {
  it("finds members on the same side once each, links the drafted match, and leaves out the rest", async () => {
    const data = await loadPlayedTogether(handle.db, teamId);
    expect(data.games.map((g) => g.matchId)).toEqual(["OC1_1"]);
    const g = data.games[0]!;
    expect(g.members.map((m) => m.playerId).sort()).toEqual([ids.Ace, ids.Bea].sort());
    expect(g.opponents).toEqual(["Cy"]);
    // G4 has three members but no stored details: counted as unknown, never guessed.
    expect(data.unknownSide).toBe(1);
    // The personal-use player is not a team member here.
    expect(Object.keys(data.players)).not.toContain(ids.Solo);
  });

  it("picks up details that arrive later and membership changes, without waiting for the cache", async () => {
    await handle.db.insert(matchDetails).values({ matchId: "OC1_4", gameCreation: 1, gameDuration: 1800, teams: [], participants: [part("p-ace", 200), part("p-bea", 200), part("p-cy", 200)] });
    const after = await loadPlayedTogether(handle.db, teamId);
    expect(after.games.map((g) => [g.matchId, g.members.length])).toEqual([
      ["OC1_1", 2],
      ["OC1_4", 3],
    ]);
    expect(after.unknownSide).toBe(0);
    // Cy leaves the team: G4 still has Ace and Bea together; Cy is gone from every game.
    await setTeamMember(handle.db, teamId, ids.Cy!, false);
    const left = await loadPlayedTogether(handle.db, teamId);
    expect(left.games.find((g) => g.matchId === "OC1_4")!.members.map((m) => m.playerId)).not.toContain(ids.Cy);
    expect(left.games.find((g) => g.matchId === "OC1_1")!.opponents).toEqual([]);
    // The personal-use account is promoted to the team: G3 now counts.
    await setTeamMember(handle.db, teamId, ids.Solo!, true);
    const promoted = await loadPlayedTogether(handle.db, teamId);
    expect(promoted.games.map((g) => g.matchId)).toContain("OC1_3");
  });
});
