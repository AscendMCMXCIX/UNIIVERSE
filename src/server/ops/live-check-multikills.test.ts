import { describe, expect, it } from "vitest";
import { eventsOf, kindsInWords, MULTIKILL_BASES, multikillVerdicts, type MultikillBoardRead, type MultikillRowRead } from "../../../scripts/multikill-facts.mjs";

/*
  The Production check's multikill board facts (scripts/multikill-facts.mjs): the reading below is
  the demo's board as the check's own reader sees it (23 Nov 2026, Release 15: seven members ranked,
  compared with the other players in the same games). The facts pass on it, fail the regressions
  they exist for, and only warn where a team's data cannot show them.
*/

/** A row whose shown counts (penta … double) are each multikill once; its Riot counters nested, as the demo's are. */
const row = (place: number, score: number, counts: number[], o: Partial<MultikillRowRead> = {}): MultikillRowRead => {
  const [p, q, t, d] = counts as [number, number, number, number];
  return { status: "ranked", place, score, shown: String(score), counts, riot: [d + t + q + p, t + q + p, q + p, p], kinds: kindsInWords(counts), crown: place === 1, height: 47, ...o };
};
const DEMO: MultikillBoardRead = {
  present: true,
  rows: [row(1, 152, [2, 5, 8, 48], { height: 63 }), row(2, 148, [2, 5, 9, 35], { height: 63 }), row(3, 102, [0, 1, 6, 31]), row(4, 101, [0, 1, 3, 33]), row(5, 99, [0, 1, 3, 19]), row(6, 93, [0, 0, 1, 9]), row(7, 82, [0, 0, 1, 11])],
  tiles: [
    { kind: "double", count: 48 },
    { kind: "triple", count: 9 },
    { kind: "quadra", count: 5 },
    { kind: "penta", count: 2 },
  ],
  basis: MULTIKILL_BASES["same-games"],
  explained: true,
  rule: "nested",
  empty: false,
};
const verdicts = (read: MultikillBoardRead) => multikillVerdicts({ kind: "desktop", read });
const failed = (read: MultikillBoardRead) => verdicts(read).filter((v) => v.status === "FAIL").map((v) => v.name);

describe("the multikill board facts", () => {
  it("pass on the demo's board", () => {
    const v = verdicts(DEMO);
    expect(v.filter((x) => x.status !== "PASS")).toEqual([]);
    expect(v).toHaveLength(7);
  });

  it("write each row's counts in the board's words, rarest first", () => {
    expect(kindsInWords([2, 5, 8, 48])).toEqual(["2 pentas", "5 quadras", "8 triples", "48 doubles"]);
    expect(kindsInWords([0, 1, 0, 1])).toEqual(["1 quadra", "1 double"]);
    expect(kindsInWords([0, 0, 0, 0])).toEqual([]);
  });

  it("fail a ranking out of score order, a place shared on unequal scores, or a provisional member above a ranked one", () => {
    expect(failed({ ...DEMO, rows: [DEMO.rows![1]!, DEMO.rows![0]!, ...DEMO.rows!.slice(2)] })).toHaveLength(1);
    expect(failed({ ...DEMO, rows: [DEMO.rows![0]!, { ...DEMO.rows![1]!, place: 1, crown: true }, ...DEMO.rows!.slice(2)] })[0]).toMatch(/the multikill ranking/);
    expect(failed({ ...DEMO, rows: [{ ...DEMO.rows![0]!, status: "provisional", place: null, crown: false }, ...DEMO.rows!.slice(1)] })[0]).toMatch(/the multikill ranking/);
  });

  it("read Riot's counters as each multikill once, by the rule the board states", () => {
    expect(eventsOf([4, 2, 1, 1], "nested")).toEqual([1, 0, 1, 2]);
    expect(eventsOf([4, 2, 1, 1], "separate")).toEqual([1, 1, 2, 4]);
    expect(eventsOf([0, 1, 0, 0], "nested")).toEqual([0, 0, 1, 0]);
  });

  it("fail a row that shows Riot's nested counters as they are (a pentakill shown also as a double, a triple and a quadra), or a board that states no rule", () => {
    const raw = { ...DEMO.rows![0]!, counts: [2, 7, 15, 63], kinds: kindsInWords([2, 7, 15, 63]) };
    expect(failed({ ...DEMO, rows: [raw, ...DEMO.rows!.slice(1)] })).toContain("desktop: each row shows each multikill once, at its largest: Riot's counters read by the rule the board states");
    expect(failed({ ...DEMO, rule: null })).toEqual(["desktop: each row shows each multikill once, at its largest: Riot's counters read by the rule the board states"]);
  });

  it("fail kinds that are not the row's own counts (a pentakill credited that Riot did not count)", () => {
    expect(failed({ ...DEMO, rows: [{ ...DEMO.rows![0]!, kinds: ["3 pentas", "5 quadras", "8 triples", "48 doubles"] }, ...DEMO.rows!.slice(1)] })).toEqual(["desktop: each row's kinds in words are its own counts, rarest first"]);
  });

  it("fail a tile that is not the board's highest count, a missing score, an unexplained board, a tall row", () => {
    expect(failed({ ...DEMO, tiles: DEMO.tiles!.map((t) => (t.kind === "penta" ? { ...t, count: 1 } : t)) })).toEqual(["desktop: the most of each kind: four tiles, each the highest count on the board (or none yet)"]);
    expect(failed({ ...DEMO, rows: [{ ...DEMO.rows![0]!, shown: null }, ...DEMO.rows!.slice(1)] })).toHaveLength(1);
    expect(failed({ ...DEMO, explained: false })).toHaveLength(1);
    expect(failed({ ...DEMO, basis: "Most pentakills wins" })).toHaveLength(1);
    expect(failed({ ...DEMO, rows: [{ ...DEMO.rows![0]!, height: 90 }, ...DEMO.rows!.slice(1)] })).toEqual(["desktop: compact rows: none taller than 66px"]);
  });

  it("warn, not fail, where the team's data cannot show the board or the comparison", () => {
    expect(verdicts({ ...DEMO, rows: [], tiles: [], empty: true }).map((v) => v.status)).toEqual(["PASS", "WARN"]);
    const team = verdicts({ ...DEMO, basis: MULTIKILL_BASES.team });
    expect(team.filter((v) => v.status === "FAIL")).toEqual([]);
    expect(team.filter((v) => v.status === "WARN")).toHaveLength(1);
    expect(failed({ present: false })).toEqual(["desktop: the multikill board is on the page"]);
  });
});
