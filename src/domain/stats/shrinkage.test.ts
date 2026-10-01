import { describe, expect, it } from "vitest";
import { blendPeriods, confidenceLabel, shrinkRate, wilsonInterval } from "./shrinkage";

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
    expect(blended.games).toBeCloseTo(1000 * 0.55 * 0.1, 5);
  });
});
