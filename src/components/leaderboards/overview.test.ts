import { describe, expect, it } from "vitest";
import { IN_TIER_FLEX, IN_TIER_TEXT, MILESTONE_OVERVIEW, MULTIKILL_OVERVIEW, TIERS, allot, foldClass, groupFolds, groupRanks, moreOf, showAllClass } from "./overview";

/*
  The one-screen board's overview (Release 16): which rows fold behind each board's Show all in each
  of the four window heights (1440 × 780, 1920 × 950, 1440 × 900, 1920 × 1080), and when the Show all
  is drawn. A row that folds always has a Show all saying how many; a board with nothing to fold has
  none.
*/

const ALWAYS = "@min-[59rem]/dash:group-data-[fold=closed]/fold:hidden";
const below = (t: string) => `@min-[59rem]/dash:board-below-${t}:group-data-[fold=closed]/fold:hidden`;

describe("the overview's counts", () => {
  it("show more rows the taller the window, and fold nothing on a one-column page", () => {
    for (const c of [MULTIKILL_OVERVIEW, MILESTONE_OVERVIEW]) expect([c.low, c.mid, c.short, c.tall]).toEqual([...[c.low, c.mid, c.short, c.tall]].sort((a, b) => a - b));
    expect(MULTIKILL_OVERVIEW.tall).toBeGreaterThan(MULTIKILL_OVERVIEW.low);
    for (const t of TIERS) expect(IN_TIER_FLEX[t]).toContain("@min-[59rem]/dash:");
  });

  it("fold a row in every height below the first tier that shows it", () => {
    const counts = { low: 1, mid: 2, short: 3, tall: 4 };
    expect([0, 1, 2, 3, 4].map((i) => foldClass(i, counts))).toEqual([undefined, below("mid"), below("short"), below("tall"), ALWAYS]);
  });

  it("say how many fold in each height, and draw the Show all exactly where some row folds", () => {
    expect(moreOf(7, MULTIKILL_OVERVIEW)).toEqual({ low: 5, mid: 4, short: 3, tall: 2 });
    expect(showAllClass(moreOf(7, MULTIKILL_OVERVIEW)).split(" ")).toEqual(["hidden", ...TIERS.map((t) => IN_TIER_FLEX[t])]);
    // Four rows: folded in the two lower heights only.
    expect(showAllClass(moreOf(4, MULTIKILL_OVERVIEW)).split(" ")).toEqual(["hidden", IN_TIER_FLEX.low, IN_TIER_FLEX.mid]);
    expect(showAllClass(moreOf(2, MULTIKILL_OVERVIEW))).toBe("hidden");
    // Each count's words in its own height alone.
    expect(IN_TIER_TEXT.low).toBe("board-at-mid:hidden");
    expect(IN_TIER_TEXT.mid).toBe("hidden board-at-mid:board-below-short:inline");
  });
});

describe("the milestones' two kinds", () => {
  it("give each kind two rows where the budget allows, one under four (an empty kind's line counts as one), then the rest in order", () => {
    expect(allot([1, 8], 5)).toEqual([1, 4]);
    expect(allot([6, 8], 5)).toEqual([3, 2]);
    expect(allot([0, 8], 5)).toEqual([1, 4]);
    expect(allot([1, 8], 2)).toEqual([1, 1]);
    expect(allot([2, 2], 7)).toEqual([2, 2]);
  });

  it("fold each kind's rows past its share in each height, and count what folds there", () => {
    const { classes, more } = groupFolds([1, 8], MILESTONE_OVERVIEW);
    expect(classes[0]).toEqual([undefined]);
    // Mastery shows 1, 3, 4 and 6 rows in the four heights.
    expect(classes[1]).toEqual([undefined, below("mid"), below("mid"), below("short"), below("tall"), below("tall"), ALWAYS, ALWAYS]);
    expect(more).toEqual({ low: 7, mid: 5, short: 4, tall: 2 });
    // The order rows are shown in once the page fits them (fit-rows.tsx): a budget of k shows exactly the rows of rank k or less, as the tiers do.
    const ranks = groupRanks([1, 8]);
    expect(ranks).toEqual([[1], [1, 3, 4, 5, 6, 7, 8, 9]]);
    for (const t of TIERS) {
      const shown = ranks.map((g) => g.filter((r) => r <= MILESTONE_OVERVIEW[t]).length);
      expect(shown, t).toEqual(allot([1, 8], MILESTONE_OVERVIEW[t]));
    }
    // Nothing to fold: no Show all.
    expect(showAllClass(groupFolds([1, 1], MILESTONE_OVERVIEW).more)).toBe("hidden");
  });
});
