import { compositionIdentity } from "../composition";
import { threatMap, type ThreatEntry } from "../composition/threats";
import { deriveDraft, type DerivedDraft } from "../draft";
import { ROLES, type Role } from "../roles";
import { enumerateLegalAssignments, type Assignment } from "../roster/assignments";
import { confidenceLabel } from "../stats";
import { recommendBans } from "./bans";
import { recommendationConfidence } from "./confidence";
import { mergeEngineConfig } from "./config";
import { estimateEnemyRoles } from "./enemy";
import { enemyTeamProfile, evaluateTeam, type EvalContext } from "./evaluate";
import { applyOverrides, hasActiveOverrides, overrideWarning, type DraftOverrides } from "./overrides";
import { lockedMembers, runPickPhase } from "./picks";
import { poolPinch } from "./pinch";
import { simulateResponses } from "./responses";
import { bestCompletion, type SearchContext } from "./search";
import { enemyRoleOpenProbability } from "./timing";
import { whatWouldChange } from "./what-if";
import { explainWhyNot, type WhyNotComparison } from "./whynot";
import type { Candidate, CandidateSummary, EngineInput, RecommendationResult, TeamMember } from "./types";

export * from "./types";
export * from "./config";
export * from "./overrides";
export * from "./confidence";
export type { WhyNotComparison } from "./whynot";
export type { WhatIfTrigger } from "./what-if";
export type { PinchWarning } from "./pinch";
export type { EnemyResponse } from "./responses";
export type { ThreatEntry } from "../composition/threats";
export { estimateEnemyRoles } from "./enemy";
export { evaluateTeam, classifySeverity, assessRealism } from "./evaluate";
export { bestCompletion } from "./search";
export { recommendBans } from "./bans";
export { threatMap } from "../composition/threats";

interface EngineSetup {
  derived: DerivedDraft;
  enemyIds: string[];
  evalCtx: EvalContext;
  ctx: SearchContext;
  locked: TeamMember[];
  overrides: DraftOverrides | null;
}

/** Shared setup for every engine entry point: derived draft, enemy estimates, evaluation context. */
function setup(input: EngineInput, withOverrides = true): EngineSetup {
  const overrides = withOverrides && hasActiveOverrides(input.overrides) ? input.overrides! : null;
  const baseConfig = mergeEngineConfig(input.config);
  const applied = overrides ? applyOverrides(baseConfig, overrides) : null;
  const config = applied ? mergeEngineConfig({ ...input.config, ...applied.config }) : baseConfig;
  const derived = deriveDraft(input.draft);
  const enemyIds = derived.enemyPicks.map((p) => p.championId);
  const enemy = estimateEnemyRoles(enemyIds, input.champions, input.stats);
  const enemyProfile = enemyTeamProfile(enemyIds, input.champions);
  const evalCtx: EvalContext = {
    players: new Map(input.players.map((p) => [p.id, p])),
    champions: input.champions,
    stats: input.stats,
    config,
    enemy,
    enemyProfile,
    memo: new Map(),
    proficiency: input.proficiency ?? null,
    overrides: applied,
  };
  const ctx: SearchContext = { ...evalCtx, unavailable: derived.unavailableChampionIds };
  return { derived, enemyIds, evalCtx, ctx, locked: lockedMembers(derived), overrides };
}

/**
 * Entry point: what should UNIIVERSE do now?
 */
export function recommend(input: EngineInput): RecommendationResult {
  const started = Date.now();
  const { derived, enemyIds, evalCtx, ctx, locked, overrides } = setup(input);
  const enemyIdentity = enemyIds.length >= 2 ? compositionIdentity(evalCtx.enemyProfile).primary : null;
  const statsDescription = input.stats.describe();
  const enemyOpenRoles = ROLES.filter((r) => enemyRoleOpenProbability(evalCtx, r) > 0.5);

  const base: RecommendationResult = {
    step: derived.nextStep,
    kind: "complete",
    assignment: input.draft.assignments,
    roleSwap: null,
    primary: null,
    alternatives: [],
    bestFit: [],
    bestFitEvaluation: null,
    holds: [],
    needs: [],
    enemy: { roles: evalCtx.enemy, identity: enemyIdentity },
    stats: statsDescription,
    confidence: "none",
    decision: null,
    candidates: [],
    whatIf: [],
    threats: [],
    pinch: [],
    responses: [],
    enemyOpenRoles,
    overrides: { active: overrides, warning: null, unconstrainedScore: null },
    computeMs: 0,
  };

  const finish = (partial: Partial<RecommendationResult> & { kind: RecommendationResult["kind"] }): RecommendationResult => {
    const result: RecommendationResult = { ...base, ...partial };
    const evalConf = result.bestFitEvaluation?.confidence ?? 0;
    result.confidence = statsDescription.totalGames === 0 ? "none" : confidenceLabel(evalConf, statsDescription.totalGames);
    result.threats = threatsFor(result.bestFit, enemyIds, evalCtx);
    if (overrides && result.bestFit.length === 5 && !derived.isComplete) result.overrides = assessOverrideCost(input, result.bestFit, result.assignment, locked);
    result.computeMs = Date.now() - started;
    return result;
  };

  if (derived.isComplete) {
    const evaluation = evaluateTeam(locked, evalCtx);
    return finish({ kind: "complete", bestFit: locked.map((m) => ({ ...m, locked: true })), bestFitEvaluation: evaluation, needs: evaluation.needs });
  }

  const assignment = ensureAssignment(input, locked);

  if (!derived.ourTurn || !derived.nextStep) {
    const completion = bestCompletion(assignment, locked, ctx);
    return finish({
      kind: "enemy-turn",
      assignment,
      bestFit: completion.team.map((m) => ({ ...m, locked: locked.some((l) => l.championId === m.championId) })),
      bestFitEvaluation: completion.evaluation,
      needs: completion.evaluation.needs,
      pinch: poolPinch(input.players, assignment, derived, ctx),
    });
  }

  if (derived.nextStep.type === "ban") {
    const bans = recommendBans(input.players, assignment, derived, ctx);
    const completion = bestCompletion(assignment, locked, ctx);
    return finish({
      kind: "ban",
      assignment,
      primary: bans[0] ?? null,
      alternatives: bans.slice(1, 4),
      bestFit: completion.team.map((m) => ({ ...m, locked: locked.some((l) => l.championId === m.championId) })),
      bestFitEvaluation: completion.evaluation,
      needs: completion.evaluation.needs,
      decision: recommendationConfidence(bans.map((b) => b.score), statsDescription, completion.evaluation.confidence),
    });
  }

  const phase = runPickPhase(input.players, assignment, derived, derived.nextStep, ctx);
  const primaryCandidate = phase.candidates[0] ?? null;
  const scores = phase.primary?.kind === "pair" ? [phase.primary.score, ...phase.alternatives.map((a) => a.score)] : phase.candidates.map((c) => c.pickNowScore);
  return finish({
    kind: phase.primary?.kind === "pair" ? "pair" : "pick",
    assignment: phase.assignment,
    roleSwap: phase.roleSwap,
    primary: phase.primary,
    alternatives: phase.alternatives,
    bestFit: phase.bestFit,
    bestFitEvaluation: phase.bestFitEvaluation,
    holds: phase.holds,
    needs: phase.bestFitEvaluation?.needs ?? [],
    decision: recommendationConfidence(scores, statsDescription, phase.bestFitEvaluation?.confidence ?? 0),
    candidates: summarise(phase.candidates, 12),
    whatIf: whatWouldChange(topDistinct(phase.candidates), locked, evalCtx, enemyIds, enemyOpenRoles),
    responses: primaryCandidate ? simulateResponses(primaryCandidate, evalCtx, { enemyOpenRoles, limit: 4 }) : [],
    pinch: poolPinch(input.players, phase.assignment, derived, ctx),
  });
}

/**
 * "Why not X?" — compares the current recommendation with another legal candidate for the next
 * pick. Returns null when it is not our pick or the champion is not a legal option right now.
 */
export function whyNot(input: EngineInput, alternative: { championId: string; role?: Role | null }): WhyNotComparison | null {
  const { derived, evalCtx, ctx, locked } = setup(input);
  if (derived.isComplete || !derived.ourTurn || !derived.nextStep || derived.nextStep.type !== "pick") return null;
  const assignment = ensureAssignment(input, locked);
  const phase = runPickPhase(input.players, assignment, derived, derived.nextStep, ctx);
  const primary = phase.candidates[0];
  if (!primary) return null;
  // A requested role is honoured strictly (Jinx TOP is not Jinx ADC); without one, any open role matches.
  const alt = phase.candidates.find((c) => c.championId === alternative.championId && (!alternative.role || c.role === alternative.role));
  if (!alt) return null;
  if (alt === primary) {
    const second = phase.candidates[1];
    return second ? explainWhyNot(primary, second, evalCtx) : null;
  }
  return explainWhyNot(primary, alt, evalCtx);
}

function summarise(candidates: Candidate[], limit: number): CandidateSummary[] {
  return candidates.slice(0, limit).map((c, i) => ({ championId: c.championId, playerId: c.playerId, role: c.role, rank: i + 1, pickNowScore: c.pickNowScore, fitScore: c.fitScore, isFlex: c.isFlex, execution: c.execution.total }));
}

/** The top candidate and the best candidate that is a genuinely different choice (another champion). */
function topDistinct(candidates: Candidate[]): Candidate[] {
  const first = candidates[0];
  if (!first) return [];
  const second = candidates.find((c) => c.championId !== first.championId);
  return second ? [first, second] : [first];
}

function threatsFor(team: Array<TeamMember & { locked: boolean }>, enemyIds: string[], ctx: EvalContext): ThreatEntry[] {
  if (team.length === 0 || enemyIds.length === 0) return [];
  const ours = team.map((m) => ({ championId: m.championId, role: m.role, traits: ctx.champions.get(m.championId)?.profile.traits, name: ctx.champions.get(m.championId)?.name ?? m.championId })).filter((m): m is typeof m & { traits: NonNullable<typeof m.traits> } => !!m.traits);
  const theirs = enemyIds.map((id) => {
    const est = ctx.enemy.find((e) => e.championId === id);
    return { championId: id, role: est?.mostLikely ?? null, traits: ctx.champions.get(id)?.profile.traits, name: ctx.champions.get(id)?.name ?? id };
  }).filter((m): m is typeof m & { traits: NonNullable<typeof m.traits> } => !!m.traits);
  return threatMap(ours, theirs);
}

/** How much draft quality the overrides cost: the override-chosen team judged without tilts versus the unconstrained best. */
function assessOverrideCost(input: EngineInput, chosen: Array<TeamMember & { locked: boolean }>, assignment: Assignment, locked: TeamMember[]): RecommendationResult["overrides"] {
  const plain = setup(input, false);
  const unconstrained = bestCompletion(assignment, locked, plain.ctx);
  const chosenPlain = evaluateTeam(chosen.map(({ playerId, role, championId }) => ({ playerId, role, championId })), plain.evalCtx);
  return { active: input.overrides ?? null, warning: overrideWarning(chosenPlain.total, unconstrained.evaluation.total), unconstrainedScore: unconstrained.evaluation.total };
}

/** Falls back to a legal assignment when the stored one is inconsistent with the lineup. */
function ensureAssignment(input: EngineInput, locked: TeamMember[]): Assignment {
  const lockedRoles: Partial<Assignment> = {};
  for (const m of locked) lockedRoles[m.role] = m.playerId;
  const options = enumerateLegalAssignments(input.players, lockedRoles);
  const current = input.draft.assignments;
  const matches = options.find((o) => (Object.keys(o.assignment) as Array<keyof Assignment>).every((r) => o.assignment[r] === current[r]));
  if (matches) return current;
  return options[0]?.assignment ?? current;
}
