import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatches, accountMastery, matchDetails, riotAccounts, type MatchParticipantDetail } from "@/server/db/schema";
import { currentSeason } from "@/server/accounts/sync";
import { archivePlayer, createPlayer, getOrCreateTeam, setLineupSlot, setTeamMember } from "@/server/repositories/team";
import { createUser } from "@/server/repositories/users";
import { invalidateLeaderboardCache, loadLeaderboardData } from "@/server/leaderboards/service";
import { buildLeaderboardView, parseFilters } from "@/server/leaderboards/view";
import { LEADERBOARD_CATEGORIES, LEADERBOARD_QUEUES, LEADERBOARD_ROLES, METRICS } from "@/domain/leaderboards";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";

/*
  Team Leaderboards read only what is already stored. These tests use synthetic accounts and games
  (no Riot request is made): who is eligible, one game per match when a player has two linked
  accounts, the per-player figures read from stored match details, and the cache noticing new
  games and membership changes.
*/

let handle: DbHandle;
let teamId: string;
let season: number;
let ace: string; // two linked accounts that share a match
let bea: string;
let personal: string;
let archived: string;
let pending: string;
let aceMain: string;
let aceSmurf: string;
let beaAcc: string;

const T0 = Date.UTC(2026, 5, 1);

function participant(puuid: string, teamId: number, over: Partial<MatchParticipantDetail> = {}): MatchParticipantDetail {
  return { puuid, name: null, teamId, championId: null, championKey: 0, champLevel: 15, position: null, win: teamId === 100, kills: 2, deaths: 3, assists: 4, cs: 150, gold: 10000, damage: 15000, damageTaken: 18000, vision: 20, wardsPlaced: 8, items: null, spells: null, runes: null, ...over };
}

async function account(playerId: string, puuid: string, label: string) {
  const [row] = await handle.db.insert(riotAccounts).values({ ownerType: "player", playerId, gameName: puuid, tagLine: "TEST", platform: "euw1", puuid, label, lastSyncAt: new Date(T0) }).returning({ id: riotAccounts.id });
  return row!.id;
}

async function games(accountId: string, prefix: string, n: number, over: Partial<typeof accountMatches.$inferInsert> = {}) {
  await handle.db.insert(accountMatches).values(
    Array.from({ length: n }, (_, i) => ({ accountId, matchId: `${prefix}_${i}`, gameCreation: T0 + i * 3_600_000, queueId: 420, championId: "Riven", role: "TOP", win: i % 2 === 0, patch: `${season}.10`, gameDuration: 1800, kills: 5, deaths: 2, assists: 6, cs: 210, damage: 24000, visionScore: 18, ...over })),
  );
}

beforeAll(async () => {
  handle = await testDb();
  const db = handle.db;
  await syncStaticData(db, new FixtureStaticProvider(), { fingerprint: false });
  season = await currentSeason(db);
  teamId = (await getOrCreateTeam(db)).id;
  ace = (await createPlayer(db, teamId, { displayName: "Ace", primaryRole: "TOP", primaryPool: ["Riven"] })).id;
  bea = (await createPlayer(db, teamId, { displayName: "Bea", primaryRole: "JUNGLE", primaryPool: ["Viego"] })).id;
  personal = (await createPlayer(db, teamId, { displayName: "Solo user", primaryRole: "MID", primaryPool: ["Ahri"] })).id;
  archived = (await createPlayer(db, teamId, { displayName: "Former", primaryRole: "ADC", primaryPool: ["Jinx"] })).id;
  pending = (await createPlayer(db, teamId, { displayName: "Unfinished", primaryRole: "SUPPORT", primaryPool: ["Lulu"] })).id;
  await setTeamMember(db, teamId, personal, false);
  await archivePlayer(db, archived, true);
  await createUser(db, { username: "Unfinished", password: null, role: "player", playerId: pending, setupCompletedAt: null });
  await setLineupSlot(db, teamId, "TOP", ace);

  aceMain = await account(ace, "puuid-ace-main", "main");
  aceSmurf = await account(ace, "puuid-ace-smurf", "smurf");
  beaAcc = await account(bea, "puuid-bea", "main");
  // Everyone ineligible has games too, so leaving them out is the eligibility rule, not empty data.
  for (const [id, p] of [[personal, "personal"], [archived, "archived"]] as const) await games(await account(id, `puuid-${p}`, "main"), p.toUpperCase(), 12);
  // The member still in setup has no linked account and no games: listed, never given figures.

  // Ace: 11 games on the main account, 2 on the smurf; ACE_0 was recorded on both (same match).
  await games(aceMain, "ACE", 11);
  await games(aceSmurf, "SMURF", 1);
  await db.insert(accountMatches).values({ accountId: aceSmurf, matchId: "ACE_0", gameCreation: T0, queueId: 420, championId: "Riven", role: "TOP", win: true, patch: `${season}.10`, gameDuration: 1800, kills: 5, deaths: 2, assists: 6, cs: 210, damage: 24000, visionScore: 18 });
  // Bea: 12 jungle games, one with K/D/A unavailable (stored as -1).
  await games(beaAcc, "BEA", 12, { role: "JUNGLE", championId: "Viego", kills: 7, deaths: 3, assists: 8 });
  await db.update(accountMatches).set({ kills: -1, deaths: -1, assists: -1 }).where(eq(accountMatches.matchId, "BEA_11"));

  // Stored match details for ACE_0 (with the extra figures) and ACE_1 (an ally's damage missing).
  await db.insert(matchDetails).values([
    {
      matchId: "ACE_0",
      platform: "euw1",
      queueId: 420,
      gameCreation: T0,
      gameDuration: 1800,
      gameVersion: `${season}.10.1`,
      teams: [],
      participants: [participant("puuid-ace-main", 100, { kills: 5, gold: 12345, wardsPlaced: 11, damage: 24000, stats: { pentaKills: 1, wardsKilled: 4, soloKills: 2 } }), participant("a1", 100, { kills: 3 }), participant("a2", 100, { kills: 4 }), participant("a3", 100, { kills: 1 }), participant("a4", 100, { kills: 2 }), participant("e1", 200, { kills: 30 })],
    },
    {
      matchId: "ACE_1",
      platform: "euw1",
      queueId: 420,
      gameCreation: T0 + 3_600_000,
      gameDuration: 1800,
      gameVersion: `${season}.10.1`,
      teams: [],
      participants: [participant("puuid-ace-main", 100, { kills: 5 }), participant("b1", 100, { damage: null as unknown as number })],
    },
  ]);
  await db.insert(accountMastery).values([
    { accountId: aceMain, championId: "Riven", points: 300_000, level: 10 },
    { accountId: aceSmurf, championId: "Riven", points: 40_000, level: 7 },
  ]);
  invalidateLeaderboardCache();
}, 60_000);
afterAll(async () => {
  await handle.close();
});

describe("team leaderboards data", () => {
  it("lists every team member, setup finished or not; no personal-use or archived profiles; figures only from real games", async () => {
    const data = await loadLeaderboardData(handle.db, teamId);
    expect(data.players.map((p) => p.name).sort()).toEqual(["Ace", "Bea", "Unfinished"]);
    const ids = new Set(data.games.map((g) => g.playerId));
    for (const out of [personal, archived, pending]) expect(ids.has(out)).toBe(false);
    // Listed, but with no games nothing is ranked or shown as zero for them.
    const view = buildLeaderboardView(data, parseFilters({}, data), pending);
    expect(view.board.ranked.some((r) => r.playerId === pending)).toBe(false);
    expect(data.lineupIds).toEqual([ace]);
    expect(data.currentSeason).toBe(season);
  });

  it("counts a match seen from two of a player's accounts once", async () => {
    const data = await loadLeaderboardData(handle.db, teamId);
    const aceGames = data.games.filter((g) => g.playerId === ace);
    expect(aceGames).toHaveLength(12); // ACE_0..10 plus SMURF_0; ACE_0 once
    expect(aceGames.filter((g) => g.matchId === "ACE_0")).toHaveLength(1);
    expect(data.rawGames).toBe(25); // 13 stored rows for Ace + 12 for Bea, before de-duplication
    // Mastery adds up across the player's accounts.
    expect(data.mastery.filter((m) => m.playerId === ace).reduce((s, m) => s + m.points, 0)).toBe(340_000);
  });

  it("reads this player's figures from the stored match details, and leaves out what is missing", async () => {
    const data = await loadLeaderboardData(handle.db, teamId);
    const g0 = data.games.find((g) => g.matchId === "ACE_0")!;
    expect(g0).toMatchObject({ gold: 12345, wardsPlaced: 11, teamKills: 15, teamDamage: 24000 + 4 * 15000, extra: { pentaKills: 1, wardsKilled: 4, soloKills: 2 } });
    // An ally's damage is missing: no team damage (so no damage share), never a partial sum.
    expect(data.games.find((g) => g.matchId === "ACE_1")).toMatchObject({ teamKills: 7, teamDamage: null, extra: null });
    // No stored details at all: these stay empty rather than zero.
    expect(data.games.find((g) => g.matchId === "ACE_2")).toMatchObject({ gold: null, teamKills: null, extra: null });
    // K/D/A unavailable (-1) reads as missing.
    expect(data.games.find((g) => g.matchId === "BEA_11")).toMatchObject({ kills: null, deaths: null, assists: null });
    expect(data.extraSince).toBe(T0);
  });

  it("builds the board: ranks, the viewer's place, the lineup filter and a role filter", async () => {
    const data = await loadLeaderboardData(handle.db, teamId);
    const view = buildLeaderboardView(data, parseFilters({ category: "combat", metric: "kills-per-game" }, data), ace);
    // Bea 7 kills a game (11 games with K/D/A), Ace 5.
    expect(view.board.ranked.map((e) => [e.playerId, e.rank, e.valueText])).toEqual([
      [bea, 1, "7.0"],
      [ace, 2, "5.0"],
    ]);
    expect(view.board.ranked.find((e) => e.playerId === bea)!.sampleText).toMatch(/11 games/);
    expect(view.you).toMatchObject({ playerId: ace, rank: 2, of: 2 });
    expect(view.you!.chase).toBe("2.0 kills/game behind the leader's current average");
    const lineup = buildLeaderboardView(data, parseFilters({ category: "combat", metric: "kills-per-game", lineup: "1" }, data), ace);
    expect(lineup.board.ranked.map((e) => e.playerId)).toEqual([ace]);
    expect(lineup.playerCount).toBe(1);
    // Role filter: only Jungle games count, so Ace has none.
    const jungle = buildLeaderboardView(data, parseFilters({ category: "combat", metric: "kills-per-game", role: "JUNGLE" }, data), ace);
    expect(jungle.board.ranked.map((e) => e.playerId)).toEqual([bea]);
    expect(jungle.you).toMatchObject({ rank: null });
    // A viewer who is not on the board (the Owner's admin identity) gets no personal panel.
    expect(buildLeaderboardView(data, parseFilters({}, data), null).you).toBeNull();
  });

  it("notices new games and membership changes without waiting for the cache to expire", async () => {
    const before = await loadLeaderboardData(handle.db, teamId);
    expect((await loadLeaderboardData(handle.db, teamId)).games).toBe(before.games); // reused while nothing changed
    await games(beaAcc, "BEA_NEW", 1, { role: "JUNGLE", championId: "Viego", gameCreation: T0 + 99 * 3_600_000 });
    const after = await loadLeaderboardData(handle.db, teamId);
    expect(after.games.filter((g) => g.playerId === bea)).toHaveLength(13);
    await setTeamMember(handle.db, teamId, bea, false);
    const left = await loadLeaderboardData(handle.db, teamId);
    expect(left.players.map((p) => p.id).sort()).toEqual([ace, pending].sort());
    expect(left.games.some((g) => g.playerId === bea)).toBe(false);
    await setTeamMember(handle.db, teamId, bea, true);
    expect((await loadLeaderboardData(handle.db, teamId)).players).toHaveLength(3);
  });

  it("the production probe times the leaderboard and reports counts only", async () => {
    const { runPerfProbe } = await import("@/server/observability/perf-probe");
    const { steps } = await runPerfProbe(handle.db);
    const data = steps.find((s) => s.name === "leaderboards.data")!;
    expect(data.error).toBeUndefined();
    expect(data.note).toMatch(/^3 players · 25 games \(26 stored rows\) · 2 with match details · 1 with extra figures$/);
    expect(data.note).not.toMatch(/Ace|Bea/);
    expect(steps.find((s) => s.name === "leaderboards.view")?.error).toBeUndefined();
  }, 60_000);

  it("keeps all 48 statistics, and every one builds a board in every scope", async () => {
    expect(METRICS).toHaveLength(48);
    expect(new Set(METRICS.map((m) => m.id)).size).toBe(48);
    const data = await loadLeaderboardData(handle.db, teamId);
    for (const queue of Object.keys(LEADERBOARD_QUEUES)) {
      for (const role of [null, ...LEADERBOARD_ROLES]) {
        for (const c of LEADERBOARD_CATEGORIES) {
          const listed = buildLeaderboardView(data, parseFilters({ category: c.key, queue, ...(role ? { role } : {}) }, data), ace).metrics.map((m) => m.id).sort();
          // A role only reorders a category's statistics; none disappear.
          expect(listed).toEqual(METRICS.filter((m) => m.category === c.key).map((m) => m.id).sort());
        }
      }
    }
    for (const m of METRICS) {
      const v = buildLeaderboardView(data, parseFilters({ category: m.category, metric: m.id, lineup: "1" }, data), ace);
      expect(v.board.id).toBe(m.id);
      for (const e of v.board.ranked) expect(e.bar).toBeGreaterThanOrEqual(0);
    }
  });

  it("defaults to all supported games, with gap bars and stepping between statistics", async () => {
    const data = await loadLeaderboardData(handle.db, teamId);
    const view = buildLeaderboardView(data, parseFilters({ category: "combat", metric: "kills-per-game" }, data), ace);
    expect(view.filters.queue).toBe("all");
    expect(view.scopeLabel).toMatch(/All supported games/);
    // Bea: 11 games of 7 kills and the 5-kill game added above (6.83 a game); Ace: 5 a game.
    const beaAvg = (11 * 7 + 5) / 12;
    expect(view.board.ranked[0]!.bar).toBe(1);
    expect(view.board.ranked[1]!.bar).toBeCloseTo(5 / beaAvg, 6);
    expect(view.you).toMatchObject({ rank: 2, valueText: "5.0", leader: { playerId: bea, valueText: "6.8" } });
    const n = view.neighbours;
    expect(n.position).toBeGreaterThan(1);
    expect(n.previous?.id).toBeTruthy();
    expect(n.count).toBe(view.metrics.length);
    // A normal game counts under "all" and "normal" but not "ranked".
    await handle.db.insert(accountMatches).values({ accountId: beaAcc, matchId: "BEA_NORMAL", gameCreation: T0 + 500 * 3_600_000, queueId: 400, championId: "Viego", role: "JUNGLE", win: true, patch: `${season}.10`, gameDuration: 1800, kills: 7, deaths: 3, assists: 8, cs: 210, damage: 24000, visionScore: 18 });
    const more = await loadLeaderboardData(handle.db, teamId);
    const games = (queue: string) => buildLeaderboardView(more, parseFilters({ category: "overview", metric: "games", queue }, more), null).board.ranked.find((e) => e.playerId === bea)!.valueText;
    expect(Number(games("normal"))).toBe(1);
    expect(Number(games("all"))).toBe(Number(games("ranked")) + 1);
  });
});
