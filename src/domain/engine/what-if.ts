import type { Identity } from "../composition";
import type { Role } from "../roles";
import type { EvalContext } from "./evaluate";
import { enemyTeamProfile, evaluateTeam } from "./evaluate";
import { estimateEnemyRoles } from "./enemy";
import type { Candidate, TeamMember } from "./types";

export interface WhatIfTrigger {
  archetype: string;
  exampleChampionId: string;
  role: Role;
  /** Which candidate becomes preferred if that reveal happens. */
  favours: { championId: string; role: Role } | null;
  text: string;
}

const ARCHETYPES: Array<{ key: string; label: string; pick: (traits: Record<string, number>) => boolean }> = [
  { key: "disengage", label: "heavy disengage", pick: (t) => t.counterEngage! >= 3 },
  { key: "engage", label: "hard engage", pick: (t) => t.engage! >= 3 },
  { key: "dive", label: "a dive assassin", pick: (t) => t.dive! >= 3 && t.burst! >= 3 },
  { key: "poke", label: "long-range poke", pick: (t) => t.poke! >= 3 },
  { key: "hypercarry", label: "a scaling hypercarry", pick: (t) => t.scaling! >= 3 && t.sustainedDps! >= 3 },
  { key: "tank", label: "a hard frontline", pick: (t) => t.frontline! >= 3 },
];

/**
 * "What would change this?" — simulates plausible next reveals (one representative champion per
 * archetype in the enemy's most likely open role) and reports when the ranking between the top
 * candidates flips. Keeps the team aware of what information is still missing.
 */
export function whatWouldChange(top: Candidate[], locked: TeamMember[], ctx: EvalContext, enemyRevealed: string[], enemyOpenRoles: Role[], limit = 3): WhatIfTrigger[] {
  if (top.length < 2 || enemyOpenRoles.length === 0) return [];
  const [a, b] = [top[0]!, top[1]!];
  const out: WhatIfTrigger[] = [];
  const identityOf = (e: ReturnType<typeof evaluateTeam>): Identity | null => e.identity;
  for (const arch of ARCHETYPES) {
    // Representative: the most played champion matching the archetype in any open enemy role.
    let rep: { championId: string; role: Role } | null = null;
    for (const role of enemyOpenRoles) {
      for (const c of ctx.stats.topChampionsInRole(role, 25)) {
        const t = ctx.champions.get(c)?.profile.traits;
        if (t && arch.pick(t as unknown as Record<string, number>) && !enemyRevealed.includes(c)) {
          rep = { championId: c, role };
          break;
        }
      }
      if (rep) break;
    }
    if (!rep) continue;
    const hypothetical = [...enemyRevealed, rep.championId];
    const enemy = estimateEnemyRoles(hypothetical, ctx.champions, ctx.stats);
    const hctx: EvalContext = { ...ctx, enemy, enemyProfile: enemyTeamProfile(hypothetical, ctx.champions), memo: new Map() };
    const teamA = [...locked, { playerId: a.playerId, role: a.role, championId: a.championId }];
    const teamB = [...locked, { playerId: b.playerId, role: b.role, championId: b.championId }];
    const ea = evaluateTeam(teamA, hctx);
    const eb = evaluateTeam(teamB, hctx);
    const now = a.fitScore - b.fitScore;
    const then = ea.total - eb.total;
    if (now >= 0 && then < -0.004) {
      out.push({ archetype: arch.key, exampleChampionId: rep.championId, role: rep.role, favours: { championId: b.championId, role: b.role }, text: `If they reveal ${arch.label} next (e.g. ${ctx.champions.get(rep.championId)?.name}), ${ctx.champions.get(b.championId)?.name} becomes more attractive${identityOf(eb) ? ` (${identityOf(eb)} shape)` : ""}.` });
    } else if (then - now > 0.012) {
      out.push({ archetype: arch.key, exampleChampionId: rep.championId, role: rep.role, favours: { championId: a.championId, role: a.role }, text: `${arch.label[0]!.toUpperCase()}${arch.label.slice(1)} from them would make ${ctx.champions.get(a.championId)?.name} even better.` });
    }
    if (out.length >= limit) break;
  }
  return out;
}
