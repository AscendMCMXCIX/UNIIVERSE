import { describe, expect, it } from "vitest";
import { cardColourVars, cardShellStyle, nameParts } from "./card-look";
import { DEFAULT_CARD_STYLE, applyPreset } from "@/domain/card-style";

describe("nameParts: where a long word of a card name may break", () => {
  it("leaves a name without a long word whole", () => {
    expect(nameParts("Demo Support")).toEqual(["Demo Support"]);
    expect(nameParts("Valkyrie of the Endless Twilight")).toEqual(["Valkyrie of the Endless Twilight"]);
  });

  it("breaks a long word where its parts meet: a capital after a small letter, letters and digits", () => {
    expect(nameParts("XxShadowAssassinOfTheVoidxX2026")).toEqual(["Xx", "Shadow", "Assassin", "Of", "The", "Voidx", "X", "2026"]);
    expect(nameParts("NightHunter99 main")).toEqual(["Night", "Hunter", "99 main"]);
  });

  it("keeps every character, in order, so the text itself never changes", () => {
    for (const name of ["XxShadowAssassinOfTheVoidxX2026", "ŜtëllàrŴïndwàlkér 星の守護者 ✦", "ALLCAPSNAMEWITHOUTSEAMS"]) expect(nameParts(name).join("")).toBe(name);
  });

  it("reads letters beyond ASCII", () => {
    expect(nameParts("ŜtëllàrŴïndwàlkér")).toEqual(["Ŝtëllàr", "Ŵïndwàlkér"]);
  });
});

describe("cardColourVars: a player's colours for a row that shows their name without their card", () => {
  const standard = { style: DEFAULT_CARD_STYLE, bannerUrl: null };
  const competitive = { style: applyPreset(DEFAULT_CARD_STYLE, "competitive"), bannerUrl: null };

  it("sets the three colour variables and nothing else (no surface, border or glow)", () => {
    expect(Object.keys(cardColourVars(competitive)).sort()).toEqual(["--card-accent", "--card-primary", "--card-secondary"]);
    expect(cardColourVars(competitive)).toMatchObject({ "--card-primary": "#e8b04a", "--card-secondary": "#5f8ff5" });
    expect(cardColourVars(null)).toEqual({});
  });

  it("gives the same variables as the card's own shell style, so a row and a card agree on the colour", () => {
    for (const look of [standard, competitive]) {
      const shell = cardShellStyle(look) as Record<string, unknown>;
      for (const [k, v] of Object.entries(cardColourVars(look))) expect(shell[k]).toBe(v);
    }
  });

  it("keeps the theme accent as a variable for the standard look, so Branding can retheme it", () => {
    expect(cardColourVars(standard)).toMatchObject({ "--card-accent": "var(--color-accent)" });
  });
});
