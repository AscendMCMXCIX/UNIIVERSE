import { afterEach, describe, expect, it, vi } from "vitest";
import { FIT_GUARD_REM, fitCount, fitGuardPx, fitLimit, measureFit, rowBudgetEdge } from "./fit-rows";

/*
  The fitted list's count (fit-rows.tsx, Release 19): as many rows as end at or above the limit the
  page gives it (the window's bottom less the page's bottom padding and the guard band, or the column
  beside it where that runs past the window's bottom less the padding), never fewer than the first.
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

  it("counts a caption with the rows it heads", () => {
    const fit = fitCount({ items, caps: [{ first: 5, h: 20 }], bottomAll: 920, limit: 834, cssCount: 3 });
    // Without rows 5 and 6 and their caption the list ends at 920 - 66 - 20 = 834.
    expect(fit).toEqual({ count: 4, more: 2, ranks: 6 });
  });
});

/*
  The page fitLimit and measureFit read, as minimal stubs (the tests run in Node): the window's height
  and scroll, #content's bottom padding, the root's font size, and a sibling column's box.
*/
type Box = { top?: number; bottom: number; height: number };
function page({ height = 950, pad = 31, root = 16, scrollY = 0, sibling }: { height?: number; pad?: number; root?: number; scrollY?: number; sibling?: Box | null } = {}) {
  const content = { id: "content" };
  const html = { root: true };
  vi.stubGlobal("window", { innerHeight: height, scrollY });
  vi.stubGlobal("getComputedStyle", (el: unknown) => (el === html ? { fontSize: `${root}px` } : el === content ? { paddingBottom: `${pad}px` } : {}));
  vi.stubGlobal("document", {
    documentElement: html,
    getElementById: (id: string) => (id === "content" ? content : null),
    querySelector: (selector: string) => (selector === "[data-testid=overview-pools]" && sibling ? { getBoundingClientRect: () => ({ ...sibling, top: sibling.top ?? sibling.bottom - sibling.height }) } : null),
  });
}

/**
 * A fitted list as measureFit reads it: `rows` rows of `rowH` from `top` (window coordinates), of which
 * the CSS tiers draw `css`; in the `measure` mode every row is drawn. The list is its own card.
 */
function list({ top, rowH, rows, css }: { top: number; rowH: number; rows: number; css: number }) {
  let mode = "css";
  const drawn = (i: number) => mode === "measure" || i < css;
  const rowEls = Array.from({ length: rows }, (_, i) => ({ dataset: { ovRank: String(i + 1) }, getBoundingClientRect: () => ({ height: drawn(i) ? rowH : 0 }) }));
  return {
    getAttribute: () => mode,
    setAttribute: (_: string, value: string) => {
      mode = value;
    },
    querySelectorAll: (selector: string) => (selector === "[data-ov-rank]" ? rowEls : []),
    closest: () => null,
    getBoundingClientRect: () => ({ bottom: top + rowEls.filter((_, i) => drawn(i)).length * rowH }),
  } as unknown as HTMLElement;
}

const POOLS = "[data-testid=overview-pools]";

describe("fitLimit and measureFit: the guard band and the column beside the list", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("ends the first screen the guard band above the window's bottom less the page's padding, at the root's size", () => {
    page();
    expect(fitGuardPx()).toBe(FIT_GUARD_REM * 16);
    expect(FIT_GUARD_REM * 16).toBeGreaterThanOrEqual(12);
    // 950 - 31 - 16.
    expect(fitLimit()).toBe(903);
    // The band follows the root size (1rem: about 17.7px at 1920).
    page({ root: 20 });
    expect(fitLimit()).toBe(950 - 31 - 20);
  });

  it("follows the column beside the list only where that column runs past the window less the padding (the page scrolls anyway)", () => {
    // Past the window: the list may run to that column's bottom.
    page({ sibling: { bottom: 960, height: 600 } });
    expect(fitLimit(POOLS)).toBe(960);
    // Just past the window less the padding (919): the page scrolls for it too.
    page({ sibling: { bottom: 920, height: 600 } });
    expect(fitLimit(POOLS)).toBe(920);
    // In page coordinates: a column drawn 100px up a page scrolled by 100px ends at the same place.
    page({ scrollY: 100, sibling: { bottom: 860, height: 600 } });
    expect(fitLimit(POOLS)).toBe(960);
  });

  it("keeps the guard band where the column beside the list ends inside the window, in the band too (a pool drawn whole an instant before it folds)", () => {
    // The review's case: a six-row pool drawn whole ended at 914 at 1920 × 950, past the band's line but in the window.
    page({ sibling: { bottom: 910, height: 600 } });
    expect(fitLimit(POOLS)).toBe(903);
    // Exactly at the window less the padding: the page does not scroll.
    page({ sibling: { bottom: 919, height: 600 } });
    expect(fitLimit(POOLS)).toBe(903);
    // Above the band's line, hidden, or not on the page: the first screen.
    page({ sibling: { bottom: 700, height: 600 } });
    expect(fitLimit(POOLS)).toBe(903);
    page({ sibling: { bottom: 960, height: 0 } });
    expect(fitLimit(POOLS)).toBe(903);
    page({ sibling: null });
    expect(fitLimit(POOLS)).toBe(903);
  });

  it("measures a list against that limit: a row ending on the band's line shows, one ending 1px into the band does not", () => {
    // Rows of 33px from 705: they end at 738, 771, …, 903 (the sixth), 936 (the seventh). The CSS tiers drew three.
    page();
    expect(measureFit(list({ top: 705, rowH: 33, rows: 7, css: 3 }), "data-fit", "css")).toEqual({ count: 6, more: 1, ranks: 7 });
    // One pixel lower, the sixth ends at 904, inside the band (903 is its line): five.
    expect(measureFit(list({ top: 706, rowH: 33, rows: 7, css: 3 }), "data-fit", "css")).toEqual({ count: 5, more: 2, ranks: 7 });
    // The tiers' rows running past the limit come off, down to the first.
    expect(measureFit(list({ top: 850, rowH: 33, rows: 7, css: 3 }), "data-fit", "css")).toEqual({ count: 1, more: 6, ranks: 7 });
  });

  it("measures the rail beside a pools' column that ends in the band as beside none, and beside one past the window to its end", () => {
    // The rail's rows from 711 end at 876 (the fifth), 909 (the sixth, inside the band: its line is 903) and 942 (the seventh).
    const rail = () => list({ top: 711, rowH: 33, rows: 7, css: 3 });
    page({ sibling: { bottom: 914, height: 600 } });
    expect(measureFit(rail(), "data-fit", "css", undefined, POOLS), "the sixth row would end in the band").toEqual({ count: 5, more: 2, ranks: 7 });
    expect(measureFit(rail(), "data-fit", "css"), "as beside no column").toEqual({ count: 5, more: 2, ranks: 7 });
    // With a column past the window (large text, the page scrolls anyway), the rail runs to its end: the seventh row too.
    page({ sibling: { bottom: 945, height: 600 } });
    expect(measureFit(rail(), "data-fit", "css", undefined, POOLS)).toEqual({ count: 7, more: 0, ranks: 7 });
  });
});

/*
  A paged list's edge (useRowBudget, All Champions' workspace): the window's foot less #content's
  bottom padding and the card's border, or, inside an open window (the workspace window), that window's
  own foot less its border, whatever the page's padding.
*/
describe("rowBudgetEdge", () => {
  afterEach(() => vi.unstubAllGlobals());
  /** A card, inside an open dialog whose box ends at `dialogBottom` (or on the page where it is null). */
  function card({ dialogBottom = null, cardBorder = 1, dialogBorder = 1 }: { dialogBottom?: number | null; cardBorder?: number; dialogBorder?: number }) {
    const dialog = dialogBottom === null ? null : { getBoundingClientRect: () => ({ bottom: dialogBottom }) };
    const el = { closest: (selector: string) => (selector === "dialog[open]" ? dialog : null) };
    const content = { id: "content" };
    vi.stubGlobal("window", { innerHeight: 689, scrollY: 0 });
    vi.stubGlobal("getComputedStyle", (x: unknown) => (x === content ? { paddingBottom: "12px" } : x === el ? { borderBottomWidth: `${cardBorder}px` } : x === dialog ? { borderBottomWidth: `${dialogBorder}px` } : {}));
    vi.stubGlobal("document", { getElementById: (id: string) => (id === "content" ? content : null), documentElement: {} });
    return el as unknown as HTMLElement;
  }

  it("ends a card on the page at the window's foot less the page's padding and the card's border", () => {
    expect(rowBudgetEdge(card({}))).toBe(689 - 12 - 1);
  });

  it("ends a card inside an open window at that window's foot less its border (the page's padding is not the window's)", () => {
    // The workspace window: 1rem from the window's foot (689 − 16 = 673), its 1px border; the card inside it has none.
    expect(rowBudgetEdge(card({ dialogBottom: 673, cardBorder: 0 }))).toBe(672);
  });
});
