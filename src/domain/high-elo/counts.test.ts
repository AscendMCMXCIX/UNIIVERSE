import { describe, expect, it } from "vitest";
import { ALL_REGIONS, addCounts, countDeltas, effectiveSize, highEloBuildRows, ZERO, type HighEloObservation } from "./counts";
import { tallyOf, effectiveGames } from "@/domain/champion-builds";

/*
  The Master+ counts (docs/HIGH_ELO_EVIDENCE.md, "What is stored"): what observations add (the build
  kinds for every region together, the games per region too, "all" exactly their sum), the
  effective sample size (never more than the games observed), and the page's rows as the builds'
  weighted tallies, with no player's count.
*/

const obs = (over: Partial<HighEloObservation> = {}): HighEloObservation => ({ lane: "UTILITY", champion: "Thresh", win: true, values: { timeline: "", runes: "8400:8439,8463,8473,8242|8300:8304,8347", spells: "4,14" }, weight: 2, ...over });

describe("the Master+ counts", () => {
  it("add the games under the region and under all regions, every build kind under all regions only", () => {
    const d = countDeltas([obs(), obs({ win: false, weight: 3 }), obs({ values: { spells: "4,14" }, weight: 1 })], "16.22", "europe");
    const games = d.filter((x) => x.kind === "games");
    expect(games.map((g) => g.region).sort()).toEqual([ALL_REGIONS, "europe"]);
    for (const g of games) expect(g).toMatchObject({ n: 3, w: 6, w2: 14, ww: 3, opponent: "", role: "UTILITY", champion: "Thresh", patch: "16.22" });
    expect(d.filter((x) => x.kind !== "games").every((x) => x.region === ALL_REGIONS)).toBe(true);
    expect(d.find((x) => x.kind === "spells")).toMatchObject({ n: 3, w: 6 });
    expect(d.find((x) => x.kind === "runes")).toMatchObject({ n: 2, w: 5 });
    expect(d.find((x) => x.kind === "timeline")).toMatchObject({ n: 2, value: "" });
    // An observation with no weight adds nothing.
    expect(countDeltas([obs({ weight: 0 }), obs({ weight: Number.POSITIVE_INFINITY })], "16.22", "asia")).toEqual([]);
  });

  it("are worth their effective size, never more than the games observed", () => {
    expect(effectiveSize({ n: 10, w: 10, w2: 10, ww: 5 })).toBe(10);
    expect(effectiveSize({ n: 4, w: 8, w2: 32, ww: 4 })).toBe(2);
    expect(effectiveSize(ZERO)).toBe(0);
    expect(addCounts({ n: 1, w: 2, w2: 4, ww: 2 }, { n: 2, w: 3, w2: 5, ww: 0 })).toEqual({ n: 3, w: 5, w2: 9, ww: 2 });
  });

  it("become the builds' weighted rows (Ranked Solo/Duo, no player's count), read through the same rules", () => {
    const rows = highEloBuildRows([
      { patch: "16.22", role: "UTILITY", kind: "games", value: "", n: 4, w: 8, w2: 32, ww: 4 },
      { patch: "16.22", role: "UTILITY", kind: "lane.gold", value: "", n: 4, w: 8, w2: 32, ww: 4 },
      { patch: "16.22", role: "MID", kind: "games", value: "", n: 4, w: 8, w2: 32, ww: 4 },
    ]);
    expect(rows).toEqual([{ dim: "games", patch: "16.22", lane: "UTILITY", queue: 420, value: "", n: 4, w: 2, nm: 0, top: 0, weight: { w: 8, w2: 32, ww: 4 } }]);
    expect(effectiveGames(tallyOf(rows[0]!))).toBe(2);
  });
});
