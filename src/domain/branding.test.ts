import { describe, expect, it } from "vitest";
import { brandThemeCss, brandThemeVars, checkContrast, contrastRatio, contrastText, controlEdge, DEFAULT_BRANDING, DEFAULT_COLOURS, lightenHex, logoSrc, logoStillSrc, NEUTRAL_NAME, parseBranding, resetLook } from "./branding";

describe("branding", () => {
  it("falls back to defaults for anything invalid and keeps valid values", () => {
    expect(parseBranding(null)).toEqual(DEFAULT_BRANDING);
    const b = parseBranding({ teamName: "  Team Rocket ", shortName: "rocket", tagline: "to the moon", accent: "#FF8800", surface: "#202020", highlight: "nope" });
    expect(b.teamName).toBe("Team Rocket");
    expect(b.shortName).toBe("ROCKET");
    expect(b.accent).toBe("#ff8800");
    expect(b.surface).toBe("#202020");
    expect(b.highlight).toBeNull();
    // The old inline logo is no longer part of the settings (it moved to its own table).
    expect(parseBranding({ accent: "red", logoDataUrl: "data:image/png;base64,AAAA" })).not.toHaveProperty("logoDataUrl");
  });

  it("starts a new install with neutral names, and keeps an app name of its own", () => {
    expect(DEFAULT_BRANDING).toMatchObject({ productName: NEUTRAL_NAME, teamName: NEUTRAL_NAME, shortName: NEUTRAL_NAME.toUpperCase() });
    expect(NEUTRAL_NAME).not.toMatch(/uniiverse/i);
    expect(parseBranding({ productName: "  Rocket Hub " }).productName).toBe("Rocket Hub");
    expect(parseBranding({ productName: "   " }).productName).toBe(NEUTRAL_NAME);
    expect(parseBranding({ productName: "x".repeat(60) }).productName).toHaveLength(40);
  });

  it("a reset restores colours and background visibility but never the names", () => {
    const own = parseBranding({ productName: "UNIIVERSE", teamName: "UNIIVERSE", shortName: "UNV", tagline: "Since 2024", accent: "#ff8800", surface: "#202020", backdropLevel: 80 });
    const reset = resetLook(own);
    expect(reset).toMatchObject({ productName: "UNIIVERSE", teamName: "UNIIVERSE", shortName: "UNV", tagline: "Since 2024" });
    expect(reset).toMatchObject({ accent: DEFAULT_BRANDING.accent, surface: null, backdropLevel: DEFAULT_BRANDING.backdropLevel });
  });

  it("shows no tagline unless one is entered", () => {
    expect(parseBranding({}).tagline).toBe("");
    expect(parseBranding({ tagline: "   " }).tagline).toBe("");
  });

  it("uses a still frame for animated logos where animation is not wanted", () => {
    // No uploaded logo, no image: the name is shown as text instead (no stock artwork).
    expect(logoSrc(DEFAULT_BRANDING)).toBeNull();
    expect(logoStillSrc(DEFAULT_BRANDING)).toBeNull();
    const gif = { ...DEFAULT_BRANDING, assets: { logo: { version: 42, animated: true, hasStatic: true }, background: null, appBackground: null } };
    expect(logoSrc(gif)).toBe("/api/branding/logo?v=42");
    expect(logoStillSrc(gif)).toBe("/api/branding/logo-static?v=42");
    const png = { ...DEFAULT_BRANDING, assets: { logo: { version: 7, animated: false, hasStatic: false }, background: null, appBackground: null } };
    expect(logoStillSrc(png)).toBe("/api/branding/logo?v=7");
  });

  it("checks contrast with the WCAG formula and refuses unreadable colours", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(checkContrast(DEFAULT_BRANDING).every((c) => c.ok)).toBe(true);
    const light = checkContrast({ ...DEFAULT_BRANDING, background: "#f0f0f0" });
    expect(light.find((c) => c.key === "background")!.ok).toBe(false);
    const dimAccent = checkContrast({ ...DEFAULT_BRANDING, accent: "#151a40" });
    expect(dimAccent.find((c) => c.key === "accent")!.ok).toBe(false);
  });

  it("emits theme variables only for changed colours, derived shades from the surface", () => {
    expect(brandThemeCss(DEFAULT_BRANDING)).toBe("");
    const css = brandThemeCss({ ...DEFAULT_BRANDING, accent: "#ff8800", surface: "#202020" });
    expect(css).toMatch(/^:root\{/);
    expect(css).toContain("--color-accent:#ff8800");
    expect(css).toContain("--color-surface-2:color-mix(in srgb, #202020 94%, #ffffff)");
    expect(css).not.toContain("--color-bg:");
  });

  it("gives fields and toolbar controls an edge of 3:1 or more on a custom page and panel colour", () => {
    for (const [surface, background] of [["#202020", "#000000"], ["#10163a", "#080c24"], ["#2a1a40", "#140c22"], ["#16181d", "#0d0e12"]] as const) {
      const edge = controlEdge(surface, background);
      for (const on of [surface, background, lightenHex(surface, 0.06)]) expect(contrastRatio(edge, on)).toBeGreaterThanOrEqual(3);
    }
    const vars = brandThemeVars({ ...DEFAULT_BRANDING, background: "#140c22" });
    expect(vars["--color-border-control"]).toBe(controlEdge(DEFAULT_COLOURS.surface, "#140c22"));
    expect(vars["--color-bg-elevated"]).toBeUndefined();
  });

  it("derives a lighter accent and a readable text colour", () => {
    expect(lightenHex("#000000", 0.5)).toBe("#808080");
    expect(lightenHex("#c8aa6e", 0)).toBe("#c8aa6e");
    expect(contrastText("#ffffff")).toBe("#111111");
    expect(contrastText("#102030")).toBe("#ffffff");
  });
});
