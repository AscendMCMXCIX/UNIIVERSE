import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { Session } from "@/server/auth/permissions";

/*
  All Champions' preview: its two actions read a profile's games, so they carry the profile pages'
  checks (PLAN §1.11). Your own profile, or a teammate's with "view teammates' statistics"; a
  personal-use profile only for its player and administrators. A viewer without the right gets
  nothing: no tally, no games. The tally is the stored lane opponent (the strict rule of the fold),
  read from the stored rows; the pairing is that one opponent's games.
*/

const state = vi.hoisted(() => ({ db: null as unknown, session: null as unknown }));
vi.mock("@/server/bootstrap", () => ({ getAppDb: async () => state.db }));
vi.mock("@/server/auth/session", async (orig) => ({ ...(await orig<object>()), getSession: async () => state.session }));

import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatches, players, riotAccounts } from "@/server/db/schema";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { getChampionPreviewAction, getPairingGamesAction } from "@/server/actions/champion-preview";
import { STANDARD_PLAYER } from "@/server/auth/permissions";

let handle: DbHandle;
let ace: string;
let bea: string;
const base = { userId: "11111111-1111-4111-8111-111111111111", label: "Me", username: "me", hasPassword: true, mustChangePassword: false, setupComplete: true };
const viewer = (over: Partial<Session> = {}): Session => ({ ...base, role: "player", playerId: null, capabilities: STANDARD_PLAYER, teamMember: true, ...over }) as Session;
const scope = { season: "all" as const, mode: "all" as const, account: "all", champion: "Gwen", role: "TOP" as const };

beforeAll(async () => {
  handle = await testDb();
  state.db = handle.db;
  const teamId = (await getOrCreateTeam(handle.db)).id;
  ace = (await createPlayer(handle.db, teamId, { displayName: "Ace", primaryRole: "TOP", primaryPool: [] })).id;
  bea = (await createPlayer(handle.db, teamId, { displayName: "Bea", primaryRole: "MID", primaryPool: [] })).id;
  const [a] = await handle.db.insert(riotAccounts).values({ ownerType: "player", playerId: ace, gameName: "ace", tagLine: "T", platform: "oc1", puuid: "p-ace", label: "main" }).returning({ id: riotAccounts.id });
  const now = Date.now();
  // Gwen in Top: 4 games against Nasus (3 won), 1 against Garen, 1 with no known lane opponent.
  const games: Array<[string | null, boolean]> = [["Nasus", true], ["Nasus", true], ["Nasus", false], ["Nasus", true], ["Garen", false], [null, true]];
  for (const [i, [enemy, win]] of games.entries()) {
    await handle.db.insert(accountMatches).values({ accountId: a!.id, matchId: `OC1_${100 + i}`, gameCreation: now - i * 60_000, queueId: 420, championId: "Gwen", role: "TOP", win, teamId: 100, patch: "16.20", gameDuration: 1800, kills: 4, deaths: 2, assists: 6, cs: 200, damage: 20000, visionScore: 20, enemyChampionId: enemy });
  }
}, 60_000);
afterAll(async () => {
  await handle.close();
});

describe("All Champions' preview: who may read it", () => {
  it("gives a viewer without the right nothing: signed out, no teammate-statistics right, or a personal-use profile", async () => {
    state.session = null;
    expect(await getChampionPreviewAction(ace, scope)).toMatchObject({ status: "not-found" });
    expect(await getPairingGamesAction(ace, scope, "Nasus")).toMatchObject({ status: "not-found" });
    state.session = viewer({ playerId: bea, capabilities: STANDARD_PLAYER.filter((c) => c !== "view-teammate-stats") });
    expect(await getChampionPreviewAction(ace, scope)).toEqual({ status: "not-found", message: "Teammates' champion statistics are not part of your access." });
    expect(await getPairingGamesAction(ace, scope, "Nasus")).toMatchObject({ status: "not-found" });
    // Ace's profile becomes personal-use: Bea, with the right, is answered as for no profile at all.
    await handle.db.update(players).set({ teamMember: false }).where(eq(players.id, ace));
    state.session = viewer({ playerId: bea });
    const refused = [await getChampionPreviewAction(ace, scope), await getPairingGamesAction(ace, scope, "Nasus")];
    for (const r of refused) expect(r).toEqual({ status: "not-found", message: "This champion's games are not available." });
    expect(JSON.stringify(refused)).not.toContain("Nasus");
    // Its own player still sees it.
    state.session = viewer({ playerId: ace, teamMember: false });
    expect(await getChampionPreviewAction(ace, scope)).toMatchObject({ status: "ok" });
    await handle.db.update(players).set({ teamMember: true }).where(eq(players.id, ace));
  });

  it("refuses a scope the list cannot have", async () => {
    state.session = viewer({ playerId: ace });
    for (const bad of [{ ...scope, champion: "'; DROP TABLE x;--" }, { ...scope, role: "JUNGLER" }, { ...scope, mode: "aram" }, { ...scope, season: 1.5 }, { ...scope, account: "p-ace" }]) {
      expect(await getChampionPreviewAction(ace, bad as typeof scope)).toMatchObject({ status: "not-found" });
    }
    expect(await getPairingGamesAction(ace, scope, "../x")).toMatchObject({ status: "not-found" });
  });
});

describe("All Champions' preview: what it reads", () => {
  it("tallies the stored lane opponents, and how many games name one", async () => {
    for (const session of [viewer({ playerId: ace }), viewer({ playerId: bea })]) {
      state.session = session;
      const r = await getChampionPreviewAction(ace, scope);
      expect(r.status).toBe("ok");
      if (r.status !== "ok") return;
      expect(r.data).toMatchObject({ champion: "Gwen", role: "TOP", games: 6, known: 5 });
      expect(r.data.opponents.map((o) => [o.championId, o.games, o.wins])).toEqual([
        ["Nasus", 4, 3],
        ["Garen", 1, 0],
      ]);
    }
  });

  it("lists one opponent's games, and never another opponent's", async () => {
    state.session = viewer({ playerId: ace });
    const r = await getPairingGamesAction(ace, scope, "Nasus");
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.data.games.map((g) => g.matchId).sort()).toEqual(["OC1_100", "OC1_101", "OC1_102", "OC1_103"]);
    // An opponent never met: no games (Matchups' fallback to the most played one does not apply).
    const none = await getPairingGamesAction(ace, scope, "Teemo");
    expect(none).toMatchObject({ status: "ok", data: { games: [], ten: null } });
  });
});
