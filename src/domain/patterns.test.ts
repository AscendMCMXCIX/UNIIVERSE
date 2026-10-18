import { describe, expect, it } from "vitest";
import { patternSentence, personalPatterns } from "./patterns";
import type { SeasonGame } from "./season-stats";

const DAY = 86_400_000;
let n = 0;
/** One game, `daysAgo` before 18 Oct 2026, 30 minutes long. */
const game = (daysAgo: number, over: Partial<SeasonGame> = {}): SeasonGame => ({ matchId: `OC1_${++n}`, accountId: "a", queueId: 420, championId: "Ahri", role: "MID", win: true, patch: "16.20", gameCreation: Date.UTC(2026, 9, 18) - daysAgo * DAY, kills: 5, deaths: 4, assists: 6, cs: 210, damage: 21000, visionScore: 20, gameDuration: 1800, ...over });

describe("personal patterns", () => {
  it("compares the last 20 games with the 40 before, with sample sizes and dates", () => {
    const recent = Array.from({ length: 20 }, (_, i) => game(i, { cs: 240, deaths: 3 }));
    const before = Array.from({ length: 40 }, (_, i) => game(30 + i, { cs: 210, deaths: 6, win: i % 2 === 0 }));
    const p = personalPatterns([...before, ...recent]);
    expect(p.recent).toMatchObject({ games: 20 });
    expect(p.before).toMatchObject({ games: 40 });
    expect(p.recent!.to - p.recent!.from).toBe(19 * DAY);
    const by = Object.fromEntries(p.figures.map((f) => [f.key, f]));
    expect(by.cs).toMatchObject({ recent: { value: 8, games: 20 }, before: { value: 7, games: 40 }, direction: "higher" });
    expect(by.deaths).toMatchObject({ recent: { value: 3 }, before: { value: 6 }, direction: "lower" });
    expect(by.damage!.direction).toBe("same");
    expect(patternSentence(by.cs!)).toBe("CS per minute: 8.0 over your last 20 games, 7.0 over the 40 before (higher).");
    expect(patternSentence(by.damage!)).toBe("Damage per minute: 700 over your last 20 games, 700 over the 40 before (about the same).");
    expect(p.omitted).toEqual([]);
  });

  it("leaves out a figure without enough games on either side, and says so", () => {
    const recent = Array.from({ length: 20 }, (_, i) => game(i));
    const before = Array.from({ length: 9 }, (_, i) => game(30 + i));
    const p = personalPatterns([...recent, ...before]);
    expect(p.figures).toEqual([]);
    expect(p.omitted).toEqual(["CS per minute", "Deaths per game", "KDA", "Damage per minute"]);
    // Figures Riot no longer serves count as missing, not as zero.
    const missing = [...Array.from({ length: 20 }, (_, i) => game(i, { damage: null })), ...Array.from({ length: 20 }, (_, i) => game(30 + i))];
    const q = personalPatterns(missing);
    expect(q.figures.map((f) => f.key)).toEqual(["cs", "deaths", "kda"]);
    expect(q.omitted).toEqual(["Damage per minute"]);
    expect(personalPatterns([])).toEqual({ recent: null, before: null, figures: [], champions: [], omitted: ["CS per minute", "Deaths per game", "KDA", "Damage per minute"] });
  });

  it("counts a game once across linked accounts and leaves out remakes", () => {
    const g = game(1);
    const list = [g, { ...g, accountId: "b" }, game(2, { win: null })];
    expect(personalPatterns(list).recent).toMatchObject({ games: 1 });
  });

  it("lists champion form for champions played often in the recent games, with their record before", () => {
    const recent = [...Array.from({ length: 6 }, (_, i) => game(i, { championId: "Syndra", win: i < 4 })), ...Array.from({ length: 4 }, (_, i) => game(6 + i, { championId: "Ahri" })), ...Array.from({ length: 10 }, (_, i) => game(10 + i, { championId: `C${i}` }))];
    const before = Array.from({ length: 20 }, (_, i) => game(40 + i, { championId: "Syndra", win: i < 8 }));
    const p = personalPatterns([...recent, ...before]);
    expect(p.champions).toEqual([
      { championId: "Syndra", games: 6, wins: 4, before: { games: 20, wins: 8 } },
      { championId: "Ahri", games: 4, wins: 4, before: null },
    ]);
  });
});
