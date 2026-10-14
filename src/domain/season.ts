import { canonicalPatch } from "./patch";

/*
  League seasons. Since 2024 a ranked season runs for a calendar year and every patch of that
  year shares the game-client major version: 14.x = 2024, 15.x = 2025, 16.x = 2026. A game's
  season is therefore read from its patch, which match data always carries; no hand-maintained
  list of dates is needed. Riot opens a season in early January, so the season's match lists are
  requested from 1 January and filtered by patch.
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

/** Unix seconds of 1 January (UTC) of the season's year: the lower bound for its match lists. */
export function seasonStartUnix(season: number): number {
  return Math.floor(Date.UTC(seasonYear(season), 0, 1) / 1000);
}

/** The season a date falls in when no patch is known (calendar year). */
export function seasonForDate(date: Date): number {
  return date.getUTCFullYear() - 2010;
}
