import { describe, expect, it } from "vitest";
import { dedupeGames, performanceOfGames, type SeasonGame } from "./season-stats";

const game = (over: Partial<SeasonGame>): SeasonGame => ({ matchId: Math.random().toString(36), accountId: "a1", queueId: 420, championId: "Gwen", role: "TOP", win: true, patch: "16.20.1", gameCreation: 1, ...over });

describe("performance averages", () => {
  it("computes the KDA ratio from totals, so one deathless game cannot make it infinite", () => {
    const p = performanceOfGames([game({ kills: 10, deaths: 0, assists: 5 }), game({ kills: 2, deaths: 4, assists: 6 })]);
    expect(p.kdaRatio).toBeCloseTo((10 + 5 + 2 + 6) / 4, 6);
    expect(p.kills).toBe(6);
    expect(p.deaths).toBe(2);
    expect(p.assists).toBe(5.5);
    expect(p.perfectKda).toBe(false);
  });

  it("flags a perfect KDA when no game had a death, without dividing by zero", () => {
    const p = performanceOfGames([game({ kills: 3, deaths: 0, assists: 4 }), game({ kills: 1, deaths: 0, assists: 2 })]);
    expect(p.perfectKda).toBe(true);
    expect(Number.isFinite(p.kdaRatio!)).toBe(true);
    expect(p.kdaRatio).toBe(5); // (3+4+1+2) per game
  });

  it("averages CS, damage and vision per game over games that have them, with sample counts", () => {
    const p = performanceOfGames([
      game({ kills: 1, deaths: 1, assists: 1, cs: 200, damage: 20000, visionScore: 20, gameDuration: 1800 }),
      game({ kills: 1, deaths: 1, assists: 1, cs: 100, damage: 10000, visionScore: 40, gameDuration: 1200 }),
      game({}), // stored before details were recorded: counts for the record only
    ]);
    expect(p.games).toBe(3);
    expect(p.detailedGames).toBe(2);
    expect(p.csPerGame).toBe(150);
    expect(p.csGames).toBe(2);
    expect(p.csPerMinute).toBeCloseTo(300 / 50, 6);
    expect(p.damagePerGame).toBe(15000);
    expect(p.visionPerGame).toBe(30);
  });

  it("never invents figures: no details means null, and the 'details unavailable' marker is ignored", () => {
    const p = performanceOfGames([game({}), game({ kills: -1 })]);
    expect(p.detailedGames).toBe(0);
    expect(p.kdaRatio).toBeNull();
    expect(p.csPerGame).toBeNull();
    expect(p.damagePerGame).toBeNull();
    expect(p.visionPerGame).toBeNull();
  });

  it("counts a game shared by two linked accounts once", () => {
    const shared = { matchId: "OC1_1", kills: 4, deaths: 2, assists: 6, cs: 180 };
    const games = dedupeGames([game({ ...shared, accountId: "a1" }), game({ ...shared, accountId: "a2" }), game({ matchId: "OC1_2", kills: 0, deaths: 2, assists: 0, cs: 120 })]);
    const p = performanceOfGames(games);
    expect(p.games).toBe(2);
    expect(p.kdaRatio).toBe((4 + 6 + 0) / 4);
    expect(p.csPerGame).toBe(150);
  });
});
