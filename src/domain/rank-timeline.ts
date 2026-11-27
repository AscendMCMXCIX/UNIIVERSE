import { ladderScore, rankCode, rankLabel, TIERS, type RankSnapshot } from "./rank-progress";
import { nextRankedYear, RANKED_YEAR_START, RANKED_YEARS, rankedYearAt, seasonOfYearAt, YEAR_RESET_LEAD_DAYS, type RankedSeason, type RankedYear } from "./ranked-year";
import { isoDay, localPeriodStarts } from "@/lib/format";

/*
  THE RANK TIMELINE: what Ranked progress draws for one account and queue, from the stored readings
  only.

  Riot reports only the current rank (LEAGUE-V4), so a rank at a past moment exists only where
  UNIIVERSE read it. The chart therefore spans the stretch that has readings: from the first
  reading on the account's current ladder (its ranked year, `ladderOf`) to now (at least a few
  days, so a new account's chart is not a dot). The months before the first reading are not drawn as an empty band; `rankedYearCoverage`
  works out how much of the ranked year that is, beside the games stored for the whole year (which
  are real: MATCH-V5). Ranked progress showed it in words and as a small strip until 18 Nov 2026,
  when History and coverage left the card; it is kept, with its tests (docs/RANKED_PROGRESS.md).

  A reading is a rank Riot reported, seen from its first sight to its last confirmation. Between
  two consecutive readings the line goes on only where nothing could have happened unseen: no game
  or one game between them (the rank held until the change). Where Riot's count says two or more
  games fell between them, the path between is unknown: a gap, never a line. A reset (the count
  going down) or unranked readings break the line too.

  Promotions and demotions are read from consecutive readings: exact when at most one game lies
  between them, "between" two dates when more. The highest rank is the highest reading: the highest
  recorded, which a gap may hide a higher one behind.

  THE YEAR BOUNDARY (27 Nov 2026, the 2027 ranked year): an account's ranked year ends at its own
  reset reading, never at a date. Riot resets every rank at the start of a year (2027: to Iron IV,
  the count restarting), and nothing else restarts the count within a year, so the first reset
  link whose later reading lies no earlier than YEAR_RESET_LEAD_DAYS before the next year's
  (estimated) first day opens that year for the account. Until that reading exists the account is
  still on the old ladder, whatever the calendar says: January's pre-reset readings stay in 2026's
  chart, its highest recorded rank and its 30-day change. A reset whose next ranked reading carries
  Riot's count unchanged (a missing entry for a moment, then the same rank) opens nothing. An
  account first read after a year's first day (linked then) starts on that year by date.
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
  /** The first reading in this queue on the current ladder (ms); null without any. */
  trackingSince: number | null;
  /** The current ladder's readings, oldest first (every year's with `anyYear`). */
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
  /** The account's current ladder: its ranked year and where it opened (`ladderOf`). */
  ladder: RankLadder;
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
 * The ladder an account is on now: the ranked year its readings place it in, from where on its
 * readings belong to that year (`start`, an index into the readings), and the floor of what is
 * drawn (`from`). `opened` says what decided: "first", the first ranked year (8 January 2026);
 * "date", the first reading was taken after a later year's first day (an account linked then);
 * "reset", the account's own reset reading near a year's start (the file's head). Without a
 * reading, the year by date: the only place the 2027 estimate decides anything.
 */
export interface RankLadder {
  year: RankedYear;
  start: number;
  from: number;
  opened: "first" | "date" | "reset";
}

export function ladderOf(readings: readonly TimelineReading[], links: readonly TimelineLink[], now: number): RankLadder {
  const first = readings[0];
  const byDate = rankedYearAt(first ? first.from : now) ?? RANKED_YEARS[0]!;
  let ladder: RankLadder = { year: byDate, start: 0, from: byDate.from, opened: byDate === RANKED_YEARS[0] ? "first" : "date" };
  if (!first) return ladder;
  // A year placed by date may still hold readings of the old ladder (Riot reset later than the
  // estimate): its own reset reading opens it.
  if (ladder.opened === "date") {
    const at = resetInto(ladder.year, readings, links, 0);
    if (at !== null) ladder = { ...ladder, start: at, from: readings[at]!.from, opened: "reset" };
  }
  for (let next = nextRankedYear(ladder.year); next; next = nextRankedYear(ladder.year)) {
    const at = resetInto(next, readings, links, ladder.start);
    if (at === null) break;
    ladder = { year: next, start: at, from: readings[at]!.from, opened: "reset" };
  }
  return ladder;
}

/** The index of the reading that opens `year` for the account (the reading after its reset), searching from `from`; null without one. */
function resetInto(year: RankedYear, readings: readonly TimelineReading[], links: readonly TimelineLink[], from: number): number | null {
  const floor = year.from - YEAR_RESET_LEAD_DAYS * DAY;
  let lastGames: number | null = null;
  for (let i = from; i + 1 < readings.length; i++) {
    if (readings[i]!.score !== null) lastGames = games(readings[i]!);
    if (links[i]?.kind !== "reset" || readings[i + 1]!.from < floor) continue;
    // Riot's count restarts at a year's reset: a later ranked reading with the count unchanged (or
    // higher) means the entry went missing for a moment, not a new ladder.
    const after = readings.slice(i + 1).find((r) => r.score !== null);
    const count = after ? games(after) : null;
    if (!after || lastGames === null || count === null || count < lastGames) return i + 1;
  }
  return null;
}

/** The links between consecutive readings and the rank changes they mark. */
function linksOf(all: readonly TimelineReading[]): { links: TimelineLink[]; markers: TimelineMarker[] } {
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
  return { links, markers };
}

/**
 * Builds the timeline of one queue's readings on the account's current ladder (its ranked year,
 * `ladderOf`): the stretch from the ladder's first reading to now, never the months before it
 * (nothing was read there). `anyYear` keeps the readings of every year, for a figure over the last
 * days rather than the ranked year's view: a new year's reset is a reset link, which rankMovement
 * never crosses.
 */
export function rankTimeline(snapshots: readonly RankSnapshot[], now: number, options: { anyYear?: boolean } = {}): RankTimeline {
  const read = timelineReadings(snapshots).filter((r) => options.anyYear || r.to >= RANKED_YEAR_START);
  const ladder = ladderOf(read, linksOf(read).links, now);
  const all = options.anyYear ? read : read.slice(ladder.start);
  const { links, markers } = linksOf(all);
  let peak: RankTimeline["peak"] = null;
  for (const r of all) if (r.score !== null && (!peak || r.score > peak.score)) peak = { at: r.from, score: r.score, label: r.label, lp: r.lp ?? 0 };
  const scores = all.filter((r) => r.score !== null).map((r) => r.score!);
  const scoreRange: [number, number] | null = scores.length ? [Math.max(0, Math.floor((Math.min(...scores) - 20) / 100) * 100), Math.ceil((Math.max(...scores) + 20) / 100) * 100] : null;
  const trackingSince = all[0]?.from ?? null;
  const to = Math.max(now, all.at(-1)?.to ?? now);
  const floor = options.anyYear ? RANKED_YEAR_START : ladder.from;
  const from = trackingSince === null ? to - MIN_DRAWN_SPAN : Math.max(floor, Math.min(trackingSince, to - MIN_DRAWN_SPAN));
  return { from, to, trackingSince, readings: all, links, markers, peak, latest: all.at(-1) ?? null, scoreRange, ladder };
}

/**
 * How the rank moved over the last 30 days, within the current ladder (never across a reset):
 *
 * - from the reading in effect when the window began: one seen at or before that moment and still
 *   confirmed then, or followed by its next reading within a single game (the rank held until it);
 * - otherwise (recording began inside the window, or several unseen games straddle its start) from
 *   the first reading inside the window, `windowed` false, so the figure never claims days, or
 *   games, that were not read;
 * - "no change" (an LP movement of 0) when the latest reading was already in effect at the window's
 *   start and is confirmed inside it.
 *
 * Null when the latest reading is unranked, when nothing was confirmed inside the window, or with no
 * second reading inside it to compare.
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
  const to = t.readings[last];
  if (!to || to.score === null) return null;
  const since = now - windowDays * DAY;
  if (to.to < since) return null;
  let first = last;
  while (first > 0 && t.links[first - 1]!.kind !== "reset" && t.readings[first - 1]!.score !== null) first -= 1;
  let start = -1;
  for (let i = first; i <= last; i++) if (t.readings[i]!.from <= since) start = i;
  if (start === last) return { from: to, to, windowed: true, kind: "lp", amount: 0 };
  let windowed = start >= 0 && (t.readings[start]!.to >= since || t.links[start]!.kind === "step");
  if (!windowed) {
    start = -1;
    for (let i = first; i <= last; i++) {
      if (t.readings[i]!.from > since) {
        start = i;
        break;
      }
    }
    windowed = false;
  }
  if (start < 0 || start === last) return null;
  const from = t.readings[start]!;
  if (isApex(from.tier) !== isApex(to.tier)) return { from, to, windowed, kind: "tiers", amount: 0 };
  if (isApex(from.tier) || (from.tier === to.tier && from.division === to.division)) return { from, to, windowed, kind: "lp", amount: (to.lp ?? 0) - (from.lp ?? 0) };
  return { from, to, windowed, kind: "divisions", amount: divisionOrder(to) - divisionOrder(from) };
}

/**
 * The stretches over which the rank is known: each reading from its first sight to its last
 * confirmation, carried on to the next reading when at most one game lies between them (the rank
 * held until that game). Several unseen games, or a reset, leave the stretch between unknown.
 */
export function knownSpans(t: Pick<RankTimeline, "readings" | "links">): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  t.readings.forEach((r, i) => {
    const next = t.readings[i + 1];
    const end = next && t.links[i]?.kind === "step" ? next.from : r.to;
    const prev = out.at(-1);
    if (prev && r.from <= prev[1]) prev[1] = Math.max(prev[1], end);
    else out.push([r.from, end]);
  });
  return out;
}

/** The installation's calendar days a set of stretches touches (as "2026-10-21"). */
function daysTouched(spans: ReadonlyArray<[number, number]>): Set<string> {
  const days = new Set<string>();
  for (const [a, b] of spans) {
    days.add(isoDay(a));
    for (const at of localPeriodStarts(a, b, "day")) days.add(isoDay(at));
  }
  return days;
}

/**
 * The account's current ranked year so far (its ladder, `ladderOf`), as the coverage strip drew it
 * (no page shows it since 18 Nov 2026; see the file's head): its seasons (one ladder, Riot's
 * "Season 1", "Season 2", "Season 3"), the stored ranked games week by week (MATCH-V5: the whole
 * year), and the part of the year that has rank readings. It ends now (the ladder is the current
 * one), counted to today's day and no further.
 */
export interface RankedYearCoverage {
  from: number;
  to: number;
  seasons: Array<{ label: string; from: number }>;
  /** The season now (Riot's numbering within the ladder's ranked year). */
  season: RankedSeason | null;
  trackedFrom: number | null;
  /** The installation's calendar days of the year so far, and of them the days the rank is known on (`knownSpans`). */
  yearDays: number;
  knownDays: number;
  weeks: Array<{ week: number; wins: number; losses: number }>;
  games: { wins: number; losses: number };
}

export function rankedYearCoverage(t: Pick<RankTimeline, "trackingSince" | "readings" | "links" | "ladder">, weeks: ReadonlyArray<{ week: number; wins: number; losses: number }>, now: number): RankedYearCoverage {
  const from = t.ladder.from;
  const to = Math.max(now, from);
  const inYear = weeks.filter((w) => w.week + WEEK > from && w.week <= to).sort((a, b) => a.week - b.week);
  const trackedFrom = t.trackingSince !== null && t.trackingSince <= to ? Math.max(from, t.trackingSince) : null;
  const spans = knownSpans(t)
    .map(([a, b]): [number, number] => [Math.max(a, from), Math.min(b, to)])
    .filter(([a, b]) => b >= a);
  return {
    from,
    to,
    seasons: t.ladder.year.seasons.filter((s, i) => i === 0 || s.from <= to).map((s) => ({ label: s.label, from: s.from })),
    season: seasonOfYearAt(t.ladder.year, now),
    trackedFrom,
    yearDays: daysTouched([[from, to]]).size,
    knownDays: daysTouched(spans).size,
    weeks: inYear,
    games: { wins: inYear.reduce((n, w) => n + w.wins, 0), losses: inYear.reduce((n, w) => n + w.losses, 0) },
  };
}

/**
 * "Gold II" (a tier alone, "Gold", where only tiers are lined), or on a narrow chart the code match
 * cards use, in one notation: "G2", and a tier's line by its first division, "E4".
 */
function gridLabel(tier: string, division: string | null, short: boolean): string {
  return short ? rankCode(tier, division) : rankLabel(tier, division);
}

/**
 * Division gridlines for a score range: each division where few, each tier's first division where
 * more than `maxDivisions`; Master's line, where the range reaches it ("M" on a narrow chart).
 * A wide chart names a tier's line by the tier ("Emerald"), a narrow one by its division code
 * ("E4"), never a bare letter beside the apex's "M".
 */
export function ladderGrid(range: [number, number], opts: { maxDivisions?: number; short?: boolean } = {}): Array<{ score: number; label: string }> {
  const [lo, hi] = range;
  const many = (hi - lo) / 100 > (opts.maxDivisions ?? 6);
  const out: Array<{ score: number; label: string }> = [];
  for (let s = Math.ceil(lo / 100) * 100; s <= hi; s += 100) {
    const apex = s >= APEX_FROM * 400;
    if (apex) {
      if (s === APEX_FROM * 400) out.push({ score: s, label: opts.short ? "M" : "Master" });
      continue;
    }
    const tier = TIERS[Math.floor(s / 400)]!;
    const div = DIVISIONS[Math.floor((s % 400) / 100)]!;
    if (many && div !== "IV") continue;
    out.push({ score: s, label: gridLabel(tier, many && !opts.short ? null : div, !!opts.short) });
  }
  return out;
}
