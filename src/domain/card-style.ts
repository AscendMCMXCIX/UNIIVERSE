import { ACCENT_COLOR, isCardAccent, type CardAccent } from "./player-card";

/*
  Player Card Studio: everything a player can personalise on their card beyond the featured
  champion and skin (which stay in players.featured_champion_id / featured_skin_num). One JSON
  value per player (players.card_style), read by every card: Team, Players and the profile
  header.

  - Only known options are kept: every field is clamped or checked against a fixed list, so a
    stored or submitted value can never carry CSS, HTML or a URL. Colours are #rrggbb only.
  - A player without a saved style gets `legacyCardStyle(card_accent)`, which draws the card
    exactly as before this feature (same veil, same accent glow, no frame or effects).
  - Decoration never changes a card's size: frames and effects are drawn on top as overlays and
    shadows, and the tagline has one fixed line.
*/

export const ART_SOURCES = ["champion", "banner", "none"] as const;
export const CARD_GRADIENTS = ["none", "diagonal", "horizontal", "radial"] as const;
export const BORDER_SOURCES = ["subtle", "primary", "secondary", "gradient"] as const;
export const AVATAR_FRAMES = ["primary", "secondary", "gradient", "neutral", "none"] as const;
export const CARD_FRAMES = ["none", "minimal", "outline", "double", "angular", "glow", "premium"] as const;
export const NAME_STYLES = ["standard", "bold", "wide", "italic"] as const;
export const CARD_THEMES = ["midnight", "deep", "tinted"] as const;
export const CARD_MOTIFS = ["none", "corners", "lines", "dots", "rings"] as const;
/** Curated personal emblems (icons drawn by the app). Nothing that reads as a rank, trophy or role. */
export const CARD_EMBLEMS = ["flame", "bolt", "sparkles", "star", "moon", "sun", "leaf", "snowflake", "waves", "mountain", "feather", "heart", "ghost", "skull", "swords", "shield", "crosshair", "target", "rocket", "eye", "anchor", "music", "coffee", "paw"] as const;

export type ArtSource = (typeof ART_SOURCES)[number];
export type CardGradient = (typeof CARD_GRADIENTS)[number];
export type BorderSource = (typeof BORDER_SOURCES)[number];
export type AvatarFrame = (typeof AVATAR_FRAMES)[number];
export type CardFrame = (typeof CARD_FRAMES)[number];
export type NameStyle = (typeof NAME_STYLES)[number];
export type CardTheme = (typeof CARD_THEMES)[number];
export type CardMotif = (typeof CARD_MOTIFS)[number];
export type CardEmblem = (typeof CARD_EMBLEMS)[number];

export interface CardStyle {
  art: {
    source: ArtSource;
    /** Focal point in % of the image; null = each card's own default framing. */
    focusX: number | null;
    focusY: number | null;
    /** 1 = cover; up to 2× crop-in around the focal point. */
    zoom: number;
    /** Darkness of the readability veil, 25–90 (50 = the original card). */
    darkness: number;
    /** Background blur in px, 0–12. */
    blur: number;
    /** Edge vignette, 0–80. */
    vignette: number;
  };
  colours: {
    primary: string;
    secondary: string;
    /** Colour wash over the art from primary to secondary. */
    gradient: CardGradient;
    /** Strength of the accent highlight in the top corner, 0–40 (24 = the original card). */
    highlight: number;
    border: BorderSource;
    avatarFrame: AvatarFrame;
  };
  frame: CardFrame;
  identity: {
    tagline: string;
    emblem: CardEmblem | null;
    nameStyle: NameStyle;
    theme: CardTheme;
  };
  effects: {
    glow: boolean;
    shimmer: boolean;
    /** Slow drift of the colour wash (only with a gradient). */
    drift: boolean;
    motif: CardMotif;
    /** 0–100, scales every effect. */
    intensity: number;
  };
  /** The preset the card started from, for the Studio's "based on" label; never required. */
  preset: CardPresetId | null;
}

export const TAGLINE_MAX = 40;

const HEX = /^#[0-9a-f]{6}$/i;
const LEGACY_HEX: Record<CardAccent, string> = { default: "#1fc3ff", gold: "#e8b04a", teal: "#2dd4bf", violet: "#a78bfa", rose: "#fb7185" };
const SECONDARY_FOR: Record<CardAccent, string> = { default: "#58a8f2", gold: "#e0566b", teal: "#5f8ff5", violet: "#fb7185", rose: "#a78bfa" };

/** The card as it looked before the Studio, for a player who has never saved a style. */
export function legacyCardStyle(accent: string | null | undefined): CardStyle {
  const a: CardAccent = isCardAccent(accent) ? accent : "default";
  return {
    art: { source: "champion", focusX: null, focusY: null, zoom: 1, darkness: 50, blur: 0, vignette: 0 },
    colours: { primary: LEGACY_HEX[a], secondary: SECONDARY_FOR[a], gradient: "none", highlight: 24, border: "subtle", avatarFrame: "primary" },
    frame: "none",
    identity: { tagline: "", emblem: null, nameStyle: "standard", theme: "midnight" },
    effects: { glow: false, shimmer: false, drift: false, motif: "none", intensity: 50 },
    preset: null,
  };
}

export const DEFAULT_CARD_STYLE: CardStyle = legacyCardStyle("default");

// ── Presets ─────────────────────────────────────────────────────────────────────────────────────

export const CARD_PRESETS = ["uniiverse", "minimal", "competitive", "arcane", "crimson", "monochrome", "neon"] as const;
export type CardPresetId = (typeof CARD_PRESETS)[number];

/**
 * A preset sets the look (colours, frame, effects, name style, theme, veil) and leaves the
 * player's own content alone: champion and skin, banner, focal point, tagline and emblem.
 */
type PresetLook = { colours: CardStyle["colours"]; frame: CardFrame; effects: CardStyle["effects"]; nameStyle: NameStyle; theme: CardTheme; darkness: number; blur: number; vignette: number };

export const PRESET_INFO: Record<CardPresetId, { label: string; description: string; look: PresetLook }> = {
  uniiverse: {
    label: "Standard",
    description: "The standard card: brand cyan, no frame.",
    look: { colours: DEFAULT_CARD_STYLE.colours, frame: "none", effects: DEFAULT_CARD_STYLE.effects, nameStyle: "standard", theme: "midnight", darkness: 50, blur: 0, vignette: 0 },
  },
  minimal: {
    label: "Minimal",
    description: "Quiet and clean: soft slate, thin line, no effects.",
    look: { colours: { primary: "#9aa8d4", secondary: "#58a8f2", gradient: "none", highlight: 10, border: "subtle", avatarFrame: "neutral" }, frame: "minimal", effects: { glow: false, shimmer: false, drift: false, motif: "none", intensity: 30 }, nameStyle: "standard", theme: "deep", darkness: 58, blur: 0, vignette: 10 },
  },
  competitive: {
    label: "Competitive",
    description: "Sharp gold and blue with angular corners.",
    look: { colours: { primary: "#e8b04a", secondary: "#5f8ff5", gradient: "diagonal", highlight: 28, border: "primary", avatarFrame: "primary" }, frame: "angular", effects: { glow: false, shimmer: false, drift: false, motif: "lines", intensity: 40 }, nameStyle: "wide", theme: "midnight", darkness: 55, blur: 0, vignette: 25 },
  },
  arcane: {
    label: "Arcane",
    description: "Violet and teal magic with a soft glow.",
    look: { colours: { primary: "#a78bfa", secondary: "#2dd4bf", gradient: "radial", highlight: 32, border: "gradient", avatarFrame: "gradient" }, frame: "glow", effects: { glow: true, shimmer: false, drift: true, motif: "rings", intensity: 55 }, nameStyle: "italic", theme: "tinted", darkness: 52, blur: 0, vignette: 30 },
  },
  crimson: {
    label: "Crimson",
    description: "Deep red with a double line.",
    look: { colours: { primary: "#f05a6e", secondary: "#e8b04a", gradient: "diagonal", highlight: 30, border: "primary", avatarFrame: "primary" }, frame: "double", effects: { glow: false, shimmer: false, drift: false, motif: "corners", intensity: 45 }, nameStyle: "bold", theme: "tinted", darkness: 56, blur: 0, vignette: 35 },
  },
  monochrome: {
    label: "Monochrome",
    description: "Black, white and grey: the art in a soft blur.",
    look: { colours: { primary: "#e8edfb", secondary: "#7b89b9", gradient: "none", highlight: 12, border: "primary", avatarFrame: "neutral" }, frame: "outline", effects: { glow: false, shimmer: false, drift: false, motif: "dots", intensity: 30 }, nameStyle: "wide", theme: "deep", darkness: 62, blur: 3, vignette: 40 },
  },
  neon: {
    label: "Neon",
    description: "Electric pink and cyan with a shimmer.",
    look: { colours: { primary: "#ff4fd8", secondary: "#1fc3ff", gradient: "horizontal", highlight: 36, border: "gradient", avatarFrame: "gradient" }, frame: "premium", effects: { glow: true, shimmer: true, drift: true, motif: "lines", intensity: 60 }, nameStyle: "bold", theme: "tinted", darkness: 54, blur: 0, vignette: 20 },
  },
};

export function applyPreset(style: CardStyle, id: CardPresetId): CardStyle {
  const p = PRESET_INFO[id].look;
  return normaliseCardStyle({
    ...style,
    art: { ...style.art, darkness: p.darkness, blur: p.blur, vignette: p.vignette },
    colours: { ...p.colours },
    frame: p.frame,
    effects: { ...p.effects },
    identity: { ...style.identity, nameStyle: p.nameStyle, theme: p.theme },
    preset: id,
  });
}

/** Colour palettes offered as one-tap pairs (custom colours remain available). */
export const CARD_PALETTES: Array<{ label: string; primary: string; secondary: string }> = [
  { label: "Signature", primary: "#1fc3ff", secondary: "#58a8f2" },
  { label: "Gold rush", primary: "#e8b04a", secondary: "#e0566b" },
  { label: "Lagoon", primary: "#2dd4bf", secondary: "#5f8ff5" },
  { label: "Amethyst", primary: "#a78bfa", secondary: "#fb7185" },
  { label: "Rose", primary: "#fb7185", secondary: "#a78bfa" },
  { label: "Ember", primary: "#ff8a3d", secondary: "#f05a6e" },
  { label: "Forest", primary: "#4ade80", secondary: "#2dd4bf" },
  { label: "Ice", primary: "#bae6fd", secondary: "#818cf8" },
  { label: "Neon", primary: "#ff4fd8", secondary: "#1fc3ff" },
  { label: "Slate", primary: "#9aa8d4", secondary: "#e8edfb" },
];

// ── Validation ──────────────────────────────────────────────────────────────────────────────────

const clamp = (v: unknown, lo: number, hi: number, fallback: number, step = 1) => {
  const n = typeof v === "number" && Number.isFinite(v) ? v : fallback;
  const c = Math.min(hi, Math.max(lo, n));
  return Number((Math.round(c / step) * step).toFixed(2));
};
const pick = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => (typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : fallback);
const hex = (v: unknown, fallback: string) => (typeof v === "string" && HEX.test(v) ? v.toLowerCase() : fallback);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/**
 * Bring any stored or submitted value to a valid style: unknown fields are dropped, numbers are
 * clamped, lists checked, colours must be #rrggbb, the tagline is cleaned (see cleanTagline).
 * `base` supplies whatever is missing (the legacy look for old cards).
 */
export function normaliseCardStyle(input: unknown, base: CardStyle = DEFAULT_CARD_STYLE): CardStyle {
  const s = obj(input);
  const art = obj(s.art);
  const col = obj(s.colours);
  const id = obj(s.identity);
  const fx = obj(s.effects);
  const focus = (v: unknown, b: number | null) => (v === null ? null : typeof v === "number" ? clamp(v, 0, 100, 50) : b);
  return {
    art: {
      source: pick(art.source, ART_SOURCES, base.art.source),
      focusX: focus(art.focusX, base.art.focusX),
      focusY: focus(art.focusY, base.art.focusY),
      zoom: clamp(art.zoom, 1, 2, base.art.zoom, 0.05),
      darkness: clamp(art.darkness, 25, 90, base.art.darkness),
      blur: clamp(art.blur, 0, 12, base.art.blur),
      vignette: clamp(art.vignette, 0, 80, base.art.vignette),
    },
    colours: {
      primary: hex(col.primary, base.colours.primary),
      secondary: hex(col.secondary, base.colours.secondary),
      gradient: pick(col.gradient, CARD_GRADIENTS, base.colours.gradient),
      highlight: clamp(col.highlight, 0, 40, base.colours.highlight),
      border: pick(col.border, BORDER_SOURCES, base.colours.border),
      avatarFrame: pick(col.avatarFrame, AVATAR_FRAMES, base.colours.avatarFrame),
    },
    frame: pick(s.frame, CARD_FRAMES, base.frame),
    identity: {
      tagline: typeof id.tagline === "string" ? cleanTagline(id.tagline) : base.identity.tagline,
      emblem: id.emblem === null ? null : pick(id.emblem, CARD_EMBLEMS, base.identity.emblem as CardEmblem) ?? null,
      nameStyle: pick(id.nameStyle, NAME_STYLES, base.identity.nameStyle),
      theme: pick(id.theme, CARD_THEMES, base.identity.theme),
    },
    effects: {
      glow: typeof fx.glow === "boolean" ? fx.glow : base.effects.glow,
      shimmer: typeof fx.shimmer === "boolean" ? fx.shimmer : base.effects.shimmer,
      drift: typeof fx.drift === "boolean" ? fx.drift : base.effects.drift,
      motif: pick(fx.motif, CARD_MOTIFS, base.effects.motif),
      intensity: clamp(fx.intensity, 0, 100, base.effects.intensity),
    },
    preset: s.preset === null ? null : pick(s.preset, CARD_PRESETS, base.preset as CardPresetId) ?? null,
  };
}

/** The style a card is drawn with: the saved one, else the look from before the Studio. */
export function resolveCardStyle(saved: unknown, legacyAccent: string | null | undefined): CardStyle {
  const legacy = legacyCardStyle(legacyAccent);
  return saved && typeof saved === "object" ? normaliseCardStyle(saved, legacy) : legacy;
}

/**
 * Tagline text: plain text only. Control, zero-width and direction-override characters are
 * removed, whitespace collapsed, and the result cut to TAGLINE_MAX characters. React renders it
 * as text, so markup is never interpreted.
 */
export function cleanTagline(raw: string): string {
  const text = raw
    .normalize("NFC")
    // Whitespace (tabs and new lines included) becomes one space first; other invisible characters go.
    .replace(/\s+/g, " ")
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g, "")
    .trim();
  return [...text].slice(0, TAGLINE_MAX).join("");
}

/**
 * A tagline may not pose as something the app or Riot grants: an official title, a staff or
 * permission role, or a rank or ladder result. Returns the reason, or null when it is fine.
 */
export function taglineProblem(tagline: string): string | null {
  const t = tagline.toLowerCase();
  if (/\b(riot|official|verified|moderator|administrator|admin|staff|owner|draft lead|team leader)\b/.test(t)) return "Taglines can't claim an official title or a role in the app.";
  if (/\b(iron|bronze|silver|gold|platinum|plat|emerald|diamond|master|grandmaster|challenger)\s*(i{1,3}|iv|[1-4])\b/.test(t) || /\b(grandmaster|challenger)\b/.test(t) || /\b\d{2,4}\s*lp\b/.test(t) || /\b(rank|ranked)\s*#?\s*1\b/.test(t) || /\bworld champion|world champions|msi champion|worlds winner\b/.test(t))
    return "Taglines can't show a rank or a competitive result: those come from Riot data.";
  return null;
}

// ── Colour helpers ──────────────────────────────────────────────────────────────────────────────

const SURFACE = "#10163a";

function rgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function luminance(h: string): number {
  const [r, g, b] = rgb(h).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrastRatio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}
function mixWithWhite(h: string, t: number): string {
  return `#${rgb(h)
    .map((c) => Math.round(c + (255 - c) * t).toString(16).padStart(2, "0"))
    .join("")}`;
}

/**
 * A colour for text and icons on a card: the chosen colour, lightened just enough to reach
 * `min` contrast on the card surface (4.5:1 for small text). Borders and washes use the colour
 * as chosen; anything that must be read uses this.
 */
export function readableColour(h: string, min = 4.5): string {
  if (!HEX.test(h)) return LEGACY_HEX.default;
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const c = t === 0 ? h.toLowerCase() : mixWithWhite(h, t);
    if (contrastRatio(c, SURFACE) >= min) return c;
  }
  return "#ffffff";
}

/** The theme accent stays a CSS variable when the card uses it unchanged (Branding can retheme it). */
export function accentCss(style: CardStyle): string {
  return style.colours.primary === LEGACY_HEX.default ? ACCENT_COLOR.default : style.colours.primary;
}

/** The legacy accent name closest to a style, kept in players.card_accent for older readers. */
export function legacyAccentFor(style: CardStyle): CardAccent | null {
  const hit = (Object.entries(LEGACY_HEX) as Array<[CardAccent, string]>).find(([, v]) => v === style.colours.primary);
  return hit ? (hit[0] === "default" ? null : hit[0]) : null;
}

// ── The look passed to every card ───────────────────────────────────────────────────────────────

/** What a card needs to draw a player's personal look (serialisable: server → client). */
export interface CardLook {
  style: CardStyle;
  /** The uploaded banner, when there is one (used only when the style chooses it). */
  bannerUrl: string | null;
}

export function cardBannerUrl(playerId: string, version: number | null | undefined): string | null {
  return version ? `/api/card-banners/${playerId}?v=${version}` : null;
}

export function cardLookFor(p: { id: string; cardStyle?: unknown; cardAccent?: string | null; cardBannerVersion?: number | null }): CardLook {
  return { style: resolveCardStyle(p.cardStyle ?? null, p.cardAccent ?? null), bannerUrl: cardBannerUrl(p.id, p.cardBannerVersion) };
}
