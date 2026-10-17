/*
  Team Overview's "Background visibility": how much of the team's background artwork shows behind
  the lineup. A personal viewing preference (this browser, like the sidebar's state), never a team
  setting: the artwork and the branding stay as they are for everyone else, and every other page
  keeps the standard, subtle backdrop.

  The level (0–100) sets two CSS variables the app's backdrop reads: the artwork's opacity and the
  strength of the dark veil over it. Both ease off together, so low levels hide the artwork almost
  completely while the top of the range still leaves a veil that keeps text and cards readable.
*/

export const BACKDROP_COOKIE = "uniiverse_team_backdrop";
export const BACKDROP_DEFAULT = 50;

/** The stored level, or the default when it is missing or not a whole number from 0 to 100. */
export function parseBackdropLevel(raw: string | undefined | null): number {
  if (!raw || !/^\d{1,3}$/.test(raw)) return BACKDROP_DEFAULT;
  const n = Number(raw);
  return n <= 100 ? n : BACKDROP_DEFAULT;
}

/** The artwork's opacity and the veil's opacity (over its own top-to-bottom gradient) for a level. */
export function backdropVars(level: number): { art: number; veil: number } {
  const t = Math.max(0, Math.min(100, level)) / 100;
  const round = (v: number) => Math.round(v * 1000) / 1000;
  return { art: round(0.12 + 0.68 * t), veil: round(1 - 0.5 * t) };
}

/** The variables as a CSS rule for the document (server-rendered with the page, updated live while sliding). */
export function backdropCss(level: number): string {
  const { art, veil } = backdropVars(level);
  return `:root{--backdrop-art:${art};--backdrop-veil:${veil};--backdrop-vignette:1}`;
}
