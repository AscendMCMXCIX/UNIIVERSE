import { formatSeconds } from "@/lib/format";
import type { StatKey } from "@/domain/champion-lookup/stats";
import type { LookupChampion } from "@/domain/champion-lookup/view";

/*
  MATCHUP INTEL's "From Riot's data" block (docs/MATCHUP_INTEL.md, "From Riot's data"): what the two
  champions' Data Dragon records say about the first levels of a lane, as differences of the same
  quantity in neutral words, for every pair of champions in every role and on every patch (rebuilt
  from whatever version-check stored, at every read). Pure, and built only from the LookupChampion
  the board already draws, so a number in the band is the number in the columns.

  - Level 1 only: attack range, move speed, health, armor and magic resist, in that order, each
    "{n} more for {name}" or "the same". Never faster, slower, better, worse, stronger or favoured,
    never a value at a level above 1 (Riot's growth formula is not in Data Dragon: stats.ts), and
    never two different quantities compared. Attack damage is left out: its growth is a 0
    placeholder in Riot's data, and its level-1 figure is in each column already.
  - Rank-1 cooldowns and costs stay in the board's rows, the mechanics in each row's chips: the band
    repeats none of them.
  - Ranges (the owner's decision D3): each champion's reviewed ranges are on its own ability rows in
    the board under the band (src/domain/champion-lookup/range.ts). The band draws no range line:
    two champions' abilities are different abilities, so no range of one is the same quantity as
    one of the other. The `ranges` hook (RangeLineSource) stays for a future rule that says which
    are comparable; none is passed.
  - Patch awareness: where Riot's data for either champion changed since its previous stored
    version (the abilities' and the statistics' own "Changed since" marks), the block names what
    changed, never by how much.
*/

/** The statistics the block compares, in its order, with their labels. */
export const EARLY_STATS: ReadonlyArray<{ key: StatKey; label: string }> = [
  { key: "attackrange", label: "Attack range" },
  { key: "movespeed", label: "Move speed" },
  { key: "hp", label: "Health" },
  { key: "armor", label: "Armor" },
  { key: "spellblock", label: "Magic resist" },
];

/** One line of the block: a statistic both records give, the two numbers, and which champion has more. */
export interface KitLine {
  key: string;
  label: string;
  /** The first column's number and the second's, at level 1, exactly as Riot's data gives them. */
  a: number;
  b: number;
  /** 0: the first column's champion has more; 1: the second's; null: the same. */
  more: 0 | 1 | null;
  /** How much more, the absolute difference. */
  diff: number;
  /** "50 more for Darius", or "the same". */
  words: string;
}

/** Range lines from Champion Intel's reviewed range rule (champion-lookup/range.ts), where it marks a cast range as reviewed (none by default). */
export type RangeLineSource = (a: LookupChampion, b: LookupChampion) => KitLine[];

const round4 = (v: number) => Math.round(v * 10_000) / 10_000;

/** The neutral words of a difference: "22 more for Darius", or "the same". */
export function differenceWords(diff: number, name: string | null): string {
  return diff === 0 || !name ? "the same" : `${formatSeconds(diff)} more for ${name}`;
}

/** One line from two numbers of the same quantity; null where either is missing. */
export function kitLine(key: string, label: string, a: number | null | undefined, b: number | null | undefined, names: readonly [string, string]): KitLine | null {
  if (typeof a !== "number" || typeof b !== "number" || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  const diff = round4(Math.abs(a - b));
  const more: 0 | 1 | null = diff === 0 ? null : a > b ? 0 : 1;
  return { key, label, a, b, more, diff, words: differenceWords(diff, more === null ? null : names[more]) };
}

/** The level-1 lines of two champions (at most five), then any reviewed range lines; none where either has no statistics stored. */
export function earlyKitLines(a: LookupChampion, b: LookupChampion, opts: { ranges?: RangeLineSource } = {}): KitLine[] {
  const names = [a.champion.name, b.champion.name] as const;
  const of = (c: LookupChampion, key: StatKey) => c.facts?.stats.find((s) => s.key === key)?.base ?? null;
  const lines = a.facts && b.facts ? EARLY_STATS.map(({ key, label }) => kitLine(key, label, of(a, key), of(b, key), names)).filter((l): l is KitLine => l !== null) : [];
  return [...lines, ...(opts.ranges?.(a, b) ?? [])];
}

/** What changed in Riot's data for a champion since its previous stored version: each ability's slot and kinds of change, and its base statistics. */
export interface KitChange {
  champion: string;
  /** The public patch of the version compared against ("26.22"); null when not known. */
  sincePatch: string | null;
  /** "E text", "Q cooldowns", "W cost", "base stats", in the board's order. */
  parts: string[];
}

/** The champion's change since its previous stored version, or null for none known. */
export function kitChange(c: LookupChampion): KitChange | null {
  const parts: string[] = [];
  let since: string | null = null;
  for (const ab of c.abilities ?? []) {
    const ch = ab.changed;
    if (!ch) continue;
    const kinds = [ch.text ? "text" : null, ch.cooldown ? "cooldowns" : null, ch.cost ? "cost" : null, ch.range ? "range" : null].filter((k): k is string => !!k);
    if (!kinds.length) continue;
    since ??= ch.sincePatch;
    // "E text and cooldowns", "Q text, cooldowns and range".
    const listed = kinds.length > 1 ? `${kinds.slice(0, -1).join(", ")} and ${kinds.at(-1)}` : kinds[0];
    parts.push(`${ab.slot === "P" ? "Passive" : ab.slot} ${listed}`);
  }
  if (c.facts?.statsChangedSincePatch) {
    since ??= c.facts.statsChangedSincePatch;
    parts.push("base stats");
  }
  return parts.length ? { champion: c.champion.name, sincePatch: since, parts } : null;
}
