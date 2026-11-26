import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatches, accountMastery, riotAccounts } from "@/server/db/schema";
import { currentSeason } from "@/server/accounts/sync";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { invalidateLeaderboardCache, loadLeaderboardData } from "@/server/leaderboards/service";
import { buildLeaderboardsView, leaderboardsHref } from "@/server/leaderboards/recent-view";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";

/*
  The Leaderboards page (Recent form, the season's records and achievements) on stored games, read
  the way the page reads them: synthetic accounts and games only, no Riot request. Seven members cover
  every case of the rules: a lead, a gap of one win, a shared place, a provisional window and too
  few recent games (neither listed since 25 Nov 2026), and games older than the 60 days (a player
  with no game in 30 days is not shown at all: tests/db/leaderboards-active.test.ts has the rule).
*/

let handle: DbHandle;
let teamId: string;
let season: number;
const id: Record<string, string> = {};
const NOW = new Date(Date.UTC(2026, 10, 2, 12));
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/**
 * n games on an account, one every 30 hours back from `startDaysAgo`, newest first; `wins` says
 * which are won (by index, 0 = newest).
 */
async function games(accountId: string, prefix: string, n: number, wins: (i: number) => boolean, over: Partial<typeof accountMatches.$inferInsert> = {}, startDaysAgo = 0) {
  await handle.db.insert(accountMatches).values(
    Array.from({ length: n }, (_, i) => ({ accountId, matchId: `${prefix}_${i}`, gameCreation: NOW.getTime() - startDaysAgo * DAY - (i + 1) * 30 * HOUR, queueId: 420, championId: "Riven", role: "TOP", win: wins(i), patch: `${season}.20`, gameDuration: 1800, kills: 5, deaths: 3, assists: 6, cs: 210, damage: 24_000, visionScore: 18, ...over })),
  );
}

async function account(playerId: string, puuid: string, label = "main") {
  // Read successfully an hour before NOW (the cursor is written on success only): every player with a recent game is active.
  const [row] = await handle.db.insert(riotAccounts).values({ ownerType: "player", playerId, gameName: puuid, tagLine: "TEST", platform: "euw1", puuid, label, lastSyncAt: NOW, syncStatus: "ok", syncCursor: Math.floor(NOW.getTime() / 1000) - 3600 }).returning({ id: riotAccounts.id });
  return row!.id;
}

beforeAll(async () => {
  handle = await testDb();
  const db = handle.db;
  await syncStaticData(db, new FixtureStaticProvider(), { fingerprint: false });
  season = await currentSeason(db);
  teamId = (await getOrCreateTeam(db)).id;
  for (const [name, role] of [["Ash", "TOP"], ["Bo", "MID"], ["Cy", "JUNGLE"], ["Di", "SUPPORT"], ["Ed", "ADC"], ["Fi", "MID"], ["Gu", "TOP"]] as const) {
    id[name] = (await createPlayer(db, teamId, { displayName: name, primaryRole: role, primaryPool: ["Riven"] })).id;
  }
  // Ash: 13 of the latest 20 won (65%), on two accounts; ASH_0 was recorded on both (one match).
  const ashMain = await account(id.Ash!, "puuid-ash");
  const ashSmurf = await account(id.Ash!, "puuid-ash-2", "smurf");
  await games(ashMain, "ASH", 24, (i) => i < 13 || i >= 20);
  await db.insert(accountMatches).values({ accountId: ashSmurf, matchId: "ASH_0", gameCreation: NOW.getTime() - 30 * HOUR, queueId: 420, championId: "Riven", role: "TOP", win: true, patch: `${season}.20`, gameDuration: 1800, kills: 5, deaths: 3, assists: 6, cs: 210, damage: 24_000, visionScore: 18 });
  // Bo: 12 of 20 (60%), mostly Mid; the window's oldest game is a loss, so one win draws level with Ash.
  await games(await account(id.Bo!, "puuid-bo"), "BO", 20, (i) => i < 12, { role: "MID", championId: "Ahri" });
  // Cy and Di: 10 of 20 each (50%): a shared third place.
  await games(await account(id.Cy!, "puuid-cy"), "CY", 20, (i) => i % 2 === 0, { role: "JUNGLE" });
  await games(await account(id.Di!, "puuid-di"), "DI", 20, (i) => i % 2 === 1, { role: "SUPPORT", kills: 1, assists: 21 });
  // Ed: 14 recent games at 79%: provisional, listed after every full window.
  await games(await account(id.Ed!, "puuid-ed"), "ED", 14, (i) => i < 11, { role: "ADC", kills: 22, deaths: 1 });
  // Fi: 6 recent games: not enough.
  await games(await account(id.Fi!, "puuid-fi"), "FI", 6, () => true, { role: "MID" });
  // Gu: 30 games, all older than 60 days: not enough recent games, with the date of the last one.
  await games(await account(id.Gu!, "puuid-gu"), "GU", 30, () => true, {}, 70);
  await db.insert(accountMastery).values([{ accountId: ashMain, championId: "Riven", points: 520_000, level: 10 }]);
  invalidateLeaderboardCache();
}, 60_000);
afterAll(async () => {
  await handle.close();
});

describe("Recent form on stored games", () => {
  it("ranks the full windows by win rate, with shared places, and lists nobody else (no provisional or \"not enough\" groups)", async () => {
    const data = await loadLeaderboardData(handle.db, teamId);
    const view = buildLeaderboardsView(data, {}, id.Bo!, { now: NOW });
    const rows = view.form.rows.map((r) => [r.playerId, r.place, r.tied, r.winRate, `${r.wins}-${r.losses}`, r.status]);
    expect(rows).toEqual([
      [id.Ash, 1, false, 65, "13-7", "established"],
      [id.Bo, 2, false, 60, "12-8", "established"],
      [id.Cy, 3, true, 50, "10-10", "established"],
      [id.Di, 3, true, 50, "10-10", "established"],
    ]);
    // A match seen from two of Ash's accounts counts once: still 20 games, not 21.
    expect(view.form.rows[0]!.games).toBe(20);
    // Ed (14 recent games) and Fi (6) are active but have no full window: on the page, not on this board. Gu, with no game in
    // 30 days, is not on the page at all.
    expect(Object.keys(view.players).sort()).toEqual([id.Ash, id.Bo, id.Cy, id.Di, id.Ed, id.Fi].sort());
    expect(view.playerCount).toBe(6);
    expect(view.memberCount).toBe(7);
  });

  it("says each gap in wins, and draw level only when one win does it", async () => {
    const data = await loadLeaderboardData(handle.db, teamId);
    const view = buildLeaderboardsView(data, {}, null, { now: NOW });
    const note = (name: string) => view.form.rows.find((r) => r.playerId === id[name])!.note;
    expect(note("Ash")).toBeNull();
    // Seen by nobody in particular (viewer null): the player's name, never "your" (PLAN §1.12).
    expect(note("Bo")).toBe("Bo draws level with Ash by winning their next game");
    // Seen by Bo: "your".
    expect(buildLeaderboardsView(data, {}, id.Bo!, { now: NOW }).form.rows.find((r) => r.playerId === id.Bo)!.note).toBe("Win your next game to draw level with Ash");
    expect(note("Cy")).toBe("2 wins behind Bo");
    // The same notes in parts, for the board's short gap ("Next win: 1=", "2 wins behind", "14 of 20 games").
    const gap = (name: string) => view.form.rows.find((r) => r.playerId === id[name])!.gap;
    expect(gap("Ash")).toBeNull();
    expect(gap("Bo")).toEqual({ kind: "level", place: 1 });
    expect(gap("Cy")).toEqual({ kind: "behind", wins: 2, place: 2 });
    expect(gap("Di")).toEqual({ kind: "behind", wins: 2, place: 2 });
  });

  it("names each member's main role from their window, the record's dates, and marks the viewer", async () => {
    const data = await loadLeaderboardData(handle.db, teamId);
    const view = buildLeaderboardsView(data, {}, id.Bo!, { now: NOW });
    const bo = view.form.rows.find((r) => r.playerId === id.Bo)!;
    expect(bo.role).toEqual({ role: "MID", games: 20 });
    expect(bo.you).toBe(true);
    expect(bo.dates).toMatch(/^\d{1,2} [A-Z][a-z]{2} – \d{1,2} [A-Z][a-z]{2}$/);
    expect(view.form.rows.filter((r) => r.you)).toHaveLength(1);
    expect(view.players[id.Bo!]!.profileHref).toBe(`/players/${id.Bo}`);
  });
});

describe("The season's records and achievements on stored games", () => {
  it("holds each season record with its game, opens the game, and gives the viewer their own best", async () => {
    const data = await loadLeaderboardData(handle.db, teamId);
    const view = buildLeaderboardsView(data, {}, id.Bo!, { now: NOW });
    const r = view.records;
    expect(r.season).toBe(season);
    const kills = r.records.find((x) => x.id === "kills")!;
    expect(kills.holder).toMatchObject({ playerId: id.Ed, value: "22", unit: "kills", championId: "Riven", role: "ADC", kda: "22/1/6" });
    // Over the board (PLAN S6c), with the way to the holder's Match History inside.
    expect(kills.holder!.href).toMatch(/^\/leaderboards(\?season=\d+&|\?)match=ED_13$/);
    expect(kills.holder!.game).toEqual({ matchId: "ED_13", historyHref: `/players/${id.Ed}/matches?match=ED_13` });
    expect(kills.yours).toMatchObject({ playerId: id.Bo, value: "5" });
    const assists = r.records.find((x) => x.id === "assists")!;
    expect(assists.holder).toMatchObject({ playerId: id.Di, value: "21" });
    // Gu's 30 wins in a row (70+ days ago, still this season) would be the longest streak, but Gu has not played in 30 days:
    // the record is the active players' own, Ash's 13 (it comes back to Gu with Gu's next synced game). A streak opens no single game.
    const streak = r.records.find((x) => x.id === "win-streak")!;
    expect(streak.holder).toMatchObject({ playerId: id.Ash, value: "13", href: null, game: null });
    // The milestones too: Ash's 520K mastery; Gu's 30 games on Riven are not shown while Gu is away, and Ash's 24 (one match on
    // two accounts counted once) do not reach 25.
    expect(r.milestones).toEqual({ items: [{ playerId: id.Ash, kind: "mastery", championId: "Riven", short: "520K", unit: "mastery", value: "520K mastery points", milestone: "500K+", tier: 2 }], more: 0 });
  });

  it("links nowhere on the public boards, whose links keep to the public address", async () => {
    const data = await loadLeaderboardData(handle.db, teamId);
    const open = buildLeaderboardsView(data, {}, null, { now: NOW, profiles: false, basePath: "/public/leaderboards" });
    expect(open.records.records.every((x) => x.holder === null || (x.holder.href === null && x.holder.game === null))).toBe(true);
    expect(Object.values(open.players).every((p) => p.profileHref === null)).toBe(true);
    // The season's choice keeps to the public address; the current season's address names none.
    expect(open.records.seasons.map((s) => s.href)).toEqual(open.records.seasons.map((s) => (s.value === data.currentSeason ? "/public/leaderboards" : `/public/leaderboards?season=${s.value}`)));
    const members = buildLeaderboardsView(data, {}, null, { now: NOW });
    expect(members.records.seasons.find((s) => s.value === data.currentSeason)!.href).toBe("/leaderboards");
    expect(leaderboardsHref(15)).toBe("/leaderboards?season=15");
  });
});
