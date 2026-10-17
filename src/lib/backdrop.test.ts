import { describe, expect, it } from "vitest";
import { BACKDROP_DEFAULT, backdropCss, backdropVars, parseBackdropLevel } from "./backdrop";

describe("Team Overview background visibility", () => {
  it("reads a stored level, falling back to the default for anything else", () => {
    expect(parseBackdropLevel("0")).toBe(0);
    expect(parseBackdropLevel("75")).toBe(75);
    expect(parseBackdropLevel("100")).toBe(100);
    for (const bad of [undefined, null, "", "101", "-5", "50.5", "abc", "1000", "50;x"]) expect(parseBackdropLevel(bad), String(bad)).toBe(BACKDROP_DEFAULT);
  });

  it("shows more artwork under a lighter veil as the level rises, never without a veil", () => {
    expect(backdropVars(0)).toEqual({ art: 0.12, veil: 1 });
    expect(backdropVars(50)).toEqual({ art: 0.46, veil: 0.75 });
    expect(backdropVars(100)).toEqual({ art: 0.8, veil: 0.5 });
    // The default is clearly more visible than the standard backdrop (0.3 under a full veil).
    expect(backdropVars(BACKDROP_DEFAULT).art).toBeGreaterThan(0.3);
    expect(backdropVars(250)).toEqual(backdropVars(100));
    expect(backdropCss(50)).toBe(":root{--backdrop-art:0.46;--backdrop-veil:0.75;--backdrop-vignette:1}");
  });
});
