import { describe, expect, it } from "vitest";
import { backdropCss, backdropVars } from "./backdrop";
import { DEFAULT_BACKDROP_LEVEL, DEFAULT_BRANDING, parseBranding } from "@/domain/branding";

describe("Team Overview background visibility", () => {
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

  it("shows more artwork under a lighter veil as the level rises, never without a veil", () => {
    expect(backdropVars(0)).toEqual({ art: 0.12, veil: 1 });
    expect(backdropVars(50)).toEqual({ art: 0.46, veil: 0.75 });
    expect(backdropVars(100)).toEqual({ art: 0.8, veil: 0.5 });
    // The default is clearly more visible than the standard backdrop (0.3 under a full veil).
    expect(backdropVars(DEFAULT_BACKDROP_LEVEL).art).toBeGreaterThan(0.3);
    expect(backdropVars(250)).toEqual(backdropVars(100));
    expect(backdropCss(50)).toBe(":root{--backdrop-art:0.46;--backdrop-veil:0.75;--backdrop-vignette:1}");
  });
});
