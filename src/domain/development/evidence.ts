import { MEASURES, measureValue, type MeasureKey, type MeasuredGame } from "./measures";

/*
  Objective evidence: the chosen statistic in the games played while practising an objective,
  compared with the player's games just before they started, in the same role (and on the
  objective's champions when it names some). Plain averages and a deliberately cautious rule:

    - each period needs MIN_GAMES games that have the figure, or the answer is "not enough games";
    - a change counts only when it is larger than the statistic's smallest meaningful difference
      AND at least SIMILAR_EFFECT of the games' usual spread (a standardised difference), so one
      unusual game cannot make a trend;
    - the answer is an observation about the games ("lower than before"), never a verdict on the
      player's skill: champions, opponents and teammates change between games.

  Everything here is deterministic and explainable: the page shows the numbers it compared.
*/

export const MIN_GAMES = 5;
export const MAX_GAMES = 20;
/** A standardised difference below this is "about the same". */
export const SIMILAR_EFFECT = 0.3;
/** Below this share of practice games on champions also played before, the comparison is flagged as rougher. */
export const CHAMPION_OVERLAP_NOTE = 0.5;

export interface PeriodStats {
  /** Games in the period that have the figure. */
  games: number;
  /** Games in the period without it (no timeline yet, an older record). */
  missing: number;
  mean: number;
  sd: number;
}

export type EvidenceResult =
  | { state: "no-measure" }
  | { state: "insufficient"; measure: MeasureKey; baseline: number; practice: number; needed: number; missingPractice: number }
  | {
      state: "compared";
      measure: MeasureKey;
      baseline: PeriodStats;
      practice: PeriodStats;
      difference: number;
      effect: number;
      /** Relative to the statistic's better direction. */
      trend: "toward" | "away" | "similar";
      /** Share of practice games on champions also played in the baseline (0–1). */
      championOverlap: number;
    };

function stats(values: number[], missing: number): PeriodStats {
  const n = values.length;
  const mean = n ? values.reduce((a, b) => a + b, 0) / n : 0;
  const variance = n > 1 ? values.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1) : 0;
  return { games: n, missing, mean, sd: Math.sqrt(variance) };
}

/** The most recent MAX_GAMES games of a list, newest first. */
export function newest<T extends { playedAt: number }>(games: readonly T[], max = MAX_GAMES): T[] {
  return [...games].sort((a, b) => b.playedAt - a.playedAt).slice(0, max);
}

/**
 * Compares a statistic between the games before practice started and the games since. Both lists
 * should already hold the same role (and the objective's champions, when it has some); each is cut
 * to its newest MAX_GAMES games.
 */
export function compareMeasure(measure: MeasureKey | null, before: readonly MeasuredGame[], during: readonly MeasuredGame[]): EvidenceResult {
  if (!measure) return { state: "no-measure" };
  const pick = (games: readonly MeasuredGame[]) => {
    const recent = newest(games);
    const values = recent.map((g) => measureValue(measure, g)).filter((v): v is number => v !== null && Number.isFinite(v));
    return { recent, values, missing: recent.length - values.length };
  };
  const b = pick(before);
  const p = pick(during);
  if (b.values.length < MIN_GAMES || p.values.length < MIN_GAMES) return { state: "insufficient", measure, baseline: b.values.length, practice: p.values.length, needed: MIN_GAMES, missingPractice: p.missing };
  const baseline = stats(b.values, b.missing);
  const practice = stats(p.values, p.missing);
  const difference = practice.mean - baseline.mean;
  // Pooled spread; a period where every game had the same value still has a spread from the other.
  const pooled = Math.sqrt(((baseline.games - 1) * baseline.sd ** 2 + (practice.games - 1) * practice.sd ** 2) / (baseline.games + practice.games - 2));
  const effect = pooled > 0 ? difference / pooled : difference === 0 ? 0 : Math.sign(difference) * Infinity;
  const def = MEASURES[measure];
  const meaningful = Math.abs(difference) >= def.minDifference && Math.abs(effect) >= SIMILAR_EFFECT;
  const better = def.better === "lower" ? difference < 0 : difference > 0;
  const trend = !meaningful ? "similar" : better ? "toward" : "away";
  const seen = new Set(b.recent.map((g) => g.championId));
  const championOverlap = p.recent.length ? p.recent.filter((g) => seen.has(g.championId)).length / p.recent.length : 0;
  return { state: "compared", measure, baseline, practice, difference, effect, trend, championOverlap };
}

/** "4.1" / "62%": a statistic's value as the page writes it. */
export function formatMeasure(measure: MeasureKey, value: number): string {
  const def = MEASURES[measure];
  return `${value.toFixed(def.decimals)}${def.suffix}`;
}

export interface EvidenceText {
  headline: string;
  detail: string;
  /** What the comparison cannot say, always shown with it. */
  caveat: string;
}

/** Plain words for an evidence result: what was compared, what it showed, what it cannot show. */
export function describeEvidence(r: EvidenceResult): EvidenceText | null {
  if (r.state === "no-measure") return null;
  const def = MEASURES[r.measure];
  if (r.state === "insufficient") {
    const waiting = r.missingPractice > 0 && def.source === "timeline" ? ` ${r.missingPractice} recent game${r.missingPractice === 1 ? " is" : "s are"} still waiting for ${r.missingPractice === 1 ? "its" : "their"} timeline.` : "";
    return {
      headline: "Not enough games to compare yet",
      detail: `${def.label} needs ${r.needed} games before you started practising and ${r.needed} since; there are ${r.baseline} and ${r.practice}.${waiting}`,
      caveat: def.cannotShow,
    };
  }
  const before = formatMeasure(r.measure, r.baseline.mean);
  const since = formatMeasure(r.measure, r.practice.mean);
  const direction = r.difference < 0 ? "lower" : "higher";
  const headline = r.trend === "similar" ? `${def.label}: about the same as before` : `${def.label}: ${direction} than before`;
  const overlap = r.championOverlap < CHAMPION_OVERLAP_NOTE ? " Most of these games were on champions you did not play before, so the comparison is rougher." : "";
  return {
    headline,
    detail: `${since} on average in your last ${r.practice.games} games while practising, against ${before} in the ${r.baseline.games} games before.${overlap}`,
    caveat: `An observation about your games, not proof of improvement: champions, opponents and teammates differ between games. ${def.cannotShow}`,
  };
}
