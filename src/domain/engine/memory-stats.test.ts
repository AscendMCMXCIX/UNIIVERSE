import { describe, expect, it } from "vitest";
import { DEFAULT_SHRINKAGE, MemoryStatsProvider } from "./memory-stats";

describe("statistics shrinkage defaults", () => {
  const stats = new MemoryStatsProvider({
    patch: "16.20",
    sources: ["ranked"],
    totalGames: 5_000,
    proGames: 0,
    bans: [],
    pro: [],
    roleStats: [{ championId: "Gwen", role: "TOP", games: 250, wins: 150 }],
    matchups: [
      { championId: "Gwen", role: "TOP", enemyChampionId: "Ornn", enemyRole: "TOP", games: 30, wins: 24 },
      { championId: "Jinx", role: "ADC", enemyChampionId: "Caitlyn", enemyRole: "ADC", games: 4_000, wins: 2_400 },
    ],
    synergies: [{ championAId: "Jinx", roleA: "ADC", championBId: "Lulu", roleB: "SUPPORT", games: 35, wins: 10 }],
  });

  it("uses the evidence-based prior weights from the data-sufficiency check", () => {
    expect(DEFAULT_SHRINKAGE).toEqual({ strength: 250, matchup: 400, synergy: 1000 });
  });

  it("keeps a small lane sample close to the strength-based prior", () => {
    // 80% over 30 games: at the old weight (60) this read as 60%; now it stays within ~2 points of the prior.
    const m = stats.matchup("Gwen", "TOP", "Ornn", "TOP", 0.52);
    expect(m.estimate).toBeGreaterThan(0.52);
    expect(m.estimate).toBeLessThan(0.54);
    expect(m.confidence).toBeLessThan(0.1);
  });

  it("lets a large lane sample speak", () => {
    const m = stats.matchup("Jinx", "ADC", "Caitlyn", "ADC", 0.5);
    expect(m.estimate).toBeGreaterThan(0.58);
    expect(m.confidence).toBeGreaterThan(0.9);
  });

  it("barely moves a pairing seen a few dozen times", () => {
    const s = stats.synergy("Jinx", "ADC", "Lulu", "SUPPORT", 0.5);
    expect(Math.abs(s.estimate - 0.5)).toBeLessThan(0.01);
  });

  it("leaves champion strength shrinkage unchanged", () => {
    const s = stats.strength("Gwen", "TOP");
    expect(s.estimate).toBeCloseTo(0.55, 5);
  });
});
