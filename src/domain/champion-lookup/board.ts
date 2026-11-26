import { MECHANIC_GROUPS, type MechanicGroup } from "./mechanics";
import type { StatKey, StatRow } from "./stats";
import type { LookupAbility, LookupFacts } from "./view";

/*
  CHAMPION INTEL's board (docs/CHAMPION_INTEL.md, "The page" and "Compare"): what the page needs to
  lay one champion out, or two side by side as one aligned board, from the data it already has.
  Pure, so it is tested without a browser (board.test.ts).

  - The rank columns: one per rank of the most ranks any of a champion's cooldowns or costs has, at
    least five (Udyr's and Jayce's basic abilities have six), so every row of that champion's column
    puts rank n in the same place.
  - The base statistics as listed: the champion's facts already say its attack range once, so the
    list leaves it out; two champions' lists are aligned row by row on the union of their
    statistics (a champion without mana has no Mana row: its cell says so with "—").
  - Each ability's mechanics as the row's chips: crowd control first, then mobility, damage,
    sustain, defence and casting, each kind once, in words a newcomer reads ("Magic damage").
*/

/** The fewest rank columns a champion's column has: most basic abilities have five ranks. */
export const MIN_RANK_COLUMNS = 5;

/** The rank columns a champion's abilities need: the most per-rank values any cooldown or cost has, at least five. */
export function rankColumns(abilities: readonly LookupAbility[] | null | undefined): number {
  let most = MIN_RANK_COLUMNS;
  for (const a of abilities ?? []) {
    if (a.cooldown.kind === "per-rank") most = Math.max(most, a.cooldown.seconds.length);
    if (a.cost?.kind === "per-rank") most = Math.max(most, a.cost.values.length);
  }
  return most;
}

/** The base statistics the list shows: every one Riot's data gives, except attack range, which the champion's facts say once. */
export function listedStats(facts: LookupFacts | null | undefined): StatRow[] {
  return (facts?.stats ?? []).filter((s) => s.key !== "attackrange");
}

/** One row of two champions' base statistics, aligned: each champion's own row, or null where its data has none. */
export interface AlignedStat {
  key: StatKey;
  a: StatRow | null;
  b: StatRow | null;
}

/** Two champions' listed statistics row by row, in the page's order (statRows), on the union of the two. */
export function alignedStats(a: LookupFacts | null | undefined, b: LookupFacts | null | undefined): AlignedStat[] {
  const left = listedStats(a);
  const right = listedStats(b);
  const order: StatKey[] = [];
  // statRows' order is fixed; merge the two lists keeping it (a key only one side has slots in where it falls).
  const ORDER: StatKey[] = ["hp", "hpregen", "mp", "mpregen", "attackdamage", "attackspeed", "armor", "spellblock", "attackrange", "movespeed"];
  for (const key of ORDER) if (left.some((s) => s.key === key) || right.some((s) => s.key === key)) order.push(key);
  return order.map((key) => ({ key, a: left.find((s) => s.key === key) ?? null, b: right.find((s) => s.key === key) ?? null }));
}

/** One mechanic an ability's description names, as its chip on the row. */
export interface MechanicChip {
  kind: string;
  /** The chip's words: the kind's word, damage types with "damage" after them ("Magic damage"). */
  word: string;
  group: MechanicGroup;
}

/** An ability's mechanics as chips: by group (crowd control first), each kind once, in the rules' order within a group. */
export function mechanicChips(ability: Pick<LookupAbility, "mechanics">): MechanicChip[] {
  const seen = new Set<string>();
  const chips: Array<MechanicChip & { at: number }> = [];
  ability.mechanics.forEach((f, i) => {
    if (seen.has(f.kind)) return;
    seen.add(f.kind);
    chips.push({ kind: f.kind, word: f.group === "damage" ? `${f.word} damage` : f.word, group: f.group, at: i });
  });
  const rank = (g: MechanicGroup) => MECHANIC_GROUPS.indexOf(g);
  return chips.sort((x, y) => rank(x.group) - rank(y.group) || x.at - y.at).map(({ kind, word, group }) => ({ kind, word, group }));
}
