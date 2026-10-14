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
  /** Highlights: selection, the active draft slot, "you" markers. Null = default. */
  highlight: string | null;
}

export interface Branding extends BrandColours {
  teamName: string;
  shortName: string;
  /** Empty = no tagline anywhere. */
  tagline: string;
  assets: { logo: BrandAssetMeta | null; background: BrandAssetMeta | null };
}

export const DEFAULT_COLOURS = { accent: "#1fc3ff", accent2: "#58a8f2", background: "#080c24", surface: "#10163a", highlight: "#7fdcff" } as const;
/** The app's text colour (light on dark); custom backgrounds and surfaces must keep it readable. */
export const TEXT_COLOUR = "#e8edfb";

export const DEFAULT_BRANDING: Branding = { teamName: "UNIIVERSE", shortName: "UNIIVERSE", tagline: "", accent: DEFAULT_COLOURS.accent, accent2: null, background: null, surface: null, highlight: null, assets: { logo: null, background: null } };

/** The UNIIVERSE mark shipped with the app (public/brand); shown wherever no custom logo is set. */
export const BRAND_LOGO_URL = "/brand/logo.png";
export const BRAND_WORDMARK_URL = "/brand/wordmark.png";
export const BRAND_BACKDROP_URL = "/brand/backdrop.jpg";

export type BrandAssetKind = "logo" | "background";
export const BRAND_ASSET_KINDS: readonly BrandAssetKind[] = ["logo", "background"];

/**
 * Upload limits. One request may carry at most 4.5 MB on the hosting platform, so images travel
 * in pieces of BRAND_UPLOAD_CHUNK_BYTES and are joined on the server: a 20 MB GIF is six requests.
 * Large animations still cost every visitor's first page load (they are cached afterwards), so
 * the editor recommends staying under BRAND_RECOMMENDED_BYTES.
 */
export const BRAND_LIMITS: Record<BrandAssetKind, { maxBytes: number; maxSide: number; label: string }> = {
  logo: { maxBytes: 20_000_000, maxSide: 1024, label: "20 MB" },
  background: { maxBytes: 20_000_000, maxSide: 4096, label: "20 MB" },
};
export const BRAND_UPLOAD_CHUNK_BYTES = 3_500_000;
export const BRAND_RECOMMENDED_BYTES = 5_000_000;
/** Still frames are generated in the browser (PNG for logos, JPEG for backgrounds). */
export const BRAND_STATIC_MAX_BYTES = 600_000;

function assetUrl(kind: BrandAssetKind, meta: BrandAssetMeta, still: boolean): string {
  return `/api/branding/${kind}${still && meta.animated && meta.hasStatic ? "-static" : ""}?v=${meta.version}`;
}

/** The logo as shown (animated if it is a GIF). */
export function logoSrc(b: Pick<Branding, "assets">): string {
  return b.assets.logo ? assetUrl("logo", b.assets.logo, false) : BRAND_LOGO_URL;
}
/** A still logo: favicons and reduced motion. Equals logoSrc unless the logo is animated. */
export function logoStillSrc(b: Pick<Branding, "assets">): string {
  return b.assets.logo ? assetUrl("logo", b.assets.logo, true) : BRAND_LOGO_URL;
}
export function backgroundSrc(b: Pick<Branding, "assets">): string | null {
  return b.assets.background ? assetUrl("background", b.assets.background, false) : null;
}
export function backgroundStillSrc(b: Pick<Branding, "assets">): string | null {
  return b.assets.background ? assetUrl("background", b.assets.background, true) : null;
}

const HEX = /^#[0-9a-f]{6}$/i;
export const isHex = (v: unknown): v is string => typeof v === "string" && HEX.test(v.trim());

/** Parses stored or submitted branding (unknown keys, including the old inline logo, are dropped). */
export function parseBranding(raw: unknown, assets: Branding["assets"] = { logo: null, background: null }): Branding {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const text = (v: unknown, fallback: string, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : fallback);
  const colour = (v: unknown): string | null => (isHex(v) ? v.trim().toLowerCase() : null);
  return {
    teamName: text(r.teamName, DEFAULT_BRANDING.teamName, 60),
    shortName: text(r.shortName, DEFAULT_BRANDING.shortName, 14).toUpperCase(),
    tagline: typeof r.tagline === "string" ? r.tagline.trim().slice(0, 60) : "",
    accent: colour(r.accent) ?? DEFAULT_COLOURS.accent,
    accent2: colour(r.accent2),
    background: colour(r.background),
    surface: colour(r.surface),
    highlight: colour(r.highlight),
    assets,
  };
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
  if (c.background) {
    vars["--color-bg"] = c.background;
    vars["--color-bg-elevated"] = `color-mix(in srgb, ${c.background} 96%, #ffffff)`;
  }
  if (c.surface) {
    vars["--color-surface"] = c.surface;
    vars["--color-surface-2"] = `color-mix(in srgb, ${c.surface} 94%, #ffffff)`;
    vars["--color-surface-3"] = `color-mix(in srgb, ${c.surface} 88%, #ffffff)`;
    vars["--color-border"] = `color-mix(in srgb, ${c.surface} 86%, #ffffff)`;
    vars["--color-border-strong"] = `color-mix(in srgb, ${c.surface} 76%, #ffffff)`;
  }
  return vars;
}

/** The theme as a :root rule (values are validated hex colours only, so this is safe to inline). */
export function brandThemeCss(c: BrandColours): string {
  const vars = brandThemeVars(c);
  const body = Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
  return body ? `:root{${body}}` : "";
}
