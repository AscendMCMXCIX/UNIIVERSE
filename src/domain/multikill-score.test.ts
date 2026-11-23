import { describe, expect, it } from "vitest";
import type { GameRole } from "./season-stats";
import type { MultikillCounts } from "./multikills";
import {
  BASELINE_MIN_GAMES,
  ROLE_PRIOR_GAMES,
  breaksNestedOrder,
  buildMultikillBaseline,
  expectedRates,
  mostOfKind,
  multikillEvents,
  rankMultikillScores,
  readCountingRule,
  roleOfPosition,
  scoreMember,
  shownScore,
  teamBaseline,
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
  const flat = (rates: MultikillCounts) => baselineOf({ MID: rates, SUPPORT: rates, JUNGLE: rates });

  it("worked example: 40 games, made 26 doubles, 4 triples, 1 quadra; expected 20, 2.4, 0.4, 0.08 → indexes 1.27, 1.36, 1.25, 0.96 → 121", () => {
    const b = flat(mk(0.5, 0.06, 0.01, 0.002));
    const s = scoreMember("a", games(40, "MID", (i) => mk(i < 26 ? 1 : 0, i < 4 ? 1 : 0, i < 1 ? 1 : 0)), baselineOf({ MID: mk(0.5, 0.06, 0.01, 0.002) }, 2000, SEPARATE_EVIDENCE));
    expect(s.kinds.double).toMatchObject({ made: 26 });
    expect(s.kinds.double.expected).toBeCloseTo(20, 10);
    expect(s.kinds.triple.expected).toBeCloseTo(2.4, 10);
    expect(s.kinds.quadra.expected).toBeCloseTo(0.4, 10);
    expect(s.kinds.penta.expected).toBeCloseTo(0.08, 10);
    expect(s.kinds.double.index).toBeCloseTo(28 / 22, 10);
    expect(shownScore(s.score!)).toBe(121);
    expect(s.status).toBe("ranked");
    expect(b.reading.rule).toBe("nested");
  });

  it("exactly the usual multikills score about 100: 50 doubles, 5 triples, 1 quadra in 100 games against 50, 5, 1 expected, no pentakill against 0.2 (2 ÷ 2.2 pulls it to 98)", () => {
    const b = flat(mk(0.5, 0.05, 0.01, 0.002));
    const s = scoreMember("a", games(100, "JUNGLE", () => null).map((g, i) => ({ ...g, counts: mk(i < 50 ? 1 : 0, i < 5 ? 1 : 0, i < 1 ? 1 : 0) })), baselineOf({ JUNGLE: mk(0.5, 0.05, 0.01, 0.002) }, 2000, SEPARATE_EVIDENCE));
    expect(shownScore(s.score!)).toBe(98);
    expect(b.reading.shown).toBe(true);
  });

  it("a support with 200 games, no pentakill and more multikills than supports usually make (119: 40 doubles against 32.2 expected) is placed above a mid with 12 games and one pentakill (110), who is provisional", () => {
    const b = baselineOf(RATES);
    const support = scoreMember("support", nestedGames(200, "SUPPORT", mk(40, 4, 1, 0)), b);
    const mid = scoreMember("mid", nestedGames(12, "MID", mk(6, 1, 0, 1)), b);
    expect(support.kinds.double.expected).toBeCloseTo((0.15 * 5000 + 200 * 0.43) / 5200 * 200, 6);
    expect(shownScore(support.score!)).toBe(119);
    expect(support.status).toBe("ranked");
    expect(shownScore(mid.score!)).toBe(110);
    expect(mid.status).toBe("provisional");
    const board = rankMultikillScores([mid, support], (id) => id);
    expect(board.map((r) => [r.playerId, r.place])).toEqual([["support", 1], ["mid", null]]);
    // Its counts stay Riot's: no multikill is credited to the support that it did not make.
    expect(support.counts).toEqual(mk(45, 5, 1, 0));
    expect(support.events).toEqual(mk(40, 4, 1, 0));
  });

  it("a support's usual (the support role's rates) is not a mid's: the same 30 double kills in 200 games score 90 as a support and 45 as a mid", () => {
    const b = baselineOf(RATES);
    const asSupport = scoreMember("s", nestedGames(200, "SUPPORT", mk(30, 2, 0, 0)), b);
    const asMid = scoreMember("m", nestedGames(200, "MID", mk(30, 2, 0, 0)), b);
    expect(shownScore(asSupport.score!)).toBe(90);
    expect(shownScore(asMid.score!)).toBe(45);
  });

  it("a jungler at the jungle's usual rates over 120 games scores about 100", () => {
    const s = scoreMember("j", nestedGames(120, "JUNGLE", mk(54, 6, 1, 0)), baselineOf(RATES));
    expect(shownScore(s.score!)).toBeGreaterThanOrEqual(95);
    expect(shownScore(s.score!)).toBeLessThanOrEqual(100);
  });

  it("one pentakill moves a score by at most 12.5 points ((1 + 2) ÷ (almost 0 + 2) is an index of 1.5, a quarter of the score)", () => {
    const b = baselineOf(RATES);
    for (const n of [3, 12, 40]) {
      const without = scoreMember("a", nestedGames(n, "MID", mk(Math.round(n / 2))), b).score!;
      const withPenta = scoreMember("a", nestedGames(n, "MID", mk(Math.round(n / 2), 0, 0, 1)), b).score!;
      expect(withPenta - without, `${n} games`).toBeGreaterThan(0);
      expect(withPenta - without, `${n} games`).toBeLessThanOrEqual(12.5);
    }
  });

  it("a member with 3 games has no place and no score shown (status not-enough), whatever they made", () => {
    const s = scoreMember("new", nestedGames(3, "MID", mk(2, 1, 0, 1)), baselineOf(RATES));
    expect(s.status).toBe("not-enough");
    expect(s.counted).toBe(3);
  });

  it("older games without counts are left out, never counted as zero: 18 of 36 games give the score of those 18 alone", () => {
    const b = baselineOf(RATES);
    const counted = nestedGames(18, "SUPPORT", mk(5, 1, 0, 0));
    const withOlder = [...counted, ...games(18, "SUPPORT", () => null)];
    const s = scoreMember("old", withOlder, b);
    expect(s).toMatchObject({ games: 36, counted: 18, status: "provisional" });
    expect(s.score).toBe(scoreMember("old", counted, b).score);
  });

  it("with no reliable comparison for a game, no score (a score from part of the games would not say what it counts)", () => {
    const b = buildMultikillBaseline([{ position: "MIDDLE", championId: "Ahri", games: 50, nested: mk(25), separate: mk(25) }], NESTED_EVIDENCE);
    expect(scoreMember("a", nestedGames(30, "MID", mk(10)), b).score).toBeNull();
    expect(scoreMember("a", nestedGames(30, "MID", mk(10)), b).status).toBe("not-enough");
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

  it("rarer kinds count for more, and more so with more games: one more pentakill is worth about 4 double kills over 12 games, over 85 over 500", () => {
    const b = baselineOf(RATES);
    const worth = (n: number) => {
      const base = scoreMember("a", nestedGames(n, "MID", mk(Math.round(n * 0.55), Math.round(n * 0.07))), b).score!;
      const penta = scoreMember("a", nestedGames(n, "MID", mk(Math.round(n * 0.55), Math.round(n * 0.07), 0, 1)), b).score! - base;
      const double = scoreMember("a", nestedGames(n, "MID", mk(Math.round(n * 0.55) + 1, Math.round(n * 0.07))), b).score! - base;
      return penta / double;
    };
    expect(worth(12)).toBeGreaterThan(3);
    expect(worth(12)).toBeLessThan(6);
    expect(worth(500)).toBeGreaterThan(80);
    // And always: a triple more than a double, a quadra more than a triple, a pentakill more than a quadra.
    const s = (e: MultikillCounts) => scoreMember("a", nestedGames(60, "MID", e), b).score!;
    const base = mk(33, 4, 0, 0);
    expect(s(mk(33, 4, 0, 1))).toBeGreaterThan(s(mk(33, 4, 1, 0)));
    expect(s(mk(33, 4, 1, 0))).toBeGreaterThan(s(mk(33, 5, 0, 0)));
    expect(s(mk(33, 5, 0, 0))).toBeGreaterThan(s(mk(34, 4, 0, 0)));
    expect(s(mk(34, 4, 0, 0))).toBeGreaterThan(s(base));
  });

  it(`a quadra or penta rate a third off (what ${BASELINE_MIN_GAMES} games leave of the quadra rate) moves a 100-game mid's score by under 4 points; the triple rate 12% off, by under 3`, () => {
    const made = nestedGames(100, "MID", mk(55, 7, 1, 1));
    const exact = scoreMember("a", made, baselineOf({ MID: RATES.MID! })).score!;
    const moved = (rates: MultikillCounts) => Math.abs(scoreMember("a", made, baselineOf({ MID: rates })).score! - exact);
    for (const f of [2 / 3, 4 / 3]) {
      expect(moved(mk(0.55, 0.07, 0.012 * f, 0.0025))).toBeLessThan(4);
      expect(moved(mk(0.55, 0.07, 0.012, 0.0025 * f))).toBeLessThan(4);
    }
    for (const f of [0.88, 1.12]) expect(moved(mk(0.55, 0.07 * f, 0.012, 0.0025))).toBeLessThan(3);
  });
});

describe("the board", () => {
  const score = (playerId: string, value: number | null, counted: number, status: "ranked" | "provisional" | "not-enough") => ({ playerId, games: counted, counted, counts: mk(0), events: mk(0), kinds: {} as never, roleGames: counted, score: value, status });

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
  it("is Riot's own count, and a shared record names every holder", () => {
    const s = [
      { playerId: "a", counts: mk(30, 4, 1, 0) },
      { playerId: "b", counts: mk(12, 4, 0, 1) },
      { playerId: "c", counts: mk(2) },
    ];
    expect(mostOfKind(s, "double")).toEqual({ count: 30, holders: ["a"] });
    expect(mostOfKind(s, "triple")).toEqual({ count: 4, holders: ["a", "b"] });
    expect(mostOfKind(s, "penta")).toEqual({ count: 1, holders: ["b"] });
    expect(mostOfKind([{ playerId: "c", counts: mk(2) }], "penta")).toBeNull();
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
