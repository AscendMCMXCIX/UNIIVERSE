import { enemyActionsBeforeNextPick, type DerivedDraft } from "../draft";
import type { Role } from "../roles";
import type { PlayerProfile } from "../roster/types";
import { eligibleChampions, flexOwners } from "../roster/eligibility";
import type { EvalContext } from "./evaluate";
import { enemyInRole } from "./enemy";
import type { TimingAssessment } from "./types";
import { formatPercent } from "./util";
import { ROLE_LABELS } from "../roles";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Probability that the enemy's slot for this role is still open (no revealed enemy occupies it). */
export function enemyRoleOpenProbability(ctx: EvalContext, role: Role): number {
  const occupied = enemyInRole(ctx.enemy, role).reduce((s, o) => s + o.probability, 0);
  return clamp(1 - occupied, 0, 1);
}

/** Expected lane delta of a champion in a role against a specific enemy champion (same role). */
function laneDelta(ctx: EvalContext, championId: string, role: Role, enemyId: string): number {
  const ours = ctx.stats.strength(championId, role).estimate;
  const theirs = ctx.stats.strength(enemyId, role).estimate;
  const expected = clamp(0.5 + (ours - 0.5) - (theirs - 0.5), 0.3, 0.7);
  const mu = ctx.stats.matchup(championId, role, enemyId, role, expected);
  return mu.estimate - 0.5;
}

/**
 * Value of information for holding a role: how much better our best option in the role is
 * expected to be if we see the enemy's champion first, versus committing blind now.
 *
 *   VOI = E_enemy[ max_c lane(c, e) ] − max_c E_enemy[ lane(c, e) ]
 *
 * Computed over the player's eligible pool and the most-played enemy champions in the role.
 */
export function roleHoldValue(ctx: EvalContext, player: PlayerProfile, role: Role, unavailable: ReadonlySet<string>): { voi: number; variance: Map<string, number> } {
  const pool = eligibleChampions(player, role, { unavailableChampionIds: unavailable });
  const likely = ctx.stats.topChampionsInRole(role, 10).filter((e) => !unavailable.has(e));
  const variance = new Map<string, number>();
  if (pool.length === 0 || likely.length === 0) return { voi: 0, variance };
  const weight = 1 / likely.length;
  let expectedOfMax = 0;
  const expectedPerChampion = new Map<string, number>();
  const samples = new Map<string, number[]>();
  for (const e of likely) {
    let bestHere = -Infinity;
    for (const c of pool) {
      const d = laneDelta(ctx, c, role, e);
      bestHere = Math.max(bestHere, d);
      expectedPerChampion.set(c, (expectedPerChampion.get(c) ?? 0) + d * weight);
      samples.set(c, [...(samples.get(c) ?? []), d]);
    }
    expectedOfMax += bestHere * weight;
  }
  const maxOfExpected = Math.max(...expectedPerChampion.values());
  for (const [c, arr] of samples) {
    const mean = arr.reduce((s, x) => s + x, 0) / arr.length;
    variance.set(c, Math.sqrt(arr.reduce((s, x) => s + (x - mean) * (x - mean), 0) / arr.length));
  }
  return { voi: Math.max(0, expectedOfMax - maxOfExpected), variance };
}

export interface TimingInput {
  championId: string;
  role: Role;
  playerId: string;
  fitScore: number;
  fallbackScore: number;
  derived: DerivedDraft;
  ctx: EvalContext;
  players: PlayerProfile[];
  roleHold: { voi: number; variance: Map<string, number> };
}

/**
 * Converts "best fit" into "pick now": is this champion likely to be denied before our next
 * pick (value at risk), and is there value in holding the role for a counterpick?
 */
export function assessTiming(input: TimingInput): TimingAssessment {
  const { championId, role, fitScore, fallbackScore, derived, ctx, players, roleHold } = input;
  const t = ctx.config.timing;
  const step = derived.nextStep;
  const reasons: string[] = [];
  if (!step) {
    return { denialProbability: 0, valueAtRisk: 0, adjustment: 0, enemyRoleHidden: false, matchupVariance: 0, reasons };
  }

  const ahead = enemyActionsBeforeNextPick(step.index, derived.side, derived.steps);
  const presence = ctx.stats.presence(championId);
  const roleOpen = enemyRoleOpenProbability(ctx, role);
  const pBan = clamp(presence.banRate * t.banRateMultiplier + presence.proPresence * 0.25, 0, 0.6);
  // Professional draft patterns: a champion pros take first rotation is taken earlier than its
  // raw pick rate implies; a habitual last-pick counter is not.
  const slot = ctx.stats.proSlots?.(championId) ?? null;
  const slotTrust = slot ? slot.picks / (slot.picks + 12) : 0;
  const rotationFactor = slot ? 1 + slotTrust * (0.6 * slot.firstRotation - 0.3 * slot.counterpick) : 1;
  // The enemy only takes it if they still have a slot it fits (their most likely role for it).
  const pPick = clamp((presence.pickRate * t.pickRateMultiplier + presence.proPresence * 0.2) * rotationFactor * Math.max(0.2, roleOpen), 0, 0.5);
  const denialProbability = ahead.nextPickIndex === null ? 0 : 1 - Math.pow(1 - pBan, ahead.bans) * Math.pow(1 - pPick, ahead.picks);
  const valueAtRisk = Math.max(0, fitScore - fallbackScore);
  const urgency = t.denialWeight * denialProbability * valueAtRisk;

  // Counterpick value: only relevant when the enemy's slot in this role is still hidden and the
  // enemy will likely reveal it before our next pick.
  const enemyRoleHidden = roleOpen > 0.5;
  const revealProbability = enemyRoleHidden && derived.enemyRemainingPicks > 0 ? clamp(ahead.picks / derived.enemyRemainingPicks, 0, 1) * roleOpen : 0;
  const hold = t.counterpickHoldWeight * revealProbability * roleHold.voi;
  const matchupVariance = roleHold.variance.get(championId) ?? 0;
  const blind = enemyRoleHidden ? t.blindSafetyWeight * Math.max(0, 0.03 - matchupVariance) * 0.5 : 0;

  // Role concealment: a genuine UNIIVERSE flex is worth a little early in the draft.
  const owners = flexOwners(players, championId);
  const isFlex = new Set(owners.map((o) => o.role)).size > 1;
  const flex = isFlex && derived.ourPicks.length <= 2 ? ctx.config.weights.flexValue * 0.01 : 0;

  // Coach override: preserve this role for a counterpick while their counterpart is hidden.
  const coachHold = ctx.overrides?.holdRoles.includes(role) && enemyRoleHidden && ahead.picks > 0 ? 0.012 : 0;

  const adjustment = urgency - hold + blind + flex - coachHold;

  if (denialProbability >= 0.35 && valueAtRisk > 0.005) reasons.push(`Likely gone before our next pick (${formatPercent(denialProbability, 0)} risk)`);
  else if (denialProbability >= 0.2 && valueAtRisk > 0.01) reasons.push(`Contested pick (${formatPercent(denialProbability, 0)} risk of losing it)`);
  if (hold > 0.004) reasons.push(`Holding ${role} for a counterpick is worth waiting for`);
  if (enemyRoleHidden && matchupVariance < 0.012 && blind > 0) reasons.push("Safe blind pick: matchups are stable");
  if (isFlex) reasons.push("Keeps our role assignment ambiguous");
  if (coachHold > 0) reasons.push(`Strategy override: hold ${ROLE_LABELS[role]} for a counterpick`);
  if (slot && slotTrust >= 0.4 && slot.firstRotation >= 0.6 && denialProbability >= 0.2) reasons.push(`Pro teams take it first rotation (${formatPercent(slot.firstRotation, 0)} of its pro picks)`);
  if (ahead.nextPickIndex === null) reasons.push("Our last pick: nothing to hold for");

  return { denialProbability, valueAtRisk, adjustment, enemyRoleHidden, matchupVariance, reasons };
}
