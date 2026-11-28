import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { gridKeyTarget, gridShape, usePagedGrid, type PagedGrid } from "./paged-grid";
import { slotPages } from "./row-budget";
import { WorkspaceSection } from "./workspace";

/*
  The shared paged grid (ui/paged-grid.tsx; docs/RESPONSIVE.md, "One-screen desktop pages"): a page's
  column-major shape, the keys across cells, columns and pages (the lane opponents' keyboard model),
  and the grid as the server draws it (node, no browser: not paged yet, every row with the divider in
  its place, no grid classes or region attributes until measured).
*/

describe("gridShape: a page's column-major grid", () => {
  it("splits a short page's cells between the columns (4 cells are 2 + 2) and draws the second column and its hairline only where it has cells", () => {
    expect(gridShape(4, 5, 2)).toMatchObject({ rowsHere: 2, secondColumn: true, style: { gridTemplateRows: "repeat(2, auto)" } });
    expect(gridShape(10, 5, 2)).toMatchObject({ rowsHere: 5, secondColumn: true });
    expect(gridShape(1, 5, 2)).toMatchObject({ rowsHere: 1, secondColumn: false });
    expect(gridShape(1, 5, 2).className).toBe("relative grid grid-flow-col gap-x-4 grid-cols-2");
    expect(gridShape(6, 5, 2).className).toBe("relative grid grid-flow-col gap-x-4 grid-cols-2 ws:before:absolute ws:before:inset-y-0 ws:before:left-1/2 ws:before:w-px ws:before:bg-border/60");
  });

  it("one column takes every cell of its page", () => {
    expect(gridShape(5, 5, 1)).toMatchObject({ rowsHere: 5, secondColumn: false, className: "relative grid grid-flow-col gap-x-4 grid-cols-1" });
  });
});

describe("gridKeyTarget: the keys across cells, columns and pages", () => {
  // 23 rows, 3 a column in two columns (6 a page), a divider before row 10.
  const rows = Array.from({ length: 23 }, (_, i) => `r${i}`);
  const pages = slotPages(rows, 6, 10);
  const at = (index: number, page: number, columns: 1 | 2 = 2) => ({ index, pages, page, perColumn: 3, columns, total: 23 });

  it("↑ and ↓ follow the reading order across pages; Home and End the first and the last cell", () => {
    expect(gridKeyTarget("ArrowDown", at(5, 1))).toBe(6);
    expect(gridKeyTarget("ArrowUp", at(6, 2))).toBe(5);
    expect(gridKeyTarget("ArrowUp", at(0, 1))).toBeNull();
    expect(gridKeyTarget("ArrowDown", at(22, pages.length))).toBeNull();
    expect(gridKeyTarget("Home", at(9, 2))).toBe(0);
    expect(gridKeyTarget("End", at(9, 2))).toBe(22);
  });

  it("PageDown and PageUp go to the first cell of the page after or before", () => {
    const second = pages[1]!.find((s) => s.kind === "row")!;
    expect(gridKeyTarget("PageDown", at(2, 1))).toBe(second.kind === "row" ? second.index : -1);
    expect(gridKeyTarget("PageUp", at(7, 2))).toBe(0);
    expect(gridKeyTarget("PageUp", at(2, 1))).toBeNull();
    expect(gridKeyTarget("PageDown", at(22, pages.length))).toBeNull();
  });

  it("← and → go to the same row of the other column, in two columns only", () => {
    // Page 1: rows 0–2 in the first column, 3–5 in the second.
    expect(gridKeyTarget("ArrowRight", at(1, 1))).toBe(4);
    expect(gridKeyTarget("ArrowLeft", at(4, 1))).toBe(1);
    expect(gridKeyTarget("ArrowLeft", at(1, 1))).toBeNull();
    expect(gridKeyTarget("ArrowRight", at(4, 1))).toBeNull();
    expect(gridKeyTarget("ArrowRight", at(1, 1, 1))).toBeUndefined();
  });

  it("every row is on exactly one page, the divider never a page's last slot", () => {
    const seen = pages.flatMap((p) => p.filter((s) => s.kind === "row").map((s) => (s.kind === "row" ? s.index : -1)));
    expect(seen).toEqual(rows.map((_, i) => i));
    for (const p of pages) expect(p.at(-1)?.kind).toBe("row");
  });

  it("leaves other keys to the browser", () => {
    expect(gridKeyTarget("Enter", at(1, 1))).toBeUndefined();
    expect(gridKeyTarget(" ", at(1, 1))).toBeUndefined();
  });
});

describe("usePagedGrid as the server draws it", () => {
  const rows = ["Darius", "Sett", "Garen", "Teemo", "Jax"].map((name) => ({ name }));
  let seen: PagedGrid<(typeof rows)[number]> | null = null;
  function Grid() {
    const grid = usePagedGrid({ rows, keyOf: (r) => r.name, words: { one: "opponent", many: "opponents" }, testId: "opponents", twoColumnsRem: 38.625, probeRem: 2.25, divider: 3 });
    seen = grid;
    return h(
      "ul",
      { ref: grid.listRef as React.Ref<HTMLUListElement>, className: grid.gridClassName, style: grid.gridStyle, ...grid.listProps, ...grid.regionProps },
      grid.slotsToDraw.map((s, n) => (s.kind === "divider" ? h("li", { key: `d${n}`, ...grid.dividerProps }, "Fewer than 3 games") : h("li", { key: s.item.name, ...grid.cellProps(s) }, s.item.name))),
    );
  }

  it("draws every row with the divider in its place, unpaged, with no grid classes or region attributes until it measures", () => {
    const out = renderToStaticMarkup(h(WorkspaceSection, { labelledBy: "t" }, h(Grid)));
    expect(seen).toMatchObject({ paged: false, perColumn: null, perPage: null, pages: 1, slots: null, gridClassName: undefined, gridStyle: undefined });
    expect(out).toBe(
      '<section class="@container/ws space-y-3 ws:flex ws:flex-1 ws:flex-col ws:gap-3 ws:space-y-0" aria-labelledby="t" data-workspace=""><ul aria-describedby="opponents-range"><li data-ws-row="" data-row-key="Darius">Darius</li><li data-ws-row="" data-row-key="Sett">Sett</li><li data-ws-row="" data-row-key="Garen">Garen</li><li data-ws-row="" data-ws-divider="">Fewer than 3 games</li><li data-ws-row="" data-row-key="Teemo">Teemo</li><li data-ws-row="" data-row-key="Jax">Jax</li></ul></section>',
    );
    expect(seen!.pagerProps).toMatchObject({ label: "Opponent pages", testId: "opponents-pager", page: 1, pages: 1 });
  });
});
