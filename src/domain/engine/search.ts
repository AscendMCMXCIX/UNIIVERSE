import { ROLES, type Role } from "../roles";
import type { Assignment } from "../roster/assignments";
import { eligibleChampions } from "../roster/eligibility";
import { evaluateTeam, type EvalContext } from "./evaluate";
import type { TeamEvaluation, TeamMember } from "./types";

export interface SearchContext extends EvalContext {
  unavailable: ReadonlySet<string>;
}

export interface CompletionResult {
  team: TeamMember[];
  evaluation: TeamEvaluation;
  /** Roles that could not be filled from the assigned player's eligible pool. */
  unfillable: Role[];
}

/**
 * Finds the strongest complete team reachable from the locked picks under a given player→role
 * assignment, using only champions each assigned player has configured for that role.
 *
 * Exhaustive when the candidate product is small, beam search otherwise. All evaluations are
 * memoised in the context so repeated searches across candidates stay fast.
 */
export function bestCompletion(assignment: Assignment, locked: TeamMember[], ctx: SearchContext, excluded: ReadonlySet<string> = new Set()): CompletionResult {
  const lockedRoles = new Set(locked.map((m) => m.role));
  const taken = new Set<string>([...ctx.unavailable, ...excluded, ...locked.map((m) => m.championId)]);
  const openRoles = ROLES.filter((r) => !lockedRoles.has(r));

  const slots: Array<{ role: Role; playerId: string; candidates: string[] }> = [];
  const unfillable: Role[] = [];
  for (const role of openRoles) {
    const playerId = assignment[role];
    const player = ctx.players.get(playerId);
    const candidates = player ? eligibleChampions(player, role, { unavailableChampionIds: taken }) : [];
    if (candidates.length === 0) unfillable.push(role);
    else slots.push({ role, playerId, candidates });
  }
  // Fewest options first keeps the beam focused and the exhaustive loop tight.
  slots.sort((a, b) => a.candidates.length - b.candidates.length);

  const product = slots.reduce((p, s) => p * s.candidates.length, 1);
  let best: { team: TeamMember[]; evaluation: TeamEvaluation } | null = null;

  if (product <= ctx.config.search.maxExhaustive) {
    const current: TeamMember[] = [...locked];
    const used = new Set<string>(locked.map((m) => m.championId));
    const recurse = (i: number) => {
      if (i === slots.length) {
        const evaluation = evaluateTeam(current, ctx);
        if (!best || evaluation.total > best.evaluation.total) best = { team: [...current], evaluation };
        return;
      }
      const slot = slots[i]!;
      for (const c of slot.candidates) {
        if (used.has(c)) continue;
        used.add(c);
        current.push({ playerId: slot.playerId, role: slot.role, championId: c });
        recurse(i + 1);
        current.pop();
        used.delete(c);
      }
    };
    recurse(0);
  } else {
    let beam: Array<{ team: TeamMember[]; evaluation: TeamEvaluation }> = [{ team: [...locked], evaluation: evaluateTeam(locked, ctx) }];
    for (const slot of slots) {
      const next: Array<{ team: TeamMember[]; evaluation: TeamEvaluation }> = [];
      for (const b of beam) {
        const used = new Set(b.team.map((m) => m.championId));
        for (const c of slot.candidates) {
          if (used.has(c)) continue;
          const team = [...b.team, { playerId: slot.playerId, role: slot.role, championId: c }];
          next.push({ team, evaluation: evaluateTeam(team, ctx) });
        }
      }
      next.sort((a, b) => b.evaluation.total - a.evaluation.total);
      beam = next.slice(0, ctx.config.search.beamWidth);
      if (beam.length === 0) break;
    }
    best = beam[0] ?? null;
  }

  if (!best) {
    const evaluation = evaluateTeam(locked, ctx);
    return { team: [...locked], evaluation, unfillable };
  }
  const finalBest: { team: TeamMember[]; evaluation: TeamEvaluation } = best;
  return { team: finalBest.team, evaluation: finalBest.evaluation, unfillable };
}
