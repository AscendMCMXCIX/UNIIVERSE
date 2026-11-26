import { describe, expect, it } from "vitest";
import { FILL_ROW_MAX_REM, FILL_SPARE_MAX, ONE_SCREEN_SECTIONS, oneScreenInput, oneScreenVerdicts, showAllCounts, type OneScreenRead } from "../../../scripts/one-screen-facts.mjs";

/*
  The Production check's one-screen facts (scripts/one-screen-facts.mjs, Release 16): the readings
  below are the demo's pages as the check's own reader saw them (the profile 23 Nov 2026; Leaderboards
  25 Nov 2026, the 2 × 2 grid with nothing folded; the sidebar open). The facts pass on them, and fail
  a board that runs below the window, an essential section not drawn, rows folded away without a Show
  all saying how many, and a Show all on Leaderboards at all.
*/

const box = (id: string, top: number, bottom: number) => ({ id, present: true, top, bottom });
const LEADERBOARDS_1440: OneScreenRead = {
  window: 900,
  width: 1440,
  height: 900,
  boxes: [box("form-board", 124, 489), box("records-multikills", 124, 489), box("records-book", 505, 751), box("records-milestones", 505, 751)],
  folds: [
    { board: "records-multikills", present: true, total: 5, shown: 5, button: false, words: null },
    { board: "records-milestones", present: true, total: 8, shown: 8, button: false, words: null },
  ],
  words: { broken: 0, tiles: 0, oneLine: 0 },
  // The shorter board's spare room spread over its rows (the review of 25 Nov 2026): the multikills' five rows grown beside Recent form's seven.
  spare: [
    { board: "form-board", present: true, rows: 7, spare: 0, footGap: null, grown: false },
    { board: "records-multikills", present: true, rows: 5, spare: 0, footGap: 1, grown: false },
    { board: "records-book", present: true, rows: 7, spare: 0, footGap: null, grown: false },
    { board: "records-milestones", present: true, rows: 8, spare: 0, footGap: null, grown: false },
  ],
};
const PROFILE_1440: OneScreenRead = {
  window: 900,
  width: 1440,
  height: 900,
  boxes: [box("season-figures", 208, 416), box("ranked-progress", 208, 473), box("recent-form", 489, 856), box("champion-pools", 432, 849)],
  folds: [{ board: "primary-pool", present: true, total: 6, shown: 6, button: false, words: null }],
};
const statuses = (v: ReturnType<typeof oneScreenVerdicts>) => v.map((x) => x.status);

describe("one screen", () => {
  it("reads the four boards and the Overview's four sections, in reading order", () => {
    expect(oneScreenInput("leaderboards").sections.map(([id]) => id)).toEqual(["form-board", "records-multikills", "records-book", "records-milestones"]);
    expect(oneScreenInput("profile").sections.map(([id]) => id)).toEqual(["season-figures", "ranked-progress", "recent-form", "champion-pools"]);
    expect(Object.keys(ONE_SCREEN_SECTIONS)).toEqual(["leaderboards", "profile"]);
  });

  it("reads the counts in a Show all's words, and only the counts", () => {
    expect(showAllCounts("Show all 7 · , 3 more of the multikill ranking")).toEqual([7, 3]);
    expect(showAllCounts("Show all 26")).toEqual([26, null]);
    expect(showAllCounts(null)).toEqual([null, null]);
  });

  it("passes the demo's pages at 1440 × 900", () => {
    const lb = oneScreenVerdicts({ page: "leaderboards", size: "1440 × 900", read: LEADERBOARDS_1440 });
    expect(lb.map((v) => v.name)).toEqual([
      "1440 × 900: Leaderboards' four boards end within the window",
      "1440 × 900: Multikills: every row shown, no Show all",
      "1440 × 900: Milestones: every row shown, no Show all",
      "1440 × 900: names whole: no word broken across two lines",
      "1440 × 900: no blank band in a board: the shorter board's rows share its spare room (its last line within 24px of its end, or its rows grown to 3.5rem on average), the multikills' legend right under their last row",
    ]);
    expect(statuses(lb)).toEqual(["PASS", "PASS", "PASS", "PASS", "PASS"]);
    const pr = oneScreenVerdicts({ page: "profile", size: "1440 × 900", read: PROFILE_1440 });
    expect(statuses(pr)).toEqual(["PASS", "PASS"]);
    expect(pr[1]!.name).toBe("1440 × 900: the primary pool: every row shown, no Show all");
    // A long pool: five rows and its Show all, which says the pool's size.
    const long = { ...PROFILE_1440, folds: [{ board: "primary-pool", present: true, total: 26, shown: 5, button: true, words: "Show all 26" }] };
    expect(statuses(oneScreenVerdicts({ page: "profile", size: "1440 × 900", read: long }))).toEqual(["PASS", "PASS"]);
    // A profile without Recent form and Ranked progress (too few games, no account): the two it always draws are enough.
    const thin = { ...PROFILE_1440, boxes: [box("season-figures", 208, 416), { id: "ranked-progress", present: false }, { id: "recent-form", present: false }, box("champion-pools", 432, 700)] };
    expect(statuses(oneScreenVerdicts({ page: "profile", size: "1440 × 900", read: thin }))).toEqual(["PASS", "PASS"]);
  });

  it("fails a board below the window, or a page without one it promises", () => {
    const below = { ...LEADERBOARDS_1440, height: 1051, boxes: [box("form-board", 124, 659), box("records-multikills", 124, 659), box("records-book", 675, 931), box("records-milestones", 675, 931)] };
    const [fact] = oneScreenVerdicts({ page: "leaderboards", size: "1440 × 900", read: below });
    expect(fact!.status).toBe("FAIL");
    expect(fact!.detail).toMatchObject({ below: ["Season records 931px", "Milestones 931px"] });
    const missing = { ...LEADERBOARDS_1440, boxes: LEADERBOARDS_1440.boxes.map((b) => (b.id === "records-milestones" ? { id: b.id, present: false } : b)) };
    expect(oneScreenVerdicts({ page: "leaderboards", size: "1440 × 900", read: missing })[0]!.status).toBe("FAIL");
    expect(oneScreenVerdicts({ page: "profile", size: "1440 × 900", read: { ...PROFILE_1440, boxes: PROFILE_1440.boxes.filter((b) => b.id !== "champion-pools") } })[0]!.status).toBe("FAIL");
  });

  it("fails a name broken inside a word (counts only, never the words); reads no tiles on Leaderboards since they went", () => {
    const broken = oneScreenVerdicts({ page: "leaderboards", size: "1440 × 900", read: { ...LEADERBOARDS_1440, words: { broken: 1, tiles: 0, oneLine: 0 } } });
    expect(statuses(broken)).toEqual(["PASS", "PASS", "PASS", "FAIL", "PASS"]);
    expect(broken[3]!.detail).toEqual({ broken: 1, tiles: 0, oneLine: 0 });
    expect(oneScreenInput("leaderboards").whole).toEqual({ root: "leaderboards", tiles: null });
    expect(oneScreenInput("profile").whole).toBeNull();
  });

  it("fails rows folded away (with a Show all or without: Leaderboards folds nothing since 25 Nov 2026), or a Show all where every row shows", () => {
    const silent = { ...LEADERBOARDS_1440, folds: [{ board: "records-multikills", present: true, total: 7, shown: 4, button: false, words: null }] };
    expect(statuses(oneScreenVerdicts({ page: "leaderboards", size: "1440 × 900", read: silent }))).toEqual(["PASS", "FAIL", "PASS", "PASS"]);
    const wrong = { ...LEADERBOARDS_1440, folds: [{ board: "records-multikills", present: true, total: 7, shown: 4, button: true, words: "Show all 7 · , 2 more of the multikill ranking" }] };
    expect(statuses(oneScreenVerdicts({ page: "leaderboards", size: "1440 × 900", read: wrong }))).toEqual(["PASS", "FAIL", "PASS", "PASS"]);
    const extra = { ...LEADERBOARDS_1440, folds: [{ board: "records-milestones", present: true, total: 4, shown: 4, button: true, words: "Show all 4 · , 0 more of the milestones" }] };
    expect(statuses(oneScreenVerdicts({ page: "leaderboards", size: "1440 × 900", read: extra }))).toEqual(["PASS", "FAIL", "PASS", "PASS"]);
  });

  it("reads each board's room under its last line on Leaderboards only; the rows' cap is the page's (3.5rem)", () => {
    expect(oneScreenInput("leaderboards").fills!.map(([id]) => id)).toEqual(["form-board", "records-multikills", "records-book", "records-milestones"]);
    expect(oneScreenInput("leaderboards").fills!.find(([id]) => id === "records-multikills")![2]).toBe("[data-testid=multikill-score-legend]");
    expect(oneScreenInput("profile").fills).toBeNull();
    expect(FILL_ROW_MAX_REM).toBe(3.5);
    expect(FILL_SPARE_MAX).toBe(24);
  });

  it("fails a blank band in a board whose rows could still grow, and a legend apart from the last row; passes the rest under rows grown to their cap", () => {
    const spare = LEADERBOARDS_1440.spare!;
    const banded = { ...LEADERBOARDS_1440, spare: spare.map((b) => (b.board === "records-multikills" ? { ...b, spare: 95, footGap: 1 } : b)) };
    const v = oneScreenVerdicts({ page: "leaderboards", size: "1920 × 1080", read: banded });
    expect(statuses(v)).toEqual(["PASS", "PASS", "PASS", "PASS", "FAIL"]);
    expect(v[4]!.detail).toMatchObject({ banded: ["Multikills 95px"], footApart: [] });
    // The review's band itself: the room above the legend rather than under it.
    const apart = { ...LEADERBOARDS_1440, spare: spare.map((b) => (b.board === "records-multikills" ? { ...b, footGap: 94 } : b)) };
    expect(oneScreenVerdicts({ page: "leaderboards", size: "1920 × 1080", read: apart })[4]!).toMatchObject({ status: "FAIL", detail: { footApart: ["Multikills 94px"] } });
    // Three ranked multikill players beside eight Recent form rows: the rows grown to their cap, the rest under the legend. Passes.
    const few = { ...LEADERBOARDS_1440, spare: spare.map((b) => (b.board === "records-multikills" ? { ...b, rows: 3, spare: 140, grown: true } : b)) };
    expect(oneScreenVerdicts({ page: "leaderboards", size: "1920 × 1080", read: few })[4]!.status).toBe("PASS");
    // An empty board (it says so in a line) and a board not drawn are left to the other facts.
    const empty = { ...LEADERBOARDS_1440, spare: spare.map((b) => (b.board === "records-multikills" ? { board: b.board, present: true, rows: 0 } : b.board === "records-milestones" ? { board: b.board, present: false } : b)) };
    expect(oneScreenVerdicts({ page: "leaderboards", size: "1920 × 1080", read: empty })[4]!.status).toBe("PASS");
    // The profile reads no spare room.
    expect(oneScreenVerdicts({ page: "profile", size: "1440 × 900", read: PROFILE_1440 }).map((x) => x.name).some((n) => /blank band/.test(n))).toBe(false);
  });
});
