import { describe, expect, it } from "vitest";
import { DEFAULT_TIER_WEIGHTS, parseTierWeights, parseTiers, tierBandFor, tierPopulationLabel, tierWeight } from "./tiers";
import { blendPeriods } from "./shrinkage";

describe("ladder tiers", () => {
  it("collects Emerald and above by default and labels the population by its floor", () => {
    expect(parseTiers(undefined)).toEqual(["CHALLENGER", "GRANDMASTER", "MASTER", "DIAMOND", "EMERALD"]);
    expect(tierPopulationLabel(parseTiers(undefined))).toBe("EMERALD+");
    expect(parseTiers("master, challenger")).toEqual(["MASTER", "CHALLENGER"]);
    expect(tierPopulationLabel(["CHALLENGER", "GRANDMASTER", "MASTER"])).toBe("MASTER+");
    expect(parseTiers("gold,iron")).toEqual(parseTiers(undefined)); // below Emerald is not collected
  });

  it("keeps rank provenance: every match carries its band, unknown bands fall back to the legacy label", () => {
    expect(tierBandFor("emerald")).toBe("EMERALD");
    expect(tierBandFor("CHALLENGER")).toBe("CHALLENGER");
    expect(tierBandFor(null)).toBe("MASTER+");
    expect(tierBandFor("GOLD")).toBe("MASTER+");
  });

  it("weights higher ranks more per game, never above one, and lets overrides replace defaults", () => {
    expect(tierWeight("CHALLENGER")).toBe(1);
    expect(tierWeight("EMERALD")).toBeLessThan(tierWeight("DIAMOND"));
    expect(tierWeight("DIAMOND")).toBeLessThan(tierWeight("MASTER"));
    for (const w of Object.values(DEFAULT_TIER_WEIGHTS)) expect(w).toBeLessThanOrEqual(1);
    const custom = parseTierWeights("EMERALD=0.3, diamond=0.6, bogus=5, master=abc");
    expect(custom.EMERALD).toBe(0.3);
    expect(custom.DIAMOND).toBe(0.6);
    expect(custom.MASTER).toBe(DEFAULT_TIER_WEIGHTS.MASTER);
    expect(custom.BOGUS).toBeUndefined();
  });

  it("a tiny Challenger sample cannot outvote a large Emerald sample, but counts more game for game", () => {
    // 30 Challenger games at 70% versus 2,000 Emerald games at 48%, blended as weighted evidence.
    const challenger = { patchDistance: 0, wins: 21, games: 30, discount: tierWeight("CHALLENGER") };
    const emerald = { patchDistance: 0, wins: 960, games: 2000, discount: tierWeight("EMERALD") };
    const blended = blendPeriods([challenger, emerald]);
    const rate = blended.wins / blended.games;
    expect(rate).toBeLessThan(0.5); // the broad sample dominates
    expect(rate).toBeGreaterThan(0.48); // but the apex games pull harder per game than Emerald games
    // Per-game influence: one Challenger game moves the estimate twice as much as one Emerald game.
    const oneChallenger = blendPeriods([{ patchDistance: 0, wins: 1, games: 1, discount: tierWeight("CHALLENGER") }]).games;
    const oneEmerald = blendPeriods([{ patchDistance: 0, wins: 1, games: 1, discount: tierWeight("EMERALD") }]).games;
    expect(oneChallenger / oneEmerald).toBe(2);
  });
});
