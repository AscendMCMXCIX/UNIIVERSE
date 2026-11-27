import { describe, expect, it } from "vitest";
import { buildMultikillBaseline, type BaselineRow } from "./multikill-score";
import type { GameRole } from "./season-stats";
import {
  MODEL_KEYS,
  PACE_EDGES,
  auditSummary,
  chiSquareUpper,
  decideMultikillAudit,
  ebScore,
  ebTau,
  evaluateMultikillModels,
  ownGamesFactor,
  paceBucket,
  queueGroup,
  seededRandom,
  spearman,
  type AuditAggregates,
  type AuditInput,
  type AuditMember,
  type Evaluation,
} from "./multikill-models";

/*
  The multikill fairness check's models (domain/multikill-models): worked examples, the statistics,
  the decision rule, the privacy of the printed summary, and a small seeded simulation that
  reproduces the direction the design's larger one found (docs/TEAM_LEADERBOARDS.md, "Fairness
  evaluation, 27 Nov 2026"): scaling typical by the member's own games (M5) helps when members' games
  differ in how bloody they are, and costs next to nothing when they do not.
*/

type K4 = [number, number, number, number];
const ROLES: GameRole[] = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"];
const POSITION: Record<GameRole, string> = { TOP: "TOP", JUNGLE: "JUNGLE", MID: "MIDDLE", ADC: "BOTTOM", SUPPORT: "UTILITY" };
/** Events per game by kind (production-like: a mid makes about one double every two games). */
const BASE: Record<GameRole, K4> = { TOP: [0.38, 0.041, 0.0037, 0.0007], JUNGLE: [0.42, 0.051, 0.0084, 0.0019], MID: [0.47, 0.07, 0.011, 0.0022], ADC: [0.56, 0.086, 0.015, 0.0038], SUPPORT: [0.13, 0.012, 0.0016, 0.0002] };
const pts = (e: readonly number[]) => 2 * e[0]! + 3 * e[1]! + 4 * e[2]! + 5 * e[3]!;

function poisson(rnd: () => number, lambda: number): number {
  const l = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rnd();
  } while (p > l);
  return k - 1;
}
const lognormal = (rnd: () => number, s: number) => {
  const u = Math.max(1e-12, rnd());
  return Math.exp(s * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()));
};
/** Nested counters for these events (a pentakill also counted as a double, a triple and a quadra). */
const nested = (e: K4) => ({ double: e[0] + e[1] + e[2] + e[3], triple: e[1] + e[2] + e[3], quadra: e[2] + e[3], penta: e[3] });

/**
 * One board of nine members and the other players in their games, as the audit's statement would
 * answer it. `skill`: the members' true multikill skill spread; `lobby`: how much their games differ
 * in pace (not skill: every player in such a game makes more multikills).
 */
function world(seed: number, options: { skill: number; lobby: number; members?: number }): { input: AuditInput; truth: number[] } {
  const rnd = seededRandom(seed);
  const champs = Object.fromEntries(ROLES.map((r) => [r, Array.from({ length: 12 }, (_, i) => ({ id: `${r}${i}`, f: lognormal(rnd, 0.2) }))])) as Record<GameRole, Array<{ id: string; f: number }>>;
  const n = options.members ?? 9;
  const rows = new Map<string, BaselineRow>();
  const own = new Map<string, AuditAggregates["ownGames"][number]>();
  const opponents: AuditAggregates["opponents"] = [];
  const byQueue = new Map<string, AuditAggregates["byQueue"][number]>();
  const members: AuditMember[] = [];
  const truth: number[] = [];
  const play = (role: GameRole, champ: { id: string; f: number }, mult: number): K4 => BASE[role].map((b) => poisson(rnd, b * champ.f * mult)) as K4;
  for (let m = 0; m < n; m++) {
    const theta = lognormal(rnd, options.skill);
    const pace = lognormal(rnd, options.lobby);
    truth.push(theta);
    const main = ROLES[m % 5]!;
    const pool = [0, 1, 2].map(() => champs[main][Math.floor(rnd() * 12)]!);
    const games = 40 + Math.floor(rnd() * 260);
    const list: AuditMember["games"] = [];
    for (let g = 0; g < games; g++) {
      const champ = pool[Math.floor(rnd() * 3)]!;
      list.push({ role: main, championId: champ.id, counts: nested(play(main, champ, theta * pace)), queueId: 420, kills: null, durationS: 1800, gameKills: null, half: (g % 2) as 0 | 1 });
      // The other nine: four allies on the other roles, five opponents on every role.
      const others: Array<{ role: GameRole; ally: boolean }> = [...ROLES.filter((r) => r !== main).map((role) => ({ role, ally: true })), ...ROLES.map((role) => ({ role, ally: false }))];
      for (const o of others) {
        const c = champs[o.role][Math.floor(rnd() * 12)]!;
        const e = play(o.role, c, pace * lognormal(rnd, 0.25));
        const key = `${POSITION[o.role]}|${c.id}`;
        const row = rows.get(key) ?? { position: POSITION[o.role], championId: c.id, games: 0, nested: { double: 0, triple: 0, quadra: 0, penta: 0 }, separate: { double: 0, triple: 0, quadra: 0, penta: 0 } };
        row.games += 1;
        row.nested.double += e[0];
        row.nested.triple += e[1];
        row.nested.quadra += e[2];
        row.nested.penta += e[3];
        row.separate = row.nested;
        rows.set(key, row);
        const ok = `${m}|${o.ally}|${key}`;
        const cell = own.get(ok) ?? { member: m, ally: o.ally, position: POSITION[o.role], championId: c.id, games: 0, points: 0 };
        cell.games += 1;
        cell.points += pts(e);
        own.set(ok, cell);
        const q = byQueue.get(POSITION[o.role]) ?? { position: POSITION[o.role], queueId: 420, games: 0, points: 0, seconds: 0 };
        q.games += 1;
        q.points += pts(e);
        q.seconds += 1800;
        byQueue.set(POSITION[o.role], q);
        if (!o.ally && o.role === main) opponents.push({ member: m, half: (g % 2) as 0 | 1, position: POSITION[o.role], championId: c.id, kills: null, queueId: 420, bucket: null, minutes: 30, games: 1, points: pts(e), pointsSq: pts(e) ** 2 });
      }
    }
    members.push({ id: `player-${m}`, index: m, games: list });
  }
  const baseline = buildMultikillBaseline([...rows.values()], { withTriple: 1000, outOfOrder: 0 });
  return { input: { baseline, members, aggregates: { paceMean: null, byKills: [], byQueue: [...byQueue.values()], byPace: [], ownGames: [...own.values()], opponents } }, truth };
}

describe("worked examples", () => {
  it("the own-games factor: the other players made 110 kill points where 100 were expected, with 200 of lean", () => {
    expect(ownGamesFactor(110, 100)).toBeCloseTo(310 / 300, 10);
    expect(ownGamesFactor(0, 0)).toBe(1);
  });

  it("the empirical-Bayes score: P 120, X 100, V 225, τ 0.15 gives a cushion of 100 and 110", () => {
    expect(ebScore(120, 100, 225, 0.15)).toBeCloseTo(110, 10);
    // The board's spread by moments, held within 0.08–0.35.
    expect(ebTau([{ P: 100, X: 100, V: 100 }, { P: 100, X: 100, V: 100 }])).toBeCloseTo(0.08, 10);
    expect(ebTau([{ P: 300, X: 100, V: 1 }, { P: 10, X: 100, V: 1 }, { P: 100, X: 100, V: 1 }])).toBeCloseTo(0.35, 10);
  });

  it("Spearman's correlation, ties sharing their rank", () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1, 10);
    expect(spearman([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1, 10);
    expect(spearman([1, 1, 2, 3], [1, 2, 3, 4])).toBeCloseTo(0.9487, 3);
    expect(spearman([1, 2], [1, 2])).toBeNull();
    expect(spearman([1, 1, 1], [1, 2, 3])).toBeNull();
  });

  it("the χ² upper tail at the usual 5% points", () => {
    expect(chiSquareUpper(3.841, 1)).toBeCloseTo(0.05, 3);
    expect(chiSquareUpper(11.07, 5)).toBeCloseTo(0.05, 3);
    expect(chiSquareUpper(15.507, 8)).toBeCloseTo(0.05, 3);
    expect(chiSquareUpper(0, 8)).toBe(1);
    expect(chiSquareUpper(200, 8)).toBeLessThan(1e-12);
  });

  it("queue groups and pace buckets as the statement numbers them", () => {
    expect([420, 440, 700, 400, 430, 490, 480, null].map(queueGroup)).toEqual([0, 0, 0, 1, 2, 2, 3, 3]);
    // Postgres's width_bucket: 0 below the first edge, then one more at each edge reached.
    expect([0.2, 0.6, 0.85, 1, 1.24, 1.5, 9].map(paceBucket)).toEqual([0, 1, 2, 4, 5, 7, 7]);
    expect(PACE_EDGES).toHaveLength(7);
  });

  it("the seeded generator gives the same numbers for the same seed", () => {
    const a = seededRandom(7);
    const b = seededRandom(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe("evaluating the models on a board", () => {
  const { input } = world(11, { skill: 0.15, lobby: 0.1 });
  const e = evaluateMultikillModels(input, { draws: 50 });

  it("computes M0 exactly as production's scoreMember, and every model on every ranked member", () => {
    expect(e.ready).toBe(true);
    expect(e.m0MatchesProduction).toBe(true);
    expect(Object.keys(e.models).sort()).toEqual([...MODEL_KEYS].sort());
    for (const key of MODEL_KEYS) {
      expect(e.models[key]!.scores, key).toHaveLength(9);
      expect(e.models[key]!.scores.every(Number.isFinite), key).toBe(true);
    }
    expect(e.models.M0!.rankCorrelationWithM0).toBe(1);
    expect(e.models.M0!.sameFirstAsM0).toBe(true);
    expect(e.models.M0!.meanPlaceShift).toBe(0);
    // EB models read their cushion from the board; the others keep +40.
    expect(e.models.M0eb!.tau).toBeGreaterThanOrEqual(0.08);
    expect(e.models.M0!.tau).toBeNull();
  });

  it("is the same on the same data (a fixed bootstrap seed)", () => {
    expect(evaluateMultikillModels(input, { draws: 50 })).toEqual(e);
  });

  it("reads the members' own games: a member whose games are bloodier has a factor above 1", () => {
    const bloody = world(11, { skill: 0, lobby: 0 }).input;
    // The first member's games: every other player made 30% more kill points than recorded.
    bloody.aggregates.ownGames = bloody.aggregates.ownGames.map((c) => (c.member === 0 ? { ...c, points: Math.round(c.points * 1.3) } : c));
    const env = evaluateMultikillModels(bloody, { draws: 0 }).environment;
    expect(env.ownGames[0]!.both).toBeGreaterThan(1.15);
    expect(Math.max(...env.ownGames.slice(1).map((o) => o.both))).toBeLessThan(env.ownGames[0]!.both);
    expect(env.tauBeyondNoise).toBeGreaterThan(0);
  });

  it("does not compare with fewer than three ranked members, or without other players' games", () => {
    expect(evaluateMultikillModels({ ...input, members: input.members.slice(0, 2) })).toMatchObject({ ready: false, reason: expect.stringContaining("2 ranked members") });
    const team = { ...input, baseline: { ...input.baseline, source: "team" as const } };
    expect(evaluateMultikillModels(team)).toMatchObject({ ready: false, reason: expect.stringContaining("team's own games") });
  });

  it("prints anonymous aggregates only: no member id, label, score or place", () => {
    const named: AuditInput = { ...input, members: input.members.map((m, i) => ({ ...m, id: ["Zx9-q_PUUID-like-0123456789abcdef", "8b1c2f9e-6a7d-4c3b-9e1f-0a2b3c4d5e6f", "EUW1_7234567890", "Ahri Main#EUW"][i % 4]! + i })) };
    const summary = auditSummary(evaluateMultikillModels(named, { draws: 20 }), { season: 2026, counting: "nested" });
    const text = JSON.stringify(summary);
    for (const m of named.members) expect(text).not.toContain(m.id);
    expect(text).not.toMatch(/PUUID|EUW1_|#EUW|player-|[0-9a-f]{8}-[0-9a-f]{4}/);
    // No per-member list: the own-games factors appear as their spread only, the models as board-wide figures.
    expect(Object.keys(summary.environment.ownGamesFactor!)).toEqual(["min", "median", "max"]);
    for (const m of Object.values(summary.models)) expect(Object.values(m).some((v) => Array.isArray(v))).toBe(false);
    expect(summary.scope).toMatchObject({ membersRanked: 9, ready: true });
    expect(text.length).toBeLessThan(12_000);
  });
});

describe("the decision rule", () => {
  const base = evaluateMultikillModels(world(5, { skill: 0.15, lobby: 0 }).input, { draws: 0 });
  const withEnv = (env: Partial<Evaluation["environment"]>, placebo: { M0: number; M5: number }, queueFactor = 1): Evaluation => ({
    ...base,
    environment: { ...base.environment, ...env },
    models: { ...base.models, M0: { ...base.models.M0!, placeboVsMemberScore: placebo.M0 }, M5: { ...base.models.M5!, placeboVsMemberScore: placebo.M5 } },
    pool: { ...base.pool, queueFactor: { MID: [{ factor: queueFactor, games: 500 }] } },
  });

  it("keeps the production formula when members' games do not differ and the placebo follows nothing", () => {
    const d = decideMultikillAudit(withEnv({ tauBeyondNoise: 0.01, homogeneityP: 0.6 }, { M0: 0.1, M5: 0.05 }));
    expect(d.outcome).toBe("keep");
    expect(d.rules.R1.met).toBe(true);
    expect(d.rules.R2.met).toBe(false);
  });

  it("names the own-games model a candidate only when every part of R2 holds, and still asks for the calibrated simulation", () => {
    const strong = { tauBeyondNoise: 0.08, homogeneityP: 0.001, alliesVsOpponents: 0.7, meanAbsLogAllyMinusOpponent: 0.02 };
    const d = decideMultikillAudit(withEnv(strong, { M0: 0.6, M5: 0.2 }));
    expect(d.outcome).toBe("candidate");
    expect(d.next).toMatch(/simulation/);
    expect(d.next).toMatch(/owner approves/);
    // The placebo not halved, or allies and opponents disagreeing: no candidate.
    expect(decideMultikillAudit(withEnv(strong, { M0: 0.6, M5: 0.4 })).outcome).toBe("inconclusive");
    expect(decideMultikillAudit(withEnv({ ...strong, alliesVsOpponents: 0.1 }, { M0: 0.6, M5: 0.2 })).rules.R2.why.join(" ")).toMatch(/allies only/);
    // A queue group far from 1 stops R1 (keep), not R2.
    expect(decideMultikillAudit(withEnv({ tauBeyondNoise: 0.01, homogeneityP: 0.6 }, { M0: 0.1, M5: 0.05 }, 1.2)).outcome).toBe("inconclusive");
  });

  it("decides nothing with fewer than five ranked members", () => {
    const small = evaluateMultikillModels(world(5, { skill: 0.15, lobby: 0, members: 4 }).input, { draws: 0 });
    expect(decideMultikillAudit(small).outcome).toBe("not-enough-data");
  });
});

describe("a small seeded simulation (the direction of the design's 14 worlds × 500 boards)", () => {
  const boards = (lobby: number) => {
    const out = { M0: 0, M5: 0, Mflat: 0 };
    const N = 40;
    for (let b = 0; b < N; b++) {
      const { input, truth } = world(1000 + b, { skill: 0.15, lobby });
      const e = evaluateMultikillModels(input, { draws: 0 });
      for (const key of ["M0", "M5", "Mflat"] as const) out[key] += spearman(e.models[key]!.scores, truth)! / N;
    }
    return out;
  };

  it("when members' games differ in pace, typical scaled by their own games follows true skill better", () => {
    const r = boards(0.2);
    expect(r.M5).toBeGreaterThan(r.M0 + 0.05);
    expect(r.M0).toBeGreaterThan(r.Mflat);
  });

  it("when they do not, it costs next to nothing", () => {
    const r = boards(0);
    expect(r.M5).toBeGreaterThan(r.M0 - 0.03);
  });
});
