import { describe, expect, it } from "vitest";
import { historySummary, killParticipationOf, mostPlayedOf, streakOf, type HistorySummaryGame } from "./history-summary";

const game = (i: number, win: boolean | null, over: Partial<HistorySummaryGame> = {}): HistorySummaryGame => ({ matchId: `M${i}`, win, gameCreation: i * 1000, championId: "Ahri", kills: 4, deaths: 2, assists: 6, cs: 180, visionScore: 20, gameDuration: 1500, teamKills: 20, ...over });

describe("streak", () => {
  it("is the newest games' run of one result, ignoring games without one", () => {
    expect(streakOf([game(1, false), game(2, true), game(3, true), game(4, null)])).toEqual({ win: true, games: 2 });
    expect(streakOf([game(1, true), game(2, false)])).toEqual({ win: false, games: 1 });
    expect(streakOf([game(1, null)])).toBeNull();
    expect(streakOf([])).toBeNull();
  });
});

describe("most played", () => {
  it("orders by games, then wins, at most three", () => {
    const games = [game(1, true, { championId: "Jax" }), game(2, false, { championId: "Jax" }), game(3, true, { championId: "Gwen" }), game(4, true, { championId: "Gwen" }), game(5, true, { championId: "Galio" }), game(6, false, { championId: "Sett" })];
    expect(mostPlayedOf(games)).toEqual([
      { championId: "Gwen", games: 2, wins: 2 },
      { championId: "Jax", games: 2, wins: 1 },
      { championId: "Galio", games: 1, wins: 1 },
    ]);
  });
});

describe("kill participation", () => {
  it("is total takedowns over total team kills, over the games that carry both", () => {
    expect(killParticipationOf([game(1, true, { kills: 2, assists: 3, teamKills: 10 }), game(2, true, { kills: 10, assists: 5, teamKills: 30 })])).toEqual({ value: 20 / 40, games: 2 });
    expect(killParticipationOf([game(1, true, { teamKills: null }), game(2, true, { teamKills: 0 }), game(3, true, { kills: -1 })])).toEqual({ value: null, games: 0 });
  });
});

describe("summary", () => {
  it("counts the strip, the streak and the champions over the same games as the Overview's recent form", () => {
    const games = Array.from({ length: 25 }, (_, i) => game(i, i % 2 === 0, { championId: i < 5 ? "Old" : "New" }));
    const s = historySummary(games);
    expect(s.form.recent.games).toBe(20);
    expect(s.streak).toEqual({ win: true, games: 1 });
    // Only the 20 newest games: the five oldest ("Old") are not among them.
    expect(s.mostPlayed.map((c) => c.championId)).toEqual(["New"]);
    expect(s.killParticipation.games).toBe(20);
  });
});
