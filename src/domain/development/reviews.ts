import { isCategory, type CategoryKey } from "./categories";

/*
  The post-game review: under a minute, every part optional, skipping costs nothing.

    1. How consistently did you follow your plan?       Not at all · Sometimes · Mostly · Every time
    2. What went best? What was hardest?                 one area each, from the shared list
    3. Your biggest learning point                       a line in your own words
    4. What will you adjust next game?                   a line in your own words

  Answers are the player's own view of their game and are always shown as self-reported; they are
  never presented as a measurement. A game's review is kept on the game itself, so there is never
  more than one per game.
*/

export const EXECUTION_LEVELS = [
  { value: 0, label: "Not at all" },
  { value: 1, label: "Sometimes" },
  { value: 2, label: "Mostly" },
  { value: 3, label: "Every time" },
] as const;
export type ExecutionLevel = (typeof EXECUTION_LEVELS)[number]["value"];

/** "Mostly" or "Every time": the plan was followed. */
export const FOLLOWED_FROM = 2;
export const REVIEW_TEXT_MAX = 200;

export const REVIEW_STATUSES = ["none", "pending", "done", "skipped"] as const;
/**
 * none     a game from before reviews existed, or added by hand without a review asked for
 * pending  a game waiting for its review (offered after it is synced)
 * done     reviewed
 * skipped  the player chose not to review it
 */
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export function isExecution(value: unknown): value is ExecutionLevel {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

export function executionLabel(value: number | null | undefined): string {
  return EXECUTION_LEVELS.find((l) => l.value === value)?.label ?? "—";
}

export interface ReviewInput {
  execution?: number | null;
  wentWell?: string | null;
  wentWrong?: string | null;
  learning?: string | null;
  adjustment?: string | null;
}

export interface CleanReview {
  execution: ExecutionLevel | null;
  wentWell: CategoryKey | null;
  wentWrong: CategoryKey | null;
  learning: string;
  adjustment: string;
}

const line = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

export function cleanReview(input: ReviewInput): { ok: true; value: CleanReview } | { ok: false; error: string } {
  if (input.execution !== null && input.execution !== undefined && !isExecution(input.execution)) return { ok: false, error: "Choose how consistently you followed your plan." };
  if (input.wentWell && !isCategory(input.wentWell)) return { ok: false, error: "Unknown area." };
  if (input.wentWrong && !isCategory(input.wentWrong)) return { ok: false, error: "Unknown area." };
  const learning = line(input.learning);
  const adjustment = line(input.adjustment);
  if (learning.length > REVIEW_TEXT_MAX || adjustment.length > REVIEW_TEXT_MAX) return { ok: false, error: `Keep each answer under ${REVIEW_TEXT_MAX} characters.` };
  const value: CleanReview = {
    execution: isExecution(input.execution) ? input.execution : null,
    wentWell: input.wentWell && isCategory(input.wentWell) ? input.wentWell : null,
    wentWrong: input.wentWrong && isCategory(input.wentWrong) ? input.wentWrong : null,
    learning,
    adjustment,
  };
  if (value.execution === null && !value.wentWell && !value.wentWrong && !learning && !adjustment) return { ok: false, error: "Answer at least one question, or skip the review." };
  return { ok: true, value };
}

export interface ExecutionTrend {
  /** Reviews with a plan rating among the most recent `window`. */
  recent: { rated: number; followed: number };
  /** The `window` before those. */
  previous: { rated: number; followed: number };
}

/** Self-reported plan follow-through in the latest reviews and the ones before them. */
export function executionTrend(reviews: ReadonlyArray<{ execution: number | null; reviewedAt: number }>, window = 8): ExecutionTrend {
  const rated = reviews.filter((r) => isExecution(r.execution)).sort((a, b) => b.reviewedAt - a.reviewedAt);
  const part = (list: typeof rated) => ({ rated: list.length, followed: list.filter((r) => (r.execution ?? -1) >= FOLLOWED_FROM).length });
  return { recent: part(rated.slice(0, window)), previous: part(rated.slice(window, window * 2)) };
}

/** Counts of areas named in reviews, most named first (ties alphabetically), with at least `min` mentions. */
export function areaCounts(keys: ReadonlyArray<string | null>, min = 1): Array<{ key: CategoryKey; count: number }> {
  const by = new Map<CategoryKey, number>();
  for (const k of keys) if (k && isCategory(k)) by.set(k, (by.get(k) ?? 0) + 1);
  return [...by.entries()]
    .filter(([, n]) => n >= min)
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}
