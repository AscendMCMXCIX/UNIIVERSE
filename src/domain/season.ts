import { canonicalPatch } from "./patch";

/*
  League seasons. Since 2024 a ranked season runs for a calendar year and every patch of that
  year shares the game-client major version: 14.x = 2024, 15.x = 2025, 16.x = 2026. A game's
  season is therefore read from its patch, which match data always carries; no hand-maintained
  list of dates is needed. A season's match lists are requested from 1 January, or from the day
  its first patch was seen when that came earlier (accounts/sync seasonListStart), and filtered by
  patch, so nothing assumes the date Riot opens a season.
*/

/** Game-version major of a patch ("16.20" → 16), or null for anything unreadable. */
export function seasonOfPatch(patch: string | null | undefined): number | null {
  if (!patch) return null;
  const m = /^(\d+)\.\d+$/.exec(canonicalPatch(patch));
  return m ? Number(m[1]) : null;
}

/** Calendar year of a season (16 → 2026). */
export function seasonYear(season: number): number {
  return season + 2010;
}

/** "Season 2026" */
export function seasonLabel(season: number): string {
  return `Season ${seasonYear(season)}`;
}

/** Unix seconds of 1 January (UTC) of the season's year: the latest a season's match lists start. */
export function seasonStartUnix(season: number): number {
  return Math.floor(Date.UTC(seasonYear(season), 0, 1) / 1000);
}

/** The season a date falls in when no patch is known (calendar year). */
export function seasonForDate(date: Date): number {
  return date.getUTCFullYear() - 2010;
}

/** A stored game's season: from its patch, or from its start time (ms) when the patch is unknown. */
export function seasonOfGame(patch: string | null | undefined, gameCreationMs: number): number {
  return seasonOfPatch(patch) ?? seasonForDate(new Date(gameCreationMs));
}

/*
  Which seasons can be chosen. One rule for every season choice (profiles, Match History, All
  Champions, Matchups, Leaderboards, Team → Matches): Season 2026 (game version 16) is the
  earliest, and nothing after the current season (read from the synced patch) is offered. Older
  games may stay stored, but they are never offered, counted under "all seasons" or collected
  again. A later season appears on its own: the current season moves with the patch, and earlier
  supported seasons stay while games of them exist. The floor is the only fixed value.
*/

/** The earliest season offered anywhere: Season 2026. */
export const FIRST_SEASON = 16;

/** The current season as offered: the synced patch's season, never below the floor. */
export function offeredCurrentSeason(current: number): number {
  return Math.max(current, FIRST_SEASON);
}

/** A season can be offered: from the floor up to the current season. */
export function isOfferedSeason(season: number | null | undefined, current: number): season is number {
  return season != null && Number.isInteger(season) && season >= FIRST_SEASON && season <= offeredCurrentSeason(current);
}

/** The seasons a season choice offers, newest first: the current one and every offered season with games. */
export function offeredSeasons(current: number, gameSeasons: Iterable<number | null | undefined>): number[] {
  const now = offeredCurrentSeason(current);
  return [...new Set([now, ...[...gameSeasons].filter((s): s is number => isOfferedSeason(s, now))])].sort((a, b) => b - a);
}

/** The season asked for (an address value or a number), if offered; else the current one. */
export function chooseSeason(requested: string | number | null | undefined, seasons: readonly number[], current: number): number {
  const n = typeof requested === "number" ? requested : Number(requested);
  return requested !== "" && requested != null && Number.isInteger(n) && seasons.includes(n) ? n : offeredCurrentSeason(current);
}
