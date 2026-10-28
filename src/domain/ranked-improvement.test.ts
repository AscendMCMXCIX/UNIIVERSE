import { describe, expect, it } from "vitest";
import { blockLabel, blockProgressText, championPerformance, cleanLink, isMainMistake, matchupRecords, mistakeCounts, mistakeLabel, summariseGames } from "./ranked-improvement";

const g = (championId: string, result: "win" | "loss", mainMistake: string | null = null, enemyChampionId: string | null = null) => ({ championId, enemyChampionId, result, mainMistake: isMainMistake(mainMistake) ? mainMistake : null, teammatePlayerId: null });

describe("ranked improvement domain", () => {
  it("summarises exactly the games that exist, partial blocks included", () => {
    const d = summariseGames([g("Jinx", "win", "mental"), g("Jinx", "loss", "mental"), g("Kaisa", "loss", "wave-tempo"), g("Kaisa", "win")]);
    expect(d.totalGames).toBe(4);
    expect(d.wins).toBe(2);
    expect(d.losses).toBe(2);
    expect(d.winRate).toBe(0.5);
    expect(d.mostCommonMistake).toEqual({ key: "mental", label: "Mental", count: 2 });
  });

  it("has no win rate or mistake with no games, and breaks mistake ties alphabetically", () => {
    expect(summariseGames([])).toEqual({ totalGames: 0, wins: 0, losses: 0, winRate: null, mostCommonMistake: null });
    expect(summariseGames([g("A", "win", "vision-awareness"), g("A", "win", "mechanics")]).mostCommonMistake?.key).toBe("mechanics");
  });

  it("ranks champions by games then name and reports raw win rates", () => {
    const rows = championPerformance([g("Jinx", "win"), g("Jinx", "loss"), g("Jinx", "win"), g("Ezreal", "loss"), g("Ashe", "loss")]);
    expect(rows.map((r) => r.championId)).toEqual(["Jinx", "Ashe", "Ezreal"]);
    expect(rows[0]).toMatchObject({ games: 3, wins: 2, losses: 1 });
    expect(rows[0]!.winRate).toBeCloseTo(2 / 3);
  });

  it("counts mistakes and matchups, ignoring games without an enemy champion", () => {
    const games = [g("Jinx", "win", "mental", "Caitlyn"), g("Jinx", "loss", "mental", "Caitlyn"), g("Jinx", "loss", "other"), g("Kaisa", "win", null, "Draven")];
    expect(mistakeCounts(games)).toEqual([
      { key: "mental", label: "Mental", count: 2 },
      { key: "other", label: "Other", count: 1 },
    ]);
    expect(matchupRecords(games)).toEqual([
      { championId: "Jinx", enemyChampionId: "Caitlyn", games: 2, wins: 1, losses: 1 },
      { championId: "Kaisa", enemyChampionId: "Draven", games: 1, wins: 1, losses: 0 },
    ]);
  });

  it("labels blocks as numbered sessions and knows every mistake category", () => {
    expect(blockLabel(1)).toBe("Session 1");
    expect(blockLabel(42)).toBe("Session 42");
    expect(mistakeLabel("trading-laning")).toBe("Trading / Laning");
    expect(mistakeLabel("nope")).toBe("—");
    expect(isMainMistake("positioning-teamfight")).toBe(true);
    expect(isMainMistake("")).toBe(false);
  });

  it("accepts only http(s) links", () => {
    expect(cleanLink("  https://www.op.gg/summoners/oce/Ascend-OCE/matches/abc  ")).toBe("https://www.op.gg/summoners/oce/Ascend-OCE/matches/abc");
    expect(cleanLink("")).toBe("");
    expect(cleanLink(null)).toBe("");
    expect(() => cleanLink("javascript:alert(1)")).toThrow(/http/);
    expect(() => cleanLink("op.gg/summoner")).toThrow(/http/);
  });
});

describe("block progress wording", () => {
  it("starts at 0 Games and counts up with no target; with one, says how far along or past it", () => {
    expect(blockProgressText(0, null)).toBe("0 Games");
    expect(blockProgressText(1, null)).toBe("1 Game");
    expect(blockProgressText(7, null)).toBe("7 Games");
    expect(blockProgressText(4, 5)).toBe("4 of 5 games");
    expect(blockProgressText(7, 5)).toBe("7 games · 2 past the target of 5");
  });
});
