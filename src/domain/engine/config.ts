import type { EngineConfig } from "./types";

/**
 * Default engine configuration. Every number here is a tunable; the Settings page exposes the
 * major weights and the team's engine_config column stores overrides.
 *
 * Units: all score components are expressed in approximate win-rate deltas (0.02 ≈ 2 points).
 */
export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  philosophy: { synergy: 0.5, enemy: 0.5 },
  weights: {
    championStrength: 1.0,
    playerComfort: 0.7,
    laneMatchup: 1.0,
    teamMatchup: 0.5,
    pairSynergy: 0.9,
    structure: 1.0,
    interaction: 1.0,
    proPriority: 0.35,
    flexValue: 0.3,
    roleSwapCost: 0.02,
  },
  severity: { slightlyUnfavourable: -0.02, significantlyUnfavourable: -0.05, nearUnplayable: -0.09 },
  severityPenalty: { significant: 1.6, unplayable: 2.6 },
  shrinkage: { strength: 250, matchup: 60, synergy: 60 },
  timing: {
    denialWeight: 1.0,
    counterpickHoldWeight: 0.6,
    blindSafetyWeight: 0.4,
    banRateMultiplier: 1.6,
    pickRateMultiplier: 1.4,
  },
  swapThreshold: 0.015,
  search: { maxExhaustive: 6000, beamWidth: 14, topCandidates: 8, pairCandidates: 6 },
  keyPairMultiplier: 1.3,
};

export function mergeEngineConfig(overrides?: Partial<EngineConfig> | Record<string, unknown>): EngineConfig {
  if (!overrides) return DEFAULT_ENGINE_CONFIG;
  const o = overrides as Partial<EngineConfig>;
  return {
    philosophy: { ...DEFAULT_ENGINE_CONFIG.philosophy, ...(o.philosophy ?? {}) },
    weights: { ...DEFAULT_ENGINE_CONFIG.weights, ...(o.weights ?? {}) },
    severity: { ...DEFAULT_ENGINE_CONFIG.severity, ...(o.severity ?? {}) },
    severityPenalty: { ...DEFAULT_ENGINE_CONFIG.severityPenalty, ...(o.severityPenalty ?? {}) },
    shrinkage: { ...DEFAULT_ENGINE_CONFIG.shrinkage, ...(o.shrinkage ?? {}) },
    timing: { ...DEFAULT_ENGINE_CONFIG.timing, ...(o.timing ?? {}) },
    swapThreshold: o.swapThreshold ?? DEFAULT_ENGINE_CONFIG.swapThreshold,
    search: { ...DEFAULT_ENGINE_CONFIG.search, ...(o.search ?? {}) },
    keyPairMultiplier: o.keyPairMultiplier ?? DEFAULT_ENGINE_CONFIG.keyPairMultiplier,
  };
}
