import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatches, matchDetails, riotAccounts, type MatchParticipantDetail } from "@/server/db/schema";
import { createPlayer, getOrCreateTeam, setTeamMember } from "@/server/repositories/team";
import { invalidatePlayedTogetherCache, loadPlayedTogether } from "@/server/matches/played-together";
import { togetherCompositions } from "@/server/matches/compositions";
import { togetherEntry } from "@/domain/played-together";
import { players } from "@/server/db/schema";
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

  it("shows a member with two accounts in one game by the account their own profile shows, whatever the row order", async () => {
    const db = handle.db;
    // The profile's list keeps the lowest account id (domain/season-stats dedupeGames); so does this page.
    const [lower, higher] = [acc.ace!, acc.ace2!].sort() as [string, string];
    await db.update(accountMatches).set({ championId: "Riven" }).where(and(eq(accountMatches.accountId, lower), eq(accountMatches.matchId, "OC1_1")));
    await db.update(accountMatches).set({ championId: "Jinx" }).where(and(eq(accountMatches.accountId, higher), eq(accountMatches.matchId, "OC1_1")));
    invalidatePlayedTogetherCache();
    const data = await loadPlayedTogether(db, teamId);
    expect(data.games[0]!.members.find((m) => m.playerId === ids.Ace)!.championId).toBe("Riven");
    await db.update(accountMatches).set({ championId: "Ahri" }).where(eq(accountMatches.matchId, "OC1_1"));
    invalidatePlayedTogetherCache();
  });

  it("names opponents by their current name: a rename shows at once, cache or no cache", async () => {
    const db = handle.db;
    expect((await loadPlayedTogether(db, teamId)).games[0]!.opponents).toEqual(["Cy"]);
    await db.update(players).set({ displayName: "Cyrus" }).where(eq(players.id, ids.Cy!));
    expect((await loadPlayedTogether(db, teamId)).games[0]!.opponents).toEqual(["Cyrus"]);
    await db.update(players).set({ displayName: "Cy" }).where(eq(players.id, ids.Cy!));
    expect((await loadPlayedTogether(db, teamId)).games[0]!.opponents).toEqual(["Cy"]);
  });

  it("tells a game whose record Riot no longer serves apart from one whose record is still to come", async () => {
    const db = handle.db;
    // Two members in a game whose record was fetched after Riot stopped serving it (no players):
    // their side will never be known, so it is not "still to be checked".
    await db.insert(accountMatches).values([
      { accountId: acc.ace!, matchId: "OC1_9", gameCreation: 9000, queueId: 440, championId: "Ahri", role: "MID", win: true, patch: "16.1", gameDuration: 1800, ...{ kills: -1 } },
      { accountId: acc.bea!, matchId: "OC1_9", gameCreation: 9000, queueId: 440, championId: "Ahri", role: "MID", win: true, patch: "16.1", gameDuration: 1800, ...{ kills: -1 } },
    ]);
    await db.insert(matchDetails).values({ matchId: "OC1_9", gameCreation: 9000, gameDuration: 1800, teams: [], participants: [] });
    const data = await loadPlayedTogether(db, teamId);
    expect(data.games.map((g) => g.matchId)).toEqual(["OC1_1"]);
    expect(data).toMatchObject({ unknownSide: 1, unavailableSide: 1 });
    await db.delete(accountMatches).where(eq(accountMatches.matchId, "OC1_9"));
    await db.delete(matchDetails).where(eq(matchDetails.matchId, "OC1_9"));
    expect(await loadPlayedTogether(db, teamId)).toMatchObject({ unknownSide: 1, unavailableSide: 0 });
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

  it("reads each member's largest multikill from the stored counts, never from a missing or malformed record", async () => {
    const set = (key: string, matchId: string, stats: Record<string, unknown>) =>
      handle.db
        .update(accountMatches)
        .set({ extraStats: stats as never })
        .where(and(eq(accountMatches.accountId, acc[key]!), eq(accountMatches.matchId, matchId)));
    const quadra = { largestMultiKill: 4, doubleKills: 2, tripleKills: 1, quadraKills: 1, pentaKills: 0 };
    await set("ace", "OC1_1", quadra);
    await set("ace2", "OC1_1", quadra);
    await set("bea", "OC1_1", { doubleKills: 1, tripleKills: 0, quadraKills: 0, pentaKills: 0 }); // no largest: from the counts
    await set("ace", "OC1_4", { largestMultiKill: 1, doubleKills: 0 }); // single kills only
    await set("bea", "OC1_4", { largestMultiKill: "x", doubleKills: "2; DROP" }); // malformed
    await set("solo", "OC1_3", { largestMultiKill: 6 }); // beyond a pentakill
    invalidatePlayedTogetherCache();
    const data = await loadPlayedTogether(handle.db, teamId);
    const mk = (matchId: string, player: string) => data.games.find((g) => g.matchId === matchId)!.members.find((m) => m.playerId === ids[player])!.multikill;
    expect(mk("OC1_1", "Ace")).toBe(4);
    expect(mk("OC1_1", "Bea")).toBe(2);
    expect(mk("OC1_4", "Ace")).toBeNull();
    expect(mk("OC1_4", "Bea")).toBeNull();
    expect(mk("OC1_3", "Solo")).toBe(5);
    // A record stored before the counts were kept has none.
    expect(mk("OC1_3", "Ace")).toBeNull();
  });

  it("gives a game with members on both sides one composition per listed side, each marking its own", async () => {
    const db = handle.db;
    await setTeamMember(db, teamId, ids.Cy!, true);
    const row = (key: string, team: number) => ({ accountId: acc[key]!, matchId: "OC1_8", gameCreation: 8000, queueId: 440, championId: "Ahri", role: "MID", win: team === 100, patch: "16.1", gameDuration: 1800 });
    await db.insert(accountMatches).values([row("ace", 100), row("bea", 100), row("cy", 200)]);
    const solo = (await db.select({ id: riotAccounts.id }).from(riotAccounts).where(eq(riotAccounts.puuid, "p-solo")))[0]!.id;
    await db.insert(accountMatches).values({ ...row("ace", 200), accountId: solo });
    const fill = (n: number, team: number) => Array.from({ length: n }, (_, i) => part(`filler-${team}-${i}`, team));
    await db.insert(matchDetails).values({ matchId: "OC1_8", gameCreation: 8000, gameDuration: 1800, teams: [], participants: [part("p-ace", 100), part("p-bea", 100), ...fill(3, 100), part("p-cy", 200), part("p-solo", 200), ...fill(3, 200)] });
    const data = await loadPlayedTogether(db, teamId);
    const listed = data.games.filter((g) => g.matchId === "OC1_8");
    expect(listed.map((g) => g.teamId).sort()).toEqual([100, 200]);
    const teams = await togetherCompositions(db, teamId, listed, ids.Ace!);
    expect(teams[togetherEntry("OC1_8", 100)]?.side).toBe("blue");
    expect(teams[togetherEntry("OC1_8", 200)]?.side).toBe("red");
    // By match id alone, no side is "own": a reader that does not know the listing's side never highlights the other.
    expect(teams.OC1_8?.side).toBeNull();
    expect(teams[togetherEntry("OC1_8", 100)]!.blue.some((p) => p.you)).toBe(true);
    // A game listed for one side keeps that side under both keys.
    const one = await togetherCompositions(db, teamId, listed.filter((g) => g.teamId === 100), null);
    expect(one[togetherEntry("OC1_8", 100)]?.side).toBe("blue");
    expect(one.OC1_8?.side).toBe("blue");
  });
});
