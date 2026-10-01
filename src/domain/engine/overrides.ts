import type { Role } from "../roles";
import type { EngineConfig } from "./types";

/**
 * Coach / strategy overrides: temporary soft preferences for one draft. They tilt weights and
 * needs; they never make an illegal champion legal and never silence severe-lane penalties.
 */
export interface DraftOverrides {
  strongside?: "TOP" | "BOT" | "MID" | null;
  weakside?: Role | null;
  preserveCounterpick?: Role | null;
  noRoleFlex?: boolean;
  preferScaling?: boolean;
  preferLowerExecution?: boolean;
  prioritiseEngage?: boolean;
  riskPreference?: "reliable" | "balanced" | "ceiling";
  note?: string;
}

export const OVERRIDE_LABELS: Record<keyof Omit<DraftOverrides, "note">, string> = {
  strongside: "Strongside",
  weakside: "Weakside",
  preserveCounterpick: "Preserve counterpick",
  noRoleFlex: "Don't role-flex today",
  preferScaling: "Prefer scaling",
  preferLowerExecution: "Prefer lower execution",
  prioritiseEngage: "Prioritise engage",
  riskPreference: "Risk preference",
};

export interface AppliedOverrides {
  config: Partial<EngineConfig>;
  /** Extra per-trait bonuses applied to candidate team members (win-rate units per trait point). */
  traitBonus: Partial<Record<"engage" | "scaling" | "earlyGame" | "sideLane", number>>;
  /** Roles whose candidates get a hold bias (preserve counterpick). */
  holdRoles: Role[];
  /** Roles that should be resourced (strongside) or de-prioritised (weakside). */
  strongsideRoles: Role[];
  weaksideRoles: Role[];
  executionPenalty: number;
  riskPreference: "reliable" | "balanced" | "ceiling";
  noRoleFlex: boolean;
}

export function applyOverrides(base: EngineConfig, overrides: DraftOverrides | null | undefined): AppliedOverrides {
  const o = overrides ?? {};
  const config: Partial<EngineConfig> = {};
  const traitBonus: AppliedOverrides["traitBonus"] = {};
  if (o.noRoleFlex) config.swapThreshold = 10; // effectively never
  if (o.prioritiseEngage) traitBonus.engage = 0.006;
  if (o.preferScaling) {
    traitBonus.scaling = 0.005;
    traitBonus.earlyGame = -0.002;
  }
  if (o.preserveCounterpick) config.timing = { ...base.timing, counterpickHoldWeight: base.timing.counterpickHoldWeight * 1.8 };
  const strongsideRoles: Role[] = o.strongside === "TOP" ? ["TOP", "JUNGLE"] : o.strongside === "BOT" ? ["ADC", "SUPPORT", "JUNGLE"] : o.strongside === "MID" ? ["MID", "JUNGLE"] : [];
  const weaksideRoles: Role[] = o.weakside ? [o.weakside] : [];
  return {
    config,
    traitBonus,
    holdRoles: o.preserveCounterpick ? [o.preserveCounterpick] : [],
    strongsideRoles,
    weaksideRoles,
    executionPenalty: o.preferLowerExecution ? 0.004 : 0,
    riskPreference: o.riskPreference ?? "balanced",
    noRoleFlex: !!o.noRoleFlex,
  };
}

/** Warn when honouring the overrides costs more than a small amount of draft quality. */
export function overrideWarning(withOverrides: number, without: number): string | null {
  const drop = without - withOverrides;
  if (drop > 0.03) return `Your preferences cost about ${(drop * 100).toFixed(1)} points of draft quality: the unconstrained plan is clearly stronger.`;
  if (drop > 0.015) return `Your preferences cost roughly ${(drop * 100).toFixed(1)} points versus the unconstrained plan.`;
  return null;
}
