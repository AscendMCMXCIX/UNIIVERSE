import type { Role } from "./roles";
import { shrinkRate } from "./stats";

/*
  CHAMPION DUO SYNERGY, from observed games only.

  For a pair of champions on the same team in two given roles (say Bottom + Support):
    - together: games and wins in which both were on one team in those roles;
    - expected: what the pair would win if each champion simply brought its own strength, from
      each champion's win rate in its role over the same games (both shrunk towards 50% so a thin
      solo sample cannot swing the baseline), combined on the log-odds scale;
    - synergy: the pair's win rate together, shrunk towards that expectation for small samples,
      minus the expectation. Positive means the pair has won more than the two champions'
      individual records predict.
  This is a measured association, not proof that the pair causes wins: who picks the pair, rank
  and matchmaking can play a part. Small samples are shrunk hard and labelled; pairs below the
  minimum are left out rather than ranked on noise.
*/

/** Pairs need this many games together to be listed at all. */
export const MIN_DUO_GAMES = 25;
/** Prior weight (games) pulling a pair's win rate towards its expectation. */
export const DUO_PRIOR_GAMES = 60;
/** Prior weight (games) pulling each champion's own win rate towards 50%. */
export const SOLO_PRIOR_GAMES = 100;

export type DuoConfidence = "high" | "medium" | "low";

export interface DuoRow {
  championA: string;
  roleA: Role;
  championB: string;
  roleB: Role;
  games: number;
  wins: number;
  /** Raw win rate together. */
  winRate: number;
  /** Win rate expected from each champion's own record in its role. */
  expected: number;
  /** Shrunk win rate together minus the expectation (−0.08 … +0.08 typically). */
  synergy: number;
  /** 95% Wilson interval of the raw win rate together. */
  interval: [number, number];
  confidence: DuoConfidence;
}

export interface PairCount {
  championA: string;
  roleA: Role;
  championB: string;
  roleB: Role;
  games: number;
  wins: number;
}

const logit = (p: number) => Math.log(p / (1 - p));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const clamp = (p: number) => Math.min(0.99, Math.max(0.01, p));

export function wilson(wins: number, games: number, z = 1.96): [number, number] {
  if (games <= 0) return [0, 1];
  const p = wins / games;
  const d = 1 + (z * z) / games;
  const centre = (p + (z * z) / (2 * games)) / d;
  const half = (z * Math.sqrt((p * (1 - p)) / games + (z * z) / (4 * games * games))) / d;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

export function duoConfidence(games: number): DuoConfidence {
  return games >= 200 ? "high" : games >= 80 ? "medium" : "low";
}

/**
 * Scores pairs for one role pair. `solo` gives each champion's games and wins in a role over the
 * same patches (key `${championId}|${role}`). Pairs under the minimum are dropped.
 */
export function scoreDuos(pairs: readonly PairCount[], solo: ReadonlyMap<string, { games: number; wins: number }>, minGames = MIN_DUO_GAMES): DuoRow[] {
  const out: DuoRow[] = [];
  for (const p of pairs) {
    if (p.games < minGames) continue;
    const a = solo.get(`${p.championA}|${p.roleA}`) ?? { games: 0, wins: 0 };
    const b = solo.get(`${p.championB}|${p.roleB}`) ?? { games: 0, wins: 0 };
    const pa = clamp(shrinkRate(a, 0.5, SOLO_PRIOR_GAMES).estimate);
    const pb = clamp(shrinkRate(b, 0.5, SOLO_PRIOR_GAMES).estimate);
    const expected = sigmoid(logit(pa) + logit(pb));
    const together = shrinkRate({ games: p.games, wins: p.wins }, expected, DUO_PRIOR_GAMES).estimate;
    out.push({
      championA: p.championA,
      roleA: p.roleA,
      championB: p.championB,
      roleB: p.roleB,
      games: p.games,
      wins: p.wins,
      winRate: p.wins / p.games,
      expected,
      synergy: together - expected,
      interval: wilson(p.wins, p.games),
      confidence: duoConfidence(p.games),
    });
  }
  return out;
}

export type DuoSort = "synergy" | "games" | "winrate";

export function sortDuos(rows: readonly DuoRow[], sort: DuoSort): DuoRow[] {
  const key = (r: DuoRow) => (sort === "games" ? r.games : sort === "winrate" ? shrinkRate({ games: r.games, wins: r.wins }, 0.5, DUO_PRIOR_GAMES).estimate : r.synergy);
  return [...rows].sort((x, y) => key(y) - key(x) || y.games - x.games || `${x.championA}${x.championB}`.localeCompare(`${y.championA}${y.championB}`));
}
