import type { TraitKey } from "../champion-model/traits";
import type { TeamProfile } from "./profile";

export interface CompositionNeed {
  key: "engage" | "frontline" | "damageBalance" | "waveclear" | "reliableCC" | "carryProtection" | "sustainedDamage" | "disengage";
  /** Trait that would address the need (used to score candidates). */
  trait: TraitKey;
  /** 0..1, how urgent this is for a *complete* team. */
  severity: number;
  message: string;
}

/**
 * Identifies structural holes in a (possibly partial) composition.
 *
 * Needs are expressed for the finished five-player team: with slots still open, a need is a
 * target for the remaining picks rather than a verdict. The engine only ever satisfies a need
 * with champions the eligible player actually has configured.
 */
export function compositionNeeds(profile: TeamProfile): CompositionNeed[] {
  const needs: CompositionNeed[] = [];
  const t = profile.totals;
  const m = profile.maxes;

  // Reliable initiation. A composition with two strong disengage sources can live without it (poke/scaling).
  if (m.engage < 2) {
    const disengageHeavy = t.counterEngage >= 4 && t.poke >= 3;
    needs.push({
      key: "engage",
      trait: "engage",
      severity: disengageHeavy ? 0.35 : m.engage === 0 ? 1 : 0.75,
      message: m.engage === 0 ? "No reliable engage yet" : "Only weak engage so far",
    });
  }
  if (profile.frontlineCount === 0) {
    needs.push({ key: "frontline", trait: "frontline", severity: 0.9, message: "No frontline to absorb pressure" });
  } else if (profile.frontlineCount === 1 && m.frontline < 3) {
    needs.push({ key: "frontline", trait: "frontline", severity: 0.3, message: "Frontline is thin" });
  }
  const dmgSources = (t.physicalDamage + t.magicDamage) / 3;
  if (dmgSources >= 3) {
    if (profile.physicalShare >= 0.85) {
      needs.push({ key: "damageBalance", trait: "magicDamage", severity: 0.6, message: "Damage is almost entirely physical (easy to itemise against)" });
    } else if (profile.physicalShare <= 0.15) {
      needs.push({ key: "damageBalance", trait: "physicalDamage", severity: 0.6, message: "Damage is almost entirely magic (easy to itemise against)" });
    }
  }
  if (t.waveclear < 4 && profile.count >= 3) {
    needs.push({ key: "waveclear", trait: "waveclear", severity: 0.45, message: "Low waveclear makes sieges and resets hard" });
  }
  if (profile.reliableCCSources === 0 && profile.count >= 2) {
    needs.push({ key: "reliableCC", trait: "reliableCC", severity: 0.5, message: "No reliable crowd control" });
  }
  if (profile.hardCarries >= 1 && t.peel < 3) {
    needs.push({ key: "carryProtection", trait: "peel", severity: 0.55, message: "Hypercarry lacks protection" });
  }
  if (t.sustainedDps < 3 && profile.count >= 3) {
    needs.push({ key: "sustainedDamage", trait: "sustainedDps", severity: 0.5, message: "Burst-only damage struggles against tanks" });
  }
  return needs;
}

/** Scale severities for a partial team: fewer picks left means the hole is more urgent. */
export function urgencyMultiplier(filledCount: number): number {
  const remaining = Math.max(0, 5 - filledCount);
  if (remaining === 0) return 1;
  // 4 picks left → 0.4, 1 pick left → 1.0
  return Math.min(1, 0.25 + (5 - remaining) * 0.19);
}
