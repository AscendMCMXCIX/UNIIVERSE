import type { CooldownDisplay } from "./cooldown";

/*
  CHAMPION INTEL's cooldowns at a chosen ability haste (docs/CHAMPION_INTEL.md, "Haste"). Riot's
  published rule (patch 10.23, 2020): cooldown = base × 100 / (100 + ability haste). It is applied
  only to a cooldown that passed the guard (ddragonCooldownDisplay, kind "per-rank"): never to a
  passive, charges, two abilities in one slot, a known-wrong or missing number, where the page says
  why there is no number instead. Riot's data does not list the abilities the rule does not apply
  to, so the page calls it Riot's general rule, never "checked". Ultimate haste (from some runes and
  items, for R alone) is not counted. Never a timer or a "ready at": only the cooldown's length.
*/

/** The highest haste the page accepts: a typed or linked value above it is held to it. */
export const HASTE_MAX = 300;

/**
 * A haste value as the page takes it, from a field or the address: a whole number from 0 to
 * HASTE_MAX (a fraction is cut to its whole part, a value above the maximum held to it); anything
 * that is not a number (letters, an empty field, a negative) is 0.
 */
export function clampHaste(value: unknown): number {
  const n = typeof value === "number" ? value : typeof value === "string" && /^\s*\d{1,12}(\.\d{1,6})?\s*$/.test(value) ? Number(value) : NaN;
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(HASTE_MAX, Math.floor(n));
}

/** What the page takes from the haste field's text (readHasteField). */
export interface HasteField {
  /** The haste taken: a whole number from 0 to HASTE_MAX. */
  value: number;
  /**
   * Why the value taken is not what was typed, so the page can say it and mark the field invalid:
   * "held" for a number above HASTE_MAX (300 taken, "Held to 300"); "whole" for a number with a
   * decimal point ("Whole numbers only") and "digits" for anything else that is not digits alone (a
   * sign, an exponent, letters: "Digits only"), both left untaken, the haste in use kept.
   */
  note: "held" | "whole" | "digits" | null;
}

/**
 * What the page takes from the haste field's text, as typed or pasted (the owner's request of 24 Nov
 * 2026: one field per champion, 0 by default, validated as typed; the Release 17 review). The field
 * takes a whole number from 0 to HASTE_MAX in digits, spaces around it ignored (" 7 " is 7, "045"
 * is 45); an empty field is 0; more than HASTE_MAX is held to it. Anything else ("-20", "+5", "1e3",
 * "12.5", "20 haste") is not taken at all: the value stays `inUse` (the haste the page already
 * shows) and the note says why, so no number the reader did not type is ever applied as if they had
 * typed it. Never throws.
 */
export function readHasteField(raw: unknown, inUse = 0): HasteField {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (s === "") return { value: 0, note: null };
  if (/^[0-9]+$/.test(s)) {
    const n = Number(s);
    return n > HASTE_MAX ? { value: HASTE_MAX, note: "held" } : { value: n, note: null };
  }
  const kept = clampHaste(inUse);
  return { value: kept, note: /^[0-9]*[.,][0-9]*$/.test(s) && /[0-9]/.test(s) ? "whole" : "digits" };
}

/** Riot's general rule: base × 100 / (100 + haste), to two decimals. */
export function hastedSeconds(base: number, haste: number): number {
  const h = clampHaste(haste);
  return Math.round(((base * 100) / (100 + h)) * 100) / 100;
}

/** The share of a cooldown left at a haste, as a percentage cut ("20 haste: 16.7% shorter"): 100 × h / (100 + h), to one decimal. */
export function hasteReduction(haste: number): number {
  const h = clampHaste(haste);
  return Math.round(((100 * h) / (100 + h)) * 10) / 10;
}

/**
 * An ability's cooldown per rank at `haste`: hasted by the rule where the cooldown passed the guard,
 * null where it did not (the page says why instead, and shows no hasted number).
 */
export function cooldownAtHaste(cooldown: CooldownDisplay, haste: number): number[] | null {
  if (cooldown.kind !== "per-rank") return null;
  const h = clampHaste(haste);
  return cooldown.seconds.map((s) => (h > 0 ? hastedSeconds(s, h) : s));
}
