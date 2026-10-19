import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Session } from "@/server/auth/permissions";

/*
  Team bookmarks, with real permission checks: a game played together by any member who sees
  Played Together; a member shares only their own games; removal by whoever added it or a match
  manager.
*/

const state = vi.hoisted(() => ({ db: null as unknown, session: null as unknown }));
vi.mock("@/server/bootstrap", () => ({ getAppDb: async () => state.db }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
vi.mock("@/server/auth/session", async (orig) => ({
  ...(await orig<object>()),
  getSession: async () => state.session,
  requireTeamMember: async () => {
    const { isTeamMember } = await import("@/server/auth/permissions");
    if (!state.session || !isTeamMember(state.session as Session)) {
      const err = new Error("That is part of the team workspace, which this account does not use.");
      err.name = "NotAuthorizedError";
      throw err;
    }
    return state.session;
  },
}));

import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatches, matchDetails, riotAccounts, teamBookmarks, users, type MatchParticipantDetail } from "@/server/db/schema";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { listTeamBookmarks } from "@/server/matches/links";
import { invalidatePlayedTogetherCache } from "@/server/matches/played-together";
import { setTeamBookmarkAction } from "@/server/actions/matches";
import { STANDARD_PLAYER } from "@/server/auth/permissions";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";

const USER_IDS = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333", "44444444-4444-4444-8444-444444444444", "55555555-5555-4555-8555-555555555555", "66666666-6666-4666-8666-666666666666"];
let handle: DbHandle;
let teamId: string;
const ids: Record<string, string> = {};
const acc: Record<string, string> = {};
const T0 = Date.UTC(2026, 9, 10, 18, 0);
const ROSTER = [
  ["Top", "TOP", "Ornn"],
  ["Jg", "JUNGLE", "Vi"],
  ["Mid", "MID", "Ahri"],
  ["Bot", "ADC", "Jinx"],
  ["Sup", "SUPPORT", "Nautilus"],
] as const;

const base = { userId: "11111111-1111-4111-8111-111111111111", label: "Me", username: "me", hasPassword: true, mustChangePassword: false, setupComplete: true };
const asPlayer = (playerId: string, userId = base.userId): Session => ({ ...base, userId, role: "player", playerId, capabilities: STANDARD_PLAYER, teamMember: true });
const manager: Session = { ...base, userId: "22222222-2222-4222-8222-222222222222", role: "player", playerId: null, capabilities: [...STANDARD_PLAYER, "manage-matches"], teamMember: true };
const part = (puuid: string, teamId: number, championId: string): MatchParticipantDetail => ({ puuid, name: null, teamId, championId, championKey: 0, champLevel: 15, position: null, win: teamId === 100, kills: 3, deaths: 2, assists: 4, cs: 150, gold: 9000, damage: 12000, damageTaken: 15000, vision: 20, wardsPlaced: 8, items: null, spells: null, runes: null });

beforeAll(async () => {
  handle = await testDb();
  const db = handle.db;
  state.db = db;
  await syncStaticData(db, new FixtureStaticProvider(), { fingerprint: false });
  // The signed-in users the sessions below stand for (bookmarks record who added them).
  await db.insert(users).values(USER_IDS.map((id, i) => ({ id, username: `user${i}`, displayName: `User ${i}` })));
  teamId = (await getOrCreateTeam(db)).id;
  for (const [name, role, champ] of ROSTER) {
    ids[name] = (await createPlayer(db, teamId, { displayName: name, primaryRole: role, primaryPool: [champ] })).id;
    const [a] = await db.insert(riotAccounts).values({ ownerType: "player", playerId: ids[name]!, gameName: name, tagLine: "T", platform: "oc1", puuid: `p-${name}`, label: name }).returning({ id: riotAccounts.id });
    acc[name] = a!.id;
  }
  const rows: Array<typeof accountMatches.$inferInsert> = [];
  const details: Array<typeof matchDetails.$inferInsert> = [];
  const game = (matchKey: string, at: number, who: ReadonlyArray<(typeof ROSTER)[number]>, side: number, queueId = 440, champOverride?: string) => {
    for (const [name, role, champ] of who) rows.push({ accountId: acc[name]!, matchId: matchKey, gameCreation: at, queueId, championId: champOverride ?? champ, role, win: true, patch: "16.20", gameDuration: 1900 });
    details.push({ matchId: matchKey, gameCreation: at, gameDuration: 1900, teams: [], participants: who.map(([name, , champ]) => part(`p-${name}`, side, champOverride ?? champ)) });
  };
  game("OC1_200", T0 - 86_400_000, ROSTER.slice(3, 5), 100, 420); // Bot and Sup together, a day earlier
  game("OC1_300", T0 - 2 * 86_400_000, ROSTER.slice(0, 1), 100, 420); // Top alone (shareable by Top only)
  await db.insert(accountMatches).values(rows);
  await db.insert(matchDetails).values(details);
  invalidatePlayedTogetherCache();
}, 60_000);
afterAll(async () => {
  await handle.close();
});

describe("team bookmarks", () => {
  it("bookmarks a game played together; only its creator or a manager removes it", async () => {
    state.session = asPlayer(ids.Bot!, "33333333-3333-4333-8333-333333333333");
    const added = await setTeamBookmarkAction("OC1_200", true);
    expect(added).toEqual({ ok: true, data: { bookmarked: true } });
    expect((await listTeamBookmarks(handle.db, teamId)).map((b) => [b.riotMatchId, b.playerId])).toEqual([["OC1_200", null]]);
    state.session = asPlayer(ids.Mid!, "44444444-4444-4444-8444-444444444444");
    expect((await setTeamBookmarkAction("OC1_200", false)).ok).toBe(false);
    state.session = manager;
    expect((await setTeamBookmarkAction("OC1_200", false)).ok).toBe(true);
    expect(await listTeamBookmarks(handle.db, teamId)).toEqual([]);
  });

  it("refuses a game that was not played together unless its own player shares it", async () => {
    state.session = asPlayer(ids.Mid!);
    const notTogether = await setTeamBookmarkAction("OC1_300", true);
    expect(notTogether.ok).toBe(false);
    // Someone else cannot share Top's game.
    expect((await setTeamBookmarkAction("OC1_300", true, { share: true })).ok).toBe(false);
    // Top shares their own game.
    state.session = asPlayer(ids.Top!, "55555555-5555-4555-8555-555555555555");
    expect((await setTeamBookmarkAction("OC1_300", true, { share: true })).ok).toBe(true);
    const [b] = await listTeamBookmarks(handle.db, teamId);
    expect(b).toMatchObject({ riotMatchId: "OC1_300", playerId: ids.Top });
    // Another member cannot remove it; Top can.
    state.session = asPlayer(ids.Jg!, "66666666-6666-4666-8666-666666666666");
    expect((await setTeamBookmarkAction("OC1_300", false)).ok).toBe(false);
    state.session = asPlayer(ids.Top!, "55555555-5555-4555-8555-555555555555");
    expect((await setTeamBookmarkAction("OC1_300", false)).ok).toBe(true);
    expect(await handle.db.select().from(teamBookmarks)).toEqual([]);
  });

  it("rejects malformed match ids and personal-use sessions", async () => {
    state.session = asPlayer(ids.Top!);
    expect((await setTeamBookmarkAction("not a match", true)).ok).toBe(false);
    state.session = { ...asPlayer(ids.Top!), teamMember: false };
    expect((await setTeamBookmarkAction("OC1_200", true)).ok).toBe(false);
  });
});
