import { describe, expect, it } from "vitest";
import {
  applyPreset,
  ART_PLACES,
  artPlacement,
  keepStoredExtras,
  withPlacePosition,
  CARD_FRAMES,
  CARD_PRESETS,
  cardLookFor,
  cleanTagline,
  contrastRatio,
  DEFAULT_CARD_STYLE,
  legacyAccentFor,
  legacyCardStyle,
  normaliseCardStyle,
  PRESET_INFO,
  readableColour,
  resolveCardStyle,
  TAGLINE_MAX,
  taglineProblem,
} from "./card-style";

const SURFACE = "#12131c";

describe("cards saved before the Studio", () => {
  it("look exactly as before: their accent, the original veil and glow, no frame or effects", () => {
    const s = resolveCardStyle(null, "gold");
    expect(s.colours.primary).toBe("#e8b04a");
    expect(s.art).toMatchObject({ source: "champion", focusX: null, focusY: null, zoom: 1, darkness: 50, blur: 0, vignette: 0 });
    expect(s.colours).toMatchObject({ gradient: "none", highlight: 24, border: "subtle" });
    expect(s.frame).toBe("none");
    expect(s.effects).toMatchObject({ glow: false, shimmer: false, drift: false, motif: "none" });
    expect(s.identity).toMatchObject({ tagline: "", emblem: null, nameStyle: "standard", theme: "midnight" });
    // No accent at all: the theme cyan, which keeps following Branding (a CSS variable).
    expect(resolveCardStyle(undefined, null).colours.primary).toBe("#1fc3ff");
    expect(resolveCardStyle(null, "not-an-accent")).toEqual(legacyCardStyle("default"));
  });

  it("a partial saved style keeps the legacy values for whatever it does not set", () => {
    const s = resolveCardStyle({ frame: "double" }, "teal");
    expect(s.frame).toBe("double");
    expect(s.colours.primary).toBe("#2dd4bf");
  });

  it("the look carries the banner URL only when a banner was uploaded", () => {
    expect(cardLookFor({ id: "p1", cardStyle: null, cardAccent: null, cardBannerVersion: null }).bannerUrl).toBeNull();
    expect(cardLookFor({ id: "p1", cardBannerVersion: 123 }).bannerUrl).toBe("/api/card-banners/p1?v=123");
  });
});

describe("validation: only known, bounded values are kept", () => {
  it("drops unknown fields and clamps numbers", () => {
    const s = normaliseCardStyle({ art: { zoom: 9, darkness: 3, blur: -4, vignette: 500, focusX: 140, focusY: -3 }, colours: { highlight: 99 }, effects: { intensity: 1000 }, extra: "x" });
    expect(s.art).toMatchObject({ zoom: 2, darkness: 25, blur: 0, vignette: 80, focusX: 100, focusY: 0 });
    expect(s.colours.highlight).toBe(40);
    expect(s.effects.intensity).toBe(100);
    expect("extra" in s).toBe(false);
  });

  it("never stores CSS, URLs or names as colours or options", () => {
    const s = normaliseCardStyle({
      colours: { primary: "red; background:url(https://evil.example/x.js)", secondary: "#12345", border: "url(x)", avatarFrame: "<script>" },
      frame: "expression(alert(1))",
      art: { source: "javascript:alert(1)" },
      identity: { nameStyle: "font-family: Comic Sans", theme: "light", emblem: "crown" },
      effects: { motif: "../../etc", glow: "yes" },
    });
    expect(s.colours.primary).toBe(DEFAULT_CARD_STYLE.colours.primary);
    expect(s.colours.secondary).toBe(DEFAULT_CARD_STYLE.colours.secondary);
    expect(s.colours.border).toBe("subtle");
    expect(s.colours.avatarFrame).toBe("primary");
    expect(s.frame).toBe("none");
    expect(s.art.source).toBe("champion");
    expect(s.identity.nameStyle).toBe("standard");
    expect(s.identity.theme).toBe("midnight");
    // "crown" is not in the curated emblems (it would read as a rank).
    expect(s.identity.emblem).toBeNull();
    expect(s.effects.motif).toBe("none");
    expect(s.effects.glow).toBe(false);
    expect(normaliseCardStyle({ colours: { primary: "#ABCDEF" } }).colours.primary).toBe("#abcdef");
  });

  it("accepts every frame, and focus can go back to automatic", () => {
    for (const f of CARD_FRAMES) expect(normaliseCardStyle({ frame: f }).frame).toBe(f);
    const base = normaliseCardStyle({ art: { focusX: 30, focusY: 70 } });
    expect(normaliseCardStyle({ art: { focusX: null } }, base).art).toMatchObject({ focusX: null, focusY: 70 });
  });
});

describe("taglines", () => {
  it("are one clean line of plain text, at most 40 characters", () => {
    expect(cleanTagline("  Calm \n in   the\tchaos  ")).toBe("Calm in the chaos");
    // Zero-width, direction overrides and control characters are removed.
    expect(cleanTagline("a\u200bb\u202ec\u0007d\ufeff")).toBe("abcd");
    expect([...cleanTagline("x".repeat(80))].length).toBe(TAGLINE_MAX);
    // Emoji count as one character each and are never split.
    expect(cleanTagline("🔥".repeat(50))).toBe("🔥".repeat(TAGLINE_MAX));
    expect(cleanTagline("")).toBe("");
    // Markup stays text (React renders it as text); nothing is interpreted.
    expect(cleanTagline("<b>bold</b>")).toBe("<b>bold</b>");
  });

  it("cannot claim an official title, a role in the app, a rank or a competitive result", () => {
    for (const t of ["Riot verified", "Official UNIIVERSE pro", "Team admin", "Owner of this team", "Draft Lead", "Challenger jungler", "Diamond 2 support", "Master 1", "850 LP", "Rank 1 Ahri", "World champion"]) expect(taglineProblem(t), t).not.toBeNull();
    for (const t of ["Calm in the chaos", "Gold card enjoyer", "One-trick pony", "Diamond hands", "Master of none", ""]) expect(taglineProblem(t), t).toBeNull();
  });
});

describe("presets", () => {
  it("set the look and keep the player's own content (art, focus, tagline, emblem)", () => {
    const mine = normaliseCardStyle({ art: { source: "banner", focusX: 30, focusY: 60, zoom: 1.4 }, identity: { tagline: "Calm in the chaos", emblem: "flame" } });
    for (const id of CARD_PRESETS) {
      const s = applyPreset(mine, id);
      const p = PRESET_INFO[id].look;
      expect(s.preset).toBe(id);
      expect(s.colours).toEqual(p.colours);
      expect(s.frame).toBe(p.frame);
      expect(s.effects).toEqual(p.effects);
      expect(s.identity).toMatchObject({ tagline: "Calm in the chaos", emblem: "flame", nameStyle: p.nameStyle, theme: p.theme });
      expect(s.art).toMatchObject({ source: "banner", focusX: 30, focusY: 60, zoom: 1.4, darkness: p.darkness });
      // Every preset is itself a valid style.
      expect(normaliseCardStyle(s)).toEqual(s);
    }
  });

  it("the standard preset is the standard card", () => {
    const s = applyPreset(DEFAULT_CARD_STYLE, "uniiverse");
    expect({ ...s, preset: null }).toEqual(DEFAULT_CARD_STYLE);
  });
});

describe("readable colours", () => {
  it("lightens a dark custom colour just enough for text on the card", () => {
    for (const c of ["#000080", "#330000", "#1a1a1a", "#4b0082"]) {
      const r = readableColour(c);
      expect(contrastRatio(r, SURFACE), c).toBeGreaterThanOrEqual(4.5);
    }
    // Already readable: unchanged.
    expect(readableColour("#e8b04a")).toBe("#e8b04a");
    // Every preset's text colour is readable.
    for (const id of CARD_PRESETS) expect(contrastRatio(readableColour(PRESET_INFO[id].look.colours.primary), SURFACE)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps card_accent meaningful for older readers", () => {
    expect(legacyAccentFor(normaliseCardStyle({ colours: { primary: "#e8b04a" } }))).toBe("gold");
    expect(legacyAccentFor(normaliseCardStyle({ colours: { primary: "#1fc3ff" } }))).toBeNull();
    expect(legacyAccentFor(normaliseCardStyle({ colours: { primary: "#123456" } }))).toBeNull();
  });
});

describe("artwork positions of their own (Card Studio, 24 Nov 2026)", () => {
  it("every place uses the shared position until it is given its own; a place left automatic keeps its own framing", () => {
    const s = DEFAULT_CARD_STYLE;
    expect(artPlacement(s, "header")).toEqual({ focusX: 50, focusY: 25, zoom: 1, own: false });
    expect(artPlacement(s, "card")).toEqual({ focusX: 50, focusY: 22, zoom: 1, own: false });
    const shared = normaliseCardStyle({ art: { focusX: 30, focusY: 60, zoom: 1.4 } });
    for (const place of ART_PLACES) expect(artPlacement(shared, place)).toEqual({ focusX: 30, focusY: 60, zoom: 1.4, own: false });
    const own = withPlacePosition(shared, "headerPhone", { focusX: 70, focusY: 10, zoom: 1.2 });
    expect(artPlacement(own, "headerPhone")).toEqual({ focusX: 70, focusY: 10, zoom: 1.2, own: true });
    expect(artPlacement(own, "header")).toEqual({ focusX: 30, focusY: 60, zoom: 1.4, own: false });
    // Back to the shared position: the place is gone, and with it the whole field when none is left.
    const back = withPlacePosition(own, "headerPhone", null);
    expect(back.art.places).toBeUndefined();
    expect("places" in back.art).toBe(false);
  });

  it("a focus set on one axis draws the other axis exactly as cards always did (20% down; 25% on a row's strip)", () => {
    const s = normaliseCardStyle({ art: { focusX: 10, focusY: null } });
    expect(artPlacement(s, "card")).toMatchObject({ focusX: 10, focusY: 20 });
    expect(artPlacement(s, "header")).toMatchObject({ focusX: 10, focusY: 20 });
    expect(artPlacement(s, "row")).toMatchObject({ focusX: 10, focusY: 25 });
  });

  it("validation keeps known places only, clamped, and never lets anything else in", () => {
    const s = normaliseCardStyle({ art: { places: { header: { focusX: 140, focusY: -5, zoom: 9 }, card: { focusX: "50%", focusY: 1 }, nowhere: { focusX: 1, focusY: 1, zoom: 1 }, peek: { focusX: 20.4, focusY: 80, zoom: 1.33, css: "url(x)" } } } });
    expect(s.art.places).toEqual({ header: { focusX: 100, focusY: 0, zoom: 2 }, peek: { focusX: 20, focusY: 80, zoom: 1.35 } });
    expect(normaliseCardStyle({ art: { places: "header" } }).art.places).toBeUndefined();
    expect(normaliseCardStyle({ art: { places: {} } }).art).not.toHaveProperty("places");
  });

  it("a save without the field keeps the stored places; an empty one removes them all", () => {
    const stored = normaliseCardStyle({ art: { places: { row: { focusX: 5, focusY: 5, zoom: 1 } } } });
    expect(normaliseCardStyle({ frame: "double" }, stored).art.places).toEqual({ row: { focusX: 5, focusY: 5, zoom: 1 } });
    expect(normaliseCardStyle({ art: { places: {} } }, stored).art).not.toHaveProperty("places");
  });

  it("presets and the standard look never touch the artwork's positions", () => {
    const s = withPlacePosition(normaliseCardStyle({ art: { focusX: 12, focusY: 34, zoom: 1.5 } }), "cardPhone", { focusX: 1, focusY: 2, zoom: 1.1 });
    for (const id of CARD_PRESETS) {
      const p = applyPreset(s, id);
      expect(p.art).toMatchObject({ focusX: 12, focusY: 34, zoom: 1.5, places: { cardPhone: { focusX: 1, focusY: 2, zoom: 1.1 } } });
    }
  });
});

describe("saved styles load, render and save exactly as before", () => {
  // Today's stored shapes: what normaliseCardStyle has written since migration 0032 (no style at all,
  // a partial style from an early save, and full styles), and a style a newer version wrote.
  const storedShapes: Array<[string, unknown, string | null]> = [
    ["never saved (the legacy accent)", null, "gold"],
    ["a partial early save", { frame: "double", colours: { primary: "#2dd4bf" } }, "teal"],
    ["the standard card", DEFAULT_CARD_STYLE, null],
    ["a full style with a focus and effects", normaliseCardStyle({ art: { source: "banner", focusX: 33, focusY: null, zoom: 1.65, darkness: 70, blur: 4, vignette: 35 }, colours: { primary: "#ff4fd8", secondary: "#1fc3ff", gradient: "radial", highlight: 31, border: "gradient", avatarFrame: "gradient" }, frame: "premium", identity: { tagline: "Calm in the chaos", emblem: "flame", nameStyle: "wide", theme: "tinted" }, effects: { glow: true, shimmer: true, drift: true, motif: "rings", intensity: 77 }, preset: "neon" }), null],
    ["every preset", applyPreset(DEFAULT_CARD_STYLE, "arcane"), "violet"],
  ];

  /** The Studio's round trip: load (resolve), edit nothing, Save (the client sends places, the server normalises and keeps what it cannot read), load again. */
  function roundTrip(stored: unknown, accent: string | null) {
    const loaded = resolveCardStyle(stored, accent);
    const submitted = { ...loaded, art: { ...loaded.art, places: loaded.art.places ?? {} } };
    const next = normaliseCardStyle(JSON.parse(JSON.stringify(submitted)), resolveCardStyle(stored, accent));
    const written = JSON.parse(JSON.stringify(keepStoredExtras(stored, next)));
    return { loaded, written, reloaded: resolveCardStyle(written, accent) };
  }

  for (const [name, stored, accent] of storedShapes)
    it(name, () => {
      const { loaded, written, reloaded } = roundTrip(stored, accent);
      expect(reloaded).toEqual(loaded);
      // A stored full style is written back byte for byte (no field added, none dropped).
      if (stored && typeof stored === "object" && "art" in stored) expect(written).toEqual(JSON.parse(JSON.stringify(stored)));
      expect(written.art).not.toHaveProperty("places");
    });

  it("a style with places of its own keeps them", () => {
    const stored = JSON.parse(JSON.stringify(withPlacePosition(DEFAULT_CARD_STYLE, "header", { focusX: 40, focusY: 10, zoom: 1.25 })));
    const { written } = roundTrip(stored, null);
    expect(written).toEqual(stored);
  });

  it("fields a newer version stored are kept on save, and nothing submitted that is unknown is", () => {
    const stored = { ...JSON.parse(JSON.stringify(DEFAULT_CARD_STYLE)), badge: { kind: "future" }, art: { ...DEFAULT_CARD_STYLE.art, parallax: 0.3 } };
    const next = normaliseCardStyle({ ...stored, frame: "angular", sneaky: "<script>", art: { ...stored.art, inject: "url(x)" } }, resolveCardStyle(stored, null));
    const written = keepStoredExtras(stored, next) as Record<string, unknown> & { art: Record<string, unknown> };
    expect(written.frame).toBe("angular");
    expect(written.badge).toEqual({ kind: "future" });
    expect(written.art.parallax).toBe(0.3);
    expect(written).not.toHaveProperty("sneaky");
    expect(written.art).not.toHaveProperty("inject");
  });
});
