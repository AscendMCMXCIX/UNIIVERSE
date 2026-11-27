import { describe, expect, it } from "vitest";
import { clampPage, columnRows, keepPage, pageCount, pageOf, pageRange, pagedListNext, rowBudget, slotPageOf, slotPages, type PagedInputs, type PagedState, type Slot } from "./row-budget";

/*
  All Champions' one-screen workspace pages its lists by the rows that fit (row-budget.ts; the measure
  is useRowBudget in fit-rows.tsx). Here: the arithmetic of a budget, the pages and their ranges, the
  small-sample divider's slots in the win-rate orders, and the page a list shows after each change
  (docs/RESPONSIVE.md, "All Champions' workspace", the page state). No record is ever out of reach:
  every row is on exactly one page.
*/

describe("rowBudget: the complete rows that fit", () => {
  it("floors the room over a row, the divided list's last row a pixel shorter", () => {
    // The champion list at 1366 × 768: 364px of room, 51px rows, the last without its divider.
    expect(rowBudget({ room: 364, rowPx: 51, lastLess: 1 })).toBe(7);
    expect(rowBudget({ room: 357, rowPx: 51, lastLess: 1 })).toBe(7);
    expect(rowBudget({ room: 355, rowPx: 51, lastLess: 1 })).toBe(6);
    // Fractional rows (a 16.5px root) floor.
    expect(rowBudget({ room: 484, rowPx: 52.1, lastLess: 1 })).toBe(9);
    expect(rowBudget({ room: 212, rowPx: 36 })).toBe(5);
  });

  it("never gives fewer than its minimum (one row: the page grows by the deficit instead), nor more than its cap", () => {
    expect(rowBudget({ room: 10, rowPx: 36 })).toBe(1);
    expect(rowBudget({ room: -40, rowPx: 36 })).toBe(1);
    expect(rowBudget({ room: 449, rowPx: 40, max: 3 })).toBe(3);
    expect(rowBudget({ room: 449, rowPx: 40, min: 2, max: 3 })).toBe(3);
    expect(rowBudget({ room: 0, rowPx: 0 })).toBe(1);
    expect(rowBudget({ room: 200, rowPx: -1, min: 2 })).toBe(2);
    expect(rowBudget({ room: Number.NaN, rowPx: 30 })).toBe(1);
  });
});

describe("pages and their ranges", () => {
  it("counts pages, finds a row's page and says each page's range", () => {
    expect(pageCount(30, 7)).toBe(5);
    expect(pageCount(0, 7)).toBe(1);
    expect(pageCount(7, 7)).toBe(1);
    expect(pageOf(0, 7)).toBe(1);
    expect(pageOf(6, 7)).toBe(1);
    expect(pageOf(7, 7)).toBe(2);
    expect(pageRange(2, 7, 30)).toEqual({ from: 8, to: 14 });
    // Page 5 of 7 rows a page over 30 is 29–30.
    expect(pageRange(5, 7, 30)).toEqual({ from: 29, to: 30 });
    expect(pageRange(9, 7, 30)).toEqual({ from: 29, to: 30 });
    expect(pageRange(1, 7, 0)).toEqual({ from: 0, to: 0 });
    expect(clampPage(9, 30, 7)).toBe(5);
    expect(clampPage(0, 30, 7)).toBe(1);
    expect(clampPage(3, 0, 7)).toBe(1);
  });

  it("puts every row on exactly one page, in order, for every count and every page size", () => {
    for (let total = 0; total <= 60; total++) {
      for (let per = 1; per <= 25; per++) {
        const seen: number[] = [];
        for (let p = 1; p <= pageCount(total, per); p++) {
          const r = pageRange(p, per, total);
          if (!total) continue;
          for (let i = r.from; i <= r.to; i++) seen.push(i);
          if (p < pageCount(total, per)) expect(r.to - r.from + 1).toBe(per);
        }
        expect(seen).toEqual(Array.from({ length: total }, (_, i) => i + 1));
      }
    }
  });

  it("keeps the page after a budget change: the selected item's, else the page holding the first row shown", () => {
    // From 10 a page, on page 3 (first shown: row 20), to 7 a page: page 3.
    expect(keepPage({ perPage: 7, firstShown: 20 })).toBe(3);
    // The selection at row 25 wins: page 4.
    expect(keepPage({ perPage: 7, firstShown: 20, selected: 25 })).toBe(4);
    expect(keepPage({ perPage: 7, firstShown: 20, selected: -1 })).toBe(3);
    expect(keepPage({ perPage: 7, firstShown: 20, selected: null })).toBe(3);
    expect(keepPage({ perPage: 7, firstShown: 0, selected: 0 })).toBe(1);
  });

  it("splits a page's cells over two columns evenly (4 is 2 + 2, not 4 + 0), at most a column's rows", () => {
    expect(columnRows(4, 5, 2)).toBe(2);
    expect(columnRows(7, 5, 2)).toBe(4);
    expect(columnRows(22, 11, 2)).toBe(11);
    expect(columnRows(1, 5, 2)).toBe(1);
    expect(columnRows(0, 5, 2)).toBe(1);
    expect(columnRows(9, 5, 1)).toBe(5);
  });
});

describe("slotPages: the small-sample divider in the win-rate orders", () => {
  const rowsOf = <T,>(page: Slot<T>[]) => page.filter((s): s is Extract<Slot<T>, { kind: "row" }> => s.kind === "row");

  it("for every count, page size and place of the divider: every row once and in order, no page too long, the divider never last, and every page that starts in the small samples starts with it", () => {
    for (let total = 0; total <= 60; total++) {
      const rows = Array.from({ length: total }, (_, i) => i);
      for (let per = 1; per <= 25; per++) {
        for (const divider of [null, ...Array.from({ length: total }, (_, i) => i)]) {
          const pages = slotPages(rows, per, divider);
          const at = `${total} rows, ${per} a page, divider ${divider}`;
          expect(pages.flatMap((p) => rowsOf(p).map((s) => s.index)), at).toEqual(rows);
          for (const page of pages) {
            expect(page.length, at).toBeLessThanOrEqual(per);
            if (page.length) expect(page.at(-1)!.kind, at).toBe("row");
            const first = rowsOf(page)[0];
            if (per >= 2 && divider !== null && first && first.index >= divider) expect(page[0]!.kind, at).toBe("divider");
            if (divider === null) expect(page.some((s) => s.kind === "divider"), at).toBe(false);
          }
          // The divider stands right before the first small sample.
          if (per >= 2 && divider !== null && total) {
            const flat = pages.flat();
            const firstSmall = flat.findIndex((s) => s.kind === "row" && s.index === divider);
            expect(flat[firstSmall - 1]?.kind, at).toBe("divider");
          }
        }
      }
    }
  });

  it("ends a page one slot early rather than leave the divider as its last slot, and repeats it at the top of later pages", () => {
    const rows = Array.from({ length: 10 }, (_, i) => i);
    const pages = slotPages(rows, 4, 3);
    const shown = pages.map((p) => p.map((s) => (s.kind === "divider" ? "—" : s.index)));
    expect(shown).toEqual([[0, 1, 2], ["—", 3, 4, 5], ["—", 6, 7, 8], ["—", 9]]);
    expect(slotPageOf(pages, 3)).toBe(2);
    expect(slotPageOf(pages, 9)).toBe(4);
    expect(slotPageOf(pages, 42)).toBe(1);
    // Most games: plain pages.
    expect(slotPages(rows, 4, null).map((p) => p.length)).toEqual([4, 4, 2]);
    // Too small a page for a divider and a row: plain pages.
    expect(slotPages(rows, 1, 3).every((p) => p.length === 1 && p[0]!.kind === "row")).toBe(true);
  });
});

describe("pagedListNext: the page after each change", () => {
  const base: PagedInputs = { perPage: 7, total: 30, selected: null, selectedIndex: -1, search: "", order: "games", data: "d1", reset: "TOP" };
  const at = (page: number, over: Partial<PagedInputs> = {}): PagedState => ({ ...base, ...over, page, first: (page - 1) * (over.perPage ?? base.perPage ?? 7) });
  const next = (prev: PagedState, change: Partial<PagedInputs>) => {
    const n = { ...prev, ...change };
    const per = n.perPage ?? 1;
    return pagedListNext(prev, n, (i) => Math.floor(i / per) + 1, Math.max(1, Math.ceil(n.total / per)));
  };

  it("a new selection: its page (a row, a key, ‹ ›, Back, a deep link); closing keeps the page", () => {
    expect(next(at(1), { selected: "Ambessa", selectedIndex: 24 })).toBe(4);
    expect(next(at(3, { selected: "Ambessa", selectedIndex: 24 }), { selected: null, selectedIndex: -1 })).toBe(3);
  });

  it("a new budget: the selected item's page, else the page holding the first row shown before", () => {
    expect(next(at(3, { perPage: 10 }), { perPage: 7 })).toBe(3);
    expect(next(at(3, { perPage: 10, selected: "Ambessa", selectedIndex: 25 }), { perPage: 7 })).toBe(4);
    // Not measured yet (a deep link's first paint), then measured: the selected item's page.
    expect(next(at(1, { perPage: null, selected: "Ambessa", selectedIndex: 24 }), { perPage: 7 })).toBe(4);
    expect(next(at(1, { perPage: null }), { perPage: 7 })).toBe(1);
  });

  it("typing in the search: page 1, even with a champion open", () => {
    expect(next(at(3, { selected: "Ambessa", selectedIndex: 18 }), { search: "a", total: 12 })).toBe(1);
  });

  it("another order: the selected item's page, else page 1", () => {
    expect(next(at(3), { order: "win" })).toBe(1);
    expect(next(at(1, { selected: "Ambessa", selectedIndex: 2 }), { order: "win", selectedIndex: 16 })).toBe(3);
  });

  it("new data (a filter): the selected item's page where it is still listed, else page 1", () => {
    expect(next(at(4, { selected: "Ambessa", selectedIndex: 24 }), { data: "d2", selectedIndex: 9 })).toBe(2);
    expect(next(at(4, { selected: "Ambessa", selectedIndex: 24 }), { data: "d2", selectedIndex: -1 })).toBe(1);
    expect(next(at(4), { data: "d2" })).toBe(1);
  });

  it("another position: page 1", () => {
    expect(next(at(2, { selected: "Darius", selectedIndex: 9 }), { reset: "MID", total: 5 })).toBe(1);
  });

  it("the count shrinks: the last page there is now; unpaged keeps its page", () => {
    expect(next(at(5), { total: 10 })).toBe(2);
    expect(next(at(2), { perPage: null })).toBe(2);
  });
});
