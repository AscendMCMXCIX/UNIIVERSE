import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Session } from "@/server/auth/permissions";

/*
  A profile's Encounters window (the player's record and games with one player met) with real
  permission checks: your own profile, or a teammate's with the teammate-statistics right, as the
  profile's Match History; a personal-use account sees only its own. Only the list's opaque key
  shape is accepted, never seasons before 2026 or an account of another player, and the answer
  never carries an account id (PUUID). A rename seen in a later stored game is followed for the
  OP.GG link.
*/

const state = vi.hoisted(() => ({ db: null as unknown, session: null as unknown }));
vi.mock("@/server/bootstrap", () => ({ getAppDb: async () => state.db }));
vi.mock("@/server/auth/session", async (orig) => ({ ...(await orig<object>()), getSession: async () => state.session }));

import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatches, matchDetails, riotAccounts, type MatchParticipantDetail } from "@/server/db/schema";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { getEncounterDetailAction } from "@/server/actions/encounters";
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

describe("a profile's Encounters window", () => {
  it("refuses without a session, and another player's to a personal-use account or without the teammate-statistics right", async () => {
    for (const session of [null, player({ teamMember: false }), player({ capabilities: STANDARD_PLAYER.filter((c) => c !== "view-teammate-stats") })]) {
      state.session = session;
      expect(await getEncounterDetailAction(ace, key, season16)).toEqual({ status: "not-found", message: "This player's games are not part of your access." });
    }
  });

  it("answers your own profile, a personal-use account included, and a teammate's", async () => {
    for (const session of [player({ playerId: ace }), player({ playerId: ace, teamMember: false, capabilities: STANDARD_PLAYER.filter((c) => c !== "view-teammate-stats") }), player({ playerId: bea })]) {
      state.session = session;
      expect(await getEncounterDetailAction(ace, key, season16)).toMatchObject({ status: "ok", summary: { name: "Rival#OCE", games: 2, opponent: { games: 2, wins: 2, losses: 0 } } });
    }
  });

  it("answers by opaque key only, never with the account id, and follows a rename for the OP.GG link", async () => {
    state.session = player({ playerId: bea });
    const res = await getEncounterDetailAction(ace, key, season16);
    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;
    expect(res.games.map((g) => g.matchId)).toEqual(["OC1_2", "OC1_1"]);
    expect(res.more).toBe(0);
    expect(JSON.stringify(res)).not.toContain("secret-puuid-x");
    // The later game (another member's) names the account's new Riot ID; the counts stay Ace's.
    expect(res.renamed).toBe("Rival Renamed#OCE");
    expect(res.opgg).toBe("https://op.gg/lol/summoners/oce/Rival%20Renamed-OCE");
    // A PUUID, or anything not shaped like the list's key, is not looked up.
    expect((await getEncounterDetailAction(ace, "secret-puuid-x", season16)).status).toBe("not-found");
    expect((await getEncounterDetailAction(ace, "'; DROP TABLE x;--", season16)).status).toBe("not-found");
    expect((await getEncounterDetailAction("not-a-player", key, season16)).status).toBe("not-found");
  });

  it("never reaches before Season 2026, another player's account or an unknown game mode", async () => {
    state.session = player({ playerId: ace });
    expect(await getEncounterDetailAction(ace, key, { ...season16, season: 15 })).toMatchObject({ status: "not-found" });
    expect(await getEncounterDetailAction(ace, key, { ...season16, accountId: account })).toMatchObject({ status: "ok", summary: { games: 2 } });
    expect(await getEncounterDetailAction(ace, key, { ...season16, accountId: beaAccount })).toMatchObject({ status: "not-found" });
    expect(await getEncounterDetailAction(ace, key, { ...season16, mode: "aram" })).toMatchObject({ status: "not-found" });
    // Ranked Flex has none of these games.
    expect(await getEncounterDetailAction(ace, key, { ...season16, mode: "flex" })).toMatchObject({ status: "not-found" });
  });
});
