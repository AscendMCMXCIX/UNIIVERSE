import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatches, riotAccounts } from "@/server/db/schema";
import { currentSeason } from "@/server/accounts/sync";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { invalidateLeaderboardCache, loadLeaderboardData } from "@/server/leaderboards/service";
import { buildLeaderboardsView } from "@/server/leaderboards/recent-view";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";

/*
  Who Team Leaderboards show (25 Nov 2026, the owner's rule), end to end on stored rows with a fixed
  clock: a player appears only with a counted game AND a successful data update (riot_accounts.
  sync_cursor, written on success only; a demo account's seeded time) within 30 days of the page's
  time. A failing account (last_sync_at moved, the cursor not), a sync with no new game, and games
  without a recent sync each leave a player off every board; a returning player is back with their
  next synced game; nothing is deleted. Also: a match stored on two of a player's linked accounts is
  one game on every board, the multikills included. Synthetic accounts and games only.
*/

let handle: DbHandle;
let teamId: string;
let season: number;
const id: Record<string, string> = {};
const acc: Record<string, string> = {};
const NOW = Date.UTC(2026, 10, 25, 12);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const seconds = (ms: number) => Math.floor(ms / 1000);

/** n games one every 20 hours back from `daysAgo`, each with Riot's multikill counters (a double in every second game). */
async function games(accountId: string, prefix: string, n: number, daysAgo = 0, from = 0) {
  await handle.db.insert(accountMatches).values(
    Array.from({ length: n }, (_, i) => ({ accountId, matchId: `${prefix}_${from + i}`, gameCreation: NOW - daysAgo * DAY - (i + 1) * 20 * HOUR, queueId: 420, championId: "Riven", role: "TOP", win: i % 3 !== 0, patch: `${season}.20`, gameDuration: 1800, kills: 6, deaths: 3, assists: 6, cs: 210, damage: 24_000, visionScore: 18, extraStats: { doubleKills: i % 2 === 0 ? 1 : 0, tripleKills: 0, quadraKills: 0, pentaKills: 0, largestMultiKill: i % 2 === 0 ? 2 : 1 } })),
  );
}

async function account(player: string, puuid: string, o: Partial<typeof riotAccounts.$inferInsert> = {}) {
  const [row] = await handle.db.insert(riotAccounts).values({ ownerType: "player", playerId: id[player]!, gameName: puuid, tagLine: "TEST", platform: "euw1", puuid, label: "main", syncStatus: "ok", lastSyncAt: new Date(NOW - HOUR), syncCursor: seconds(NOW - HOUR), ...o }).returning({ id: riotAccounts.id });
  return row!.id;
}

const page = async (now = NOW) => {
  invalidateLeaderboardCache();
  return buildLeaderboardsView(await loadLeaderboardData(handle.db, teamId), {}, null, { now: new Date(now) });
};

beforeAll(async () => {
  handle = await testDb();
  const db = handle.db;
  await syncStaticData(db, new FixtureStaticProvider(), { fingerprint: false });
  season = await currentSeason(db);
  teamId = (await getOrCreateTeam(db)).id;
  for (const name of ["Ace", "Bea", "Cal", "Dot", "Eve", "Fay"]) id[name] = (await createPlayer(db, teamId, { displayName: name, primaryRole: "TOP", primaryPool: ["Riven"] })).id;
  // Ace: active, 30 games on two linked accounts; ACE_0..ACE_4 stored on both (five matches seen twice).
  acc.ace = await account("Ace", "p-ace");
  acc.aceSmurf = await account("Ace", "p-ace-2", { label: "smurf" });
  await games(acc.ace, "ACE", 30);
  await games(acc.aceSmurf, "ACE", 5);
  // Bea: active, 24 games.
  acc.bea = await account("Bea", "p-bea");
  await games(acc.bea, "BEA", 24);
  // Cal: recent games, but the account has failed for 40 days (last_sync_at moves on every attempt; the cursor stays 40 days old).
  acc.cal = await account("Cal", "p-cal", { syncStatus: "failed", syncError: "Riot is not answering.", lastSyncAt: new Date(NOW - HOUR), syncCursor: seconds(NOW - 40 * DAY) });
  await games(acc.cal, "CAL", 24);
  // Dot: read an hour ago, but no game in 45 days: a sync with no new game.
  acc.dot = await account("Dot", "p-dot");
  await games(acc.dot, "DOT", 24, 45);
  // Eve: a demo account (seeded, never read): its seeded time stands for a successful read.
  acc.eve = await account("Eve", "demo-eve", { label: "demo", syncStatus: "demo", syncCursor: null, lastSyncAt: new Date(NOW - 2 * DAY) });
  await games(acc.eve, "EVE", 22);
  // Fay: no account, no game (setup not finished).
}, 60_000);
afterAll(async () => {
  await handle.close();
});

describe("who the boards show, on stored rows", () => {
  it("shows the active players only, on every board, and counts them; the members' list is untouched", async () => {
    const view = await page();
    expect(Object.keys(view.players).sort()).toEqual([id.Ace, id.Bea, id.Eve].sort());
    expect(view.playerCount).toBe(3);
    expect(view.memberCount).toBe(6);
    const shown = new Set([id.Ace, id.Bea, id.Eve]);
    expect(view.form.rows.every((r) => shown.has(r.playerId))).toBe(true);
    expect(view.records.multikills.rows.map((r) => r.playerId).sort()).toEqual([id.Ace, id.Bea, id.Eve].sort());
    expect(view.records.records.every((r) => !r.holder || shown.has(r.holder.playerId))).toBe(true);
    expect(view.records.milestones.items.every((m) => shown.has(m.playerId))).toBe(true);
    // Places among them alone: 1 to 3 on the multikills (shared places aside), none skipped.
    const places = view.records.multikills.rows.map((r) => r.place);
    expect(places[0]).toBe(1);
    for (let i = 1; i < places.length; i++) expect([places[i - 1], i + 1]).toContain(places[i]);
    // Nothing of the hidden players, and no sync time, reaches the page.
    const json = JSON.stringify(view);
    for (const hidden of [id.Cal, id.Dot, id.Fay]) expect(json).not.toContain(hidden!);
    expect(json).not.toMatch(/lastSyncedAt|syncCursor/);
  });

  it("reads each player's newest successful read from the cursor (never last_sync_at), and a demo account's seeded time", async () => {
    invalidateLeaderboardCache();
    const data = await loadLeaderboardData(handle.db, teamId);
    const synced = Object.fromEntries(data.players.map((p) => [p.name, p.lastSyncedAt]));
    expect(synced.Ace).toBe(seconds(NOW - HOUR) * 1000);
    expect(synced.Cal).toBe(seconds(NOW - 40 * DAY) * 1000);
    expect(synced.Eve).toBe(NOW - 2 * DAY);
    expect(synced.Fay).toBeNull();
  });

  it("counts a match stored on two of a player's linked accounts once, on Recent form and the multikills", async () => {
    const view = await page();
    const ace = view.records.multikills.rows.find((r) => r.playerId === id.Ace)!;
    expect(ace.games).toBe(30);
    expect(ace.counted).toBe(30);
    // A double in every second game, ACE_0..ACE_29 once each: 15, not 15 + 3 from the copies.
    expect(ace.counts.double).toBe(15);
    expect(view.form.rows.find((r) => r.playerId === id.Ace)!.games).toBe(20);
  });

  it("shows a player again once their failing account is read and they play: no data was deleted", async () => {
    // Cal's account is read again (the cursor moves on success): Cal's recent games count again.
    await handle.db.update(riotAccounts).set({ syncStatus: "ok", syncError: null, syncCursor: seconds(NOW - HOUR) }).where(eq(riotAccounts.id, acc.cal!));
    const view = await page();
    expect(Object.keys(view.players)).toContain(id.Cal);
    expect(view.records.multikills.rows.map((r) => r.playerId)).toContain(id.Cal);
  });

  it("brings a returning player back with their next synced game, ranked again among the others", async () => {
    expect(Object.keys((await page()).players)).not.toContain(id.Dot);
    // Dot plays again yesterday, and the sync that stores it moves the cursor.
    await games(acc.dot!, "DOT", 1, 0, 100);
    await handle.db.update(riotAccounts).set({ syncCursor: seconds(NOW - HOUR) }).where(eq(riotAccounts.id, acc.dot!));
    const view = await page();
    expect(Object.keys(view.players)).toContain(id.Dot);
    // Dot's 25 season games with counts give a place among the five shown; the places still run without a gap.
    const places = view.records.multikills.rows.map((r) => r.place);
    expect(view.records.multikills.rows.map((r) => r.playerId)).toContain(id.Dot);
    expect(places[0]).toBe(1);
    for (let i = 1; i < places.length; i++) expect([places[i - 1], i + 1]).toContain(places[i]);
    // A month on, with no new game from anyone, nobody is shown: the rule follows the page's time.
    expect((await page(NOW + 31 * DAY)).playerCount).toBe(0);
  });
});
