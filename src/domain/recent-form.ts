/*
  RECENT FORM: the newest games of the current filter, from stored games only.

  The last results as a strip (newest first), and the win rate over the most recent games beside
  the season's, with the sample sizes said out loud. A difference is only called a trend when both
  samples are big enough and it is large; otherwise the figures stand alone, never a verdict.
*/

export interface FormGame {
  matchId: string;
  win: boolean | null;
  gameCreation: number;
  championId: string;
}

export interface RecentForm {
  /** Newest first, at most `strip` games with a result. */
  last: Array<{ matchId: string; win: boolean; championId: string; at: number }>;
  recent: { games: number; wins: number; winRate: number | null };
  season: { games: number; wins: number; winRate: number | null };
  /** "up" / "down" only with enough games on both sides and a clear gap; otherwise "steady" or null. */
  trend: "up" | "down" | "steady" | null;
  /** Percentage points, recent minus season (null without both). */
  gapPoints: number | null;
}

export const FORM_STRIP = 10;
export const FORM_RECENT = 20;
/** Fewer recent games than this: no trend is called. */
export const FORM_MIN_RECENT = 10;
/** A gap below this many percentage points is "steady". */
export const FORM_GAP = 8;

export function recentForm(games: readonly FormGame[], strip = FORM_STRIP, window = FORM_RECENT): RecentForm {
  const decided = games.filter((g) => g.win !== null).sort((a, b) => b.gameCreation - a.gameCreation);
  const recentGames = decided.slice(0, window);
  const rate = (list: readonly FormGame[]) => (list.length ? list.filter((g) => g.win).length / list.length : null);
  const recent = { games: recentGames.length, wins: recentGames.filter((g) => g.win).length, winRate: rate(recentGames) };
  const season = { games: decided.length, wins: decided.filter((g) => g.win).length, winRate: rate(decided) };
  const gapPoints = recent.winRate !== null && season.winRate !== null ? Math.round((recent.winRate - season.winRate) * 100) : null;
  // Only a trend when the recent sample is real and the season holds more than the recent games.
  const comparable = recent.games >= FORM_MIN_RECENT && season.games >= recent.games + FORM_MIN_RECENT;
  const trend = gapPoints === null || !comparable ? null : gapPoints >= FORM_GAP ? "up" : gapPoints <= -FORM_GAP ? "down" : "steady";
  return {
    last: decided.slice(0, strip).map((g) => ({ matchId: g.matchId, win: !!g.win, championId: g.championId, at: g.gameCreation })),
    recent,
    season,
    trend,
    gapPoints,
  };
}
