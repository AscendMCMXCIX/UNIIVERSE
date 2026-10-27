import { describe, expect, it } from "vitest";
import { compareMeasure, describeEvidence, MIN_GAMES } from "./evidence";
import { earlyDeathsOf, EARLY_GAME_MS, gameMeasure, measureValue, type MeasuredGame } from "./measures";

let n = 0;
const game = (over: Partial<MeasuredGame> = {}): MeasuredGame => ({
  matchId: `OC1_${++n}`,
  playedAt: n * 1000,
  role: "MID",
  championId: "Ahri",
  win: true,
  durationSec: 1800,
  kills: 5,
  deaths: 4,
  assists: 6,
  cs: 240,
  visionScore: 30,
  teamKills: 25,
  controlWards: 2,
  csAt10: 75,
  earlyDeaths: 1,
  ...over,
});
const many = (count: number, over: (i: number) => Partial<MeasuredGame>) => Array.from({ length: count }, (_, i) => game(over(i)));

describe("per-game figures", () => {
  it("are read from what the game recorded, and stay missing when it did not", () => {
    const g = game();
    expect(measureValue("deaths", g)).toBe(4);
    expect(measureValue("cs-per-min", g)).toBeCloseTo(8);
    expect(measureValue("vision-per-min", g)).toBeCloseTo(1);
    expect(measureValue("kill-participation", g)).toBeCloseTo(44);
    expect(measureValue("cs-per-min", game({ cs: null }))).toBeNull();
    expect(measureValue("early-deaths", game({ earlyDeaths: null }))).toBeNull();
    // A game cut short says nothing about per-minute habits.
    expect(measureValue("cs-per-min", game({ durationSec: 600 }))).toBeNull();
    expect(measureValue("kill-participation", game({ teamKills: 0 }))).toBeNull();
  });

  it("read the same way for one game in a session as across games", () => {
    const figures = { kills: 2, deaths: 6, assists: 8, cs: 180, durationSec: 1500, visionScore: 25, teamKills: 20, controlWards: 0, csAt10: 61, earlyDeaths: 3 };
    expect(gameMeasure("deaths", figures)).toBe(6);
    expect(gameMeasure("cs-per-min", figures)).toBeCloseTo(7.2);
    expect(gameMeasure("kill-participation", figures)).toBeCloseTo(50);
    expect(gameMeasure("control-wards", figures)).toBe(0);
    expect(gameMeasure("early-deaths", { ...figures, earlyDeaths: null })).toBeNull();
    expect(gameMeasure("vision-per-min", { ...figures, durationSec: 300 })).toBeNull();
  });

  it("count early deaths from the timeline's death times, unknown without them", () => {
    expect(earlyDeathsOf([60_000, EARLY_GAME_MS - 1, EARLY_GAME_MS, 30 * 60_000])).toBe(2);
    expect(earlyDeathsOf([])).toBe(0);
    expect(earlyDeathsOf(null)).toBeNull();
  });
});

describe("comparing a statistic before and during practice", () => {
  it("says there is no statistic when the objective follows none", () => {
    expect(compareMeasure(null, [], [])).toEqual({ state: "no-measure" });
    expect(describeEvidence({ state: "no-measure" })).toBeNull();
  });

  it("needs enough games in both periods, and says how many are missing", () => {
    const r = compareMeasure("deaths", many(10, () => ({})), many(MIN_GAMES - 1, () => ({})));
    expect(r).toMatchObject({ state: "insufficient", baseline: 10, practice: MIN_GAMES - 1, needed: MIN_GAMES });
    expect(describeEvidence(r)!.headline).toBe("Not enough games to compare yet");
  });

  it("does not count games without the figure, and mentions timelines still to come", () => {
    const r = compareMeasure("early-deaths", many(8, () => ({ earlyDeaths: 2 })), [...many(3, () => ({ earlyDeaths: 0 })), ...many(4, () => ({ earlyDeaths: null }))]);
    expect(r).toMatchObject({ state: "insufficient", practice: 3, missingPractice: 4 });
    expect(describeEvidence(r)!.detail).toMatch(/4 recent games are still waiting for their timeline/);
  });

  it("reports a clear change in the better direction as an observation, never as proof", () => {
    const before = many(12, (i) => ({ deaths: 6 + (i % 3) - 1 }));
    const during = many(8, (i) => ({ deaths: 3 + (i % 3) - 1 }));
    const r = compareMeasure("deaths", before, during);
    expect(r).toMatchObject({ state: "compared", trend: "toward" });
    if (r.state !== "compared") throw new Error("compared");
    expect(r.baseline.mean).toBeCloseTo(6, 0);
    expect(r.practice.mean).toBeCloseTo(3, 0);
    const text = describeEvidence(r)!;
    expect(text.headline).toBe("Deaths per game: lower than before");
    expect(text.caveat).toMatch(/not proof of improvement/);
  });

  it("calls a small or noisy difference 'about the same'", () => {
    const noisy = (i: number) => ({ deaths: [1, 9, 2, 8, 5][i % 5]! });
    const r = compareMeasure("deaths", many(10, noisy), many(10, (i) => ({ deaths: [1, 9, 2, 8, 5][i % 5]! - 0.4 })));
    expect(r).toMatchObject({ state: "compared", trend: "similar" });
    expect(describeEvidence(r)!.headline).toBe("Deaths per game: about the same as before");
  });

  it("calls a change in the worse direction what it is, for a figure where higher is better", () => {
    const r = compareMeasure("cs-per-min", many(10, (i) => ({ cs: 270 + i })), many(10, (i) => ({ cs: 200 + i })));
    expect(r).toMatchObject({ state: "compared", trend: "away" });
    expect(describeEvidence(r)!.headline).toBe("CS per minute: lower than before");
  });

  it("uses the newest twenty games of each period only", () => {
    const before = [...many(20, () => ({ deaths: 6 })), ...many(30, () => ({ deaths: 1, playedAt: -1 }))];
    const r = compareMeasure("deaths", before, many(6, () => ({ deaths: 6 })));
    expect(r).toMatchObject({ state: "compared", trend: "similar" });
    if (r.state === "compared") expect(r.baseline.games).toBe(20);
  });

  it("flags a comparison across mostly different champions", () => {
    const r = compareMeasure("deaths", many(10, () => ({ championId: "Ahri", deaths: 6 })), many(6, () => ({ championId: "Zed", deaths: 2 })));
    expect(r).toMatchObject({ state: "compared", championOverlap: 0 });
    expect(describeEvidence(r)!.detail).toMatch(/champions you did not play before/);
  });
});
