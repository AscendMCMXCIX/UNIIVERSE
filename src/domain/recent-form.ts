import { performanceOfGames, type SeasonGame } from "./season-stats";

/*
  RECENT FORM: the newest games of the current filter, from stored games only.

  The last results as a strip (newest first), and the win rate over the most recent games beside
  the season's, with the sample sizes said out loud. A difference is only called a trend when both
  samples are big enough and it is large; otherwise the figures stand alone, never a verdict.
*/

export interface FormGame extends Pick<SeasonGame, "kills" | "deaths" | "assists" | "cs" | "visionScore" | "gameDuration"> {
  matchId: string;
  win: boolean | null;
  gameCreation: number;
  championId: string;
  role?: string | null;
}

/**
 * One performance figure, the recent games against all of them, each over the games that carry
 * it. `direction` follows the same rule as the win-rate trend: only with enough games on both
 * sides and a clear gap (FORM_METRIC_GAP); otherwise "steady", or null on a small sample.
 */
export interface FormMetric {
  key: "kda" | "cs" | "vision";
  label: string;
  recent: number | null;
  recentGames: number;
  season: number | null;
  seasonGames: number;
  direction: "up" | "down" | "steady" | null;
}

/** What counts as a clear gap per figure: KDA and vision relative (15%), CS per minute absolute. */
export const FORM_METRIC_GAP = { kda: { relative: 0.15 }, cs: { absolute: 0.5 }, vision: { relative: 0.15 } } as const;

export interface RecentForm {
  /** Newest first, at most `strip` games with a result. */
  last: Array<{ matchId: string; win: boolean; championId: string; at: number }>;
  recent: { games: number; wins: number; winRate: number | null };
  season: { games: number; wins: number; winRate: number | null };
  /** "up" / "down" only with enough games on both sides and a clear gap; otherwise "steady" or null. */
  trend: "up" | "down" | "steady" | null;
  /** Percentage points, recent minus season (null without both). */
  gapPoints: number | null;
  /** KDA, then CS per minute (vision per game when most recent games were played as Support). */
  metrics: FormMetric[];
}

export const FORM_STRIP = 20;
/** Fewer games than this in the filter: the strip is not shown at all. */
export const FORM_MIN_GAMES = 5;
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
    metrics: formMetrics(recentGames, decided),
  };
}

function formMetrics(recentGames: readonly FormGame[], all: readonly FormGame[]): FormMetric[] {
  if (recentGames.length === 0) return [];
  const now = performanceOfGames(recentGames as SeasonGame[]);
  const before = performanceOfGames(all as SeasonGame[]);
  const support = recentGames.filter((g) => g.role === "SUPPORT").length * 2 > recentGames.length;
  const metric = (key: FormMetric["key"], label: string, recentValue: number | null, recentGames: number, seasonValue: number | null, seasonGames: number): FormMetric => {
    const comparable = recentValue !== null && seasonValue !== null && recentGames >= FORM_MIN_RECENT && seasonGames >= recentGames + FORM_MIN_RECENT;
    let direction: FormMetric["direction"] = null;
    if (comparable) {
      const gap = FORM_METRIC_GAP[key];
      const diff = recentValue - seasonValue;
      const clear = "absolute" in gap ? Math.abs(diff) >= gap.absolute : seasonValue > 0 && Math.abs(diff) / seasonValue >= gap.relative;
      direction = clear ? (diff > 0 ? "up" : "down") : "steady";
    }
    return { key, label, recent: recentValue, recentGames, season: seasonValue, seasonGames, direction };
  };
  return [
    metric("kda", "KDA", now.kdaRatio, now.detailedGames, before.kdaRatio, before.detailedGames),
    support
      ? metric("vision", "Vision", now.visionPerGame, now.visionGames, before.visionPerGame, before.visionGames)
      : metric("cs", "CS/min", now.csPerMinute, now.csMinuteGames, before.csPerMinute, before.csMinuteGames),
  ].filter((m) => m.recent !== null);
}
