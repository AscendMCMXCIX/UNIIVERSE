import { describe, expect, it } from "vitest";
import { benjaminiHochberg, chiSquare1Survival, compareStratified, erfc, twoSidedZ, wilsonInterval, type Stratum } from "./inference";

/*
  Reference values come from SciPy 1.x and statsmodels 0.14 (scipy.special.erfc,
  scipy.stats.chi2.sf, StratifiedTable.test_null_odds(correction=True),
  proportion_confint(method="wilson"), multipletests(method="fdr_bh")), computed outside the
  repository; the cases are listed with their numbers so they can be re-run. One deliberate
  difference: the CMH continuity correction follows R's mantelhaen.test (no correction when the
  deviation is under one half), where statsmodels over-corrects; no case below reaches it except
  the test that says so.
*/

const s = (exposedWins: number, exposedGames: number, otherWins: number, otherGames: number): Stratum => ({ exposedWins, exposedGames, otherWins, otherGames });

describe("erfc and the χ² survival function", () => {
  it.each([
    [0, 1],
    [0.1, 0.8875370839817152],
    [0.5, 0.4795001221869535],
    [1, 0.15729920705028513],
    [2, 0.004677734981047266],
    [3, 2.209049699858544e-5],
    [4, 1.541725790028002e-8],
    [-0.5, 1.5204998778130465],
    [-2, 1.9953222650189528],
  ])("erfc(%s)", (x, expected) => {
    expect(Math.abs(erfc(x) - expected) / expected).toBeLessThan(2e-7);
  });

  it.each([
    [0.001, 0.9747728793699604],
    [1, 0.31731050786291115],
    [3.841458820694124, 0.05],
    [10, 0.0015654022580025018],
    [20, 7.744216431044085e-6],
  ])("P(χ²₁ ≥ %s)", (x, expected) => {
    expect(Math.abs(chiSquare1Survival(x) - expected) / expected).toBeLessThan(1e-6);
  });

  it("is 1 at and below zero and for nonsense", () => {
    expect(chiSquare1Survival(0)).toBe(1);
    expect(chiSquare1Survival(-3)).toBe(1);
    expect(chiSquare1Survival(Number.NaN)).toBe(1);
  });
});

describe("wilsonInterval", () => {
  it.each([
    [0, 10, 0, 0.27753279986288926],
    [10, 10, 0.7224672001371106, 1],
    [13, 20, 0.43285427668523624, 0.818808175898918],
    [55, 100, 0.4524460299744213, 0.6438546202048803],
    [1, 1, 0.2065493143772374, 1],
    [310, 600, 0.4767025230039232, 0.5564187536289535],
  ])("%s of %s", (w, n, low, high) => {
    const r = wilsonInterval(w, n)!;
    expect(r.low).toBeCloseTo(low, 9);
    expect(r.high).toBeCloseTo(high, 9);
  });

  it("has no interval without games", () => {
    expect(wilsonInterval(0, 0)).toBeNull();
  });
});

describe("compareStratified: the CMH test", () => {
  it.each([
    ["two strata", [s(30, 50, 20, 50), s(12, 20, 30, 60)], 0.05904649806439244],
    ["many sparse strata", [s(1, 2, 0, 1), s(2, 3, 1, 2), s(0, 1, 1, 3), s(3, 4, 2, 5), s(1, 1, 0, 2), s(2, 2, 1, 1)], 0.3331160930490773],
    ["no real difference", [s(52, 100, 49, 100), s(25, 50, 26, 50)], 0.9083692562893119],
    ["large strata", [s(320, 600, 250, 560), s(140, 300, 150, 320), s(60, 100, 55, 110)], 0.007908306373850538],
  ])("%s matches statsmodels", (_name, strata, p) => {
    const r = compareStratified(strata);
    expect(r.pValue).not.toBeNull();
    expect(Math.abs(r.pValue! - p)).toBeLessThan(1e-6);
  });

  it("ignores a stratum with games on one side only (statsmodels drops it the same way)", () => {
    const r = compareStratified([s(10, 20, 0, 0), s(8, 10, 3, 12)]);
    expect(r.informativeStrata).toBe(1);
    expect(r.pValue!).toBeCloseTo(0.03646983035602658, 6);
    // …while the raw totals still show every game.
    expect(r.exposed).toEqual({ wins: 18, games: 30 });
    expect(r.other).toEqual({ wins: 3, games: 12 });
    expect(r.comparedGames).toEqual({ exposed: 10, other: 12 });
  });

  it("applies the continuity correction as R does: never past zero", () => {
    // Observed equals expected: no evidence at all (statsmodels would over-correct to p = 0.68).
    expect(compareStratified([s(5, 10, 6, 12)]).pValue).toBe(1);
  });

  it("has no figure when no stratum has both sides", () => {
    const r = compareStratified([s(10, 20, 0, 0), s(0, 0, 4, 9)]);
    expect(r).toMatchObject({ difference: null, low: null, high: null, pValue: null, informativeStrata: 0 });
    expect(compareStratified([])).toMatchObject({ difference: null, pValue: null });
  });

  it("gives p = 1 when every compared game has the same result", () => {
    const r = compareStratified([s(10, 10, 8, 8)]);
    expect(r.pValue).toBe(1);
    expect(r.difference).toBe(0);
  });

  it("cleans impossible counts instead of trusting them", () => {
    const r = compareStratified([s(12, 10, -3, 10), s(Number.NaN, 5, 2.7, 4)]);
    expect(r.exposed).toEqual({ wins: 10, games: 15 });
    expect(r.other).toEqual({ wins: 2, games: 14 });
  });
});

describe("compareStratified: the Mantel–Haenszel difference", () => {
  it("is the plain difference, with the Wald interval, for one stratum", () => {
    const r = compareStratified([s(15, 20, 4, 10)]);
    expect(r.difference).toBeCloseTo(0.35, 12);
    const half = 1.959963984540054 * Math.sqrt(0.75 * 0.25 / 20 + 0.4 * 0.6 / 10);
    expect(r.low).toBeCloseTo(0.35 - half, 12);
    expect(r.high).toBeCloseTo(0.35 + half, 12);
  });

  it("compares like with like: a difference made only by the mix of strata disappears", () => {
    // Exposed games are mostly in the easy stratum, but inside each stratum both sides win equally:
    // the raw rates differ by 20 points, the adjusted difference is zero.
    const r = compareStratified([s(70, 100, 7, 10), s(3, 10, 30, 100)]);
    expect(r.exposed.wins / r.exposed.games - r.other.wins / r.other.games).toBeGreaterThan(0.3);
    expect(r.difference).toBeCloseTo(0, 12);
    expect(r.pValue!).toBeGreaterThan(0.5);
  });

  it("keeps the interval inside −100…+100 points", () => {
    const r = compareStratified([s(3, 3, 0, 3)]);
    expect(r.high).toBe(1);
    expect(r.low!).toBeGreaterThanOrEqual(-1);
  });

  // The interval is right when it contains the true difference about 95% of the time. A seeded
  // simulation (the same draws every run) over three designs: a few large strata, many tiny ones,
  // and very unbalanced sides.
  it.each([
    ["a few large strata", [[150, 0.45, 200, 0.4], [100, 0.6, 80, 0.55]]],
    ["many tiny strata", Array.from({ length: 25 }, () => [6, 0.5, 8, 0.45])],
    ["unbalanced sides", [[30, 0.55, 300, 0.48], [10, 0.65, 90, 0.58], [5, 0.5, 60, 0.43]]],
  ] as Array<[string, number[][]]>)("covers the true difference about 95%% of the time (%s)", (_name, design) => {
    let seed = 0x9e3779b9;
    const random = () => {
      // mulberry32
      seed = (seed + 0x6d2b79f5) | 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const binomial = (n: number, p: number) => {
      let k = 0;
      for (let i = 0; i < n; i += 1) if (random() < p) k += 1;
      return k;
    };
    const truth = design[0]![1]! - design[0]![3]!;
    const runs = 3000;
    let hits = 0;
    for (let i = 0; i < runs; i += 1) {
      const r = compareStratified(design.map(([n1, p1, n0, p0]) => s(binomial(n1!, p1!), n1!, binomial(n0!, p0!), n0!)));
      if (r.low! <= truth && truth <= r.high!) hits += 1;
    }
    expect(hits / runs).toBeGreaterThan(0.93);
    expect(hits / runs).toBeLessThan(0.965);
  });
});

describe("benjaminiHochberg", () => {
  it("matches statsmodels' fdr_bh", () => {
    const p = [0.01, 0.04, 0.03, 0.005, 0.2, 0.5, 0.049, 0.001];
    const expected = [0.02666666666666667, 0.064, 0.06, 0.02, 0.2285714285714286, 0.5, 0.06533333333333334, 0.008];
    benjaminiHochberg(p).forEach((q, i) => expect(q!).toBeCloseTo(expected[i]!, 12));
  });

  it("keeps missing p-values out of the count", () => {
    expect(benjaminiHochberg([0.01, null, 0.04])).toEqual([0.02, null, 0.04]);
    expect(benjaminiHochberg([])).toEqual([]);
    expect(benjaminiHochberg([null])).toEqual([null]);
  });

  it("never makes a comparison look stronger than its own p-value", () => {
    const p = [0.3, 0.001, 0.02, 0.9];
    benjaminiHochberg(p).forEach((q, i) => expect(q!).toBeGreaterThanOrEqual(p[i]!));
  });
});

describe("twoSidedZ", () => {
  it.each([
    [0.05, 1.959963984540054],
    [0.01, 2.5758293035489004],
    [0.001, 3.2905267314918945],
    [0.05 / 48, 3.279024297718005],
    [1e-6, 4.891638475698856],
  ])("z for p = %s matches SciPy's norm.isf(p/2)", (p, z) => {
    expect(twoSidedZ(p)).toBeCloseTo(z, 5);
  });

  it("is 0 at p = 1 and stays finite at tiny p", () => {
    expect(twoSidedZ(1)).toBe(0);
    expect(Number.isFinite(twoSidedZ(0))).toBe(true);
  });
});
