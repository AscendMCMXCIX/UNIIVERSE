import { describe, expect, it } from "vitest";
import { budgetPage, pageList, pagerFold, pagerItems, pagerRem, widestItems, type PagerItem } from "./pager";
import { MOUSE_BUTTON_REM, lineItems } from "@/components/ui/pager-data";

/*
  Match History's pager (pager.ts): the pages it offers, and how a phone too narrow for every
  button on one line folds it. Folded, the pages either side of the current one give way to the
  arrows, which go to the same pages: both arrows stay on the line, at its ends, nothing is a tap
  further away, and a "…" marks every jump.
*/

/** What a pager shows: "<" and ">" for the arrows, numbers, "…"; folded or whole. */
function shown(items: PagerItem[], folded: boolean): Array<number | "…" | "<" | ">"> {
  const out: Array<number | "…" | "<" | ">"> = ["<"];
  for (const item of items) {
    if ("gap" in item) out.push("…");
    else if (!folded || !item.folds) out.push(item.page);
    else if (item.jump) out.push("…");
  }
  out.push(">");
  return out;
}

/** The width of a shown line at a touch screen's size, in rem (as pagerRem counts it). */
const width = (line: ReturnType<typeof shown>) => line.filter((x) => x !== "…").length * 2.75 + line.filter((x) => x === "…").length * 1.0625 + (line.length - 1) * 0.25;

describe("Match History's pager", () => {
  it("offers the ends and the current page's neighbourhood, with a gap for each jump", () => {
    expect(pageList(1, 1)).toEqual([1]);
    expect(pageList(1, 2)).toEqual([1, 2]);
    expect(pageList(3, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageList(10, 20)).toEqual([1, "gap", 9, 10, 11, "gap", 20]);
    expect(pageList(20, 20)).toEqual([1, "gap", 19, 20]);
  });

  it("folds a middle page of a long history to both ends, the current page and the arrows", () => {
    expect(shown(pagerItems(10, 20), false)).toEqual(["<", 1, "…", 9, 10, 11, "…", 20, ">"]);
    expect(shown(pagerItems(10, 20), true)).toEqual(["<", 1, "…", 10, "…", 20, ">"]);
    // A page that gives way between two that stay leaves a jump: a "…" takes its place.
    expect(shown(pagerItems(3, 20), true)).toEqual(["<", 1, "…", 3, "…", 20, ">"]);
    expect(shown(pagerItems(18, 20), true)).toEqual(["<", 1, "…", 18, "…", 20, ">"]);
    expect(shown(pagerItems(3, 5), true)).toEqual(["<", 1, "…", 3, "…", 5, ">"]);
    // The ends never give way, nor does the current page.
    expect(shown(pagerItems(2, 20), true)).toEqual(["<", 1, 2, "…", 20, ">"]);
    expect(shown(pagerItems(1, 20), true)).toEqual(["<", 1, "…", 20, ">"]);
    expect(shown(pagerItems(19, 20), true)).toEqual(["<", 1, "…", 19, 20, ">"]);
  });

  it("for every page of every history: folded, it fits a 320px phone, keeps what matters, marks every jump and never folds a line that fits", () => {
    for (let pages = 2; pages <= 40; pages++) {
      for (let page = 1; page <= pages; page++) {
        const items = pagerItems(page, pages);
        const at = `page ${page} of ${pages}`;
        // The whole line is what pageList offers, and pagerRem measures it.
        expect(shown(items, false).slice(1, -1), at).toEqual(pageList(page, pages).map((p) => (p === "gap" ? "…" : p)));
        expect(pagerRem(items), at).toBeCloseTo(width(shown(items, false)), 6);
        const folded = shown(items, true);
        // A 320px phone gives the pager 18rem: the folded line fits it, with 44px buttons.
        expect(width(folded), at).toBeLessThanOrEqual(18);
        // Both ends and the current page stay; only the pages either side go, which the arrows reach.
        const numbers = folded.filter((x): x is number => typeof x === "number");
        expect(numbers, at).toEqual(expect.arrayContaining([...new Set([1, page, pages])]));
        for (const item of items) if (!("gap" in item) && item.folds) expect([page - 1, page + 1], at).toContain(item.page);
        // Every jump between two shown pages has its "…", and no "…" stands for nothing.
        for (let i = 1; i < folded.length - 2; i++) {
          const [a, b] = [folded[i], folded[i + 1]];
          if (typeof a === "number" && typeof b === "number") expect(b - a, at).toBe(1);
          if (a === "…") expect([folded[i - 1], b].every((x) => typeof x === "number") && (b as number) - (folded[i - 1] as number) > 1, at).toBe(true);
        }
        // It folds only below a width the whole line needs (a little over it); a line that fits
        // the narrowest phone never folds.
        const fold = pagerFold(items);
        expect(fold.below, at).toBeGreaterThanOrEqual(pagerRem(items));
        if (pagerRem(items) <= 18) expect(fold.hide, at).toBe("");
        else expect(fold.below - pagerRem(items), at).toBeLessThanOrEqual(0.5);
      }
    }
  });

  it("names its container widths in classes Tailwind can see whole", () => {
    for (const [page, pages] of [[2, 5], [3, 5], [3, 6], [10, 20]] as const) {
      const fold = pagerFold(pagerItems(page, pages));
      const rem = `${fold.below}rem`;
      expect(fold.hide).toBe(`@max-[${rem}]/pages:hidden`);
      expect(fold.show).toBe(`hidden @max-[${rem}]/pages:inline`);
    }
  });
});

/*
  The workspace's inline pager (ui/pager.tsx) reserves the widest line its page count draws, folded
  or not, for its buttons: Previous at that width's left end and Next at its right end on every page,
  so a second click on ‹ where the first was never lands on a page number (review of 27 Nov 2026).
*/
describe("the inline pager's reserved line", () => {
  const items = (line: PagerItem[]) => ["<", ...line.map((x) => ("gap" in x ? "…" : x.page)), ">"] as ReturnType<typeof shown>;
  it("draws what the line shows, folded or whole (lineItems)", () => {
    for (let pages = 2; pages <= 40; pages++)
      for (let page = 1; page <= pages; page++)
        for (const folded of [false, true]) expect(items(lineItems(pagerItems(page, pages), folded)), `page ${page} of ${pages}, ${folded ? "folded" : "whole"}`).toEqual(shown(pagerItems(page, pages), folded));
  });
  it("is as wide as the widest page's line, with a mouse's 2rem buttons, at every page count, folded or whole", () => {
    for (let pages = 2; pages <= 40; pages++)
      for (const folded of [false, true]) {
        const reserved = pagerRem(lineItems(widestItems(pages), folded), MOUSE_BUTTON_REM);
        const widest = Math.max(...Array.from({ length: pages }, (_, i) => pagerRem(lineItems(pagerItems(i + 1, pages), folded), MOUSE_BUTTON_REM)));
        expect(reserved, `${pages} pages, ${folded ? "folded" : "whole"}`).toBeCloseTo(widest, 6);
      }
  });
});

describe("the page a new budget shows (budgetPage)", () => {
  const page = { page: 1, per: 10, rows: Array.from({ length: 10 }, (_, i) => ({ matchId: `m${i + 1}` })) };

  it("holds the game open in the window: its Previous and Next go on from it (a budget of 3 with game 4 open: page 2, not page 1)", () => {
    expect(budgetPage(page, "m4", 3)).toBe(2);
    expect(budgetPage(page, "m10", 3)).toBe(4);
    expect(budgetPage({ ...page, page: 2, per: 4, rows: page.rows.slice(0, 4) }, "m3", 5)).toBe(2);
  });

  it("holds the page's first card where no game is open", () => {
    expect(budgetPage(page, null, 3)).toBe(1);
    expect(budgetPage({ ...page, page: 3 }, null, 4)).toBe(6);
  });

  it("leaves the page to the server while the game open is not on the page shown (a link to a game on another page)", () => {
    expect(budgetPage(page, "elsewhere", 3)).toBeNull();
  });
});
