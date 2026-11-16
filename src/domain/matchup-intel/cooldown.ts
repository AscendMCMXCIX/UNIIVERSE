import type { AbilityNotes, CooldownDisplay, DdragonAbility, Freshness } from "./types";

/*
  How an ability's cooldown is shown, from Data Dragon's array and any curated notes
  (docs/MATCHUP_INTEL.md, "Cooldowns"). The rules exist because Data Dragon's single array per slot
  is right for most abilities and misleading for some:
  - a passive never has a cooldown field, so "no number" there means "not in Riot's data", not "none";
  - for an ability with charges (`maxammo` above 0) the array is the time between casts, and the
    recharge, the number a player waits for, is not given at all;
  - an all-zero array is a placeholder, not "no cooldown" (Gangplank E shows 0, the wiki 17 → 13 s).
  Curated notes, checked by a person against the wiki, say what the array cannot. A number is
  never estimated: what is not known is shown as not known.
*/

const allZero = (xs: readonly number[]) => xs.length === 0 || xs.every((x) => x === 0);
const sameNumbers = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

export function cooldownDisplay(ability: DdragonAbility | null, notes: AbilityNotes | undefined): CooldownDisplay {
  const spec = notes?.cooldown;
  const current = ability?.cooldown ?? [];
  if (spec) {
    switch (spec.kind) {
      case "per-rank":
        // Riot's current numbers win when they moved after the notes were checked (freshness says so).
        return { kind: "per-rank", seconds: ability && !allZero(current) && !sameNumbers(current, notes.ddragonCooldown) ? [...current] : [...spec.seconds], starts: spec.starts, from: "curated" };
      case "charges":
        return { kind: "charges", charges: spec.charges, recharge: [...spec.recharge], betweenCasts: spec.betweenCasts ?? null, from: "curated" };
      case "passive":
        return { kind: "passive", seconds: [...spec.seconds], scalesWith: spec.scalesWith, levels: spec.levels ? [...spec.levels] : null };
      case "none":
        return { kind: "none" };
    }
  }
  if (!ability) return { kind: "unknown", reason: "no-data" };
  if (ability.slot === "P") return { kind: "unknown", reason: "passive-not-in-ddragon" };
  if (ability.charges !== null && ability.charges > 0) {
    const between = !allZero(current) && current.every((x) => x === current[0]) ? current[0]! : null;
    return { kind: "charges", charges: ability.charges, recharge: null, betweenCasts: between, from: "ddragon" };
  }
  if (allZero(current)) return { kind: "unknown", reason: "no-number-in-ddragon" };
  return { kind: "per-rank", seconds: [...current], starts: null, from: "ddragon" };
}

/**
 * How fresh an ability's curated notes are: checked on the data's own version ("current"), checked
 * earlier with Data Dragon's numbers unchanged since ("unchanged-since"), or Data Dragon's numbers
 * moved after the check ("changed-since"). Other changes (a crowd-control duration, a range) never
 * show in the cooldown array, which is why "unchanged-since" is said as "checked on patch N", not
 * as current.
 */
export function abilityFreshness(ability: DdragonAbility | null, notes: AbilityNotes, verifiedVersion: string, dataVersion: string | null): Freshness {
  if (!ability || dataVersion === null) return "unchanged-since";
  if (!sameNumbers(ability.cooldown, notes.ddragonCooldown)) return "changed-since";
  return dataVersion === verifiedVersion ? "current" : "unchanged-since";
}

/** The weakest freshness of several (a champion's or a matchup's, from its abilities'). */
export function weakestFreshness(values: readonly Freshness[]): Freshness {
  if (values.includes("changed-since")) return "changed-since";
  if (values.includes("unchanged-since")) return "unchanged-since";
  return "current";
}
