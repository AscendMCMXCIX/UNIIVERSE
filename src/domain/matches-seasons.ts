/*
  Team → Matches covers Season 2026 (game version 16) and every season after it. Earlier seasons
  are never shown there: not in the season choice, the counts, the lists or the bookmarks, whatever
  the address asks for. The floor is the only fixed value: a later season appears on its own once
  the members have games in it, and the current season (from the current patch) is the default.
  Other pages (profiles, Match History, Leaderboards) keep their own season rules.
*/

export const MATCHES_FIRST_SEASON = 16;

/** A game's season counts on Team → Matches. */
export const inMatchesSeasons = (season: number | null | undefined): season is number => season != null && season >= MATCHES_FIRST_SEASON;

/**
 * The seasons Team → Matches offers, newest first: the current one (never below the floor) and any
 * later or earlier one from the floor up that has games.
 */
export function matchesSeasons(currentSeason: number, gameSeasons: Iterable<number | null>): { seasons: number[]; current: number } {
  const current = Math.max(currentSeason, MATCHES_FIRST_SEASON);
  const seasons = [...new Set([current, ...[...gameSeasons].filter(inMatchesSeasons)])].sort((a, b) => b - a);
  return { seasons, current };
}

/** The season asked for in the address, if Team → Matches offers it; else the current season. */
export function chosenSeason(param: string, seasons: readonly number[], current: number): number {
  const n = Number(param);
  return Number.isInteger(n) && seasons.includes(n) ? n : current;
}
