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
/** The longest run of digits the field keeps (a longer paste is cut): enough to type past HASTE_MAX and be told it is held. */
const FIELD_DIGITS = 4;

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

/** What the haste field shows and what the page takes from it (readHasteField). */
export interface HasteField {
  /** The field's text while it is being edited: digits, and a decimal point and its digits as typed. */
  text: string;
  /** The haste taken: a whole number from 0 to HASTE_MAX. */
  value: number;
  /**
   * Why the value taken is not what was typed, so the page can say it: "held" above HASTE_MAX
   * ("Held to 300"), "whole" for a fraction cut to its whole part, "negative" for a minus (0).
   */
  note: "held" | "whole" | "negative" | null;
}

/**
 * The haste field's text and value from what was typed or pasted (the owner's request of 24 Nov
 * 2026: one field per champion, 0 by default, validated as typed). Only digits are kept, with a
 * decimal point and what follows it while typing ("12.5" takes 12 and says so; on leaving the field
 * it reads "12"); letters and spaces are dropped ("4a5x" is 45); a leading minus takes 0; an empty
 * field is 0; more than HASTE_MAX is held to it. Never throws.
 */
export function readHasteField(raw: unknown): HasteField {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (/^[-−‒–]/.test(s)) return { text: "0", value: 0, note: "negative" };
  const point = s.search(/[.,]/);
  const whole = (point < 0 ? s : s.slice(0, point)).replace(/\D/g, "").slice(0, FIELD_DIGITS);
  const fraction = point < 0 ? null : s.slice(point + 1).replace(/\D/g, "").slice(0, 2);
  const text = fraction === null ? whole : `${whole}.${fraction}`;
  if (whole === "") return { text: fraction === null ? "" : text, value: 0, note: fraction ? "whole" : null };
  const n = Number(whole);
  const value = Math.min(HASTE_MAX, n);
  return { text, value, note: n > HASTE_MAX ? "held" : fraction ? "whole" : null };
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
