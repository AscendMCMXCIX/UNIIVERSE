import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Session } from "@/server/auth/permissions";

/*
  The Encounters detail action with real permission checks: teammates' Riot games need
  view-matches and view-teammate-stats, a personal-use account has neither, only the list's
  opaque key shape is accepted, filters naming someone outside the team are ignored, and the
  answer never carries an account id (PUUID).
*/

const state = vi.hoisted(() => ({ db: null as unknown, session: null as unknown }));
vi.mock("@/server/bootstrap", () => ({ getAppDb: async () => state.db }));
vi.mock("@/server/auth/session", async (orig) => ({ ...(await orig<object>()), getSession: async () => state.session }));

import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatches, matchDetails, riotAccounts, type MatchParticipantDetail } from "@/server/db/schema";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { encounterKey, invalidateEncountersCache } from "@/server/matches/encounters";
import { getEncounterDetailAction } from "@/server/actions/encounters";
import { STANDARD_PLAYER } from "@/server/auth/permissions";

let handle: DbHandle;
let member: string;
let account: string;
const base = { userId: "11111111-1111-4111-8111-111111111111", label: "Me", username: "me", hasPassword: true, mustChangePassword: false, setupComplete: true };
const player = (over: Partial<Session> = {}): Session => ({ ...base, role: "player", playerId: null, capabilities: STANDARD_PLAYER, teamMember: true, ...over }) as Session;
const part = (puuid: string, name: string, teamId: number): MatchParticipantDetail => ({ puuid, name, teamId, championId: "Ahri", championKey: 0, champLevel: 15, position: null, win: teamId === 100, kills: 3, deaths: 2, assists: 4, cs: 150, gold: 9000, damage: 12000, damageTaken: 15000, vision: 20, wardsPlaced: 8, items: null, spells: null, runes: null });
const all = { season: null, queues: null, playerId: null, accountId: null };

beforeAll(async () => {
  handle = await testDb();
  state.db = handle.db;
  const teamId = (await getOrCreateTeam(handle.db)).id;
  member = (await createPlayer(handle.db, teamId, { displayName: "Ace", primaryRole: "MID", primaryPool: [] })).id;
  const [r] = await handle.db.insert(riotAccounts).values({ ownerType: "player", playerId: member, gameName: "ace", tagLine: "T", platform: "oc1", puuid: "p-ace", label: "ace" }).returning({ id: riotAccounts.id });
  account = r!.id;
  const now = Date.now();
  for (const [matchId, at] of [["OC1_1", now - 2000], ["OC1_2", now - 1000]] as const) {
    await handle.db.insert(accountMatches).values({ accountId: account, matchId, gameCreation: at, queueId: 420, championId: "Ahri", role: "MID", win: true, teamId: 100, patch: "16.1", gameDuration: 1800, kills: 4, deaths: 2, assists: 6, cs: 180, damage: 20000, visionScore: 20 });
    await handle.db.insert(matchDetails).values({ matchId, gameCreation: 1, gameDuration: 1800, teams: [], participants: [part("p-ace", "ace#T", 100), part("secret-puuid-x", "Rival#OCE", 200)] });
  }
  invalidateEncountersCache();
}, 60_000);
afterAll(async () => {
  await handle.close();
});

describe("encounter detail permissions", () => {
  const key = () => encounterKey("secret-puuid-x");

  it("refuses without a session, a personal-use account, or without the teammate-statistics right", async () => {
    for (const session of [null, player({ teamMember: false }), player({ capabilities: STANDARD_PLAYER.filter((c) => c !== "view-teammate-stats") }), player({ capabilities: STANDARD_PLAYER.filter((c) => c !== "view-matches") })]) {
      state.session = session;
      expect(await getEncounterDetailAction(key(), all)).toEqual({ status: "not-found", message: "Encounters are not part of your access." });
    }
  });

  it("answers a team member by opaque key only, never with the account id", async () => {
    state.session = player();
    const res = await getEncounterDetailAction(key(), all);
    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;
    expect(res.summary).toMatchObject({ name: "Rival#OCE", games: 2, opponent: { games: 2, wins: 2, losses: 0 } });
    expect(res.games.map((g) => g.matchId)).toEqual(["OC1_2", "OC1_1"]);
    expect(JSON.stringify(res)).not.toContain("secret-puuid-x");
    // A PUUID, or anything not shaped like the list's key, is not looked up.
    expect((await getEncounterDetailAction("secret-puuid-x", all)).status).toBe("not-found");
    expect((await getEncounterDetailAction("'; DROP TABLE x;--", all)).status).toBe("not-found");
  });

  it("ignores filters that name someone outside the team", async () => {
    state.session = player();
    const outsider = await getEncounterDetailAction(key(), { ...all, playerId: "00000000-0000-4000-8000-000000000000", accountId: account });
    expect(outsider).toMatchObject({ status: "ok", summary: { games: 2 } });
    // An account that is not the chosen member's is dropped; the member's own account applies.
    const mine = await getEncounterDetailAction(key(), { ...all, playerId: member, accountId: account });
    expect(mine).toMatchObject({ status: "ok", summary: { games: 2 } });
    const wrongAccount = await getEncounterDetailAction(key(), { ...all, playerId: member, accountId: "00000000-0000-4000-8000-000000000000" });
    expect(wrongAccount).toMatchObject({ status: "ok", summary: { games: 2 } });
  });
});
