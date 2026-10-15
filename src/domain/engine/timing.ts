import { enemyActionsBeforeNextPick, type DerivedDraft } from "../draft";
import type { Role } from "../roles";
import type { PlayerProfile } from "../roster/types";
import { eligibleChampions, flexOwners } from "../roster/eligibility";
import type { EvalContext } from "./evaluate";
import { enemyInRole } from "./enemy";
import type { TimingAssessment } from "./types";
import { formatPercent } from "./util";
import { ROLES, ROLE_LABELS } from "../roles";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Probability that the enemy's slot for this role is still open (no revealed enemy occupies it). */
export function enemyRoleOpenProbability(ctx: EvalContext, role: Role): number {
  const occupied = enemyInRole(ctx.enemy, role).reduce((s, o) => s + o.probability, 0);
  return clamp(1 - occupied, 0, 1);
}

/** Lane delta of a champion in a role against a specific enemy champion (same role), with its evidence. */
function laneDelta(ctx: EvalContext, championId: string, role: Role, enemyId: string): { delta: number; confidence: number } {
  const ours = ctx.stats.strength(championId, role).estimate;
  const theirs = ctx.stats.strength(enemyId, role).estimate;
  const expected = clamp(0.5 + (ours - 0.5) - (theirs - 0.5), 0.3, 0.7);
  const mu = ctx.stats.matchup(championId, role, enemyId, role, expected);
  return { delta: mu.estimate - 0.5, confidence: mu.confidence };
}

export interface RoleHold {
  voi: number;
  /** Spread of the champion's lane outcome across the likely enemies (0 = no difference). */
  variance: Map<string, number>;
  /**
   * How much matchup evidence stands behind that spread (0..1: the weighted mean confidence of the
   * matchup estimates). Shrunk estimates with no data barely vary, so a low spread on thin evidence
   * says nothing about blind safety.
   */
  evidence: Map<string, number>;
}

/**
 * Value of information for holding a role: how much better our best option in the role is
 * expected to be if we see the enemy's champion first, versus committing blind now.
 *
 *   VOI = E_enemy[ max_c lane(c, e) ] − max_c E_enemy[ lane(c, e) ]
 *
 * Computed over the player's eligible pool and the enemy's ten most-played champions in the role,
 * each weighted by how often it is played (its share of those ten's games).
 */
export function roleHoldValue(ctx: EvalContext, player: PlayerProfile, role: Role, unavailable: ReadonlySet<string>): RoleHold {
  const pool = eligibleChampions(player, role, { unavailableChampionIds: unavailable });
  const likely = ctx.stats.topChampionsInRole(role, 10).filter((e) => !unavailable.has(e));
  const variance = new Map<string, number>();
  const evidence = new Map<string, number>();
  if (pool.length === 0 || likely.length === 0) return { voi: 0, variance, evidence };
  const games = likely.map((e) => Math.max(0, ctx.stats.strength(e, role).games));
  const totalGames = games.reduce((a, b) => a + b, 0);
  const weights = games.map((g) => (totalGames > 0 ? g / totalGames : 1 / likely.length));
  let expectedOfMax = 0;
  const expectedPerChampion = new Map<string, number>();
  const samples = new Map<string, number[]>();
  likely.forEach((e, i) => {
    const weight = weights[i]!;
    let bestHere = -Infinity;
    for (const c of pool) {
      const { delta: d, confidence } = laneDelta(ctx, c, role, e);
      bestHere = Math.max(bestHere, d);
      expectedPerChampion.set(c, (expectedPerChampion.get(c) ?? 0) + d * weight);
      evidence.set(c, (evidence.get(c) ?? 0) + confidence * weight);
      samples.set(c, [...(samples.get(c) ?? []), d]);
    }
    expectedOfMax += bestHere * weight;
  });
  const maxOfExpected = Math.max(...expectedPerChampion.values());
  for (const [c, arr] of samples) {
    // Spread around the champion's own expected lane, weighted like the expectation.
    const mean = expectedPerChampion.get(c)!;
    let v = 0;
    arr.forEach((x, i) => (v += weights[i]! * (x - mean) * (x - mean)));
    variance.set(c, Math.sqrt(v));
  }
  return { voi: Math.max(0, expectedOfMax - maxOfExpected), variance, evidence };
}

/**
 * Per-action probabilities that the enemy takes a champion: a ban or a pick by one enemy action.
 *
 * Ban and pick rates are per game (a champion banned in 30% of games), and a game holds ten bans
 * and ten picks, so a rate is not the chance that one particular action takes the champion.
 * Each enemy action is modelled as one choice among the champions still available
 * (Plackett–Luce): a ban takes X with probability X's ban count over the ban counts of every
 * available champion; a pick first fills one of the enemy's open roles (in proportion to how open
 * each is) and then takes X with its share of that role's games among available champions.
 * Banned, picked and Fearless-locked champions drop out of the denominators, so the remaining
 * meta champions become correspondingly more likely. Professional presence (picks + bans per pro
 * game, spread over the 20 draft actions) is blended in with the configured pro weight.
 */
export interface ActionShares {
  ban(championId: string): number;
  pick(championId: string): number;
}

const shareCaches = new WeakMap<Map<string, unknown>, WeakMap<ReadonlySet<string>, ActionShares>>();

export function enemyActionShares(ctx: EvalContext, unavailable: ReadonlySet<string>): ActionShares {
  let byUnavailable = shareCaches.get(ctx.memo);
  if (!byUnavailable) shareCaches.set(ctx.memo, (byUnavailable = new WeakMap()));
  const cached = byUnavailable.get(unavailable);
  if (cached) return cached;

  let banTotal = 0;
  for (const id of ctx.champions.keys()) if (!unavailable.has(id)) banTotal += ctx.stats.presence(id).banRate;
  const roleTotals = new Map<Role, number>();
  const roleOpen = new Map<Role, number>();
  let openSum = 0;
  for (const role of ROLES) {
    let total = 0;
    for (const id of ctx.stats.topChampionsInRole(role, Number.MAX_SAFE_INTEGER)) if (!unavailable.has(id)) total += ctx.stats.strength(id, role).games;
    roleTotals.set(role, total);
    const open = enemyRoleOpenProbability(ctx, role);
    roleOpen.set(role, open);
    openSum += open;
  }
  const proBlend = (championId: string, ranked: number, roleFit = 1) => {
    const p = ctx.stats.presence(championId);
    const proTrust = p.proGames / (p.proGames + 30);
    const w = clamp(ctx.config.weights.proPriority * proTrust, 0, 1);
    return (1 - w) * ranked + w * (p.proPresence / 20) * roleFit;
  };
  // How much of a champion's play falls in roles the enemy still has open (1 without role data).
  const openFit = (championId: string) => {
    let played = 0;
    let open = 0;
    for (const role of ROLES) {
      const share = ctx.stats.roleShare(championId, role).share;
      played += share;
      open += share * roleOpen.get(role)!;
    }
    return played > 0 ? open / played : 1;
  };
  const shares: ActionShares = {
    ban(championId) {
      if (unavailable.has(championId)) return 0;
      const ranked = banTotal > 0 ? ctx.stats.presence(championId).banRate / banTotal : 0;
      return proBlend(championId, ranked);
    },
    pick(championId) {
      if (unavailable.has(championId) || openSum <= 0) return 0;
      let ranked = 0;
      for (const role of ROLES) {
        const total = roleTotals.get(role)!;
        if (total <= 0) continue;
        ranked += (roleOpen.get(role)! / openSum) * (ctx.stats.strength(championId, role).games / total);
      }
      return proBlend(championId, ranked, openFit(championId));
    },
  };
  byUnavailable.set(unavailable, shares);
  return shares;
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
  roleHold: RoleHold;
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
  const roleOpen = enemyRoleOpenProbability(ctx, role);
  // Per enemy action (see enemyActionShares), tilted up for draft priority: contested
  // champions go earlier in a draft than an even spread over its actions would suggest.
  const shares = enemyActionShares(ctx, derived.unavailableChampionIds);
  const pBan = clamp(shares.ban(championId) * t.banRateMultiplier, 0, 0.6);
  // Professional draft patterns: a champion pros take first rotation is taken earlier than its
  // raw pick rate implies; a habitual last-pick counter is not.
  const slot = ctx.stats.proSlots?.(championId) ?? null;
  const slotTrust = slot ? slot.picks / (slot.picks + 12) : 0;
  const rotationFactor = slot ? 1 + slotTrust * (0.6 * slot.firstRotation - 0.3 * slot.counterpick) : 1;
  // The pick share already counts only the roles the enemy still has open.
  const pPick = clamp(shares.pick(championId) * t.pickRateMultiplier * rotationFactor, 0, 0.5);
  const denialProbability = ahead.nextPickIndex === null ? 0 : 1 - Math.pow(1 - pBan, ahead.bans) * Math.pow(1 - pPick, ahead.picks);
  const valueAtRisk = Math.max(0, fitScore - fallbackScore);
  const urgency = t.denialWeight * denialProbability * valueAtRisk;

  // Counterpick value: only relevant when the enemy's slot in this role is still hidden and the
  // enemy will likely reveal it before our next pick.
  const enemyRoleHidden = roleOpen > 0.5;
  const revealProbability = enemyRoleHidden && derived.enemyRemainingPicks > 0 ? clamp(ahead.picks / derived.enemyRemainingPicks, 0, 1) * roleOpen : 0;
  const hold = t.counterpickHoldWeight * revealProbability * roleHold.voi;
  const matchupVariance = roleHold.variance.get(championId) ?? 0;
  // Blind safety counts only as far as matchup evidence supports it (see RoleHold.evidence).
  const matchupEvidence = roleHold.evidence.get(championId) ?? 0;
  const blind = enemyRoleHidden ? t.blindSafetyWeight * Math.max(0, 0.03 - matchupVariance) * 0.5 * matchupEvidence : 0;

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
  if (enemyRoleHidden && matchupVariance < 0.012 && matchupEvidence >= 0.2 && blind > 0) reasons.push("Safe blind pick: matchups are stable");
  if (isFlex) reasons.push("Keeps our role assignment ambiguous");
  if (coachHold > 0) reasons.push(`Strategy override: hold ${ROLE_LABELS[role]} for a counterpick`);
  if (slot && slotTrust >= 0.4 && slot.firstRotation >= 0.6 && denialProbability >= 0.2) reasons.push(`Pro teams take it first rotation (${formatPercent(slot.firstRotation, 0)} of its pro picks)`);
  if (ahead.nextPickIndex === null) reasons.push("Our last pick: nothing to hold for");

  return { denialProbability, valueAtRisk, adjustment, enemyRoleHidden, matchupVariance, reasons };
}
