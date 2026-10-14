import type { EngineConfig } from "./types";
import { DEFAULT_SHRINKAGE } from "./memory-stats";

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
    execution: 0.012,
    resourceOverload: 0.01,
    coordination: 0.006,
  },
  severity: { slightlyUnfavourable: -0.02, significantlyUnfavourable: -0.05, nearUnplayable: -0.09 },
  severityPenalty: { significant: 1.6, unplayable: 2.6 },
  shrinkage: { ...DEFAULT_SHRINKAGE },
  timing: {
    denialWeight: 1.0,
    counterpickHoldWeight: 0.6,
    blindSafetyWeight: 0.4,
    banRateMultiplier: 1.6,
    pickRateMultiplier: 1.4,
  },
  swapThreshold: 0.015,
  search: { maxExhaustive: 6000, beamWidth: 14, topCandidates: 8, pairCandidates: 6, slotShortlist: 10 },
  keyPairMultiplier: 1.3,
  riskPreference: "balanced",
};

/** Multiplier on execution/coordination penalties per risk preference. */
export const RISK_MULTIPLIER: Record<EngineConfig["riskPreference"], number> = { reliable: 2.0, balanced: 1.0, ceiling: 0.25 };

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
    riskPreference: o.riskPreference === "reliable" || o.riskPreference === "ceiling" || o.riskPreference === "balanced" ? o.riskPreference : DEFAULT_ENGINE_CONFIG.riskPreference,
  };
}
