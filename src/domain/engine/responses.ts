import { ROLES, ROLE_LABELS, type Role } from "../roles";
import type { EvalContext } from "./evaluate";
import type { Candidate } from "./types";
import { formatDelta } from "./util";

export interface EnemyResponse {
  championId: string;
  role: Role;
  /** Expected lane delta from THEIR perspective (positive = good for them). */
  edge: number;
  likelihood: number;
  text: string;
}

/**
 * "If we pick this, what are their strongest plausible responses?" — for each open enemy role,
 * rank likely champions (meta share, scouted likely picks when provided) by how well they do into
 * the candidate. Honest about uncertainty: returns likelihoods, not predictions.
 */
export function simulateResponses(candidate: Candidate, ctx: EvalContext, options: { enemyOpenRoles: Role[]; scoutedPicks?: Array<{ championId: string; role: Role; weight: number }>; limit?: number } = { enemyOpenRoles: ROLES.slice() }): EnemyResponse[] {
  const out: EnemyResponse[] = [];
  const ours = ctx.stats.strength(candidate.championId, candidate.role).estimate;
  for (const role of options.enemyOpenRoles) {
    const pool = new Map<string, number>();
    for (const c of ctx.stats.topChampionsInRole(role, 12)) pool.set(c, ctx.stats.presence(c).pickRate || 0.02);
    for (const s of options.scoutedPicks ?? []) if (s.role === role) pool.set(s.championId, (pool.get(s.championId) ?? 0) + s.weight * 0.3);
    for (const [championId, likelihood] of pool) {
      if (ctx.champions.get(championId) === undefined) continue;
      const theirs = ctx.stats.strength(championId, role).estimate;
      const expected = Math.max(0.3, Math.min(0.7, 0.5 + (ours - 0.5) - (theirs - 0.5)));
      const mu = ctx.stats.matchup(candidate.championId, candidate.role, championId, role, expected);
      const edge = -(mu.estimate - 0.5);
      if (role === candidate.role ? edge >= 0.02 : edge >= 0.03) {
        out.push({ championId, role, edge, likelihood, text: `${ctx.champions.get(championId)?.name} ${ROLE_LABELS[role]} (${formatDelta(-edge)} for us${role === candidate.role ? ", lane" : ""})` });
      }
    }
  }
  return out.sort((a, b) => b.edge * (0.5 + b.likelihood) - a.edge * (0.5 + a.likelihood)).slice(0, options.limit ?? 4);
}
