import { formatCooldowns, formatSeconds } from "@/lib/format";
import type { CooldownDisplay, CooldownStart, FactKind, Freshness, Recast, Slot } from "@/domain/matchup-intel/types";

/*
  Matchup Intel's fixed words (docs/MATCHUP_INTEL.md, "Cooldowns"): how a cooldown, a recast, a
  fact's kind and a set of notes' freshness are said on the page. A number is written only when the
  data holds it; what is not known is said as not known, never estimated.
*/

/** A slot as the page names it: the key, or "Passive". */
export const SLOT_NAMES: Record<Slot, string> = { P: "Passive", Q: "Q", W: "W", E: "E", R: "R" };

/** "Renekton W", "Riven passive": an ability named on a chip. */
export function abilityName(champion: string, slot: Slot): string {
  return `${champion} ${slot === "P" ? "passive" : slot}`;
}

/** The anchor of an ability's row ("ability-Renekton-W"), for the briefing's chips. */
export function abilityAnchor(championId: string, slot: Slot): string {
  return `ability-${championId}-${slot}`;
}

const STARTS: Record<Exclude<CooldownStart, "on-cast">, string> = {
  "after-first-cast": "starts after the first cast",
  "after-last-recast": "starts after the last recast",
  "after-effect-ends": "starts when the effect ends",
  "after-channel": "starts after the channel",
};

/**
 * The cooldown line of an ability: `value` (the numbers, or why there are none), `notes` (when it
 * starts, charges' recharge, levels), and `known` (false when there is no number to show).
 */
export function cooldownWords(d: CooldownDisplay): { value: string; notes: string[]; known: boolean } {
  switch (d.kind) {
    case "per-rank":
      // On cast is the ordinary start, so it goes without saying.
      return { value: formatCooldowns(d.seconds), notes: d.starts && d.starts !== "on-cast" ? [STARTS[d.starts]] : [], known: d.seconds.length > 0 };
    case "charges":
      return {
        value: `${d.charges} charge${d.charges === 1 ? "" : "s"}`,
        notes: [d.recharge && d.recharge.length ? `one back every ${formatCooldowns(d.recharge)}` : "recharge not in Riot's data", ...(d.betweenCasts !== null ? [`${formatSeconds(d.betweenCasts)} s between casts`] : [])],
        known: true,
      };
    case "passive": {
      const levels = d.levels && d.levels.length === d.seconds.length && d.seconds.length > 1 && !d.seconds.every((s) => s === d.seconds[0]) ? d.levels : null;
      if (levels) return { value: `${d.seconds.map(formatSeconds).join(" / ")} s`, notes: [`at levels ${levels.join(" / ")}`], known: true };
      if (d.scalesWith === "rank") return { value: formatCooldowns(d.seconds), notes: d.seconds.length > 1 ? ["by its rank"] : [], known: d.seconds.length > 0 };
      return { value: formatCooldowns(d.seconds, "level"), notes: d.scalesWith === "level" && d.seconds.length > 1 && !d.seconds.every((s) => s === d.seconds[0]) ? ["by level"] : [], known: d.seconds.length > 0 };
    }
    case "none":
      return { value: "No cooldown", notes: [], known: true };
    case "unknown":
      return { value: d.reason === "passive-not-in-ddragon" ? "Cooldown not in Riot's data" : d.reason === "no-number-in-ddragon" ? "No fixed cooldown in Riot's data" : "No cooldown data held yet", notes: [], known: false };
  }
}

/** "Can be cast 2 more times within 4 s" (the recast's own note follows it). */
export function recastWords(r: Recast): string {
  const more = r.count === 1 ? "again" : `${r.count} more times`;
  return `Can be cast ${more}${r.windowSeconds !== undefined ? ` within ${formatSeconds(r.windowSeconds)} s` : ""}`;
}

/** Each kind of fact as its badge names it for screen readers (the badge shows the fact's own word). */
export const FACT_KINDS: Record<FactKind, string> = {
  "crowd-control": "Crowd control",
  mobility: "Mobility",
  defence: "Defence",
  sustain: "Sustain",
  damage: "Damage",
  interaction: "Interaction",
  exception: "Exception",
};

/**
 * How fresh a set of curated notes is, in words: when it was checked, and, when Riot's numbers for
 * its abilities have moved since, that it may be out of date. "Checked on" a patch is all that is
 * claimed otherwise: other changes (a duration, a range) never show in the numbers compared.
 */
export function freshnessWords(f: Freshness, patch: string): { checked: string; warning: string | null } {
  return { checked: `Checked on patch ${patch}`, warning: f === "changed-since" ? "Riot's numbers for these abilities changed after the check: may be out of date" : null };
}
