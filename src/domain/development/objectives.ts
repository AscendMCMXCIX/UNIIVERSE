import { isRole, type Role } from "@/domain/roles";
import { cleanCustomCategory, isObjectiveCategory, type ObjectiveCategory } from "./categories";
import { isMeasure, type MeasureKey } from "./measures";

/*
  Development objectives: the player's weakness library. Each one names something a player can
  practise ("Track the enemy jungler before crossing the river"), never an outcome ("reach
  Diamond", "win 60%"). Progress is the player's to set, through four steps:

    Identified   noticed as something to work on, not practised yet
    Practising   being worked on in sessions
    Improving    the player sees progress and keeps practising it
    Maintaining  it has become a habit; worth revisiting now and then

  Nothing moves a step on its own: wins do not, and neither do statistics. The page may suggest a
  step when the player's own reviews (and, where one exists, a measurable statistic) support it,
  and the player decides. One objective is the primary one, so a session has one clear focus.
*/

export const OBJECTIVE_STATUSES = ["identified", "practising", "improving", "maintaining"] as const;
export type ObjectiveStatus = (typeof OBJECTIVE_STATUSES)[number];

export const OBJECTIVE_STATUS_LABELS: Record<ObjectiveStatus, string> = {
  identified: "Identified",
  practising: "Practising",
  improving: "Improving",
  maintaining: "Maintaining",
};

export const OBJECTIVE_STATUS_HELP: Record<ObjectiveStatus, string> = {
  identified: "Noticed as something to work on; not practised yet.",
  practising: "Being worked on in your sessions.",
  improving: "You see progress and keep practising it.",
  maintaining: "It has become a habit. Revisit it now and then.",
};

export function isObjectiveStatus(value: unknown): value is ObjectiveStatus {
  return typeof value === "string" && (OBJECTIVE_STATUSES as readonly string[]).includes(value);
}

/** Still being worked on (the library's active list); Maintaining is the completed list. */
export const isActiveStatus = (status: ObjectiveStatus) => status !== "maintaining";

/** A maintained skill not practised for this long is offered for a revisit. */
export const REVISIT_AFTER_DAYS = 30;
/** At most this many champions on one objective: it stays about a skill, not a champion pool. */
export const MAX_OBJECTIVE_CHAMPIONS = 5;
export const TITLE_MIN = 3;
export const TITLE_MAX = 120;
export const DETAIL_MAX = 300;

export interface ObjectiveInput {
  title: string;
  detail?: string | null;
  category: string;
  customCategory?: string | null;
  role?: string | null;
  championIds?: readonly string[] | null;
  measure?: string | null;
}

export interface CleanObjective {
  title: string;
  detail: string;
  category: ObjectiveCategory;
  customCategory: string | null;
  role: Role | null;
  championIds: string[];
  measure: MeasureKey | null;
}

/** Plain-language checks on what a player typed; returns the cleaned values or the first problem. */
export function cleanObjective(input: ObjectiveInput): { ok: true; value: CleanObjective } | { ok: false; error: string } {
  const title = (input.title ?? "").replace(/\s+/g, " ").trim();
  if (title.length < TITLE_MIN) return { ok: false, error: "Describe what you want to practise in a few words." };
  if (title.length > TITLE_MAX) return { ok: false, error: `Keep the title under ${TITLE_MAX} characters; the details can go below it.` };
  const detail = (input.detail ?? "").trim();
  if (detail.length > DETAIL_MAX) return { ok: false, error: `Keep the explanation under ${DETAIL_MAX} characters.` };
  if (!isObjectiveCategory(input.category)) return { ok: false, error: "Choose the area this objective belongs to." };
  const customCategory = input.category === "custom" ? cleanCustomCategory(input.customCategory) : null;
  if (input.category === "custom" && !customCategory) return { ok: false, error: "Name your own area in 2 to 40 characters." };
  const role = input.role ? (isRole(input.role) ? input.role : null) : null;
  if (input.role && !role) return { ok: false, error: "Unknown role." };
  const championIds = [...new Set((input.championIds ?? []).map((c) => String(c).trim()).filter(Boolean))];
  if (championIds.length > MAX_OBJECTIVE_CHAMPIONS) return { ok: false, error: `Choose up to ${MAX_OBJECTIVE_CHAMPIONS} champions, or none to practise it on any champion.` };
  if (input.measure && !isMeasure(input.measure)) return { ok: false, error: "Unknown statistic." };
  return { ok: true, value: { title, detail, category: input.category, customCategory, role, championIds, measure: input.measure && isMeasure(input.measure) ? input.measure : null } };
}

/**
 * Words that describe an outcome rather than something to practise. An objective with only these
 * gets a gentle note (it is still the player's choice to keep it).
 */
const OUTCOME_WORDS = /\b(climb\w*|reach|rank(ed)? up|lp|elo|win ?rate|winrate|promot\w*|(get|hit|make it) to (iron|bronze|silver|gold|platinum|emerald|diamond|master)|platinum|emerald|diamond|grandmaster|challenger)\b/i;

/** True when a title reads like a result to reach ("Reach Diamond") rather than a skill to practise. */
export function looksLikeOutcome(title: string): boolean {
  return OUTCOME_WORDS.test(title);
}

/** Days since a date, rounded down; null for no date. */
export function daysSince(at: Date | string | null | undefined, now: number = Date.now()): number | null {
  if (!at) return null;
  return Math.max(0, Math.floor((now - new Date(at).getTime()) / 86_400_000));
}

/**
 * A maintained skill worth looking at again: not practised in a session for REVISIT_AFTER_DAYS (or
 * never since it was marked), or one whose statistic has moved back the wrong way.
 */
export function needsRevisit(o: { status: ObjectiveStatus; lastPractisedAt: Date | string | null; statusChangedAt: Date | string }, trend: "toward" | "away" | "similar" | null, now: number = Date.now()): "not-practised" | "statistic" | null {
  if (o.status !== "maintaining") return null;
  if (trend === "away") return "statistic";
  const since = daysSince(o.lastPractisedAt ?? o.statusChangedAt, now);
  return since !== null && since >= REVISIT_AFTER_DAYS ? "not-practised" : null;
}

export interface StatusSuggestion {
  to: ObjectiveStatus;
  reason: string;
}

/**
 * A next step to offer for an objective, only when the player's own record supports it: sessions
 * played for it, their self-reported plan follow-through, and (when it follows one) a statistic
 * that has not moved the wrong way. The player decides; nothing changes by itself.
 */
export function suggestStatus(o: { status: ObjectiveStatus; sessions: number; hasMeasure: boolean }, execution: { rated: number; followed: number }, trend: "toward" | "away" | "similar" | null): StatusSuggestion | null {
  const share = execution.rated ? execution.followed / execution.rated : 0;
  const followed = `you followed your plan in ${execution.followed} of your last ${execution.rated} reviewed games`;
  if (o.status === "identified" && o.sessions > 0) return { to: "practising", reason: `You have played ${o.sessions} session${o.sessions === 1 ? "" : "s"} for it.` };
  if (o.status === "practising" && execution.rated >= 6 && share >= 0.75 && trend !== "away") return { to: "improving", reason: `By your own reviews, ${followed}${trend === "toward" ? ", and its statistic moved the better way" : ""}.` };
  if (o.status === "improving" && execution.rated >= 8 && share >= 0.85 && (trend === "toward" || (!o.hasMeasure && trend === null))) return { to: "maintaining", reason: `By your own reviews, ${followed}${trend === "toward" ? ", and its statistic moved the better way" : ""}. It may be becoming a habit.` };
  return null;
}
