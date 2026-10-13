import { describe, expect, it } from "vitest";
import { blendPeriods, confidenceLabel, DEFAULT_BLEND, patchWeight, shrinkRate, wilsonInterval } from "./shrinkage";

describe("shrinkage", () => {
  it("does not let 3 games at 67% beat 1500 games at 54%", () => {
    const tiny = shrinkRate({ wins: 2, games: 3 }, 0.5, 100);
    const large = shrinkRate({ wins: 810, games: 1500 }, 0.5, 100);
    expect(tiny.estimate).toBeLessThan(large.estimate);
    expect(tiny.confidence).toBeLessThan(0.05);
    expect(large.confidence).toBeGreaterThan(0.9);
    expect(tiny.estimate).toBeCloseTo(0.505, 2);
    expect(large.estimate).toBeCloseTo(0.5375, 3);
  });

  it("returns the prior with zero confidence when there is no data", () => {
    const r = shrinkRate({ wins: 0, games: 0 }, 0.5, 50);
    expect(r.estimate).toBe(0.5);
    expect(r.confidence).toBe(0);
    expect(r.raw).toBeNull();
    expect(confidenceLabel(r.confidence, r.games)).toBe("none");
  });

  it("gives a sensible Wilson interval", () => {
    const i = wilsonInterval(55, 100);
    expect(i.low).toBeGreaterThan(0.44);
    expect(i.high).toBeLessThan(0.65);
  });

  it("decays historical evidence and phases it out as the current patch fills up", () => {
    const sparseCurrent = blendPeriods([
      { patchDistance: 0, wins: 5, games: 10 },
      { patchDistance: 1, wins: 300, games: 500 },
    ]);
    expect(sparseCurrent.games).toBeGreaterThan(10);
    expect(sparseCurrent.effectiveHistoricalShare).toBeGreaterThan(0.9);

    const fullCurrent = blendPeriods([
      { patchDistance: 0, wins: 500, games: 1000 },
      { patchDistance: 1, wins: 300, games: 500 },
    ]);
    expect(fullCurrent.games).toBe(1000);
    expect(fullCurrent.effectiveHistoricalShare).toBe(0);
  });

  it("applies rework discounts to pre-change evidence", () => {
    const blended = blendPeriods([
      { patchDistance: 0, wins: 0, games: 0 },
      { patchDistance: 1, wins: 600, games: 1000, discount: 0.1 },
    ]);
    expect(blended.games).toBeCloseTo(1000 * DEFAULT_BLEND.recencyDecay * 0.1, 5);
  });

  it("uses the current patch plus the previous two, with the current patch strongest", () => {
    expect(DEFAULT_BLEND.maxPatchDistance).toBe(2);
    const sparse = 20; // games on a brand-new patch
    const w0 = patchWeight(0, sparse);
    const w1 = patchWeight(1, sparse);
    const w2 = patchWeight(2, sparse);
    const w3 = patchWeight(3, sparse);
    expect(w0).toEqual({ weight: 1, label: "full" });
    expect(w1.weight).toBeLessThan(w0.weight);
    expect(w2.weight).toBeLessThan(w1.weight); // patch -2 below patch -1
    expect(w1.label).toBe("reduced");
    expect(w2.label).toBe("fallback");
    expect(w3).toEqual({ weight: 0, label: "ignored" });
  });

  it("older patches matter more when the current sample is small and fade as it grows", () => {
    const whenSmall = patchWeight(1, 20).weight;
    const whenMedium = patchWeight(1, 200).weight;
    const whenLarge = patchWeight(1, 400).weight;
    expect(whenSmall).toBeGreaterThan(whenMedium);
    expect(whenMedium).toBeGreaterThan(whenLarge);
    expect(whenLarge).toBe(0);
    // A new patch with 20 games leans on 500 games of its predecessor; a mature one does not.
    const young = blendPeriods([{ patchDistance: 0, wins: 10, games: 20 }, { patchDistance: 1, wins: 275, games: 500 }]);
    expect(young.effectiveHistoricalShare).toBeGreaterThan(0.8);
    const mature = blendPeriods([{ patchDistance: 0, wins: 300, games: 600 }, { patchDistance: 1, wins: 275, games: 500 }]);
    expect(mature.effectiveHistoricalShare).toBe(0);
  });

  it("a major rework heavily discounts or removes pre-rework evidence", () => {
    const reworked = blendPeriods([{ patchDistance: 0, wins: 6, games: 10 }, { patchDistance: 1, wins: 450, games: 600, discount: 0.05 }, { patchDistance: 2, wins: 500, games: 700, discount: 0.05 }]);
    const untouched = blendPeriods([{ patchDistance: 0, wins: 6, games: 10 }, { patchDistance: 1, wins: 450, games: 600 }, { patchDistance: 2, wins: 500, games: 700 }]);
    expect(reworked.games).toBeLessThan(untouched.games * 0.1);
    expect(reworked.wins / reworked.games).toBeLessThan(untouched.wins / untouched.games);
  });
});
