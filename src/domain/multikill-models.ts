import { BASELINE_MIN_GAMES, CHAMPION_PRIOR_GAMES, MULTIKILL_CUSHION, ROLE_PRIOR_GAMES, expectedRates, multikillEvents, roleOfPosition, scoreMember, type MultikillBaseline } from "./multikill-score";
import type { MultikillCounts } from "./multikills";
import type { GameRole } from "./season-stats";

/*
  The multikill score's fairness check (docs/TEAM_LEADERBOARDS.md, "Fairness evaluation, 27 Nov
  2026"): the production score (M0) against the alternative ways of saying what is typical for a
  game, on the stored games themselves, so the question "who genuinely deserves first place,
  irrespective of champion, role or games played" is answered with real data rather than argued.
  Pure functions over the aggregates the audit's one statement returns
  (server/leaderboards/multikill-audit) and the board's own members and games; the job
  (jobs/multikill-audit) prints `auditSummary`, anonymous aggregates only. Nothing here changes the
  production formula: a change needs the decision rule below, a calibrated simulation and the
  owner's approval.

  The models (each counts every multikill once, at its largest, worth its kills: a double kill 2):
    Mflat  every position's rates (no adjustment);
    M2     champion only (its tendency against every position's, no role);
    M3     role only (production without the champion step);
    M0     production: role and champion (`expectedRates`), +40 cushion (`scoreMember`);
    M1a    opportunity by the player's own kills (M0 × the role's rate at the same kills);
    M1b    opportunity by game pace (M0 × the role's rate in games as bloody, by the others' kills);
    M1c    opportunity by minutes (M0 × the game's length ÷ the role's average length);
    M1d    opportunity by queue (M0 × the role's rate in the same queue group);
    M0eb   M0 with an empirical-Bayes cushion (its size read from the board itself);
    M4     per-kind champion and role rates, each shrunk by the information behind it, EB cushion;
    M5     M0 × the member's own-games factor: how many multikills the other players made in this
           member's games against what M0 expects of them (OWN_GAMES_CUSHION kill points of lean);
    M5eb   M4 × the own-games factor, EB cushion.

  What each is judged by on real data (no truth is known, so by consistency and bias, not accuracy):
  agreement with M0 (rank correlation, same first place, places moved); split-half reliability
  (the members' games split by a hash of the game, so a game's two halves never mix); a bootstrap
  of each member's games (how often the first place stays first); correlations of the score with
  games played, support share, champion tendency, fast-queue share and the own-games factor; and a
  placebo: each member's lane opponents, in the same games, scored as if they were the member. A
  fair model's placebo scores do not follow the member's own score or their games' environment.
*/

type K4 = [number, number, number, number];
const W: K4 = [2, 3, 4, 5];
const ZERO4 = (): K4 => [0, 0, 0, 0];
const pts = (x: readonly number[]) => W[0] * x[0]! + W[1] * x[1]! + W[2] * x[2]! + W[3] * x[3]!;
const var4 = (x: readonly number[]) => W[0] ** 2 * x[0]! + W[1] ** 2 * x[1]! + W[2] ** 2 * x[2]! + W[3] ** 2 * x[3]!;
const sum4 = (x: readonly number[]) => x[0]! + x[1]! + x[2]! + x[3]!;
const k4 = (c: MultikillCounts): K4 => [c.double, c.triple, c.quadra, c.penta];
const scale = (x: K4, f: number): K4 => [x[0] * f, x[1] * f, x[2] * f, x[3] * f];
const ROLES: readonly GameRole[] = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"];

/** The own-games factor's lean, in kill points: as if the other players in the member's games had made this many more at exactly the usual rates. */
export const OWN_GAMES_CUSHION = 200;
/** An opportunity factor's lean toward 1 (M1a, M1b, M1d), in games at the role's usual rate. */
export const FACTOR_LEAN_GAMES = 100;
/** Game pace buckets: the other players' kills in the game ÷ their average (width_bucket's numbering, 0 below 0.6 … 7 from 1.5). */
export const PACE_EDGES: readonly number[] = [0.6, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5];
/** Own kills above this count as this many (M1a). */
export const KILLS_CAP = 20;
/** Bootstrap draws (each member's games resampled; the comparison held fixed). */
export const BOOTSTRAP_DRAWS = 300;
/** The EB cushion's skill spread is held within these when scoring (a board of nine members cannot tell more). Rule R4 reads the spread before this clamp. */
export const TAU_RANGE: readonly [number, number] = [0.08, 0.35];

/** The queue groups the audit compares (the supported Summoner's Rift queues). */
export const QUEUE_GROUPS = ["ranked", "draft", "quickplay", "swiftplay"] as const;
export type QueueGroup = (typeof QUEUE_GROUPS)[number];
/** Ranked Solo/Duo, Flex and Clash; Normal Draft; Quickplay and Blind; Swiftplay (and anything else). */
export function queueGroup(queueId: number | null | undefined): number {
  if (queueId === 420 || queueId === 440 || queueId === 700) return 0;
  if (queueId === 400) return 1;
  if (queueId === 430 || queueId === 490) return 2;
  return 3;
}
/** The pace bucket of a ratio (0 … PACE_EDGES.length), as Postgres's width_bucket numbers it. */
export const paceBucket = (ratio: number) => PACE_EDGES.filter((e) => ratio >= e).length;

/** In the member's own games, how the other players' multikill points compare with what is expected of them: (made + 200) ÷ (expected + 200). */
export const ownGamesFactor = (made: number, expected: number) => (made + OWN_GAMES_CUSHION) / (expected + OWN_GAMES_CUSHION);

/** The audit statement's answer (server/leaderboards/multikill-audit): aggregates of the comparison players, by Riot's position. */
export interface AuditAggregates {
  /** The comparison players' average of (their game's kills − their own kills); null when no game has both sides' kills. */
  paceMean: number | null;
  /** By position and own kills (capped at KILLS_CAP): games and multikill points. */
  byKills: Array<{ position: string | null; kills: number; games: number; points: number }>;
  /** By position and queue: games, multikill points and seconds played. */
  byQueue: Array<{ position: string | null; queueId: number | null; games: number; points: number; seconds: number }>;
  /** By position and pace bucket. */
  byPace: Array<{ position: string | null; bucket: number; games: number; points: number }>;
  /** The other players in each member's games (`member`: the member's index), allies apart from opponents, by position and champion. */
  ownGames: Array<{ member: number; ally: boolean; position: string | null; championId: string | null; games: number; points: number }>;
  /** Each member game's lane opponent (the enemy on the member's position), as cells with no identity. */
  opponents: Array<{ member: number; half: 0 | 1; position: string | null; championId: string | null; kills: number | null; queueId: number | null; bucket: number | null; minutes: number; games: number; points: number; pointsSq: number }>;
}

/** One counted game of a ranked member (the board's own game: its role, champion and counts). */
export interface AuditGame {
  role: GameRole | null;
  championId: string;
  counts: MultikillCounts;
  queueId: number | null;
  kills: number | null;
  durationS: number | null;
  /** Both sides' champion kills in the game (null when the record does not say). */
  gameKills: number | null;
  /** Which half of the split-half test the game falls in (a hash of the game, the same for every player in it). */
  half: 0 | 1;
}

export interface AuditMember {
  /** The member's player id: internal only, never in the summary. */
  id: string;
  /** The member's index in the statement's answer (`ownGames`, `opponents`). */
  index: number;
  games: AuditGame[];
}

export interface AuditInput {
  baseline: MultikillBaseline;
  aggregates: AuditAggregates;
  /** The ranked members of the board (active, 20+ counted games), with their counted games. */
  members: AuditMember[];
}

export const MODEL_KEYS = ["M0", "Mflat", "M2", "M3", "M1a", "M1b", "M1c", "M1d", "M0eb", "M4", "M5", "M5eb"] as const;
export type ModelKey = (typeof MODEL_KEYS)[number];
export const MODEL_LABELS: Readonly<Record<ModelKey, string>> = {
  M0: "Production: role and champion, +40 cushion",
  Mflat: "No adjustment: every position's rates",
  M2: "Champion only",
  M3: "Role only",
  M1a: "Opportunity: the player's own kills",
  M1b: "Opportunity: game pace (the other players' kills)",
  M1c: "Opportunity: minutes played",
  M1d: "Opportunity: queue group",
  M0eb: "Production rates, empirical-Bayes cushion",
  M4: "Per-kind champion and role rates, empirical-Bayes cushion",
  M5: "Production × the member's own-games factor, +40 cushion",
  M5eb: "Per-kind rates × own-games factor, empirical-Bayes cushion",
};

/* ---------------- statistics ---------------- */

function ranks(xs: readonly number[]): number[] {
  const idx = xs.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const out = new Array<number>(xs.length).fill(0);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1]![0] === idx[i]![0]) j++;
    for (let k = i; k <= j; k++) out[idx[k]![1]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return out;
}
function pearson(a: readonly number[], b: readonly number[]): number | null {
  const n = a.length;
  if (n < 3 || b.length !== n) return null;
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
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : null;
}
/** Spearman's rank correlation (ties share their average rank); null under three values or with no spread. */
export const spearman = (a: readonly number[], b: readonly number[]): number | null => (a.length === b.length ? pearson(ranks(a), ranks(b)) : null);
const mean = (xs: readonly number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const sd = (xs: readonly number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
};
const median = (xs: readonly number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

function logGamma(x: number): number {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x;
  const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let ser = 1.000000000190015;
  for (const v of c) ser += v / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}
/** P(χ² with `df` degrees of freedom ≥ x): the upper tail, from the regularised incomplete gamma function. */
export function chiSquareUpper(x: number, df: number): number {
  if (!(df > 0) || !(x > 0)) return 1;
  const a = df / 2;
  const z = x / 2;
  const gln = logGamma(a);
  if (z < a + 1) {
    let sum = 1 / a;
    let del = sum;
    let ap = a;
    for (let n = 0; n < 500; n++) {
      ap += 1;
      del *= z / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-14) break;
    }
    return Math.max(0, 1 - sum * Math.exp(-z + a * Math.log(z) - gln));
  }
  let b = z + 1 - a;
  let c = 1 / 1e-300;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c;
    if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  return Math.min(1, Math.exp(-z + a * Math.log(z) - gln) * h);
}

/** A small seeded generator (mulberry32): the audit's bootstrap gives the same answer on the same data. */
export function seededRandom(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * The empirical-Bayes score: the posterior mean of a member's ratio of points to expected points,
 * given their expected points X, their points' variance V and the board's skill spread τ:
 * 100 × (P + C) ÷ (X + C) with C = V ÷ (X τ²). Production's +40 is this with C fixed at 40.
 * Worked example: P 120, X 100, V 225, τ 0.15 → C = 225 ÷ (100 × 0.0225) = 100 → 100 × 220 ÷ 200 = 110.
 */
export function ebScore(points: number, expected: number, variance: number, tau: number): number {
  const c = expected > 0 ? variance / (expected * tau * tau) : 0;
  return (100 * (points + c)) / (expected + c);
}

/** The board's squared skill spread by moments: the variance of the members' ratios P ÷ X beyond what chance gives them (negative when chance explains more than the spread). */
function momentTau2(parts: ReadonlyArray<{ P: number; X: number; V: number }>): number {
  const ok = parts.filter((p) => p.X > 0);
  const rho = ok.map((p) => p.P / p.X);
  const v = ok.map((p) => p.V / p.X ** 2);
  return (sd(rho) ** 2 || 0) - mean(v);
}

/** The board's skill spread for the EB cushion, by moments: the ratios' spread beyond what chance gives, held within TAU_RANGE (the models score with this). */
export function ebTau(parts: ReadonlyArray<{ P: number; X: number; V: number }>): number {
  return Math.sqrt(Math.min(TAU_RANGE[1] ** 2, Math.max(TAU_RANGE[0] ** 2, momentTau2(parts))));
}

/** The same spread before the clamp (0 when chance explains it all): what the board itself says, which rule R4 reads on both sides of 0.12–0.40. */
export function ebTauRaw(parts: ReadonlyArray<{ P: number; X: number; V: number }>): number {
  return Math.sqrt(Math.max(0, momentTau2(parts)));
}

/* ---------------- the models ---------------- */

interface GameDesc {
  role: GameRole | null;
  championId: string | null;
  kills: number | null;
  queueId: number | null;
  seconds: number | null;
  /** The game's pace bucket (null when unknown). */
  bucket: number | null;
}

type Scoring = "cushion" | "eb";
interface Model {
  key: ModelKey;
  rates: (g: GameDesc) => K4;
  scoring: Scoring;
  /** Scaled by the member's own-games factor. */
  ownGames: boolean;
}

export interface ModelResult {
  key: ModelKey;
  /** Each ranked member's score, in `input.members` order (internal: the summary prints aggregates only). */
  scores: number[];
  /** The EB models' skill spread as scored (held within TAU_RANGE); null for the +40 models. */
  tau: number | null;
  /** The same spread before the clamp (rule R4 reads it); null for the +40 models. */
  tauRaw: number | null;
  rankCorrelationWithM0: number | null;
  sameFirstAsM0: boolean;
  sameTopThreeAsM0: boolean;
  meanPlaceShift: number;
  maxPlaceShift: number;
  scoreSpread: number;
  splitHalf: number | null;
  splitHalfSpearmanBrown: number | null;
  bootstrapFirstStays: number;
  bootstrapMaxFirst: number;
  bootstrapMembersWithFirstChance: number;
  bootstrapStability: number | null;
  scoreVsGames: number | null;
  scoreVsSupportShare: number | null;
  scoreVsChampionPropensity: number | null;
  scoreVsFastQueueShare: number | null;
  scoreVsOwnGamesFactor: number | null;
  placeboSpread: number | null;
  placeboVsMemberScore: number | null;
  placeboVsOwnGamesFactor: number | null;
}

export interface Evaluation {
  ready: boolean;
  /** Why the models were not compared (fewer than 3 ranked members, or no comparison of other players). */
  reason: string | null;
  members: number;
  memberGames: number;
  /** M0 computed here equals production's scoreMember for every member (a guard on the adapter). */
  m0MatchesProduction: boolean;
  models: Partial<Record<ModelKey, ModelResult>>;
  environment: {
    ownGames: Array<{ both: number; ally: number; opponents: number; seLog: number }>;
    tauBeyondNoise: number | null;
    homogeneityP: number | null;
    alliesVsOpponents: number | null;
    meanAbsLogAllyMinusOpponent: number | null;
  };
  pool: {
    comparisonGames: number;
    groups: number;
    paceMean: number | null;
    perGame: Partial<Record<GameRole, K4>>;
    championSpread: number | null;
    kindSpread: number[] | null;
    highPropensityLargerKinds: { observed: number; expected: number; ratio: number | null; ci95: [number, number] | null };
    queueFactor: Partial<Record<GameRole, Array<{ factor: number | null; games: number }>>>;
    paceFactor: Partial<Record<GameRole, Array<{ factor: number | null; games: number }>>>;
    overdispersion: number | null;
    m0CushionImpliedTau: number | null;
    laneOpponentGames: number;
  };
}

const EMPTY_POOL = (baseline: MultikillBaseline): Evaluation["pool"] => ({ comparisonGames: baseline.all.games, groups: Object.keys(baseline.champions).length, paceMean: null, perGame: {}, championSpread: null, kindSpread: null, highPropensityLargerKinds: { observed: 0, expected: 0, ratio: null, ci95: null }, queueFactor: {}, paceFactor: {}, overdispersion: null, m0CushionImpliedTau: null, laneOpponentGames: 0 });

/** Every model on the board's ranked members (`seed`: the bootstrap's, fixed so a run on the same data gives the same answer). */
export function evaluateMultikillModels(input: AuditInput, options: { draws?: number; seed?: number } = {}): Evaluation {
  const { baseline, aggregates: agg } = input;
  const members = input.members.filter((m) => m.games.length > 0);
  const memberGames = members.reduce((n, m) => n + m.games.length, 0);
  const empty = (reason: string): Evaluation => ({ ready: false, reason, members: members.length, memberGames, m0MatchesProduction: true, models: {}, environment: { ownGames: [], tauBeyondNoise: null, homogeneityP: null, alliesVsOpponents: null, meanAbsLogAllyMinusOpponent: null }, pool: EMPTY_POOL(baseline) });
  if (baseline.source !== "same-games" || baseline.all.games < BASELINE_MIN_GAMES) return empty(`the comparison holds ${baseline.all.games} other players' games, under ${BASELINE_MIN_GAMES}: the board compares with the team's own games`);
  if (members.length < 3) return empty(`${members.length} ranked members: at least 3 are needed to compare places`);
  const rule = baseline.reading.rule;
  const allRates: K4 = scale(k4(baseline.all.events), 1 / baseline.all.games);

  /* --- the comparison's structure --- */
  const roleRate = (role: GameRole): K4 => {
    const g = baseline.roles[role];
    const out = ZERO4();
    for (let k = 0; k < 4; k++) out[k] = ((g ? k4(g.events)[k]! : 0) + ROLE_PRIOR_GAMES * allRates[k]!) / ((g?.games ?? 0) + ROLE_PRIOR_GAMES);
    return out;
  };
  const rr = Object.fromEntries(ROLES.map((r) => [r, roleRate(r)])) as Record<GameRole, K4>;
  // Champion tendency against every position (M2): the champion's games on any role.
  const champAll = new Map<string, { games: number; events: number }>();
  for (const [key, c] of Object.entries(baseline.champions)) {
    const id = key.slice(key.indexOf("|") + 1);
    const v = champAll.get(id) ?? { games: 0, events: 0 };
    v.games += c.games;
    v.events += sum4(k4(c.events));
    champAll.set(id, v);
  }
  // Per-kind champion rates (M4): the champion's tendency and each kind's deviation from it, shrunk by moments.
  const champs = Object.entries(baseline.champions).flatMap(([key, c]) => {
    const role = key.slice(0, key.indexOf("|")) as GameRole;
    return ROLES.includes(role) ? [{ key, role, games: c.games, ev: k4(c.events) }] : [];
  });
  let num = 0;
  let den = 0;
  for (const c of champs) {
    const lam = c.games * sum4(rr[c.role]);
    num += (sum4(c.ev) - lam) ** 2 - lam;
    den += lam * lam;
  }
  const s2F = den > 0 ? Math.min(1, Math.max(0.005, num / den)) : null;
  const F = new Map(champs.map((c) => [c.key, s2F === null ? 1 : (sum4(c.ev) + 1 / s2F) / (c.games * sum4(rr[c.role]) + 1 / s2F)]));
  const s2k = s2F === null ? null : [0, 1, 2, 3].map((k) => {
    let n2 = 0;
    let d2 = 0;
    for (const c of champs) {
      const lam = c.games * rr[c.role][k]! * F.get(c.key)!;
      n2 += (c.ev[k]! - lam) ** 2 - lam;
      d2 += lam * lam;
    }
    return Math.min(2, Math.max(0.005, n2 / Math.max(1e-9, d2)));
  });
  const champByKey = new Map(champs.map((c) => [c.key, c]));
  const kindRate = (role: GameRole | null, championId: string | null): K4 => {
    if (!role) return [...allRates] as K4;
    const base = rr[role];
    const c = championId ? champByKey.get(`${role}|${championId}`) : undefined;
    if (!c || !s2k) return [...base] as K4;
    const f = F.get(c.key)!;
    return base.map((b, k) => b * f * ((c.ev[k]! + 1 / s2k[k]!) / (c.games * b * f + 1 / s2k[k]!))) as K4;
  };
  // Opportunity factors (M1a, M1b, M1d): the role's points per game at that level against the role's own rate in the same table.
  const factorTable = (rows: ReadonlyArray<{ position: string | null; level: number; games: number; points: number }>) => {
    const cells = new Map<string, { games: number; points: number }>();
    const totals = new Map<GameRole, { games: number; points: number }>();
    for (const r of rows) {
      const role = roleOfPosition(r.position);
      if (!role) continue;
      const key = `${role}|${r.level}`;
      const v = cells.get(key) ?? { games: 0, points: 0 };
      v.games += r.games;
      v.points += r.points;
      cells.set(key, v);
      const t = totals.get(role) ?? { games: 0, points: 0 };
      t.games += r.games;
      t.points += r.points;
      totals.set(role, t);
    }
    const factor = (role: GameRole | null, level: number | null, lean = FACTOR_LEAN_GAMES): number | null => {
      if (!role || level === null) return null;
      const t = totals.get(role);
      if (!t || t.games <= 0 || t.points <= 0) return null;
      const rate = t.points / t.games;
      const v = cells.get(`${role}|${level}`) ?? { games: 0, points: 0 };
      return v.games + lean > 0 ? (v.points + lean * rate) / ((v.games + lean) * rate) : null;
    };
    return { factor, games: (role: GameRole, level: number) => cells.get(`${role}|${level}`)?.games ?? 0 };
  };
  const killsT = factorTable(agg.byKills.map((r) => ({ position: r.position, level: Math.min(KILLS_CAP, Math.max(0, r.kills)), games: r.games, points: r.points })));
  const queueRows = new Map<string, { position: string | null; level: number; games: number; points: number }>();
  const seconds = new Map<GameRole, { games: number; seconds: number }>();
  for (const r of agg.byQueue) {
    const level = queueGroup(r.queueId);
    const key = `${r.position ?? ""}|${level}`;
    const v = queueRows.get(key) ?? { position: r.position, level, games: 0, points: 0 };
    v.games += r.games;
    v.points += r.points;
    queueRows.set(key, v);
    const role = roleOfPosition(r.position);
    if (role) {
      const s = seconds.get(role) ?? { games: 0, seconds: 0 };
      s.games += r.games;
      s.seconds += r.seconds;
      seconds.set(role, s);
    }
  }
  const queueT = factorTable([...queueRows.values()]);
  const paceT = factorTable(agg.byPace.map((r) => ({ position: r.position, level: r.bucket, games: r.games, points: r.points })));
  const meanSeconds = (role: GameRole | null) => {
    const s = role ? seconds.get(role) : undefined;
    return s && s.games > 0 ? s.seconds / s.games : null;
  };

  /* --- the models' expected rates for one game --- */
  const m0 = (g: GameDesc): K4 => k4(expectedRates(baseline, g.role, g.championId).rates);
  const times = (x: K4, f: number | null) => (f === null || !Number.isFinite(f) ? x : scale(x, f));
  const models: Model[] = [
    { key: "M0", rates: m0, scoring: "cushion", ownGames: false },
    { key: "Mflat", rates: () => [...allRates] as K4, scoring: "cushion", ownGames: false },
    {
      key: "M2",
      rates: (g) => {
        const c = g.championId ? champAll.get(g.championId) : undefined;
        const per = sum4(allRates);
        return c && per > 0 ? scale(allRates, (c.events + CHAMPION_PRIOR_GAMES * per) / ((c.games + CHAMPION_PRIOR_GAMES) * per)) : ([...allRates] as K4);
      },
      scoring: "cushion",
      ownGames: false,
    },
    { key: "M3", rates: (g) => k4(expectedRates(baseline, g.role, null).rates), scoring: "cushion", ownGames: false },
    { key: "M1a", rates: (g) => times(m0(g), killsT.factor(g.role, g.kills === null ? null : Math.min(KILLS_CAP, Math.max(0, g.kills)))), scoring: "cushion", ownGames: false },
    { key: "M1b", rates: (g) => times(m0(g), paceT.factor(g.role, g.bucket)), scoring: "cushion", ownGames: false },
    {
      key: "M1c",
      rates: (g) => {
        const m = meanSeconds(g.role);
        return times(m0(g), m && g.seconds ? g.seconds / m : null);
      },
      scoring: "cushion",
      ownGames: false,
    },
    { key: "M1d", rates: (g) => times(m0(g), queueT.factor(g.role, queueGroup(g.queueId))), scoring: "cushion", ownGames: false },
    { key: "M0eb", rates: m0, scoring: "eb", ownGames: false },
    { key: "M4", rates: (g) => kindRate(g.role, g.championId), scoring: "eb", ownGames: false },
    { key: "M5", rates: m0, scoring: "cushion", ownGames: true },
    { key: "M5eb", rates: (g) => kindRate(g.role, g.championId), scoring: "eb", ownGames: true },
  ];

  /* --- the members' own-games factors (M5): the others in their games against M0's expectation --- */
  const lobby = new Map<number, { allyP: number; allyX: number; allyV: number; oppP: number; oppX: number; oppV: number }>();
  for (const r of agg.ownGames) {
    const x = m0({ role: roleOfPosition(r.position), championId: r.championId, kills: null, queueId: null, seconds: null, bucket: null });
    const v = lobby.get(r.member) ?? { allyP: 0, allyX: 0, allyV: 0, oppP: 0, oppX: 0, oppV: 0 };
    if (r.ally) {
      v.allyP += r.points;
      v.allyX += r.games * pts(x);
      v.allyV += r.games * var4(x);
    } else {
      v.oppP += r.points;
      v.oppX += r.games * pts(x);
      v.oppV += r.games * var4(x);
    }
    lobby.set(r.member, v);
  }
  const L = (index: number, which: "both" | "ally" | "opp" = "both") => {
    const v = lobby.get(index);
    if (!v) return 1;
    const P = which === "ally" ? v.allyP : which === "opp" ? v.oppP : v.allyP + v.oppP;
    const X = which === "ally" ? v.allyX : which === "opp" ? v.oppX : v.allyX + v.oppX;
    return ownGamesFactor(P, X);
  };

  /* --- over-dispersion of one game's points about M0's expectation, from the lane opponents' (per-game) cells --- */
  let sq = 0;
  let pv = 0;
  let laneOpponentGames = 0;
  const rankedIndexes = new Set(members.map((m) => m.index));
  for (const c of agg.opponents) {
    const x = m0({ role: roleOfPosition(c.position), championId: c.championId, kills: null, queueId: null, seconds: null, bucket: null });
    const e = pts(x);
    sq += c.pointsSq - 2 * e * c.points + c.games * e * e;
    pv += c.games * var4(x);
    // The ranked members' games with a lane opponent (the dispersion reads every member's).
    if (rankedIndexes.has(c.member)) laneOpponentGames += c.games;
  }
  const od = pv > 0 ? sq / pv : 1;
  const odUsed = Math.max(1, od);

  /* --- per game, per model: points made, points expected, their variance --- */
  const descOf = (g: AuditGame): GameDesc => ({ role: g.role, championId: g.championId, kills: g.kills, queueId: g.queueId, seconds: g.durationS, bucket: agg.paceMean && agg.paceMean > 0 && g.gameKills !== null && g.kills !== null ? paceBucket((g.gameKills - g.kills) / agg.paceMean) : null });
  const made = members.map((m) => m.games.map((g) => pts(k4(multikillEvents(g.counts, rule)))));
  const perGame = models.map((model) =>
    members.map((m) => {
      const f = model.ownGames ? L(m.index) : 1;
      return m.games.map((g) => {
        const x = model.rates(descOf(g));
        return { X: f * pts(x), V: f * odUsed * var4(x) };
      });
    }),
  );
  const scoreParts = (mi: number, model: number, pick?: readonly number[]) => {
    const idx = pick ?? made[mi]!.map((_, i) => i);
    let P = 0;
    let X = 0;
    let V = 0;
    for (const i of idx) {
      P += made[mi]![i]!;
      X += perGame[model]![mi]![i]!.X;
      V += perGame[model]![mi]![i]!.V;
    }
    return { P, X, V };
  };
  const scoresOf = (model: number, parts: Array<{ P: number; X: number; V: number }>): { scores: number[]; tau: number | null; tauRaw: number | null } => {
    if (models[model]!.scoring === "cushion") return { scores: parts.map((p) => (100 * (p.P + MULTIKILL_CUSHION)) / (p.X + MULTIKILL_CUSHION)), tau: null, tauRaw: null };
    const tau = ebTau(parts);
    return { scores: parts.map((p) => ebScore(p.P, p.X, p.V, tau)), tau, tauRaw: ebTauRaw(parts) };
  };

  // Guard: M0 here is production's score (scoreMember) for every member.
  const m0Full = scoresOf(0, members.map((_, mi) => scoreParts(mi, 0))).scores;
  const m0MatchesProduction = members.every((m, mi) => {
    const s = scoreMember(m.id, m.games.map((g) => ({ role: g.role, championId: g.championId, counts: g.counts })), baseline).score;
    return s !== null && Math.abs(s - m0Full[mi]!) < 1e-6;
  });

  const order = (scores: readonly number[]) => scores.map((_, i) => i).sort((i, j) => Math.round(scores[j]!) - Math.round(scores[i]!) || members[j]!.games.length - members[i]!.games.length || i - j);
  const placesOf = (scores: readonly number[]) => {
    const places = new Array<number>(scores.length).fill(0);
    order(scores).forEach((i, p) => (places[i] = p + 1));
    return places;
  };
  const m0Places = placesOf(m0Full);
  const m0First = order(m0Full)[0]!;
  const m0Top3 = new Set(order(m0Full).slice(0, 3));

  // Covariates of each member's games.
  const gamesN = members.map((m) => m.games.length);
  const supportShare = members.map((m) => m.games.filter((g) => g.role === "SUPPORT").length / m.games.length);
  const fastShare = members.map((m) => m.games.filter((g) => queueGroup(g.queueId) >= 2).length / m.games.length);
  const champProp = members.map((m) => mean(m.games.map((g) => (g.role ? (F.get(`${g.role}|${g.championId}`) ?? 1) : 1))));
  const lobbyBoth = members.map((m) => L(m.index));

  // Bootstrap: the same resampled games for every model in a draw (paired), a fixed seed.
  const draws = options.draws ?? BOOTSTRAP_DRAWS;
  const rnd = seededRandom(options.seed ?? 20_261_127);
  const picks = Array.from({ length: draws }, () => members.map((m) => m.games.map(() => Math.floor(rnd() * m.games.length))));
  const halves = (h: 0 | 1) => members.map((m) => m.games.flatMap((g, i) => (g.half === h ? [i] : [])));
  const half0 = halves(0);
  const half1 = halves(1);

  const results: Partial<Record<ModelKey, ModelResult>> = {};
  models.forEach((model, mIndex) => {
    const { scores, tau, tauRaw } = scoresOf(mIndex, members.map((_, mi) => scoreParts(mi, mIndex)));
    const places = placesOf(scores);
    const first = order(scores)[0]!;
    const top3 = new Set(order(scores).slice(0, 3));
    const shifts = places.map((p, i) => Math.abs(p - m0Places[i]!));
    const canSplit = members.every((_, mi) => half0[mi]!.length > 0 && half1[mi]!.length > 0);
    const A = canSplit ? scoresOf(mIndex, members.map((_, mi) => scoreParts(mi, mIndex, half0[mi]))).scores : [];
    const B = canSplit ? scoresOf(mIndex, members.map((_, mi) => scoreParts(mi, mIndex, half1[mi]))).scores : [];
    const sh = canSplit ? spearman(A, B) : null;
    const firsts = new Array<number>(members.length).fill(0);
    let stability = 0;
    let stabilityN = 0;
    for (const pick of picks) {
      const s = scoresOf(mIndex, members.map((_, mi) => scoreParts(mi, mIndex, pick[mi]))).scores;
      firsts[order(s)[0]!]! += 1;
      const r = spearman(s, scores);
      if (r !== null) {
        stability += r;
        stabilityN += 1;
      }
    }
    // Placebo: each member's lane opponents in the same games, scored as if they were the member (M5: the allies-only factor).
    const placebo = members.map((m) => {
      const f = model.ownGames ? L(m.index, "ally") : 1;
      let P = 0;
      let X = 0;
      let n = 0;
      for (const c of agg.opponents) {
        if (c.member !== m.index) continue;
        P += c.points;
        X += c.games * f * pts(model.rates({ role: roleOfPosition(c.position), championId: c.championId, kills: c.kills, queueId: c.queueId, seconds: c.minutes * 60, bucket: c.bucket }));
        n += c.games;
      }
      return n > 0 ? (100 * (P + MULTIKILL_CUSHION)) / (X + MULTIKILL_CUSHION) : null;
    });
    const withPlacebo = placebo.flatMap((p, i) => (p === null ? [] : [i]));
    const pick = (xs: readonly number[]) => withPlacebo.map((i) => xs[i]!);
    const placeboValues = withPlacebo.map((i) => placebo[i]!);
    results[model.key] = {
      key: model.key,
      scores,
      tau,
      tauRaw,
      rankCorrelationWithM0: spearman(scores, m0Full),
      sameFirstAsM0: first === m0First,
      sameTopThreeAsM0: top3.size === m0Top3.size && [...top3].every((i) => m0Top3.has(i)),
      meanPlaceShift: mean(shifts),
      maxPlaceShift: Math.max(...shifts),
      scoreSpread: sd(scores),
      splitHalf: sh,
      splitHalfSpearmanBrown: sh === null ? null : (2 * sh) / (1 + sh),
      bootstrapFirstStays: draws ? firsts[first]! / draws : 0,
      bootstrapMaxFirst: draws ? Math.max(...firsts) / draws : 0,
      bootstrapMembersWithFirstChance: firsts.filter((n) => draws && n / draws >= 0.05).length,
      bootstrapStability: stabilityN ? stability / stabilityN : null,
      scoreVsGames: spearman(scores, gamesN),
      scoreVsSupportShare: spearman(scores, supportShare),
      scoreVsChampionPropensity: spearman(scores, champProp),
      scoreVsFastQueueShare: spearman(scores, fastShare),
      scoreVsOwnGamesFactor: spearman(scores, lobbyBoth),
      placeboSpread: placeboValues.length >= 2 ? sd(placeboValues) : null,
      placeboVsMemberScore: spearman(placeboValues, pick(scores)),
      placeboVsOwnGamesFactor: spearman(placeboValues, pick(lobbyBoth)),
    };
  });

  /* --- environment: do members' own games differ beyond chance? --- */
  const own = members.map((m) => {
    const v = lobby.get(m.index);
    const X = v ? v.allyX + v.oppX : 0;
    const V = v ? v.allyV + v.oppV : 0;
    return { both: L(m.index), ally: L(m.index, "ally"), opponents: L(m.index, "opp"), seLog: Math.sqrt(odUsed * V) / (X + OWN_GAMES_CUSHION) };
  });
  const logs = own.map((o) => Math.log(o.both));
  const w = own.map((o) => (o.seLog > 0 ? 1 / o.seLog ** 2 : 0));
  const wSum = w.reduce((s, x) => s + x, 0);
  const wMean = wSum > 0 ? logs.reduce((s, x, i) => s + x * w[i]!, 0) / wSum : 0;
  const chi2 = logs.reduce((s, x, i) => s + w[i]! * (x - wMean) ** 2, 0);
  const tau2 = sd(logs) ** 2 - mean(own.map((o) => o.seLog ** 2));

  /* --- the comparison's structure, for the record (and to calibrate the simulation) --- */
  let hiObs = 0;
  let hiExp = 0;
  for (const c of champs) {
    const f = F.get(c.key)!;
    if (f < 1.2) continue;
    hiObs += c.ev[1] + c.ev[2] + c.ev[3];
    hiExp += c.games * f * (rr[c.role][1] + rr[c.role][2] + rr[c.role][3]);
  }
  const ratio = hiExp > 0 ? hiObs / hiExp : null;
  const phi = pts(allRates) > 0 ? var4(allRates) / pts(allRates) : null;
  const table = (t: ReturnType<typeof factorTable>, levels: number) => Object.fromEntries(ROLES.filter((r) => baseline.roles[r]).map((r) => [r, Array.from({ length: levels }, (_, l) => ({ factor: t.factor(r, l, 0), games: t.games(r, l) }))]));

  return {
    ready: true,
    reason: null,
    members: members.length,
    memberGames,
    m0MatchesProduction,
    models: results,
    environment: {
      ownGames: own,
      tauBeyondNoise: Math.sqrt(Math.max(0, tau2)),
      homogeneityP: wSum > 0 ? chiSquareUpper(chi2, members.length - 1) : null,
      alliesVsOpponents: spearman(own.map((o) => o.ally), own.map((o) => o.opponents)),
      meanAbsLogAllyMinusOpponent: mean(own.map((o) => Math.abs(Math.log(o.ally) - Math.log(o.opponents)))),
    },
    pool: {
      comparisonGames: baseline.all.games,
      groups: Object.keys(baseline.champions).length,
      paceMean: agg.paceMean,
      perGame: Object.fromEntries(ROLES.filter((r) => baseline.roles[r]).map((r) => [r, scale(k4(baseline.roles[r]!.events), 1 / baseline.roles[r]!.games)])),
      championSpread: s2F === null ? null : Math.sqrt(s2F),
      kindSpread: s2k ? s2k.map(Math.sqrt) : null,
      highPropensityLargerKinds: { observed: hiObs, expected: hiExp, ratio, ci95: ratio !== null && hiObs > 0 ? [ratio * Math.exp(-1.96 / Math.sqrt(hiObs)), ratio * Math.exp(1.96 / Math.sqrt(hiObs))] : null },
      queueFactor: table(queueT, QUEUE_GROUPS.length),
      paceFactor: table(paceT, PACE_EDGES.length + 1),
      overdispersion: pv > 0 ? od : null,
      m0CushionImpliedTau: phi !== null ? Math.sqrt((odUsed * phi) / MULTIKILL_CUSHION) : null,
      laneOpponentGames,
    },
  };
}

/* ---------------- the decision rule (docs/TEAM_LEADERBOARDS.md, "Fairness evaluation") ---------------- */

export type AuditOutcome = "not-enough-data" | "keep" | "candidate" | "inconclusive";
export interface AuditDecision {
  outcome: AuditOutcome;
  /** Which rules hold, each with what decided it. */
  rules: Record<"R0" | "R1" | "R2" | "R3" | "R4", { met: boolean; why: string[] }>;
  /** What must happen before any formula change: never the audit alone. */
  next: string;
}

/**
 * The rule written down before the audit ran (the design map, section D):
 *  R0 precondition: 5+ ranked members and 1,000+ comparison games; else no decision, keep M0.
 *  R1 keep M0: the members' own games do not differ beyond chance (spread < 0.04 and homogeneity
 *     p > 0.05), every queue group with 300+ games within ±8% of 1, and M0's placebo does not follow
 *     the member's score (|ρ| < 0.3).
 *  R2 candidate M5: own games differ (spread ≥ 0.05, p < 0.01), allies and opponents agree
 *     (ρ ≥ 0.5, mean |log ratio| < 0.05: it is the environment, not the member's effect on the
 *     others), M0's placebo follows the member (|ρ| ≥ 0.4) and M5's placebo at most half as much.
 *  R3 per-kind champion rates too (M5eb): R2, and the high-propensity champions' larger kinds above
 *     equal tendency (95% interval above 1.15).
 *  R4 the cushion stays 40 unless the EB spread lies outside 0.12–0.40 (to confirm a month later):
 *     the board's spread before TAU_RANGE's clamp, which holds only the scoring, so both sides can hold.
 * A candidate still needs the simulation re-run with these figures and the owner's approval.
 */
export function decideMultikillAudit(e: Evaluation): AuditDecision {
  const f = (x: number | null | undefined, d = 2) => (x === null || x === undefined ? "n/a" : x.toFixed(d));
  const r0 = { met: e.ready && e.members >= 5 && e.pool.comparisonGames >= BASELINE_MIN_GAMES, why: [`${e.members} ranked members (5 needed)`, `${e.pool.comparisonGames} comparison games (${BASELINE_MIN_GAMES} needed)`] };
  const env = e.environment;
  const m0 = e.models.M0;
  const m5 = e.models.M5;
  const queues = Object.values(e.pool.queueFactor).flatMap((rows) => rows ?? []).filter((q) => q.games >= 300 && q.factor !== null);
  const queuesClose = queues.every((q) => Math.abs(q.factor! - 1) <= 0.08);
  const tauL = env.tauBeyondNoise;
  const p = env.homogeneityP;
  const placebo0 = m0?.placeboVsMemberScore ?? null;
  const placebo5 = m5?.placeboVsMemberScore ?? null;
  const r1 = {
    met: r0.met && tauL !== null && tauL < 0.04 && p !== null && p > 0.05 && queuesClose && placebo0 !== null && Math.abs(placebo0) < 0.3,
    why: [`own-games spread beyond chance ${f(tauL, 3)} (under 0.04 to keep)`, `homogeneity p ${f(p, 3)} (over 0.05 to keep)`, `${queues.filter((q) => Math.abs(q.factor! - 1) > 0.08).length} of ${queues.length} queue groups with 300+ games outside ±8%`, `M0 placebo against the member's score ${f(placebo0)} (|ρ| under 0.3 to keep)`],
  };
  const agree = env.alliesVsOpponents !== null && env.alliesVsOpponents >= 0.5 && env.meanAbsLogAllyMinusOpponent !== null && env.meanAbsLogAllyMinusOpponent < 0.05;
  const r2 = {
    met: r0.met && tauL !== null && tauL >= 0.05 && p !== null && p < 0.01 && agree && placebo0 !== null && Math.abs(placebo0) >= 0.4 && placebo5 !== null && Math.abs(placebo5) <= Math.abs(placebo0) / 2,
    why: [`own-games spread ${f(tauL, 3)} (0.05+), p ${f(p, 3)} (under 0.01)`, `allies against opponents ρ ${f(env.alliesVsOpponents)} (0.5+), mean |log ratio| ${f(env.meanAbsLogAllyMinusOpponent, 3)} (under 0.05)${agree ? "" : ": if only this fails, build the factor from allies only"}`, `placebo M0 ${f(placebo0)} (|ρ| 0.4+), M5 ${f(placebo5)} (at most half of M0's)`],
  };
  const ci = e.pool.highPropensityLargerKinds.ci95;
  const r3 = { met: r2.met && ci !== null && ci[0] > 1.15, why: [`high-propensity champions' triples and larger against equal tendency: ${f(e.pool.highPropensityLargerKinds.ratio)} (95% ${ci ? `${f(ci[0])}–${f(ci[1])}` : "n/a"}; lower bound above 1.15 needed)`] };
  // The spread before the clamp: the clamped one (TAU_RANGE, at most 0.35) could never pass 0.40.
  const tau = e.models.M0eb?.tauRaw ?? null;
  const r4 = { met: tau !== null && Number.isFinite(tau) && (tau < 0.12 || tau > 0.4), why: [`EB skill spread ${f(tau)} before the scoring's clamp to ${TAU_RANGE[0]}–${TAU_RANGE[1]} (a cushion other than 40 only outside 0.12–0.40, in two audits a month apart)`] };
  const outcome: AuditOutcome = !r0.met ? "not-enough-data" : r2.met ? "candidate" : r1.met ? "keep" : "inconclusive";
  const next =
    outcome === "candidate"
      ? `Re-run the simulation calibrated with these figures (scripts/research/multikill-sim); change the formula only if it shows M5 at least 0.04 more often first and 0.05 higher rank correlation than M0, and the owner approves.${r3.met ? " Consider per-kind champion rates (M5eb) in the same simulation." : ""}`
      : outcome === "keep"
        ? "Keep the production formula; record these figures in docs/TEAM_LEADERBOARDS.md (Fairness evaluation) in place of the breakdown's 'not measured' caveat."
        : outcome === "not-enough-data"
          ? "No decision: keep the production formula and run the check again when the board has more ranked members or games."
          : "No rule holds: keep the production formula, record the figures, and run the check again in a month.";
  return { outcome, rules: { R0: r0, R1: r1, R2: r2, R3: r3, R4: r4 }, next };
}

/* ---------------- the printed summary: anonymous aggregates only ---------------- */

const r = (x: number | null | undefined, d = 2) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);

/**
 * What the job prints (and the public Actions log shows): counts, rates, factors and correlations
 * across the board. No member is named, labelled or placed: no player id, name, PUUID, match id, and
 * no per-member score or place (each member's own-games factor appears only as the spread's
 * minimum, median and maximum).
 */
export function auditSummary(e: Evaluation, extra: { season: number; counting: string; cost?: Record<string, number> }) {
  const decision = decideMultikillAudit(e);
  const own = e.environment.ownGames.map((o) => o.both);
  return {
    scope: { season: extra.season, counting: extra.counting, comparisonGames: e.pool.comparisonGames, groups: e.pool.groups, membersRanked: e.members, memberGames: e.memberGames, laneOpponentGames: e.pool.laneOpponentGames, ready: e.ready, ...(e.reason ? { reason: e.reason } : {}) },
    decision,
    m0MatchesProduction: e.m0MatchesProduction,
    environment: {
      ownGamesFactor: own.length ? { min: r(Math.min(...own)), median: r(median(own)), max: r(Math.max(...own)) } : null,
      tauBeyondNoise: r(e.environment.tauBeyondNoise, 3),
      homogeneityP: r(e.environment.homogeneityP, 4),
      alliesVsOpponents: r(e.environment.alliesVsOpponents),
      meanAbsLogAllyMinusOpponent: r(e.environment.meanAbsLogAllyMinusOpponent, 3),
    },
    pool: {
      paceMean: r(e.pool.paceMean),
      perGame: Object.fromEntries(Object.entries(e.pool.perGame).map(([role, x]) => [role, x!.map((v) => r(v, 4))])),
      championSpread: r(e.pool.championSpread),
      kindSpread: e.pool.kindSpread?.map((v) => r(v)) ?? null,
      highPropensityLargerKinds: { observed: e.pool.highPropensityLargerKinds.observed, expectedEqualTendency: r(e.pool.highPropensityLargerKinds.expected, 1), ratio: r(e.pool.highPropensityLargerKinds.ratio), ci95: e.pool.highPropensityLargerKinds.ci95?.map((v) => r(v)) ?? null },
      queueGroups: QUEUE_GROUPS,
      queueFactor: Object.fromEntries(Object.entries(e.pool.queueFactor).map(([role, rows]) => [role, rows!.map((q) => ({ factor: r(q.factor), games: q.games }))])),
      paceFactor: Object.fromEntries(Object.entries(e.pool.paceFactor).map(([role, rows]) => [role, rows!.map((q) => ({ factor: r(q.factor), games: q.games }))])),
      overdispersion: r(e.pool.overdispersion),
      m0CushionImpliedTau: r(e.pool.m0CushionImpliedTau),
    },
    models: Object.fromEntries(
      MODEL_KEYS.flatMap((key) => {
        const m = e.models[key];
        if (!m) return [];
        return [
          [
            key,
            {
              label: MODEL_LABELS[key],
              tau: r(m.tau),
              tauRaw: r(m.tauRaw),
              rankCorrelationWithM0: r(m.rankCorrelationWithM0),
              sameFirstAsM0: m.sameFirstAsM0,
              sameTopThreeAsM0: m.sameTopThreeAsM0,
              meanPlaceShift: r(m.meanPlaceShift),
              maxPlaceShift: m.maxPlaceShift,
              scoreSpread: r(m.scoreSpread, 1),
              splitHalf: r(m.splitHalf),
              splitHalfSpearmanBrown: r(m.splitHalfSpearmanBrown),
              bootstrapFirstStays: r(m.bootstrapFirstStays),
              bootstrapMaxFirst: r(m.bootstrapMaxFirst),
              bootstrapMembersWithFirstChance: m.bootstrapMembersWithFirstChance,
              bootstrapStability: r(m.bootstrapStability),
              scoreVsGames: r(m.scoreVsGames),
              scoreVsSupportShare: r(m.scoreVsSupportShare),
              scoreVsChampionPropensity: r(m.scoreVsChampionPropensity),
              scoreVsFastQueueShare: r(m.scoreVsFastQueueShare),
              scoreVsOwnGamesFactor: r(m.scoreVsOwnGamesFactor),
              placeboSpread: r(m.placeboSpread, 1),
              placeboVsMemberScore: r(m.placeboVsMemberScore),
              placeboVsOwnGamesFactor: r(m.placeboVsOwnGamesFactor),
            },
          ],
        ];
      }),
    ),
    ...(extra.cost ? { cost: extra.cost } : {}),
  };
}
export type MultikillAuditSummary = ReturnType<typeof auditSummary>;
