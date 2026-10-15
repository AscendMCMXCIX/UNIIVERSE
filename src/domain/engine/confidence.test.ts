import { describe, expect, it } from "vitest";
import { mergeEngineConfig } from "./config";
import { recommendationConfidence, statisticalPart, THIN_CHAMPION_GAMES, withPickEvidence } from "./confidence";
import type { Candidate, StatsDescription } from "./types";

const config = mergeEngineConfig();
const stats: StatsDescription = { patch: "16.20", sources: ["ranked"], totalGames: 6000, isDemo: false };
const components = { strength: 0, comfort: 0, lane: 0, teamMatchup: 0, pairSynergy: 0, structure: 0, interaction: 0, swapCost: 0, pro: 0, execution: 0, overrides: 0 };
const candidate = (parts: Partial<typeof components>) => ({ evaluation: { components: { ...components, ...parts } } }) as unknown as Candidate;

describe("decision labels and the recommended champion's own evidence", () => {
  const strong = recommendationConfidence([0.1, 0.06], stats, 0.6);

  it("drops a statistical lead on a thinly played champion by one step, and says why", () => {
    expect(strong.level).toBe("strong");
    // The 4-point lead is all champion strength.
    const d = withPickEvidence(strong, candidate({ strength: 0.06 }), candidate({ strength: 0.02 }), 35, "Smolder", "Bottom", config);
    expect(d.level).toBe("moderate");
    expect(d.reason).toMatch(/only 35 games in Bottom/);
    const moderate = recommendationConfidence([0.1, 0.085], stats, 0.6);
    expect(withPickEvidence(moderate, candidate({ lane: 0.02 }), candidate({ lane: 0.005 }), 12, "Smolder", "Bottom", config).level).toBe("close");
  });

  it("leaves a well-sampled champion alone", () => {
    expect(withPickEvidence(strong, candidate({ strength: 0.06 }), candidate({ strength: 0.02 }), THIN_CHAMPION_GAMES + 1, "Jinx", "Bottom", config)).toEqual(strong);
  });

  it("leaves a lead built on comfort or composition alone, however thin the global sample", () => {
    expect(withPickEvidence(strong, candidate({ comfort: 0.05, strength: 0.01 }), candidate({ comfort: 0.01, strength: 0.01 }), 5, "Zeri", "Bottom", config)).toEqual(strong);
    expect(withPickEvidence(strong, candidate({ structure: 0.04 }), candidate({}), 5, "Zeri", "Bottom", config)).toEqual(strong);
  });

  it("measures the statistical part in the same units as the score", () => {
    expect(statisticalPart(candidate({ strength: 0.02, lane: 0.01, pairSynergy: 0.01, comfort: 0.5 }), config)).toBeCloseTo(0.02 + 0.01 + 0.009, 10);
  });
});
