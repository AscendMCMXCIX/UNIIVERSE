/**
 * Development only: a seeded simulation of global ranked games at production scale, aggregated
 * exactly like `src/server/ingestion/aggregate.ts` does (role stats, every ally pair, every
 * cross-team pair, bans as "share of games"). It gives the engine benchmark realistic sparsity
 * (most lane and pair samples are a handful of games) without production data, and a known
 * ground truth. Results from it are synthetic and are always labelled so.
 */
import { ROLES, type Role } from "@/domain/roles";
import type { ChampionInfo } from "@/domain/engine";
import type { MemoryStatsData } from "@/domain/engine/memory-stats";

/** Mulberry32: tiny, fast, deterministic. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(r: () => number): number {
  const u = Math.max(1e-12, r());
  const v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export interface SimTruth {
  /** True logit strength per champion|role. */
  strength: Map<string, number>;
  /** True extra logit for champion|role vs enemy|role in the same lane (from the first one's side). */
  lane: Map<string, number>;
  /** True extra logit for an ally pair (canonical champion order). */
  synergy: Map<string, number>;
}

export interface SimOptions {
  seed?: number;
  games?: number;
  patch?: string;
}

/**
 * Simulates `games` ranked games: each role is filled from that role's popularity distribution
 * (curated role priors × a long-tailed popularity), outcomes follow a logistic model of true
 * champion strength, sparse lane matchup effects and sparse ally-pair effects, and ten bans per
 * game are drawn from popularity × strength.
 */
export function simulateRanked(champions: Map<string, ChampionInfo>, options: SimOptions = {}): { data: MemoryStatsData; truth: SimTruth } {
  const r = rng(options.seed ?? 20261015);
  const games = options.games ?? 6000;
  const patch = options.patch ?? "16.20";
  const ids = [...champions.keys()].sort();
  const popularity = new Map<string, number>();
  ids.forEach((id) => popularity.set(id, Math.exp(gaussian(r) * 0.9)));

  const truth: SimTruth = { strength: new Map(), lane: new Map(), synergy: new Map() };
  const roleWeights = new Map<Role, Array<{ id: string; w: number }>>();
  for (const role of ROLES) {
    const list: Array<{ id: string; w: number }> = [];
    for (const id of ids) {
      const prior = champions.get(id)?.profile.rolePrior[role] ?? 0;
      if (prior < 0.15) continue;
      list.push({ id, w: prior * prior * popularity.get(id)! });
      truth.strength.set(`${id}|${role}`, gaussian(r) * 0.08);
    }
    roleWeights.set(role, list);
  }
  const laneEffect = (a: string, b: string, role: Role): number => {
    const key = a < b ? `${a}|${b}|${role}` : `${b}|${a}|${role}`;
    let v = truth.lane.get(key);
    if (v === undefined) {
      v = r() < 0.35 ? gaussian(r) * 0.18 : 0;
      truth.lane.set(key, v);
    }
    return a < b ? v : -v;
  };
  const synergyEffect = (a: string, ra: Role, b: string, rb: Role): number => {
    const key = a < b ? `${a}|${ra}|${b}|${rb}` : `${b}|${rb}|${a}|${ra}`;
    let v = truth.synergy.get(key);
    if (v === undefined) {
      v = r() < 0.15 ? gaussian(r) * 0.1 : 0;
      truth.synergy.set(key, v);
    }
    return v;
  };
  const draw = (list: Array<{ id: string; w: number }>, used: Set<string>): string => {
    const total = list.reduce((s, x) => s + (used.has(x.id) ? 0 : x.w), 0);
    let t = r() * total;
    for (const x of list) {
      if (used.has(x.id)) continue;
      t -= x.w;
      if (t <= 0) return x.id;
    }
    return list.find((x) => !used.has(x.id))!.id;
  };
  const banList = ids.map((id) => ({ id, w: popularity.get(id)! * Math.exp(Math.max(...ROLES.map((role) => truth.strength.get(`${id}|${role}`) ?? -1)) * 6) }));

  const role = new Map<string, { games: number; wins: number }>();
  const matchups = new Map<string, { games: number; wins: number }>();
  const synergies = new Map<string, { games: number; wins: number }>();
  const bans = new Map<string, number>();
  const bump = (m: Map<string, { games: number; wins: number }>, k: string, win: boolean) => {
    const c = m.get(k) ?? { games: 0, wins: 0 };
    c.games += 1;
    if (win) c.wins += 1;
    m.set(k, c);
  };

  for (let g = 0; g < games; g++) {
    const used = new Set<string>();
    const gameBans: string[] = [];
    for (let b = 0; b < 10; b++) {
      const id = draw(banList, used);
      used.add(id);
      gameBans.push(id);
    }
    const teams: Array<Array<{ championId: string; role: Role }>> = [[], []];
    for (const side of [0, 1]) {
      for (const ro of ROLES) {
        const id = draw(roleWeights.get(ro)!, used);
        used.add(id);
        teams[side]!.push({ championId: id, role: ro });
      }
    }
    let logit = 0;
    for (const [side, sign] of [[0, 1], [1, -1]] as const) {
      const t = teams[side]!;
      for (const m of t) logit += sign * (truth.strength.get(`${m.championId}|${m.role}`) ?? 0);
      for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) logit += sign * synergyEffect(t[i]!.championId, t[i]!.role, t[j]!.championId, t[j]!.role);
    }
    for (const ro of ROLES) {
      const a = teams[0]!.find((m) => m.role === ro)!;
      const b = teams[1]!.find((m) => m.role === ro)!;
      logit += laneEffect(a.championId, b.championId, ro);
    }
    const blueWins = r() < 1 / (1 + Math.exp(-logit));
    for (const b of new Set(gameBans)) bans.set(b, (bans.get(b) ?? 0) + 1);
    teams.forEach((t, side) => {
      const win = side === 0 ? blueWins : !blueWins;
      for (const m of t) bump(role, `${m.championId}|${m.role}`, win);
      for (let i = 0; i < t.length; i++) {
        for (let j = i + 1; j < t.length; j++) {
          const [x, y] = t[i]!.championId < t[j]!.championId ? [t[i]!, t[j]!] : [t[j]!, t[i]!];
          bump(synergies, `${x.championId}|${x.role}|${y.championId}|${y.role}`, win);
        }
      }
      const theirs = teams[1 - side]!;
      for (const m of t) for (const e of theirs) bump(matchups, `${m.championId}|${m.role}|${e.championId}|${e.role}`, win);
    });
  }

  // The provider is built from rows seen at least twice (MIN_PAIR_GAMES in the loader).
  const data: MemoryStatsData = {
    patch,
    sources: ["ranked"],
    totalGames: games,
    proGames: 0,
    roleStats: [...role.entries()].map(([k, v]) => {
      const [championId, ro] = k.split("|") as [string, Role];
      return { championId, role: ro, games: v.games, wins: v.wins };
    }),
    bans: [...bans.entries()].map(([championId, n]) => ({ championId, bans: n })),
    matchups: [...matchups.entries()]
      .filter(([, v]) => v.games >= 2)
      .map(([k, v]) => {
        const [championId, ro, enemyChampionId, enemyRole] = k.split("|") as [string, Role, string, Role];
        return { championId, role: ro, enemyChampionId, enemyRole, games: v.games, wins: v.wins };
      }),
    synergies: [...synergies.entries()]
      .filter(([, v]) => v.games >= 2)
      .map(([k, v]) => {
        const [championAId, roleA, championBId, roleB] = k.split("|") as [string, Role, string, Role];
        return { championAId, roleA, championBId, roleB, games: v.games, wins: v.wins };
      }),
    pro: [],
  };
  return { data, truth };
}
