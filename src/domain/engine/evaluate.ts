import { compositionIdentity, compositionInteraction, compositionNeeds, teamProfile, urgencyMultiplier, type TeamProfile } from "../composition";
import { enemyInRole } from "./enemy";
import type { Role } from "../roles";
import type { PlayerProfile } from "../roster/types";
import { poolFor, roleDistance } from "../roster/eligibility";
import type { ChampionInfo, EngineConfig, EnemyRoleEstimate, LaneEvaluation, MatchupSeverity, StatsProvider, TeamEvaluation, TeamMember, TeamRealism } from "./types";
import type { ProficiencyLookup } from "../proficiency";
import type { ChampionTraits } from "../champion-model/traits";
import type { EnemyTendencies } from "./tendencies";
import { executionProfile, powerProfile, resourceNeed } from "../champion-model/derived";
import { RISK_MULTIPLIER } from "./config";
import type { AppliedOverrides } from "./overrides";

export interface EvalContext {
  players: Map<string, PlayerProfile>;
  champions: Map<string, ChampionInfo>;
  stats: StatsProvider;
  config: EngineConfig;
  enemy: EnemyRoleEstimate[];
  enemyProfile: TeamProfile;
  /** Memo of evaluations within one recommendation call. */
  memo: Map<string, TeamEvaluation>;
  proficiency?: ProficiencyLookup | null;
  /** Applied coach overrides (soft tilts); null/undefined = none. */
  overrides?: AppliedOverrides | null;
  /** Session scouting of known enemy players (likely picks per role). */
  tendencies?: EnemyTendencies | null;
}

const KEY_PAIRS = new Set(["TOP|JUNGLE", "JUNGLE|MID", "ADC|SUPPORT"]);

/** Comfort from the player's own pool order: first choice 0.015, fading to 0 down the list. */
export function poolOrderComfort(index: number, poolLength: number): number {
  return index >= 0 && poolLength > 0 ? 0.015 * (1 - index / Math.max(1, poolLength)) : 0;
}

/**
 * Comfort from linked-account proficiency: up to ±0.025 win-rate units at full confidence. A
 * modifier on top of pool order, never a gate: a champion outside the pool is never evaluated.
 */
export function proficiencyComfort(prof: { score: number; confidence: number } | null | undefined): number {
  if (!prof || prof.confidence <= 0) return 0;
  return (prof.score - 0.5) * 0.05 * prof.confidence;
}
const UNFILLED_ROLE_PENALTY = 0.08;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Canonical key of a team: members in role order (a team holds each role at most once). */
export function teamKey(team: TeamMember[]): string {
  let key = "";
  for (const role of ROLE_ORDER) {
    for (const m of team) if (m.role === role) key += `${role}:${m.championId}:${m.playerId},`;
  }
  return key;
}
const ROLE_ORDER: readonly Role[] = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"];

/**
 * Everything about one member that does not depend on the rest of the team: champion strength,
 * comfort, pro priority, swap cost, the lane against the (probable) enemy occupant and cross-role
 * matchups. Cached per evaluation memo, so the thousands of teams a search scores reuse them; a
 * hypothetical enemy draft (what-if) gets a new memo and therefore fresh member parts.
 */
interface MemberPart {
  strength: number;
  strengthEstimate: number;
  strengthConfidence: number;
  comfort: number;
  swapCost: number;
  pro: number;
  laneValue: number;
  laneConfidence: number;
  hasLane: boolean;
  laneEval: LaneEvaluation;
  teamMatchup: number;
}
interface PairPart {
  weighted: number;
  entry: TeamEvaluation["synergyPairs"][number] | null;
}
const partCaches = new WeakMap<Map<string, TeamEvaluation>, { members: Map<string, MemberPart>; pairs: Map<string, PairPart> }>();

function cachesFor(ctx: EvalContext) {
  let c = partCaches.get(ctx.memo);
  if (!c) {
    c = { members: new Map(), pairs: new Map() };
    partCaches.set(ctx.memo, c);
  }
  return c;
}

function traitsOf(ctx: EvalContext, championId: string) {
  return ctx.champions.get(championId)?.profile.traits;
}

export function classifySeverity(delta: number, config: EngineConfig): MatchupSeverity {
  const s = config.severity;
  if (delta >= 0.02) return "favourable";
  if (delta > s.slightlyUnfavourable) return "even";
  if (delta > s.significantlyUnfavourable) return "slightly-unfavourable";
  if (delta > s.nearUnplayable) return "significantly-unfavourable";
  return "near-unplayable";
}

/**
 * Evaluates a (possibly partial) team against the revealed enemy picks.
 *
 * Each component is an approximate win-rate delta so they can be weighted, summed and explained:
 *   individual  = champion strength + player comfort + pro priority − role-swap cost
 *   synergy     = pair synergy evidence + composition structure
 *   enemy       = lane matchups (with severity penalties) + cross-role matchups + interaction
 *   realism     = execution demand, communication burden and resource overload (the "can we
 *                 actually execute it" layer), scaled by the configured risk preference
 *   overrides   = coach tilts (trait bonuses, strongside/weakside resourcing)
 *
 * The philosophy multipliers scale the synergy and enemy parts (0.5/0.5 → both ×1).
 */
export function evaluateTeam(team: TeamMember[], ctx: EvalContext): TeamEvaluation {
  const key = teamKey(team);
  const cached = ctx.memo.get(key);
  if (cached) return cached;

  const { config } = ctx;
  const w = config.weights;
  const caches = cachesFor(ctx);
  const parts: MemberPart[] = [];
  for (const m of team) {
    const k = `${m.role}:${m.championId}:${m.playerId}`;
    let part = caches.members.get(k);
    if (!part) {
      part = memberPart(m, ctx);
      caches.members.set(k, part);
    }
    parts.push(part);
  }

  let strength = 0;
  let comfort = 0;
  let pro = 0;
  let swapCost = 0;
  let confidenceSum = 0;
  let confidenceN = 0;
  for (const part of parts) {
    strength += part.strength;
    confidenceSum += part.strengthConfidence;
    confidenceN += 1;
    comfort += part.comfort;
    swapCost += part.swapCost;
    pro += part.pro;
  }

  // Lane matchups against probability-weighted enemy occupants of the same role.
  let lane = 0;
  let teamMatchup = 0;
  const lanes: LaneEvaluation[] = [];
  for (const part of parts) {
    if (part.hasLane) {
      confidenceSum += part.laneConfidence;
      confidenceN += 1;
    }
    lane += part.laneValue;
    lanes.push(part.laneEval);
    teamMatchup += part.teamMatchup;
  }

  // Pair synergy from joint evidence, isolated from individual strength.
  let pairSynergy = 0;
  const synergyPairs: TeamEvaluation["synergyPairs"] = [];
  for (let i = 0; i < team.length; i++) {
    for (let j = i + 1; j < team.length; j++) {
      const a = team[i]!;
      const b = team[j]!;
      const k = `${a.role}:${a.championId}|${b.role}:${b.championId}`;
      let pair = caches.pairs.get(k);
      if (!pair) {
        pair = pairPart(a, b, parts[i]!.strengthEstimate, parts[j]!.strengthEstimate, ctx);
        caches.pairs.set(k, pair);
      }
      pairSynergy += pair.weighted;
      if (pair.entry) synergyPairs.push(pair.entry);
    }
  }

  // Curated structure: holes and coherence.
  const traits = team.map((m) => traitsOf(ctx, m.championId)).filter((t): t is NonNullable<typeof t> => !!t);
  const profile = teamProfile(traits);
  const needs = compositionNeeds(profile);
  const urgency = urgencyMultiplier(team.length);
  let structure = 0;
  for (const n of needs) structure -= n.severity * urgency * 0.03;
  const identity = team.length >= 2 ? compositionIdentity(profile) : null;
  if (identity) {
    const top = identity.scores[identity.primary];
    structure += clamp((top - 1.8) * 0.012, 0, 0.02);
  }

  // Interaction with the revealed enemy composition.
  const interactionResult = compositionInteraction(profile, ctx.enemyProfile);
  const interaction = interactionResult.score * 0.06;

  // Realism: execution demand, communication burden and resource allocation.
  const { execution, realism } = assessRealism(team, ctx);
  // Coach overrides: trait tilts and strongside/weakside resourcing.
  const overrides = applyOverrideTilt(team, ctx);

  const unfilled = 5 - team.length;
  const individualPart = w.championStrength * strength + w.playerComfort * comfort + swapCost + w.proPriority * pro;
  const synergyPart = (w.pairSynergy * pairSynergy + w.structure * structure) * (2 * config.philosophy.synergy);
  const enemyPart = (w.laneMatchup * lane + w.teamMatchup * teamMatchup + w.interaction * interaction) * (2 * config.philosophy.enemy);
  const total = individualPart + synergyPart + enemyPart + execution + overrides - unfilled * UNFILLED_ROLE_PENALTY;

  const result: TeamEvaluation = {
    total,
    synergyPart,
    enemyPart,
    individualPart,
    components: { strength, comfort, lane, teamMatchup, pairSynergy, structure, interaction, swapCost, pro, execution, overrides },
    realism,
    lanes,
    needs,
    identity: identity?.primary ?? null,
    interactionNotes: interactionResult.notes,
    synergyPairs,
    confidence: confidenceN > 0 ? confidenceSum / confidenceN : 0,
  };
  ctx.memo.set(key, result);
  return result;
}

/** The team-independent parts of one member (see MemberPart). */
function memberPart(m: TeamMember, ctx: EvalContext): MemberPart {
  const { config, stats } = ctx;
  const w = config.weights;
  const s = stats.strength(m.championId, m.role);
  let comfort = 0;
  let swapCost = 0;
  const player = ctx.players.get(m.playerId);
  if (player) {
    const pool = poolFor(player, m.role);
    const idx = pool.indexOf(m.championId);
    // Configured pool order is the player's own statement of comfort; linked-account
    // proficiency refines it when evidence exists (a modifier, never a gate).
    const prof = ctx.proficiency?.(m.playerId, m.championId, m.role) ?? null;
    comfort = poolOrderComfort(idx, pool.length) + proficiencyComfort(prof);
    // Secondary role costs one swap; additional roles cost more (2, 2.5, ...), so a third or
    // fourth role only wins with a real reason (pool, proficiency or composition).
    swapCost = -w.roleSwapCost * roleDistance(player, m.role);
  }
  const p = stats.presence(m.championId);
  const proTrust = p.proGames / (p.proGames + 30);
  const pro = (p.proPresence - 0.12) * 0.05 * proTrust;

  const ours = s.estimate;
  const opponents = enemyInRole(ctx.enemy, m.role);
  let laneValue = 0;
  let expectedDelta = ours - 0.5;
  let laneConfidence = 0;
  let likelyOpponent: string | null = null;
  let weightSum = 0;
  for (const opp of opponents) {
    const theirs = stats.strength(opp.championId, m.role).estimate;
    const expectedWr = clamp(0.5 + (ours - 0.5) - (theirs - 0.5), 0.3, 0.7);
    const mu = stats.matchup(m.championId, m.role, opp.championId, m.role, expectedWr);
    const effect = mu.estimate - expectedWr;
    laneValue += opp.probability * (effect - (theirs - 0.5));
    expectedDelta += opp.probability * (effect - (theirs - 0.5));
    laneConfidence += opp.probability * mu.confidence;
    weightSum += opp.probability;
    if (!likelyOpponent) likelyOpponent = opp.championId;
  }
  // Hidden enemy slot but a known player: weigh the lane against their likely picks, scaled by
  // how open the slot still is and how confident the scouting is (never a certainty).
  let scoutedOpponent: LaneEvaluation["scoutedOpponent"] = null;
  const tendency = ctx.tendencies?.[m.role];
  if (tendency && tendency.picks.length > 0) {
    const open = clamp(1 - weightSum, 0, 1);
    if (open > 0.5) {
      let scouted = 0;
      for (const pick of tendency.picks) {
        if (pick.championId === m.championId) continue;
        const theirs = stats.strength(pick.championId, m.role).estimate;
        const expectedWr = clamp(0.5 + (ours - 0.5) - (theirs - 0.5), 0.3, 0.7);
        const mu = stats.matchup(m.championId, m.role, pick.championId, m.role, expectedWr);
        scouted += pick.probability * (mu.estimate - expectedWr - (theirs - 0.5));
      }
      const influence = open * tendency.confidence * 0.7;
      laneValue += scouted * influence;
      expectedDelta += scouted * influence;
      scoutedOpponent = { championId: tendency.picks[0]!.championId, probability: tendency.picks[0]!.probability * tendency.confidence };
    }
  }
  if (weightSum > 0) {
    // Severity penalties: a slightly weaker lane is acceptable, a disastrous one is not.
    const sev = config.severity;
    if (expectedDelta < sev.significantlyUnfavourable) laneValue -= (sev.significantlyUnfavourable - expectedDelta) * (config.severityPenalty.significant - 1);
    if (expectedDelta < sev.nearUnplayable) laneValue -= (sev.nearUnplayable - expectedDelta) * (config.severityPenalty.unplayable - config.severityPenalty.significant);
  }

  // Cross-role interaction evidence (smaller, noisier).
  let teamMatchup = 0;
  for (const e of ctx.enemy) {
    for (const [role, prob] of Object.entries(e.probabilities) as Array<[Role, number]>) {
      if (role === m.role || prob < 0.05) continue;
      const theirs = stats.strength(e.championId, role).estimate;
      const expectedWr = clamp(0.5 + (ours - 0.5) - (theirs - 0.5), 0.3, 0.7);
      const mu = stats.matchup(m.championId, m.role, e.championId, role, expectedWr);
      teamMatchup += prob * (mu.estimate - expectedWr) * 0.5;
    }
  }

  return {
    strength: s.estimate - 0.5,
    strengthEstimate: s.estimate,
    strengthConfidence: s.confidence,
    comfort,
    swapCost,
    pro,
    laneValue,
    laneConfidence,
    hasLane: weightSum > 0,
    laneEval: { role: m.role, championId: m.championId, expectedDelta, severity: classifySeverity(expectedDelta, config), likelyOpponent, confidence: laneConfidence, scoutedOpponent },
    teamMatchup,
  };
}

/** One ally pair's synergy effect (weighted for key pairs) and its evidence entry, if notable. */
function pairPart(a: TeamMember, b: TeamMember, sa: number, sb: number, ctx: EvalContext): PairPart {
  const expected = clamp(0.5 + (sa - 0.5) + (sb - 0.5), 0.3, 0.7);
  const syn = ctx.stats.synergy(a.championId, a.role, b.championId, b.role, expected);
  const effect = syn.estimate - expected;
  const isKey = KEY_PAIRS.has(`${a.role}|${b.role}`) || KEY_PAIRS.has(`${b.role}|${a.role}`);
  return {
    weighted: effect * (isKey ? ctx.config.keyPairMultiplier : 1),
    entry: Math.abs(effect) >= 0.008 && syn.confidence >= 0.15 ? { a: a.championId, b: b.championId, delta: effect, confidence: syn.confidence } : null,
  };
}

/** The derived descriptors realism needs, once per champion (curated traits never change). */
const derivedCache = new WeakMap<ChampionTraits, { executionTotal: number; coordination: number; strongside: boolean; curve: string; firstSpike: string | undefined }>();
function derivedOf(t: ChampionTraits) {
  let d = derivedCache.get(t);
  if (!d) {
    const ex = executionProfile(t);
    const pw = powerProfile(t);
    d = { executionTotal: ex.total, coordination: ex.coordination, strongside: resourceNeed(t).need === "strongside", curve: pw.curve, firstSpike: pw.spikes[0] };
    derivedCache.set(t, d);
  }
  return d;
}

/**
 * The "execute" layer: a composition is only as good as the team's ability to play it. Execution
 * demand, kits that need coordinated follow-up and more resource-hungry champions than a map can
 * feed all cost a little; the risk preference scales how much.
 */
export function assessRealism(team: TeamMember[], ctx: EvalContext): { execution: number; realism: TeamRealism } {
  const w = ctx.config.weights;
  const risk = RISK_MULTIPLIER[ctx.config.riskPreference] ?? 1;
  let executionSum = 0;
  let early = 0;
  let late = 0;
  const coordinationHeavy: string[] = [];
  const resourceHungry: string[] = [];
  const spikes = new Set<string>();
  let n = 0;
  for (const m of team) {
    const t = traitsOf(ctx, m.championId);
    if (!t) continue;
    n += 1;
    const d = derivedOf(t);
    executionSum += d.executionTotal;
    if (d.coordination >= 1.5) coordinationHeavy.push(m.championId);
    if (d.strongside) resourceHungry.push(m.championId);
    early += t.earlyGame;
    late += t.scaling;
    if (d.curve !== "mid" && d.firstSpike) spikes.add(d.firstSpike);
  }
  const meanExecution = n > 0 ? executionSum / n : 0;
  // Only demand above a "normal" composition costs anything; every team has some execution.
  const executionPenalty = -Math.max(0, meanExecution - 0.3) * n * w.execution * risk;
  const coordinationPenalty = -Math.max(0, coordinationHeavy.length - 2) * w.coordination * risk;
  const resourceOverloaded = resourceHungry.length >= 3;
  const resourcePenalty = -Math.max(0, resourceHungry.length - 2) * w.resourceOverload;
  const curve = early >= late + Math.max(1, n * 0.3) ? "early" : late >= early + Math.max(1, n * 0.3) ? "late" : "mid";
  const executionLabel: TeamRealism["executionLabel"] = meanExecution < 0.3 ? "low" : meanExecution < 0.45 ? "moderate" : meanExecution < 0.6 ? "high" : "very high";
  return {
    execution: executionPenalty + coordinationPenalty + resourcePenalty,
    realism: { execution: meanExecution, executionLabel, coordinationHeavy, resourceHungry, resourceOverloaded, powerCurve: curve, spikes: [...spikes].slice(0, 3) },
  };
}

function applyOverrideTilt(team: TeamMember[], ctx: EvalContext): number {
  const o = ctx.overrides;
  if (!o) return 0;
  let tilt = 0;
  for (const m of team) {
    const t = traitsOf(ctx, m.championId);
    if (!t) continue;
    for (const [key, bonus] of Object.entries(o.traitBonus) as Array<[keyof typeof o.traitBonus, number | undefined]>) {
      if (bonus) tilt += t[key] * bonus;
    }
    const need = resourceNeed(t);
    // Strongside roles should hold the resource-hungry champions; weakside roles should not.
    if (o.strongsideRoles.includes(m.role)) tilt += need.need === "strongside" ? 0.006 : need.need === "weakside" ? -0.004 : 0;
    if (o.weaksideRoles.includes(m.role)) tilt += need.need === "weakside" ? 0.006 : need.need === "strongside" ? -0.008 : 0;
    if (o.executionPenalty > 0) tilt -= executionProfile(t).total * o.executionPenalty;
  }
  return tilt;
}

export function enemyTeamProfile(enemyChampionIds: string[], champions: Map<string, ChampionInfo>): TeamProfile {
  return teamProfile(enemyChampionIds.map((id) => champions.get(id)?.profile.traits).filter((t): t is NonNullable<typeof t> => !!t));
}
