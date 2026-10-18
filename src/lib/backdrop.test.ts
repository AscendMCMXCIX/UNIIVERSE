import { describe, expect, it } from "vitest";
import { backdropCss, backdropVars, backdropVisibility } from "./backdrop";
import { DEFAULT_BACKDROP_LEVEL, DEFAULT_BRANDING, parseBranding } from "@/domain/branding";

describe("background visibility", () => {
  it("is part of the team's branding: a whole number from 0 to 100, the default when missing", () => {
    expect(DEFAULT_BRANDING.backdropLevel).toBe(DEFAULT_BACKDROP_LEVEL);
    expect(parseBranding({}).backdropLevel).toBe(DEFAULT_BACKDROP_LEVEL);
    expect(parseBranding({ teamName: "X" }).backdropLevel).toBe(DEFAULT_BACKDROP_LEVEL);
    expect(parseBranding({ backdropLevel: 0 }).backdropLevel).toBe(0);
    expect(parseBranding({ backdropLevel: 75 }).backdropLevel).toBe(75);
    expect(parseBranding({ backdropLevel: 100 }).backdropLevel).toBe(100);
    expect(parseBranding({ backdropLevel: 62.6 }).backdropLevel).toBe(63);
    expect(parseBranding({ backdropLevel: 250 }).backdropLevel).toBe(100);
    expect(parseBranding({ backdropLevel: -5 }).backdropLevel).toBe(0);
    for (const bad of [undefined, null, "75", "abc", Number.NaN, Infinity, {}]) expect(parseBranding({ backdropLevel: bad }).backdropLevel, String(bad)).toBe(DEFAULT_BACKDROP_LEVEL);
  });

  it("runs from a hint of the artwork to clearly visible, never without a veil", () => {
    expect(backdropVars(0)).toEqual({ art: 0.5, veil: 0.88, vignette: 0.6 });
    expect(backdropVars(50)).toEqual({ art: 0.75, veil: 0.58, vignette: 0.425 });
    expect(backdropVars(100)).toEqual({ art: 1, veil: 0.28, vignette: 0.25 });
    // What reaches the eye: about 6%, 32% and 72%, rising with every step.
    expect(backdropVisibility(0)).toBeCloseTo(0.06, 2);
    expect(backdropVisibility(50)).toBeCloseTo(0.315, 2);
    expect(backdropVisibility(100)).toBeCloseTo(0.72, 2);
    for (let l = 1; l <= 100; l++) expect(backdropVisibility(l)).toBeGreaterThan(backdropVisibility(l - 1));
    // 100% is many times the old maximum (0.8 art under half of a 70–90% veil, about 0.35 at best).
    expect(backdropVisibility(100)).toBeGreaterThan(0.6);
    expect(backdropVars(250)).toEqual(backdropVars(100));
    expect(backdropVars(Number.NaN)).toEqual(backdropVars(0));
    expect(backdropCss(50)).toBe(":root{--backdrop-art:0.75;--backdrop-veil:0.58;--backdrop-vignette:0.425}");
  });
});
