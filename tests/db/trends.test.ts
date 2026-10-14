import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { championBanStats, championRoleStats, statPeriods } from "@/server/db/schema";
import { buildTrendsReport, MIN_COMPARISON_GAMES } from "@/server/trends";
import type { PlayerProfile } from "@/domain/roster";

/* Trends read the aggregate tables honestly: names not ids, per-list ordering, role figures, and no patch comparison on a thin previous patch. */

let handle: DbHandle;
const names: Record<string, string> = { MonkeyKing: "Wukong", Gwen: "Gwen", Ornn: "Ornn", Jinx: "Jinx", Zed: "Zed" };

beforeAll(async () => {
  handle = await testDb();
  const db = handle.db;
  await db.insert(statPeriods).values([
    { patch: "16.20", source: "ranked", games: 1000 },
    { patch: "16.19", source: "ranked", games: 88 },
  ]);
  await db.insert(championRoleStats).values([
    { patch: "16.20", source: "ranked", championId: "Gwen", role: "TOP", games: 300, wins: 170 },
    { patch: "16.20", source: "ranked", championId: "Gwen", role: "JUNGLE", games: 20, wins: 5 },
    { patch: "16.20", source: "ranked", championId: "Ornn", role: "TOP", games: 120, wins: 60 },
    { patch: "16.20", source: "ranked", championId: "Jinx", role: "ADC", games: 400, wins: 190 },
    { patch: "16.20", source: "ranked", championId: "MonkeyKing", role: "TOP", games: 40, wins: 22 },
    { patch: "16.19", source: "ranked", championId: "Gwen", role: "TOP", games: 10, wins: 2 },
  ]);
  await db.insert(championBanStats).values([
    { patch: "16.20", source: "ranked", championId: "Zed", bans: 450 },
    { patch: "16.20", source: "ranked", championId: "MonkeyKing", bans: 200 },
    { patch: "16.20", source: "ranked", championId: "Gwen", bans: 160 },
  ]);
}, 60_000);
afterAll(async () => {
  await handle.close();
});

describe("trends", () => {
  it("ranks each list by its own measure, keeps banned-only champions and shows role figures per role", async () => {
    const r = await buildTrendsReport(handle.db, "16.20", null);
    expect(r.mostPicked.map((t) => t.championId)).toEqual(["Jinx", "Gwen", "Ornn", "MonkeyKing"]);
    expect(r.mostBanned.map((t) => t.championId)).toEqual(["Zed", "MonkeyKing", "Gwen"]);
    expect(r.contested[0]!.championId).toBe("Gwen"); // 32% picked + 16% banned
    expect(r.contested.find((t) => t.championId === "Zed")!.presence).toBeCloseTo(0.45);
    // Gwen's win rate and sample are her Top games, not Top and Jungle mixed.
    const gwen = r.contested.find((t) => t.championId === "Gwen")!;
    expect(gwen.games).toBe(300);
    expect(gwen.role).toBe("TOP");
    const top = r.byRole.TOP;
    expect(top.map((t) => t.championId)).toEqual(["Gwen", "Ornn", "MonkeyKing"]);
    expect(top[0]!.pickRate).toBeCloseTo(0.3);
    // Strong performing needs 150+ games in the main role and an adjusted win rate above 50%.
    expect(r.strong.map((t) => t.championId)).toEqual(["Gwen"]);
  });

  it("does not compare with a previous patch that has too few games", async () => {
    const r = await buildTrendsReport(handle.db, "16.20", null);
    expect(r.previousPatch).toBe("16.19");
    expect(r.comparison.supported).toBe(false);
    expect(r.comparison.reason).toContain(`${MIN_COMPARISON_GAMES}`);
    expect(r.rising).toEqual([]);
    expect(r.falling).toEqual([]);
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
