import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { Session } from "@/server/auth/permissions";

/*
  The player Peek on Players and Leaderboards rows reads a player's season (PLAN §1.11): the
  profile's checks. The Players directory's right to ask at all; a personal-use profile only for its
  player and administrators; the season's figures and ranked change only with "view teammates'
  statistics" or on one's own. A viewer without the right gets nothing numerical, or nothing at all.
*/

const state = vi.hoisted(() => ({ db: null as unknown, session: null as unknown }));
vi.mock("@/server/bootstrap", () => ({ getAppDb: async () => state.db }));
vi.mock("@/server/auth/session", async (orig) => ({ ...(await orig<object>()), getSession: async () => state.session }));

import { makeSeason2026Current, testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatches, champions, players, riotAccounts } from "@/server/db/schema";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { getPlayerPeekAction } from "@/server/actions/player-peek";
import { STANDARD_PLAYER } from "@/server/auth/permissions";

let handle: DbHandle;
let ace: string;
let bea: string;
let cat: string;
const base = { userId: "11111111-1111-4111-8111-111111111111", label: "Me", username: "me", hasPassword: true, mustChangePassword: false, setupComplete: true };
const viewer = (over: Partial<Session> = {}): Session => ({ ...base, role: "player", playerId: null, capabilities: STANDARD_PLAYER, teamMember: true, ...over }) as Session;

beforeAll(async () => {
  handle = await testDb();
  state.db = handle.db;
  // The games below are Season 2026's (patch 16.20): that season is the current one, never the
  // calendar year's (a time bomb from 1 January 2027 otherwise: STANDARDS.md, "Dates in tests").
  await makeSeason2026Current(handle.db);
  const teamId = (await getOrCreateTeam(handle.db)).id;
  await handle.db.insert(champions).values({ id: "Gwen", key: 887, name: "Gwen", imageFull: "Gwen.png", firstSeenVersion: "16.20.1", lastSeenVersion: "16.20.1" }).onConflictDoNothing();
  ace = (await createPlayer(handle.db, teamId, { displayName: "Ace", primaryRole: "TOP", primaryPool: ["Gwen"] })).id;
  bea = (await createPlayer(handle.db, teamId, { displayName: "Bea", primaryRole: "MID", primaryPool: [] })).id;
  cat = (await createPlayer(handle.db, teamId, { displayName: "Cat", primaryRole: "ADC", primaryPool: [] })).id;
  // A member who has not chosen a role yet (first-time setup).
  await handle.db.update(players).set({ primaryRole: null }).where(eq(players.id, cat));
  const [a] = await handle.db.insert(riotAccounts).values({ ownerType: "player", playerId: ace, gameName: "ace", tagLine: "T", platform: "oc1", puuid: "p-ace-peek", label: "main" }).returning({ id: riotAccounts.id });
  const now = Date.now();
  for (let i = 0; i < 4; i++) {
    await handle.db.insert(accountMatches).values({ accountId: a!.id, matchId: `OC1_PEEK_${i}`, gameCreation: now - i * 60_000, queueId: 420, championId: "Gwen", role: "TOP", win: i % 2 === 0, teamId: 100, patch: "16.20", gameDuration: 1800, kills: 4, deaths: 2, assists: 6, cs: 200, damage: 20000, visionScore: 20 });
  }
}, 60_000);
afterAll(async () => {
  await handle.close();
});

describe("the player Peek: who may read it", () => {
  it("gives a viewer without the right nothing: signed out, not set up, without the Players directory, or a malformed id", async () => {
    state.session = null;
    expect(await getPlayerPeekAction(ace)).toMatchObject({ status: "not-found" });
    state.session = viewer({ playerId: bea, setupComplete: false });
    expect(await getPlayerPeekAction(ace)).toMatchObject({ status: "not-found" });
    state.session = viewer({ playerId: bea, capabilities: STANDARD_PLAYER.filter((c) => c !== "view-players") });
    expect(await getPlayerPeekAction(ace)).toEqual({ status: "not-found", message: "This player is not available." });
    state.session = viewer({ playerId: bea });
    for (const bad of ["'; DROP TABLE players;--", "../x", 42 as unknown as string]) expect(await getPlayerPeekAction(bad)).toMatchObject({ status: "not-found" });
  });

  it("carries the season and the ranked change only with view-teammate-stats (or on one's own)", async () => {
    state.session = viewer({ playerId: bea });
    const full = await getPlayerPeekAction(ace);
    expect(full.status).toBe("ok");
    if (full.status !== "ok") return;
    expect(full.data.slot.player!.statsVisible).toBe(true);
    expect(full.data.slot.player!.season).toMatchObject({ games: 4, wins: 2, losses: 2 });
    expect(full.data.slot.champions.map((c) => c.championId)).toEqual(["Gwen"]);
    expect(full.data.champions.map((c) => c.id)).toEqual(["Gwen"]);
    // Without the right: identity, role and pool, and nothing numerical.
    state.session = viewer({ playerId: bea, capabilities: STANDARD_PLAYER.filter((c) => c !== "view-teammate-stats") });
    const bare = await getPlayerPeekAction(ace);
    expect(bare.status).toBe("ok");
    if (bare.status !== "ok") return;
    const p = bare.data.slot.player!;
    expect({ statsVisible: p.statsVisible, season: p.season, rank: p.rank, rankChange: p.rankChange }).toEqual({ statsVisible: false, season: null, rank: null, rankChange: null });
    expect(bare.data.slot.champions).toEqual([expect.objectContaining({ championId: "Gwen", games: 0, wins: 0, winRate: null, masteryPoints: null })]);
    // One's own, without the right: the season is theirs to see.
    state.session = viewer({ playerId: ace, capabilities: STANDARD_PLAYER.filter((c) => c !== "view-teammate-stats") });
    const own = await getPlayerPeekAction(ace);
    expect(own.status === "ok" && own.data.slot.player!.season?.games).toBe(4);
  });

  it("answers a personal-use profile as one that does not exist, except to its player and administrators", async () => {
    await handle.db.update(players).set({ teamMember: false }).where(eq(players.id, ace));
    state.session = viewer({ playerId: bea });
    const refused = await getPlayerPeekAction(ace);
    expect(refused).toEqual({ status: "not-found", message: "This player is not available." });
    expect(JSON.stringify(refused)).not.toContain("Ace");
    state.session = viewer({ playerId: ace, teamMember: false });
    expect(await getPlayerPeekAction(ace)).toMatchObject({ status: "ok" });
    state.session = viewer({ playerId: bea, admin: true });
    expect(await getPlayerPeekAction(ace)).toMatchObject({ status: "ok" });
    await handle.db.update(players).set({ teamMember: true }).where(eq(players.id, ace));
  });

  it("has nothing to show for a player without a main role (their row opens the profile)", async () => {
    state.session = viewer({ playerId: bea });
    expect(await getPlayerPeekAction(cat)).toMatchObject({ status: "not-found" });
  });
});
