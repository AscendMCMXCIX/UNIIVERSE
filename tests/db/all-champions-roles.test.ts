import { invalidateMultikillCountingCache } from "@/server/accounts/multikill-counting";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatches, patches, riotAccounts } from "@/server/db/schema";
import { patchSortKey } from "@/domain/patch";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getOrCreateTeam, getPlayer } from "@/server/repositories/team";
import { addAccount } from "@/server/accounts/repository";
import { getPlayerOverview, type ChampionRow } from "@/server/players/overview";

/*
  All Champions' rows by position (the owner's request of 25 Nov 2026): one row per champion, its
  figures over every game in the filters, with each position Riot recorded for those games, most
  played first, and each position's own figures. Champions played in one, two, three and all five
  positions, single games among them, games without a recorded position (in the champion's totals,
  in no position, never the configured role), a game seen from two linked accounts (once), and the
  season, mode, role and account filters. A fixed clock: every game at a set time.
*/

let handle: DbHandle;
let playerId: string;
let mainId: string;
let altId: string;
const NOW = new Date("2026-11-20T12:00:00Z");

beforeAll(async () => {
  invalidateMultikillCountingCache();
  handle = await testDb();
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
  const db = handle.db;
  const team = await getOrCreateTeam(db);
  // A Top player whose Top pool holds Gwen and Sion and whose Mid pool holds Syndra; no pool holds Lux.
  playerId = (await createPlayer(db, team.id, { displayName: "Flex", primaryRole: "TOP", secondaryRole: "MID", primaryPool: ["Gwen", "Sion"], secondaryPool: ["Syndra"] })).id;
  mainId = (await addAccount(db, { ownerType: "player", playerId, riotId: "Flex#OCE", platform: "oc1" })).id;
  altId = (await addAccount(db, { ownerType: "player", playerId, riotId: "FlexAlt#OCE", platform: "oc1" })).id;
  await db.update(riotAccounts).set({ puuid: "puuid-flex", syncStatus: "ok" }).where(eq(riotAccounts.id, mainId));
  await db.update(riotAccounts).set({ puuid: "puuid-flex-alt", syncStatus: "ok", label: "alt" }).where(eq(riotAccounts.id, altId));
  await db.update(patches).set({ isCurrent: false });
  await db.insert(patches).values(["16.20", "15.24"].map((id, i) => ({ id, ddragonVersion: `${id}.1`, isCurrent: i === 0, sortKey: patchSortKey(id) })));
  let n = 0;
  const at = (k: number) => Date.UTC(2026, 10, 1) + k * 3_600_000;
  const game = (championId: string, role: string | null, win: boolean, over: Partial<typeof accountMatches.$inferInsert> = {}) => ({ accountId: mainId, matchId: `OC1_${++n}`, gameCreation: at(n), queueId: 420, championId, role, win, patch: "16.20", gameDuration: 1800, kills: 5, deaths: 3, assists: 7, cs: role === "SUPPORT" ? 40 : 210, damage: 21_000, visionScore: role === "SUPPORT" ? 60 : 20, ...over });
  await db.insert(accountMatches).values([
    // Syndra: one position, Mid, a single game.
    game("Syndra", "MID", true),
    // Gwen: two positions, Top 3 (2W) and Jungle 1 (L), and one game with no recorded position (W).
    game("Gwen", "TOP", true),
    game("Gwen", "JUNGLE", false, { kills: 1, deaths: 6, assists: 2, cs: 150 }),
    game("Gwen", "TOP", false),
    game("Gwen", null, true),
    game("Gwen", "TOP", true),
    // Lux: three positions, Support 2 (Flex queue for one), Mid 1, Bottom 1.
    game("Lux", "SUPPORT", true),
    game("Lux", "MID", false),
    game("Lux", "SUPPORT", false, { queueId: 440 }),
    game("Lux", "ADC", true),
    // Sion: all five positions, Top 2, then one each (the most recent first among equals).
    game("Sion", "TOP", true),
    game("Sion", "JUNGLE", false),
    game("Sion", "SUPPORT", true),
    game("Sion", "TOP", false),
    game("Sion", "MID", true),
    game("Sion", "ADC", false),
    // Teemo: played only in games with no recorded position: a row, with no position.
    game("Teemo", null, false),
    game("Teemo", "", true),
    // A Gwen Top game seen from both accounts (a duo with the alt): counted once.
    { ...game("Gwen", "TOP", true), matchId: "OC1_SHARED" },
    { ...game("Gwen", "TOP", true), accountId: altId, matchId: "OC1_SHARED" },
    // Last season: never in this season's figures.
    game("Gwen", "MID", true, { patch: "15.24", gameCreation: Date.UTC(2025, 10, 1) }),
  ]);
});
afterAll(async () => {
  await handle.close();
});

const row = (rows: ChampionRow[], id: string) => rows.find((r) => r.championId === id)!;
const positions = (r: ChampionRow) => r.roles.map((x) => `${x.role} ${x.games} ${x.wins}W`);

describe("All Champions: one row per champion, with every position it was played in", () => {
  it("lists each champion once, its figures over all its games in the filters, and its positions most played first", async () => {
    const player = (await getPlayer(handle.db, playerId))!;
    const o = await getPlayerOverview(handle.db, player, { mode: "all", riotConfigured: true, now: NOW });
    expect(o.topChampions.map((r) => r.championId).sort()).toEqual(["Gwen", "Lux", "Sion", "Syndra", "Teemo"]);
    // One position, a single game: the row's figures are that position's (sent once).
    const syndra = row(o.topChampions, "Syndra");
    expect(positions(syndra)).toEqual(["MID 1 1W"]);
    expect(syndra.role).toBe("MID");
    expect(syndra.roles[0]!.figures).toBeUndefined();
    expect(syndra.noRole).toBe(0);
    // Two positions and a game with none: the totals hold all six games (the shared one once), each position its own.
    const gwen = row(o.topChampions, "Gwen");
    expect(gwen.selected).toMatchObject({ games: 6, wins: 4 });
    expect(positions(gwen)).toEqual(["TOP 4 3W", "JUNGLE 1 0W"]);
    expect(gwen.noRole).toBe(1);
    expect(gwen.role).toBe("TOP");
    const jungle = gwen.roles.find((r) => r.role === "JUNGLE")!.figures!;
    expect(jungle.selected).toMatchObject({ games: 1, wins: 0, winRate: 0 });
    expect(jungle.performance).toMatchObject({ games: 1, kills: 1, deaths: 6, assists: 2, csPerGame: 150 });
    expect(gwen.roles.find((r) => r.role === "TOP")!.figures!.performance.games).toBe(4);
    // The positions add up to the totals less the games without one.
    expect(gwen.roles.reduce((s, r) => s + r.games, 0) + gwen.noRole).toBe(gwen.selected.games);
    // Three positions: Support 2, then Mid and Bottom 1 each (Bottom played last, so first of the two).
    expect(positions(row(o.topChampions, "Lux"))).toEqual(["SUPPORT 2 1W", "ADC 1 1W", "MID 1 0W"]);
    // All five: Top 2, then the four single games, the most recent first.
    const sion = row(o.topChampions, "Sion");
    expect(positions(sion)).toEqual(["TOP 2 1W", "ADC 1 0W", "MID 1 1W", "SUPPORT 1 1W", "JUNGLE 1 0W"]);
    expect(sion.roles.every((r) => r.figures && r.figures.selected.games === r.games)).toBe(true);
    expect(sion.roles.find((r) => r.role === "SUPPORT")!.figures!.performance.visionPerGame).toBe(60);
    // Only games with no recorded position: the row is there, with no position (never the primary role's).
    const teemo = row(o.topChampions, "Teemo");
    expect(teemo).toMatchObject({ role: null, roles: [], noRole: 2, poolRoles: [], inPool: null });
    expect(teemo.selected).toMatchObject({ games: 2, wins: 1 });
  });

  it("marks In pool from the positions on the row whose pool holds the champion, never from a position it was not played in", async () => {
    const player = (await getPlayer(handle.db, playerId))!;
    const o = await getPlayerOverview(handle.db, player, { mode: "all", riotConfigured: true, now: NOW });
    expect(row(o.topChampions, "Gwen").poolRoles).toEqual(["TOP"]);
    expect(row(o.topChampions, "Sion")).toMatchObject({ poolRoles: ["TOP"], inPool: "primary" });
    expect(row(o.topChampions, "Syndra")).toMatchObject({ poolRoles: ["MID"], inPool: "secondary" });
    // Lux is in no pool.
    expect(row(o.topChampions, "Lux")).toMatchObject({ poolRoles: [], inPool: null });
  });

  it("follows the filters: a role leaves that position alone (and drops games without one), a mode its games, an account its games", async () => {
    const player = (await getPlayer(handle.db, playerId))!;
    const mid = await getPlayerOverview(handle.db, player, { mode: "all", role: "MID", riotConfigured: true, now: NOW });
    expect(mid.topChampions.map((r) => `${r.championId} ${positions(r).join(",")} ${r.noRole}`).sort()).toEqual(["Lux MID 1 0W 0", "Sion MID 1 1W 0", "Syndra MID 1 1W 0"]);
    // Solo/Duo only: Lux's Flex Support game is not counted.
    const solo = await getPlayerOverview(handle.db, player, { mode: "solo", riotConfigured: true, now: NOW });
    expect(positions(row(solo.topChampions, "Lux"))).toEqual(["ADC 1 1W", "MID 1 0W", "SUPPORT 1 1W"]);
    // The alt account alone: only the shared Gwen game.
    const alt = await getPlayerOverview(handle.db, player, { mode: "all", accountId: altId, riotConfigured: true, now: NOW });
    expect(alt.topChampions.map((r) => `${r.championId} ${positions(r).join(",")}`)).toEqual(["Gwen TOP 1 1W"]);
  });
});
