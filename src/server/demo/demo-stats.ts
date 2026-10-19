import { curatedChampionIds, getChampionProfile } from "@/domain/champion-model";
import { ROLES, type Role } from "@/domain/roles";

/**
 * Deterministic synthetic statistics for demo mode. Clearly labelled `source = "demo"` in the
 * database and `isDemo` in the statistics description; never mixed with real data once real data exists.
 *
 * The numbers are *plausible* (derived from curated characteristics with seeded noise) so the
 * statistics pages can be exercised end to end, but they are not evidence about the real game.
 */
export interface DemoStats {
  roleStats: Array<{ championId: string; role: Role; games: number; wins: number }>;
  bans: Array<{ championId: string; bans: number }>;
  matchups: Array<{ championId: string; role: Role; enemyChampionId: string; enemyRole: Role; games: number; wins: number }>;
  synergies: Array<{ championAId: string; roleA: Role; championBId: string; roleB: Role; games: number; wins: number }>;
  pro: Array<{ championId: string; role: Role; picks: number; bans: number }>;
  totalGames: number;
  proGames: number;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KEY_PAIRS: Array<[Role, Role]> = [
  ["TOP", "JUNGLE"],
  ["JUNGLE", "MID"],
  ["ADC", "SUPPORT"],
  ["MID", "SUPPORT"],
  ["JUNGLE", "SUPPORT"],
];

export function generateDemoStats(seed = 20251001): DemoStats {
  const rnd = mulberry32(seed);
  const ids = curatedChampionIds();
  const totalGames = 40_000;
  const roleStats: DemoStats["roleStats"] = [];
  const bans: DemoStats["bans"] = [];
  const perRole = new Map<Role, Array<{ id: string; games: number; wr: number }>>();
  for (const role of ROLES) perRole.set(role, []);

  for (const id of ids) {
    const profile = getChampionProfile(id);
    const popularity = 0.4 + rnd() * 1.2; // some champions are simply more played
    const baseWr = 0.485 + rnd() * 0.04 + (profile.traits.scaling >= 3 ? 0.004 : 0) + (profile.traits.earlyGame >= 3 ? 0.003 : 0);
    for (const [role, weight] of Object.entries(profile.rolePrior) as Array<[Role, number]>) {
      if (weight <= 0) continue;
      const games = Math.max(30, Math.round(weight * popularity * totalGames * 0.05));
      const wr = Math.min(0.56, Math.max(0.44, baseWr + (rnd() - 0.5) * 0.02));
      roleStats.push({ championId: id, role, games, wins: Math.round(games * wr) });
      perRole.get(role)!.push({ id, games, wr });
    }
    const banShare = Math.max(0, (popularity - 0.9) * 0.35 + (baseWr - 0.5) * 2 + (rnd() - 0.6) * 0.1);
    if (banShare > 0.01) bans.push({ championId: id, bans: Math.round(banShare * totalGames) });
  }

  // Matchups within a role among the most-played champions.
  const matchups: DemoStats["matchups"] = [];
  for (const role of ROLES) {
    const top = perRole.get(role)!.sort((a, b) => b.games - a.games).slice(0, 18);
    for (let i = 0; i < top.length; i++) {
      for (let j = 0; j < top.length; j++) {
        if (i === j) continue;
        const a = getChampionProfile(top[i]!.id).traits;
        const b = getChampionProfile(top[j]!.id).traits;
        // Trait-driven tendencies: range vs melee early, early vs scaling, mobility vs CC.
        let bias = 0;
        bias += (a.range - b.range) * 0.006;
        bias += (a.earlyGame - b.earlyGame) * 0.004;
        bias += (a.mobility - b.reliableCC) * 0.002;
        bias += (a.sustainedDps - b.frontline) * 0.0015;
        bias += (rnd() - 0.5) * 0.05;
        const games = Math.round(40 + rnd() * 360);
        const wr = Math.min(0.62, Math.max(0.38, 0.5 + (top[i]!.wr - top[j]!.wr) + bias));
        matchups.push({ championId: top[i]!.id, role, enemyChampionId: top[j]!.id, enemyRole: role, games, wins: Math.round(games * wr) });
      }
    }
  }

  // Synergies for key pairings among the most-played champions.
  const synergies: DemoStats["synergies"] = [];
  for (const [ra, rb] of KEY_PAIRS) {
    const as = perRole.get(ra)!.slice(0, 14);
    const bs = perRole.get(rb)!.slice(0, 14);
    for (const a of as) {
      for (const b of bs) {
        if (a.id === b.id) continue;
        const ta = getChampionProfile(a.id).traits;
        const tb = getChampionProfile(b.id).traits;
        let bias = 0;
        if (ta.engage >= 2 && tb.dive >= 2) bias += 0.012;
        if (ta.dive >= 2 && tb.engage >= 2) bias += 0.012;
        if ((ta.sustainedDps >= 3 && tb.peel >= 2) || (tb.sustainedDps >= 3 && ta.peel >= 2)) bias += 0.012;
        if (ta.poke >= 2 && tb.counterEngage >= 2) bias += 0.008;
        if (ta.burst >= 3 && tb.reliableCC >= 2) bias += 0.008;
        if (ta.dive >= 3 && tb.poke >= 3) bias -= 0.01;
        bias += (rnd() - 0.5) * 0.03;
        const games = Math.round(30 + rnd() * 300);
        const wr = Math.min(0.6, Math.max(0.4, 0.5 + (a.wr - 0.5) + (b.wr - 0.5) + bias));
        synergies.push({ championAId: a.id, roleA: ra, championBId: b.id, roleB: rb, games, wins: Math.round(games * wr) });
      }
    }
  }

  // Pro presence: roughly the contested champions.
  const proGames = 240;
  const pro: DemoStats["pro"] = [];
  for (const role of ROLES) {
    const top = perRole.get(role)!.slice(0, 10);
    for (const c of top) {
      const picks = Math.round(rnd() * 60);
      const banCount = Math.round(rnd() * 50 * (bans.find((b) => b.championId === c.id) ? 1.5 : 0.5));
      if (picks + banCount > 8) pro.push({ championId: c.id, role, picks, bans: banCount });
    }
  }

  return { roleStats, bans, matchups, synergies, pro, totalGames, proGames };
}
