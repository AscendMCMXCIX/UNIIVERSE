/*
  Generative world for the multikill fairness simulation (throwaway research code, not product code).

  A player-game: kills K ~ Poisson(mu * e), e ~ Gamma(4)/4 (carry or feed within the game), where
    mu = roleKills[role] * queuePace[q] * (D / Dq)^0.9 * lobbyPace * G_game * side * champVol * playerVol
  Kills are grouped into bursts: each next kill joins the current burst with probability
    c[s+1] * champConv * playerConv * queueConv (s = the burst's size so far, 5 the cap);
  a burst of size >= 2 is one multikill event of kind min(size, 5), each once at its largest.
  Because conversion compounds, a champion or player with better conversion makes relatively more
  of the rarer kinds (triple ~ conv^2, quadra ~ conv^3, penta ~ conv^4): the current model's
  "same tendency for every kind" is deliberately NOT true in this world.
*/

export const ROLES = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"] as const;
export type Role = (typeof ROLES)[number];
export const W = [2, 3, 4, 5] as const; // kill weights of double, triple, quadra, penta

export function makeRng(seed: number) {
  let s = seed | 0;
  const rnd = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() || 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const poisson = (l: number) => {
    if (l <= 0) return 0;
    if (l > 40) return Math.max(0, Math.round(l + Math.sqrt(l) * gauss()));
    const limit = Math.exp(-l);
    let k = 0;
    let p = 1;
    do {
      k += 1;
      p *= rnd();
    } while (p > limit);
    return k - 1;
  };
  // Marsaglia-Tsang, shape >= 1
  const gamma = (shape: number) => {
    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    for (;;) {
      let x: number, v: number;
      do {
        x = gauss();
        v = 1 + c * x;
      } while (v <= 0);
      v = v * v * v;
      const u = rnd();
      if (u < 1 - 0.0331 * x ** 4) return d * v;
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  };
  const pick = <T,>(items: readonly T[], weights: readonly number[]) => {
    let total = 0;
    for (const w of weights) total += w;
    let r = rnd() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i]!;
      if (r <= 0) return items[i]!;
    }
    return items[items.length - 1]!;
  };
  return { rnd, gauss, poisson, gamma, pick };
}
export type Rng = ReturnType<typeof makeRng>;

export interface Queue {
  id: number;
  group: "ranked" | "draft" | "quick" | "swift";
  pace: number;
  conv: number;
  dMean: number;
  dSd: number;
}
export const QUEUES: Queue[] = [
  { id: 420, group: "ranked", pace: 1.0, conv: 1.0, dMean: 30, dSd: 6 },
  { id: 440, group: "ranked", pace: 1.03, conv: 1.0, dMean: 30, dSd: 6 },
  { id: 700, group: "ranked", pace: 1.0, conv: 1.0, dMean: 31, dSd: 6 },
  { id: 400, group: "draft", pace: 1.06, conv: 1.0, dMean: 29, dSd: 6 },
  { id: 490, group: "quick", pace: 1.1, conv: 1.03, dMean: 27, dSd: 6 },
  { id: 430, group: "quick", pace: 1.1, conv: 1.03, dMean: 27, dSd: 6 },
  { id: 480, group: "swift", pace: 1.22, conv: 1.06, dMean: 21, dSd: 4 },
];
export const BASE_QUEUE_MIX = [0.45, 0.15, 0.03, 0.1, 0.1, 0.02, 0.15];

/** Kills per game for an average player in a ranked 30-minute game. */
export const ROLE_KILLS: Record<Role, number> = { TOP: 4.6, JUNGLE: 5.6, MID: 6.2, ADC: 6.9, SUPPORT: 1.9 };
/** Target multikill events per game (double, triple, quadra, penta) at the base mix, used to calibrate c. */
export const ROLE_TARGET: Record<Role, [number, number, number, number]> = {
  TOP: [0.38, 0.045, 0.006, 0.001],
  JUNGLE: [0.45, 0.055, 0.008, 0.0015],
  MID: [0.5, 0.067, 0.01, 0.002],
  ADC: [0.55, 0.085, 0.015, 0.0035],
  SUPPORT: [0.12, 0.01, 0.0012, 0.0002],
};

export interface Champion {
  id: string;
  roles: Role[];
  /** Share of its games on each of `roles`. */
  roleShare: number[];
  vol: number;
  conv: number;
  /** Pick weight. */
  pop: number;
  reset: boolean;
}

export interface World {
  champions: Champion[];
  byRole: Record<Role, { champs: Champion[]; weights: number[] }>;
  c: Record<Role, [number, number, number, number]>; // continuation c2..c5
}

/** Burst DP: expected events per kind for K kills and continuation vector c (c[0] = P(2nd joins), …). */
export function eventsGivenK(c: readonly number[], Kmax: number): number[][] {
  // V[n][s] = expected future events (4-vector) with n kills still to come and the current burst at size s (1..5)
  const V: number[][][] = [];
  const emit = (s: number) => {
    const e = [0, 0, 0, 0];
    if (s >= 2) e[Math.min(s, 5) - 2] = 1;
    return e;
  };
  V[0] = [];
  for (let s = 1; s <= 5; s++) V[0][s] = emit(s);
  for (let n = 1; n <= Kmax; n++) {
    V[n] = [];
    for (let s = 1; s <= 5; s++) {
      if (s === 5) {
        const e = emit(5);
        V[n]![s] = e.map((x, i) => x + V[n - 1]![1]![i]!);
      } else {
        const p = c[s - 1]!; // c index: s=1 -> c[0] = P(second kill joins)
        const stay = V[n - 1]![s + 1]!;
        const e = emit(s);
        const brk = V[n - 1]![1]!;
        V[n]![s] = stay.map((x, i) => p * x + (1 - p) * (e[i]! + brk[i]!));
      }
    }
  }
  const out: number[][] = [[0, 0, 0, 0]];
  for (let K = 1; K <= Kmax; K++) out[K] = V[K - 1]![1]!;
  return out;
}

export const convVector = (base: readonly number[], f: number) => base.map((x) => Math.min(0.92, x * f));

/** Sample one game's events for K kills. */
export function burstEvents(rng: Rng, K: number, c: readonly number[]): [number, number, number, number] {
  const e: [number, number, number, number] = [0, 0, 0, 0];
  if (K <= 0) return e;
  let s = 1;
  for (let i = 1; i < K; i++) {
    if (s < 5 && rng.rnd() < c[s - 1]!) s += 1;
    else {
      if (s >= 2) e[Math.min(s, 5) - 2]! += 1;
      s = 1;
    }
  }
  if (s >= 2) e[Math.min(s, 5) - 2]! += 1;
  return e;
}

export const pts = (e: readonly number[]) => 2 * e[0]! + 3 * e[1]! + 4 * e[2]! + 5 * e[3]!;

export function makeWorld(rng: Rng, opts: { nChamps?: number; volSd?: number; convSd?: number } = {}): World {
  const nChamps = opts.nChamps ?? 170;
  const volSd = opts.volSd ?? 0.22;
  const convSd = opts.convSd ?? 0.1;
  const champions: Champion[] = [];
  for (let i = 0; i < nChamps; i++) {
    const primary = ROLES[i % 5]!;
    const flex = rng.rnd() < 0.2;
    let second: Role = primary;
    while (flex && second === primary) second = ROLES[Math.floor(rng.rnd() * 5)]!;
    const z1 = rng.gauss();
    const z2 = 0.5 * z1 + Math.sqrt(1 - 0.25) * rng.gauss();
    const reset = rng.rnd() < 0.06;
    const vol = Math.exp(volSd * z1 - volSd ** 2 / 2) * (reset ? 1.25 : 1);
    const conv = Math.exp(convSd * z2 - convSd ** 2 / 2) * (reset ? 1.3 : 1);
    champions.push({ id: `C${i}`, roles: flex ? [primary, second] : [primary], roleShare: flex ? [0.7, 0.3] : [1], vol, conv, pop: 0, reset });
  }
  // popularity: Zipf(0.7) over a random order
  const order = champions.map((_, i) => i).sort(() => rng.rnd() - 0.5);
  order.forEach((ci, rank) => (champions[ci]!.pop = (rank + 1) ** -0.7));
  const byRole = {} as World["byRole"];
  for (const r of ROLES) {
    const champs: Champion[] = [];
    const weights: number[] = [];
    for (const ch of champions) {
      const k = ch.roles.indexOf(r);
      if (k >= 0) {
        champs.push(ch);
        weights.push(ch.pop * ch.roleShare[k]!);
      }
    }
    byRole[r] = { champs, weights };
  }
  const world: World = { champions, byRole, c: {} as World["c"] };
  calibrate(rng, world);
  return world;
}

/** Find each role's c2..c5 so that an average player at the base mix makes ROLE_TARGET's events (by DP over a sampled mix). */
function calibrate(rng: Rng, world: World) {
  for (const r of ROLES) {
    // sampled contexts for an average player of this role at the base queue mix
    const mus: number[] = [];
    const convs: number[] = [];
    for (let i = 0; i < 1500; i++) {
      const q = rng.pick(QUEUES, BASE_QUEUE_MIX);
      const D = Math.max(15, q.dMean + q.dSd * rng.gauss());
      const ch = rng.pick(world.byRole[r].champs, world.byRole[r].weights);
      const G = rng.gamma(8) / 8;
      const side = Math.exp(0.25 * rng.gauss());
      const e = rng.gamma(4) / 4;
      mus.push(ROLE_KILLS[r] * q.pace * (D / q.dMean) ** 0.9 * G * side * ch.vol * e);
      convs.push(q.conv * ch.conv);
    }
    let c = [0.12, 0.13, 0.15, 0.18];
    const target = ROLE_TARGET[r];
    for (let iter = 0; iter < 30; iter++) {
      const got = [0, 0, 0, 0];
      // group convs coarsely for speed
      for (let i = 0; i < mus.length; i += 3) {
        const tab = eventsGivenK(convVector(c, convs[i]!), 45);
        const pm = poissonPmf(mus[i]!, 45);
        for (let K = 1; K <= 45; K++) for (let k = 0; k < 4; k++) got[k]! += pm[K]! * tab[K]![k]!;
      }
      for (let k = 0; k < 4; k++) got[k]! /= Math.ceil(mus.length / 3);
      // adjust: doubles+ depend on c2 mostly; ratio of successive kinds on c3..c5
      const tail = (v: number[], k: number) => v.slice(k).reduce((a, b) => a + b, 0);
      const next = [...c];
      next[0] = c[0]! * (tail(target, 0) / tail(got, 0)) ** 0.8;
      for (let k = 1; k < 4; k++) next[k] = c[k]! * ((tail(target, k) / tail(target, k - 1)) / (tail(got, k) / tail(got, k - 1))) ** 0.8;
      c = next.map((x) => Math.min(0.8, Math.max(0.01, x)));
    }
    world.c[r] = c as [number, number, number, number];
  }
}

export function poissonPmf(mu: number, Kmax: number): number[] {
  const out = new Array(Kmax + 1).fill(0);
  let p = Math.exp(-mu);
  out[0] = p;
  for (let k = 1; k <= Kmax; k++) {
    p = (p * mu) / k;
    out[k] = p;
  }
  return out;
}
