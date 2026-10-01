/**
 * Team branding: a name, a short name for the sidebar, a tagline, an accent colour and an
 * optional small logo (stored as a data URL so no file storage is needed). Pure validation.
 */
export interface Branding {
  teamName: string;
  shortName: string;
  tagline: string;
  /** Hex colour, e.g. #c8aa6e. */
  accent: string;
  logoDataUrl: string | null;
}

export const DEFAULT_BRANDING: Branding = { teamName: "UNIIVERSE", shortName: "UNIIVERSE", tagline: "Draft platform", accent: "#c8aa6e", logoDataUrl: null };

const HEX = /^#[0-9a-f]{6}$/i;
const DATA_URL = /^data:image\/(png|jpeg|webp|svg\+xml|gif);base64,[A-Za-z0-9+/=]+$/;
/** ~150 KB of base64: enough for a crisp small logo, small enough to inline on every page. */
export const MAX_LOGO_CHARS = 200_000;

export function parseBranding(raw: unknown): Branding {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const text = (v: unknown, fallback: string, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : fallback);
  const accent = typeof r.accent === "string" && HEX.test(r.accent.trim()) ? r.accent.trim().toLowerCase() : DEFAULT_BRANDING.accent;
  const logo = typeof r.logoDataUrl === "string" && r.logoDataUrl.length <= MAX_LOGO_CHARS && DATA_URL.test(r.logoDataUrl) ? r.logoDataUrl : null;
  return {
    teamName: text(r.teamName, DEFAULT_BRANDING.teamName, 60),
    shortName: text(r.shortName, DEFAULT_BRANDING.shortName, 14).toUpperCase(),
    tagline: typeof r.tagline === "string" ? r.tagline.trim().slice(0, 60) : DEFAULT_BRANDING.tagline,
    accent,
    logoDataUrl: logo,
  };
}

/** Lightens a hex colour towards white by `amount` (0..1); used for the "strong" accent. */
export function lightenHex(hex: string, amount: number): string {
  if (!HEX.test(hex)) return hex;
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number) => Math.round(((n >> shift) & 0xff) + (255 - ((n >> shift) & 0xff)) * amount);
  return `#${[ch(16), ch(8), ch(0)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Readable text colour for a badge on the accent. */
export function contrastText(hex: string): "#111111" | "#ffffff" {
  if (!HEX.test(hex)) return "#111111";
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * ((n >> 16) & 0xff) + 0.587 * ((n >> 8) & 0xff) + 0.114 * (n & 0xff)) / 255;
  return lum > 0.6 ? "#111111" : "#ffffff";
}
