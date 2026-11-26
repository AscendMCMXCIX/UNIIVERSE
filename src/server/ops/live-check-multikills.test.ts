import { describe, expect, it } from "vitest";
import { breakdownVerdicts, eventsOf, MULTIKILL_BASES, MULTIKILL_HEADS, multikillVerdicts, scoreFrom, type MultikillBoardRead, type MultikillBreakdownRead, type MultikillRowRead } from "../../../scripts/multikill-facts.mjs";

/*
  The Production check's multikill facts (scripts/multikill-facts.mjs): the readings below are the
  demo's table and a Score's breakdown as the check's own reader sees them (25 Nov 2026: the active
  players with a place, compared with the other players in the same games, nothing folded). The
  facts pass on them, fail the regressions they exist for, and only warn where a team's data cannot
  show them.
*/

/** A row whose shown counts (penta … double) are each multikill once; its Riot counters nested, as the demo's are. */
const row = (place: number, score: number, counts: number[], o: Partial<MultikillRowRead> = {}): MultikillRowRead => {
  const [p, q, t, d] = counts as [number, number, number, number];
  return { status: "ranked", place, score, shown: String(score), counts, cells: [...counts], counted: 40, games: 40, riot: [d + t + q + p, t + q + p, q + p, p], leader: place === 1, crown: false, roleNamed: true, scoreButton: true, height: 41, ...o };
};
const DEMO: MultikillBoardRead = {
  present: true,
  rows: [row(1, 126, [2, 5, 7, 32]), row(2, 117, [0, 1, 3, 33]), row(3, 112, [0, 1, 6, 29]), row(4, 106, [0, 1, 3, 19], { counted: 30, games: 30 }), row(5, 93, [0, 0, 1, 9], { counted: 21, games: 21 })],
  heads: MULTIKILL_HEADS[0]!,
  basis: MULTIKILL_BASES["same-games"],
  explained: true,
  legend: true,
  rule: "nested",
  empty: false,
  folds: 0,
  scrollers: 0,
};
const verdicts = (read: MultikillBoardRead) => multikillVerdicts({ kind: "desktop", read });
const failed = (read: MultikillBoardRead) => verdicts(read).filter((v) => v.status === "FAIL").map((v) => v.name.replace(/^desktop: /, ""));

/** Demo Mid's breakdown: 29 doubles, 6 triples, 1 quadra; 80 points against 67.1 typical → 112. */
const BREAKDOWN: MultikillBreakdownRead = {
  present: true,
  score: 112,
  calc: { earned: 80, expected: 67.1, cushion: 40, score: 112 },
  kinds: [
    { made: 29, weight: 2, points: 58 },
    { made: 6, weight: 3, points: 18 },
    { made: 1, weight: 4, points: 4 },
    { made: 0, weight: 5, points: 0 },
  ],
  role: true,
  comparison: true,
  levels: 1,
  scrolls: 0,
};
const breakdownFailed = (read: MultikillBreakdownRead, rowScore = 112) => breakdownVerdicts({ kind: "desktop", read, rowScore }).filter((v) => v.status === "FAIL").map((v) => v.name.replace(/^desktop: /, ""));

describe("the multikill table facts", () => {
  it("pass on the demo's table", () => {
    const v = verdicts(DEMO);
    expect(v.filter((x) => x.status !== "PASS")).toEqual([]);
    expect(v.map((x) => x.name.replace(/^desktop: /, ""))).toEqual([
      "the multikill table says what its score is ranked by, explains it behind its ⓘ, and how to read a score (below 100, 100, above 100)",
      "nothing folded on Leaderboards: no Show all, no fold",
      "nothing scrolls inside the page: no inner scrollbar",
      "the table's columns: place, player, games, the four kinds and the Score",
      "the multikill ranking: ranked players only (20+ games with counts), by score, a place shared exactly on equal scores, none skipped; first in gold, no crown",
      "every row shows its score as a button that opens its breakdown",
      "each row shows each multikill once, at its largest: Riot's counters read by the rule the board states",
      "each row's games and kind cells are its own counts",
      "each row's role icon is named by the most-played position over the score's games (or split, or unknown)",
      "compact rows: none taller than 72px",
    ]);
    // A phone draws no headings (its rows say the same in words): that fact is not asked there.
    expect(verdicts({ ...DEMO, heads: null }).filter((x) => x.status !== "PASS")).toEqual([]);
    expect(verdicts({ ...DEMO, heads: MULTIKILL_HEADS[1]! }).filter((x) => x.status !== "PASS")).toEqual([]);
  });

  it("fail a Show all or a fold anywhere on the page, an inner scrollbar, a missing legend, the old basis line", () => {
    expect(failed({ ...DEMO, folds: 1 })).toEqual(["nothing folded on Leaderboards: no Show all, no fold"]);
    expect(failed({ ...DEMO, scrollers: 1 })).toEqual(["nothing scrolls inside the page: no inner scrollbar"]);
    expect(failed({ ...DEMO, legend: false })).toHaveLength(1);
    expect(failed({ ...DEMO, basis: "Per game, against the same roles and champions · 100 is usual" })).toHaveLength(1);
    expect(failed({ ...DEMO, explained: false })).toHaveLength(1);
    expect(failed({ ...DEMO, heads: ["#", "Player", "Score"] })).toEqual(["the table's columns: place, player, games, the four kinds and the Score"]);
  });

  it("fail a ranking out of score order, a place shared on unequal scores, a skipped place, a crown, an unranked row", () => {
    const rows = DEMO.rows!;
    const ranking = "the multikill ranking: ranked players only (20+ games with counts), by score, a place shared exactly on equal scores, none skipped; first in gold, no crown";
    expect(failed({ ...DEMO, rows: [rows[1]!, rows[0]!, ...rows.slice(2)] })).toEqual([ranking]);
    expect(failed({ ...DEMO, rows: [rows[0]!, { ...rows[1]!, place: 1, leader: true }, ...rows.slice(2)] })).toEqual([ranking]);
    // An inactive player hidden without ranking again: the places run 1, 3, 4, 5; ranked again, 1, 2, 3, 4 passes.
    expect(failed({ ...DEMO, rows: [rows[0]!, ...rows.slice(2)] })).toEqual([ranking]);
    expect(failed({ ...DEMO, rows: [rows[0]!, ...rows.slice(2).map((r) => ({ ...r, place: r.place! - 1 }))] })).toEqual([]);
    expect(failed({ ...DEMO, rows: [{ ...rows[0]!, crown: true }, ...rows.slice(1)] })).toEqual([ranking]);
    expect(failed({ ...DEMO, rows: [...rows.slice(0, 4), { ...rows[4]!, status: "provisional", counted: 12, games: 12 }] })).toEqual([ranking]);
  });

  it("read Riot's counters as each multikill once, by the rule the board states", () => {
    expect(eventsOf([4, 2, 1, 1], "nested")).toEqual([1, 0, 1, 2]);
    expect(eventsOf([4, 2, 1, 1], "separate")).toEqual([1, 1, 2, 4]);
    expect(eventsOf([0, 1, 0, 0], "nested")).toEqual([0, 0, 1, 0]);
  });

  it("fail a row showing Riot's nested counters as they are, a board stating no rule, cells that are not the row's counts, an unnamed role icon, a score without its button", () => {
    const rows = DEMO.rows!;
    const raw = { ...rows[0]!, counts: [2, 7, 14, 46], cells: [2, 7, 14, 46] };
    expect(failed({ ...DEMO, rows: [raw, ...rows.slice(1)] })).toContain("each row shows each multikill once, at its largest: Riot's counters read by the rule the board states");
    expect(failed({ ...DEMO, rule: null })).toEqual(["each row shows each multikill once, at its largest: Riot's counters read by the rule the board states"]);
    expect(failed({ ...DEMO, rows: [{ ...rows[0]!, cells: [3, 5, 7, 32] }, ...rows.slice(1)] })).toEqual(["each row's games and kind cells are its own counts"]);
    expect(failed({ ...DEMO, rows: [{ ...rows[0]!, games: 41 }, ...rows.slice(1)] })).toEqual(["each row's games and kind cells are its own counts"]);
    expect(failed({ ...DEMO, rows: [{ ...rows[0]!, roleNamed: false }, ...rows.slice(1)] })).toEqual(["each row's role icon is named by the most-played position over the score's games (or split, or unknown)"]);
    expect(failed({ ...DEMO, rows: [{ ...rows[0]!, scoreButton: false }, ...rows.slice(1)] })).toEqual(["every row shows its score as a button that opens its breakdown"]);
    expect(failed({ ...DEMO, rows: [{ ...rows[0]!, height: 90 }, ...rows.slice(1)] })).toEqual(["compact rows: none taller than 72px"]);
    // A phone's two-line rows: up to 96px.
    expect(multikillVerdicts({ kind: "phone", read: { ...DEMO, heads: null, rows: [{ ...rows[0]!, height: 90 }, ...rows.slice(1)] } }).filter((v) => v.status === "FAIL")).toEqual([]);
  });

  it("warn, not fail, where the team's data cannot show the table or the comparison", () => {
    expect(verdicts({ ...DEMO, rows: [], empty: true }).map((v) => v.status)).toEqual(["PASS", "PASS", "PASS", "WARN"]);
    const team = verdicts({ ...DEMO, basis: MULTIKILL_BASES.team });
    expect(team.filter((v) => v.status === "FAIL")).toEqual([]);
    expect(team.filter((v) => v.status === "WARN")).toHaveLength(1);
    expect(failed({ present: false })).toEqual(["the multikill table is on the page"]);
  });
});

describe("the Score breakdown facts", () => {
  it("pass when the final line gives the score shown and the points add up", () => {
    expect(scoreFrom({ earned: 80, expected: 67.1, cushion: 40 })).toBe(112);
    expect(breakdownVerdicts({ kind: "desktop", read: BREAKDOWN, rowScore: 112 }).map((v) => v.status)).toEqual(["PASS", "PASS", "PASS", "PASS"]);
  });

  it("fail a final line that does not give the score, points that do not add up, a missing part, a scrolling panel", () => {
    expect(breakdownFailed(BREAKDOWN, 113)).toEqual(["the breakdown's final line, 100 × (earned + 40) ÷ (typical + 40), gives the score shown"]);
    expect(breakdownFailed({ ...BREAKDOWN, calc: { ...BREAKDOWN.calc!, expected: 80 } })).toEqual(["the breakdown's final line, 100 × (earned + 40) ÷ (typical + 40), gives the score shown"]);
    expect(breakdownFailed({ ...BREAKDOWN, calc: { ...BREAKDOWN.calc!, cushion: 20 } })).toHaveLength(1);
    expect(breakdownFailed({ ...BREAKDOWN, kinds: BREAKDOWN.kinds!.map((k, i) => (i === 0 ? { ...k, points: 60 } : k)) })).toEqual(["the breakdown's points: each kind made × its points (2–5), adding up to the earned points"]);
    expect(breakdownFailed({ ...BREAKDOWN, levels: 0 })).toHaveLength(1);
    expect(breakdownFailed({ ...BREAKDOWN, scrolls: 1 })).toEqual(["the breakdown opens whole, with no scrollbar of its own"]);
    expect(breakdownFailed({ present: false })).toEqual(["the Score opens its breakdown"]);
  });

  it("warn when there is no Score to open", () => {
    expect(breakdownVerdicts({ kind: "desktop", read: { present: false }, rowScore: null }).map((v) => v.status)).toEqual(["WARN"]);
  });
});
