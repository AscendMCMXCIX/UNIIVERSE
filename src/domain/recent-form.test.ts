import { describe, expect, it } from "vitest";
import { recentForm, type FormGame } from "./recent-form";

const games = (results: Array<boolean | null>): FormGame[] => results.map((win, i) => ({ matchId: `M${i}`, win, gameCreation: 1000 - i, championId: "Ahri" }));

describe("recentForm", () => {
  it("lists the newest results first and leaves out games without a result", () => {
    const f = recentForm(games([true, null, false, true]));
    expect(f.last.map((g) => g.win)).toEqual([true, false, true]);
    expect(f.season).toEqual({ games: 3, wins: 2, winRate: 2 / 3 });
  });

  it("calls no trend on a small sample, however big the gap", () => {
    const f = recentForm(games([true, true, true, true, true, false, false, false, false, false, false, false]));
    expect(f.trend).toBeNull();
    expect(f.gapPoints).not.toBeNull();
  });

  it("calls a trend only with enough games and a clear gap", () => {
    // Newest 20: 15 wins (75%); older 20: 5 wins. Season 20/40 = 50%.
    const newest = Array.from({ length: 20 }, (_, i) => i < 15);
    const older = Array.from({ length: 20 }, (_, i) => i < 5);
    const up = recentForm(games([...newest, ...older]));
    expect(up.recent.winRate).toBe(0.75);
    expect(up.gapPoints).toBe(25);
    expect(up.trend).toBe("up");
    const flat = recentForm(games(Array.from({ length: 40 }, (_, i) => i % 2 === 0)));
    expect(flat.trend).toBe("steady");
  });

  it("is empty without games", () => {
    const f = recentForm([]);
    expect(f.last).toEqual([]);
    expect(f.recent.winRate).toBeNull();
    expect(f.trend).toBeNull();
  });
});
