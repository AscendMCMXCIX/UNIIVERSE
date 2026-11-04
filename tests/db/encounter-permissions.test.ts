import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Session } from "@/server/auth/permissions";

/*
  One player met, as Match History lists their games (Match History → Encounters → a player; the
  page itself is Match History's, behind its own access check): only the list's opaque key shape
  is accepted, only the profile player's own games in the season, game mode and account count, and
  nothing carries an account id (PUUID). A rename seen in a later stored game is followed for the
  OP.GG link. A game's scoreboard in Match History marks the players met in other games with real
  permission checks: your own profile, or a teammate's with the teammate-statistics right; a
  personal-use account sees only its own.
*/

const state = vi.hoisted(() => ({ db: null as unknown, session: null as unknown }));
vi.mock("@/server/bootstrap", () => ({ getAppDb: async () => state.db }));
vi.mock("@/server/auth/session", async (orig) => ({ ...(await orig<object>()), getSession: async () => state.session }));

import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatches, matchDetails, riotAccounts, type MatchParticipantDetail } from "@/server/db/schema";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { loadEncounterFocus } from "@/server/players/encounters";
import { readEncounterFocus } from "@/domain/encounters";
import { getMatchMeetingsAction } from "@/server/actions/match-history";
import { STANDARD_PLAYER } from "@/server/auth/permissions";

let handle: DbHandle;
let ace: string;
let bea: string;
let account: string;
let beaAccount: string;
const base = { userId: "11111111-1111-4111-8111-111111111111", label: "Me", username: "me", hasPassword: true, mustChangePassword: false, setupComplete: true };
const player = (over: Partial<Session> = {}): Session => ({ ...base, role: "player", playerId: null, capabilities: STANDARD_PLAYER, teamMember: true, ...over }) as Session;
const part = (puuid: string, name: string, teamId: number): MatchParticipantDetail => ({ puuid, name, teamId, championId: "Ahri", championKey: 0, champLevel: 15, position: null, win: teamId === 100, kills: 3, deaths: 2, assists: 4, cs: 150, gold: 9000, damage: 12000, damageTaken: 15000, vision: 20, wardsPlaced: 8, items: null, spells: null, runes: null });
const keyOf = (puuid: string) => createHash("sha256").update(`uniiverse-encounter:${puuid}`).digest("base64url").slice(0, 16);
const key = keyOf("secret-puuid-x");
const season16 = { season: 16, mode: "all", accountId: null };

beforeAll(async () => {
  handle = await testDb();
  state.db = handle.db;
  const teamId = (await getOrCreateTeam(handle.db)).id;
  ace = (await createPlayer(handle.db, teamId, { displayName: "Ace", primaryRole: "MID", primaryPool: [] })).id;
  bea = (await createPlayer(handle.db, teamId, { displayName: "Bea", primaryRole: "TOP", primaryPool: [] })).id;
  const [a] = await handle.db.insert(riotAccounts).values({ ownerType: "player", playerId: ace, gameName: "ace", tagLine: "T", platform: "oc1", puuid: "p-ace", label: "main" }).returning({ id: riotAccounts.id });
  const [b] = await handle.db.insert(riotAccounts).values({ ownerType: "player", playerId: bea, gameName: "bea", tagLine: "T", platform: "oc1", puuid: "p-bea", label: "main" }).returning({ id: riotAccounts.id });
  account = a!.id;
  beaAccount = b!.id;
  const now = Date.now();
  // OC1_0 is a Season 2025 game: profiles start at 2026, so it never counts here.
  for (const [matchId, at, patch] of [["OC1_0", now - 3000, "15.24"], ["OC1_1", now - 2000, "16.1"], ["OC1_2", now - 1000, "16.1"]] as const) {
    await handle.db.insert(accountMatches).values({ accountId: account, matchId, gameCreation: at, queueId: 420, championId: "Ahri", role: "MID", win: true, teamId: 100, patch, gameDuration: 1800, kills: 4, deaths: 2, assists: 6, cs: 180, damage: 20000, visionScore: 20 });
    await handle.db.insert(matchDetails).values({ matchId, gameCreation: at, gameDuration: 1800, teams: [], participants: [part("p-ace", "ace#T", 100), part("secret-puuid-x", "Rival#OCE", 200)] });
  }
  // Later, in Bea's game, the same player under a new Riot ID.
  await handle.db.insert(accountMatches).values({ accountId: beaAccount, matchId: "OC1_3", gameCreation: now, queueId: 420, championId: "Ahri", role: "TOP", win: false, teamId: 100, patch: "16.1", gameDuration: 1800 });
  await handle.db.insert(matchDetails).values({ matchId: "OC1_3", gameCreation: now, gameDuration: 1800, teams: [], participants: [part("p-bea", "bea#T", 100), part("secret-puuid-x", "Rival Renamed#OCE", 200)] });
}, 60_000);
afterAll(async () => {
  await handle.close();
});

describe("one player met: their games in Match History (Match History → Encounters → a player)", () => {
  const scope = { accountIds: [] as string[], season: 16, mode: "all" as const };
  beforeAll(() => {
    scope.accountIds = [account];
  });

  it("is named by the list's opaque key only: never an account id, and nothing else is looked up", async () => {
    const met = await loadEncounterFocus(handle.db, scope, { key, side: "all" });
    expect(met.summary).toMatchObject({ name: "Rival#OCE", games: 2, opponent: { games: 2, wins: 2, losses: 0 }, ally: { games: 0 } });
    // Every game with them, newest first in the list; the Season 2025 game never counts.
    expect([...met.matchIds].sort()).toEqual(["OC1_1", "OC1_2"]);
    expect(JSON.stringify({ ...met, matchIds: [...met.matchIds] })).not.toContain("secret-puuid-x");
    // A PUUID, or anything not shaped like the list's key, never reaches the database.
    for (const bad of ["secret-puuid-x", "'; DROP TABLE x;--", "p-ace"]) expect(readEncounterFocus({ met: bad })).toBeNull();
    // A key nobody has: no records and no games.
    expect(await loadEncounterFocus(handle.db, scope, { key: "AAAAAAAAAAAAAAAA", side: "all" })).toEqual({ summary: null, renamed: null, opgg: null, matchIds: new Set() });
  });

  it("follows a rename seen in a later stored game for the OP.GG link, and keeps the counts the profile player's own", async () => {
    const met = await loadEncounterFocus(handle.db, scope, { key, side: "all" });
    // The later game (another member's) names the account's new Riot ID; the counts stay Ace's.
    expect(met.renamed).toBe("Rival Renamed#OCE");
    expect(met.opgg).toBe("https://op.gg/lol/summoners/oce/Rival%20Renamed-OCE");
  });

  it("lists exactly the games each side's record counts", async () => {
    expect([...(await loadEncounterFocus(handle.db, scope, { key, side: "against" })).matchIds].sort()).toEqual(["OC1_1", "OC1_2"]);
    expect((await loadEncounterFocus(handle.db, scope, { key, side: "alongside" })).matchIds.size).toBe(0);
  });

  it("stays within the scope's accounts, season and game mode", async () => {
    // Only the accounts given count (the page gives the profile player's own, or the one chosen of them).
    expect((await loadEncounterFocus(handle.db, { ...scope, accountIds: [beaAccount] }, { key, side: "all" })).matchIds).toEqual(new Set(["OC1_3"]));
    // A game mode without these games: not met there.
    expect((await loadEncounterFocus(handle.db, { ...scope, mode: "flex" }, { key, side: "all" })).summary).toBeNull();
    // Season 2025 holds the older game only.
    expect([...(await loadEncounterFocus(handle.db, { ...scope, season: 15 }, { key, side: "all" })).matchIds]).toEqual(["OC1_0"]);
  });
});

describe("a game's scoreboard: the players met in other games", () => {
  const rival = { slot: 1, key, games: 2, ally: 0, opponent: 2 };

  it("refuses without a session, and another player's to a personal-use account or without the teammate-statistics right", async () => {
    state.session = null;
    expect(await getMatchMeetingsAction(ace, "OC1_2", season16)).toEqual({ status: "not-found", message: "Sign in to see match details." });
    for (const session of [player({ teamMember: false }), player({ capabilities: STANDARD_PLAYER.filter((c) => c !== "view-teammate-stats") })]) {
      state.session = session;
      expect(await getMatchMeetingsAction(ace, "OC1_2", season16)).toEqual({ status: "not-found", message: "Teammates' match details are not part of your access." });
    }
  });

  it("marks them with their window's key and counts for you and a teammate, never with the account id", async () => {
    for (const session of [player({ playerId: ace }), player({ playerId: ace, teamMember: false, capabilities: STANDARD_PLAYER.filter((c) => c !== "view-teammate-stats") }), player({ playerId: bea })]) {
      state.session = session;
      const res = await getMatchMeetingsAction(ace, "OC1_2", season16);
      expect(res).toEqual({ status: "ok", players: [rival] });
      expect(JSON.stringify(res)).not.toContain("secret-puuid-x");
    }
    // The same counts as the player's games the mark opens.
    expect((await loadEncounterFocus(handle.db, { accountIds: [account], season: 16, mode: "all" }, { key, side: "all" })).summary).toMatchObject({ games: 2, ally: { games: 0 }, opponent: { games: 2 } });
  });

  it("answers only for the player's own games in the list's season, game mode and account", async () => {
    state.session = player({ playerId: ace });
    const missing = { status: "not-found", message: "This match is not in this player's history." };
    // A Season 2025 game, and Season 2025 itself.
    expect(await getMatchMeetingsAction(ace, "OC1_0", season16)).toEqual(missing);
    expect(await getMatchMeetingsAction(ace, "OC1_0", { ...season16, season: 15 })).toEqual(missing);
    // Bea's game, another player's account, a game mode without the game, and unknown inputs.
    expect(await getMatchMeetingsAction(ace, "OC1_3", season16)).toEqual(missing);
    expect(await getMatchMeetingsAction(ace, "OC1_2", { ...season16, accountId: beaAccount })).toEqual(missing);
    expect(await getMatchMeetingsAction(ace, "OC1_2", { ...season16, accountId: account })).toEqual({ status: "ok", players: [rival] });
    expect(await getMatchMeetingsAction(ace, "OC1_2", { ...season16, mode: "flex" })).toEqual(missing);
    expect(await getMatchMeetingsAction(ace, "OC1_2", { ...season16, mode: "aram" })).toEqual(missing);
    expect(await getMatchMeetingsAction(ace, "'; DROP TABLE x;--", season16)).toEqual(missing);
    expect(await getMatchMeetingsAction("not-a-player", "OC1_2", season16)).toEqual(missing);
  });
});
