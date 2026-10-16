import { describe, expect, it } from "vitest";
import { describeLane, laneDiffs, summariseMinutes, valueAt, MIN_PATTERN_GAMES, type PlayerSeries } from "./matchups";

describe("valueAt", () => {
  // Riot's frames are about a minute apart, not exactly; the last frame is the end of the game.
  const t = [0, 60_340, 120_910, 181_200, 205_000];
  const v = [500, 700, 1000, 1300, 1400];
  it("reads between the frames around the moment, by timestamp, not by frame number", () => {
    // 120,000 ms is just before the third frame (120,910): almost all the way from 700 to 1000.
    expect(valueAt(t, v, 120_000)).toBeCloseTo(700 + (300 * (120_000 - 60_340)) / (120_910 - 60_340), 6);
    expect(valueAt(t, v, 60_340)).toBe(700);
    expect(valueAt(t, v, 0)).toBe(500);
  });
  it("has no value after the game ended or without frames", () => {
    expect(valueAt(t, v, 240_000)).toBeNull();
    expect(valueAt([], [], 60_000)).toBeNull();
    expect(valueAt(t, v.slice(1), 60_000)).toBeNull();
  });
});

const series = (gpm: number, t: number[], start = 500): PlayerSeries => ({ g: t.map((ms) => start + (gpm * ms) / 60_000), x: t.map((ms) => (400 * ms) / 60_000), c: t.map((ms) => Math.floor((7 * ms) / 60_000)) });
const frames = (minutes: number) => [...Array.from({ length: minutes + 1 }, (_, i) => i * 60_000 + (i ? 250 : 0)), minutes * 60_000 + 30_000];

describe("laneDiffs", () => {
  it("is the player minus the lane opponent at each minute, null once the game is over", () => {
    const t = frames(16);
    const d = laneDiffs(t, series(420, t), series(380, t), [10, 15, 20]);
    expect(d[0]!.gold).toBeCloseTo(400, 0);
    expect(d[1]!.gold).toBeCloseTo(600, 0);
    expect(d[2]).toEqual({ minute: 20, gold: null, xp: null, cs: null });
    expect(d[0]!.xp).toBeCloseTo(0, 6);
  });
});

describe("summariseMinutes", () => {
  it("counts only the games that reached each minute and keeps the sample size", () => {
    const long = frames(30);
    const short = frames(18);
    const games = [laneDiffs(long, series(420, long), series(380, long), [10, 20]), laneDiffs(short, series(360, short), series(400, short), [10, 20])];
    const [ten, twenty] = summariseMinutes(games, [10, 20]);
    expect(ten).toMatchObject({ minute: 10, games: 2, aheadInGold: 1 });
    expect(ten!.goldMean).toBeCloseTo(0, 0);
    expect(twenty).toMatchObject({ minute: 20, games: 1, aheadInGold: 1 });
    expect(twenty!.goldMean).toBeCloseTo(800, 0);
  });
  it("has no averages without games", () => {
    expect(summariseMinutes([], [10])[0]).toEqual({ minute: 10, games: 0, goldMean: null, goldMedian: null, xpMean: null, csMean: null, aheadInGold: 0 });
  });
});

describe("describeLane", () => {
  const minute = (m: number, games: number, goldMean: number, ahead: number) => ({ minute: m, games, goldMean, goldMedian: goldMean, xpMean: 0, csMean: 0, aheadInGold: ahead });
  it("says nothing about a pattern from a small sample", () => {
    expect(describeLane([minute(10, MIN_PATTERN_GAMES - 1, 500, 4), minute(20, MIN_PATTERN_GAMES - 1, 1500, 4)])).toEqual([]);
  });
  it("describes what happened in these games, with the counts, and never claims always or a cause", () => {
    const lines = describeLane([minute(10, 8, 320, 6), minute(20, 6, 1100, 5)]);
    expect(lines[0]).toBe("At 10:00 you had more gold than your lane opponent in 6 of 8 games (average +320 gold).");
    expect(lines[1]).toContain("lead grew between 10:00 (+320, 8 games) and 20:00 (+1,100, 6 games)");
    expect(lines.join(" ")).not.toMatch(/always|because|should|weak|strong/i);
  });
  it("names a lead that turned into a deficit", () => {
    expect(describeLane([minute(10, 6, 300, 4), minute(20, 6, -400, 2)])[1]).toContain("lead turned into a deficit");
  });
});
