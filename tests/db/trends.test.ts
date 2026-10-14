import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { championBanStats, championRoleStats, statPeriods } from "@/server/db/schema";
import { buildTrendsReport, MIN_COMPARISON_GAMES, TREND_SORTS, TREND_VIEWS } from "@/server/trends";
import type { PlayerProfile } from "@/domain/roster";

/*
  Trends read the aggregate tables honestly. Rows are stored per ladder band (Emerald, Diamond,
  Master…), so every figure must be summed across bands: earlier code overwrote ban counts band by
  band and listed a champion once per band in the role lists.
*/

let handle: DbHandle;
const names: Record<string, string> = { MonkeyKing: "Wukong", Gwen: "Gwen", Ornn: "Ornn", Jinx: "Jinx", Zed: "Zed" };
const ids = (rows: Array<{ championId: string }>) => rows.map((t) => t.championId);

beforeAll(async () => {
  handle = await testDb();
  const db = handle.db;
  await db.insert(statPeriods).values([
    { patch: "16.21", source: "ranked", games: 50 },
    { patch: "16.20", source: "ranked", games: 1000 },
    { patch: "16.19", source: "ranked", games: 88 },
  ]);
  await db.insert(championRoleStats).values([
    { patch: "16.20", source: "ranked", tierBand: "EMERALD", championId: "Gwen", role: "TOP", games: 200, wins: 110 },
    { patch: "16.20", source: "ranked", tierBand: "DIAMOND", championId: "Gwen", role: "TOP", games: 100, wins: 60 },
    { patch: "16.20", source: "ranked", tierBand: "EMERALD", championId: "Gwen", role: "JUNGLE", games: 20, wins: 5 },
    { patch: "16.20", source: "ranked", tierBand: "EMERALD", championId: "Ornn", role: "TOP", games: 120, wins: 60 },
    { patch: "16.20", source: "ranked", tierBand: "EMERALD", championId: "Jinx", role: "ADC", games: 250, wins: 120 },
    { patch: "16.20", source: "ranked", tierBand: "MASTER", championId: "Jinx", role: "ADC", games: 150, wins: 70 },
    { patch: "16.20", source: "ranked", tierBand: "EMERALD", championId: "MonkeyKing", role: "TOP", games: 40, wins: 22 },
    { patch: "16.20", source: "ranked", tierBand: "EMERALD", championId: "MonkeyKing", role: "JUNGLE", games: 5, wins: 3 },
    { patch: "16.19", source: "ranked", championId: "Gwen", role: "TOP", games: 10, wins: 2 },
    { patch: "16.21", source: "ranked", tierBand: "EMERALD", championId: "Ornn", role: "TOP", games: 30, wins: 15 },
  ]);
  await db.insert(championBanStats).values([
    { patch: "16.20", source: "ranked", tierBand: "EMERALD", championId: "Zed", bans: 300 },
    { patch: "16.20", source: "ranked", tierBand: "DIAMOND", championId: "Zed", bans: 150 },
    { patch: "16.20", source: "ranked", tierBand: "EMERALD", championId: "MonkeyKing", bans: 200 },
    { patch: "16.20", source: "ranked", tierBand: "EMERALD", championId: "Gwen", bans: 100 },
    { patch: "16.20", source: "ranked", tierBand: "DIAMOND", championId: "Gwen", bans: 60 },
  ]);
}, 60_000);
afterAll(async () => {
  await handle.close();
});

describe("trends", () => {
  it("sums every ladder band and ranks each list by its own measure", async () => {
    const r = await buildTrendsReport(handle.db, "16.21", null);
    expect(r.patch).toBe("16.20");
    const all = r.views.ALL.bySort;
    expect(ids(all.pick)).toEqual(["Jinx", "Gwen", "Ornn", "MonkeyKing"]);
    expect(all.pick[0]!.pickRate).toBeCloseTo(0.4);
    expect(ids(all.ban)).toEqual(["Zed", "MonkeyKing", "Gwen"]);
    // 300 Emerald + 150 Diamond bans, not the last band read.
    expect(all.ban[0]!.banRate).toBeCloseTo(0.45);
    expect(all.ban.find((t) => t.championId === "Gwen")!.banRate).toBeCloseTo(0.16);
    expect(ids(all.presence)).toEqual(["Gwen", "Zed", "Jinx", "MonkeyKing", "Ornn"]);
    expect(all.presence[0]!.presence).toBeCloseTo(0.48);
    // Overall win rate and sample are the main role's (Gwen: Top, both bands).
    const gwen = all.presence[0]!;
    expect(gwen).toMatchObject({ role: "TOP", games: 300 });
  });

  it("lists each champion once per role, with role pick rates and bans shared by where it is played", async () => {
    const r = await buildTrendsReport(handle.db, "16.20", null);
    const top = r.views.TOP.bySort;
    expect(ids(top.pick)).toEqual(["Gwen", "Ornn", "MonkeyKing"]);
    expect(top.pick[0]!.pickRate).toBeCloseTo(0.3);
    // Gwen: 16% bans × 300/320 of her games in Top = 15%; Wukong: 20% × 40/45 = 17.8%.
    expect(ids(top.ban)).toEqual(["MonkeyKing", "Gwen"]);
    expect(top.ban[1]!.banRate).toBeCloseTo(0.15);
    // Gwen's 20 Jungle games (6% of hers) qualify; Wukong's 5 do not.
    expect(ids(r.views.JUNGLE.bySort.pick)).toEqual(["Gwen"]);
    expect(r.views.MID.eligible).toBe(0);
    for (const view of TREND_VIEWS) for (const sort of TREND_SORTS) {
      const list = ids(r.views[view].bySort[sort]);
      expect(new Set(list).size, `${view}/${sort} has duplicates`).toBe(list.length);
      expect(list.length).toBeLessThanOrEqual(10);
    }
  });

  it("ranks win rates only with enough games and says how many qualify", async () => {
    const r = await buildTrendsReport(handle.db, "16.20", null);
    expect(ids(r.views.ALL.bySort.win).sort()).toEqual(["Gwen", "Jinx", "Ornn"]);
    expect(r.views.ALL.bySort.win[0]!.championId).toBe("Gwen");
    expect(r.views.ALL.winEligible).toBe(3);
    expect(r.views.TOP.winEligible).toBe(2);
  });

  it("shows the newest patch once it has enough games, and any recent patch on request", async () => {
    const r = await buildTrendsReport(handle.db, "16.21", null);
    expect(r.patches.map((p) => p.patch)).toEqual(["16.21", "16.20", "16.19"]);
    expect(r.newestPatchNote).toContain("16.21 has 50 games");
    const newest = await buildTrendsReport(handle.db, "16.21", null, undefined, "16.21");
    expect(newest.patch).toBe("16.21");
    expect(newest.totalGames).toBe(50);
    expect(ids(newest.views.ALL.bySort.pick)).toEqual(["Ornn"]);
  });

  it("does not compare with a previous patch that has too few games", async () => {
    const r = await buildTrendsReport(handle.db, "16.20", null);
    expect(r.previousPatch).toBe("16.19");
    expect(r.comparison.supported).toBe(false);
    expect(r.comparison.reason).toContain(`${MIN_COMPARISON_GAMES}`);
    expect(r.views.ALL.bySort.presence.every((t) => t.presenceDelta === null)).toBe(true);
  });

  it("writes pool alerts with champion names", async () => {
    const lineup = [{ id: "p1", displayName: "Topper", primaryRole: "TOP", secondaryRole: null, primaryPool: ["MonkeyKing", "Gwen", "Zed"], secondaryPool: [] }] as unknown as PlayerProfile[];
    const r = await buildTrendsReport(handle.db, "16.20", lineup, (id) => names[id] ?? id);
    const alert = r.poolAlerts.find((a) => a.severity === "warn")!;
    expect(alert.message).toContain("Wukong");
    expect(alert.message).not.toContain("MonkeyKing");
    expect(alert.message).toContain("Top pool");
  });
});
