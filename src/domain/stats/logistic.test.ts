import { describe, expect, it } from "vitest";
import { designStructure, fitLogistic, isEstimable, pointsFor, type GroupedRow } from "./logistic";

/*
  Reference: statsmodels 0.14, GLM(Binomial) on the same grouped rows (endog = [wins, losses]),
  fitted to tol=1e-12. Columns: two strata (one-hot, no shared intercept) and two teammates.
*/
const ROWS: GroupedRow[] = [
  { x: [1, 0, 0, 0], wins: 20, games: 45 },
  { x: [1, 0, 1, 0], wins: 30, games: 48 },
  { x: [1, 0, 0, 1], wins: 18, games: 40 },
  { x: [1, 0, 1, 1], wins: 25, games: 38 },
  { x: [0, 1, 0, 0], wins: 9, games: 30 },
  { x: [0, 1, 1, 0], wins: 17, games: 33 },
  { x: [0, 1, 0, 1], wins: 11, games: 29 },
  { x: [0, 1, 1, 1], wins: 14, games: 22 },
];

describe("fitLogistic", () => {
  it("matches statsmodels' coefficients, standard errors, p-values and deviance", () => {
    const fit = fitLogistic(ROWS)!;
    expect(fit).not.toBeNull();
    const coef = [-0.34268470939577744, -0.728336810893972, 0.8545266644343521, 0.21310727173546573];
    const se = [0.2302576962773226, 0.2579665646269978, 0.24435489504703398, 0.24543370258443817];
    const p = [0.13668074765312568, 0.004752068735655375, 0.00047039483515309084, 0.38523639322854575];
    coef.forEach((v, i) => expect(fit.coefficients[i]!).toBeCloseTo(v, 8));
    se.forEach((v, i) => expect(fit.standardErrors[i]!).toBeCloseTo(v, 8));
    p.forEach((v, i) => expect(Math.abs(fit.pValues[i]! - v) / v).toBeLessThan(1e-5));
    expect(fit.deviance).toBeCloseTo(0.6320826096812495, 8);
  });

  it("gives the same fit whatever order the rows come in", () => {
    const a = fitLogistic(ROWS)!;
    const b = fitLogistic([...ROWS].reverse())!;
    a.coefficients.forEach((v, i) => expect(b.coefficients[i]!).toBeCloseTo(v, 10));
  });

  it("refuses two columns that always move together", () => {
    const rows: GroupedRow[] = [
      { x: [1, 0, 0], wins: 5, games: 10 },
      { x: [1, 1, 1], wins: 8, games: 10 },
    ];
    expect(fitLogistic(rows)).toBeNull();
  });

  it("refuses a column that never changes from zero", () => {
    expect(fitLogistic([{ x: [1, 0], wins: 4, games: 9 }, { x: [1, 0], wins: 6, games: 9 }])).toBeNull();
  });

  it("refuses a perfectly separated column instead of reporting an enormous effect", () => {
    // With the teammate: every game won. The coefficient has no finite estimate.
    const rows: GroupedRow[] = [
      { x: [1, 0], wins: 10, games: 20 },
      { x: [1, 1], wins: 30, games: 30 },
    ];
    expect(fitLogistic(rows)).toBeNull();
  });

  it("refuses empty or malformed input", () => {
    expect(fitLogistic([])).toBeNull();
    expect(fitLogistic([{ x: [], wins: 1, games: 2 }])).toBeNull();
    expect(fitLogistic([{ x: [1], wins: 3, games: 2 }])).toBeNull();
    expect(fitLogistic([{ x: [1], wins: 1, games: 2 }, { x: [1, 0], wins: 1, games: 2 }])).toBeNull();
  });
});

describe("pointsFor", () => {
  it("turns a log-odds coefficient into win-rate points for the games that had it", () => {
    // At an even chance, log(1.5) is 60% against 50%: ten points.
    expect(pointsFor([0, 0, 0], Math.log(1.5))).toBeCloseTo(0.1, 12);
    expect(pointsFor([0], 0)).toBe(0);
    expect(pointsFor([], 1)).toBe(0);
  });

  it("is monotone, so an interval's ends map to an interval", () => {
    const etas = [-0.4, 0.1, 0.9];
    expect(pointsFor(etas, -0.5)).toBeLessThan(pointsFor(etas, 0));
    expect(pointsFor(etas, 0)).toBeLessThan(pointsFor(etas, 0.5));
  });
});

describe("designStructure and isEstimable", () => {
  it("finds every column informative in a full-rank design", () => {
    const s = designStructure([[1, 0, 0], [1, 1, 0], [1, 0, 1], [1, 1, 1]], 3);
    expect(s.pivots).toEqual([0, 1, 2]);
    expect(s.nullSpace).toEqual([]);
    expect(isEstimable([0, 1, 0], s.nullSpace)).toBe(true);
  });

  it("two teammates who always play together: neither alone, their sum yes", () => {
    // columns: intercept, b, c (b and c always together), d
    const s = designStructure([[1, 0, 0, 0], [1, 1, 1, 0], [1, 0, 0, 1], [1, 1, 1, 1]], 4);
    expect(s.pivots).toEqual([0, 1, 3]);
    expect(isEstimable([0, 1, 0, 0], s.nullSpace)).toBe(false);
    expect(isEstimable([0, 0, 1, 0], s.nullSpace)).toBe(false);
    expect(isEstimable([0, 1, 1, 0], s.nullSpace)).toBe(true);
    expect(isEstimable([0, 0, 0, 1], s.nullSpace)).toBe(true);
  });

  it("duo partners with no game alone: no partner on its own, their difference yes", () => {
    // columns: intercept, b, e; every game has exactly one of them.
    const s = designStructure([[1, 1, 0], [1, 0, 1]], 3);
    expect(isEstimable([0, 1, 0], s.nullSpace)).toBe(false);
    expect(isEstimable([0, 1, -1], s.nullSpace)).toBe(true);
  });

  it("a teammate fixed by two others (d = b + c): none of the three alone", () => {
    // columns: intercept, b, c, d, e
    const rows = [[1, 0, 0, 0, 0], [1, 1, 0, 1, 0], [1, 0, 1, 1, 0], [1, 0, 0, 0, 1], [1, 1, 0, 1, 1]];
    const s = designStructure(rows, 5);
    for (const j of [1, 2, 3]) expect(isEstimable([0, 1, 2, 3, 4].map((i) => (i === j ? 1 : 0)), s.nullSpace)).toBe(false);
    expect(isEstimable([0, 0, 0, 0, 1], s.nullSpace)).toBe(true);
  });

  it("every null-space vector really is invisible to the data", () => {
    const rows = [[1, 1, 1, 0], [1, 0, 0, 1], [1, 1, 1, 1], [1, 0, 0, 0]];
    const s = designStructure(rows, 4);
    for (const v of s.nullSpace) for (const r of rows) expect(Math.abs(r.reduce((sum, x, i) => sum + x * v[i]!, 0))).toBeLessThan(1e-12);
  });
});
