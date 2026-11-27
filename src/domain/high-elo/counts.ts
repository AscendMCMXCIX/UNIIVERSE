import type { RiotRegion } from "@/domain/riot-platforms";
import { BUILD_DIMS, type BuildCountRow, type BuildDim, type BuildLane } from "@/domain/champion-builds";

/*
  The high-elo counts (docs/HIGH_ELO_EVIDENCE.md, "What is stored"; ported from Matchup Intel's 23
  Nov 2026 work and retargeted to Champion Intel's builds): what one observed Master+ player's game
  adds to `high_elo_counts`, and how the page reads them back. Every row keeps n (the games
  observed) beside the weighted sums (Σw, Σw², Σw for the games won), so a figure states its real
  sample and every threshold and interval uses the effective sample size, never more than n
  (domain/champion-builds reads them as weighted tallies, through the same rules as the team's).

  - The kinds are the builds' own dims, with the same values (domain/champion-builds-observe
    observeBuild makes them by the builds statement's rules). `lane.*` kinds are reserved for the
    Matchup Intel band's lane figures (its own observer, its own PR); none is written here.
  - Region: the build kinds are kept for all regions together ("all"); the games are kept per region
    as well, so the sample's spread over the regions can be said. Weighted sums add, so "all" is
    exactly the sum of the regions. (Per region for every kind would take about three times the
    storage: OB3.)
  - No identifier: a value is a build's ids, never a player, a match or a Riot ID
    (domain/champion-builds validBuildValue; tests/db/high-elo.test.ts).
*/

/** The build kinds counted: every builds dim. */
export const HIGH_ELO_KINDS: readonly BuildDim[] = BUILD_DIMS;
/** The region of the build kinds' rows: every region together. */
export const ALL_REGIONS = "all";

/** One Master+ player's game, as observed: its lane, its champion, the result and its build's values. No identifier. */
export interface HighEloObservation {
  lane: BuildLane;
  champion: string;
  win: boolean;
  /** The builds' values for this game (observeBuild); a part the game does not record is absent. */
  values: Partial<Record<Exclude<BuildDim, "games">, string>>;
  /** One over the probability the slice included it (sample.ts observationWeight). */
  weight: number;
}

/** What a set of observations adds to one row. */
export interface CountDelta {
  champion: string;
  patch: string;
  /** The lane, Riot's: TOP, JUNGLE, MIDDLE, BOTTOM or UTILITY. */
  role: BuildLane;
  /** A region, or "all". */
  region: RiotRegion | typeof ALL_REGIONS;
  /** "" for every opponent (the only one written here). */
  opponent: string;
  kind: BuildDim;
  /** "" for the games and the timeline. */
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
 * The rows a slice's observations in one region add (merged by key): the games under the region and
 * under "all"; every build kind the game records under "all" only.
 */
export function countDeltas(observations: readonly HighEloObservation[], patch: string, region: RiotRegion): CountDelta[] {
  const out = new Map<string, CountDelta>();
  const add = (o: HighEloObservation, where: CountDelta["region"], kind: BuildDim, value: string) => {
    const key = [o.lane, o.champion, where, kind, value].join("|");
    const row = out.get(key) ?? { champion: o.champion, patch, role: o.lane, region: where, opponent: "", kind, value, n: 0, w: 0, w2: 0, ww: 0 };
    row.n += 1;
    row.w += o.weight;
    row.w2 += o.weight * o.weight;
    if (o.win) row.ww += o.weight;
    out.set(key, row);
  };
  for (const o of observations) {
    if (!(o.weight > 0) || !Number.isFinite(o.weight)) continue;
    add(o, region, "games", "");
    add(o, ALL_REGIONS, "games", "");
    for (const kind of HIGH_ELO_KINDS) {
      if (kind === "games") continue;
      const value = o.values[kind];
      if (value !== undefined) add(o, ALL_REGIONS, kind, value);
    }
  }
  return [...out.values()];
}

/** The effective sample size, (Σw)² / Σw²: what the weighted games are worth, never more than n. */
export function effectiveSize(c: WeightedCount): number {
  if (!(c.w > 0) || !(c.w2 > 0)) return 0;
  return Math.min(c.n, (c.w * c.w) / c.w2);
}

/**
 * The page's rows from the stored counts of one champion (every region together, every opponent):
 * the builds' weighted tallies, Ranked Solo/Duo's, with no player's count (`top` 0: nothing about a
 * player is stored, so the spread guard has nothing to hold; the 30 effective games and the 99% test
 * carry the rule).
 */
export function highEloBuildRows(rows: ReadonlyArray<{ patch: string; role: string; kind: string; value: string; n: number; w: number; w2: number; ww: number }>): BuildCountRow[] {
  const dims = new Set<string>(BUILD_DIMS);
  const lanes = new Set(["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"]);
  return rows
    .filter((r) => dims.has(r.kind) && lanes.has(r.role) && r.n > 0 && r.w > 0)
    .map((r) => ({ dim: r.kind as BuildDim, patch: r.patch, lane: r.role as BuildLane, queue: 420 as const, value: r.value, n: r.n, w: Math.round((r.ww / r.w) * r.n), nm: 0, top: 0, weight: { w: r.w, w2: r.w2, ww: r.ww } }));
}
