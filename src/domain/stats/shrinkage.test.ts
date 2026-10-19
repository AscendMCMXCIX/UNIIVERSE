import { describe, expect, it } from "vitest";
import { shrinkRate } from "./shrinkage";

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
  });
});
