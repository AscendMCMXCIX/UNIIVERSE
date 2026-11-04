import { ladderScore, rankLabel, TIERS, type RankSnapshot } from "./rank-progress";
import { rankedRange, type RankedSeasonKey } from "./ranked-year";

/*
  THE RANK TIMELINE: what Ranked progress draws for one account and queue over a view (the whole
  2026 ranked year, or one of its seasons), from the stored readings only.

  A reading is a rank Riot reported, seen from its first sight to its last confirmation. Between
  two consecutive readings the line goes on only where nothing could have happened unseen: no game
  or one game between them (the rank held until the change). Where Riot's count says two or more
  games fell between them, the path between is unknown: a gap, never a line. A reset (the count
  going down) or unranked readings break the line too. Before the first reading nothing is known:
  that stretch is "not recorded", however many games were played in it (the weeks' games are
  drawn below, from the stored games, which are real).

  Promotions and demotions are read from consecutive readings: exact when at most one game lies
  between them, "between" two dates when more. The highest rank is the highest reading in view:
  the highest recorded, which a gap may hide a higher one behind.
*/

export type RankView = "year" | RankedSeasonKey;
export const RANK_VIEWS: readonly RankView[] = ["year", "s1", "s2", "s3"];

export function isRankView(v: unknown): v is RankView {
  return typeof v === "string" && (RANK_VIEWS as readonly string[]).includes(v);
}

export interface TimelineReading {
  /** First sight (ms). */
  from: number;
  /** Last confirmation (ms); the first sight for readings stored before confirmations were kept. */
  to: number;
  /** Place on the ladder (domain/rank-progress ladderScore); null when unranked. */
  score: number | null;
  /** "Gold II", "Unranked" */
  label: string;
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
  view: RankView;
  from: number;
  to: number;
  /** The first reading in this queue (ms), whenever it was; null without any. */
  trackingSince: number | null;
  /** The readings that touch the view (with the last one before it, whose rank may run into it), oldest first. */
  readings: TimelineReading[];
  /** links[i] lies between readings[i] and readings[i + 1]. */
  links: TimelineLink[];
  markers: TimelineMarker[];
  /** The highest recorded rank in view: its reading's first sight. */
  peak: { at: number; score: number; label: string; lp: number } | null;
  /** The latest reading in this queue, whenever it was. */
  latest: TimelineReading | null;
  /** The stored ranked games of the queue by week (Monday 00:00 UTC, ms), within the view. */
  weeks: Array<{ week: number; wins: number; losses: number }>;
  /** The stored games in view. */
  games: { wins: number; losses: number };
  /** The ladder scores the view's readings span, padded to whole divisions; null without a ranked reading. */
  scoreRange: [number, number] | null;
}

const DIVISIONS = ["IV", "III", "II", "I"] as const;
const APEX_FROM = TIERS.indexOf("MASTER");
const tierIndex = (tier: string | null) => (tier ? TIERS.indexOf(tier.toUpperCase() as (typeof TIERS)[number]) : -1);
const divisionOrder = (r: { tier: string | null; division: string | null }) => {
  const t = tierIndex(r.tier);
  return t * 4 + (t >= APEX_FROM ? 3 : Math.max(0, DIVISIONS.indexOf((r.division ?? "IV").toUpperCase() as (typeof DIVISIONS)[number])));
};
const games = (r: { wins: number | null; losses: number | null }) => (r.wins === null || r.losses === null ? null : r.wins + r.losses);
const WEEK = 7 * 86_400_000;

/** The readings of one queue, consecutive identical ones joined (first sight to last confirmation). */
export function timelineReadings(snapshots: readonly RankSnapshot[]): Array<TimelineReading & { tier: string | null; division: string | null }> {
  const sorted = [...snapshots].sort((a, b) => a.capturedAt - b.capturedAt);
  const out: Array<TimelineReading & { tier: string | null; division: string | null }> = [];
  for (const s of sorted) {
    const to = Math.max(s.capturedAt, s.confirmedAt ?? s.capturedAt);
    const prev = out.at(-1);
    if (prev && prev.tier === s.tier && prev.division === s.division && prev.lp === s.leaguePoints && prev.wins === s.wins && prev.losses === s.losses) {
      prev.to = Math.max(prev.to, to);
      continue;
    }
    out.push({ from: s.capturedAt, to, score: ladderScore(s), label: rankLabel(s.tier, s.division), lp: s.tier ? s.leaguePoints : null, wins: s.wins, losses: s.losses, tier: s.tier, division: s.division });
  }
  return out;
}

/** Builds the timeline of one queue's readings over a view. */
export function rankTimeline(snapshots: readonly RankSnapshot[], weeks: ReadonlyArray<{ week: number; wins: number; losses: number }>, view: RankView, now: number): RankTimeline {
  const range = rankedRange(view, now);
  const all = timelineReadings(snapshots);
  // The readings that touch the view, with the one before it (its rank can run into the view).
  const firstIn = all.findIndex((r) => r.to >= range.from);
  const start = firstIn < 0 ? all.length : Math.max(0, firstIn - 1);
  const end = (() => {
    let i = all.length - 1;
    while (i >= 0 && all[i]!.from > range.to) i -= 1;
    return i;
  })();
  const picked = start <= end ? all.slice(start, end + 1) : [];
  const links: TimelineLink[] = [];
  const markers: TimelineMarker[] = [];
  for (let i = 0; i + 1 < picked.length; i++) {
    const a = picked[i]!;
    const b = picked[i + 1]!;
    const ga = games(a);
    const gb = games(b);
    const between = ga !== null && gb !== null ? gb - ga : null;
    if (a.score === null || b.score === null || (between !== null && between < 0)) {
      links.push({ kind: "reset", games: null });
      if (b.score !== null) markers.push({ kind: a.score === null ? "placed" : "reset", at: b.from, since: a.to, from: a.label, to: b.label, exact: false });
      else markers.push({ kind: "reset", at: b.from, since: a.to, from: a.label, to: b.label, exact: false });
      continue;
    }
    links.push({ kind: between !== null && between >= 2 ? "gap" : "step", games: between });
    if (a.tier !== b.tier || a.division !== b.division) {
      markers.push({ kind: divisionOrder(b) > divisionOrder(a) ? "promotion" : "demotion", at: b.from, since: a.to, from: a.label, to: b.label, exact: between !== null && between <= 1 });
    }
  }
  const inView = picked.filter((r) => r.to >= range.from && r.from <= range.to);
  const ranked = inView.filter((r) => r.score !== null);
  let peak: RankTimeline["peak"] = null;
  for (const r of ranked) if (!peak || r.score! >= peak.score) peak = { at: Math.max(r.from, range.from), score: r.score!, label: r.label, lp: r.lp ?? 0 };
  const scores = picked.filter((r) => r.score !== null).map((r) => r.score!);
  const scoreRange: [number, number] | null = scores.length ? [Math.floor((Math.min(...scores) - 20) / 100) * 100, Math.ceil((Math.max(...scores) + 20) / 100) * 100] : null;
  const viewWeeks = weeks.filter((w) => w.week + WEEK > range.from && w.week <= range.to).sort((a, b) => a.week - b.week);
  const strip = (r: TimelineReading & { tier: string | null; division: string | null }): TimelineReading => ({ from: r.from, to: r.to, score: r.score, label: r.label, lp: r.lp, wins: r.wins, losses: r.losses });
  return {
    view,
    from: range.from,
    to: range.to,
    trackingSince: all[0]?.from ?? null,
    readings: picked.map(strip),
    links,
    markers: markers.filter((m) => m.at >= range.from && m.at <= range.to),
    peak,
    latest: all.length ? strip(all.at(-1)!) : null,
    weeks: viewWeeks,
    games: { wins: viewWeeks.reduce((s, w) => s + w.wins, 0), losses: viewWeeks.reduce((s, w) => s + w.losses, 0) },
    scoreRange,
  };
}

/** Division gridlines for a score range: each division where few, each tier's first division where many. */
export function ladderGrid(range: [number, number]): Array<{ score: number; label: string }> {
  const [lo, hi] = range;
  const many = (hi - lo) / 100 > 6;
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
    out.push({ score: s, label: many ? rankLabel(tier, null) : rankLabel(tier, div) });
  }
  return out;
}
