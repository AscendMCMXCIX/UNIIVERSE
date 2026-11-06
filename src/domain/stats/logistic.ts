import { erfc } from "./inference";

/*
  Logistic regression on grouped results (wins of games per row), fitted by Newton–Raphson
  (iteratively reweighted least squares). Used by Team insights to separate several teammates'
  associations with a member's results at once: each teammate's coefficient is the change in the
  log-odds of a win with them on the side, the other teammates, the role and the game mode held
  fixed. Deterministic, no prior and no penalty; checked against statsmodels in the tests.

  A fit that does not converge, or whose information matrix is singular (two columns that always
  move together, or a column that never changes), returns null: the comparison it would have
  supported is then not tested, rather than given an unstable figure.
*/

export interface GroupedRow {
  /** Covariates (no implicit intercept: give one, or one column per stratum). */
  x: readonly number[];
  wins: number;
  games: number;
}

export interface LogisticFit {
  coefficients: number[];
  standardErrors: number[];
  /** The coefficients' covariance (the inverse of the information at the solution). */
  covariance: number[][];
  /** Two-sided Wald p-values. */
  pValues: number[];
  iterations: number;
  deviance: number;
}

const MAX_ITERATIONS = 100;
const TOLERANCE = 1e-10;

const sigmoid = (z: number) => (z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)));

/** Cholesky factor L (lower triangular, A = L·Lᵀ) of a symmetric matrix, or null when not positive definite. */
function cholesky(a: number[][]): number[][] | null {
  const n = a.length;
  const l = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  // Relative to the matrix's own scale, so a column that never varies is caught.
  const scale = Math.max(1e-300, ...a.map((row, i) => Math.abs(row[i]!)));
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j <= i; j += 1) {
      let s = a[i]![j]!;
      for (let k = 0; k < j; k += 1) s -= l[i]![k]! * l[j]![k]!;
      if (i === j) {
        if (!(s > 1e-10 * scale)) return null;
        l[i]![i] = Math.sqrt(s);
      } else {
        l[i]![j] = s / l[j]![j]!;
      }
    }
  }
  return l;
}

/** Solves L·Lᵀ·x = b. */
function solve(l: number[][], b: readonly number[]): number[] {
  const n = l.length;
  const y = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i += 1) {
    let s = b[i]!;
    for (let k = 0; k < i; k += 1) s -= l[i]![k]! * y[k]!;
    y[i] = s / l[i]![i]!;
  }
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i -= 1) {
    let s = y[i]!;
    for (let k = i + 1; k < n; k += 1) s -= l[k]![i]! * x[k]!;
    x[i] = s / l[i]![i]!;
  }
  return x;
}

/** (L·Lᵀ)⁻¹, column by column. */
function inverse(l: number[][]): number[][] {
  const n = l.length;
  const columns = Array.from({ length: n }, (_, i) => {
    const e = new Array<number>(n).fill(0);
    e[i] = 1;
    return solve(l, e);
  });
  return Array.from({ length: n }, (_, r) => columns.map((c) => c[r]!));
}

function deviance(rows: readonly GroupedRow[], beta: readonly number[]): number {
  let d = 0;
  for (const r of rows) {
    const p = sigmoid(r.x.reduce((s, v, j) => s + v * beta[j]!, 0));
    const w = r.wins;
    const l = r.games - r.wins;
    if (w > 0) d += 2 * w * Math.log(w / (r.games * p));
    if (l > 0) d += 2 * l * Math.log(l / (r.games * (1 - p)));
  }
  return d;
}

/** Fits the model, or null when it cannot be fitted reliably (see above). */
export function fitLogistic(rows: readonly GroupedRow[]): LogisticFit | null {
  const used = rows.filter((r) => r.games > 0);
  if (used.length === 0) return null;
  const p = used[0]!.x.length;
  if (p === 0 || used.some((r) => r.x.length !== p || r.wins < 0 || r.wins > r.games)) return null;
  let beta = new Array<number>(p).fill(0);
  let previous = deviance(used, beta);
  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration += 1) {
    const info = Array.from({ length: p }, () => new Array<number>(p).fill(0));
    const score = new Array<number>(p).fill(0);
    for (const r of used) {
      const mu = sigmoid(r.x.reduce((s, v, j) => s + v * beta[j]!, 0));
      const w = r.games * mu * (1 - mu);
      const resid = r.wins - r.games * mu;
      for (let i = 0; i < p; i += 1) {
        const xi = r.x[i]!;
        if (xi === 0) continue;
        score[i]! += xi * resid;
        for (let j = 0; j <= i; j += 1) info[i]![j]! += xi * r.x[j]! * w;
      }
    }
    for (let i = 0; i < p; i += 1) for (let j = 0; j < i; j += 1) info[j]![i] = info[i]![j]!;
    const l = cholesky(info);
    if (!l) return null;
    const step = solve(l, score);
    // Step-halving keeps every iteration from increasing the deviance.
    let factor = 1;
    let next = beta.map((b, i) => b + step[i]!);
    let dev = deviance(used, next);
    while (dev > previous + 1e-12 && factor > 1e-6) {
      factor /= 2;
      next = beta.map((b, i) => b + factor * step[i]!);
      dev = deviance(used, next);
    }
    beta = next;
    const converged = Math.abs(previous - dev) < TOLERANCE * (Math.abs(dev) + 1) && Math.max(...step.map((s) => Math.abs(s * factor))) < 1e-7;
    previous = dev;
    if (converged) {
      // Standard errors at the solution.
      const infoAt = Array.from({ length: p }, () => new Array<number>(p).fill(0));
      for (const r of used) {
        const mu = sigmoid(r.x.reduce((s, v, j) => s + v * beta[j]!, 0));
        const w = r.games * mu * (1 - mu);
        for (let i = 0; i < p; i += 1) for (let j = 0; j <= i; j += 1) infoAt[i]![j]! += r.x[i]! * r.x[j]! * w;
      }
      for (let i = 0; i < p; i += 1) for (let j = 0; j < i; j += 1) infoAt[j]![i] = infoAt[i]![j]!;
      const lAt = cholesky(infoAt);
      if (!lAt) return null;
      const covariance = inverse(lAt);
      const se = covariance.map((row, i) => Math.sqrt(Math.max(0, row[i]!)));
      if (se.some((s) => !Number.isFinite(s))) return null;
      const pValues = beta.map((b, i) => (se[i]! > 0 ? Math.min(1, erfc(Math.abs(b / se[i]!) / Math.SQRT2)) : 1));
      return { coefficients: beta, standardErrors: se, covariance, pValues, iterations: iteration, deviance: dev };
    }
  }
  return null;
}

/**
 * A coefficient as win-rate points for the games that had it: the average, over those games, of
 * the fitted chance of a win minus the chance with the coefficient replaced by `b` = 0. Used to
 * show a log-odds coefficient (and its interval's ends) on the scale the page uses.
 */
export function pointsFor(linearWithout: readonly number[], b: number): number {
  if (linearWithout.length === 0) return 0;
  return linearWithout.reduce((s, eta) => s + sigmoid(eta + b) - sigmoid(eta), 0) / linearWithout.length;
}

/**
 * The structure of a design matrix (rows: covariate patterns; columns: coefficients), by
 * Gauss–Jordan elimination: which columns carry information of their own (`pivots`, in column
 * order) and a basis of the directions the data cannot see (`nullSpace`: every v with Xv = 0).
 * A combination of coefficients Lᵀβ can be estimated from these data exactly when L is
 * orthogonal to every null-space vector; the model fitted on the pivot columns alone gives it.
 * The entries are small whole numbers here, so the tolerance only absorbs rounding.
 */
export function designStructure(rows: readonly (readonly number[])[], columns: number): { pivots: number[]; nullSpace: number[][] } {
  const m = rows.map((r) => [...r]);
  const pivots: number[] = [];
  let r = 0;
  for (let c = 0; c < columns && r < m.length; c += 1) {
    let best = r;
    for (let i = r + 1; i < m.length; i += 1) if (Math.abs(m[i]![c]!) > Math.abs(m[best]![c]!)) best = i;
    if (Math.abs(m[best]![c]!) < 1e-9) continue;
    [m[r], m[best]] = [m[best]!, m[r]!];
    const pivot = m[r]![c]!;
    for (let j = 0; j < columns; j += 1) m[r]![j]! /= pivot;
    for (let i = 0; i < m.length; i += 1) {
      if (i === r) continue;
      const f = m[i]![c]!;
      if (Math.abs(f) < 1e-12) continue;
      for (let j = 0; j < columns; j += 1) m[i]![j]! -= f * m[r]![j]!;
    }
    pivots.push(c);
    r += 1;
  }
  const free = Array.from({ length: columns }, (_, c) => c).filter((c) => !pivots.includes(c));
  const nullSpace = free.map((f) => {
    const v = new Array<number>(columns).fill(0);
    v[f] = 1;
    pivots.forEach((c, i) => {
      v[c] = -m[i]![f]!;
    });
    return v;
  });
  return { pivots, nullSpace };
}

/** Whether Lᵀβ can be estimated: L is orthogonal to the design's null space. */
export function isEstimable(l: readonly number[], nullSpace: readonly (readonly number[])[]): boolean {
  return nullSpace.every((v) => Math.abs(v.reduce((s, x, i) => s + x * (l[i] ?? 0), 0)) < 1e-7 * (1 + Math.sqrt(v.reduce((s, x) => s + x * x, 0))));
}
