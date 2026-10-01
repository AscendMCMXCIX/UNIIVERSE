import type { ChampionTraits } from "./traits";

/**
 * Derived, deliberately coarse descriptors built from the curated traits (and Data Dragon
 * difficulty when available). They are not statistics; they feed the execution, resource and
 * power-curve reasoning.
 */
export interface ExecutionProfile {
  /** 0..3: mechanical demand on the player. */
  mechanics: number;
  /** 0..3: how much the kit depends on teammates following up or setting up. */
  coordination: number;
  /** 0..3: how badly a mistake is punished (immobile, long cooldown engages). */
  punish: number;
  /** Combined 0..1. */
  total: number;
}

export function executionProfile(traits: ChampionTraits, ddragonDifficulty?: number): ExecutionProfile {
  const mechanics = ddragonDifficulty !== undefined ? Math.min(3, ddragonDifficulty / 3.4) : Math.min(3, (traits.mobility + traits.burst) / 2);
  const coordination = Math.min(3, (traits.engage >= 2 ? 1.2 : 0) + (traits.dive >= 3 ? 1 : traits.dive >= 2 ? 0.5 : 0) + (traits.sideLane >= 3 ? 0.6 : 0) + (traits.pick >= 2 ? 0.4 : 0) + (traits.counterEngage >= 2 ? 0.4 : 0));
  const punish = Math.min(3, (traits.mobility === 0 ? 1 : 0) + (traits.engage >= 3 ? 0.8 : 0) + (traits.range === 0 && traits.frontline === 0 ? 0.8 : 0) + (traits.scaling >= 3 ? 0.4 : 0));
  const total = Math.min(1, (mechanics * 0.45 + coordination * 0.35 + punish * 0.2) / 3);
  return { mechanics, coordination, punish, total };
}

export type ResourceNeed = "strongside" | "flexible" | "weakside";

/**
 * How much gold, XP and jungle attention the champion needs to function.
 * Strongside champions want priority and resources; weakside champions survive on little.
 */
export function resourceNeed(traits: ChampionTraits): { need: ResourceNeed; score: number } {
  const score = (traits.scaling * 0.8 + traits.sustainedDps * 0.6 + traits.sideLane * 0.4 + traits.earlyGame * 0.3 - traits.frontline * 0.5 - traits.peel * 0.5 - traits.counterEngage * 0.3) / 3;
  const need: ResourceNeed = score >= 1.1 ? "strongside" : score <= 0.3 ? "weakside" : "flexible";
  return { need, score };
}

export type PowerCurve = "early" | "mid" | "late";

export interface PowerProfile {
  curve: PowerCurve;
  /** Readable spike timings. */
  spikes: string[];
}

export function powerProfile(traits: ChampionTraits): PowerProfile {
  const early = traits.earlyGame;
  const late = traits.scaling;
  const curve: PowerCurve = early >= late + 1 ? "early" : late >= early + 1 ? "late" : "mid";
  const spikes: string[] = [];
  if (early >= 3) spikes.push("levels 1–3");
  if (early >= 2) spikes.push("first item");
  if (curve === "mid" || late >= 2) spikes.push("two items");
  if (late >= 3) spikes.push("three items and late");
  if (traits.engage >= 3 || traits.pick >= 3) spikes.push("level 6 (ultimate)");
  return { curve, spikes: spikes.length ? spikes : ["even throughout"] };
}
