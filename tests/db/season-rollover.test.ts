import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatches, patches, riotAccounts } from "@/server/db/schema";
import { currentSeason } from "@/server/accounts/sync";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { invalidateLeaderboardCache, loadLeaderboardData } from "@/server/leaderboards/service";
import { buildLeaderboardsView } from "@/server/leaderboards/recent-view";
import { getMatchHistory } from "@/server/players/match-history";
import { invalidatePlayedTogetherCache, loadPlayedTogether } from "@/server/matches/played-together";
import { offeredSeasons } from "@/domain/season";
import { patchSortKey } from "@/domain/patch";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";

/*
  The first days of Season 2027 (27 Nov 2026, the 2027 ranked year): version-check stores Data
  Dragon's 17.1 and every season view moves to Season 2027 by itself, with no game in it yet. Each
  view must then offer Season 2027 and Season 2026, default to 2027, answer empty (never throw),
  and keep Season 2026's games unchanged when it is chosen. Synthetic accounts and games only, on a
  fixed clock (8 Jan 2027).
*/

let handle: DbHandle;
let teamId: string;
const player: Record<string, string> = {};
const NOW = Date.UTC(2027, 0, 8, 12);
const HOUR = 3_600_000;

beforeAll(async () => {
  handle = await testDb();
  const db = handle.db;
  await syncStaticData(db, new FixtureStaticProvider(), { fingerprint: false });
  // Season 2027's first patch is the current one; the games are all Season 2026's (16.24).
  await db.update(patches).set({ isCurrent: false });
  await db.insert(patches).values({ id: "16.24", ddragonVersion: "16.24.1", isCurrent: false, sortKey: patchSortKey("16.24") }).onConflictDoNothing();
  await db.insert(patches).values({ id: "17.1", ddragonVersion: "17.1.1", isCurrent: true, sortKey: patchSortKey("17.1") }).onConflictDoUpdate({ target: patches.id, set: { isCurrent: true } });
  teamId = (await getOrCreateTeam(db)).id;
  for (const name of ["Ace", "Bea"]) player[name] = (await createPlayer(db, teamId, { displayName: name, primaryRole: "TOP", primaryPool: ["Riven"] })).id;
  const accounts: Record<string, string> = {};
  for (const name of ["Ace", "Bea"]) {
    const [row] = await db
      .insert(riotAccounts)
      .values({ ownerType: "player", playerId: player[name]!, gameName: `${name}Id`, tagLine: "TEST", platform: "euw1", puuid: `p-${name}`, label: "main", syncStatus: "ok", lastSyncAt: new Date(NOW - HOUR), syncCursor: Math.floor((NOW - HOUR) / 1000) })
      .returning({ id: riotAccounts.id });
    accounts[name] = row!.id;
  }
  // 24 games each, the last a week before the reset; four of them together (the same match on both accounts).
  const rows: Array<typeof accountMatches.$inferInsert> = [];
  for (const name of ["Ace", "Bea"]) {
    for (let i = 0; i < 24; i++) {
      const together = i < 4;
      rows.push({ accountId: accounts[name]!, matchId: together ? `EUW1_T${i}` : `EUW1_${name}${i}`, gameCreation: NOW - 7 * 24 * HOUR - i * 20 * HOUR, queueId: 420, championId: "Riven", role: "TOP", teamId: 100, win: i % 3 !== 0, patch: "16.24", gameDuration: 1800, kills: 6, deaths: 3, assists: 6, cs: 210, damage: 24_000, visionScore: 18, extraStats: { doubleKills: i % 2, tripleKills: 0, quadraKills: 0, pentaKills: 0, largestMultiKill: i % 2 ? 2 : 1 } });
    }
  }
  await db.insert(accountMatches).values(rows);
}, 60_000);
afterAll(async () => {
  await handle.close();
});

describe("the first days of Season 2027", () => {
  it("follows the current patch to Season 2027, and offers Season 2026 beside it", async () => {
    expect(await currentSeason(handle.db)).toBe(17);
    expect(offeredSeasons(17, [16])).toEqual([17, 16]);
  });

  it("Leaderboards: Season 2027's records are empty, never an error, Season 2026's unchanged; Recent form (season-free) keeps going", async () => {
    invalidateLeaderboardCache();
    const data = await loadLeaderboardData(handle.db, teamId);
    const now = { now: new Date(NOW) };
    const fresh = buildLeaderboardsView(data, {}, null, now);
    expect(fresh.records.season).toBe(17);
    expect(fresh.records.seasons.map((s) => s.value)).toEqual([17, 16]);
    expect(fresh.records.games).toBe(0);
    expect(fresh.records.multikills.rows ?? []).toHaveLength(0);
    // Recent form covers the last 60 days, whatever the season: both players are shown.
    expect(fresh.playerCount).toBe(2);
    const previous = buildLeaderboardsView(data, { season: 16 }, null, now);
    expect(previous.records.season).toBe(16);
    expect(previous.records.games).toBeGreaterThan(0);
  });

  it("Match History: Season 2027 by default with no game, Season 2026 on request with all its games", async () => {
    const fresh = await getMatchHistory(handle.db, player.Ace!, { per: 25 });
    expect(fresh.currentSeason).toBe(17);
    expect(fresh.filter.season).toBe(17);
    expect(fresh.seasons).toEqual([17, 16]);
    expect(fresh.total).toBe(0);
    expect(fresh.rows).toEqual([]);
    const previous = await getMatchHistory(handle.db, player.Ace!, { per: 25, season: 16 });
    expect(previous.total).toBe(24);
  });

  it("Team Matches: the games played together keep their Season 2026 (the page then offers both seasons)", async () => {
    invalidatePlayedTogetherCache();
    const together = await loadPlayedTogether(handle.db, teamId);
    const seasons = together.games.map((g) => g.season);
    expect(seasons.length).toBeGreaterThan(0);
    expect(new Set(seasons)).toEqual(new Set([16]));
    expect(offeredSeasons(await currentSeason(handle.db), seasons)).toEqual([17, 16]);
  });
});
