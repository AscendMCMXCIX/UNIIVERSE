import { describe, expect, it } from "vitest";
import { metSides, standoutText } from "./tip-words";

describe("tooltip templates read right on anyone's page", () => {
  it("the Met chip names the sides without 'your' (H22)", () => {
    const t = metSides({ opponent: 3, ally: 1 });
    expect(t).toBe("3 against, 1 on the same team");
    expect(t).not.toMatch(/\byour?\b/i);
  });
  it("the Best chip says the player's figure without 'your' (H12)", () => {
    const t = standoutText({ label: "vision/min", games: 22, queue: "ranked", role: "Support", value: "1.9", top: "1.6" });
    expect(t).toBe("Best vision/min in the last 22 ranked games as Support: 1.9 (previous best 1.6)");
    expect(t).not.toMatch(/\byour?\b/i);
  });
});

describe("names that replaced hover-only or meaningless titles", () => {
  it("a Card Studio swatch is named by its palette, never its hex code (S15)", async () => {
    const { CARD_PALETTES, swatchName } = await import("@/domain/card-style");
    expect(swatchName(CARD_PALETTES[0]!.primary)).toBe("Signature");
    expect(swatchName("#58a8f2")).toBe("Signature, second colour");
    expect(swatchName("#123456")).toBe("Custom colour");
    for (const p of CARD_PALETTES) expect(swatchName(p.primary)).not.toMatch(/#/);
  });
});

describe("reasons shown, not hidden in a title", () => {
  it("a failed save says why beside 'Unable to save' (G15)", async () => {
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { SaveStatusIndicator } = await import("@/components/ui/save-status");
    const html = renderToStaticMarkup(createElement(SaveStatusIndicator, { status: "error", error: "The champion list changed meanwhile." }));
    expect(html).toContain("Unable to save<span data-testid=\"save-error\">: The champion list changed meanwhile.</span>");
    expect(html).not.toContain("title=");
  });
});
