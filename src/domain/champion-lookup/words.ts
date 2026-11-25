import { formatPerRank } from "@/lib/format";
import type { CooldownDisplay, UnknownCooldownReason } from "./cooldown";
import type { Slot } from "./types";

/*
  CHAMPION INTEL's fixed words (docs/CHAMPION_INTEL.md, "Cooldowns"): why an ability shows no
  cooldown number, said plainly, and the lines of the page that never change. No "verified", no
  timer, no "ready at" (words.test.ts).
*/

export const SLOT_NAMES: Record<Slot, string> = { P: "Passive", Q: "Q", W: "W", E: "E", R: "R" };

/** What an ability with no cooldown number says in its place: a short line, and where it helps, a second one. */
export const REASON_WORDS: Record<UnknownCooldownReason, { line: string; more?: string }> = {
  "passive-not-in-ddragon": { line: "No cooldown in Riot's data", more: "Riot's data gives passives no cooldown." },
  "charges-in-ddragon": { line: "Charges: recharge not in Riot's data", more: "Riot's number is the wait between casts, not the time to regain a charge." },
  "no-number-in-ddragon": { line: "No cooldown number in Riot's data" },
  "two-abilities-in-ddragon": { line: "Two abilities share this slot in Riot's data", more: "Riot's data doesn't say which one its cooldown is." },
  "ranks-mismatch-in-ddragon": { line: "Riot's data doesn't give one number per rank" },
  "known-wrong-in-ddragon": { line: "Riot's number for this ability is known to be wrong" },
  "several-abilities-in-ddragon": { line: "Several abilities share this slot in Riot's data" },
  "picked-up-spell-in-ddragon": { line: "This slot casts spells picked up in a game" },
  unreadable: { line: "Riot's cooldown data can't be read" },
  "no-data": { line: "No cooldown data held yet" },
};

/** Riot's array for a slot of two abilities, said as Riot's and never as either one's cooldown: "Riot lists 16 / 14 / 12 s for the slot". */
export function listedWords(listed: readonly number[]): string {
  return `Riot lists ${formatPerRank(listed, "s")} for the slot`;
}

/** The words that stand for a cooldown with no number (a cooldown with one has none: its numbers are drawn). */
export function cooldownWords(cooldown: CooldownDisplay): { line: string; more: string | null } | null {
  if (cooldown.kind === "per-rank") return null;
  const w = REASON_WORDS[cooldown.reason];
  const more = [w.more, cooldown.listed ? `${listedWords(cooldown.listed)}.` : null].filter(Boolean).join(" ");
  return { line: w.line, more: more || null };
}

/** The rule's line under the abilities: the formula, and what it leaves out. */
export const HASTE_RULE_WORDS = "At a haste: base × 100 / (100 + haste), Riot's general rule, applied only where Riot's data gives the cooldown. Ultimate haste isn't counted.";

/** Said once under the abilities: what Riot's published data does not hold, so the page never shows it. */
export const DATA_LIMIT_WORDS = "Riot's published data has no damage values or scaling for abilities, so none are shown: a description names the damage type where Riot's words do.";

/** Where the key mechanics come from, said beside them. */
export const MECHANICS_SOURCE_WORDS = "Named in Riot's own ability descriptions, found by fixed word rules: open an ability to read Riot's sentence.";

/** What Riot changed in an ability in its last patch, as the opened row says it; null when nothing is known. */
export function changedWords(changed: { sincePatch: string | null; text: boolean; cooldown: boolean; cost: boolean } | null | undefined): string | null {
  if (!changed) return null;
  const what = [changed.text ? "text" : null, changed.cooldown ? "cooldowns" : null, changed.cost ? "cost" : null].filter((x): x is string => !!x);
  if (!what.length) return null;
  const list = what.length === 1 ? what[0]! : `${what.slice(0, -1).join(", ")} and ${what[what.length - 1]}`;
  return `Riot changed this ability's ${list} since patch ${changed.sincePatch ?? "the one before"}. The numbers shown are the current ones.`;
}
