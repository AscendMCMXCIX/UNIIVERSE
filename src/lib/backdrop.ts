/*
  Team Overview's background visibility: how much of the team's app background shows behind the
  lineup. A team branding setting (Branding.backdropLevel, 0–100), chosen by an admin in Admin →
  Branding and the same for everyone; every other page keeps the standard, subtle backdrop.

  The level sets CSS variables the app's backdrop reads: the artwork's opacity and the strength of
  the dark veil over it. Both ease off together, so low levels hide the artwork almost completely
  while the top of the range still leaves a veil that keeps text and cards readable.
*/

/** The artwork's opacity and the veil's opacity (over its own top-to-bottom gradient) for a level. */
export function backdropVars(level: number): { art: number; veil: number } {
  const t = Math.max(0, Math.min(100, level)) / 100;
  const round = (v: number) => Math.round(v * 1000) / 1000;
  return { art: round(0.12 + 0.68 * t), veil: round(1 - 0.5 * t) };
}

/** The variables as a CSS rule for the document (rendered on the server with the page). */
export function backdropCss(level: number): string {
  const { art, veil } = backdropVars(level);
  return `:root{--backdrop-art:${art};--backdrop-veil:${veil};--backdrop-vignette:1}`;
}
