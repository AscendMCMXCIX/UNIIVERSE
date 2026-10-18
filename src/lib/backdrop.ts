/*
  How much of the team's app background shows, on every page of the app: a team branding setting
  (Branding.backdropLevel, 0–100) chosen by an admin in Admin → Branding, the same for everyone.

  The level sets three CSS variables the app shell's backdrop reads: the artwork's opacity, the
  opacity of a flat veil in the page colour over it, and a vignette that keeps the edges calm.
  What reaches the eye is about art × (1 − veil): roughly 6% at 0 (a hint of the artwork), 29% at
  50 and 64% at 100 (clearly the team's artwork, with a veil left so headings and tabs that sit
  directly on it stay readable over bright artwork; cards and panels have their own surfaces). One mapping for every
  page, so the same level looks the same on Team, My Profile, Match History or Leaderboards.
  Player-card art and other images are separate and never affected.
*/

export interface BackdropVars {
  art: number;
  veil: number;
  vignette: number;
}

/** The artwork's opacity, the veil's opacity and the vignette's opacity for a level. */
export function backdropVars(level: number): BackdropVars {
  const t = Math.max(0, Math.min(100, Number.isFinite(level) ? level : 0)) / 100;
  const round = (v: number) => Math.round(v * 1000) / 1000;
  return { art: round(0.5 + 0.5 * t), veil: round(0.88 - 0.52 * t), vignette: round(0.6 - 0.35 * t) };
}

/** How visible the artwork is for a level (art × (1 − veil)), 0–1: what the slider promises. */
export function backdropVisibility(level: number): number {
  const { art, veil } = backdropVars(level);
  return Math.round(art * (1 - veil) * 1000) / 1000;
}

/** The variables as a CSS rule for the document (rendered on the server with every page). */
export function backdropCss(level: number): string {
  const { art, veil, vignette } = backdropVars(level);
  return `:root{--backdrop-art:${art};--backdrop-veil:${veil};--backdrop-vignette:${vignette}}`;
}
