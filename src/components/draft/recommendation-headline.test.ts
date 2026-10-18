import { describe, expect, it } from "vitest";
import type { BanRecommendation, BreakdownItem, PairRecommendation, PickRecommendation } from "@/domain/engine/types";
import { HEADLINE_MAX, recommendationHeadline } from "./recommendation-headline";

const names = { player: (id: string | null | undefined) => ({ p1: "Demo Jungle", p2: "Demo ADC", p3: "Demo Support" })[id ?? ""] ?? "Player", champion: (id: string) => id };

function pick(over: { tier?: string; games?: number; items?: Array<Pick<BreakdownItem, "key" | "value">>; flex?: boolean } = {}): PickRecommendation {
  return {
    kind: "pick",
    championId: "Nocturne",
    playerId: "p1",
    role: "JUNGLE",
    score: 0.55,
    why: ["Player data decided this: on pool order alone Varus (Demo ADC) would rank first."],
    candidate: { isFlex: over.flex ?? false } as PickRecommendation["candidate"],
    breakdown: {
      items: (over.items ?? []).map((i) => ({ ...i, text: "engine sentence" })),
      proficiencyContribution: 0.01,
      proficiencyDecisive: null,
      proficiency: over.tier ? { tier: over.tier, games: over.games ?? 0, recentGames: 1, patchGames: 0, confidence: 0.5 } : null,
      evidence: { label: "high", games: 100, confidence: 0.8 },
    },
  };
}

describe("recommendation headline", () => {
  it("leads with the player's experience and the strongest supporting factor", () => {
    const h = recommendationHeadline(pick({ tier: "core", games: 20, items: [{ key: "team-fit", value: 0.004 }, { key: "patch-strength", value: 0.012 }] }), names);
    expect(h).toBe("Demo Jungle has played it a lot (20 games) · strong this patch");
  });

  it("never repeats the engine's ranking note, and stays short", () => {
    const h = recommendationHeadline(pick({ tier: "strong", games: 7, items: [{ key: "enemy-interaction", value: 0.02 }], flex: true }), names);
    expect(h).not.toMatch(/pool order/);
    expect(h.length).toBeLessThanOrEqual(HEADLINE_MAX);
    expect(h).toBe("Demo Jungle plays it regularly (7 games) · good into their picks · flex pick");
  });

  it("without experience on record, names the factor and whose pool it is from", () => {
    expect(recommendationHeadline(pick({ items: [{ key: "team-fit", value: 0.01 }] }), names)).toBe("Fits our composition · Demo Jungle's pool");
    // No factor worth naming: the pool alone.
    expect(recommendationHeadline(pick({ items: [{ key: "team-fit", value: 0.001 }] }), names)).toBe("In Demo Jungle's Jungle pool");
  });

  it("explains bans by who they protect, without repeating the likely role shown above it", () => {
    const ban: BanRecommendation = { kind: "ban", championId: "Jinx", score: 0.1, why: [], protects: [{ playerId: "p2", role: "ADC" }, { playerId: "p3", role: "SUPPORT" }], likelyRole: "ADC" };
    expect(recommendationHeadline(ban, names)).toBe("Protects Demo ADC and Demo Support");
    expect(recommendationHeadline(ban, names)).not.toMatch(/likely|Bottom/i);
    expect(recommendationHeadline({ ...ban, protects: [] }, names)).toBe("Denies a strong option");
    expect(recommendationHeadline({ ...ban, protects: [], likelyRole: null }, names)).toBe("High priority for them · denies a strong option");
  });

  it("names both champions of a pair", () => {
    const pair: PairRecommendation = { kind: "pair", picks: [pick(), { ...pick(), championId: "Orianna" }], score: 0.5, why: [] };
    expect(recommendationHeadline(pair, names)).toBe("Nocturne and Orianna together · both in our pools");
  });
});
