import { compositionIdentity, compositionInteraction, compositionNeeds, teamProfile, urgencyMultiplier, type TeamProfile } from "../composition";
import { enumerate2 } from "./util";
import { enemyInRole } from "./enemy";
import type { Role } from "../roles";
import type { PlayerProfile } from "../roster/types";
import { poolFor } from "../roster/eligibility";
import type { ChampionInfo, EngineConfig, EnemyRoleEstimate, LaneEvaluation, MatchupSeverity, StatsProvider, TeamEvaluation, TeamMember } from "./types";

export interface EvalContext {
  players: Map<string, PlayerProfile>;
  champions: Map<string, ChampionInfo>;
  stats: StatsProvider;
  config: EngineConfig;
  enemy: EnemyRoleEstimate[];
  enemyProfile: TeamProfile;
  /** Memo of evaluations within one recommendation call. */
  memo: Map<string, TeamEvaluation>;
}

const KEY_PAIRS = new Set(["TOP|JUNGLE", "JUNGLE|MID", "ADC|SUPPORT"]);
const UNFILLED_ROLE_PENALTY = 0.08;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function teamKey(team: TeamMember[]): string {
  return team
    .map((m) => `${m.role}:${m.championId}:${m.playerId}`)
    .sort()
    .join(",");
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
 *
 * The philosophy multipliers scale the synergy and enemy parts (0.5/0.5 → both ×1).
 */
export function evaluateTeam(team: TeamMember[], ctx: EvalContext): TeamEvaluation {
  const key = teamKey(team);
  const cached = ctx.memo.get(key);
  if (cached) return cached;

  const { config, stats } = ctx;
  const w = config.weights;
  let strength = 0;
  let comfort = 0;
  let pro = 0;
  let swapCost = 0;
  let confidenceSum = 0;
  let confidenceN = 0;
  const strengths = new Map<string, number>();

  for (const m of team) {
    const s = stats.strength(m.championId, m.role);
    strengths.set(m.championId, s.estimate);
    strength += s.estimate - 0.5;
    confidenceSum += s.confidence;
    confidenceN += 1;

    const player = ctx.players.get(m.playerId);
    if (player) {
      const pool = poolFor(player, m.role);
      const idx = pool.indexOf(m.championId);
      if (idx >= 0 && pool.length > 0) comfort += 0.015 * (1 - idx / Math.max(1, pool.length));
      if (m.role !== player.primaryRole) swapCost -= w.roleSwapCost;
    }

    const p = stats.presence(m.championId);
    const proTrust = p.proGames / (p.proGames + 30);
    pro += (p.proPresence - 0.12) * 0.05 * proTrust;
  }

  // Lane matchups against probability-weighted enemy occupants of the same role.
  let lane = 0;
  let teamMatchup = 0;
  const lanes: LaneEvaluation[] = [];
  for (const m of team) {
    const ours = strengths.get(m.championId) ?? 0.5;
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
    if (weightSum > 0) {
      // Severity penalties: a slightly weaker lane is acceptable, a disastrous one is not.
      const sev = config.severity;
      if (expectedDelta < sev.significantlyUnfavourable) laneValue -= (sev.significantlyUnfavourable - expectedDelta) * (config.severityPenalty.significant - 1);
      if (expectedDelta < sev.nearUnplayable) laneValue -= (sev.nearUnplayable - expectedDelta) * (config.severityPenalty.unplayable - config.severityPenalty.significant);
      confidenceSum += laneConfidence;
      confidenceN += 1;
    }
    lane += laneValue;
    lanes.push({ role: m.role, championId: m.championId, expectedDelta, severity: classifySeverity(expectedDelta, config), likelyOpponent, confidence: laneConfidence });

    // Cross-role interaction evidence (smaller, noisier).
    for (const e of ctx.enemy) {
      for (const [role, prob] of Object.entries(e.probabilities) as Array<[Role, number]>) {
        if (role === m.role || prob < 0.05) continue;
        const theirs = stats.strength(e.championId, role).estimate;
        const expectedWr = clamp(0.5 + (ours - 0.5) - (theirs - 0.5), 0.3, 0.7);
        const mu = stats.matchup(m.championId, m.role, e.championId, role, expectedWr);
        teamMatchup += prob * (mu.estimate - expectedWr) * 0.5;
      }
    }
  }

  // Pair synergy from joint evidence, isolated from individual strength.
  let pairSynergy = 0;
  const synergyPairs: TeamEvaluation["synergyPairs"] = [];
  for (const [a, b] of enumerate2(team)) {
    const sa = strengths.get(a.championId) ?? 0.5;
    const sb = strengths.get(b.championId) ?? 0.5;
    const expected = clamp(0.5 + (sa - 0.5) + (sb - 0.5), 0.3, 0.7);
    const syn = stats.synergy(a.championId, a.role, b.championId, b.role, expected);
    const effect = syn.estimate - expected;
    const isKey = KEY_PAIRS.has(`${a.role}|${b.role}`) || KEY_PAIRS.has(`${b.role}|${a.role}`);
    pairSynergy += effect * (isKey ? config.keyPairMultiplier : 1);
    if (Math.abs(effect) >= 0.008 && syn.confidence >= 0.15) {
      synergyPairs.push({ a: a.championId, b: b.championId, delta: effect, confidence: syn.confidence });
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

  const unfilled = 5 - team.length;
  const individualPart = w.championStrength * strength + w.playerComfort * comfort + swapCost + w.proPriority * pro;
  const synergyPart = (w.pairSynergy * pairSynergy + w.structure * structure) * (2 * config.philosophy.synergy);
  const enemyPart = (w.laneMatchup * lane + w.teamMatchup * teamMatchup + w.interaction * interaction) * (2 * config.philosophy.enemy);
  const total = individualPart + synergyPart + enemyPart - unfilled * UNFILLED_ROLE_PENALTY;

  const result: TeamEvaluation = {
    total,
    synergyPart,
    enemyPart,
    individualPart,
    components: { strength, comfort, lane, teamMatchup, pairSynergy, structure, interaction, swapCost, pro },
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

export function enemyTeamProfile(enemyChampionIds: string[], champions: Map<string, ChampionInfo>): TeamProfile {
  return teamProfile(enemyChampionIds.map((id) => champions.get(id)?.profile.traits).filter((t): t is NonNullable<typeof t> => !!t));
}
