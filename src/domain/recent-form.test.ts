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

describe("recent performance figures", () => {
  const game = (i: number, k: number, d: number, a: number, cs: number, role = "MID"): FormGame => ({ matchId: `P${i}`, win: i % 2 === 0, gameCreation: 1000 - i, championId: "Ahri", kills: k, deaths: d, assists: a, cs, visionScore: 30, gameDuration: 1800, role });

  it("compares KDA and CS/min only with enough games on both sides, and names a clear gap", () => {
    // Newest 20: KDA (5+5)/2 = 5, 9 CS/min; older 20: KDA (2+2)/2 = 2, 6 CS/min.
    const list = [...Array.from({ length: 20 }, (_, i) => game(i, 5, 2, 5, 270)), ...Array.from({ length: 20 }, (_, i) => game(20 + i, 2, 2, 2, 180))];
    const f = recentForm(list);
    const kda = f.metrics.find((m) => m.key === "kda")!;
    const cs = f.metrics.find((m) => m.key === "cs")!;
    expect(kda.recent).toBe(5);
    expect(kda.season).toBe(3.5);
    expect(kda.direction).toBe("up");
    expect(cs.recent).toBe(9);
    expect(cs.season).toBe(7.5);
    expect(cs.direction).toBe("up");
    expect(f.metrics.map((m) => m.key)).toEqual(["kda", "cs"]);
  });

  it("calls nothing on a small sample and shows vision instead of CS for supports", () => {
    const few = recentForm(Array.from({ length: 12 }, (_, i) => game(i, 1, 5, 10, 30, "SUPPORT")));
    expect(few.metrics.map((m) => m.key)).toEqual(["kda", "vision"]);
    expect(few.metrics.every((m) => m.direction === null)).toBe(true);
  });

  it("leaves out a figure no game carries", () => {
    expect(recentForm(games([true, false, true, false, true])).metrics).toEqual([]);
  });
});
