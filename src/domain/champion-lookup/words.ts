import { formatCount, formatPerRank } from "@/lib/format";
import type { CooldownDisplay, UnknownCooldownReason } from "./cooldown";
import { shownReach, type RangeDisplay, type RangeReviewer } from "./range";
import type { Slot } from "./types";

/*
  CHAMPION INTEL's fixed words (docs/CHAMPION_INTEL.md, "Cooldowns"): why an ability shows no
  cooldown number, said plainly, and the lines of the page that never change. No "verified", no
  timer, no "ready at" (words.test.ts).
*/

/** Each slot's name as a screen reader hears it beside the ability's name (the slot's key tile is drawn, not read). */
export const SLOT_NAMES: Record<Slot, string> = { P: "Passive", Q: "Q", W: "W", E: "E", R: "R" };

/** What an ability with no cooldown number says in its place: a short line, and where it helps, a second one. */
export const REASON_WORDS: Record<UnknownCooldownReason, { line: string; more?: string }> = {
  "passive-not-in-ddragon": { line: "No cooldown in Riot's data" },
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

/**
 * The haste rule, said once per champion in the ⓘ beside its haste field (25 Nov 2026: a short tip
 * instead of a line under the board), two short sentences: the formula with where it applies, and
 * what it leaves out.
 */
export const HASTE_RULE_WORDS = "Cooldowns at a haste use Riot's rule: base × 100 / (100 + haste), only where Riot's data gives one. Ultimate haste isn't counted.";

/**
 * What the abilities' figures and chips come from and what Riot's data does not hold, in the ⓘ
 * beside the abilities' heading: the chips are words of Riot's descriptions; a range only where what
 * Riot's number measures was checked against Riot's text (./range.ts); no damage values or scaling;
 * no passive cooldown, which the row marks with a dash.
 */
export const DATA_LIMIT_WORDS = "Mechanics come from Riot's descriptions; ranges only where checked against Riot's text. Riot's data has no damage values or scaling, and no cooldown for passives (—).";

/** A range as the page has it: the rule's display and the public patch it was reviewed on ("26.23"). */
export type RangeWithPatch = RangeDisplay & { reviewedPatch: string | null };

/**
 * The folded row's range, in words: "Range 970", "Range 1,300 / 1,550 / 1,800" (one number where
 * every rank has the same), "Global"; null for what shows nothing (cast on the champion, or waiting
 * for a review after Riot changed the ability).
 */
export function rangeWords(range: RangeDisplay | null | undefined): string | null {
  if (!range) return null;
  if (range.kind === "global") return "Global";
  if (range.kind !== "reach") return null;
  return `Range ${shownReach(range.values).map(formatCount).join(" / ")}`;
}

const REVIEWED_BY: Record<RangeReviewer, (patch: string) => string> = {
  "automated draft": (p) => `Classified by fixed rules from Riot's text on patch ${p}, not by a person.`,
  "automated review": (p) => `Reviewed against Riot's text by an automated review on patch ${p}, not by a person.`,
  owner: (p) => `Reviewed by the team on patch ${p}.`,
};

/**
 * The opened row's line about the range: where the number comes from and who decided what it
 * measures, or, when Riot changed an ability whose range was shown, why it is not shown now. Null
 * for nothing to say (no range, cast on the champion, a row that showed none).
 */
export function rangeNoteWords(range: RangeWithPatch | null | undefined): string | null {
  if (!range) return null;
  const patch = range.reviewedPatch ?? "an earlier patch";
  if (range.kind === "changed") return range.reviewedKind === "reach" || range.reviewedKind === "global" ? `Range not shown: Riot changed this ability after patch ${patch}, when its range was last checked.` : null;
  if (range.kind === "self") return null;
  const what = range.kind === "reach" ? "Range from Riot's data, in game units." : "Riot's text says it reaches the whole map.";
  return `${what} ${REVIEWED_BY[range.reviewer](patch)}`;
}

/**
 * The base statistics' ⓘ: what the two numbers are, and the attack damage placeholder where Riot's
 * data gives it no growth (statRows), so a missing growth is never read as none in the game.
 */
export function statsTipWords(noAttackDamageGrowth: boolean): string {
  return `Riot's numbers at level 1 and per level; attack speed grows by a share of its base.${noAttackDamageGrowth ? " Attack damage has no growth in Riot's data." : ""}`;
}

/** What Riot changed in an ability in its last patch, as the opened row says it; null when nothing is known. */
export function changedWords(changed: { sincePatch: string | null; text: boolean; cooldown: boolean; cost: boolean; range?: boolean } | null | undefined): string | null {
  if (!changed) return null;
  const what = [changed.text ? "text" : null, changed.cooldown ? "cooldowns" : null, changed.cost ? "cost" : null, changed.range ? "range" : null].filter((x): x is string => !!x);
  if (!what.length) return null;
  const list = what.length === 1 ? what[0]! : `${what.slice(0, -1).join(", ")} and ${what[what.length - 1]}`;
  return `Riot changed this ability's ${list} since patch ${changed.sincePatch ?? "the one before"}. The numbers shown are the current ones.`;
}
