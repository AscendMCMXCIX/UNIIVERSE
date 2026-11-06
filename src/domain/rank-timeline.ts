import { ladderScore, rankLabel, TIERS, type RankSnapshot } from "./rank-progress";
import { RANKED_SEASONS_2026, RANKED_YEAR, RANKED_YEAR_START, rankedSeasonAt, type RankedSeason } from "./ranked-year";

/*
  THE RANK TIMELINE: what Ranked progress draws for one account and queue, from the stored readings
  only.

  Riot reports only the current rank (LEAGUE-V4), so a rank at a past moment exists only where
  UNIIVERSE read it. The chart therefore spans the stretch that has readings: from the first
  reading in the 2026 ranked year to now (at least a few days, so a new account's chart is not a
  dot). The months before the first reading are not drawn as an empty band; `rankedYearCoverage`
  says in words and as a small strip how much of the ranked year that is, beside the games stored
  for the whole year (which are real: MATCH-V5).

  A reading is a rank Riot reported, seen from its first sight to its last confirmation. Between
  two consecutive readings the line goes on only where nothing could have happened unseen: no game
  or one game between them (the rank held until the change). Where Riot's count says two or more
  games fell between them, the path between is unknown: a gap, never a line. A reset (the count
  going down) or unranked readings break the line too.

  Promotions and demotions are read from consecutive readings: exact when at most one game lies
  between them, "between" two dates when more. The highest rank is the highest reading: the highest
  recorded, which a gap may hide a higher one behind.
*/

export interface TimelineReading {
  /** First sight (ms). */
  from: number;
  /** Last confirmation (ms); the first sight for readings stored before confirmations were kept. */
  to: number;
  /** Place on the ladder (domain/rank-progress ladderScore); null when unranked. */
  score: number | null;
  /** "Gold II", "Unranked" */
  label: string;
  tier: string | null;
  division: string | null;
  lp: number | null;
  wins: number | null;
  losses: number | null;
}

export type TimelineLinkKind = "step" | "gap" | "reset";

/** What lies between reading i and reading i + 1. */
export interface TimelineLink {
  kind: TimelineLinkKind;
  /** Riot's count of games between them, when both readings carry one. */
  games: number | null;
}

export type TimelineMarkerKind = "promotion" | "demotion" | "placed" | "reset";

export interface TimelineMarker {
  kind: TimelineMarkerKind;
  /** When the new rank was first seen (ms). */
  at: number;
  /** The last sight of the rank before (ms): the change happened between the two. */
  since: number;
  from: string;
  to: string;
  /** At most one game between the two readings, so the change belongs to that game. */
  exact: boolean;
}

export interface RankTimeline {
  /** The drawn stretch (ms): the first reading (or a few days before now, if later) to now. */
  from: number;
  to: number;
  /** The first reading in this queue in the ranked year (ms); null without any. */
  trackingSince: number | null;
  /** The ranked year's readings, oldest first. */
  readings: TimelineReading[];
  /** links[i] lies between readings[i] and readings[i + 1]. */
  links: TimelineLink[];
  markers: TimelineMarker[];
  /** The highest recorded rank: its reading's first sight. */
  peak: { at: number; score: number; label: string; lp: number } | null;
  /** The latest reading in this queue. */
  latest: TimelineReading | null;
  /** The ladder scores the readings span, padded to whole divisions; null without a ranked reading. */
  scoreRange: [number, number] | null;
}

/** The shortest stretch drawn (ms), so a chart of a new account's first reading still reads as a line. */
export const MIN_DRAWN_SPAN = 3 * 86_400_000;

const DIVISIONS = ["IV", "III", "II", "I"] as const;
const APEX_FROM = TIERS.indexOf("MASTER");
const tierIndex = (tier: string | null) => (tier ? TIERS.indexOf(tier.toUpperCase() as (typeof TIERS)[number]) : -1);
const divisionOrder = (r: { tier: string | null; division: string | null }) => {
  const t = tierIndex(r.tier);
  return t * 4 + (t >= APEX_FROM ? 3 : Math.max(0, DIVISIONS.indexOf((r.division ?? "IV").toUpperCase() as (typeof DIVISIONS)[number])));
};
const games = (r: { wins: number | null; losses: number | null }) => (r.wins === null || r.losses === null ? null : r.wins + r.losses);
const DAY = 86_400_000;
const WEEK = 7 * DAY;
const isApex = (tier: string | null) => tierIndex(tier) >= APEX_FROM;

/** The readings of one queue, consecutive identical ones joined (first sight to last confirmation). */
export function timelineReadings(snapshots: readonly RankSnapshot[]): TimelineReading[] {
  const sorted = [...snapshots].sort((a, b) => a.capturedAt - b.capturedAt);
  const out: TimelineReading[] = [];
  for (const s of sorted) {
    const to = Math.max(s.capturedAt, s.confirmedAt ?? s.capturedAt);
    const prev = out.at(-1);
    if (prev && prev.tier === s.tier && prev.division === s.division && prev.lp === (s.tier ? s.leaguePoints : null) && prev.wins === s.wins && prev.losses === s.losses) {
      prev.to = Math.max(prev.to, to);
      continue;
    }
    out.push({ from: s.capturedAt, to, score: ladderScore(s), label: rankLabel(s.tier, s.division), lp: s.tier ? s.leaguePoints : null, wins: s.wins, losses: s.losses, tier: s.tier, division: s.division });
  }
  return out;
}

/**
 * Builds the timeline of one queue's readings in the 2026 ranked year: the stretch from the first
 * reading to now, never the months before it (nothing was read there).
 */
export function rankTimeline(snapshots: readonly RankSnapshot[], now: number): RankTimeline {
  const yearEnd = Date.UTC(RANKED_YEAR + 1, 0, 1);
  const all = timelineReadings(snapshots).filter((r) => r.to >= RANKED_YEAR_START && r.from < yearEnd);
  const links: TimelineLink[] = [];
  const markers: TimelineMarker[] = [];
  for (let i = 0; i + 1 < all.length; i++) {
    const a = all[i]!;
    const b = all[i + 1]!;
    const ga = games(a);
    const gb = games(b);
    const between = ga !== null && gb !== null ? gb - ga : null;
    if (a.score === null || b.score === null || (between !== null && between < 0)) {
      links.push({ kind: "reset", games: null });
      markers.push({ kind: a.score === null && b.score !== null ? "placed" : "reset", at: b.from, since: a.to, from: a.label, to: b.label, exact: false });
      continue;
    }
    links.push({ kind: between !== null && between >= 2 ? "gap" : "step", games: between });
    if (a.tier !== b.tier || a.division !== b.division) {
      markers.push({ kind: divisionOrder(b) > divisionOrder(a) ? "promotion" : "demotion", at: b.from, since: a.to, from: a.label, to: b.label, exact: between !== null && between <= 1 });
    }
  }
  let peak: RankTimeline["peak"] = null;
  for (const r of all) if (r.score !== null && (!peak || r.score >= peak.score)) peak = { at: r.from, score: r.score, label: r.label, lp: r.lp ?? 0 };
  const scores = all.filter((r) => r.score !== null).map((r) => r.score!);
  const scoreRange: [number, number] | null = scores.length ? [Math.floor((Math.min(...scores) - 20) / 100) * 100, Math.ceil((Math.max(...scores) + 20) / 100) * 100] : null;
  const trackingSince = all[0]?.from ?? null;
  const to = Math.max(now, all.at(-1)?.to ?? now);
  const from = trackingSince === null ? to - MIN_DRAWN_SPAN : Math.max(RANKED_YEAR_START, Math.min(trackingSince, to - MIN_DRAWN_SPAN));
  return { from, to, trackingSince, readings: all, links, markers, peak, latest: all.at(-1) ?? null, scoreRange };
}

/**
 * How the rank moved: from the reading in effect when the window began (30 days ago) to the latest,
 * within the current ladder (never across a reset). When recording began inside the window the
 * first reading is the start instead (`windowed` false), so the figure never claims more days
 * than were read. Null without two different readings to compare, or when the latest is unranked.
 *
 *   lp         one LP ladder (the same division, or both Master and above): the LP difference
 *   divisions  divisions apart below Master, the LP left aside (after a promotion the LP restarts)
 *   tiers      across the Master line: only the two ranks are named
 */
export interface RankMovement {
  from: TimelineReading;
  to: TimelineReading;
  windowed: boolean;
  kind: "lp" | "divisions" | "tiers";
  /** The LP difference ("lp"), or divisions gained, negative for lost ("divisions"); 0 for "tiers". */
  amount: number;
}

export function rankMovement(t: Pick<RankTimeline, "readings" | "links">, now: number, windowDays = 30): RankMovement | null {
  const last = t.readings.length - 1;
  if (last < 1 || t.readings[last]!.score === null) return null;
  let first = last;
  while (first > 0 && t.links[first - 1]!.kind !== "reset" && t.readings[first - 1]!.score !== null) first -= 1;
  const since = now - windowDays * DAY;
  let start = first;
  for (let i = first; i <= last; i++) if (t.readings[i]!.from <= since) start = i;
  if (start === last) return null;
  const from = t.readings[start]!;
  const to = t.readings[last]!;
  const windowed = from.from <= since;
  if (isApex(from.tier) !== isApex(to.tier)) return { from, to, windowed, kind: "tiers", amount: 0 };
  if (isApex(from.tier) || (from.tier === to.tier && from.division === to.division)) return { from, to, windowed, kind: "lp", amount: (to.lp ?? 0) - (from.lp ?? 0) };
  return { from, to, windowed, kind: "divisions", amount: divisionOrder(to) - divisionOrder(from) };
}

/**
 * The 2026 ranked year so far, for the coverage strip: its seasons (one ladder, Riot's "Season 1",
 * "Season 2", "Season 3"), the stored ranked games week by week (MATCH-V5: the whole year), and the
 * part of the year that has rank readings.
 */
export interface RankedYearCoverage {
  from: number;
  to: number;
  seasons: Array<{ label: string; from: number }>;
  /** The season now (Riot's numbering within the 2026 ranked year); null outside it. */
  season: RankedSeason | null;
  trackedFrom: number | null;
  /** Whole days of the year so far, and of them the days since the first reading. */
  yearDays: number;
  trackedDays: number;
  weeks: Array<{ week: number; wins: number; losses: number }>;
  games: { wins: number; losses: number };
}

export function rankedYearCoverage(trackingSince: number | null, weeks: ReadonlyArray<{ week: number; wins: number; losses: number }>, now: number): RankedYearCoverage {
  const from = RANKED_YEAR_START;
  const to = Math.min(Math.max(now, from), Date.UTC(RANKED_YEAR + 1, 0, 1));
  const inYear = weeks.filter((w) => w.week + WEEK > from && w.week <= to).sort((a, b) => a.week - b.week);
  const trackedFrom = trackingSince !== null && trackingSince <= to ? Math.max(from, trackingSince) : null;
  return {
    from,
    to,
    seasons: RANKED_SEASONS_2026.filter((s) => s.from <= to).map((s) => ({ label: s.label, from: s.from })),
    season: rankedSeasonAt(now),
    trackedFrom,
    yearDays: Math.max(1, Math.ceil((to - from) / DAY)),
    trackedDays: trackedFrom === null ? 0 : Math.max(1, Math.ceil((to - trackedFrom) / DAY)),
    weeks: inYear,
    games: { wins: inYear.reduce((n, w) => n + w.wins, 0), losses: inYear.reduce((n, w) => n + w.losses, 0) },
  };
}

const SHORT_TIER: Record<string, string> = { PLATINUM: "Plat", EMERALD: "Emer", DIAMOND: "Dia", GRANDMASTER: "GM", CHALLENGER: "Chall" };

/** "Gold II", or on a narrow chart "Plat II" / "Emer IV" / "Dia I". */
function gridLabel(tier: string, division: string | null, short: boolean): string {
  const full = rankLabel(tier, division);
  if (!short || !SHORT_TIER[tier]) return full;
  return division ? `${SHORT_TIER[tier]} ${division}` : SHORT_TIER[tier]!;
}

/** Division gridlines for a score range: each division where few, each tier's first division where more than `maxDivisions`. */
export function ladderGrid(range: [number, number], opts: { maxDivisions?: number; short?: boolean } = {}): Array<{ score: number; label: string }> {
  const [lo, hi] = range;
  const many = (hi - lo) / 100 > (opts.maxDivisions ?? 6);
  const out: Array<{ score: number; label: string }> = [];
  for (let s = Math.ceil(lo / 100) * 100; s <= hi; s += 100) {
    const apex = s >= APEX_FROM * 400;
    if (apex) {
      if (s === APEX_FROM * 400) out.push({ score: s, label: "Master" });
      continue;
    }
    const tier = TIERS[Math.floor(s / 400)]!;
    const div = DIVISIONS[Math.floor((s % 400) / 100)]!;
    if (many && div !== "IV") continue;
    out.push({ score: s, label: gridLabel(tier, many ? null : div, !!opts.short) });
  }
  return out;
}
