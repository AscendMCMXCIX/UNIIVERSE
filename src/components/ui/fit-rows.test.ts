import { describe, expect, it } from "vitest";
import { FIT_GUARD_REM, fitCount } from "./fit-rows";

/*
  The fitted list's count (fit-rows.tsx, Release 19): as many rows as end at or above the limit the
  page gives it (the window's bottom less the page's bottom padding and the guard band, or the column
  beside it where that ends further down), never fewer than the first.
*/
describe("fitCount", () => {
  // Six rows of 33px under a heading; with every row drawn the list's card ends at 900 (page coordinates).
  const items = [1, 2, 3, 4, 5, 6].map((rank) => ({ rank, h: 33 }));
  const at = (limit: number, cssCount = 3) => fitCount({ items, caps: [], bottomAll: 900, limit, cssCount });

  it("adds rows past the CSS tiers' count while they end at or above the limit, and says how many more stay hidden", () => {
    // Rows 4..6 end at 801, 834, 867, 900 for counts 3..6.
    expect(at(1000)).toEqual({ count: 6, more: 0, ranks: 6 });
    expect(at(834)).toEqual({ count: 4, more: 2, ranks: 6 });
    expect(at(833.9)).toEqual({ count: 3, more: 3, ranks: 6 });
  });

  it("drops rows the CSS tiers drew where even they run past the limit, down to the first", () => {
    expect(at(780, 5)).toEqual({ count: 2, more: 4, ranks: 6 });
    expect(at(0, 5)).toEqual({ count: 1, more: 5, ranks: 6 });
  });

  it("never ends within the guard band: a row that would end 1px under the window less the band is not shown", () => {
    const window = 950;
    const guard = FIT_GUARD_REM * 16;
    expect(guard).toBeGreaterThanOrEqual(12);
    // The fifth row would end at 867 with a limit of 950 - 31 (the page's padding) - 16 = 903: shown; the sixth at 900: shown.
    expect(at(window - 31 - guard).count).toBe(6);
    // A window 50px shorter: 853 leaves room for four rows (834), not five (867).
    expect(at(window - 50 - 31 - guard).count).toBe(4);
  });

  it("counts a caption with the rows it heads", () => {
    const fit = fitCount({ items, caps: [{ first: 5, h: 20 }], bottomAll: 920, limit: 834, cssCount: 3 });
    // Without rows 5 and 6 and their caption the list ends at 920 - 66 - 20 = 834.
    expect(fit).toEqual({ count: 4, more: 2, ranks: 6 });
  });
});
