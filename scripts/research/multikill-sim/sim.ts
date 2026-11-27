/*
  Multikill fairness simulation (seeded), the evidence behind docs/TEAM_LEADERBOARDS.md "Fairness
  evaluation, 27 Nov 2026" and the step its decision rule asks for before any formula change (R2.4:
  re-run with the production audit's own figures). Research code, run by hand, never by the app or
  CI; it imports the real production functions (buildMultikillBaseline, expectedRates, scoreMember)
  for M0 and asserts its M0 equals scoreMember.

  Run from the repository root:
    pnpm exec tsx scripts/research/multikill-sim/sim.ts [boards] [scenario,...]
  e.g. `... sim.ts 500 S1,S10` (about 100 s a scenario at 500 boards). A calibrated scenario "CAL"
  is added from MULTIKILL_SIM_CALIBRATED, a JSON object of Scenario fields read from the audit
  (lobbySd from environment.tauBeyondNoise, swiftHeavy from the fast-queue share, gamesMin/gamesMax
  and members from the board), e.g. MULTIKILL_SIM_CALIBRATED='{"lobbySd":0.06,"gamesMin":40}'.
  Output: results-<boards>[-<scenarios>].json beside this file (not committed) and a printed table;
  summarise.mjs prints the comparison tables from those files.
*/
import { buildMultikillBaseline, expectedRates, scoreMember, type BaselineRow, type MultikillBaseline } from "../../../src/domain/multikill-score";
import { BASE_QUEUE_MIX, QUEUES, ROLES, ROLE_KILLS, burstEvents, convVector, eventsGivenK, makeRng, makeWorld, pts, type Champion, type Queue, type Rng, type Role, type World } from "./lib";
import { writeFileSync } from "node:fs";

const SEPARATE_EVIDENCE = { withTriple: 400, outOfOrder: 250 };
type K4 = [number, number, number, number];

interface Scenario {
  key: string;
  label: string;
  tau: number; // members' true skill spread (log SD of the combined effect, approx)
  volShare: number; // share of the skill's log-variance in kill volume (rest in conversion)
  lobbySd: number; // members' lobby pace spread (elo / environment, not skill)
  swiftHeavy: number; // share of members who play 75% Swiftplay
  skillChampCorr: number; // > 0: better multikillers favour high-propensity champions
  gamesMin: number;
  gamesMax: number;
  members: number;
  poolTarget: number;
  convSd?: number;
  /** > 0: a member's skill takes multikills from the others in the game (opponents' kill volume x theta^-interaction, allies' x theta^-(interaction/3)). */
  interaction?: number;
  /** Every game Ranked Solo/Duo (no queue mix at all). */
  soloOnly?: boolean;
}

const BASE: Scenario = { key: "S1", label: "realistic (tau 0.15)", tau: 0.15, volShare: 0.6, lobbySd: 0.08, swiftHeavy: 0.2, skillChampCorr: 0, gamesMin: 10, gamesMax: 600, members: 9, poolTarget: 21700 };
const SCENARIOS: Scenario[] = [
  BASE,
  { ...BASE, key: "S0", label: "equal skill (tau 0)", tau: 0 },
  { ...BASE, key: "S2", label: "members close (tau 0.08)", tau: 0.08 },
  { ...BASE, key: "S3", label: "members far apart (tau 0.25)", tau: 0.25 },
  { ...BASE, key: "S4", label: "good multikillers pick high-propensity champions", skillChampCorr: 1 },
  { ...BASE, key: "S5", label: "strong queue mix (40% of members 75% Swiftplay)", swiftHeavy: 0.4 },
  { ...BASE, key: "S6", label: "lobby pace differs (elo, sd 0.18)", lobbySd: 0.18 },
  { ...BASE, key: "S7v", label: "skill is kill volume only", volShare: 1 },
  { ...BASE, key: "S7c", label: "skill is conversion only", volShare: 0 },
  { ...BASE, key: "S8", label: "strong champion spread (vol sd 0.35, conv sd 0.18)", convSd: 0.18 },
  { ...BASE, key: "S9", label: "a member's skill takes kills from the others in the game", interaction: 0.6 },
  { ...BASE, key: "S11", label: "no environment differences (one queue, one lobby pace)", lobbySd: 0, swiftHeavy: 0, soloOnly: true },
  { ...BASE, key: "S11b", label: "no environment differences, members close (tau 0.08)", tau: 0.08, lobbySd: 0, swiftHeavy: 0, soloOnly: true },
  { ...BASE, key: "S10", label: "production-like: 9 members, 40-800 games, lobby sd 0.12, swift-heavy 25%", gamesMin: 40, gamesMax: 800, lobbySd: 0.12, swiftHeavy: 0.25 },
];

interface Rec {
  role: Role;
  champ: Champion;
  q: Queue;
  D: number;
  K: number;
  othersK: number;
  ev: K4;
  p: number;
  // context for exact expectations (member games only)
  muCtx?: number; // mu without the in-game carry factor and without the player's own volume
  others?: Rec[]; // member games: the other nine players' records (the member's own lobby)
}

interface Member {
  idx: number;
  theta: number; // nominal
  vol: number;
  conv: number;
  lobby: number;
  roleMix: number[];
  pools: Record<Role, { champs: Champion[]; w: number[] }>;
  queueMix: number[];
  games: number;
  recs: Rec[];
  truth: number; // expected points ratio vs an average player in the same games
  truthConv: number; // conversion-only ratio (volume removed)
  propensity: number; // champion propensity within role: mean over games of E[pts | champ, role, reference context] / the role's average champion's
  ctxProp: number; // expected points per game at theta 1 in their own games / the population's (role, champion, queue and lobby together)
  supportShare: number;
  swiftShare: number;
}

function dirichlet(rng: Rng, base: readonly number[], conc: number) {
  const x = base.map((b) => (b * conc < 1 ? rng.gamma(b * conc + 1) * rng.rnd() ** (1 / (b * conc)) : rng.gamma(b * conc)));
  const s = x.reduce((a, b) => a + b, 0);
  return x.map((v) => v / s);
}

function makeMember(rng: Rng, world: World, sc: Scenario, idx: number, hidden: boolean): Member {
  const zv = rng.gauss();
  const zc = 0.5 * zv + Math.sqrt(0.75) * rng.gauss();
  const sv = sc.tau * Math.sqrt(sc.volShare) * 1.0;
  const scv = sc.tau * Math.sqrt(1 - sc.volShare) * 0.8; // conversion compounds, so a smaller log-sd gives a similar effect
  const vol = Math.exp(sv * zv);
  const conv = Math.exp(scv * (sc.volShare === 0 ? zv : zc));
  const theta = vol * conv;
  const lobby = Math.exp(sc.lobbySd * rng.gauss());
  const main = Math.floor(rng.rnd() * 5);
  const roleMix = [0, 0, 0, 0, 0];
  if (rng.rnd() < 0.6) {
    roleMix[main] = 0.85;
    for (let r = 0; r < 5; r++) if (r !== main) roleMix[r] = 0.15 / 4;
  } else {
    let second = main;
    while (second === main) second = Math.floor(rng.rnd() * 5);
    roleMix[main] = 0.55;
    roleMix[second] = 0.3;
    for (let r = 0; r < 5; r++) if (r !== main && r !== second) roleMix[r] = 0.15 / 3;
  }
  const pools = {} as Member["pools"];
  const skillZ = Math.log(theta) / Math.max(0.01, sc.tau);
  for (const r of ROLES) {
    const n = 3 + Math.floor(rng.rnd() * 10);
    const champs: Champion[] = [];
    const w: number[] = [];
    const avail = world.byRole[r];
    // propensity-tilted pick when skill correlates with champion choice
    const tilt = avail.champs.map((c, i) => avail.weights[i]! * (sc.skillChampCorr ? (c.vol * c.conv ** 2) ** (2 * sc.skillChampCorr * skillZ) : 1));
    for (let k = 0; k < n; k++) {
      const c = rng.pick(avail.champs, tilt);
      if (!champs.includes(c)) {
        champs.push(c);
        w.push((champs.length) ** -1.2);
      }
    }
    pools[r] = { champs, w };
  }
  const heavy = rng.rnd() < sc.swiftHeavy;
  const queueMix = sc.soloOnly ? [1, 0, 0, 0, 0, 0, 0] : heavy ? [0.1, 0.03, 0.01, 0.04, 0.05, 0.02, 0.75] : dirichlet(rng, BASE_QUEUE_MIX.map((x, i) => (i === 6 ? x * 0.5 : x)), 4);
  const games = hidden ? 150 + Math.floor(rng.rnd() * 300) : Math.round(Math.exp(Math.log(sc.gamesMin) + rng.rnd() * (Math.log(sc.gamesMax) - Math.log(sc.gamesMin))));
  return { idx, theta, vol, conv, lobby, roleMix, pools, queueMix, games, recs: [], truth: 1, truthConv: 1, propensity: 1, ctxProp: 1, supportShare: 0, swiftShare: 0 };
}

const OTHER_SD = 0.25;
function simulateGame(rng: Rng, world: World, m: Member, pool: Rec[], interaction = 0) {
  const q = rng.pick(QUEUES, m.queueMix);
  const D = Math.max(15, q.dMean + q.dSd * rng.gauss());
  const G = rng.gamma(8) / 8;
  const side = Math.exp(0.25 * rng.gauss());
  const role = rng.pick(ROLES, m.roleMix);
  const champ = rng.pick(m.pools[role].champs, m.pools[role].w);
  const parts: Array<{ role: Role; champ: Champion; vol: number; conv: number; side: number; member: boolean }> = [{ role, champ, vol: m.vol, conv: m.conv, side, member: true }];
  const ally = interaction ? m.theta ** (-interaction / 3) : 1;
  const foe = interaction ? m.theta ** -interaction : 1;
  for (const r of ROLES) {
    if (r !== role) {
      const o = other(rng);
      parts.push({ role: r, champ: rng.pick(world.byRole[r].champs, world.byRole[r].weights), vol: o.vol * ally, conv: o.conv, side, member: false });
    }
  }
  for (const r of ROLES) {
    const o = other(rng);
    parts.push({ role: r, champ: rng.pick(world.byRole[r].champs, world.byRole[r].weights), vol: o.vol * foe, conv: o.conv, side: 1 / side, member: false });
  }
  const recs: Rec[] = [];
  let total = 0;
  for (const pt of parts) {
    const muCtx = ROLE_KILLS[pt.role] * q.pace * (D / q.dMean) ** 0.9 * m.lobby * G * pt.side * pt.champ.vol;
    const K = rng.poisson(muCtx * pt.vol * (rng.gamma(4) / 4));
    const ev = burstEvents(rng, K, convVector(world.c[pt.role], pt.champ.conv * q.conv * pt.conv));
    total += K;
    recs.push({ role: pt.role, champ: pt.champ, q, D, K, othersK: 0, ev, p: pts(ev), muCtx });
  }
  for (const r of recs) r.othersK = total - r.K;
  recs[0]!.others = recs.slice(1);
  m.recs.push(recs[0]!);
  for (let i = 1; i < recs.length; i++) pool.push(recs[i]!);
}
function other(rng: Rng) {
  const z1 = rng.gauss();
  const z2 = 0.5 * z1 + Math.sqrt(0.75) * rng.gauss();
  return { vol: Math.exp(OTHER_SD * Math.sqrt(0.6) * z1 - (OTHER_SD ** 2 * 0.6) / 2), conv: Math.exp(OTHER_SD * Math.sqrt(0.4) * 0.8 * z2 - (OTHER_SD ** 2 * 0.4 * 0.64) / 2) };
}

/** NegBin(r = 4) pmf with mean m: kills given the context, the in-game carry factor integrated out. */
function nbPmf(m: number, Kmax: number) {
  const r = 4;
  const p = r / (r + m);
  const out = new Array(Kmax + 1).fill(0);
  let v = p ** r;
  out[0] = v;
  for (let k = 1; k <= Kmax; k++) {
    v = (v * (k + r - 1) * (1 - p)) / k;
    out[k] = v;
  }
  return out;
}

const KMAX = 50;
function expectedPtsCtx(world: World, rec: Rec, vol: number, conv: number, cache: Map<string, number[]>) {
  const cv = rec.champ.conv * rec.q.conv * conv;
  const key = `${rec.role}|${cv.toFixed(5)}`;
  let tab = cache.get(key);
  if (!tab) {
    tab = eventsGivenK(convVector(world.c[rec.role], cv), KMAX).map((e) => pts(e));
    cache.set(key, tab);
  }
  const pm = nbPmf(rec.muCtx! * vol, KMAX);
  let s = 0;
  for (let K = 1; K <= KMAX; K++) s += pm[K]! * tab[K]!;
  return s;
}

const refCache = new Map<string, number>();
function refPts(world: World, role: Role, champ: Champion) {
  const key = `${role}|${champ.id}`;
  let v = refCache.get(key);
  if (v === undefined) {
    const tab = eventsGivenK(convVector(world.c[role], champ.conv), KMAX).map((e) => pts(e));
    const pm = nbPmf(ROLE_KILLS[role] * champ.vol, KMAX);
    v = 0;
    for (let K = 1; K <= KMAX; K++) v += pm[K]! * tab[K]!;
    refCache.set(key, v);
  }
  return v;
}
const roleRefCache = new Map<string, number>();
function roleRef(world: World, role: Role) {
  let v = roleRefCache.get(role);
  if (v === undefined) {
    const { champs, weights } = world.byRole[role];
    const tw = weights.reduce((a, b) => a + b, 0);
    v = champs.reduce((s, c, i) => s + (weights[i]! / tw) * refPts(world, role, c), 0);
    roleRefCache.set(role, v);
  }
  return v;
}

function computeTruth(world: World, m: Member, popPtsPerGame: number) {
  const cache = new Map<string, number[]>();
  let num = 0;
  let den = 0;
  let conv = 0;
  for (const r of m.recs) {
    num += expectedPtsCtx(world, r, m.vol, m.conv, cache);
    den += expectedPtsCtx(world, r, 1, 1, cache);
    conv += expectedPtsCtx(world, r, 1, m.conv, cache);
  }
  m.truth = num / den;
  m.truthConv = conv / den;
  m.ctxProp = den / m.recs.length / popPtsPerGame;
  m.propensity = m.recs.reduce((a, r) => a + refPts(world, r.role, r.champ) / roleRef(world, r.role), 0) / m.recs.length;
  m.supportShare = m.recs.filter((r) => r.role === "SUPPORT").length / m.recs.length;
  m.swiftShare = m.recs.filter((r) => r.q.group === "swift").length / m.recs.length;
}

/* ------------------------------ the comparison pool's aggregates ------------------------------ */
const KC = 20;
const QG = ["ranked", "draft", "quick", "swift"] as const;
const PACE_BUCKETS = 8;
interface Agg {
  baseline: MultikillBaseline;
  all: { games: number; ev: K4; p: number };
  role: Record<Role, { games: number; ev: K4; p: number; D: number }>;
  champAll: Map<string, { games: number; ev: K4 }>;
  roleChamp: Map<string, { games: number; ev: K4; p: number; xk: number; xkEv: number }>;
  roleK: Record<Role, Array<{ games: number; ev: K4 }>>;
  allK: Array<{ games: number; ev: K4 }>;
  roleQ: Record<Role, Record<string, { games: number; p: number }>>;
  paceEdges: number[];
  paceMean: number;
  rolePace: Record<Role, Array<{ games: number; p: number }>>;
  eb: { kindRate: (role: Role, champ: Champion) => K4; od: number; odEv: number };
}
const z4 = (): K4 => [0, 0, 0, 0];
const add4 = (a: K4, b: readonly number[]) => {
  for (let i = 0; i < 4; i++) a[i]! += b[i]!;
};

function aggregate(pool: Rec[]): Agg {
  const all = { games: 0, ev: z4(), p: 0 };
  const role = {} as Agg["role"];
  const roleK = {} as Agg["roleK"];
  const roleQ = {} as Agg["roleQ"];
  const rolePace = {} as Agg["rolePace"];
  for (const r of ROLES) {
    role[r] = { games: 0, ev: z4(), p: 0, D: 0 };
    roleK[r] = Array.from({ length: KC + 1 }, () => ({ games: 0, ev: z4() }));
    roleQ[r] = Object.fromEntries(QG.map((g) => [g, { games: 0, p: 0 }]));
    rolePace[r] = Array.from({ length: PACE_BUCKETS }, () => ({ games: 0, p: 0 }));
  }
  const allK = Array.from({ length: KC + 1 }, () => ({ games: 0, ev: z4() }));
  const champAll = new Map<string, { games: number; ev: K4 }>();
  const roleChamp = new Map<string, { games: number; ev: K4; p: number; xk: number; xkEv: number }>();
  let othersSum = 0;
  for (const r of pool) {
    all.games += 1;
    add4(all.ev, r.ev);
    all.p += r.p;
    const g = role[r.role];
    g.games += 1;
    add4(g.ev, r.ev);
    g.p += r.p;
    g.D += r.D;
    const kc = Math.min(KC, r.K);
    roleK[r.role][kc]!.games += 1;
    add4(roleK[r.role][kc]!.ev, r.ev);
    allK[kc]!.games += 1;
    add4(allK[kc]!.ev, r.ev);
    roleQ[r.role][r.q.group]!.games += 1;
    roleQ[r.role][r.q.group]!.p += r.p;
    const ca = champAll.get(r.champ.id) ?? { games: 0, ev: z4() };
    ca.games += 1;
    add4(ca.ev, r.ev);
    champAll.set(r.champ.id, ca);
    const key = `${r.role}|${r.champ.id}`;
    const rc = roleChamp.get(key) ?? { games: 0, ev: z4(), p: 0, xk: 0, xkEv: 0 };
    rc.games += 1;
    add4(rc.ev, r.ev);
    rc.p += r.p;
    roleChamp.set(key, rc);
    othersSum += r.othersK;
  }
  const paceMean = othersSum / pool.length;
  const ratios = pool.map((r) => r.othersK / paceMean).sort((a, b) => a - b);
  const paceEdges = Array.from({ length: PACE_BUCKETS - 1 }, (_, i) => ratios[Math.floor(((i + 1) * ratios.length) / PACE_BUCKETS)]!);
  const rows: BaselineRow[] = [];
  for (const [key, v] of roleChamp) {
    const [position, championId] = key.split("|") as [string, string];
    const ev = { double: v.ev[0], triple: v.ev[1], quadra: v.ev[2], penta: v.ev[3] };
    rows.push({ position, championId, games: v.games, nested: ev, separate: ev });
  }
  const baseline = buildMultikillBaseline(rows, SEPARATE_EVIDENCE);
  const agg: Agg = { baseline, all, role, champAll, roleChamp, roleK, allK, roleQ, paceEdges, paceMean, rolePace, eb: { kindRate: () => z4(), od: 1, odEv: 1 } };
  for (const r of pool) {
    const b = paceBucket(agg, r.othersK);
    rolePace[r.role][b]!.games += 1;
    rolePace[r.role][b]!.p += r.p;
  }
  // M1a: each pool record's expected events given its own kills, summed per role and champion (the champion's conversion factor)
  for (const r of pool) {
    const x = killsRates(agg, r.role, r.K);
    const rc = roleChamp.get(`${r.role}|${r.champ.id}`)!;
    rc.xk += pts(x);
    rc.xkEv += x[0] + x[1] + x[2] + x[3];
  }
  agg.eb = buildEb(agg, pool);
  return agg;
}

const paceBucket = (agg: Pick<Agg, "paceEdges" | "paceMean">, othersK: number) => {
  const x = othersK / agg.paceMean;
  let b = 0;
  while (b < agg.paceEdges.length && x > agg.paceEdges[b]!) b++;
  return b;
};

function killsRates(agg: Agg, role: Role, K: number): K4 {
  const kc = Math.min(KC, K);
  const g = agg.roleK[role][kc]!;
  const a = agg.allK[kc]!;
  const out = z4();
  for (let i = 0; i < 4; i++) {
    const allRate = a.games ? a.ev[i]! / a.games : 0;
    out[i] = (g.ev[i]! + 50 * allRate) / (g.games + 50);
  }
  return out;
}

/* M4's baseline: each kind's rate per role and champion, shrunk by information (Gamma-Poisson, prior strength by moments). */
function buildEb(agg: Agg, pool: Rec[]) {
  const roleRate = (role: Role): K4 => {
    const g = agg.role[role];
    const out = z4();
    for (let i = 0; i < 4; i++) out[i] = (g.ev[i]! + 200 * (agg.all.ev[i]! / agg.all.games)) / (g.games + 200);
    return out;
  };
  const rr = Object.fromEntries(ROLES.map((r) => [r, roleRate(r)])) as Record<Role, K4>;
  // 1) champion overall factor F (all kinds' events), prior relative variance by moments, pooled over roles
  let num = 0;
  let den = 0;
  for (const [key, v] of agg.roleChamp) {
    const role = key.split("|")[0] as Role;
    const lam = v.games * (rr[role][0] + rr[role][1] + rr[role][2] + rr[role][3]);
    const e = v.ev[0] + v.ev[1] + v.ev[2] + v.ev[3];
    if (lam <= 0) continue;
    num += (e - lam) ** 2 - lam; // E[(E - lam)^2] = lam + lam^2 s2
    den += lam * lam;
  }
  const s2F = Math.min(1, Math.max(0.005, num / den));
  const F = new Map<string, number>();
  for (const [key, v] of agg.roleChamp) {
    const role = key.split("|")[0] as Role;
    const lam = v.games * (rr[role][0] + rr[role][1] + rr[role][2] + rr[role][3]);
    const e = v.ev[0] + v.ev[1] + v.ev[2] + v.ev[3];
    F.set(key, (e + 1 / s2F) / (lam + 1 / s2F));
  }
  // 2) kind deviations around F, per kind, prior variance by moments
  const s2k = [0, 0, 0, 0];
  for (let k = 0; k < 4; k++) {
    let n2 = 0;
    let d2 = 0;
    for (const [key, v] of agg.roleChamp) {
      const role = key.split("|")[0] as Role;
      const lam = v.games * rr[role][k]! * F.get(key)!;
      if (lam <= 0) continue;
      n2 += (v.ev[k]! - lam) ** 2 - lam;
      d2 += lam * lam;
    }
    s2k[k] = Math.min(2, Math.max(0.005, n2 / Math.max(1e-9, d2)));
  }
  const kindRate = (role: Role, champ: Champion): K4 => {
    const key = `${role}|${champ.id}`;
    const v = agg.roleChamp.get(key);
    const base = rr[role];
    if (!v) return [...base] as K4;
    const f = F.get(key)!;
    const out = z4();
    for (let k = 0; k < 4; k++) {
      const lam = v.games * base[k]! * f;
      const d = (v.ev[k]! + 1 / s2k[k]!) / (lam + 1 / s2k[k]!);
      out[k] = base[k]! * f * d;
    }
    return out;
  };
  // overdispersion of points (and events) about the expected, at theta 1, from the pool itself
  let sq = 0;
  let pv = 0;
  let sqE = 0;
  let pvE = 0;
  for (const r of pool) {
    const x = kindRate(r.role, r.champ);
    const xp = pts(x);
    sq += (r.p - xp) ** 2;
    pv += 4 * x[0] + 9 * x[1] + 16 * x[2] + 25 * x[3];
    const xe = x[0] + x[1] + x[2] + x[3];
    sqE += (r.ev[0] + r.ev[1] + r.ev[2] + r.ev[3] - xe) ** 2;
    pvE += xe;
  }
  return { kindRate, od: sq / pv, odEv: sqE / pvE, s2F, s2k };
}

/* ------------------------------------------- models ------------------------------------------- */
const toK4 = (r: { double: number; triple: number; quadra: number; penta: number }): K4 => [r.double, r.triple, r.quadra, r.penta];
const scale = (x: K4, f: number): K4 => [x[0] * f, x[1] * f, x[2] * f, x[3] * f];

function paceFactor(agg: Agg, role: Role, othersK: number) {
  const b = paceBucket(agg, othersK);
  const g = agg.rolePace[role][b]!;
  const rate = agg.role[role].p / agg.role[role].games;
  return (g.p + 100 * rate) / ((g.games + 100) * rate);
}
function queueFactor(agg: Agg, role: Role, q: Queue) {
  const g = agg.roleQ[role][q.group]!;
  const rate = agg.role[role].p / agg.role[role].games;
  return (g.p + 100 * rate) / ((g.games + 100) * rate);
}
function champOnly(agg: Agg, champ: Champion): K4 {
  const all = agg.all;
  const rates = all.ev.map((e) => e / all.games) as K4;
  const perGame = rates[0] + rates[1] + rates[2] + rates[3];
  const c = agg.champAll.get(champ.id);
  if (!c) return rates;
  const tot = c.ev[0] + c.ev[1] + c.ev[2] + c.ev[3];
  const f = (tot + 50 * perGame) / ((c.games + 50) * perGame);
  return scale(rates, f);
}
function conversionFactor(agg: Agg, role: Role, champ: Champion) {
  const rc = agg.roleChamp.get(`${role}|${champ.id}`);
  const rk = agg.role[role];
  const ratePerGame = rk.p / rk.games;
  if (!rc) return 1;
  return (rc.p + 50 * ratePerGame) / (rc.xk + 50 * ratePerGame);
}

type Scoring = "cushion" | "raw" | "eb" | "eb-events";
interface Model {
  key: string;
  label: string;
  expected: (agg: Agg, r: Rec) => K4;
  scoring: Scoring;
  /** The member's own-games factor: the other players in exactly these games against what the comparison expects of them (M5). */
  lobby?: (agg: Agg, r: Rec) => K4;
}
const LOBBY_CUSHION = 200; // kill points
function lobbyFactor(agg: Agg, recs: Rec[], expected: (agg: Agg, r: Rec) => K4) {
  let P = 0;
  let X = 0;
  for (const r of recs) for (const o of r.others ?? []) {
    P += o.p;
    X += pts(expected(agg, o));
  }
  return (P + LOBBY_CUSHION) / (X + LOBBY_CUSHION);
}
const MODELS: Model[] = [
  { key: "M0", label: "production: pooled kill-weighted, champion+role, +40", expected: (a, r) => toK4(expectedRates(a.baseline, r.role, r.champ.id).rates), scoring: "cushion" },
  { key: "Mflat", label: "no adjustment (every position), +40", expected: (a, _r) => toK4(expectedRates(a.baseline, null, null).rates), scoring: "cushion" },
  { key: "M2", label: "champion only (no role), +40", expected: (a, r) => champOnly(a, r.champ), scoring: "cushion" },
  { key: "M3", label: "role only (no champion), +40", expected: (a, r) => toK4(expectedRates(a.baseline, r.role, null).rates), scoring: "cushion" },
  { key: "M1a", label: "opportunity: given own kills (conversion), +40", expected: (a, r) => scale(killsRates(a, r.role, r.K), conversionFactor(a, r.role, r.champ)), scoring: "cushion" },
  { key: "M1b", label: "opportunity: M0 x game pace (others' kills), +40", expected: (a, r) => scale(toK4(expectedRates(a.baseline, r.role, r.champ.id).rates), paceFactor(a, r.role, r.othersK)), scoring: "cushion" },
  { key: "M1c", label: "opportunity: M0 per minute, +40", expected: (a, r) => scale(toK4(expectedRates(a.baseline, r.role, r.champ.id).rates), r.D / (a.role[r.role].D / a.role[r.role].games)), scoring: "cushion" },
  { key: "M1d", label: "opportunity: M0 x queue group, +40", expected: (a, r) => scale(toK4(expectedRates(a.baseline, r.role, r.champ.id).rates), queueFactor(a, r.role, r.q)), scoring: "cushion" },
  { key: "M0raw", label: "M0 without the cushion", expected: (a, r) => toK4(expectedRates(a.baseline, r.role, r.champ.id).rates), scoring: "raw" },
  { key: "M0eb", label: "M0 baseline, cushion by empirical Bayes", expected: (a, r) => toK4(expectedRates(a.baseline, r.role, r.champ.id).rates), scoring: "eb" },
  { key: "M4", label: "hierarchical EB: per-kind champion x role, info shrinkage, EB cushion", expected: (a, r) => a.eb.kindRate(r.role, r.champ), scoring: "eb" },
  { key: "M4p", label: "M4 x game pace", expected: (a, r) => scale(a.eb.kindRate(r.role, r.champ), paceFactor(a, r.role, r.othersK)), scoring: "eb" },
  { key: "M4e", label: "M4 on event counts (unweighted)", expected: (a, r) => a.eb.kindRate(r.role, r.champ), scoring: "eb-events" },
  { key: "M5", label: "M0 x own-games factor (the others in the member's own games), +40", expected: (a, r) => toK4(expectedRates(a.baseline, r.role, r.champ.id).rates), lobby: (a, r) => toK4(expectedRates(a.baseline, r.role, r.champ.id).rates), scoring: "cushion" },
  { key: "M5eb", label: "M4 x own-games factor, EB cushion", expected: (a, r) => a.eb.kindRate(r.role, r.champ), lobby: (a, r) => a.eb.kindRate(r.role, r.champ), scoring: "eb" },
];

interface Scored {
  P: number;
  X: number;
  score: number;
}
function scoreAll(agg: Agg, model: Model, sets: Rec[][]): Scored[] {
  const parts = sets.map((recs) => {
    let P = 0;
    let X = 0;
    let V = 0;
    const L = model.lobby ? lobbyFactor(agg, recs, model.lobby) : 1;
    for (const r of recs) {
      const x = model.expected(agg, r);
      if (model.scoring === "eb-events") {
        P += r.ev[0] + r.ev[1] + r.ev[2] + r.ev[3];
        X += L * (x[0] + x[1] + x[2] + x[3]);
        V += L * agg.eb.odEv * (x[0] + x[1] + x[2] + x[3]);
      } else {
        P += r.p;
        X += L * pts(x);
        V += L * agg.eb.od * (4 * x[0] + 9 * x[1] + 16 * x[2] + 25 * x[3]);
      }
    }
    return { P, X, V };
  });
  if (model.scoring === "cushion") return parts.map((p) => ({ ...p, score: (100 * (p.P + 40)) / (p.X + 40) }));
  if (model.scoring === "raw") return parts.map((p) => ({ ...p, score: (100 * p.P) / Math.max(1e-9, p.X) }));
  // empirical Bayes: rho_i = P/X with sampling variance V/X^2; tau^2 by moments over the ranked sets
  const rho = parts.map((p) => p.P / p.X);
  const v = parts.map((p) => p.V / p.X ** 2);
  const n = parts.length;
  const mean = rho.reduce((a, b) => a + b, 0) / n;
  const varRho = rho.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1);
  const tau2 = Math.min(0.35 ** 2, Math.max(0.08 ** 2, varRho - v.reduce((a, b) => a + b, 0) / n));
  return parts.map((p, i) => {
    const C = (p.X * v[i]!) / tau2; // = OD * phi / tau^2, in the score's own units
    return { ...p, score: (100 * (p.P + C)) / (p.X + C) };
  });
}

/* ------------------------------------------- metrics ------------------------------------------- */
function ranks(xs: number[]): number[] {
  const idx = xs.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const out = new Array(xs.length).fill(0);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1]![0] === idx[i]![0]) j++;
    for (let k = i; k <= j; k++) out[idx[k]![1]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return out;
}
function pearson(a: number[], b: number[]) {
  const n = a.length;
  const ma = a.reduce((s, x) => s + x, 0) / n;
  const mb = b.reduce((s, x) => s + x, 0) / n;
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < n; i++) {
    sab += (a[i]! - ma) * (b[i]! - mb);
    saa += (a[i]! - ma) ** 2;
    sbb += (b[i]! - mb) ** 2;
  }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : NaN;
}
const spearman = (a: number[], b: number[]) => pearson(ranks(a), ranks(b));
const avg = (xs: number[]) => {
  const ok = xs.filter((x) => Number.isFinite(x));
  return ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : NaN;
};

interface Acc {
  top1: number[];
  rho: number[];
  rhoConv: number[];
  resGames: number[];
  resProp: number[];
  resSupport: number[];
  resSwift: number[];
  resLobby: number[];
  splitHalf: number[];
  firstShort: number[];
  firstSupport: number[];
  firstHighProp: number[];
  meanAbsLog: number[];
  top3: number[];
  resCtx: number[];
}
const newAcc = (): Acc => ({ top1: [], rho: [], rhoConv: [], resGames: [], resProp: [], resSupport: [], resSwift: [], resLobby: [], splitHalf: [], firstShort: [], firstSupport: [], firstHighProp: [], meanAbsLog: [], top3: [], resCtx: [] });

/** Paired differences against M0 over the same boards, with their standard errors. */
function paired(a: Acc, base: Acc) {
  const d = (x: number[], y: number[]) => {
    const n = Math.min(x.length, y.length);
    const diffs: number[] = [];
    for (let i = 0; i < n; i++) if (Number.isFinite(x[i]!) && Number.isFinite(y[i]!)) diffs.push(x[i]! - y[i]!);
    const m = diffs.reduce((s, v) => s + v, 0) / diffs.length;
    const sd = Math.sqrt(diffs.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, diffs.length - 1));
    return { m, se: sd / Math.sqrt(diffs.length) };
  };
  const t = d(a.top1, base.top1);
  const r = d(a.rho, base.rho);
  return { dTop1: t.m, seTop1: t.se, dRho: r.m, seRho: r.se };
}

function runScenario(sc: Scenario, boards: number, seed: number) {
  const rng = makeRng(seed);
  const world = makeWorld(rng, { volSd: sc.convSd ? 0.35 : 0.22, convSd: sc.convSd ?? 0.1 });
  refCache.clear();
  roleRefCache.clear();
  const acc: Record<string, Acc> = Object.fromEntries(MODELS.map((m) => [m.key, newAcc()]));
  const truthAcc = { firstShort: [] as number[], firstSupport: [] as number[], firstHighProp: [] as number[], spreadT: [] as number[], bestUnranked: [] as number[], shareShort: [] as number[], shareSupport: [] as number[], shareHighProp: [] as number[] };
  const diag = { od: [] as number[], s2F: [] as number[], s2k: [] as number[][], pool: [] as number[], tauT: [] as number[] };
  let checked = false;
  for (let b = 0; b < boards; b++) {
    const pool: Rec[] = [];
    const members = Array.from({ length: sc.members }, (_, i) => makeMember(rng, world, sc, i, false));
    for (const m of members) for (let g = 0; g < m.games; g++) simulateGame(rng, world, m, pool, sc.interaction ?? 0);
    let h = 0;
    while (pool.length < sc.poolTarget) {
      const hm = makeMember(rng, world, { ...sc, tau: 0.15 }, 100 + h++, true);
      for (let g = 0; g < hm.games && pool.length < sc.poolTarget; g++) simulateGame(rng, world, hm, pool);
    }
    const agg = aggregate(pool);
    const popPts = agg.all.p / agg.all.games;
    for (const m of members) computeTruth(world, m, popPts);
    const ranked = members.filter((m) => m.recs.length >= 20);
    if (ranked.length < 3) continue;
    diag.od.push(agg.eb.od);
    diag.s2F.push((agg.eb as unknown as { s2F: number }).s2F);
    diag.s2k.push((agg.eb as unknown as { s2k: number[] }).s2k);
    diag.pool.push(pool.length);
    const T = ranked.map((m) => m.truth);
    const lt = T.map(Math.log);
    const mlt = avg(lt);
    diag.tauT.push(Math.sqrt(avg(lt.map((x) => (x - mlt) ** 2))));
    const trueBest = T.indexOf(Math.max(...T));
    const trueRank = ranks(T.map((x) => -x));
    const short = (m: Member) => m.recs.length <= 60;
    const highProp = (m: Member) => m.propensity >= 1.1;
    const supportMain = (m: Member) => m.supportShare >= 0.5;
    truthAcc.shareShort.push(ranked.filter(short).length / ranked.length);
    truthAcc.shareSupport.push(ranked.filter(supportMain).length / ranked.length);
    truthAcc.shareHighProp.push(ranked.filter(highProp).length / ranked.length);
    truthAcc.firstShort.push(short(ranked[trueBest]!) ? 1 : 0);
    truthAcc.firstSupport.push(supportMain(ranked[trueBest]!) ? 1 : 0);
    truthAcc.firstHighProp.push(highProp(ranked[trueBest]!) ? 1 : 0);
    const allBest = members.reduce((bi, m, i) => (m.truth > members[bi]!.truth ? i : bi), 0);
    truthAcc.bestUnranked.push(members[allBest]!.recs.length < 20 ? 1 : 0);
    // sanity: M0 through the real scoreMember equals the generic implementation
    if (!checked) {
      const real = scoreMember("x", ranked[0]!.recs.map((r) => ({ role: r.role, championId: r.champ.id, counts: { double: r.ev[0], triple: r.ev[1], quadra: r.ev[2], penta: r.ev[3] } })), agg.baseline).score!;
      const mine = scoreAll(agg, MODELS[0]!, [ranked[0]!.recs])[0]!.score;
      if (Math.abs(real - mine) > 1e-6) throw new Error(`M0 mismatch ${real} vs ${mine}`);
      checked = true;
    }
    for (const model of MODELS) {
      const a = acc[model.key]!;
      const s = scoreAll(agg, model, ranked.map((m) => m.recs)).map((x) => x.score);
      // ties: more games first (production's order)
      const order = ranked.map((_, i) => i).sort((i, j) => Math.round(s[j]!) - Math.round(s[i]!) || ranked[j]!.recs.length - ranked[i]!.recs.length);
      const first = order[0]!;
      a.top1.push(first === trueBest ? 1 : 0);
      a.top3.push(order.slice(0, 3).includes(trueBest) ? 1 : 0);
      a.rho.push(spearman(s, T));
      a.rhoConv.push(spearman(s, ranked.map((m) => m.truthConv)));
      const mr = new Array(ranked.length).fill(0);
      order.forEach((idx, place) => (mr[idx] = place + 1));
      const res = mr.map((r, i) => r - trueRank[i]!); // + = placed lower than deserved
      a.resGames.push(spearman(res, ranked.map((m) => Math.log(m.recs.length))));
      a.resProp.push(spearman(res, ranked.map((m) => m.propensity)));
      a.resSupport.push(spearman(res, ranked.map((m) => m.supportShare)));
      a.resSwift.push(spearman(res, ranked.map((m) => m.swiftShare)));
      a.resLobby.push(spearman(res, ranked.map((m) => m.lobby)));
      a.resCtx.push(spearman(res, ranked.map((m) => m.ctxProp)));
      a.firstShort.push(short(ranked[first]!) ? 1 : 0);
      a.firstSupport.push(supportMain(ranked[first]!) ? 1 : 0);
      a.firstHighProp.push(highProp(ranked[first]!) ? 1 : 0);
      a.meanAbsLog.push(avg(s.map((x, i) => Math.abs(Math.log(x / 100) - Math.log(T[i]!)))));
      // split-half: alternate games; members with 40+ games
      const halfable = ranked.filter((m) => m.recs.length >= 40);
      if (halfable.length >= 4) {
        const A = scoreAll(agg, model, halfable.map((m) => m.recs.filter((_, i) => i % 2 === 0))).map((x) => x.score);
        const B = scoreAll(agg, model, halfable.map((m) => m.recs.filter((_, i) => i % 2 === 1))).map((x) => x.score);
        a.splitHalf.push(spearman(A, B));
      }
    }
  }
  const out: Record<string, Record<string, number>> = {};
  for (const model of MODELS) {
    const a = acc[model.key]!;
    const sh = avg(a.splitHalf);
    out[model.key] = {
      pTop1: avg(a.top1),
      pTop3: avg(a.top3),
      resVsContext: avg(a.resCtx),
      rhoTruth: avg(a.rho),
      rhoConv: avg(a.rhoConv),
      resVsGames: avg(a.resGames),
      resVsPropensity: avg(a.resProp),
      resVsSupport: avg(a.resSupport),
      resVsSwift: avg(a.resSwift),
      resVsLobby: avg(a.resLobby),
      firstShort: avg(a.firstShort),
      firstSupport: avg(a.firstSupport),
      firstHighProp: avg(a.firstHighProp),
      splitHalf: sh,
      splitHalfSB: (2 * sh) / (1 + sh),
      meanAbsLogErr: avg(a.meanAbsLog),
      ...paired(a, acc.M0!),
    };
  }
  return {
    scenario: sc,
    boards: acc.M0!.top1.length,
    truth: { firstShort: avg(truthAcc.firstShort), firstSupport: avg(truthAcc.firstSupport), firstHighProp: avg(truthAcc.firstHighProp), bestUnranked: avg(truthAcc.bestUnranked), shareShort: avg(truthAcc.shareShort), shareSupport: avg(truthAcc.shareSupport), shareHighProp: avg(truthAcc.shareHighProp) },
    diag: { od: avg(diag.od), s2F: avg(diag.s2F), s2k: [0, 1, 2, 3].map((k) => avg(diag.s2k.map((x) => x[k]!))), pool: avg(diag.pool), tauTruth: avg(diag.tauT) },
    models: out,
  };
}

const calibrated = process.env.MULTIKILL_SIM_CALIBRATED;
if (calibrated) SCENARIOS.push({ ...BASE, label: "calibrated from the production audit", ...(JSON.parse(calibrated) as Partial<Scenario>), key: "CAL" });
const boards = Number(process.argv[2] ?? 200);
const only = process.argv[3] ? new Set(process.argv[3].split(",")) : null;
const results = [];
const t0 = Date.now();
for (const [i, sc] of SCENARIOS.entries()) {
  if (only && !only.has(sc.key)) continue;
  const t = Date.now();
  const r = runScenario(sc, boards, 20261126 + i * 101);
  results.push(r);
  console.error(`${sc.key} ${sc.label}: ${r.boards} boards in ${((Date.now() - t) / 1000).toFixed(1)} s; truth tau ${r.diag.tauTruth.toFixed(3)}, pool ${Math.round(r.diag.pool)}, OD ${r.diag.od.toFixed(2)}`);
}
writeFileSync(new URL(`./results-${boards}${only ? "-" + [...only].join("_") : ""}.json`, import.meta.url), JSON.stringify(results, null, 1));
const f = (x: number | undefined, d = 2) => (x !== undefined && Number.isFinite(x) ? x.toFixed(d) : "-");
for (const r of results) {
  console.log(`\n## ${r.scenario.key}: ${r.scenario.label} (${r.boards} boards; the truly best is a short record (<=60 games) ${f(r.truth.firstShort)} [share of ranked ${f(r.truth.shareShort)}], a support main ${f(r.truth.firstSupport)} [${f(r.truth.shareSupport)}], on high-propensity champions ${f(r.truth.firstHighProp)} [${f(r.truth.shareHighProp)}]; the truly best of all has <20 games ${f(r.truth.bestUnranked)})`);
  console.log("| model | P(best 1st) | vs M0 (se) | P(best top 3) | rho truth | vs M0 (se) | rho conv-only | split-half (SB) | res~games | res~champ prop | res~support | res~swift | res~lobby | first short | first support | first hi-prop | mean abs log err |");
  console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const [k, m] of Object.entries(r.models)) console.log(`| ${k} | ${f(m.pTop1)} | ${f(m.dTop1)} (${f(m.seTop1, 3)}) | ${f(m.pTop3)} | ${f(m.rhoTruth)} | ${f(m.dRho)} (${f(m.seRho, 3)}) | ${f(m.rhoConv)} | ${f(m.splitHalf)} (${f(m.splitHalfSB)}) | ${f(m.resVsGames)} | ${f(m.resVsPropensity)} | ${f(m.resVsSupport)} | ${f(m.resVsSwift)} | ${f(m.resVsLobby)} | ${f(m.firstShort)} | ${f(m.firstSupport)} | ${f(m.firstHighProp)} | ${f(m.meanAbsLogErr, 3)} |`);
}
console.error(`total ${((Date.now() - t0) / 1000).toFixed(1)} s`);
