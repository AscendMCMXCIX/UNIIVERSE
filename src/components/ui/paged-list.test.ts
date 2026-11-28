import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PagedFooter, listKeyTarget, rangeText, rangeWords, usePagedRows, type PagedRows } from "./paged-list";
import { cumulativeRows, rowBudget, type DrawnRow } from "./row-budget";
import { WorkspaceCard, WorkspaceSection } from "./workspace";

/*
  The shared paged list (ui/paged-list.tsx; docs/RESPONSIVE.md, "One-screen desktop pages"): the
  cumulative count of rows of several heights (useRowBudget's mode "cumulative"), the keys across
  pages, the range and its words, and the list as the server draws it (node, no browser: not paged
  yet, every row of the flow drawn, the footer's count, no region attributes until measured).
*/

/** `n` rows of `h` px with `gap` between them, as laid out from the first row's top (the last without its divider where `lastLess`). */
const laidOut = (heights: number[], gap = 0, lastLess = 0): DrawnRow[] => {
  let y = 0;
  return heights.map((height, i) => {
    const last = i === heights.length - 1;
    const hh = last ? height - lastLess : height;
    const row = { bottom: y + hh, height: hh, divided: !last };
    y += hh + gap;
    return row;
  });
};

describe("cumulativeRows: rows of several heights", () => {
  it("is rowBudget's count exactly for rows of one height (the divided list's last row a pixel shorter)", () => {
    for (const room of [0, 50, 100, 357, 364, 400, 520, 1000]) {
      for (const drawn of [1, 3, 7, 12]) {
        const rows = laidOut(Array.from({ length: drawn }, () => 51), 0, 1);
        expect(cumulativeRows({ room, rows, lastLess: 1 }), `room ${room}, ${drawn} drawn`).toBe(rowBudget({ room, rowPx: 51, lastLess: 1 }));
      }
    }
  });

  it("counts the drawn rows by their own heights, the gaps between them included", () => {
    // Cards of 100, 140, 100 and 120px, 8px apart: they end at 100, 248, 356, 484.
    const rows = laidOut([100, 140, 100, 120], 8);
    expect(cumulativeRows({ room: 247, rows, gap: 8 })).toBe(1);
    expect(cumulativeRows({ room: 248, rows, gap: 8 })).toBe(2);
    expect(cumulativeRows({ room: 483, rows, gap: 8 })).toBe(3);
    // Every drawn card fits: more at the tallest's pitch (140 + 8).
    expect(cumulativeRows({ room: 484, rows, gap: 8 })).toBe(4);
    expect(cumulativeRows({ room: 631, rows, gap: 8 })).toBe(4);
    expect(cumulativeRows({ room: 632, rows, gap: 8 })).toBe(5);
    expect(cumulativeRows({ room: 780, rows, gap: 8 })).toBe(6);
  });

  it("never gives fewer than its minimum (the page grows by the deficit instead), nor more than its cap; no row drawn gives the minimum", () => {
    const rows = laidOut([100, 140], 8);
    expect(cumulativeRows({ room: 20, rows })).toBe(1);
    expect(cumulativeRows({ room: -40, rows })).toBe(1);
    expect(cumulativeRows({ room: 5000, rows, gap: 8, max: 3 })).toBe(3);
    expect(cumulativeRows({ room: 5000, rows: [] })).toBe(1);
    expect(cumulativeRows({ room: Number.NaN, rows })).toBe(1);
  });
});

describe("listKeyTarget: the keys across pages", () => {
  // 30 rows, 7 a page: page 2 holds rows 7–13 (0-based).
  const at = (index: number, page: number, arrows = false) => ({ index, page, pages: 5, perPage: 7, total: 30, arrows });

  it("PageDown goes to the next page's first row, PageUp to the previous page's last; at an end, nowhere", () => {
    expect(listKeyTarget("PageDown", at(9, 2))).toBe(14);
    expect(listKeyTarget("PageUp", at(9, 2))).toBe(6);
    expect(listKeyTarget("PageDown", at(28, 5))).toBeNull();
    expect(listKeyTarget("PageUp", at(2, 1))).toBeNull();
  });

  it("Home and End go to the first and the last row overall", () => {
    expect(listKeyTarget("Home", at(9, 2))).toBe(0);
    expect(listKeyTarget("End", at(9, 2))).toBe(29);
    expect(listKeyTarget("Home", at(0, 1))).toBeNull();
    expect(listKeyTarget("End", at(29, 5))).toBeNull();
  });

  it("↑ and ↓ move across a page's edge only where the list asks for them; other keys are the browser's", () => {
    expect(listKeyTarget("ArrowDown", at(13, 2))).toBeUndefined();
    expect(listKeyTarget("ArrowDown", at(13, 2, true))).toBe(14);
    expect(listKeyTarget("ArrowUp", at(7, 2, true))).toBe(6);
    expect(listKeyTarget("ArrowUp", at(0, 1, true))).toBeNull();
    expect(listKeyTarget("ArrowDown", at(29, 5, true))).toBeNull();
    expect(listKeyTarget("ArrowDown", at(-1, 2, true))).toBeNull();
    expect(listKeyTarget("Enter", at(9, 2, true))).toBeUndefined();
    expect(listKeyTarget("a", at(9, 2))).toBeUndefined();
  });

  it("an empty list keeps its page keys and goes nowhere", () => {
    expect(listKeyTarget("End", { index: -1, page: 1, pages: 1, perPage: 7, total: 0 })).toBeNull();
    expect(listKeyTarget("ArrowDown", { index: -1, page: 1, pages: 1, perPage: 7, total: 0, arrows: true })).toBeUndefined();
  });
});

describe("the range and its words", () => {
  const words = { one: "player", many: "players" };
  it("reads out the page the reader turned to", () => {
    expect(rangeWords(words, 8, 14, 1200)).toBe("Players 8 to 14 of 1,200");
  });
  it("shows the page's rows on a list of several pages (its noun read out only), else the count", () => {
    expect(renderToStaticMarkup(h("p", null, rangeText(words, { from: 8, to: 14 }, 3, 30)))).toBe('<p><span class="sr-only">Players </span>8–14 of 30</p>');
    expect(renderToStaticMarkup(h("p", null, rangeText(words, { from: 1, to: 6 }, 1, 6)))).toBe("<p>6 players</p>");
    expect(renderToStaticMarkup(h("p", null, rangeText(words, null, 1, 1)))).toBe("<p>1 player</p>");
  });
});

describe("usePagedRows as the server draws it", () => {
  const rows = ["Ahri", "Zed", "Lux", "Jinx"].map((name, i) => ({ id: `p${i}`, name }));
  let seen: PagedRows<(typeof rows)[number]> | null = null;
  function List({ flow }: { flow?: typeof rows }) {
    const list = usePagedRows({ rows, keyOf: (r) => r.id, words: { one: "player", many: "players" }, testId: "roster", probeRem: 3, flowRows: flow });
    seen = list;
    return h(WorkspaceCard, { ref: list.cardRef, testId: "roster-card", ...list.regionProps }, h("ul", { ref: list.listRef as React.Ref<HTMLUListElement>, ...list.listProps }, list.shown.map((r) => h("li", { key: r.id, ...list.rowProps(r) }, r.name))), h(PagedFooter, { footRef: list.footRef, pager: list.pagerProps, testId: list.footTestId, leading: h("span", null, "legend") }));
  }

  it("draws the flow's rows, unpaged, with the footer's count and no region attributes until it measures", () => {
    const out = renderToStaticMarkup(h(WorkspaceSection, { labelledBy: "t" }, h(List)));
    expect(seen!.perPage).toBeNull();
    expect(seen!.paged).toBe(false);
    expect(seen!.pages).toBe(1);
    expect(out).toContain('<li data-ws-row="" data-row-key="p0">Ahri</li>');
    expect(out.match(/<li /g)).toHaveLength(4);
    expect(out).not.toContain("data-ws-region");
    expect(out).not.toContain("aria-posinset");
    // Described by the range (the section may be the workspace: the CSS decides the first paint).
    expect(out).toContain('<ul aria-describedby="roster-range">');
    expect(out).toContain('id="roster-range"');
    expect(out).toMatch(/<div class="mt-auto hidden min-h-11[^"]*ws:flex" data-ws-foot="" data-testid="roster-foot"><span>legend<\/span><nav aria-label="Player pages"/);
    expect(out).toContain(">4 players</span>");
    expect(seen!.pagerProps).toMatchObject({ layout: "inline", testId: "roster-pager", prevTestId: "roster-prev", nextTestId: "roster-next", page: 1, pages: 1 });
  });

  it("draws the caller's flow rows where it gives them, and is not described by a range outside a workspace section", () => {
    const out = renderToStaticMarkup(h(List, { flow: rows.slice(0, 2) }));
    expect(out.match(/<li /g)).toHaveLength(2);
    expect(out).toContain("<ul>");
  });
});
