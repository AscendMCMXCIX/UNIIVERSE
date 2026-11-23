import { describe, expect, it } from "vitest";
import { MILESTONE_OVERVIEW, MULTIKILL_OVERVIEW, allot, foldClass, groupFolds, moreOf, showAllClass } from "./overview";

/*
  The one-screen board's overview (Release 16): which rows fold behind each board's Show all, and when
  the Show all is drawn. A row that folds always has a Show all saying how many; a board with nothing
  to fold has none.
*/

const ALWAYS = "@min-[59rem]/dash:group-data-[fold=closed]/fold:hidden";
const SHORT = "@min-[59rem]/dash:board-short:group-data-[fold=closed]/fold:hidden";

describe("the overview's counts", () => {
  it("shows more rows in a tall window than a short one, and folds nothing on a one-column page", () => {
    for (const c of [MULTIKILL_OVERVIEW, MILESTONE_OVERVIEW]) expect(c.tall).toBeGreaterThan(c.short);
    // Every fold class is behind the 59rem page (the two columns) and the board's closed fold.
    for (const cls of [ALWAYS, SHORT]) {
      expect(cls).toContain("@min-[59rem]/dash:");
      expect(cls).toContain("group-data-[fold=closed]/fold:hidden");
    }
  });

  it("folds a row past the tall count in every window, one between the counts in a short window only", () => {
    const counts = { short: 2, tall: 4 };
    expect([0, 1, 2, 3, 4, 5].map((i) => foldClass(i, counts))).toEqual([undefined, undefined, SHORT, SHORT, ALWAYS, ALWAYS]);
  });

  it("says how many fold, and draws the Show all exactly where some row folds", () => {
    expect(moreOf(7, { short: 4, tall: 5 })).toEqual({ short: 3, tall: 2 });
    expect(moreOf(3, { short: 4, tall: 5 })).toEqual({ short: 0, tall: 0 });
    expect(showAllClass({ short: 3, tall: 2 })).toBe("hidden @min-[59rem]/dash:flex");
    expect(showAllClass({ short: 1, tall: 0 })).toBe("hidden @min-[59rem]/dash:board-short:flex");
    expect(showAllClass({ short: 0, tall: 0 })).toBe("hidden");
  });
});

describe("the milestones' two kinds", () => {
  it("give each kind at least two rows (its empty line counts as one), then the rest of the budget in order", () => {
    expect(allot([1, 8], 5)).toEqual([1, 4]);
    expect(allot([6, 8], 5)).toEqual([3, 2]);
    expect(allot([0, 8], 5)).toEqual([1, 4]);
    expect(allot([2, 2], 7)).toEqual([2, 2]);
  });

  it("fold each kind's rows past its share, and count what folds in each window", () => {
    const { classes, more } = groupFolds([1, 8], { short: 5, tall: 7 });
    expect(classes[0]).toEqual([undefined]);
    expect(classes[1]).toEqual([undefined, undefined, undefined, undefined, SHORT, SHORT, ALWAYS, ALWAYS]);
    expect(more).toEqual({ short: 4, tall: 2 });
    // Nothing to fold: no Show all.
    expect(groupFolds([1, 2], { short: 5, tall: 7 }).more).toEqual({ short: 0, tall: 0 });
  });
});
