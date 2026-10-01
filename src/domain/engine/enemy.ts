import { ROLES, type Role } from "../roles";
import type { ChampionInfo, EnemyRoleEstimate, StatsProvider } from "./types";

/**
 * Estimates which role each revealed enemy champion will play.
 *
 * Each champion has a per-role likelihood (measured role share when there is data, otherwise the
 * curated prior). We then enumerate every injective assignment of the revealed champions to roles
 * and weight it by the product of likelihoods, which captures the constraint that two champions
 * cannot share a role: a Gragas next to a locked Sejuani is far less likely to be the jungler.
 */
export function estimateEnemyRoles(enemyChampionIds: string[], champions: Map<string, ChampionInfo>, stats: StatsProvider): EnemyRoleEstimate[] {
  const ids = enemyChampionIds.slice(0, 5);
  if (ids.length === 0) return [];
  const likelihood = ids.map((id) => roleLikelihoods(id, champions, stats));

  const totals = ids.map(() => ({ TOP: 0, JUNGLE: 0, MID: 0, ADC: 0, SUPPORT: 0 }) as Record<Role, number>);
  let totalWeight = 0;
  const used = new Set<Role>();
  const current: Role[] = [];

  const recurse = (i: number, weight: number) => {
    if (weight <= 0) return;
    if (i === ids.length) {
      totalWeight += weight;
      for (let k = 0; k < ids.length; k++) totals[k]![current[k]!] += weight;
      return;
    }
    for (const role of ROLES) {
      if (used.has(role)) continue;
      const w = likelihood[i]![role] ?? 0;
      if (w <= 0) continue;
      used.add(role);
      current[i] = role;
      recurse(i + 1, weight * w);
      used.delete(role);
    }
  };
  recurse(0, 1);

  return ids.map((id, k) => {
    const probabilities: Partial<Record<Role, number>> = {};
    let mostLikely: Role = "MID";
    let best = -1;
    for (const role of ROLES) {
      const p = totalWeight > 0 ? totals[k]![role] / totalWeight : likelihood[k]![role] ?? 0;
      if (p > 0.001) probabilities[role] = p;
      if (p > best) {
        best = p;
        mostLikely = role;
      }
    }
    const sorted = Object.values(probabilities).sort((a, b) => b - a);
    const isFlex = sorted.length > 1 && (sorted[1] ?? 0) >= 0.2;
    return { championId: id, probabilities, mostLikely, isFlex };
  });
}

function roleLikelihoods(championId: string, champions: Map<string, ChampionInfo>, stats: StatsProvider): Record<Role, number> {
  const out = { TOP: 0, JUNGLE: 0, MID: 0, ADC: 0, SUPPORT: 0 } as Record<Role, number>;
  const prior = champions.get(championId)?.profile.rolePrior ?? {};
  let measuredGames = 0;
  const measured: Record<Role, number> = { TOP: 0, JUNGLE: 0, MID: 0, ADC: 0, SUPPORT: 0 };
  for (const role of ROLES) {
    const r = stats.roleShare(championId, role);
    measured[role] = r.share;
    measuredGames = Math.max(measuredGames, r.games);
  }
  // Blend measured role share with the curated prior using a 200-game pseudo count.
  const k = 200;
  const trust = measuredGames / (measuredGames + k);
  for (const role of ROLES) {
    const p = prior[role] ?? 0;
    out[role] = trust * measured[role] + (1 - trust) * p;
    // Always leave a sliver of probability so off-role picks are not impossible.
    out[role] = Math.max(out[role], 0.01);
  }
  return out;
}

/** Probability-weighted enemy champion in a role. */
export function enemyInRole(estimates: EnemyRoleEstimate[], role: Role): Array<{ championId: string; probability: number }> {
  return estimates
    .map((e) => ({ championId: e.championId, probability: e.probabilities[role] ?? 0 }))
    .filter((x) => x.probability > 0.02)
    .sort((a, b) => b.probability - a.probability);
}
