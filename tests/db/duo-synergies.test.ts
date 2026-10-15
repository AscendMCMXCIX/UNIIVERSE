import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { championRoleStats, championSynergies, statPeriods } from "@/server/db/schema";
import { buildDuoReport } from "@/server/duo-synergies";
import { MIN_DUO_GAMES } from "@/domain/duo-synergy";

/*
  Duo Synergies read the aggregated pair table: summed over ladder bands and the recent patches,
  oriented as the role pair reads (Bottom first, then Support) whichever way a row was stored,
  scored against each champion's own record in its role, and never mixing professional games.
*/

let handle: DbHandle;

beforeAll(async () => {
  handle = await testDb();
  const db = handle.db;
  await db.insert(statPeriods).values([
    { patch: "16.20", source: "ranked", games: 4000 },
    { patch: "16.19", source: "ranked", games: 3000 },
    { patch: "16.18", source: "ranked", games: 2000 },
    { patch: "16.17", source: "ranked", games: 9000 },
    { patch: "16.20", source: "pro", games: 300 },
  ]);
  // Jinx + Lulu, stored with Jinx first (alphabetical), split across bands and patches: 160 games, 104 wins.
  // Ezreal + Thresh, stored with Ezreal first: 300 games, 141 wins. Ashe + Braum: too few (10).
  await db.insert(championSynergies).values([
    { patch: "16.20", source: "ranked", tierBand: "EMERALD", championAId: "Jinx", roleA: "ADC", championBId: "Lulu", roleB: "SUPPORT", games: 100, wins: 66 },
    { patch: "16.19", source: "ranked", tierBand: "DIAMOND", championAId: "Jinx", roleA: "ADC", championBId: "Lulu", roleB: "SUPPORT", games: 60, wins: 38 },
    { patch: "16.20", source: "ranked", tierBand: "EMERALD", championAId: "Ezreal", roleA: "ADC", championBId: "Thresh", roleB: "SUPPORT", games: 300, wins: 141 },
    { patch: "16.20", source: "ranked", tierBand: "EMERALD", championAId: "Ashe", roleA: "ADC", championBId: "Braum", roleB: "SUPPORT", games: 10, wins: 9 },
    // A support stored first alphabetically: Bard (SUPPORT) + Varus (ADC) must read as Varus + Bard.
    { patch: "16.20", source: "ranked", tierBand: "EMERALD", championAId: "Bard", roleA: "SUPPORT", championBId: "Varus", roleB: "ADC", games: 80, wins: 40 },
    // Outside the window (16.17) and professional games: never counted.
    { patch: "16.17", source: "ranked", tierBand: "EMERALD", championAId: "Ezreal", roleA: "ADC", championBId: "Thresh", roleB: "SUPPORT", games: 5000, wins: 5000 },
    { patch: "16.20", source: "pro", tierBand: "PRO", championAId: "Ezreal", roleA: "ADC", championBId: "Thresh", roleB: "SUPPORT", games: 500, wins: 500 },
  ]);
  await db.insert(championRoleStats).values([
    { patch: "16.20", source: "ranked", tierBand: "EMERALD", championId: "Jinx", role: "ADC", games: 1000, wins: 500 },
    { patch: "16.20", source: "ranked", tierBand: "EMERALD", championId: "Lulu", role: "SUPPORT", games: 1000, wins: 500 },
    { patch: "16.20", source: "ranked", tierBand: "EMERALD", championId: "Ezreal", role: "ADC", games: 1000, wins: 470 },
    { patch: "16.20", source: "ranked", tierBand: "EMERALD", championId: "Thresh", role: "SUPPORT", games: 1000, wins: 500 },
    { patch: "16.20", source: "ranked", tierBand: "EMERALD", championId: "Varus", role: "ADC", games: 500, wins: 250 },
    { patch: "16.20", source: "ranked", tierBand: "EMERALD", championId: "Bard", role: "SUPPORT", games: 500, wins: 250 },
  ]);
}, 60_000);
afterAll(async () => {
  await handle.close();
});

describe("duo synergies", () => {
  it("pools the last three patches and every band, ranks real pairs, and leaves thin ones out", async () => {
    const r = await buildDuoReport(handle.db, { pair: "bot-support" });
    expect(r.source).toBe("ranked");
    expect(r.patches).toEqual(["16.20", "16.19", "16.18"]);
    expect(r.games).toBe(9000);
    const jinx = r.rows.find((x) => x.championA === "Jinx")!;
    expect(jinx).toMatchObject({ championB: "Lulu", games: 160, wins: 104 });
    expect(jinx.winRate).toBeCloseTo(0.65, 5);
    expect(jinx.expected).toBeCloseTo(0.5, 2);
    expect(jinx.synergy).toBeGreaterThan(0.05);
    expect(r.rows[0]!.championA).toBe("Jinx");
    // Stored the other way round, read the right way round.
    expect(r.rows.find((x) => x.championA === "Varus")).toMatchObject({ championB: "Bard", games: 80 });
    // 16.17 and pro rows are not counted: Ezreal + Thresh is the 300 ranked games only.
    expect(r.rows.find((x) => x.championA === "Ezreal")).toMatchObject({ games: 300, wins: 141 });
    expect(r.rows.some((x) => x.championA === "Ashe")).toBe(false);
    expect(r.pairsSeen).toBe(4);
    expect(r.pairsListed).toBe(3);
    expect(r.minGames).toBe(MIN_DUO_GAMES);
  });

  it("one patch only, and an honest empty state for role pairs without evidence", async () => {
    const one = await buildDuoReport(handle.db, { pair: "bot-support", patch: "16.19" });
    expect(one.patches).toEqual(["16.19"]);
    expect(one.rows.map((x) => `${x.championA}+${x.championB}`)).toEqual(["Jinx+Lulu"]);
    const mid = await buildDuoReport(handle.db, { pair: "jungle-mid" });
    expect(mid.rows).toEqual([]);
    expect(mid.listedByPair["jungle-mid"]).toBe(0);
    expect(mid.listedByPair["bot-support"]).toBe(3);
  });

  it("sorts by games played when asked", async () => {
    const r = await buildDuoReport(handle.db, { pair: "bot-support", sort: "games" });
    expect(r.rows.map((x) => x.championA)).toEqual(["Ezreal", "Jinx", "Varus"]);
  });
});
