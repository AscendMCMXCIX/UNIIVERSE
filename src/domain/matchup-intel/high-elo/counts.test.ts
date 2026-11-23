import { describe, expect, it } from "vitest";
import { countDeltas, effectiveSize, END_BUCKET_MS, shareOf, weightedQuantile, wonShare, type HighEloObservation } from "./counts";

const obs = (over: Partial<HighEloObservation> = {}): HighEloObservation => ({ role: "TOP", champion: "Riven", opponent: "Darius", win: true, choices: { ks: "8010", spells: "4,12" }, end: 610_000, weight: 2, ...over });

describe("countDeltas", () => {
  it("adds the games, each choice and the lane end against everyone, and the games and lane end against the confirmed opponent", () => {
    const rows = countDeltas([obs()], "16.23", "europe");
    const keys = rows.map((r) => `${r.opponent}|${r.kind}|${r.value}`).sort();
    expect(keys).toEqual(["Darius|end|600000", "Darius|games|", "|end|600000", "|games|", "|ks|8010", "|spells|4,12"].sort());
    for (const r of rows) expect(r).toMatchObject({ patch: "16.23", region: "europe", role: "TOP", champion: "Riven", n: 1, w: 2, w2: 4, ww: 2 });
  });

  it("merges games with the same key, and counts Σw over the games won only", () => {
    const rows = countDeltas([obs({ weight: 2, win: true }), obs({ weight: 3, win: false })], "16.23", "europe");
    const games = rows.find((r) => r.opponent === "" && r.kind === "games")!;
    expect(games).toMatchObject({ n: 2, w: 5, w2: 13, ww: 2 });
  });

  it("counts no opponent row without a confirmed opponent, and skips a game with no weight", () => {
    const rows = countDeltas([obs({ opponent: null }), obs({ weight: 0 }), obs({ weight: Number.NaN })], "16.23", "asia");
    expect(rows.every((r) => r.opponent === "")).toBe(true);
    expect(rows.find((r) => r.kind === "games")!.n).toBe(1);
  });

  it("buckets the lane end by 30 seconds", () => {
    const rows = countDeltas([obs({ end: 2 * END_BUCKET_MS + 29_999, opponent: null })], "16.23", "sea");
    expect(rows.find((r) => r.kind === "end")!.value).toBe(String(2 * END_BUCKET_MS));
  });
});

describe("the statistics", () => {
  it("the effective sample size is n for equal weights, less for unequal ones, never more", () => {
    expect(effectiveSize({ n: 10, w: 20, w2: 40, ww: 0 })).toBeCloseTo(10, 9);
    // weights 1 and 9: (10)² / 82
    expect(effectiveSize({ n: 2, w: 10, w2: 82, ww: 0 })).toBeCloseTo(100 / 82, 9);
    expect(effectiveSize({ n: 0, w: 0, w2: 0, ww: 0 })).toBe(0);
  });

  it("the weighted share won has a 95% Wilson interval at the effective size", () => {
    const s = wonShare({ n: 100, w: 100, w2: 100, ww: 50 })!;
    expect(s.share).toBe(0.5);
    expect(s.low).toBeCloseTo(0.404, 2);
    expect(s.high).toBeCloseTo(0.596, 2);
    expect(wonShare({ n: 0, w: 0, w2: 0, ww: 0 })).toBeNull();
    // Unequal weights widen the interval for the same n.
    const wide = wonShare({ n: 100, w: 100, w2: 400, ww: 50 })!;
    expect(wide.high - wide.low).toBeGreaterThan(s.high - s.low);
  });

  it("a share is a weighted share", () => {
    expect(shareOf({ n: 3, w: 6, w2: 0, ww: 0 }, { n: 10, w: 24, w2: 0, ww: 0 })).toBe(0.25);
    expect(shareOf({ n: 0, w: 0, w2: 0, ww: 0 }, { n: 0, w: 0, w2: 0, ww: 0 })).toBe(0);
  });

  it("a weighted quantile reads within the buckets", () => {
    const buckets = [
      { value: 0, w: 1 },
      { value: 30_000, w: 1 },
    ];
    expect(weightedQuantile(buckets, 0.5)).toBe(30_000);
    expect(weightedQuantile(buckets, 0.25)).toBe(15_000);
    expect(weightedQuantile([], 0.5)).toBeNull();
  });
});
