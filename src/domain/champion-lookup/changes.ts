import { compareDdragonVersions } from "./cooldown";
import type { AbilityChange, DdragonAbility, DdragonChampionAbilities } from "./types";

/*
  CHAMPION INTEL's patch marks (docs/CHAMPION_INTEL.md, "Changed this patch"): when the version-check
  job reads a champion at a new game version, it compares the new record with the one it holds and
  keeps, per ability, whether Riot's text (its hash), the base cooldowns, the cost or (rules format
  5) the range changed, and for the champion whether its base stats did. Only whether, never by how
  much: the page says "Riot changed this ability's text in 26.23", and the numbers it shows are the
  new ones Riot gives.

  Data Dragon cannot show a change Riot made without changing its data (a hidden number), so no
  mark never means "unchanged in the game", only "unchanged in Riot's data". Pure, so the sync and
  the tests share it.
*/

const same = (a: unknown, b: unknown) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]);

/** What changed between an ability's previous stored record and its new one, or null when nothing did (or there is nothing to compare). */
export function abilityChange(before: DdragonAbility | null | undefined, after: DdragonAbility, since: string): AbilityChange | null {
  if (!before || before.slot !== after.slot) return null;
  const text = typeof before.textHash === "string" && typeof after.textHash === "string" && before.textHash !== after.textHash;
  const cooldown = Array.isArray(before.cooldown) && Array.isArray(after.cooldown) && !same(before.cooldown, after.cooldown);
  // A record from before rules format 4 has no cost: unknown, so never called a change.
  const cost = Array.isArray(before.cost) && Array.isArray(after.cost) && !same(before.cost, after.cost);
  // A record from before rules format 5 has no range: unknown, so never called a change (and not marked at all).
  const comparable = Array.isArray(before.range) && Array.isArray(after.range);
  const range = comparable && !same(before.range, after.range);
  if (!(text || cooldown || cost || range)) return null;
  return comparable ? { since, text, cooldown, cost, range } : { since, text, cooldown, cost };
}

/** Whether Riot's base stats differ between two records' facts (false when either has none). */
export function statsChanged(before: DdragonChampionAbilities | null | undefined, after: DdragonChampionAbilities): boolean {
  const a = before?.facts?.stats;
  const b = after.facts?.stats;
  if (!a || !b) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].some((k) => a[k] !== b[k]);
}

/**
 * The new record with its patch marks, against the one held before it:
 * - an earlier version held: each ability's change against it, and the stats';
 * - the same version held (read again under new rules): the marks it already had, carried over;
 * - none held, or a later one (never expected): no marks.
 */
export function withChanges(next: DdragonChampionAbilities, previous: DdragonChampionAbilities | null | undefined): DdragonChampionAbilities {
  const order = previous ? compareDdragonVersions(previous.version, next.version) : null;
  if (!previous || order === null || order > 0) return next;
  if (order === 0) {
    return {
      ...next,
      abilities: next.abilities.map((a) => {
        const held = previous.abilities.find((b) => b.slot === a.slot)?.changed;
        return held ? { ...a, changed: held } : a;
      }),
      facts: next.facts ? { ...next.facts, ...(previous.facts?.statsChangedSince ? { statsChangedSince: previous.facts.statsChangedSince } : {}) } : next.facts,
    };
  }
  return {
    ...next,
    abilities: next.abilities.map((a) => {
      const changed = abilityChange(
        previous.abilities.find((b) => b.slot === a.slot),
        a,
        previous.version,
      );
      return changed ? { ...a, changed } : a;
    }),
    facts: next.facts ? { ...next.facts, ...(statsChanged(previous, next) ? { statsChangedSince: previous.version } : {}) } : next.facts,
  };
}
