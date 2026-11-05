import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";

/*
  getMatchHistory's reads that do not depend on who is named in the page's games (the game's team
  kills, the ladder change, the games' LP) start beside the audience (players/game-audience), not
  after it: the page waits for the slowest of them, not for the audience and then them. The
  modules are the real ones, only watched for when each is asked and answers.
*/

const order = vi.hoisted(() => ({ events: [] as string[] }));
vi.mock("@/server/accounts/match-lp", async (orig) => {
  const real = await orig<typeof import("@/server/accounts/match-lp")>();
  return {
    ...real,
    lpForGames: (...args: Parameters<typeof real.lpForGames>) => {
      order.events.push("lp asked");
      return real.lpForGames(...args);
    },
  };
});
vi.mock("@/server/accounts/rank-history", async (orig) => {
  const real = await orig<typeof import("@/server/accounts/rank-history")>();
  return {
    ...real,
    ladderChange: (...args: Parameters<typeof real.ladderChange>) => {
      order.events.push("ladder asked");
      return real.ladderChange(...args);
    },
  };
});
vi.mock("@/server/players/game-audience", async (orig) => {
  const real = await orig<typeof import("@/server/players/game-audience")>();
  return {
    ...real,
    gameAudience: async (...args: Parameters<typeof real.gameAudience>) => {
      const seen = await real.gameAudience(...args);
      order.events.push("audience known");
      return seen;
    },
  };
});

import { accountMatches, matchDetails, patches, riotAccounts, type MatchParticipantDetail } from "@/server/db/schema";
import { patchSortKey } from "@/domain/patch";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { getMatchHistory } from "@/server/players/match-history";

const MATCH = "OC1_910000001";
let handle: DbHandle;
let playerId = "";

const part = (puuid: string, name: string, teamId: number): MatchParticipantDetail => ({ puuid, name, teamId, championId: "Ahri", championKey: 103, champLevel: 16, position: "MIDDLE", win: teamId === 100, kills: 4, deaths: 3, assists: 7, cs: 180, gold: 11_000, damage: 18_000, damageTaken: 15_000, vision: 20, wardsPlaced: 8, items: null, spells: null, runes: null });

beforeAll(async () => {
  handle = await testDb();
  const db = handle.db;
  await syncStaticData(db, new FixtureStaticProvider(), { fingerprint: false });
  await db.update(patches).set({ isCurrent: false });
  await db.insert(patches).values({ id: "16.20", ddragonVersion: "16.20.1", isCurrent: true, sortKey: patchSortKey("16.20") }).onConflictDoUpdate({ target: patches.id, set: { isCurrent: true } });
  const team = await getOrCreateTeam(db);
  playerId = (await createPlayer(db, team.id, { displayName: "Reads", primaryRole: "MID", primaryPool: ["Ahri"] })).id;
  const [account] = await db.insert(riotAccounts).values({ ownerType: "player", playerId, gameName: "reads", tagLine: "OCE", platform: "oc1", puuid: "puuid-reads", label: "main", syncStatus: "ok" }).returning({ id: riotAccounts.id });
  const created = Date.now() - 86_400_000;
  await db.insert(accountMatches).values({ accountId: account!.id, matchId: MATCH, gameCreation: created, queueId: 420, championId: "Ahri", role: "MID", win: true, teamId: 100, patch: "16.20", gameDuration: 1800, kills: 4, deaths: 3, assists: 7 });
  await db.insert(matchDetails).values({ matchId: MATCH, platform: "oc1", queueId: 420, gameCreation: created, gameDuration: 1800, gameVersion: "16.20.1", teams: [], participants: [part("puuid-reads", "reads#OCE", 100), ...Array.from({ length: 9 }, (_, i) => part(`puuid-other-${i}`, `Other ${i}#OCE`, i < 4 ? 100 : 200))] });
}, 120_000);

afterAll(async () => {
  await handle.close();
});

describe("getMatchHistory's reads", () => {
  it("asks for the games' LP and the ladder change before the audience is known, not after it", async () => {
    order.events = [];
    const page = await getMatchHistory(handle.db, playerId, { mode: "all" });
    expect(page.rows.map((r) => r.matchId)).toEqual([MATCH]);
    const at = (event: string) => order.events.indexOf(event);
    expect(at("audience known")).toBeGreaterThanOrEqual(0);
    expect(at("lp asked")).toBeGreaterThanOrEqual(0);
    expect(at("ladder asked")).toBeGreaterThanOrEqual(0);
    expect(at("lp asked")).toBeLessThan(at("audience known"));
    expect(at("ladder asked")).toBeLessThan(at("audience known"));
  });
});
