import type { DdragonAbility, Slot } from "./types";

/*
  CHAMPION INTEL's ability ranges (docs/CHAMPION_INTEL.md, "Ranges"; the owner's decision D3 of 26 Nov
  2026: "where they can be reliably sourced, reviewed and maintained across patches; do not invent
  or estimate"). Data Dragon gives every spell a `range` per rank, but its number has no type: a cast
  range, a dash, a radius around the champion, an engine "unlimited" (25000) or a placeholder (0, 1,
  20), and nothing in Riot's data says which. So the number is shown only where a committed review
  (src/server/riot/static/ability-ranges.reviewed.json, drafted by
  scripts/static/review-ability-ranges.mjs) says what it measures, and only while Riot's spell id,
  its range array and the hash of its description and tooltip are exactly the ones reviewed:
  - `reach` (a cast range, a skillshot's length, a dash or a blink): Data Dragon's current numbers,
    which are then the reviewed ones, and only when they pass validation (one number per rank, each
    above 50 and below 10,000, never smaller at a higher rank, not a slot of two abilities);
  - `global` (the whole map by Riot's own text): "Global", only where Riot's number is the engine's
    5,000 or more;
  - `self` (cast on the champion): known, but not shown (the owner's decision, Release 19);
  - `none` (the number is not the reach), no row, the passive (Data Dragon has no passive range), a
    record stored before rules format 5: nothing.
  When the key no longer matches, the range is hidden and said to be waiting for a review
  ("changed"): nothing is estimated, carried over or rounded, and no number from the review row is
  ever shown on its own. Pure, so the page, the version-check's counts and the tests share it.
*/

export type RangeKind = "reach" | "global" | "self" | "none";
/** Who decided a row: the drafting script's fixed rules, an independent automated review, or the team. Never a person's name. */
export type RangeReviewer = "automated draft" | "automated review" | "owner";
export type SpellSlot = Exclude<Slot, "P">;

/** One row of the reviewed table: what Data Dragon's `range` measures for one spell, and the key it was decided on. */
export interface RangeReview {
  champion: string;
  slot: SpellSlot;
  /** Data Dragon's spell id when reviewed ("AhriQ"). */
  spell: string;
  kind: RangeKind;
  /** Data Dragon's `range` when reviewed, per rank. */
  range: number[];
  /** Riot's description and tooltip when reviewed (riotTextHash, 16 hex digits). */
  textHash: string;
  /** The Data Dragon version reviewed at ("16.23.1"); a row applies at any version where its key still matches. */
  version: string;
  /** The day of the review (YYYY-MM-DD). */
  reviewed: string;
  reviewer: RangeReviewer;
  /** For `none`: why the number is not the reach (never shown). */
  why?: string;
  /** For an automated draft: the drafting rule that decided. */
  rule?: string;
}

/** What the page may show for an ability's range. */
export type RangeDisplay =
  /** Data Dragon's number per rank, reviewed as the ability's reach. */
  | { kind: "reach"; values: number[]; reviewedVersion: string; reviewer: RangeReviewer }
  /** Reviewed as the whole map ("Global"), or as cast on the champion (not shown). */
  | { kind: "global" | "self"; reviewedVersion: string; reviewer: RangeReviewer }
  /** Riot changed the spell id, its range or its text since the review: nothing in the folded row; the opened row says why where it had shown one. */
  | { kind: "changed"; reviewedKind: RangeKind; reviewedVersion: string };

/** How a row's range stands, for the tests and the Production check (data-range-status). */
export type RangeStatus = "shown" | "self" | "changed" | "none";

/** A slot that holds two abilities ("To the Skies! / Shock Blast", "Arc of Judgment | Arc of Ruin"): one array for both, which Riot's data does not tell apart. */
export const TWO_FORMS = / \/ | \| /;
/** A reach is above this and below REACH_ABOVE: 0, 1, 20 and 40 are placeholders, 10,000 and more the engine's "unlimited". */
export const REACH_BELOW = 50;
export const REACH_ABOVE = 10_000;
/** A global row's number is the engine's: at least this. */
export const GLOBAL_FROM = 5_000;

const same = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Whether a range passes as a reach: one finite number per rank, each above 50 and below 10,000, never smaller at a higher rank. */
export function reachOk(range: readonly number[] | null | undefined, maxRank: number): boolean {
  return Array.isArray(range) && range.length === maxRank && range.length > 0 && range.every((v) => typeof v === "number" && Number.isFinite(v) && v > REACH_BELOW && v < REACH_ABOVE) && range.every((v, i) => i === 0 || v >= range[i - 1]!);
}

/** Whether the ability's spell id, range and Riot's text are exactly the row's: only then does the row apply. */
export function reviewMatches(ability: Pick<DdragonAbility, "id" | "range" | "textHash">, review: RangeReview): boolean {
  return review.spell === ability.id && Array.isArray(ability.range) && Array.isArray(review.range) && same(review.range, ability.range) && typeof ability.textHash === "string" && review.textHash === ability.textHash;
}

/**
 * What the reviewed rule supports for an ability's range, or null for nothing (no row, `none`, the
 * passive, a record stored before rules format 5, a value that fails validation). Never throws.
 */
export function rangeDisplay(ability: Pick<DdragonAbility, "slot" | "id" | "name" | "maxRank" | "range" | "textHash"> | null | undefined, review: RangeReview | null | undefined): RangeDisplay | null {
  if (!ability || ability.slot === "P" || !Array.isArray(ability.range) || !review || review.slot !== ability.slot) return null;
  if (!reviewMatches(ability, review)) return { kind: "changed", reviewedKind: review.kind, reviewedVersion: review.version };
  const base = { reviewedVersion: review.version, reviewer: review.reviewer };
  switch (review.kind) {
    case "reach":
      return reachOk(ability.range, ability.maxRank) && !TWO_FORMS.test(ability.name ?? "") ? { kind: "reach", values: [...ability.range], ...base } : null;
    case "global":
      return ability.range.length > 0 && ability.range.every((v) => typeof v === "number" && v >= GLOBAL_FROM) ? { kind: "global", ...base } : null;
    case "self":
      return { kind: "self", ...base };
    default:
      return null;
  }
}

/** The status the page marks a row with: a range shown ("shown": a reach or "Global"), known to be cast on the champion and not shown, hidden since Riot changed it, or nothing. */
export function rangeStatus(display: RangeDisplay | null | undefined): RangeStatus {
  if (!display) return "none";
  if (display.kind === "reach" || display.kind === "global") return "shown";
  return display.kind;
}

/** The values a reach shows: one number where every rank has the same, else one per rank. */
export function shownReach(values: readonly number[]): number[] {
  return values.length > 0 && values.every((v) => v === values[0]) ? [values[0]!] : [...values];
}
