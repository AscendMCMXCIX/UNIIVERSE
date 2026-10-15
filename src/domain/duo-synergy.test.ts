import { describe, expect, it } from "vitest";
import { MIN_DUO_GAMES, scoreDuos, sortDuos, wilson } from "./duo-synergy";

const solo = new Map([
  ["Jinx|ADC", { games: 1000, wins: 500 }],
  ["Thresh|SUPPORT", { games: 1000, wins: 500 }],
  ["Lulu|SUPPORT", { games: 1000, wins: 560 }],
  ["Ezreal|ADC", { games: 1000, wins: 480 }],
]);
const pair = (a: string, b: string, games: number, wins: number) => ({ championA: a, roleA: "ADC" as const, championB: b, roleB: "SUPPORT" as const, games, wins });

describe("duo synergy", () => {
  it("expects two average champions to win half their games together", () => {
    const [row] = scoreDuos([pair("Jinx", "Thresh", 400, 200)], solo);
    expect(row!.expected).toBeCloseTo(0.5, 5);
    expect(row!.synergy).toBeCloseTo(0, 5);
  });

  it("does not credit a strong champion's own win rate to the pair", () => {
    // Lulu wins 56% on her own; winning 56% with Jinx is what was expected, not synergy.
    const [row] = scoreDuos([pair("Jinx", "Lulu", 500, 280)], solo);
    expect(row!.expected).toBeGreaterThan(0.55);
    expect(Math.abs(row!.synergy)).toBeLessThan(0.01);
  });

  it("finds a pair that wins more than both records predict, and shrinks small samples hard", () => {
    const big = scoreDuos([pair("Jinx", "Thresh", 600, 360)], solo)[0]!;
    const small = scoreDuos([pair("Jinx", "Thresh", 30, 18)], solo)[0]!;
    expect(big.winRate).toBeCloseTo(0.6, 5);
    expect(small.winRate).toBeCloseTo(0.6, 5);
    expect(big.synergy).toBeGreaterThan(0.08);
    // Same raw 60%, but 30 games say much less.
    expect(small.synergy).toBeLessThan(big.synergy / 2);
    expect(small.confidence).toBe("low");
    expect(big.confidence).toBe("high");
  });

  it("leaves out pairs below the minimum instead of ranking noise", () => {
    expect(scoreDuos([pair("Jinx", "Thresh", MIN_DUO_GAMES - 1, MIN_DUO_GAMES - 1)], solo)).toEqual([]);
  });

  it("sorts by synergy, games or win rate, ties broken by games", () => {
    const rows = scoreDuos([pair("Jinx", "Thresh", 600, 360), pair("Ezreal", "Thresh", 900, 430), pair("Jinx", "Lulu", 40, 26)], solo);
    expect(sortDuos(rows, "synergy")[0]!.championA).toBe("Jinx");
    expect(sortDuos(rows, "games")[0]!.championA).toBe("Ezreal");
  });

  it("gives a sensible 95% range", () => {
    const [lo, hi] = wilson(60, 100);
    expect(lo).toBeGreaterThan(0.49);
    expect(hi).toBeLessThan(0.7);
  });
});
