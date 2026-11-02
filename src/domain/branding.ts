/**
 * Team branding: a name, a short name for the sidebar, an optional tagline, a few colours and
 * optional images (logo, background; GIFs allowed). Images live in their own table and are
 * served by URL; this module is pure: parsing, contrast and the theme variables.
 */
export interface BrandAssetMeta {
  /** Cache-busting version (upload time). */
  version: number;
  animated: boolean;
  /** A still first frame exists (animated GIFs). */
  hasStatic: boolean;
}

export interface BrandColours {
  /** Primary accent: buttons, links, active navigation. */
  accent: string;
  /** Secondary accent: gradients and the background glow. Null = default. */
  accent2: string | null;
  /** Page background. Null = default. */
  background: string | null;
  /** Panels and cards. Null = default. */
  surface: string | null;
  /** Highlights: selection, the current item, "you" markers. Null = default. */
  highlight: string | null;
}

export interface Branding extends BrandColours {
  /**
   * What the app calls itself: page titles, the welcome and sign-in wording, help text and the
   * Riot notice. The team name stays the team's (sidebar, sign-in heading, "member of the team").
   */
  productName: string;
  teamName: string;
  shortName: string;
  /** Empty = no tagline anywhere. */
  tagline: string;
  /**
   * How much of the app background shows on Team Overview, 0–100 (lib/backdrop turns it into the
   * artwork's opacity and the veil over it). One value for the whole team, set in Admin → Branding.
   */
  backdropLevel: number;
  /** background = the sign-in page; appBackground = behind every page after signing in. */
  assets: { logo: BrandAssetMeta | null; background: BrandAssetMeta | null; appBackground: BrandAssetMeta | null };
}

export const DEFAULT_COLOURS = { accent: "#1fc3ff", accent2: "#58a8f2", background: "#0d0e12", surface: "#16181d", highlight: "#7fdcff" } as const;
/** The app's text colour (light on dark); custom backgrounds and surfaces must keep it readable. */
export const TEXT_COLOUR = "#edeef1";

/** Team Overview's background visibility until an admin chooses another. */
export const DEFAULT_BACKDROP_LEVEL = 50;

/**
 * Neutral names for a new install, until its Owner sets their own in Admin → Branding. An install
 * that existed before names were settings keeps "UNIIVERSE" (migration 0043 stores it).
 */
export const NEUTRAL_NAME = "Team Hub";

export const DEFAULT_BRANDING: Branding = { productName: NEUTRAL_NAME, teamName: NEUTRAL_NAME, shortName: NEUTRAL_NAME.toUpperCase(), tagline: "", backdropLevel: DEFAULT_BACKDROP_LEVEL, accent: DEFAULT_COLOURS.accent, accent2: null, background: null, surface: null, highlight: null, assets: { logo: null, background: null, appBackground: null } };

/*
  Image branding is optional and has no stock fallback (Phase 10): without an uploaded logo the
  name is shown as text (with its initial as a small mark where a square is needed), and without
  a background the page keeps its plain, colour-based background. Colours keep their defaults.
*/

/** "background" is the sign-in background (its name predates the app background). */
export type BrandAssetKind = "logo" | "background" | "appBackground";
export const BRAND_ASSET_KINDS: readonly BrandAssetKind[] = ["logo", "background", "appBackground"];

/**
 * Upload limits. One request may carry at most 4.5 MB on the hosting platform, so images travel
 * in pieces of BRAND_UPLOAD_CHUNK_BYTES and are joined on the server: a 20 MB GIF is six requests.
 * Large animations still cost every visitor's first page load (they are cached afterwards), so
 * the editor recommends staying under BRAND_RECOMMENDED_BYTES.
 */
export const BRAND_LIMITS: Record<BrandAssetKind, { maxBytes: number; maxSide: number; label: string }> = {
  logo: { maxBytes: 20_000_000, maxSide: 1024, label: "20 MB" },
  background: { maxBytes: 20_000_000, maxSide: 4096, label: "20 MB" },
  appBackground: { maxBytes: 20_000_000, maxSide: 4096, label: "20 MB" },
};
export const BRAND_UPLOAD_CHUNK_BYTES = 3_500_000;
export const BRAND_RECOMMENDED_BYTES = 5_000_000;
/** Still frames are generated in the browser (PNG for logos, JPEG for backgrounds). */
export const BRAND_STATIC_MAX_BYTES = 600_000;

function assetUrl(kind: BrandAssetKind, meta: BrandAssetMeta, still: boolean): string {
  return `/api/branding/${kind}${still && meta.animated && meta.hasStatic ? "-static" : ""}?v=${meta.version}`;
}

/** The uploaded logo as shown (animated if it is a GIF); null when none is set. */
export function logoSrc(b: Pick<Branding, "assets">): string | null {
  return b.assets.logo ? assetUrl("logo", b.assets.logo, false) : null;
}
/** A still logo: favicons and reduced motion. Equals logoSrc unless the logo is animated. */
export function logoStillSrc(b: Pick<Branding, "assets">): string | null {
  return b.assets.logo ? assetUrl("logo", b.assets.logo, true) : null;
}
export function backgroundSrc(b: Pick<Branding, "assets">): string | null {
  return b.assets.background ? assetUrl("background", b.assets.background, false) : null;
}
export function backgroundStillSrc(b: Pick<Branding, "assets">): string | null {
  return b.assets.background ? assetUrl("background", b.assets.background, true) : null;
}
/** The app background (after signing in), animated if it is a GIF. */
export function appBackgroundSrc(b: Pick<Branding, "assets">): string | null {
  return b.assets.appBackground ? assetUrl("appBackground", b.assets.appBackground, false) : null;
}
export function appBackgroundStillSrc(b: Pick<Branding, "assets">): string | null {
  return b.assets.appBackground ? assetUrl("appBackground", b.assets.appBackground, true) : null;
}

const HEX = /^#[0-9a-f]{6}$/i;
export const isHex = (v: unknown): v is string => typeof v === "string" && HEX.test(v.trim());

/** Parses stored or submitted branding (unknown keys, including the old inline logo, are dropped). */
export function parseBranding(raw: unknown, assets: Branding["assets"] = { logo: null, background: null, appBackground: null }): Branding {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const text = (v: unknown, fallback: string, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : fallback);
  const colour = (v: unknown): string | null => (isHex(v) ? v.trim().toLowerCase() : null);
  return {
    productName: text(r.productName, DEFAULT_BRANDING.productName, 40),
    teamName: text(r.teamName, DEFAULT_BRANDING.teamName, 60),
    shortName: text(r.shortName, DEFAULT_BRANDING.shortName, 14).toUpperCase(),
    tagline: typeof r.tagline === "string" ? r.tagline.trim().slice(0, 60) : "",
    backdropLevel: typeof r.backdropLevel === "number" && Number.isFinite(r.backdropLevel) ? Math.max(0, Math.min(100, Math.round(r.backdropLevel))) : DEFAULT_BACKDROP_LEVEL,
    accent: colour(r.accent) ?? DEFAULT_COLOURS.accent,
    accent2: colour(r.accent2),
    background: colour(r.background),
    surface: colour(r.surface),
    highlight: colour(r.highlight),
    assets,
  };
}

/**
 * "Reset" in Admin → Branding: the default colours and background visibility. The names and the
 * tagline stay the install's own, so a reset never renames an install to the neutral defaults.
 */
export function resetLook(b: Branding): Branding {
  return { ...DEFAULT_BRANDING, productName: b.productName, teamName: b.teamName, shortName: b.shortName, tagline: b.tagline, assets: b.assets };
}

/** What is stored in settings (images live elsewhere). */
export function brandingSettings(b: Branding): Omit<Branding, "assets"> {
  const { assets: _assets, ...rest } = b;
  return rest;
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio (1–21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

export interface ContrastCheck {
  key: keyof BrandColours;
  ratio: number;
  /** Below this the colours are refused. */
  minimum: number;
  ok: boolean;
  message: string;
}

/**
 * Readability checks for a colour set: body text on the background and on surfaces (WCAG AA,
 * 4.5:1), and the accents and highlight against the background (3:1, the level for UI parts).
 */
export function checkContrast(c: BrandColours): ContrastCheck[] {
  const bg = c.background ?? DEFAULT_COLOURS.background;
  const surface = c.surface ?? DEFAULT_COLOURS.surface;
  const checks: Array<[keyof BrandColours, string, string, number, string]> = [
    ["background", TEXT_COLOUR, bg, 4.5, "Text on the background"],
    ["surface", TEXT_COLOUR, surface, 4.5, "Text on panels"],
    ["accent", c.accent, bg, 3, "Primary accent on the background"],
    ["accent2", c.accent2 ?? DEFAULT_COLOURS.accent2, bg, 3, "Secondary accent on the background"],
    ["highlight", c.highlight ?? DEFAULT_COLOURS.highlight, bg, 3, "Highlight on the background"],
  ];
  return checks.map(([key, fg, back, minimum, what]) => {
    const ratio = Math.round(contrastRatio(fg, back) * 10) / 10;
    return { key, ratio, minimum, ok: ratio >= minimum, message: `${what}: ${ratio}:1${ratio >= minimum ? "" : ` (needs ${minimum}:1)`}` };
  });
}

/** Lightens a hex colour towards white by `amount` (0..1); used for the "strong" accent. */
export function lightenHex(hex: string, amount: number): string {
  if (!HEX.test(hex)) return hex;
  const ch = rgb(hex).map((v) => Math.round(v + (255 - v) * amount));
  return `#${ch.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Readable text colour for a badge on the accent. */
export function contrastText(hex: string): "#111111" | "#ffffff" {
  if (!HEX.test(hex)) return "#111111";
  return luminance(hex) > 0.35 ? "#111111" : "#ffffff";
}

/**
 * CSS custom properties for the chosen colours. Only colours that differ from the defaults are
 * emitted; panel shades and borders are derived from the surface so one choice restyles them all.
 */
export function brandThemeVars(c: BrandColours): Record<string, string> {
  const vars: Record<string, string> = {};
  if (c.accent !== DEFAULT_COLOURS.accent) {
    vars["--color-accent"] = c.accent;
    vars["--color-accent-strong"] = lightenHex(c.accent, 0.35);
  }
  if (c.accent2) vars["--color-accent-2"] = c.accent2;
  if (c.highlight) vars["--color-highlight"] = c.highlight;
  if (c.background) vars["--color-bg"] = c.background;
  if (c.surface) {
    vars["--color-surface"] = c.surface;
    // Fields, menus and popovers: a step above the panels they sit on.
    vars["--color-bg-elevated"] = `color-mix(in srgb, ${c.surface} 97%, #ffffff)`;
    vars["--color-surface-2"] = `color-mix(in srgb, ${c.surface} 94%, #ffffff)`;
    vars["--color-surface-3"] = `color-mix(in srgb, ${c.surface} 88%, #ffffff)`;
    vars["--color-border"] = `color-mix(in srgb, ${c.surface} 86%, #ffffff)`;
    vars["--color-border-strong"] = `color-mix(in srgb, ${c.surface} 76%, #ffffff)`;
  }
  if (c.background || c.surface) vars["--color-border-control"] = controlEdge(c.surface ?? DEFAULT_COLOURS.surface, c.background ?? DEFAULT_COLOURS.background);
  return vars;
}

/**
 * The edge of a field or toolbar control for a custom page or panel colour: the panel's colour
 * lightened just enough for 3:1 against the page, the panels and what floats above them (WCAG 1.4.11).
 */
export function controlEdge(surface: string, background: string): string {
  const raised = lightenHex(surface, 0.06);
  for (let step = 15; step <= 45; step++) {
    const edge = lightenHex(surface, step / 50);
    if ([surface, background, raised].every((on) => contrastRatio(edge, on) >= 3.05)) return edge;
  }
  return lightenHex(surface, 0.9);
}

/** The theme as a :root rule (values are validated hex colours only, so this is safe to inline). */
export function brandThemeCss(c: BrandColours): string {
  const vars = brandThemeVars(c);
  const body = Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
  return body ? `:root{${body}}` : "";
}
