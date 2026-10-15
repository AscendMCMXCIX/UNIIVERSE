/*
  How strongly a win rate may be emphasised. A win rate is only coloured as a strength once it
  rests on enough games: "100%, 1 game" is shown, but plainly, so the colour never rewards noise.
  The figure itself is never hidden or changed.
*/

/** Games before a win rate is coloured: one champion in one role, or a whole season. */
export const WIN_RATE_MIN_GAMES = { champion: 5, season: 10 } as const;

export type WinRateTone = "good" | "plain" | "muted";

/**
 * "muted" when there is no figure, or too few games to read anything into it;
 * "good" when it is 50% or better on enough games; otherwise "plain".
 */
export function winRateTone(winRate: number | null | undefined, games: number | null | undefined, minGames: number): WinRateTone {
  if (winRate === null || winRate === undefined || !Number.isFinite(winRate)) return "muted";
  if ((games ?? 0) < minGames) return "muted";
  return winRate >= 0.5 ? "good" : "plain";
}

/** The text colour for a tone (Tailwind classes from the design tokens). */
export const WIN_RATE_TONE_CLASS: Record<WinRateTone, string> = { good: "text-good", plain: "text-fg", muted: "text-fg-muted" };

/** Tooltip text explaining a muted figure, or null when the figure stands on enough games. */
export function winRateSampleNote(winRate: number | null | undefined, games: number | null | undefined, minGames: number): string | null {
  if (winRate === null || winRate === undefined) return null;
  const n = games ?? 0;
  return n < minGames ? `Only ${n} game${n === 1 ? "" : "s"}: too few to read much into this win rate (${minGames}+ are needed before it is highlighted).` : null;
}
