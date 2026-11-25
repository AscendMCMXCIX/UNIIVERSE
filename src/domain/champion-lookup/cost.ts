import type { DdragonAbility } from "./types";

/*
  CHAMPION INTEL's ability costs (docs/CHAMPION_INTEL.md, "Cost"), from Riot's Data Dragon alone.
  Each spell has a `cost` array and Riot's own resource line (`resource`), the words the game's
  tooltip writes under the ability's name, with placeholders Riot fills in: "{{ cost }}
  {{ abilityresourcename }}" (556 of 692 spells at 16.22.1), "No Cost" (93), "{{ healthcost }}
  Health"… The cost array is the value of "{{ cost }}" and the champion's resource (`partype`) the
  value of "{{ abilityresourcename }}", so a cost is shown only where Riot's line is exactly those
  two placeholders (or "{{ cost }}" and the champion's own resource word) and the champion's
  resource is Mana or Energy: then every placeholder of the line is filled from the ability's own
  Data Dragon values, and the number is the one Riot's line names. The rules, in order:

  1. "No Cost" (or "No cost"): no cost, in Riot's words;
  2. the line above, a Mana or Energy champion, one number per rank: the cost per rank, unless every
     rank is 0, which is a placeholder, not "free" (Aphelios's E, Kindred's E, Samira's R, Sivir's E
     and Tahm Kench's E at 16.22.1), and shows nothing;
  3. a line with no placeholder at all ("Generates 1 Ferocity", "Requires 100 Dragon Fury"):
     Riot's words as they are, except "Passive", which is not a cost;
  4. anything else (a health cost, a cost per second, a placeholder the data leaves unfilled): no
     cost is shown, and nothing is guessed.
*/

export type CostDisplay =
  /** Riot's cost per rank in the champion's resource ("Mana", "Energy"). */
  | { kind: "per-rank"; values: number[]; resource: string }
  /** Riot's line says the ability costs nothing. */
  | { kind: "none" }
  /** Riot's line as written, with no placeholder in it. */
  | { kind: "words"; text: string };

/** The resources whose costs Riot's "{{ cost }}" line counts in. */
const COUNTED = new Set(["Mana", "Energy"]);
const isAmount = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x) && x >= 0;

/** What Riot's data supports for an ability's cost, or null for nothing to show (rule 4, the passive, a record from before rules format 4). */
export function costDisplay(ability: Pick<DdragonAbility, "slot" | "maxRank" | "cost" | "resource"> | null | undefined, partype: string | null | undefined): CostDisplay | null {
  if (!ability || ability.slot === "P" || typeof ability.resource !== "string") return null;
  const line = ability.resource.replace(/\s+/g, " ").trim();
  if (/^no cost$/i.test(line)) return { kind: "none" };
  const resource = typeof partype === "string" ? partype.trim() : "";
  const counted = COUNTED.has(resource) && (line === "{{ cost }} {{ abilityresourcename }}" || line === `{{ cost }} ${resource}`);
  if (counted) {
    const values = ability.cost;
    if (!Array.isArray(values) || values.length !== ability.maxRank || !values.every(isAmount) || values.every((v) => v === 0)) return null;
    return { kind: "per-rank", values: [...values], resource };
  }
  if (line && !/\{\{|\}\}|@[A-Za-z]/.test(line) && !/^passive$/i.test(line) && line.length <= 60) return { kind: "words", text: line };
  return null;
}
