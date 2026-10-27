import type { Role } from "@/domain/roles";
import type { CategoryKey } from "./categories";

/*
  If–Then action plans (implementation intentions): a situation the player will meet in a game and
  the action they will take when it happens, written in their own words. A plan belongs to an
  objective; the objective's current plan is the one shown before a session and between games.
  Editing a plan that sessions or reviews already used keeps the old wording in their history and
  starts a new version, so the past always shows the plan that was actually played with.

  The templates below are optional starting points, offered by area and role, never filled in
  automatically: a player picks one, edits it, or writes their own.
*/

export const PLAN_PART_MIN = 5;
export const PLAN_PART_MAX = 200;

export interface PlanTemplate {
  key: string;
  category: CategoryKey;
  /** Roles the template is written for; none means any role. */
  roles?: readonly Role[];
  ifText: string;
  thenText: string;
}

export const PLAN_TEMPLATES: readonly PlanTemplate[] = [
  { key: "laning-early-death", category: "laning", ifText: "I die before 14 minutes", thenText: "I note the cause in one word and play the next three minutes from a safer position" },
  { key: "laning-cooldowns", category: "laning", roles: ["TOP", "MID", "ADC", "SUPPORT"], ifText: "my lane opponent has their main ability ready and I have not seen the enemy jungler", thenText: "I stay out of their range and last-hit from behind my minions" },
  { key: "wave-recall", category: "wave-management", ifText: "I want to recall", thenText: "I push the wave into the enemy tower first, so I lose as few minions as possible" },
  { key: "wave-crash", category: "wave-management", roles: ["TOP", "MID", "ADC", "SUPPORT"], ifText: "my wave is about to crash into the enemy tower and I do not know where the enemy jungler is", thenText: "I ward or step back before the wave crashes" },
  { key: "wave-jungle-camps", category: "wave-management", roles: ["JUNGLE"], ifText: "I finish a clear and no lane can be helped", thenText: "I take the camps closest to my next objective instead of walking across the map" },
  { key: "trading-cooldown", category: "trading", roles: ["TOP", "MID", "ADC", "SUPPORT"], ifText: "my opponent uses their main ability on the wave", thenText: "I look for a short trade straight away" },
  { key: "trading-lost", category: "trading", ifText: "I lose a trade", thenText: "I wait for my cooldowns before I start another one" },
  { key: "jungle-river", category: "jungle-awareness", roles: ["TOP", "MID", "ADC", "SUPPORT"], ifText: "I am pushing past the river without knowing where the enemy jungler is", thenText: "I reassess the risk before committing to another trade or wave" },
  { key: "jungle-last-seen", category: "jungle-awareness", roles: ["TOP", "MID", "ADC", "SUPPORT"], ifText: "the enemy jungler shows on the other side of the map", thenText: "I play forward for the next 30 seconds" },
  { key: "jungle-cross-map", category: "jungle-awareness", roles: ["JUNGLE"], ifText: "I see the enemy jungler on one side of the map", thenText: "I make my play on the opposite side or take their camps there" },
  { key: "vision-recall", category: "vision", ifText: "I recall", thenText: "I buy a Control Ward if I do not already have one placed" },
  { key: "vision-objective", category: "vision", ifText: "an objective spawns in under a minute", thenText: "I place vision around it before it spawns" },
  { key: "recall-gold", category: "recall-timing", ifText: "I have the gold for my next item component and the wave is crashing", thenText: "I recall now rather than staying for one more wave" },
  { key: "recall-objective", category: "recall-timing", ifText: "a major objective spawns within 90 seconds", thenText: "I recall early so I am back in time with full items" },
  { key: "objective-60", category: "objective-setup", ifText: "Dragon or Baron spawns in 60 seconds", thenText: "I push my wave and move towards the objective with my team" },
  { key: "map-crash", category: "map-awareness", ifText: "a wave crashes or a fight ends", thenText: "I look at the minimap before choosing my next move" },
  { key: "map-missing", category: "map-awareness", ifText: "two or more enemies are missing from the map", thenText: "I treat my lane as dangerous until I see them again" },
  { key: "rotation-tower", category: "rotations", ifText: "my lane's outer tower falls", thenText: "I move to the side lane or objective my team needs instead of staying in an empty lane" },
  { key: "side-missing", category: "side-lane", ifText: "I am in a side lane and cannot see three or more enemies", thenText: "I keep vision behind me and push only up to the river" },
  { key: "fight-wait", category: "teamfighting", ifText: "a fight starts and I am not the one starting it", thenText: "I wait for the enemy's key ability before going in" },
  { key: "positioning-engage", category: "positioning", ifText: "I cannot see the enemy's engage champion", thenText: "I stay behind my frontline" },
  { key: "resources-low", category: "resources", ifText: "I am below half health and mana after a trade", thenText: "I recall at the next wave crash rather than staying" },
  { key: "decision-unsure", category: "decision-making", ifText: "I feel unsure about taking a fight", thenText: "I take the safer option and ping my plan to the team" },
  { key: "decision-death-timer", category: "decision-making", ifText: "I die", thenText: "I use the death timer to name one cause, not to type in chat" },
  { key: "mechanics-combo", category: "mechanics", ifText: "I want to use the combo I am practising", thenText: "I use it only when the target is in range and my cooldowns are ready" },
  { key: "mental-loss", category: "mental", ifText: "I lose a game", thenText: "I take a short break and read my plan before queuing again" },
  { key: "mental-chat", category: "mental", ifText: "a teammate flames in chat", thenText: "I mute them and keep my attention on my own objective" },
];

/** The templates worth offering for an area and role: the role's own first, at most `limit`. */
export function templatesFor(category: string | null | undefined, role: Role | null | undefined, limit = 3): PlanTemplate[] {
  const fits = PLAN_TEMPLATES.filter((t) => t.category === category && (!role || !t.roles || t.roles.includes(role)));
  return [...fits].sort((a, b) => Number(!!b.roles) - Number(!!a.roles)).slice(0, limit);
}

export function templateByKey(key: string | null | undefined): PlanTemplate | null {
  return PLAN_TEMPLATES.find((t) => t.key === key) ?? null;
}

/** One part of a plan as kept: trimmed, single-spaced, without a leading "if"/"then" (the page adds those words). */
export function cleanPlanPart(value: unknown, lead: "if" | "then"): string {
  const v = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return v.replace(lead === "if" ? /^if\b[\s,:-]*/i : /^then\b[\s,:-]*/i, "").replace(/[.;,\s]+$/, "").trim();
}

export function cleanPlan(input: { ifText: unknown; thenText: unknown }): { ok: true; value: { ifText: string; thenText: string } } | { ok: false; error: string } {
  const ifText = cleanPlanPart(input.ifText, "if");
  const thenText = cleanPlanPart(input.thenText, "then");
  if (ifText.length < PLAN_PART_MIN) return { ok: false, error: "Describe the situation you will meet in the game (IF …)." };
  if (thenText.length < PLAN_PART_MIN) return { ok: false, error: "Describe what you will do when it happens (THEN …)." };
  if (ifText.length > PLAN_PART_MAX || thenText.length > PLAN_PART_MAX) return { ok: false, error: `Keep each part under ${PLAN_PART_MAX} characters, so it is quick to recall between games.` };
  return { ok: true, value: { ifText, thenText } };
}

/** "IF I recall, THEN I buy a Control Ward." on one line (a tooltip, a summary). */
export function planSentence(p: { ifText: string; thenText: string }): string {
  return `If ${p.ifText}, then ${p.thenText}.`;
}
