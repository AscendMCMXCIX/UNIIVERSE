import { describe, expect, it } from "vitest";
import { ONE_SCREEN_SECTIONS, oneScreenInput, oneScreenVerdicts, showAllCounts, type OneScreenRead } from "../../../scripts/one-screen-facts.mjs";

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
    ]);
    expect(statuses(lb)).toEqual(["PASS", "PASS", "PASS", "PASS"]);
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
    expect(statuses(broken)).toEqual(["PASS", "PASS", "PASS", "FAIL"]);
    expect(broken[3]!.detail).toEqual({ broken: 1, tiles: 0, oneLine: 0 });
    expect(oneScreenInput("leaderboards").whole).toEqual({ root: "leaderboards", tiles: null });
    expect(oneScreenInput("profile").whole).toBeNull();
  });

  it("fails rows folded away (with a Show all or without: Leaderboards folds nothing since 25 Nov 2026), or a Show all where every row shows", () => {
    const silent = { ...LEADERBOARDS_1440, folds: [{ board: "records-multikills", present: true, total: 7, shown: 4, button: false, words: null }] };
    expect(statuses(oneScreenVerdicts({ page: "leaderboards", size: "1440 × 900", read: silent }))).toEqual(["PASS", "FAIL", "PASS"]);
    const wrong = { ...LEADERBOARDS_1440, folds: [{ board: "records-multikills", present: true, total: 7, shown: 4, button: true, words: "Show all 7 · , 2 more of the multikill ranking" }] };
    expect(statuses(oneScreenVerdicts({ page: "leaderboards", size: "1440 × 900", read: wrong }))).toEqual(["PASS", "FAIL", "PASS"]);
    const extra = { ...LEADERBOARDS_1440, folds: [{ board: "records-milestones", present: true, total: 4, shown: 4, button: true, words: "Show all 4 · , 0 more of the milestones" }] };
    expect(statuses(oneScreenVerdicts({ page: "leaderboards", size: "1440 × 900", read: extra }))).toEqual(["PASS", "FAIL", "PASS"]);
  });
});
