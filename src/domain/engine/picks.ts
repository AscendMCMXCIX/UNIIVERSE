import type { DerivedDraft, DraftStep } from "../draft";
import { ROLES, ROLE_LABELS, type Role } from "../roles";
import { describeSwap, enumerateLegalAssignments, validateAssignment, type Assignment } from "../roster/assignments";
import { eligibleChampions, flexOwners } from "../roster/eligibility";
import type { PlayerProfile } from "../roster/types";
import { describeTradeoff, explainCandidate } from "./explain";
import { bestCompletion, shortlistFor, type SearchContext } from "./search";
import { assessTiming, roleHoldValue } from "./timing";
import type { BreakdownItem, Candidate, HoldAdvice, PairRecommendation, PickBreakdown, PickRecommendation, RoleSwapRecommendation, TeamMember } from "./types";
import { formatDelta, formatPercent } from "./util";
import { confidenceLabel } from "../stats";
import { poolFor } from "../roster/eligibility";
import { proficiencyComfort } from "./evaluate";
import { TIER_LABELS, tierPhrase } from "../proficiency";
import { executionProfile, powerProfile, resourceNeed } from "../champion-model/derived";
import { emptyTraits } from "../champion-model/traits";

export interface PickPhaseResult {
  assignment: Assignment;
  roleSwap: RoleSwapRecommendation | null;
  candidates: Candidate[];
  bestFit: Array<TeamMember & { locked: boolean }>;
  bestFitEvaluation: ReturnType<typeof bestCompletion>["evaluation"] | null;
  holds: HoldAdvice[];
  primary: PickRecommendation | PairRecommendation | null;
  alternatives: Array<PickRecommendation | PairRecommendation>;
}

export function lockedMembers(derived: DerivedDraft): TeamMember[] {
  return derived.ourPicks.filter((p) => p.role && p.playerId).map((p) => ({ playerId: p.playerId!, role: p.role!, championId: p.championId }));
}

/**
 * Chooses the player→role assignment to plan around. The current assignment is kept unless a
 * legal alternative improves the best reachable team by more than the configured threshold
 * (which already includes the per-player swap cost).
 */
export function chooseAssignment(players: PlayerProfile[], current: Assignment, locked: TeamMember[], ctx: SearchContext): { assignment: Assignment; roleSwap: RoleSwapRecommendation | null; completions: Map<string, ReturnType<typeof bestCompletion>> } {
  const lockedRoles: Partial<Assignment> = {};
  for (const m of locked) lockedRoles[m.role] = m.playerId;
  const options = enumerateLegalAssignments(players, lockedRoles);
  const completions = new Map<string, ReturnType<typeof bestCompletion>>();
  const keyOf = (a: Assignment) => ROLES.map((r) => `${r}:${a[r]}`).join("|");

  const currentValid = validateAssignment(players, current).ok && options.some((o) => keyOf(o.assignment) === keyOf(current));
  let best: { assignment: Assignment; score: number } | null = null;
  for (const o of options) {
    const c = bestCompletion(o.assignment, locked, ctx);
    completions.set(keyOf(o.assignment), c);
    const score = c.evaluation.total - c.unfillable.length * 0.2;
    if (!best || score > best.score) best = { assignment: o.assignment, score };
  }
  if (!best) {
    return { assignment: current, roleSwap: null, completions };
  }
  if (!currentValid) {
    return { assignment: best.assignment, roleSwap: null, completions };
  }
  const currentCompletion = completions.get(keyOf(current))!;
  const currentScore = currentCompletion.evaluation.total - currentCompletion.unfillable.length * 0.2;
  const improvement = best.score - currentScore;
  if (keyOf(best.assignment) !== keyOf(current) && improvement > ctx.config.swapThreshold) {
    const moves = describeSwap(players, current, best.assignment);
    const why: string[] = [];
    for (const move of moves) {
      const player = ctx.players.get(move.playerId);
      if (!player) continue;
      const fromPool = eligibleChampions(player, move.from, { unavailableChampionIds: ctx.unavailable }).length;
      const toPool = eligibleChampions(player, move.to, { unavailableChampionIds: ctx.unavailable }).length;
      if (fromPool <= 1) why.push(`${player.displayName}'s ${ROLE_LABELS[move.from]} pool is down to ${fromPool} option${fromPool === 1 ? "" : "s"}`);
      why.push(`${player.displayName} keeps ${toPool} strong ${ROLE_LABELS[move.to]} option${toPool === 1 ? "" : "s"}`);
    }
    why.push(`Projected team improves by ${formatDelta(improvement)} after swap cost`);
    const bestEval = completions.get(keyOf(best.assignment))!.evaluation;
    if (bestEval.components.lane > currentCompletion.evaluation.components.lane + 0.005) why.push("Better matchup coverage against their revealed picks");
    if (bestEval.synergyPart > currentCompletion.evaluation.synergyPart + 0.005) why.push("More coherent composition");
    return { assignment: best.assignment, roleSwap: { from: current, to: best.assignment, moves, improvement, why }, completions };
  }
  return { assignment: current, roleSwap: null, completions };
}

/** Builds every legal (champion, player, role) candidate for the next pick under the assignment. */
export function buildCandidates(assignment: Assignment, locked: TeamMember[], derived: DerivedDraft, players: PlayerProfile[], ctx: SearchContext): { candidates: Candidate[]; best: ReturnType<typeof bestCompletion> } {
  const best = bestCompletion(assignment, locked, ctx);
  const bestChampions = new Set(best.team.map((m) => m.championId));
  const lockedRoles = new Set(locked.map((m) => m.role));
  const holdCache = new Map<Role, ReturnType<typeof roleHoldValue>>();
  const candidates: Candidate[] = [];

  for (const role of ROLES) {
    if (lockedRoles.has(role)) continue;
    const player = ctx.players.get(assignment[role]);
    if (!player) continue;
    const taken = new Set<string>([...ctx.unavailable, ...locked.map((m) => m.championId)]);
    // Large pools: assess the role's shortlist (always including the best team's champion for it).
    const pool = shortlistFor(role, player.id, eligibleChampions(player, role, { unavailableChampionIds: taken }), locked, ctx, bestChampions);
    if (!holdCache.has(role)) holdCache.set(role, roleHoldValue(ctx, player, role, taken));
    const roleHold = holdCache.get(role)!;
    for (const championId of pool) {
      const withPick = bestCompletion(assignment, [...locked, { playerId: player.id, role, championId }], ctx);
      const fitScore = withPick.evaluation.total - withPick.unfillable.length * 0.2;
      // If the overall best team does not use this champion, losing it costs nothing extra.
      const fallback = bestChampions.has(championId) ? bestCompletion(assignment, locked, ctx, new Set([championId])) : best;
      const fallbackScore = fallback.evaluation.total - fallback.unfillable.length * 0.2;
      const timing = assessTiming({ championId, role, playerId: player.id, fitScore, fallbackScore, derived, ctx, players, roleHold });
      const owners = flexOwners(players, championId);
      const traits = ctx.champions.get(championId)?.profile.traits ?? emptyTraits();
      candidates.push({
        championId,
        playerId: player.id,
        role,
        fitScore,
        fallbackScore,
        evaluation: withPick.evaluation,
        timing,
        pickNowScore: fitScore + timing.adjustment,
        isFlex: new Set(owners.map((o) => o.role)).size > 1,
        execution: executionProfile(traits),
        resource: resourceNeed(traits).need,
        power: powerProfile(traits).curve,
      });
    }
  }
  candidates.sort((a, b) => b.pickNowScore - a.pickNowScore);
  return { candidates, best };
}

/** Linked-account proficiency's own contribution to a candidate's score (weighted comfort for this player on this champion). */
export function candidateProficiencyShare(c: Candidate, ctx: SearchContext): number {
  const prof = ctx.proficiency?.(c.playerId, c.championId, c.role) ?? null;
  return ctx.config.weights.playerComfort * proficiencyComfort(prof);
}

/**
 * "Why this pick?": the projected team's score with this pick, split into the factors the engine
 * weighed, each in win-rate units with a sentence. Also states plainly when linked-account data
 * changed the ranking versus pool order alone.
 */
export function buildBreakdown(c: Candidate, ctx: SearchContext, options: { decisive?: string | null } = {}): PickBreakdown {
  const ev = c.evaluation;
  const w = ctx.config.weights;
  const comp = ev.components;
  const name = ctx.champions.get(c.championId)?.name ?? c.championId;
  const player = ctx.players.get(c.playerId);
  const playerName = player?.displayName ?? "player";
  const prof = ctx.proficiency?.(c.playerId, c.championId, c.role) ?? null;
  const profShare = candidateProficiencyShare(c, ctx);
  const pool = player ? poolFor(player, c.role) : [];
  const idx = pool.indexOf(c.championId);
  const lane = ev.lanes.find((l) => l.championId === c.championId);
  const strength = ctx.stats.strength(c.championId, c.role);
  const presence = ctx.stats.presence(c.championId);
  const items: BreakdownItem[] = [
    { key: "team-fit", value: ev.synergyPart, text: ev.identity ? `Projected composition reads as ${ev.identity.toLowerCase()}${ev.synergyPairs.length ? `; ${ev.synergyPairs.length} evidence-backed pairing${ev.synergyPairs.length === 1 ? "" : "s"}` : ""}.` : "How the champion combines with our locked and projected picks." },
    { key: "enemy-interaction", value: ev.enemyPart, text: lane?.likelyOpponent ? `${name} ${lane.severity.replace(/-/g, " ")} into ${ctx.champions.get(lane.likelyOpponent)?.name ?? lane.likelyOpponent} (${formatDelta(lane.expectedDelta)} lane); cross-role matchups and composition interaction included.` : lane?.scoutedOpponent ? `Enemy ${ROLE_LABELS[c.role]} not revealed yet, but the known player most often picks ${ctx.champions.get(lane.scoutedOpponent.championId)?.name ?? lane.scoutedOpponent.championId} (${formatPercent(lane.scoutedOpponent.probability, 0)} weighted likelihood): the lane is weighed against their likely picks (${formatDelta(lane.expectedDelta)}).` : ctx.enemy.length ? "Enemy role for this pick still hidden: lane is blind, cross-role matchups counted." : "Nothing revealed yet: blind pick, no enemy interaction to weigh." },
    { key: "player-proficiency", value: w.playerComfort * comp.comfort, text: prof && prof.confidence > 0 ? `${playerName} ${tierPhrase(prof.tier, name)} (${prof.games} games on record, ${prof.recentGames} in the last 30 days${prof.patchGames ? `, ${prof.patchGames} this patch` : ""}); linked accounts contribute ${formatDelta(profShare)}.${idx === 0 ? " Also their first-choice pick." : ""}` : `${playerName}: ${idx === 0 ? "first" : idx > 0 ? `#${idx + 1}` : "unranked"} in their pool; no linked-account data for ${name}, so pool order alone.` },
    { key: "patch-strength", value: w.championStrength * comp.strength, text: strength.games > 0 ? `${name} ${formatPercent(strength.estimate)} win rate in ${ROLE_LABELS[c.role]} over ${Math.round(strength.games).toLocaleString()} games (${confidenceLabel(strength.confidence, strength.games)} confidence); team total shown.` : `No ranked games on record for ${name} in ${ROLE_LABELS[c.role]} this period.` },
    { key: "pro-priority", value: w.proPriority * comp.pro, text: presence.proGames > 0 ? `${formatPercent(presence.proPresence, 0)} presence over ${Math.round(presence.proGames)} professional games.` : "No professional games in the period." },
    { key: "realism", value: comp.execution + comp.overrides, text: `${ev.realism.executionLabel} execution demand for the projected team${ev.realism.resourceOverloaded ? "; resource overload" : ""}${comp.overrides ? `; strategy overrides ${formatDelta(comp.overrides)}` : ""}.` },
    { key: "timing", value: c.timing.adjustment, text: c.timing.reasons[0] ?? (c.timing.denialProbability >= 0.25 ? `${formatPercent(c.timing.denialProbability, 0)} likely gone before our next pick.` : "No timing pressure.") },
  ];
  const games = ctx.stats.describe().totalGames;
  return {
    items,
    proficiencyContribution: profShare,
    proficiencyDecisive: options.decisive ?? null,
    proficiency: prof && prof.confidence > 0 ? { tier: prof.tier, games: prof.games, recentGames: prof.recentGames, patchGames: prof.patchGames, confidence: prof.confidence } : null,
    evidence: { label: games === 0 ? "none" : confidenceLabel(ev.confidence, games), games: Math.round(games), confidence: ev.confidence },
  };
}

/**
 * Did linked-account proficiency change the order? Compares the top candidate with every other
 * champion after removing each candidate's own proficiency contribution: if another champion
 * would then rank first, the data was decisive and the sentence says so.
 */
export function proficiencyDecision(candidates: Candidate[], ctx: SearchContext): { primary: string | null; demoted: Map<string, string> } {
  const demoted = new Map<string, string>();
  const primary = candidates[0];
  if (!primary || !ctx.proficiency) return { primary: null, demoted };
  const base = (c: Candidate) => c.pickNowScore - candidateProficiencyShare(c, ctx);
  const primaryBase = base(primary);
  const name = (c: Candidate) => ctx.champions.get(c.championId)?.name ?? c.championId;
  const who = (c: Candidate) => ctx.players.get(c.playerId)?.displayName ?? "player";
  const tierOf = (c: Candidate) => {
    const p = ctx.proficiency?.(c.playerId, c.championId, c.role) ?? null;
    return p && p.confidence > 0 ? `${TIER_LABELS[p.tier].toLowerCase()} (${p.games} games, ${p.recentGames} recent)` : "no linked-account data";
  };
  let primaryNote: string | null = null;
  for (const c of candidates.slice(1)) {
    if (c.championId === primary.championId) continue;
    if (base(c) > primaryBase + 0.0005) {
      if (!primaryNote) primaryNote = `Player data decided this: on pool order alone ${name(c)} (${who(c)}) would rank first. ${name(primary)} is preferred because ${who(primary)} is ${tierOf(primary)} on it${candidateProficiencyShare(c, ctx) < -0.0005 ? ` and ${who(c)} is ${tierOf(c)} on ${name(c)}` : ""}.`;
      demoted.set(`${c.championId}|${c.role}`, `Would rank first on pool order alone; ranked below because ${who(primary)} is ${tierOf(primary)} on ${name(primary)}${candidateProficiencyShare(c, ctx) < -0.0005 ? ` and ${who(c)} is ${tierOf(c)} on ${name(c)}` : ""}.`);
    }
  }
  return { primary: primaryNote, demoted };
}

function toPickRecommendation(c: Candidate, locked: TeamMember[], ctx: SearchContext, tradeoffAgainst?: Candidate, decisive: string | null = null): PickRecommendation {
  const why = explainCandidate(c, locked, ctx);
  if (decisive) why.unshift(decisive);
  return {
    kind: "pick",
    championId: c.championId,
    playerId: c.playerId,
    role: c.role,
    score: c.pickNowScore,
    why: why.slice(0, 8),
    tradeoff: tradeoffAgainst ? describeTradeoff(c, tradeoffAgainst, ctx) : undefined,
    candidate: c,
    breakdown: buildBreakdown(c, ctx, { decisive }),
  };
}

/**
 * Pair evaluation for consecutive two-pick windows: the two champions are judged together
 * (joint completion + combined urgency), never as "best single, second-best single".
 */
export function recommendPair(candidates: Candidate[], assignment: Assignment, locked: TeamMember[], ctx: SearchContext): PairRecommendation[] {
  const perRole = new Map<Role, Candidate[]>();
  for (const c of candidates) {
    const list = perRole.get(c.role) ?? [];
    if (list.length < ctx.config.search.pairCandidates) list.push(c);
    perRole.set(c.role, list);
  }
  const roles = [...perRole.keys()];
  const pairs: PairRecommendation[] = [];
  for (let i = 0; i < roles.length; i++) {
    for (let j = i + 1; j < roles.length; j++) {
      for (const a of perRole.get(roles[i]!)!) {
        for (const b of perRole.get(roles[j]!)!) {
          if (a.championId === b.championId) continue;
          const joint = bestCompletion(assignment, [...locked, { playerId: a.playerId, role: a.role, championId: a.championId }, { playerId: b.playerId, role: b.role, championId: b.championId }], ctx);
          const jointScore = joint.evaluation.total - joint.unfillable.length * 0.2;
          const score = jointScore + a.timing.adjustment + b.timing.adjustment;
          const why: string[] = [];
          const pairSyn = joint.evaluation.synergyPairs.find((p) => (p.a === a.championId && p.b === b.championId) || (p.a === b.championId && p.b === a.championId));
          if (pairSyn && pairSyn.delta > 0) why.push(`${ctx.champions.get(a.championId)?.name} and ${ctx.champions.get(b.championId)?.name} win together (${formatDelta(pairSyn.delta)})`);
          const combinedUrgency = a.timing.denialProbability + b.timing.denialProbability;
          if (combinedUrgency > 0.5) why.push("Secures two contested picks before their next turn");
          if (joint.evaluation.identity) why.push(`Builds a ${joint.evaluation.identity.toLowerCase()} composition`);
          for (const note of joint.evaluation.interactionNotes.filter((n) => n.value > 0.15).slice(0, 1)) why.push(note.text);
          const aRec = toPickRecommendation(a, locked, ctx);
          const bRec = toPickRecommendation(b, [...locked, { playerId: a.playerId, role: a.role, championId: a.championId }], ctx);
          pairs.push({ kind: "pair", picks: [aRec, bRec], score, why: why.length ? why : ["Strongest combined two-pick window"] });
        }
      }
    }
  }
  pairs.sort((a, b) => b.score - a.score);
  return pairs;
}

export function runPickPhase(players: PlayerProfile[], current: Assignment, derived: DerivedDraft, step: DraftStep, ctx: SearchContext): PickPhaseResult {
  const locked = lockedMembers(derived);
  const { assignment, roleSwap } = chooseAssignment(players, current, locked, ctx);
  const { candidates, best } = buildCandidates(assignment, locked, derived, players, ctx);
  const bestFit = best.team.map((m) => ({ ...m, locked: locked.some((l) => l.championId === m.championId) }));

  const holds: HoldAdvice[] = [];
  const topByRole = new Map<Role, Candidate>();
  for (const c of candidates) if (!topByRole.has(c.role)) topByRole.set(c.role, c);
  const primaryCandidate = candidates[0];
  for (const [role, c] of topByRole) {
    if (primaryCandidate && role !== primaryCandidate.role && c.timing.enemyRoleHidden && c.fitScore >= primaryCandidate.fitScore - 0.01 && c.timing.adjustment < -0.003) {
      holds.push({ role, reason: `Hold ${ROLE_LABELS[role]}: their ${ROLE_LABELS[role].toLowerCase()} is still hidden and our pool has a counterpick` });
    }
  }

  let primary: PickRecommendation | PairRecommendation | null = null;
  let alternatives: Array<PickRecommendation | PairRecommendation> = [];
  const isPairWindow = step.windowSize === 2 && step.windowPosition === 0 && derived.ourRemainingPicks >= 2;
  if (isPairWindow && candidates.length >= 2) {
    const pairs = recommendPair(candidates, assignment, locked, ctx);
    primary = pairs[0] ?? null;
    alternatives = pairs.slice(1, 3);
  } else if (primaryCandidate) {
    const alts = pickAlternatives(candidates, primaryCandidate);
    const decision = proficiencyDecision(candidates, ctx);
    primary = toPickRecommendation(primaryCandidate, locked, ctx, alts[0], decision.primary);
    alternatives = alts.map((c) => toPickRecommendation(c, locked, ctx, primaryCandidate, decision.demoted.get(`${c.championId}|${c.role}`) ?? null));
  }

  return { assignment, roleSwap, candidates, bestFit, bestFitEvaluation: best.evaluation, holds, primary, alternatives };
}

/** Two credible alternatives: prefer a different role or a clearly different trade-off. */
function pickAlternatives(candidates: Candidate[], primary: Candidate): Candidate[] {
  const alts: Candidate[] = [];
  for (const c of candidates) {
    if (c === primary) continue;
    if (alts.length === 0) {
      alts.push(c);
      continue;
    }
    if (alts.length === 1 && (c.role !== primary.role || c.role !== alts[0]!.role || c.playerId !== alts[0]!.playerId)) {
      alts.push(c);
      break;
    }
  }
  return alts.slice(0, 2);
}
