/*
  Deciding whether a difference between two records is more than chance.

  Used by Team insights (domain/team-insights.ts), where a member's record in one kind of game is
  compared with their record in another (with teammates or alone, with one teammate or with
  others). Two records are only compared like with like: games are split into strata (the same
  game mode and the same role), and each stratum compares its own games only. Three standard,
  deterministic methods, each checked against an independent implementation in the tests:

  - Mantel–Haenszel risk difference: the stratum-adjusted difference in win rate (percentage
    points), with Sato's variance (Biometrics 45, 1989), which holds for many small strata as
    well as for a few large ones.
  - Cochran–Mantel–Haenszel test (with R's continuity correction): how often a difference at
    least this large would appear by chance alone if the two kinds of game won equally often.
  - Benjamini–Hochberg: when many comparisons are made, chance alone makes some of them look
    different. Only comparisons that survive this adjustment are reported as findings.

  Nothing here weights, shrinks or invents data: a stratum with games on one side only adds
  nothing to the comparison, and a comparison with no stratum that has both sides has no figure.
*/

/** One stratum: the wins and games of the two kinds of game being compared. */
export interface Stratum {
  /** The kind of game being asked about (for example, with teammates). */
  exposedWins: number;
  exposedGames: number;
  /** What it is compared with (for example, alone). */
  otherWins: number;
  otherGames: number;
}

export interface StratifiedComparison {
  /** The raw totals of each side, across every stratum (shown beside the adjusted figure). */
  exposed: { wins: number; games: number };
  other: { wins: number; games: number };
  /** Strata with games on both sides: only these inform the comparison. */
  informativeStrata: number;
  /** Games in those strata, on each side. */
  comparedGames: { exposed: number; other: number };
  /** Stratum-adjusted win-rate difference, exposed minus other (−1…1); null without an informative stratum. */
  difference: number | null;
  /** Its 95% confidence interval, clamped to −1…1. */
  low: number | null;
  high: number | null;
  /** Two-sided p-value of the CMH test; null without an informative stratum. */
  pValue: number | null;
}

/** z for a two-sided 95% interval. */
export const Z_95 = 1.959963984540054;

/**
 * Complementary error function, erfc(x) = 1 − erf(x). Chebyshev fit with a fractional error
 * below 1.2·10⁻⁷ everywhere (Numerical Recipes, erfcc), ample for p-values.
 */
export function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    );
  return x >= 0 ? r : 2 - r;
}

/** P(χ² with one degree of freedom ≥ x). */
export function chiSquare1Survival(x: number): number {
  if (!Number.isFinite(x) || x <= 0) return 1;
  return Math.min(1, Math.max(0, erfc(Math.sqrt(x / 2))));
}

/** Wilson score interval for one record (wins of games); null without games. */
export function wilsonInterval(wins: number, games: number, z = Z_95): { low: number; high: number } | null {
  if (!(games > 0)) return null;
  const p = Math.min(Math.max(wins / games, 0), 1);
  const z2 = z * z;
  const centre = (p + z2 / (2 * games)) / (1 + z2 / games);
  const half = (z / (1 + z2 / games)) * Math.sqrt((p * (1 - p)) / games + z2 / (4 * games * games));
  return { low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
}

const clean = (n: number) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

/** Normalises a stratum: whole, non-negative counts with wins never above games. */
function normalise(s: Stratum): Stratum {
  const exposedGames = clean(s.exposedGames);
  const otherGames = clean(s.otherGames);
  return { exposedGames, otherGames, exposedWins: Math.min(clean(s.exposedWins), exposedGames), otherWins: Math.min(clean(s.otherWins), otherGames) };
}

/**
 * Compares two kinds of game across strata: the Mantel–Haenszel risk difference with Sato's
 * 95% interval, and the CMH test's p-value. Strata with games on one side only are counted in
 * the raw totals but inform neither figure.
 */
export function compareStratified(strata: readonly Stratum[], z = Z_95): StratifiedComparison {
  const all = strata.map(normalise);
  const exposed = { wins: 0, games: 0 };
  const other = { wins: 0, games: 0 };
  let informative = 0;
  const compared = { exposed: 0, other: 0 };
  // Mantel–Haenszel risk difference (a = exposed wins, n1 = exposed games; c, n0 the other side).
  let num = 0;
  let weight = 0;
  let satoP = 0;
  let satoQ = 0;
  // Cochran–Mantel–Haenszel test.
  let observedMinusExpected = 0;
  let variance = 0;
  for (const s of all) {
    exposed.wins += s.exposedWins;
    exposed.games += s.exposedGames;
    other.wins += s.otherWins;
    other.games += s.otherGames;
    const n1 = s.exposedGames;
    const n0 = s.otherGames;
    if (n1 === 0 || n0 === 0) continue;
    informative += 1;
    compared.exposed += n1;
    compared.other += n0;
    const a = s.exposedWins;
    const c = s.otherWins;
    const n = n1 + n0;
    num += (a * n0 - c * n1) / n;
    weight += (n1 * n0) / n;
    satoP += (n1 * n1 * c - n0 * n0 * a + (n1 * n0 * (n0 - n1)) / 2) / (n * n);
    satoQ += (a * (n0 - c) + c * (n1 - a)) / (2 * n);
    const wins = a + c;
    observedMinusExpected += a - (n1 * wins) / n;
    if (n > 1) variance += (n1 * n0 * wins * (n - wins)) / (n * n * (n - 1));
  }
  if (informative === 0 || weight === 0) {
    return { exposed, other, informativeStrata: 0, comparedGames: compared, difference: null, low: null, high: null, pValue: null };
  }
  const difference = num / weight;
  const varRd = Math.max(0, (difference * satoP + satoQ) / (weight * weight));
  const half = z * Math.sqrt(varRd);
  // Continuity correction as R's mantelhaen.test applies it: only when it cannot overshoot zero.
  const deviation = Math.abs(observedMinusExpected);
  const corrected = deviation >= 0.5 ? deviation - 0.5 : deviation;
  const pValue = variance > 0 ? chiSquare1Survival((corrected * corrected) / variance) : 1;
  return {
    exposed,
    other,
    informativeStrata: informative,
    comparedGames: compared,
    difference,
    low: Math.max(-1, difference - half),
    high: Math.min(1, difference + half),
    pValue,
  };
}

/**
 * Benjamini–Hochberg adjusted p-values (q-values), in the input order: a comparison is a finding
 * at a false discovery rate q when its adjusted value is at most q. Missing p-values stay null and
 * do not count as comparisons.
 */
export function benjaminiHochberg(pValues: readonly (number | null)[]): (number | null)[] {
  const tested = pValues.map((p, i) => ({ p, i })).filter((x): x is { p: number; i: number } => x.p !== null && Number.isFinite(x.p));
  const m = tested.length;
  const out: (number | null)[] = pValues.map(() => null);
  if (m === 0) return out;
  tested.sort((x, y) => x.p - y.p || x.i - y.i);
  let running = 1;
  for (let k = m - 1; k >= 0; k -= 1) {
    const { p, i } = tested[k]!;
    running = Math.min(running, (p * m) / (k + 1));
    out[i] = Math.min(1, Math.max(0, running));
  }
  return out;
}
