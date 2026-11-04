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

  it("rates CS and damage per minute as total over total minutes, leaving remakes and broken durations out", () => {
    const p = performanceOfGames([
      game({ cs: 300, damage: 30000, gameDuration: 1800 }), // 30 min
      game({ cs: 120, damage: 18000, gameDuration: 900 }), // 15 min
      game({ cs: 20, damage: 4000, gameDuration: 200 }), // remake: no per-minute weight
      game({ cs: 50, damage: 9000, gameDuration: 0 }), // broken duration
      game({ cs: 250, damage: 25000 }), // no duration recorded
    ]);
    expect(p.csPerMinute).toBeCloseTo(420 / 45, 6);
    expect(p.damagePerMinute).toBeCloseTo(48000 / 45, 6);
    // Not the average of per-game rates ((10 + 8) / 2 = 9 CS/min).
    expect(p.csPerMinute).not.toBeCloseTo(9, 3);
    expect(p.csMinuteGames).toBe(2);
    expect(p.damageMinuteGames).toBe(2);
    // The per-game averages still count every game that has the figure.
    expect(p.csGames).toBe(5);
  });

  it("cross-account duplicates count once in the per-minute rates too", () => {
    const shared = { matchId: "OC1_9", cs: 240, damage: 24000, gameDuration: 1200 };
    const p = performanceOfGames(dedupeGames([game({ ...shared, accountId: "a1" }), game({ ...shared, accountId: "a2" })]));
    expect(p.csPerMinute).toBeCloseTo(12, 6);
    expect(p.damagePerMinute).toBeCloseTo(1200, 6);
    expect(p.csMinuteGames).toBe(1);
  });

  it("never invents figures: no details means null, and the 'details unavailable' marker is ignored", () => {
    const p = performanceOfGames([game({}), game({ kills: -1 })]);
    expect(p.detailedGames).toBe(0);
    expect(p.kdaRatio).toBeNull();
    expect(p.csPerGame).toBeNull();
    expect(p.damagePerGame).toBeNull();
    expect(p.damagePerMinute).toBeNull();
    expect(p.visionPerGame).toBeNull();
    expect(p.totalKills).toBeNull();
  });

  it("counts a game shared by two linked accounts once", () => {
    const shared = { matchId: "OC1_1", kills: 4, deaths: 2, assists: 6, cs: 180 };
    const games = dedupeGames([game({ ...shared, accountId: "a1" }), game({ ...shared, accountId: "a2" }), game({ matchId: "OC1_2", kills: 0, deaths: 2, assists: 0, cs: 120 })]);
    const p = performanceOfGames(games);
    expect(p.games).toBe(2);
    expect(p.kdaRatio).toBe((4 + 6 + 0) / 4);
    expect(p.csPerGame).toBe(150);
    expect(p.totalKills).toBe(4);
  });

  it("adds up every game's own kill count for the total kills, leaving games without one out", () => {
    const p = performanceOfGames([
      // A pentakill game: 11 kills, whatever its multikills add up to.
      game({ kills: 11, deaths: 3, assists: 4, multikills: "2,1,1,1" }),
      game({ kills: 0, deaths: 5, assists: 9 }),
      game({ kills: 6, deaths: 2, assists: 3 }),
      game({}), // stored before details were recorded
      game({ kills: -1 }), // Riot no longer serves the details
    ]);
    expect(p.totalKills).toBe(17);
    expect(p.detailedGames).toBe(3);
    expect(p.games).toBe(5);
    // A game with no kill is a 0 that counts; no game with a count is no total at all.
    expect(performanceOfGames([game({ kills: 0, deaths: 1, assists: 0 })]).totalKills).toBe(0);
    expect(performanceOfGames([game({}), game({ kills: -1 })]).totalKills).toBeNull();
  });
});
