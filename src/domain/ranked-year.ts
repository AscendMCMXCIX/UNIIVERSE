import { canonicalPatch } from "./patch";

/*
  THE RANKED YEARS (Season 2026 = game version 16, Season 2027 = game version 17).

  One ranked ladder runs for a year: Riot resets ranks once, at the start of the year, and the
  year's seasons share the ladder.

  2026 opened on 8 January 2026. Season 1 opened on 8 January (patch 26.1), Season 2 on 29 April
  (patch 26.9) and Season 3 on 29 July (patch 26.15), each at noon local server time. Season 2 also
  hard-reset the apex tiers (Master and above) on BR, EUNE, EUW, LAN, NA and TR only ("for all other
  players, nothing will change"). Riot's own words, checked on 6 Nov 2026: "the 2026 Season",
  "Season 2", "Season 3" (/dev: Apex Tier Ranked Reset, 21 April 2026) and "SR Ranked Season 2 will
  start at 12:00:00 noon, April 29, local server time" (patch 26.9 notes); no "split" or "act" in
  the ranked notes. The first games stored on each patch are reported by `rank-audit` as a check
  (8 Jan, 29 Apr, 29 Jul in production).

  2027: Riot's /dev update of 16 Nov 2026 ("TL;DW: Season 1 2027 Dev Update") says "In January
  everybody's visual rank will reset to Iron IV, but MMR will be the same" and "Everyone will climb
  from Iron IV together with massive LP increases" ("Ranked Rush"). It names no date, patch or
  split count (checked 27 Nov 2026). So 2027's `from` is an ESTIMATE (`confirmed: false`), used for
  labels only where no reading decides: each account's own year ends at its own reset reading
  (domain/rank-timeline `ladderOf`), whatever the calendar says. When Riot publishes the date (patch
  27.1's notes or a /dev post), one line here sets `RANKED_2027_FROM` and `confirmed: true`, and the
  2027 seasons Riot names (docs/RANKED_PROGRESS.md, "The 2027 ranked year").

  A game's year and season come from its patch, which match data always carries ("17.1" and Riot's
  public "27.1" are the same patch). A date places only what has no patch (a rank reading, an
  account with no reading), to the day: the noon start is not applied, as no reading of the team
  falls on a season's first day.
*/

export type RankedSeasonKey = "s1" | "s2" | "s3";

export interface RankedSeason {
  key: RankedSeasonKey;
  /** "Season 1" */
  label: string;
  /** UTC midnight of the season's first day (ms); an estimate while its year is not confirmed. */
  from: number;
  /** The season's first patch, canonical ("16.9" for 26.9). */
  firstPatch: string;
  /** The ranked year it belongs to (2026). */
  year: number;
}

export interface RankedYear {
  /** 2026 */
  year: number;
  /** The game-client major of its patches (16 for 2026; Riot's public "26.x" names are the same patches). */
  major: number;
  /** UTC midnight of its first day (ms); for a year Riot has not dated yet, an estimate. */
  from: number;
  /** False while `from` is an estimate: it then labels only what no reading decides. */
  confirmed: boolean;
  /** Its seasons, oldest first (the first opens with the year). */
  seasons: readonly RankedSeason[];
}

/** 2027's first day: an ESTIMATE (Riot said "January" on 16 Nov 2026, no date); labels only. */
export const RANKED_2027_FROM = Date.UTC(2027, 0, 7);

export const RANKED_YEARS: readonly RankedYear[] = [
  {
    year: 2026,
    major: 16,
    from: Date.UTC(2026, 0, 8),
    confirmed: true,
    seasons: [
      { key: "s1", label: "Season 1", from: Date.UTC(2026, 0, 8), firstPatch: "16.1", year: 2026 },
      { key: "s2", label: "Season 2", from: Date.UTC(2026, 3, 29), firstPatch: "16.9", year: 2026 },
      { key: "s3", label: "Season 3", from: Date.UTC(2026, 6, 29), firstPatch: "16.15", year: 2026 },
    ],
  },
  {
    year: 2027,
    major: 17,
    from: RANKED_2027_FROM,
    confirmed: false,
    seasons: [{ key: "s1", label: "Season 1", from: RANKED_2027_FROM, firstPatch: "17.1", year: 2027 }],
  },
];

/** The first day of the first ranked year UNIIVERSE knows (8 January 2026): the floor of every ranked figure (ms). */
export const RANKED_YEAR_START = RANKED_YEARS[0]!.from;

/**
 * How many days before a year's (estimated) first day a reset reading can open it: Riot may reset a
 * few days early, or on another day per region. Nothing else restarts Riot's count within a year
 * (Season 2's apex reset kept wins and losses), so a reset this close to a year's start is its start.
 */
export const YEAR_RESET_LEAD_DAYS = 21;

const parsePatch = (patch: string): { major: number; minor: number } | null => {
  const m = /^(\d+)\.(\d+)$/.exec(canonicalPatch(patch));
  return m ? { major: Number(m[1]), minor: Number(m[2]) } : null;
};
const minorOf = (patch: string) => parsePatch(patch)?.minor ?? 0;

/** The ranked year of a game, from its patch ("17.1" and "27.1": 2027); null for a year UNIIVERSE does not know or an unreadable patch. */
export function rankedYearOfPatch(patch: string | null | undefined): RankedYear | null {
  if (!patch) return null;
  const p = parsePatch(patch);
  return p ? (RANKED_YEARS.find((y) => y.major === p.major) ?? null) : null;
}

/** The season a game belongs to, from its patch, within its ranked year; null for a game of another year or an unreadable patch. */
export function rankedSeasonOfPatch(patch: string | null | undefined): RankedSeason | null {
  const year = rankedYearOfPatch(patch);
  if (!year || !patch) return null;
  const minor = minorOf(patch);
  let found: RankedSeason | null = null;
  for (const s of year.seasons) if (minor >= minorOf(s.firstPatch)) found = s;
  return found;
}

/** The ranked year a moment falls in by date (ms): the last year whose (estimated) first day is at or before it; null before 8 January 2026. */
export function rankedYearAt(at: number): RankedYear | null {
  let found: RankedYear | null = null;
  for (const y of RANKED_YEARS) if (at >= y.from) found = y;
  return found;
}

/** The season of a year a moment falls in, to the day: its first season before that season's first day (a reset read a few days early). */
export function seasonOfYearAt(year: RankedYear, at: number): RankedSeason {
  let found = year.seasons[0]!;
  for (const s of year.seasons) if (at >= s.from) found = s;
  return found;
}

/** The season a moment falls in by date (ms), to the day; null before 8 January 2026. */
export function rankedSeasonAt(at: number): RankedSeason | null {
  const year = rankedYearAt(at);
  return year ? seasonOfYearAt(year, at) : null;
}

/** The ranked year after one, if UNIIVERSE knows it. */
export function nextRankedYear(year: RankedYear): RankedYear | null {
  return RANKED_YEARS[RANKED_YEARS.indexOf(year) + 1] ?? null;
}

/** "2026 Season 3" */
export function rankedSeasonName(season: RankedSeason): string {
  return `${season.year} ${season.label}`;
}
