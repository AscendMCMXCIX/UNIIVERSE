import { compositionIdentity } from "../composition";
import { deriveDraft } from "../draft";
import { enumerateLegalAssignments, type Assignment } from "../roster/assignments";
import { confidenceLabel } from "../stats";
import { recommendBans } from "./bans";
import { mergeEngineConfig } from "./config";
import { estimateEnemyRoles } from "./enemy";
import { enemyTeamProfile, evaluateTeam, type EvalContext } from "./evaluate";
import { lockedMembers, runPickPhase } from "./picks";
import { bestCompletion, type SearchContext } from "./search";
import type { EngineInput, RecommendationResult } from "./types";

export * from "./types";
export * from "./config";
export { estimateEnemyRoles } from "./enemy";
export { evaluateTeam, classifySeverity } from "./evaluate";
export { bestCompletion } from "./search";
export { recommendBans } from "./bans";

/**
 * Entry point: what should UNIIVERSE do now?
 */
export function recommend(input: EngineInput): RecommendationResult {
  const started = Date.now();
  const config = mergeEngineConfig(input.config);
  const derived = deriveDraft(input.draft);
  const enemyIds = derived.enemyPicks.map((p) => p.championId);
  const enemy = estimateEnemyRoles(enemyIds, input.champions, input.stats);
  const enemyProfile = enemyTeamProfile(enemyIds, input.champions);
  const enemyIdentity = enemyIds.length >= 2 ? compositionIdentity(enemyProfile).primary : null;

  const evalCtx: EvalContext = {
    players: new Map(input.players.map((p) => [p.id, p])),
    champions: input.champions,
    stats: input.stats,
    config,
    enemy,
    enemyProfile,
    memo: new Map(),
    proficiency: input.proficiency ?? null,
  };
  const ctx: SearchContext = { ...evalCtx, unavailable: derived.unavailableChampionIds };
  const statsDescription = input.stats.describe();
  const locked = lockedMembers(derived);

  const base = {
    step: derived.nextStep,
    assignment: input.draft.assignments,
    roleSwap: null,
    primary: null,
    alternatives: [],
    bestFit: [],
    bestFitEvaluation: null,
    holds: [],
    needs: [],
    enemy: { roles: enemy, identity: enemyIdentity },
    stats: statsDescription,
    confidence: "none" as const,
    computeMs: 0,
  };

  const finish = (partial: Partial<RecommendationResult> & { kind: RecommendationResult["kind"] }): RecommendationResult => {
    const result: RecommendationResult = { ...base, ...partial, computeMs: Date.now() - started };
    const evalConf = result.bestFitEvaluation?.confidence ?? 0;
    result.confidence = statsDescription.totalGames === 0 ? "none" : confidenceLabel(evalConf, statsDescription.totalGames);
    return result;
  };

  if (derived.isComplete) {
    const evaluation = evaluateTeam(locked, evalCtx);
    return finish({ kind: "complete", bestFit: locked.map((m) => ({ ...m, locked: true })), bestFitEvaluation: evaluation, needs: evaluation.needs });
  }

  const assignment = ensureAssignment(input, derived.unavailableChampionIds, locked);

  if (!derived.ourTurn || !derived.nextStep) {
    const completion = bestCompletion(assignment, locked, ctx);
    return finish({
      kind: "enemy-turn",
      assignment,
      bestFit: completion.team.map((m) => ({ ...m, locked: locked.some((l) => l.championId === m.championId) })),
      bestFitEvaluation: completion.evaluation,
      needs: completion.evaluation.needs,
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
    });
  }

  const phase = runPickPhase(input.players, assignment, derived, derived.nextStep, ctx);
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
  });
}

/** Falls back to a legal assignment when the stored one is inconsistent with the lineup. */
function ensureAssignment(input: EngineInput, _unavailable: ReadonlySet<string>, locked: ReturnType<typeof lockedMembers>): Assignment {
  const lockedRoles: Partial<Assignment> = {};
  for (const m of locked) lockedRoles[m.role] = m.playerId;
  const options = enumerateLegalAssignments(input.players, lockedRoles);
  const current = input.draft.assignments;
  const matches = options.find((o) => (Object.keys(o.assignment) as Array<keyof Assignment>).every((r) => o.assignment[r] === current[r]));
  if (matches) return current;
  return options[0]?.assignment ?? current;
}
