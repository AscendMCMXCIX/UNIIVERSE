import type { CooldownDisplay } from "./cooldown";

/*
  CHAMPION LOOKUP's cooldowns at a chosen ability haste (docs/CHAMPION_LOOKUP.md, "Haste"). Riot's
  published rule (patch 10.23, 2020): cooldown = base × 100 / (100 + ability haste). It is applied
  only to a cooldown that passed the guard (ddragonCooldownDisplay, kind "per-rank"): never to a
  passive, charges, two abilities in one slot, a known-wrong or missing number, where the page says
  why there is no number instead. Riot's data does not list the abilities the rule does not apply
  to, so the page calls it Riot's general rule, never "checked". Ultimate haste (from some runes and
  items, for R alone) is not counted. Never a timer or a "ready at": only the cooldown's length.
*/

/** The haste values offered as one press (the owner's request of 23 Nov 2026). */
export const HASTE_CHOICES = [0, 10, 20, 30, 40, 50, 60, 80, 100] as const;
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
