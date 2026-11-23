import { wilsonInterval } from "@/domain/stats/inference";
import type { PrepLane } from "@/domain/matchup-intel/prep";
import type { RiotRegion } from "@/domain/riot-platforms";

/*
  MATCHUP INTEL's high-elo counts (docs/HIGH_ELO_EVIDENCE.md, "What is stored"): what one observed
  Master+ player's game adds to `mi_high_counts`, and the statistics read back from it. Every row
  keeps n (the games observed) beside the weighted sums (Σw, Σw², Σw for the games won), so a line
  states its real sample and its interval uses the effective sample size, never more than n.
*/

/** What a row counts: the games, or one choice (its value), or the lane's end (a 30-second bucket). */
export type HighEloKind = "games" | "ks" | "spells" | "start" | "item1" | "skills" | "max" | "end";
/** The choices counted for a champion in a role (against anyone): keystone, spells, start, first item, skills. */
export const HIGH_ELO_CHOICES = ["ks", "spells", "start", "item1", "skills", "max"] as const satisfies readonly HighEloKind[];
export type HighEloChoice = (typeof HIGH_ELO_CHOICES)[number];
/** The lane's end is counted in buckets of this many ms. */
export const END_BUCKET_MS = 30_000;

/** One Master+ player's game, as observed (no identifier: the champion, its lane, the result and its choices). */
export interface HighEloObservation {
  role: PrepLane;
  champion: string;
  /** The lane opponent's champion, only where Riot's positions confirm it (prep's confirmed rule). */
  opponent: string | null;
  win: boolean;
  choices: Partial<Record<HighEloChoice, string>>;
  /** When the lane ended, ms into the game (prep's laneEnd). */
  end?: number;
  /** One over the probability the slice included it (sample.ts observationWeight). */
  weight: number;
}

/** What a set of observations adds to one row. */
export interface CountDelta {
  patch: string;
  region: RiotRegion;
  role: PrepLane;
  champion: string;
  /** "" for every opponent. */
  opponent: string;
  kind: HighEloKind;
  /** "" for the games. */
  value: string;
  n: number;
  w: number;
  w2: number;
  /** Σw over the games won. */
  ww: number;
}

/** A weighted count: n games observed and their weights. */
export interface WeightedCount {
  n: number;
  w: number;
  w2: number;
  ww: number;
}

export const ZERO: WeightedCount = { n: 0, w: 0, w2: 0, ww: 0 };

export function addCounts(a: WeightedCount, b: WeightedCount): WeightedCount {
  return { n: a.n + b.n, w: a.w + b.w, w2: a.w2 + b.w2, ww: a.ww + b.ww };
}

/**
 * The rows a slice's observations add (merged by key). Against every opponent: the games, each
 * choice the game records and the lane's end. Against the confirmed opponent: the games and the lane's
 * end only (choices per pair would multiply the rows for samples too small to state).
 */
export function countDeltas(observations: readonly HighEloObservation[], patch: string, region: RiotRegion): CountDelta[] {
  const out = new Map<string, CountDelta>();
  const add = (role: PrepLane, champion: string, opponent: string, kind: HighEloKind, value: string, o: HighEloObservation) => {
    const key = [role, champion, opponent, kind, value].join("|");
    const row = out.get(key) ?? { patch, region, role, champion, opponent, kind, value, n: 0, w: 0, w2: 0, ww: 0 };
    row.n += 1;
    row.w += o.weight;
    row.w2 += o.weight * o.weight;
    if (o.win) row.ww += o.weight;
    out.set(key, row);
  };
  for (const o of observations) {
    if (!(o.weight > 0) || !Number.isFinite(o.weight)) continue;
    const end = o.end !== undefined && Number.isFinite(o.end) && o.end > 0 ? String(Math.floor(o.end / END_BUCKET_MS) * END_BUCKET_MS) : null;
    add(o.role, o.champion, "", "games", "", o);
    for (const kind of HIGH_ELO_CHOICES) {
      const value = o.choices[kind];
      if (value) add(o.role, o.champion, "", kind, value, o);
    }
    if (end) add(o.role, o.champion, "", "end", end, o);
    if (o.opponent) {
      add(o.role, o.champion, o.opponent, "games", "", o);
      if (end) add(o.role, o.champion, o.opponent, "end", end, o);
    }
  }
  return [...out.values()];
}

/** The effective sample size, (Σw)² / Σw²: what the weighted games are worth, never more than n. */
export function effectiveSize(c: WeightedCount): number {
  if (!(c.w > 0) || !(c.w2 > 0)) return 0;
  return Math.min(c.n, (c.w * c.w) / c.w2);
}

/** The weighted share of the games won with its 95% Wilson interval at the effective sample size; null without games. */
export function wonShare(c: WeightedCount): { share: number; low: number; high: number; nEff: number } | null {
  const nEff = effectiveSize(c);
  if (!(nEff > 0)) return null;
  const share = c.ww / c.w;
  const interval = wilsonInterval(share * nEff, nEff);
  return interval ? { share, low: interval.low, high: interval.high, nEff } : null;
}

/** A value's weighted share of a set's games. */
export function shareOf(part: WeightedCount, total: WeightedCount): number {
  return total.w > 0 ? part.w / total.w : 0;
}

/** The weighted quantile of bucketed values (each bucket's middle). */
export function weightedQuantile(buckets: ReadonlyArray<{ value: number; w: number }>, q: number, width = END_BUCKET_MS): number | null {
  const sorted = [...buckets].filter((b) => b.w > 0).sort((a, b) => a.value - b.value);
  const total = sorted.reduce((s, b) => s + b.w, 0);
  if (!(total > 0)) return null;
  let at = q * total;
  for (const b of sorted) {
    if (at <= b.w) return b.value + width * (at / b.w);
    at -= b.w;
  }
  return sorted[sorted.length - 1]!.value + width;
}
