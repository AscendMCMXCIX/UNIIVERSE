import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatches, patches, riotAccounts } from "@/server/db/schema";
import { patchSortKey } from "@/domain/patch";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getOrCreateTeam, getPlayer, patchPlayerProfile } from "@/server/repositories/team";
import { addAccount } from "@/server/accounts/repository";
import { getPlayerOverview } from "@/server/players/overview";

let handle: DbHandle;
let playerId: string;

beforeAll(async () => {
  handle = await testDb();
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
  const db = handle.db;
  const team = await getOrCreateTeam(db);
  playerId = (await createPlayer(db, team.id, { displayName: "Stats", primaryRole: "TOP", secondaryRole: "MID", primaryPool: ["Gwen", "Riven"], secondaryPool: ["Ahri"], additionalRoles: [{ role: "SUPPORT", pool: ["Rakan"] }] })).id;
  const main = (await addAccount(db, { ownerType: "player", playerId, riotId: "Stats#OCE", platform: "oc1" })).id;
  const alt = (await addAccount(db, { ownerType: "player", playerId, riotId: "StatsAlt#OCE", platform: "oc1" })).id;
  await db.update(riotAccounts).set({ puuid: "p-main", syncStatus: "ok", lastSyncAt: new Date() }).where(eq(riotAccounts.id, main));
  await db.update(riotAccounts).set({ puuid: "p-alt", syncStatus: "ok", lastSyncAt: new Date() }).where(eq(riotAccounts.id, alt));
  await db.update(patches).set({ isCurrent: false });
  await db.insert(patches).values(["16.20", "15.24"].map((id, i) => ({ id, ddragonVersion: `${id}.1`, isCurrent: i === 0, sortKey: patchSortKey(id) })));
  let n = 0;
  const g = (accountId: string, championId: string, queueId: number, win: boolean, patch: string, perf: Partial<{ kills: number; deaths: number; assists: number; cs: number; damage: number; visionScore: number; gameDuration: number }>, matchId?: string, role = "TOP") => ({ accountId, matchId: matchId ?? `OC1_${++n}`, gameCreation: 1_790_000_000_000 + ++n * 1000, queueId, championId, role, win, patch, ...perf });
  await db.insert(accountMatches).values([
    g(main, "Gwen", 420, true, "16.20", { kills: 8, deaths: 2, assists: 4, cs: 210, damage: 24000, visionScore: 18, gameDuration: 1800 }),
    g(alt, "Gwen", 420, false, "16.20", { kills: 2, deaths: 6, assists: 3, cs: 170, damage: 15000, visionScore: 12, gameDuration: 1500 }),
    // A duo game seen from both accounts: once.
    g(main, "Riven", 420, true, "16.20", { kills: 6, deaths: 0, assists: 6, cs: 200, damage: 20000, visionScore: 20, gameDuration: 1800 }, "OC1_SHARED"),
    g(alt, "Riven", 420, true, "16.20", { kills: 6, deaths: 0, assists: 6, cs: 200, damage: 20000, visionScore: 20, gameDuration: 1800 }, "OC1_SHARED"),
    // Flex game, additional-role champion.
    g(main, "Rakan", 440, true, "16.20", { kills: 1, deaths: 3, assists: 20, cs: 30, damage: 8000, visionScore: 70, gameDuration: 1800 }, undefined, "SUPPORT"),
    // Stored before details existed: counts for the record, not the averages.
    g(main, "Gwen", 420, false, "16.20", {}),
    // Outside the pools: never in the main summary.
    g(main, "Aatrox", 420, true, "16.20", { kills: 20, deaths: 0, assists: 0, cs: 400, damage: 90000, visionScore: 5, gameDuration: 2400 }),
    // Last season.
    g(main, "Gwen", 420, true, "15.24", { kills: 10, deaths: 1, assists: 10, cs: 250, damage: 30000, visionScore: 25, gameDuration: 1800 }),
  ]);
});
afterAll(async () => {
  await handle.close();
});

describe("profile statistics: defaults and filters", () => {
  const overview = async (opts: Partial<Parameters<typeof getPlayerOverview>[2]> = {}) => getPlayerOverview(handle.db, (await getPlayer(handle.db, playerId))!, { mode: "all", riotConfigured: true, ...opts });

  it("counts every champion and every linked account by default (a shared game once)", async () => {
    const o = await overview();
    expect(o.filter).toMatchObject({ role: null, scope: "all", accountId: null, mode: "all" });
    // Gwen x3, Riven (seen from both accounts) x1, Rakan x1, Aatrox x1.
    expect(o.summary.record.games).toBe(6);
    expect(o.topChampions.map((c) => c.championId)).toEqual(["Gwen", "Aatrox", "Rakan", "Riven"].sort((a, b) => (a === "Gwen" ? -1 : b === "Gwen" ? 1 : a.localeCompare(b))));
  });

  it("narrows by role played, configured pool, one champion and one account", async () => {
    expect((await overview({ role: "TOP" })).summary.record.games).toBe(5);
    expect((await overview({ role: "SUPPORT" })).summary.record.games).toBe(1);
    expect((await overview({ scope: "pool" })).summary.record.games).toBe(5);
    expect((await overview({ scope: "champion", championId: "Gwen" })).summary.record.games).toBe(3);
    const accounts = (await overview()).accountOptions;
    const alt = accounts.find((a) => a.riotId.startsWith("StatsAlt"))!.id;
    // The alt's own Gwen game and the shared Riven game.
    expect((await overview({ accountId: alt })).summary.record.games).toBe(2);
    // An unknown account id is ignored rather than showing nothing.
    expect((await overview({ accountId: "00000000-0000-0000-0000-000000000000" })).filter.accountId).toBeNull();
  });
});

describe("profile performance averages", () => {
  it("summarises the selected season over pool champions only, deduplicated across accounts", async () => {
    const o = await getPlayerOverview(handle.db, (await getPlayer(handle.db, playerId))!, { mode: "all", riotConfigured: true });
    // Gwen x3 (one without details), Riven x1 (shared), Rakan x1 → 5 games; Aatrox excluded.
    expect(o.pool.record).toMatchObject({ games: 5, wins: 3, losses: 2 });
    expect(o.pool.champions).toBe(4);
    const p = o.pool.performance;
    expect(p.detailedGames).toBe(4);
    // (8+2+6+1 kills + 4+3+6+20 assists) / (2+6+0+3 deaths)
    expect(p.kdaRatio).toBeCloseTo((17 + 33) / 11, 6);
    expect(p.csPerGame).toBeCloseTo((210 + 170 + 200 + 30) / 4, 6);
    expect(p.damagePerGame).toBeCloseTo((24000 + 15000 + 20000 + 8000) / 4, 6);
    expect(p.visionPerGame).toBeCloseTo((18 + 12 + 20 + 70) / 4, 6);
    expect(p.csGames).toBe(4);
    // Every champion played, for context, includes Aatrox.
    expect(o.record.games).toBe(6);
    expect(o.allPerformance.detailedGames).toBe(5);
  });

  it("follows the game-mode and season filters", async () => {
    const player = (await getPlayer(handle.db, playerId))!;
    const solo = await getPlayerOverview(handle.db, player, { mode: "solo", riotConfigured: true });
    expect(solo.pool.record.games).toBe(4);
    expect(solo.pool.performance.visionPerGame).toBeCloseTo((18 + 12 + 20) / 3, 6);
    const last = await getPlayerOverview(handle.db, player, { mode: "all", season: 15, riotConfigured: true });
    expect(last.pool.record.games).toBe(1);
    expect(last.pool.performance.kdaRatio).toBe(20);
  });

  it("shows per-champion averages beside each pool champion, grouped by role", async () => {
    const o = await getPlayerOverview(handle.db, (await getPlayer(handle.db, playerId))!, { mode: "all", riotConfigured: true });
    const gwen = o.cards.find((c) => c.championId === "Gwen")!;
    expect(gwen.selected.games).toBe(3);
    expect(gwen.performance.detailedGames).toBe(2);
    expect(gwen.performance.kdaRatio).toBeCloseTo((10 + 7) / 8, 6);
    const rakan = o.cards.find((c) => c.championId === "Rakan")!;
    expect(rakan.role).toBe("SUPPORT");
    expect(rakan.inPool).toBe("additional");
  });

  it("recalculates when the pool changes", async () => {
    await patchPlayerProfile(handle.db, playerId, { primaryPool: ["Gwen", "Riven", "Aatrox"] });
    const o = await getPlayerOverview(handle.db, (await getPlayer(handle.db, playerId))!, { mode: "all", riotConfigured: true });
    expect(o.pool.record.games).toBe(6);
    expect(o.pool.performance.detailedGames).toBe(5);
  });
});
