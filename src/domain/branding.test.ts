import { describe, expect, it } from "vitest";
import { contrastText, DEFAULT_BRANDING, lightenHex, parseBranding } from "./branding";

describe("branding", () => {
  it("falls back to defaults for anything invalid and keeps valid values", () => {
    expect(parseBranding(null)).toEqual(DEFAULT_BRANDING);
    const b = parseBranding({ teamName: "  Team Rocket ", shortName: "rocket", tagline: "to the moon", accent: "#FF8800", logoDataUrl: "data:image/png;base64,iVBORw0KGgo=" });
    expect(b.teamName).toBe("Team Rocket");
    expect(b.shortName).toBe("ROCKET");
    expect(b.accent).toBe("#ff8800");
    expect(b.logoDataUrl).toMatch(/^data:image\/png/);
    expect(parseBranding({ accent: "red", logoDataUrl: "javascript:alert(1)" })).toMatchObject({ accent: DEFAULT_BRANDING.accent, logoDataUrl: null });
    expect(parseBranding({ logoDataUrl: `data:image/png;base64,${"A".repeat(300_000)}` }).logoDataUrl).toBeNull();
  });
  it("derives a lighter accent and a readable text colour", () => {
    expect(lightenHex("#000000", 0.5)).toBe("#808080");
    expect(lightenHex("#c8aa6e", 0)).toBe("#c8aa6e");
    expect(contrastText("#ffffff")).toBe("#111111");
    expect(contrastText("#102030")).toBe("#ffffff");
  });
});
