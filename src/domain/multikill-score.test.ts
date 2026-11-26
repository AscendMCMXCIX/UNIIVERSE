import { describe, expect, it } from "vitest";
import type { GameRole } from "./season-stats";
import type { MultikillCounts } from "./multikills";
import {
  BASELINE_MIN_GAMES,
  MULTIKILL_CUSHION,
  MULTIKILL_WEIGHTS,
  ROLE_PRIOR_GAMES,
  breaksNestedOrder,
  buildMultikillBaseline,
  comparisonBasis,
  expectedRates,
  mostOfKind,
  mostPlayedRole,
  multikillEvents,
  rankMultikillScores,
  readCountingRule,
  roleOfPosition,
  scoreMember,
  shownScore,
  teamBaseline,
  typicalChance,
  type BaselineRow,
  type MultikillBaseline,
  type ScoreGame,
} from "./multikill-score";

const mk = (double: number, triple = 0, quadra = 0, penta = 0): MultikillCounts => ({ double, triple, quadra, penta });
const NESTED_EVIDENCE = { withTriple: 400, outOfOrder: 0 };
const SEPARATE_EVIDENCE = { withTriple: 400, outOfOrder: 250 };

/**
 * A comparison whose roles make these multikills per game (each once, at its largest), over `games`
 * games per role: the same events under both readings, so a test's arithmetic is the rule's alone.
 */
function baselineOf(rates: Partial<Record<GameRole, MultikillCounts>>, games = 5000, evidence = NESTED_EVIDENCE, champions: Array<{ role: GameRole; championId: string; games: number; events: MultikillCounts }> = []): MultikillBaseline {
  const position: Record<GameRole, string> = { TOP: "TOP", JUNGLE: "JUNGLE", MID: "MIDDLE", ADC: "BOTTOM", SUPPORT: "UTILITY" };
  const rows: BaselineRow[] = [];
  for (const [role, r] of Object.entries(rates) as Array<[GameRole, MultikillCounts]>) {
    const champGames = champions.filter((c) => c.role === role).reduce((n, c) => n + c.games, 0);
    const champEvents = champions.filter((c) => c.role === role).reduce((s, c) => mk(s.double + c.events.double, s.triple + c.events.triple, s.quadra + c.events.quadra, s.penta + c.events.penta), mk(0));
    const events = mk(r.double * games - champEvents.double, r.triple * games - champEvents.triple, r.quadra * games - champEvents.quadra, r.penta * games - champEvents.penta);
    rows.push({ position: position[role], championId: "Other", games: games - champGames, nested: events, separate: events });
  }
  for (const c of champions) rows.push({ position: position[c.role], championId: c.championId, games: c.games, nested: c.events, separate: c.events });
  return buildMultikillBaseline(rows, evidence);
}

/** Realistic shapes: carries make far more multikills than supports. */
const RATES: Partial<Record<GameRole, MultikillCounts>> = {
  TOP: mk(0.4, 0.045, 0.007, 0.0012),
  JUNGLE: mk(0.45, 0.05, 0.008, 0.0015),
  MID: mk(0.55, 0.07, 0.012, 0.0025),
  ADC: mk(0.6, 0.08, 0.015, 0.003),
  SUPPORT: mk(0.15, 0.012, 0.0015, 0.0002),
};
const games = (n: number, role: GameRole, perGame: (i: number) => MultikillCounts | null, championId = "Any"): ScoreGame[] => Array.from({ length: n }, (_, i) => ({ role, championId, counts: perGame(i) }));
/** Spreads `total` events of each kind over n games (the first games get them), as nested counters would record them. */
function nestedGames(n: number, role: GameRole, events: MultikillCounts, championId = "Any"): ScoreGame[] {
  return games(n, role, (i) => {
    const e = mk(i < events.double ? 1 : 0, i < events.triple ? 1 : 0, i < events.quadra ? 1 : 0, i < events.penta ? 1 : 0);
    // Nested: a larger multikill also counts every smaller one.
    return mk(e.double + e.triple + e.quadra + e.penta, e.triple + e.quadra + e.penta, e.quadra + e.penta, e.penta);
  }, championId);
}

describe("how Riot counts: read from the stored games", () => {
  it("nested when 20+ games have a triple and none breaks the nested order; a stray record (1 in 400) cannot flip it", () => {
    expect(readCountingRule({ withTriple: 20, outOfOrder: 0 })).toEqual({ rule: "nested", shown: true, evidence: { withTriple: 20, outOfOrder: 0 } });
    expect(readCountingRule({ withTriple: 400, outOfOrder: 1 }).rule).toBe("nested");
    expect(readCountingRule({ withTriple: 400, outOfOrder: 1 }).shown).toBe(true);
  });

  it("separate when 10% or more of the games with a triple break the nested order (40 of 400)", () => {
    expect(readCountingRule({ withTriple: 400, outOfOrder: 40 })).toMatchObject({ rule: "separate", shown: true });
  });

  it("assumed nested, and said to be assumed, with fewer than 20 games with a triple or an unclear 1–10% (19 games; 20 of 400)", () => {
    expect(readCountingRule({ withTriple: 19, outOfOrder: 10 })).toMatchObject({ rule: "nested", shown: false });
    expect(readCountingRule({ withTriple: 400, outOfOrder: 20 })).toMatchObject({ rule: "nested", shown: false });
  });

  it("knows which counters nested counting could never give", () => {
    expect(breaksNestedOrder(mk(0, 1))).toBe(true); // a triple without a double
    expect(breaksNestedOrder(mk(1, 1, 2))).toBe(true);
    expect(breaksNestedOrder(mk(1, 1, 1, 2))).toBe(true);
    expect(breaksNestedOrder(mk(0), 3)).toBe(true); // a largest multikill of 3 and no double
    expect(breaksNestedOrder(mk(1, 0), 4)).toBe(true);
    expect(breaksNestedOrder(mk(1, 1, 0), 5)).toBe(true);
    expect(breaksNestedOrder(mk(2, 1, 1, 1), 5)).toBe(false);
    expect(breaksNestedOrder(mk(0), 1)).toBe(false);
  });
});

describe("each multikill once, at its largest", () => {
  it("nested {2, 1, 1, 1} is one double that stopped there and one pentakill", () => {
    expect(multikillEvents(mk(2, 1, 1, 1), "nested")).toEqual(mk(1, 0, 0, 1));
  });

  it("nested {3, 1, 0, 0} is two doubles and a triple; separate counters are already one each", () => {
    expect(multikillEvents(mk(3, 1), "nested")).toEqual(mk(2, 1));
    expect(multikillEvents(mk(3, 1), "separate")).toEqual(mk(3, 1));
  });

  it("never goes below zero on counters out of the nested order", () => {
    expect(multikillEvents(mk(0, 1), "nested")).toEqual(mk(0, 1));
  });

  it("the same games give the same score under either rule, read correctly: a pentakill counts once, not four times", () => {
    const baselineNested = baselineOf(RATES, 2000, NESTED_EVIDENCE);
    const baselineSeparate = baselineOf(RATES, 2000, SEPARATE_EVIDENCE);
    const asNested = games(30, "MID", (i) => (i === 0 ? mk(1, 1, 1, 1) : i < 10 ? mk(1) : mk(0)));
    const asSeparate = games(30, "MID", (i) => (i === 0 ? mk(0, 0, 0, 1) : i < 10 ? mk(1) : mk(0)));
    const a = scoreMember("a", asNested, baselineNested);
    const b = scoreMember("a", asSeparate, baselineSeparate);
    expect(a.events).toEqual(mk(9, 0, 0, 1));
    expect(b.events).toEqual(mk(9, 0, 0, 1));
    expect(a.score).toBeCloseTo(b.score!, 10);
    // The page still shows Riot's own counters.
    expect(a.counts).toEqual(mk(10, 1, 1, 1));
    expect(b.counts).toEqual(mk(9, 0, 0, 1));
  });
});

describe("the comparison: the other players in the same games", () => {
  it("reads Riot's positions and the demo's role names; a player without a position counts only toward every position together", () => {
    expect(roleOfPosition("MIDDLE")).toBe("MID");
    expect(roleOfPosition("UTILITY")).toBe("SUPPORT");
    expect(roleOfPosition("BOTTOM")).toBe("ADC");
    expect(roleOfPosition("SUPPORT")).toBe("SUPPORT");
    expect(roleOfPosition("")).toBeNull();
    expect(roleOfPosition("Invalid")).toBeNull();
    const b = buildMultikillBaseline(
      [
        { position: "MIDDLE", championId: "Ahri", games: 10, nested: mk(5, 1), separate: mk(6, 1) },
        { position: null, championId: "Zed", games: 4, nested: mk(2), separate: mk(2) },
      ],
      NESTED_EVIDENCE,
    );
    expect(b.all).toEqual({ games: 14, events: mk(7, 1) });
    expect(b.roles.MID).toEqual({ games: 10, events: mk(5, 1) });
    expect(b.champions["MID|Ahri"]).toEqual({ games: 10, events: mk(5, 1) });
    expect(Object.keys(b.champions)).toEqual(["MID|Ahri"]);
  });

  it("takes each group's events under the rule the games show", () => {
    const row = { position: "TOP", championId: "Gwen", games: 300, nested: mk(100, 10), separate: mk(110, 10) };
    expect(buildMultikillBaseline([row], NESTED_EVIDENCE).roles.TOP!.events).toEqual(mk(100, 10));
    expect(buildMultikillBaseline([row], SEPARATE_EVIDENCE).roles.TOP!.events).toEqual(mk(110, 10));
  });

  it(`compares with nothing under ${BASELINE_MIN_GAMES} games in all (999), with them from ${BASELINE_MIN_GAMES}`, () => {
    const rows = (n: number) => [{ position: "MIDDLE", championId: "Ahri", games: n, nested: mk(n / 2), separate: mk(n / 2) }];
    expect(expectedRates(buildMultikillBaseline(rows(999), NESTED_EVIDENCE), "MID", "Ahri")).toEqual({ level: "none", rates: mk(0) });
    expect(expectedRates(buildMultikillBaseline(rows(1000), NESTED_EVIDENCE), "MID", "Ahri").level).toBe("role");
  });

  it(`a role's rate leans toward every position's by ${ROLE_PRIOR_GAMES} games: 100 support games with 10 doubles, all positions at 0.4 → (10 + 200 × 0.4) ÷ 300 = 0.3, compared as every position together until the role has 200 games`, () => {
    const b = buildMultikillBaseline(
      [
        { position: "UTILITY", championId: "Lulu", games: 100, nested: mk(10), separate: mk(10) },
        { position: "MIDDLE", championId: "Ahri", games: 900, nested: mk(390), separate: mk(390) },
      ],
      NESTED_EVIDENCE,
    );
    const support = expectedRates(b, "SUPPORT", "Other");
    expect(support.rates.double).toBeCloseTo((10 + 200 * 0.4) / 300, 10);
    expect(support.level).toBe("all");
    expect(expectedRates(b, "MID", "Other")).toMatchObject({ level: "role" });
    expect(expectedRates(b, "MID", "Other").rates.double).toBeCloseTo((390 + 200 * 0.4) / 1100, 10);
    // A game without a role: every position together.
    expect(expectedRates(b, null, "Lulu")).toEqual({ level: "all", rates: mk(0.4) });
  });

  it("a champion with 50 games and 40 multikills in a role of 0.5 a game moves its rates by 1.3 (= (40 + 50 × 0.5) ÷ (100 × 0.5))", () => {
    const b = baselineOf({ MID: mk(0.4, 0.08, 0.016, 0.004) }, 1000, NESTED_EVIDENCE, [{ role: "MID", championId: "Katarina", games: 50, events: mk(32, 6.4, 1.28, 0.32) }]);
    const kat = expectedRates(b, "MID", "Katarina");
    expect(kat.level).toBe("role");
    expect(kat.rates.double).toBeCloseTo(0.4 * 1.3, 10);
    expect(kat.rates.penta).toBeCloseTo(0.004 * 1.3, 10);
    // A champion the comparison players never played keeps the role's rates.
    expect(expectedRates(b, "MID", "Nobody").rates.double).toBeCloseTo(0.4, 10);
  });

  it("a champion seen in 5 games with 5 multikills (twice the role's 0.5) barely moves the role: factor 1.09", () => {
    const b = baselineOf({ MID: mk(0.5) }, 1000, NESTED_EVIDENCE, [{ role: "MID", championId: "Rare", games: 5, events: mk(5) }]);
    expect(expectedRates(b, "MID", "Rare").rates.double / 0.5).toBeCloseTo((5 + 25) / (55 * 0.5), 10);
    expect((5 + 25) / (55 * 0.5)).toBeCloseTo(1.09, 2);
  });
});

describe("the score", () => {
  it("worked example: 40 games, made 26 doubles, 4 triples, 1 quadra (68 kill points); expected 20, 2.4, 0.4, 0.08 (49.2) → 100 × (68 + 40) ÷ (49.2 + 40) = 121, ±12 by chance", () => {
    const s = scoreMember("a", games(40, "MID", (i) => mk(i < 26 ? 1 : 0, i < 4 ? 1 : 0, i < 1 ? 1 : 0)), baselineOf({ MID: mk(0.5, 0.06, 0.01, 0.002) }, 2000, SEPARATE_EVIDENCE));
    expect(s.kinds.double).toMatchObject({ made: 26 });
    expect(s.kinds.double.expected).toBeCloseTo(20, 10);
    expect(s.kinds.triple.expected).toBeCloseTo(2.4, 10);
    expect(s.kinds.quadra.expected).toBeCloseTo(0.4, 10);
    expect(s.kinds.penta.expected).toBeCloseTo(0.08, 10);
    expect(s.score).toBeCloseTo((100 * (68 + MULTIKILL_CUSHION)) / (49.2 + MULTIKILL_CUSHION), 10);
    expect(shownScore(s.score!)).toBe(121);
    expect(s.chance).toBeCloseTo((100 * Math.sqrt(4 * 20 + 9 * 2.4 + 16 * 0.4 + 25 * 0.08)) / 89.2, 10);
    expect(Math.round(s.chance!)).toBe(12);
    expect(s.status).toBe("ranked");
    expect(MULTIKILL_WEIGHTS).toEqual({ double: 2, triple: 3, quadra: 4, penta: 5 });
  });

  it("exactly the usual multikills score about 100: 50 doubles, 5 triples, 1 quadra in 100 games against 50, 5, 1 expected, no pentakill against 0.2 (159 ÷ 160 = 99)", () => {
    const s = scoreMember("a", games(100, "JUNGLE", (i) => mk(i < 50 ? 1 : 0, i < 5 ? 1 : 0, i < 1 ? 1 : 0)), baselineOf({ JUNGLE: mk(0.5, 0.05, 0.01, 0.002) }, 2000, SEPARATE_EVIDENCE));
    expect(shownScore(s.score!)).toBe(99);
  });

  it("a support with 200 games, no pentakill and more multikills than supports usually make (119: 40 doubles against 32.2 expected) is placed above a mid with 12 games and one pentakill (107), who is provisional", () => {
    const b = baselineOf(RATES);
    const support = scoreMember("support", nestedGames(200, "SUPPORT", mk(40, 4, 1, 0)), b);
    const mid = scoreMember("mid", nestedGames(12, "MID", mk(6, 1, 0, 1)), b);
    expect(support.kinds.double.expected).toBeCloseTo(((0.15 * 5000 + 200 * 0.43) / 5200) * 200, 6);
    expect(shownScore(support.score!)).toBe(119);
    expect(support.status).toBe("ranked");
    expect(shownScore(mid.score!)).toBe(107);
    expect(mid.status).toBe("provisional");
    const board = rankMultikillScores([mid, support], (id) => id);
    expect(board.map((r) => [r.playerId, r.place])).toEqual([["support", 1], ["mid", null]]);
    // No multikill is credited that was not made: Riot's nested counters hold 45 doubles, the board 40 (each once, at its largest).
    expect(support.counts).toEqual(mk(45, 5, 1, 0));
    expect(support.events).toEqual(mk(40, 4, 1, 0));
  });

  it("a support's usual (the support role's rates) is not a mid's: the same 30 double kills in 200 games score 93 as a support and 34 as a mid", () => {
    const b = baselineOf(RATES);
    expect(shownScore(scoreMember("s", nestedGames(200, "SUPPORT", mk(30, 2, 0, 0)), b).score!)).toBe(93);
    expect(shownScore(scoreMember("m", nestedGames(200, "MID", mk(30, 2, 0, 0)), b).score!)).toBe(34);
  });

  it("a jungler at the jungle's usual rates over 120 games scores about 100", () => {
    const s = scoreMember("j", nestedGames(120, "JUNGLE", mk(54, 6, 1, 0)), baselineOf(RATES));
    expect(shownScore(s.score!)).toBeGreaterThanOrEqual(97);
    expect(shownScore(s.score!)).toBeLessThanOrEqual(101);
  });

  it("each multikill is worth its kills: one more pentakill counts as 2.5 more double kills, a triple 1.5, at any number of games", () => {
    const b = baselineOf(RATES);
    for (const n of [12, 60, 500]) {
      const at = (e: MultikillCounts) => scoreMember("a", nestedGames(n, "MID", e), b).score!;
      const base = at(mk(5, 1));
      const double = at(mk(6, 1)) - base;
      expect((at(mk(5, 1, 0, 1)) - base) / double, `${n} games`).toBeCloseTo(2.5, 10);
      expect((at(mk(5, 2)) - base) / double, `${n} games`).toBeCloseTo(1.5, 10);
    }
  });

  it("one pentakill moves a ranked 20-game mid's score by about 7 points, a 500-game one's by under 1: one lucky game cannot decide the board", () => {
    const b = baselineOf(RATES);
    const swing = (n: number) => scoreMember("a", nestedGames(n, "MID", mk(Math.round(n / 2), 0, 0, 1)), b).score! - scoreMember("a", nestedGames(n, "MID", mk(Math.round(n / 2))), b).score!;
    expect(swing(20)).toBeGreaterThan(6);
    expect(swing(20)).toBeLessThan(9);
    expect(swing(500)).toBeLessThan(1);
  });

  it("the chance spread falls with games and is wider for a role that makes fewer multikills (a support's)", () => {
    const b = baselineOf(RATES);
    const chance = (n: number, role: GameRole) => scoreMember("a", nestedGames(n, role, mk(0)), b).chance!;
    expect(chance(20, "MID")).toBeGreaterThan(chance(50, "MID"));
    expect(chance(50, "MID")).toBeGreaterThan(chance(300, "MID"));
    expect(chance(200, "SUPPORT")).toBeGreaterThan(chance(200, "MID"));
    expect(typicalChance(b, 50)).toBeGreaterThan(typicalChance(b, 300)!);
    expect(typicalChance(buildMultikillBaseline([], NESTED_EVIDENCE), 50)).toBeNull();
  });

  it("a member with 3 games has no place and no score shown (status not-enough), whatever they made", () => {
    const s = scoreMember("new", nestedGames(3, "MID", mk(2, 1, 0, 1)), baselineOf(RATES));
    expect(s.status).toBe("not-enough");
    expect(s.counted).toBe(3);
  });

  it("older games without counts are left out, never counted as zero: 18 of 36 games give the score of those 18 alone", () => {
    const b = baselineOf(RATES);
    const counted = nestedGames(18, "SUPPORT", mk(5, 1, 0, 0));
    const s = scoreMember("old", [...counted, ...games(18, "SUPPORT", () => null)], b);
    expect(s).toMatchObject({ games: 36, counted: 18, status: "provisional" });
    expect(s.score).toBe(scoreMember("old", counted, b).score);
  });

  it("with no reliable comparison for a game, no score (a score from part of the games would not say what it counts)", () => {
    const b = buildMultikillBaseline([{ position: "MIDDLE", championId: "Ahri", games: 50, nested: mk(25), separate: mk(25) }], NESTED_EVIDENCE);
    const s = scoreMember("a", nestedGames(30, "MID", mk(10)), b);
    expect(s.score).toBeNull();
    expect(s.chance).toBeNull();
    expect(s.status).toBe("not-enough");
  });

  it("counts the games compared within their role, the rest with every position together", () => {
    const b = buildMultikillBaseline(
      [
        { position: "MIDDLE", championId: "Ahri", games: 1200, nested: mk(600), separate: mk(600) },
        { position: "UTILITY", championId: "Lulu", games: 50, nested: mk(5), separate: mk(5) },
      ],
      NESTED_EVIDENCE,
    );
    const s = scoreMember("a", [...nestedGames(20, "MID", mk(10)), ...nestedGames(5, "SUPPORT", mk(1))], b);
    expect(s.roleGames).toBe(20);
    expect(s.counted).toBe(25);
    expect(s.score).not.toBeNull();
  });

  it(`a quadra or penta rate a third off (what ${BASELINE_MIN_GAMES} games leave of the quadra rate) moves a 100-game mid's score by under 2 points; the triple rate 12% off, by under 3`, () => {
    const made = nestedGames(100, "MID", mk(55, 7, 1, 1));
    const exact = scoreMember("a", made, baselineOf({ MID: RATES.MID! })).score!;
    const moved = (rates: MultikillCounts) => Math.abs(scoreMember("a", made, baselineOf({ MID: rates })).score! - exact);
    for (const f of [2 / 3, 4 / 3]) {
      expect(moved(mk(0.55, 0.07, 0.012 * f, 0.0025))).toBeLessThan(2);
      expect(moved(mk(0.55, 0.07, 0.012, 0.0025 * f))).toBeLessThan(2);
    }
    for (const f of [0.88, 1.12]) expect(moved(mk(0.55, 0.07 * f, 0.012, 0.0025))).toBeLessThan(3);
  });
});

/*
  The score's reliability, simulated (the Release 15 review's question): members whose multikills
  come by chance at fixed true rates (a mid's: double 0.5, triple 0.067, quadra 0.01, penta 0.002 a
  game, each multikill a Poisson count), scored by the real scoreMember against those rates. Seeded,
  so the numbers are the same on every run. What the model must show: the chance spread falls as
  games rise; a truly better member's expected score rises toward its true ratio; and members with
  few games do not top a board out of proportion to how good they are.
*/
describe("the score's reliability, simulated (seeded)", () => {
  let seed = 20261123;
  const rnd = () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const poisson = (l: number) => {
    const limit = Math.exp(-l);
    let k = 0;
    let p = 1;
    do {
      k += 1;
      p *= rnd();
    } while (p > limit);
    return k - 1;
  };
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() || 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const TRUE = mk(0.5, 0.067, 0.01, 0.002);
  const b = baselineOf({ MID: TRUE }, 20_000, SEPARATE_EVIDENCE);
  const member = (n: number, ratio: number) => scoreMember("m", games(n, "MID", () => mk(poisson(TRUE.double * ratio), poisson(TRUE.triple * ratio), poisson(TRUE.quadra * ratio), poisson(TRUE.penta * ratio))), b).score!;
  const spread = (xs: number[]) => {
    const mean = xs.reduce((a, c) => a + c, 0) / xs.length;
    return { mean, sd: Math.sqrt(xs.reduce((a, c) => a + (c - mean) ** 2, 0) / xs.length) };
  };
  const N = [20, 50, 100, 300];
  const usual = N.map((n) => spread(Array.from({ length: 500 }, () => member(n, 1))));
  const better = N.map((n) => spread(Array.from({ length: 300 }, () => member(n, 1.3))).mean);

  it("centres usual members on 100 and narrows their chance spread as games rise (about 12, 11, 10 and 7 points at 20, 50, 100 and 300 games)", () => {
    for (const u of usual) expect(Math.abs(u.mean - 100)).toBeLessThan(3);
    // From 50 games on it falls with every step (at 20 the cushion holds it near 50 games' spread: a short record leans on it most).
    for (let i = 2; i < N.length; i++) expect(usual[i]!.sd, `${N[i]} games`).toBeLessThan(usual[i - 1]!.sd);
    expect(usual[0]!.sd).toBeLessThan(usual[1]!.sd + 1.5);
    expect(usual[0]!.sd).toBeLessThan(14);
    expect(usual[3]!.sd).toBeLessThan(9);
    // The spread the page quotes (scoreChance) is the simulated one, within a point or so.
    for (const [i, n] of N.entries()) expect(Math.abs(typicalChance(b, n)! - usual[i]!.sd), `${n} games`).toBeLessThan(1.5);
  });

  it("brings a truly 30%-better member's expected score toward 130 as games rise (about 111, 118, 124, 127)", () => {
    for (let i = 1; i < N.length; i++) expect(better[i], `${N[i]} games`).toBeGreaterThan(better[i - 1]! - 1);
    expect(better[0]).toBeGreaterThan(107);
    expect(better[3]).toBeGreaterThan(125);
    expect(better[3]).toBeLessThan(132);
  });

  it("does not let members with 20 games top a board out of proportion: on boards of 8 members who truly differ by about 20%, the two 20-game members top it about as often as their true rates say (at most 32%, against 25%)", () => {
    const GAMES = [20, 20, 50, 50, 150, 150, 300, 300];
    let short = 0;
    let byTruth = 0;
    const boards = 600;
    for (let i = 0; i < boards; i++) {
      const truth = GAMES.map(() => Math.max(0.3, 1 + 0.2 * gauss()));
      const scores = GAMES.map((n, k) => member(n, truth[k]!));
      if (GAMES[scores.indexOf(Math.max(...scores))] === 20) short += 1;
      if (GAMES[truth.indexOf(Math.max(...truth))] === 20) byTruth += 1;
    }
    expect(short / boards).toBeLessThanOrEqual(0.32);
    expect(Math.abs(short - byTruth) / boards).toBeLessThan(0.1);
  });

  it("with equal skill, four 20-game and four 300-game members: a 20-game member takes first place at most 70% of the time (no bias: 50%; a shorter record is noisier, so some excess stays)", () => {
    const GAMES = [20, 20, 20, 20, 300, 300, 300, 300];
    let short = 0;
    const boards = 500;
    for (let i = 0; i < boards; i++) {
      const scores = GAMES.map((n) => member(n, 1));
      if (GAMES[scores.indexOf(Math.max(...scores))] === 20) short += 1;
    }
    expect(short / boards).toBeLessThanOrEqual(0.7);
  });

  it("on 9-member boards about 10% apart (20 to 300 games), members with 30 games or fewer top it about as often as their true rates say (within 6 points)", () => {
    const GAMES = [20, 20, 30, 50, 80, 120, 200, 250, 300];
    let short = 0;
    let byTruth = 0;
    const boards = 500;
    for (let i = 0; i < boards; i++) {
      const truth = GAMES.map(() => Math.max(0.3, 1 + 0.1 * gauss()));
      const scores = GAMES.map((n, k) => member(n, truth[k]!));
      if (GAMES[scores.indexOf(Math.max(...scores))]! <= 30) short += 1;
      if (GAMES[truth.indexOf(Math.max(...truth))]! <= 30) byTruth += 1;
    }
    expect(Math.abs(short - byTruth) / boards).toBeLessThan(0.06);
  });
});

describe("the board", () => {
  const score = (playerId: string, value: number | null, counted: number, status: "ranked" | "provisional" | "not-enough") => ({ playerId, games: counted, counted, counts: mk(0), events: mk(0), kinds: {} as never, roleGames: counted, score: value, chance: null, status });

  it("ranks by the score as shown; equal shown scores share a place (124.4 and 123.6 are both 124); provisional after every ranked member; too few games last", () => {
    const board = rankMultikillScores(
      [score("low", 90, 50, "ranked"), score("prov", 180, 15, "provisional"), score("a", 124.4, 40, "ranked"), score("b", 123.6, 80, "ranked"), score("few", 200, 3, "not-enough")],
      (id) => id,
    );
    expect(board.map((r) => [r.playerId, r.place, r.tied])).toEqual([
      ["b", 1, true],
      ["a", 1, true],
      ["low", 3, false],
      ["prov", null, false],
      ["few", null, false],
    ]);
  });
});

describe("most of each kind", () => {
  it("counts each multikill once, at its largest, and a shared record names every holder", () => {
    const s = [
      { playerId: "a", events: mk(30, 4, 1, 0) },
      { playerId: "b", events: mk(12, 4, 0, 1) },
      { playerId: "c", events: mk(2) },
    ];
    expect(mostOfKind(s, "double")).toEqual({ count: 30, holders: ["a"] });
    expect(mostOfKind(s, "triple")).toEqual({ count: 4, holders: ["a", "b"] });
    expect(mostOfKind(s, "penta")).toEqual({ count: 1, holders: ["b"] });
    expect(mostOfKind([{ playerId: "c", events: mk(2) }], "penta")).toBeNull();
  });
});

describe("the team's own games, when no other player's counts are stored", () => {
  it("compares every member with the team's games together, every position at once, reading the rule from them", () => {
    const b = teamBaseline([{ counts: mk(2, 1, 1, 1), largest: 5 }, { counts: mk(1) }, { counts: null }, { counts: mk(0) }]);
    expect(b.source).toBe("team");
    expect(b.all).toEqual({ games: 3, events: mk(2, 0, 0, 1) });
    expect(b.reading).toMatchObject({ rule: "nested", shown: false });
    expect(expectedRates(b, "SUPPORT", "Lulu").level).toBe("all");
  });
});

describe("what a score is made of (the Score breakdown's parts, 25 Nov 2026)", () => {
  const b = baselineOf(RATES, 5000, NESTED_EVIDENCE, [{ role: "MID", championId: "Katarina", games: 400, events: mk(260, 40, 8, 2) }, { role: "MID", championId: "Rare", games: 10, events: mk(5) }]);
  const member = [...nestedGames(30, "MID", mk(18, 3, 1, 1), "Katarina"), ...nestedGames(12, "MID", mk(4), "Rare"), ...nestedGames(6, "TOP", mk(2)), ...games(4, null as unknown as GameRole, () => mk(1)), ...games(3, "MID", () => null, "Katarina")];

  it("gives the score's own points and expected points, so 100 × (E + 40) ÷ (X + 40) is the score itself", () => {
    const s = scoreMember("m", member, b);
    expect(s.points).toBe(MULTIKILL_KEYS_SUM(s.events));
    expect(s.expectedPoints).toBeCloseTo(2 * s.kinds.double.expected + 3 * s.kinds.triple.expected + 4 * s.kinds.quadra.expected + 5 * s.kinds.penta.expected, 10);
    expect(s.score).toBeCloseTo((100 * (s.points + MULTIKILL_CUSHION)) / (s.expectedPoints + MULTIKILL_CUSHION), 10);
  });

  it("counts the score's games by Riot's position (none recorded: unknown) and by champion and position, most first; games without counts left out", () => {
    const s = scoreMember("m", member, b);
    expect(s.counted).toBe(52);
    expect(s.played).toEqual({ roles: { MID: 42, TOP: 6 }, unknown: 4 });
    expect(s.champions).toEqual([
      { championId: "Katarina", role: "MID", games: 30 },
      { championId: "Rare", role: "MID", games: 12 },
      { championId: "Any", role: "TOP", games: 6 },
      { championId: "Any", role: null, games: 4 },
    ]);
  });

  it("names how each game was compared: by champion and role from 50 champion games, by role below that, all positions without a role", () => {
    const s = scoreMember("m", member, b);
    expect(s.comparison).toEqual({ "champion-role": 30, role: 18, all: 4, team: 0, none: 0 });
    expect(comparisonBasis(b, "MID", "Katarina")).toEqual({ basis: "champion-role", roleGames: 5000, championGames: 400 });
    expect(comparisonBasis(b, "MID", "Rare")).toEqual({ basis: "role", roleGames: 5000, championGames: 10 });
    expect(comparisonBasis(b, null, "Rare").basis).toBe("all");
    // A role with fewer than 200 games of its own: every position together, as expectedRates says ("all").
    const thin = buildMultikillBaseline([{ position: "TOP", championId: "Any", games: 3000, nested: mk(1200, 120), separate: mk(1200, 120) }, { position: "JUNGLE", championId: "Any", games: 150, nested: mk(70, 7), separate: mk(70, 7) }], NESTED_EVIDENCE);
    expect(comparisonBasis(thin, "JUNGLE", "Any").basis).toBe("all");
    expect(expectedRates(thin, "JUNGLE", "Any").level).toBe("all");
    // The team's own games: no champion or role adjustment; too few other players' games: none.
    expect(comparisonBasis(teamBaseline([{ counts: mk(1) }]), "MID", "Katarina").basis).toBe("team");
    expect(comparisonBasis(baselineOf(RATES, 100), "MID", "Katarina").basis).toBe("none");
  });

  it("agrees with expectedRates' level for every game: \"role\" exactly when compared by champion and role or by role", () => {
    for (const role of [null, "TOP", "JUNGLE", "MID", "ADC", "SUPPORT"] as const)
      for (const champ of ["Katarina", "Rare", "Nobody"]) {
        const level = expectedRates(b, role, champ).level;
        const basis = comparisonBasis(b, role, champ).basis;
        expect(level === "role", `${role} ${champ}`).toBe(basis === "champion-role" || basis === "role");
        expect(level === "none").toBe(basis === "none");
      }
  });

  it("never changes the score: the same games give the same score, chance and status as the parts alone would", () => {
    // The score from its own arithmetic, recomputed here from the per-kind expectations (the old fields), equals the new score.
    for (const games of [member, nestedGames(25, "SUPPORT", mk(5, 1)), nestedGames(200, "ADC", mk(120, 16, 3, 1), "Katarina")]) {
      const s = scoreMember("m", games, b);
      const points = 2 * s.events.double + 3 * s.events.triple + 4 * s.events.quadra + 5 * s.events.penta;
      const expected = 2 * s.kinds.double.expected + 3 * s.kinds.triple.expected + 4 * s.kinds.quadra.expected + 5 * s.kinds.penta.expected;
      expect(s.score).toBe((100 * (points + MULTIKILL_CUSHION)) / (expected + MULTIKILL_CUSHION));
      expect(s.points).toBe(points);
    }
  });
});

describe("the most-played role over the score's games", () => {
  it("is the position with the most games, with every position's games (Top-to-Support on a tie of shares), the unknown last", () => {
    expect(mostPlayedRole({ roles: { TOP: 51, MID: 7 }, unknown: 2 })).toEqual({ kind: "role", role: "TOP", games: 51, total: 60, rows: [{ role: "TOP", games: 51 }, { role: "MID", games: 7 }, { role: null, games: 2 }] });
  });

  it("is a split when two or more positions share the most games: none is picked, never the role a member chose", () => {
    expect(mostPlayedRole({ roles: { MID: 9, TOP: 9, ADC: 2 }, unknown: 0 })).toEqual({ kind: "split", roles: ["TOP", "MID"], games: 9, total: 20, rows: [{ role: "TOP", games: 9 }, { role: "MID", games: 9 }, { role: "ADC", games: 2 }] });
  });

  it("is unknown when no game recorded a position", () => {
    expect(mostPlayedRole({ roles: {}, unknown: 21 })).toEqual({ kind: "unknown", games: 0, total: 21, rows: [{ role: null, games: 21 }] });
    // More unknown games than any one position: the known position is still the most played of the positions.
    expect(mostPlayedRole({ roles: { SUPPORT: 3 }, unknown: 30 }).kind).toBe("role");
  });
});

function MULTIKILL_KEYS_SUM(e: MultikillCounts) {
  return MULTIKILL_WEIGHTS.double * e.double + MULTIKILL_WEIGHTS.triple * e.triple + MULTIKILL_WEIGHTS.quadra * e.quadra + MULTIKILL_WEIGHTS.penta * e.penta;
}
