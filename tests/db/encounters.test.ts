import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatches, matchDetails, riotAccounts, type MatchParticipantDetail } from "@/server/db/schema";
import { createPlayer, getOrCreateTeam, setTeamMember } from "@/server/repositories/team";
import { encounterKey, encounterSummaries, invalidateEncountersCache, loadEncounters } from "@/server/matches/encounters";
import { filterEncounterRows, listEncounters, summariseEncounters } from "@/domain/encounters";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";

/*
  Encounters from stored histories (synthetic accounts and games, no Riot request): other players
  recognised by account across renames, game-level totals counting a game once however many
  members were in it, members on both sides of one game kept apart, a member's linked accounts
  counted as one person, players met once, nameless or linked to any profile left out, and
  accounts never reaching the page.
*/

let handle: DbHandle;
let teamId: string;
const ids: Record<string, string> = {};
const acc: Record<string, string> = {};
const part = (puuid: string, name: string | null, teamId: number, championId: string | null = "Ahri"): MatchParticipantDetail => ({ puuid, name, teamId, championId, championKey: 0, champLevel: 15, position: null, win: teamId === 100, kills: 3, deaths: 2, assists: 4, cs: 150, gold: 9000, damage: 12000, damageTaken: 15000, vision: 20, wardsPlaced: 8, items: null, spells: null, runes: null });
const now = Date.now();

beforeAll(async () => {
  handle = await testDb();
  const db = handle.db;
  await syncStaticData(db, new FixtureStaticProvider(), { fingerprint: false });
  teamId = (await getOrCreateTeam(db)).id;
  for (const [name, role, champ] of [["Ace", "TOP", "Riven"], ["Bea", "JUNGLE", "Viego"], ["Cy", "MID", "Ahri"], ["Solo", "ADC", "Jinx"]] as const) {
    ids[name] = (await createPlayer(db, teamId, { displayName: name, primaryRole: role, primaryPool: [champ] })).id;
  }
  await setTeamMember(db, teamId, ids.Solo!, false); // personal use: never a member, never a stranger
  const account = async (key: string, player: string) => {
    const [r] = await db.insert(riotAccounts).values({ ownerType: "player", playerId: ids[player]!, gameName: key, tagLine: "T", platform: "oc1", puuid: `p-${key}`, label: key }).returning({ id: riotAccounts.id });
    acc[key] = r!.id;
  };
  await account("ace", "Ace");
  await account("ace2", "Ace");
  await account("bea", "Bea");
  await account("cy", "Cy");
  await account("solo", "Solo");
  const game = (key: string, matchId: string, at: number, win: boolean, teamId: number, queueId = 420) => ({ accountId: acc[key]!, matchId, gameCreation: at, queueId, championId: "Ahri", role: "MID", win, teamId, patch: "16.1", gameDuration: 1800, kills: 4, deaths: 2, assists: 6, cs: 180, damage: 20000, visionScore: 20 });
  await db.insert(accountMatches).values([
    // G1: Ace (stored on both of his accounts) and Bea on blue and win; Cy on red and loses.
    game("ace", "OC1_1", now - 5000, true, 100, 440),
    game("ace2", "OC1_1", now - 5000, true, 100, 440),
    game("bea", "OC1_1", now - 5000, true, 100, 440),
    game("cy", "OC1_1", now - 5000, false, 200, 440),
    // G2: Bea on blue, wins.
    game("bea", "OC1_2", now - 4000, true, 100),
    // G3: Ace on blue with the personal-use account, loses.
    game("ace", "OC1_3", now - 3000, false, 100),
    game("solo", "OC1_3", now - 3000, false, 100),
  ]);
  const detail = (matchId: string, parts: MatchParticipantDetail[]) => ({ matchId, gameCreation: 1, gameDuration: 1800, teams: [], participants: parts });
  await db.insert(matchDetails).values([
    // X: with Ace and Bea, against Cy (as "Old Name#OCE"). Y: against Ace and Bea, with Cy.
    detail("OC1_1", [part("p-ace", "ace#T", 100), part("p-ace2", "ace2#T", 100), part("p-bea", "bea#T", 100), part("px", "Old Name#OCE", 100), part("p-cy", "cy#T", 200), part("py", "Ýrsa#ÍS1", 200)]),
    // X against Bea, Y with Bea.
    detail("OC1_2", [part("p-bea", "bea#T", 100), part("py", "Ýrsa#ÍS1", 100), part("px", "Old Name#OCE", 200), part("pz", "Once#OCE", 200)]),
    // X with Ace, renamed (the latest name is the one shown). Z (G2) and W (here) are met once.
    detail("OC1_3", [part("p-ace", "ace#T", 100), part("p-solo", "solo#T", 100), part("px", "不知火 Renamed#JP1", 100, null), part("pw", "Once Only#OCE", 200), part("", "No Account#OCE", 200), part("pn", null, 200), part("pn", "", 200)]),
  ]);
  invalidateEncountersCache();
}, 60_000);
afterAll(async () => {
  await handle.close();
});

const byName = (rows: ReturnType<typeof summariseEncounters>, name: string) => rows.find((s) => s.name === name);

describe("encounters", () => {
  it("counts allies and opponents by game and by member, across renames and linked accounts", async () => {
    const data = await loadEncounters(handle.db, teamId, { cache: false });
    expect(data.memberGames).toBe(3);
    const all = summariseEncounters(data.rows);
    // Linked profiles (members, the personal-use account, a member's second account), players met
    // once (Z, W), and records without an account or a name are never listed.
    expect(all.map((s) => s.name).sort()).toEqual(["Ýrsa#ÍS1", "不知火 Renamed#JP1"].sort());
    expect(data.rows.some((r) => r.key === encounterKey("p-solo") || r.key === encounterKey("p-ace2"))).toBe(false);

    // X: one account, latest Riot ID. Three games: allies in G1 and G3, opponents in G1 (Cy) and G2.
    const x = byName(all, "不知火 Renamed#JP1")!;
    expect(x.key).toBe(encounterKey("px"));
    expect(x.games).toBe(3);
    expect(x.ally).toEqual({ games: 2, wins: 1, losses: 1 });
    expect(x.opponent).toEqual({ games: 2, wins: 1, losses: 1 });
    const xm = Object.fromEntries(x.members.map((m) => [m.playerId, m]));
    // Ace's G1 is stored on two accounts and counted once.
    expect(xm[ids.Ace!]).toMatchObject({ ally: { games: 2, wins: 1, losses: 1 }, opponent: { games: 0 } });
    expect(xm[ids.Bea!]).toMatchObject({ ally: { games: 1, wins: 1 }, opponent: { games: 1, wins: 1 } });
    expect(xm[ids.Cy!]).toMatchObject({ ally: { games: 0 }, opponent: { games: 1, wins: 0, losses: 1 } });

    // Y: Ace and Bea both faced them in G1, which is one opponent game for the team, not two.
    const y = byName(all, "Ýrsa#ÍS1")!;
    expect(y.games).toBe(2);
    expect(y.opponent).toEqual({ games: 1, wins: 1, losses: 0 });
    expect(y.ally).toEqual({ games: 2, wins: 1, losses: 1 });
    expect(y.members.reduce((n, m) => n + m.opponent.games, 0)).toBe(2);

    // The lists: allies and opponents met twice or more, and players met by several members.
    expect(listEncounters(all, { view: "allies", min: 2, sort: "games" }).map((s) => s.name)).toEqual(["不知火 Renamed#JP1", "Ýrsa#ÍS1"]);
    expect(listEncounters(all, { view: "opponents", min: 2, sort: "games" }).map((s) => s.name)).toEqual(["不知火 Renamed#JP1"]);
    expect(listEncounters(all, { view: "shared", min: 2, sort: "games" }).map((s) => s.name).sort()).toEqual(["Ýrsa#ÍS1", "不知火 Renamed#JP1"].sort());
    expect(listEncounters(all, { view: "allies", min: 3, sort: "games" })).toEqual([]);
    expect(listEncounters(all, { view: "allies", min: 2, sort: "games", query: "不知火" }).map((s) => s.name)).toEqual(["不知火 Renamed#JP1"]);
  });

  it("filters by member, account and game mode without losing the counting rules", async () => {
    const data = await loadEncounters(handle.db, teamId);
    const bea = summariseEncounters(filterEncounterRows(data.rows, { season: null, queues: null, playerId: ids.Bea!, accountId: null }));
    expect(byName(bea, "不知火 Renamed#JP1")).toMatchObject({ games: 2, ally: { games: 1 }, opponent: { games: 1 } });
    const aceMain = summariseEncounters(filterEncounterRows(data.rows, { season: null, queues: [420], playerId: ids.Ace!, accountId: acc.ace! }));
    expect(aceMain.map((s) => [s.name, s.ally.games])).toEqual([["不知火 Renamed#JP1", 1]]);
    const solo = summariseEncounters(filterEncounterRows(data.rows, { season: null, queues: [420], playerId: null, accountId: null }));
    expect(byName(solo, "不知火 Renamed#JP1")).toMatchObject({ games: 2, ally: { games: 1 }, opponent: { games: 1 } });
    expect(byName(solo, "Ýrsa#ÍS1")).toMatchObject({ games: 1 });
    // The page's summaries are kept per row filter with the cached rows: the same filters, the same result.
    const f = { season: null, queues: [420], playerId: null, accountId: null };
    expect(encounterSummaries(data.rows, f)).toBe(encounterSummaries(data.rows, { ...f, queues: [420] }));
    expect(encounterSummaries(data.rows, f)).toEqual(solo);
  });

  it("never sends an account to the page, and follows new games and membership at once", async () => {
    const first = await loadEncounters(handle.db, teamId);
    const json = JSON.stringify(first);
    for (const puuid of ["px", "py", "pz", "p-ace", "p-solo"]) expect(json).not.toContain(`"${puuid}"`);
    expect(first.rows.every((r) => /^[A-Za-z0-9_-]{16}$/.test(r.key))).toBe(true);

    // A new game with Y: the cache sees it through the history fingerprint.
    await handle.db.insert(accountMatches).values({ accountId: acc.cy!, matchId: "OC1_4", gameCreation: now - 1000, queueId: 420, championId: "Ahri", role: "MID", win: true, teamId: 100, patch: "16.1", gameDuration: 1800, kills: 4, deaths: 2, assists: 6, cs: 180, damage: 20000, visionScore: 20 });
    await handle.db.insert(matchDetails).values({ matchId: "OC1_4", gameCreation: 1, gameDuration: 1800, teams: [], participants: [part("p-cy", "cy#T", 100), part("py", "Ýrsa Again#ÍS1", 200)] });
    const after = summariseEncounters((await loadEncounters(handle.db, teamId)).rows);
    expect(byName(after, "Ýrsa Again#ÍS1")).toMatchObject({ key: encounterKey("py"), games: 3 });

    // Cy leaves the team: their games stop counting, and Cy is still never listed as a stranger.
    await setTeamMember(handle.db, teamId, ids.Cy!, false);
    const left = await loadEncounters(handle.db, teamId);
    expect(left.rows.some((r) => r.playerId === ids.Cy)).toBe(false);
    expect(left.members[ids.Cy!]).toBeUndefined();
    expect(left.rows.some((r) => r.key === encounterKey("p-cy"))).toBe(false);
    expect(byName(summariseEncounters(left.rows), "不知火 Renamed#JP1")).toMatchObject({ games: 3, opponent: { games: 1 } });
  });
});
