import { describe, expect, it } from "vitest";
import * as model from "./performance-score";
import { TYPICAL_FIGURES, COMPONENT_ORDER, OUTCOME_STEP, ROLE_WEIGHTS, SCORE_VERSION, laneValue, reasonText, scoreMatch, scoreModeOf, seriesAt, toTen, teamAverages, EXCELLENT_AT, type ScoreInput, type ScoreLane } from "./performance-score";

/*
  The performance score's worked examples and fairness tests (docs/PERFORMANCE_SCORE.md). A game is
  built from each role's typical figures in a 30-minute ranked game (TYPICAL), the same on both
  sides, and then one player's figures are changed: whatever the role, a typical game is near 5,
  and the fairness rules below hold.
*/

type Figures = Omit<ScoreInput, "slot" | "teamId" | "win" | "lane" | "counterpart" | "laneDiff">;

const TYPICAL: Record<ScoreLane, Figures> = {
  TOP: { kills: 5, deaths: 5, assists: 6, cs: 210, gold: 12_000, damage: 22_000, damageTaken: 30_000, damageMitigated: 25_000, vision: 20, wardsPlaced: 9, wardsKilled: 3, objectiveDamage: 9_000, turretTakedowns: 2, ccSeconds: 20, teamHealing: 0, teamShielding: 0 },
  JUNGLE: { kills: 5, deaths: 5, assists: 9, cs: 170, gold: 11_500, damage: 16_000, damageTaken: 32_000, damageMitigated: 20_000, vision: 32, wardsPlaced: 10, wardsKilled: 6, objectiveDamage: 35_000, turretTakedowns: 1, ccSeconds: 25, teamHealing: 500, teamShielding: 0 },
  MIDDLE: { kills: 6, deaths: 5, assists: 7, cs: 220, gold: 12_500, damage: 25_000, damageTaken: 20_000, damageMitigated: 10_000, vision: 22, wardsPlaced: 9, wardsKilled: 3, objectiveDamage: 7_000, turretTakedowns: 2, ccSeconds: 18, teamHealing: 0, teamShielding: 0 },
  BOTTOM: { kills: 7, deaths: 5, assists: 7, cs: 240, gold: 13_500, damage: 27_000, damageTaken: 18_000, damageMitigated: 7_000, vision: 18, wardsPlaced: 9, wardsKilled: 2, objectiveDamage: 8_000, turretTakedowns: 3, ccSeconds: 5, teamHealing: 0, teamShielding: 0 },
  UTILITY: { kills: 1, deaths: 6, assists: 14, cs: 35, gold: 8_000, damage: 9_000, damageTaken: 18_000, damageMitigated: 12_000, vision: 70, wardsPlaced: 30, wardsKilled: 6, objectiveDamage: 2_000, turretTakedowns: 1, ccSeconds: 30, teamHealing: 2_000, teamShielding: 2_000 },
};
const LANES: ScoreLane[] = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];

/** Ten players, slots 0–4 blue (100) and 5–9 red (200), each lane's opponent the same lane across; `change` edits players by slot. */
function game(change: Record<number, Partial<ScoreInput>> = {}, winner: 100 | 200 = 100): ScoreInput[] {
  return Array.from({ length: 10 }, (_, slot) => {
    const lane = LANES[slot % 5]!;
    const teamId = slot < 5 ? 100 : 200;
    return { slot, teamId, win: teamId === winner, lane, counterpart: (slot + 5) % 10, laneDiff: null, ...TYPICAL[lane], ...change[slot] };
  });
}
const RIFT = { mode: "rift" as const, minutes: 30 };
const scoreOf = (s: ReturnType<typeof scoreMatch>, slot: number) => s!.players.find((p) => p.slot === slot)!;

describe("the score's scale and components", () => {
  it("is versioned, and every role's weights cover every component", () => {
    expect(SCORE_VERSION).toBe("v3");
    for (const w of Object.values(ROLE_WEIGHTS)) expect(Object.keys(w).sort()).toEqual([...COMPONENT_ORDER].sort());
  });

  it("maps the weighted mean through a logistic curve: 0 is 5.0, one decimal, never 0 or 10 from clamped z-scores", () => {
    expect(toTen(0)).toBe(5);
    expect(toTen(1)).toBe(8.3);
    expect(toTen(-1)).toBe(1.7);
    expect(toTen(0.5)).toBe(6.9);
    expect(toTen(2.65)).toBeLessThan(10);
    expect(toTen(-2.65)).toBeGreaterThan(0);
  });

  it("scores a typical game the same in every role (within 0.2 on each team, v3's role references), winners a little up and losers a little down", () => {
    const s = scoreMatch(game(), RIFT)!;
    expect(s.scored).toBe(10);
    for (const team of [100, 200]) {
      const mine = s.players.filter((p) => p.teamId === team).map((p) => p.score);
      expect(Math.max(...mine) - Math.min(...mine), `team ${team}`).toBeLessThanOrEqual(0.2);
      for (const v of mine) expect(Math.abs(v - 5), `team ${team}`).toBeLessThanOrEqual(0.4);
    }
    // The result alone: about 0.4 between two players with the same figures.
    expect(scoreOf(s, 3).score - scoreOf(s, 8).score).toBeGreaterThanOrEqual(0.3);
    expect(scoreOf(s, 3).score - scoreOf(s, 8).score).toBeLessThanOrEqual(0.5);
    // Both sides played the same game: each winner is its counterpart plus the result's two steps.
    for (let i = 0; i < 5; i++) expect(scoreOf(s, i).raw - scoreOf(s, i + 5).raw).toBeCloseTo(2 * OUTCOME_STEP, 9);
  });

  it("ranks all ten, MVP the winning team's best and ACE the losing team's best", () => {
    const s = scoreMatch(game({ 7: { kills: 12, deaths: 2, assists: 6, damage: 38_000, gold: 15_000 } }), RIFT)!;
    expect(s.players.map((p) => p.rank).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(s.players.filter((p) => p.mvp)).toHaveLength(1);
    expect(s.players.filter((p) => p.ace)).toHaveLength(1);
    expect(scoreOf(s, 7).ace).toBe(true);
    expect(s.players.find((p) => p.mvp)!.teamId).toBe(100);
    // A remake (nobody won): neither.
    const remake = scoreMatch(game().map((p) => ({ ...p, win: false })), RIFT)!;
    expect(remake.players.some((p) => p.mvp || p.ace)).toBe(false);
  });

  it("leaves a figure out for everyone when one player's record lacks it, and never scores turret takedowns (a team fact)", () => {
    const s = scoreMatch(game({ 3: { ccSeconds: null } }), RIFT)!;
    expect(s.components).not.toContain("cc");
    expect(s.components).toContain("vision");
    for (const p of s.players) expect(p.used).not.toContain("turrets");
  });

  it("is not thrown by tiny differences (MIN_SPREAD): one jungler's 50 healing, one turret in the game", () => {
    const base = scoreMatch(game(), RIFT)!;
    const heal = scoreMatch(game(Object.fromEntries([...Array(10).keys()].map((i) => [i, { teamHealing: i === 1 ? 50 : TYPICAL_FIGURES[LANES[i % 5]!].teamHealing }]))), RIFT)!;
    for (let i = 0; i < 10; i++) expect(Math.abs(scoreOf(heal, i).score - scoreOf(base, i).score), `slot ${i}`).toBeLessThanOrEqual(0.3);
    const towers = scoreMatch(game(Object.fromEntries([...Array(10).keys()].map((i) => [i, { turretTakedowns: i === 0 ? 1 : 0 }]))), RIFT)!;
    for (let i = 0; i < 10; i++) expect(scoreOf(towers, i).score).toBe(scoreOf(base, i).score);
  });

  it("counts the lane only for players whose lane the timeline confirms", () => {
    const s = scoreMatch(game({ 0: { laneDiff: 1_800 }, 5: { laneDiff: -1_800 } }), RIFT)!;
    expect(s.components).toContain("lane");
    expect(scoreOf(s, 0).used).toContain("lane");
    expect(scoreOf(s, 1).used).not.toContain("lane");
    expect(scoreOf(s, 0).raw).toBeGreaterThan(scoreMatch(game(), RIFT)!.players[0]!.raw);
  });

  it("needs two teams and a length", () => {
    expect(scoreMatch(game().slice(0, 5), RIFT)).toBeNull();
    expect(scoreMatch(game(), { mode: "rift", minutes: 0 })).toBeNull();
  });
});

describe("fairness", () => {
  it("a strong support game (high KP, vision, crowd control and assists, low CS) scores at least as well as a mediocre high-kill carry", () => {
    // Blue support: 2/3/22 with 95 vision, 40 wards, 55 s of crowd control and 6k healing and shielding.
    // Red ADC: 11/7/3, kills but little else (average damage for a carry, deaths above it).
    const s = scoreMatch(game({ 4: { kills: 2, deaths: 3, assists: 22, vision: 95, wardsPlaced: 40, wardsKilled: 10, ccSeconds: 55, teamHealing: 3_500, teamShielding: 2_500 }, 8: { kills: 11, deaths: 7, assists: 3, damage: 27_000, gold: 14_500 } }), RIFT)!;
    expect(scoreOf(s, 4).score).toBeGreaterThanOrEqual(scoreOf(s, 8).score);
    expect(scoreOf(s, 4).score).toBeGreaterThanOrEqual(7.5);
  });

  it("a support can earn the game's MVP", () => {
    const s = scoreMatch(game({ 4: { kills: 3, deaths: 2, assists: 24, vision: 100, wardsPlaced: 42, wardsKilled: 12, ccSeconds: 60, teamHealing: 4_000, teamShielding: 3_000 } }), RIFT)!;
    expect(scoreOf(s, 4).mvp).toBe(true);
    expect(scoreOf(s, 4).rank).toBe(1);
  });

  it("a feeding carry scores poorly even with kills", () => {
    // Blue mid: 8 kills, 13 deaths, behind on farm and damage.
    const s = scoreMatch(game({ 2: { kills: 8, deaths: 13, assists: 3, cs: 170, damage: 21_000, gold: 11_000 } }), RIFT)!;
    expect(scoreOf(s, 2).score).toBeLessThan(4);
    expect(scoreOf(s, 2).rank).toBeGreaterThanOrEqual(8);
    expect(reasonText(scoreOf(s, 2).reasons)).toMatch(/Held back by /);
  });

  it("a win does not lift a weak game above a strong losing game", () => {
    // Blue (winning) top: 1/7/2, behind on everything. Red (losing) top: 8/2/5, ahead on everything.
    const s = scoreMatch(game({ 0: { kills: 1, deaths: 7, assists: 2, cs: 160, damage: 13_000, gold: 9_500 }, 5: { kills: 8, deaths: 2, assists: 5, cs: 250, damage: 30_000, gold: 14_000 } }), RIFT)!;
    expect(scoreOf(s, 0).score).toBeLessThan(scoreOf(s, 5).score);
    expect(scoreOf(s, 0).score).toBeLessThan(5);
    expect(scoreOf(s, 5).score).toBeGreaterThan(6.5);
  });

  it("the result alone moves a game by about half a point, never more", () => {
    const won = scoreMatch(game(), RIFT, {})!;
    const lost = scoreMatch(game({}, 200), RIFT)!;
    for (let i = 0; i < 10; i++) expect(Math.abs(scoreOf(won, i).score - scoreOf(lost, i).score)).toBeLessThanOrEqual(1);
  });

  it("an ordinary game stays at 4 or above when the lane opponent had an outstanding one", () => {
    // A typical support facing a support at 3/2/24 with 100 vision; a typical top facing a tank at 3/5/11 with 48k taken.
    const sup = scoreMatch(game({ 4: { kills: 3, deaths: 2, assists: 24, vision: 100, wardsPlaced: 42, wardsKilled: 12, ccSeconds: 60, teamHealing: 4_000, teamShielding: 3_000 } }), RIFT)!;
    expect(scoreOf(sup, 9).score).toBeGreaterThanOrEqual(4);
    const top = scoreMatch(game({ 0: { damage: 15_000, damageTaken: 48_000, damageMitigated: 45_000, ccSeconds: 50, kills: 3, assists: 11 } }), RIFT)!;
    expect(scoreOf(top, 5).score).toBeGreaterThanOrEqual(4);
  });

  it("a tank who takes the fights' damage and crowd-controls is credited, not judged on damage alone", () => {
    const tank = scoreMatch(game({ 0: { damage: 15_000, damageTaken: 48_000, damageMitigated: 45_000, ccSeconds: 50, kills: 3, assists: 11 } }), RIFT)!;
    expect(scoreOf(tank, 0).score).toBeGreaterThan(5.5);
    expect(scoreOf(tank, 0).reasons.map((r) => r.key)).toContain("tanking");
  });

  it("a player whose position is not recorded is judged on the role-neutral weights, and ARAM on its own", () => {
    const s = scoreMatch(game({ 2: { lane: null, counterpart: null } }), RIFT)!;
    expect(scoreOf(s, 2).weights).toBe("NEUTRAL");
    const aram = scoreMatch(game().map((p) => ({ ...p, lane: null, counterpart: null })), { mode: "aram", minutes: 18 })!;
    expect(aram.players.every((p) => p.weights === "ARAM")).toBe(true);
    expect(aram.players[0]!.used).not.toContain("farm");
    expect(aram.players[0]!.used).not.toContain("vision");
    expect(scoreModeOf(450)).toBe("aram");
    expect(scoreModeOf(420)).toBe("rift");
    expect(scoreModeOf(null)).toBe("rift");
  });

  it("is deterministic: the same game gives the same scores in any order of its players", () => {
    const a = scoreMatch(game({ 3: { kills: 10 } }), RIFT)!;
    const b = scoreMatch([...game({ 3: { kills: 10 } })].reverse(), RIFT)!;
    for (let i = 0; i < 10; i++) {
      expect(scoreOf(a, i).score).toBe(scoreOf(b, i).score);
      expect(scoreOf(a, i).rank).toBe(scoreOf(b, i).rank);
      expect(scoreOf(a, i).raw).toBeCloseTo(scoreOf(b, i).raw, 12);
    }
  });
});

describe("the why", () => {
  it("names at most two components that lifted the score and one that held it back", () => {
    const s = scoreMatch(game({ 4: { vision: 100, assists: 22, deaths: 11 } }), RIFT)!;
    const r = scoreOf(s, 4).reasons;
    expect(r.filter((x) => x.direction === "above").length).toBeLessThanOrEqual(2);
    expect(r.filter((x) => x.direction === "below").length).toBeLessThanOrEqual(1);
    expect(reasonText(r)).toMatch(/^Stood out: .*strong vision.*\. Held back by many deaths\.$/);
    expect(reasonText([])).toBeNull();
  });
});

describe("the lane figure (the timeline's one part in the score)", () => {
  it("reads values between frames, never outside them", () => {
    expect(seriesAt([0, 60_000], [0, 100], 30_000)).toBe(50);
    expect(seriesAt([0, 60_000], [0, 100], 90_000)).toBeNull();
    const me = { g: [500, 2_000, 4_000], x: [0, 1_000, 2_000] };
    const them = { g: [500, 1_800, 3_500], x: [0, 900, 1_900] };
    // Before 10:00 the moment itself; once 10:00 has passed, 10:00 alone (15:00 not yet).
    expect(laneValue([0, 600_000, 900_000], me, them, 300_000)).toBeCloseTo((1_250 + 500 - 1_150 - 450), 6);
    expect(laneValue([0, 600_000, 900_000], me, them, 700_000)).toBe(2_000 + 1_000 - 1_800 - 900);
    expect(laneValue([0, 600_000, 900_000], me, them, 900_000)).toBe(((2_000 + 1_000 - 1_800 - 900) + (4_000 + 2_000 - 3_500 - 1_900)) / 2);
  });
});

describe("the score through the game is gone (the owner's requirements of 25 Nov 2026)", () => {
  it("exports no timeline score, damping, prior or trend word: final scores only", () => {
    for (const name of ["timelineScores", "trendOf", "evidenceAt", "coverageOf", "timelineStep", "DAMPING_MINUTES", "PRIOR_MINUTES", "TREND_RULES", "TREND_SENTENCES"]) expect(model, name).not.toHaveProperty(name);
    expect(SCORE_VERSION, "final scores unchanged").toBe("v3");
  });
});

describe("MVP and ACE (the winning team's highest score, and the losing team's)", () => {
  /** A deterministic spread of games: each player's figures moved by a small pseudo-random factor. */
  const varied = (seed: number, winner: 100 | 200) => {
    let x = seed;
    const next = () => ((x = (x * 1_103_515_245 + 12_345) % 2_147_483_648) / 2_147_483_648) * 1.6 + 0.4;
    return game(Object.fromEntries(Array.from({ length: 10 }, (_, slot) => {
      const t = TYPICAL[LANES[slot % 5]!];
      return [slot, { kills: Math.round(t.kills! * next()), deaths: Math.round(t.deaths! * next()), assists: Math.round(t.assists! * next()), damage: Math.round(t.damage! * next()), gold: Math.round(t.gold! * next()), cs: Math.round(t.cs! * next()) }];
    })), winner);
  };

  it("MVP is the top scorer of the winning team and ACE of the losing team, in every game of a varied set", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const winner = seed % 2 ? 100 : 200;
      const s = scoreMatch(varied(seed, winner), RIFT)!;
      const best = (won: boolean) => [...s.players].filter((p) => (p.teamId === winner) === won).sort((a, b) => b.raw - a.raw || a.slot - b.slot)[0]!;
      expect(s.players.filter((p) => p.mvp).map((p) => p.slot), `seed ${seed}`).toEqual([best(true).slot]);
      expect(s.players.filter((p) => p.ace).map((p) => p.slot), `seed ${seed}`).toEqual([best(false).slot]);
    }
  });

  it("names the losing team's best ACE even when they are first overall, and the winning team's best MVP below them", () => {
    const s = scoreMatch(game({ 6: { kills: 16, deaths: 1, assists: 8, damage: 45_000, gold: 17_000 } }), RIFT)!;
    const ace = s.players.find((p) => p.ace)!;
    const mvp = s.players.find((p) => p.mvp)!;
    expect(ace.slot).toBe(6);
    expect(ace.rank, "the ACE can be the game's 1st").toBe(1);
    expect(mvp.teamId).toBe(100);
    expect(mvp.rank).toBeGreaterThan(1);
  });

  it("names neither in a game without a winner (a remake), nor where every player is on one side's result", () => {
    expect(scoreMatch(game().map((p) => ({ ...p, win: false })), RIFT)!.players.some((p) => p.mvp || p.ace)).toBe(false);
    expect(scoreMatch(game().map((p) => ({ ...p, win: true })), RIFT)!.players.some((p) => p.mvp || p.ace)).toBe(false);
  });
});

describe("team means", () => {
  it("names each team's mean score, and Excellent from 8.0", () => {
    const s = scoreMatch(game(), RIFT)!;
    const avg = teamAverages(s);
    expect(avg[100]).toBeGreaterThan(avg[200]!);
    expect(EXCELLENT_AT).toBe(8);
  });
});
