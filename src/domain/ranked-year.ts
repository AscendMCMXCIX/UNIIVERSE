import { canonicalPatch } from "./patch";

/*
  THE 2026 RANKED YEAR (Season 2026, game version 16).

  One ranked ladder runs from 8 January 2026 to the next reset at the start of 2027: Riot reset ranks
  once, at the start of the year, and its three seasons share the ladder. Season 1 opened on
  8 January (patch 26.1), Season 2 on 29 April (patch 26.9) and Season 3 on 29 July (patch 26.15),
  each at noon local server time. Season 2 also hard-reset the apex tiers (Master and above) on BR,
  EUNE, EUW, LAN, NA and TR only ("for all other players, nothing will change"). Riot's own words,
  checked on 6 Nov 2026: "the 2026 Season", "Season 2", "Season 3" (/dev: Apex Tier Ranked Reset,
  21 April 2026) and "SR Ranked Season 2 will start at 12:00:00 noon, April 29, local server time"
  (patch 26.9 notes); no "split" or "act" in the ranked notes. The first games stored on each patch
  are reported by `rank-audit` as a check (8 Jan, 29 Apr, 29 Jul in production).

  A game's season comes from its patch, which match data always carries. A date places only what
  has no patch (a rank reading), to the day: the noon start is not applied, as no reading of the
  team falls on a season's first day.
*/

export type RankedSeasonKey = "s1" | "s2" | "s3";

export interface RankedSeason {
  key: RankedSeasonKey;
  /** "Season 1" */
  label: string;
  /** UTC midnight of the season's first day (ms). */
  from: number;
  /** The season's first patch, canonical ("16.9" for 26.9). */
  firstPatch: string;
}

export const RANKED_YEAR = 2026;

export const RANKED_SEASONS_2026: readonly RankedSeason[] = [
  { key: "s1", label: "Season 1", from: Date.UTC(2026, 0, 8), firstPatch: "16.1" },
  { key: "s2", label: "Season 2", from: Date.UTC(2026, 3, 29), firstPatch: "16.9" },
  { key: "s3", label: "Season 3", from: Date.UTC(2026, 6, 29), firstPatch: "16.15" },
];

/** The first day of the 2026 ranked year (ms). */
export const RANKED_YEAR_START = RANKED_SEASONS_2026[0]!.from;

const minorOf = (patch: string): number | null => {
  const m = /^16\.(\d+)$/.exec(canonicalPatch(patch));
  return m ? Number(m[1]) : null;
};

/** The 2026 season a game belongs to, from its patch; null for a game of another year or an unreadable patch. */
export function rankedSeasonOfPatch(patch: string | null | undefined): RankedSeason | null {
  if (!patch) return null;
  const minor = minorOf(patch);
  if (minor === null) return null;
  let found: RankedSeason | null = null;
  for (const s of RANKED_SEASONS_2026) if (minor >= minorOf(s.firstPatch)!) found = s;
  return found;
}

/** The 2026 season a moment falls in (ms), to the day; null before 8 January 2026 or from 2027. */
export function rankedSeasonAt(at: number): RankedSeason | null {
  if (at < RANKED_YEAR_START || new Date(at).getUTCFullYear() > RANKED_YEAR) return null;
  let found: RankedSeason | null = null;
  for (const s of RANKED_SEASONS_2026) if (at >= s.from) found = s;
  return found;
}
