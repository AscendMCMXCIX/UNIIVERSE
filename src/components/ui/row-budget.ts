import * as React from "react";

/*
  Height-aware pages (All Champions' one-screen workspace, the owner's request of 27 Nov 2026;
  docs/RESPONSIVE.md, "All Champions' workspace"): a list that would grow past the window shows as
  many complete rows as fit between its first row and its footer instead, and a pager reaches the
  rest. Nothing scrolls inside, nothing is clipped, and text never shrinks: a shorter window shows
  fewer rows. The measure itself is useRowBudget (fit-rows.tsx); these are its pure parts, and the
  page a list shows as its rows, its order, its selection or its budget change (usePagedList).

  No record is ever out of reach: every row is on exactly one page (pageRange, slotPages), the pager
  reaches every page, the lists' keys cross pages, and the searches find by name.
*/

/** Complete rows that fit: floor((room + lastLess) / rowPx), at least `min` (1), at most `max`. rowPx ≤ 0 gives min. */
export function rowBudget({ room, rowPx, lastLess = 0, min = 1, max = Infinity }: { room: number; rowPx: number; lastLess?: number; min?: number; max?: number }): number {
  if (!(rowPx > 0) || !Number.isFinite(room)) return min;
  // A hundredth of a pixel absorbs the rounding of fractional layouts (a 16.5px root): never a whole row.
  const fits = Math.floor((room + lastLess + 0.01) / rowPx);
  return Math.max(min, Math.min(max, fits));
}

/** Pages for `total` rows at `perPage` a page: at least 1 (an empty list is one page). */
export function pageCount(total: number, perPage: number): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, perPage)));
}

/** The page (1-based) holding the row at `index` (0-based). */
export function pageOf(index: number, perPage: number): number {
  return Math.floor(Math.max(0, index) / Math.max(1, perPage)) + 1;
}

/** The rows a page holds, 1-based and inclusive ("8–14 of 30"); 0–0 for an empty list. */
export function pageRange(page: number, perPage: number, total: number): { from: number; to: number } {
  if (total <= 0) return { from: 0, to: 0 };
  const p = clampPage(page, total, perPage);
  return { from: (p - 1) * perPage + 1, to: Math.min(total, p * perPage) };
}

/** A page that exists for this many rows. */
export function clampPage(page: number, total: number, perPage: number): number {
  return Math.min(Math.max(1, Math.floor(page) || 1), pageCount(total, perPage));
}

/** The page after a change: the selected item's, if any and present; else the page holding `firstShown`. */
export function keepPage({ perPage, firstShown, selected, pageOf: of = (i: number) => pageOf(i, perPage) }: { perPage: number; firstShown: number; selected?: number | null; pageOf?: (index: number) => number }): number {
  return selected != null && selected >= 0 ? of(selected) : of(Math.max(0, firstShown));
}

/** Rows a page's column-major grid needs: min(perColumn, ceil(onPage / columns)), so 4 cells are 2 + 2, not 4 + 0. */
export function columnRows(onPage: number, perColumn: number, columns: 1 | 2): number {
  return Math.max(1, Math.min(perColumn, Math.ceil(Math.max(0, onPage) / columns)));
}

export type Slot<T> = { kind: "row"; item: T; index: number } | { kind: "divider" };

/**
 * Pages of slots in the win-rate orders (the lane opponents' small-sample divider, a slot of its
 * own): the divider goes before the first small sample (`divider`, its index in `rows`), never as a
 * page's last slot (that page ends one slot early), and again at the top of every page that starts
 * inside the small samples, so each page says why its grey rows come last. With divider null (Most
 * games), or pages too small for a divider and a row (perPage under 2), plain pages.
 */
export function slotPages<T>(rows: readonly T[], perPage: number, divider: number | null): Slot<T>[][] {
  const per = Math.max(1, Math.floor(perPage));
  const line = divider !== null && divider >= 0 && divider < rows.length && per >= 2 ? divider : null;
  const pages: Slot<T>[][] = [];
  let page: Slot<T>[] = [];
  let i = 0;
  while (i < rows.length) {
    if (line !== null && i >= line) {
      if (page.length === 0) page.push({ kind: "divider" });
      else if (i === line) {
        // The divider would be this page's last slot: the page ends here, and the next one starts with it.
        if (page.length + 1 >= per) {
          pages.push(page);
          page = [];
          continue;
        }
        page.push({ kind: "divider" });
      }
    }
    page.push({ kind: "row", item: rows[i]!, index: i });
    i += 1;
    if (page.length >= per) {
      pages.push(page);
      page = [];
    }
  }
  if (page.length) pages.push(page);
  if (!pages.length) pages.push([]);
  return pages;
}

/** The page (1-based) of `pages` that holds the row at `index`; 1 when none does. */
export function slotPageOf<T>(pages: ReadonlyArray<ReadonlyArray<Slot<T>>>, index: number): number {
  const at = pages.findIndex((p) => p.some((s) => s.kind === "row" && s.index === index));
  return at < 0 ? 1 : at + 1;
}

/** What a paged list shows from, compared with what it showed (usePagedList). */
export interface PagedInputs {
  /** Rows a page; null while not paged (flow, or not measured yet). */
  perPage: number | null;
  total: number;
  /** The selected item's key (the open champion, the open opponent), or null. */
  selected: string | null;
  /** Its index in the rows now, or -1 where they do not hold it (a search hides it, a filter dropped it). */
  selectedIndex: number;
  /** The search's words: typing goes back to page 1. */
  search: string;
  /** The order: the selected item's page, else page 1. */
  order: unknown;
  /** The data (a filter's new answer): the selected item's page if it is still listed, else page 1. */
  data: unknown;
  /** Anything else that starts the list again (the opponents' position). */
  reset?: unknown;
}

export interface PagedState extends PagedInputs {
  page: number;
  /** The index of the first row the page showed. */
  first: number;
}

/**
 * The page a list shows after a change (docs/RESPONSIVE.md, "All Champions' workspace", the page
 * state): `prev` is what it showed and from what, `next` what it shows from now; `pageOfIndex` and
 * `pages` are the new pages' (plain or slot pages). In order:
 *  - another position (`reset`): page 1;
 *  - new data (a filter): the selected item's page if it is listed, else page 1;
 *  - typed in the search: page 1 (the open champion stays open even if its row is hidden);
 *  - another order: the selected item's page, else page 1;
 *  - another item selected (a row, a key, ‹ ›, Back): its page; closing keeps the page;
 *  - another budget (a resize, a zoom, the sidebar, a band wrapping): the selected item's page, else
 *    the page holding the first row shown before;
 *  - else the same page, within the pages there are now.
 */
export function pagedListNext(prev: PagedState, next: PagedInputs, pageOfIndex: (index: number) => number, pages: number): number {
  const clamp = (p: number) => Math.min(Math.max(1, p), Math.max(1, pages));
  const selectedPage = next.selectedIndex >= 0 ? pageOfIndex(next.selectedIndex) : null;
  if (next.perPage === null) return clamp(prev.page);
  if (!Object.is(prev.reset, next.reset)) return 1;
  if (!Object.is(prev.data, next.data)) return clamp(selectedPage ?? 1);
  if (prev.search !== next.search) return 1;
  if (!Object.is(prev.order, next.order)) return clamp(selectedPage ?? 1);
  if (prev.selected !== next.selected && next.selected !== null && selectedPage !== null) return clamp(selectedPage);
  if (prev.perPage !== next.perPage) return clamp(selectedPage ?? pageOfIndex(prev.perPage === null ? 0 : prev.first));
  return clamp(prev.page);
}

const sameInputs = (a: PagedInputs, b: PagedInputs) =>
  a.perPage === b.perPage && a.total === b.total && a.selected === b.selected && a.selectedIndex === b.selectedIndex && a.search === b.search && Object.is(a.order, b.order) && Object.is(a.data, b.data) && Object.is(a.reset, b.reset);

/**
 * A paged list's page (pagedListNext), kept in the component's state: decided during render from
 * what changed (React's "information from previous renders" pattern), so the page drawn is never a
 * render late. `go` is a page the reader chose (the pager, a key). `pageOfIndex(index)`, `firstOf(page)`
 * and `pages` describe the pages at the current budget (plain pages by default).
 */
export function usePagedList(next: PagedInputs, shape?: { pageOfIndex: (index: number) => number; firstOf: (page: number) => number; pages: number }): { page: number; go: (page: number) => void } {
  const per = next.perPage ?? 1;
  const pageOfIndex = shape?.pageOfIndex ?? ((i: number) => pageOf(i, per));
  const firstOf = shape?.firstOf ?? ((p: number) => (p - 1) * per);
  const pages = shape?.pages ?? pageCount(next.total, per);
  const [state, setState] = React.useState<PagedState>(() => {
    const page = next.perPage !== null && next.selectedIndex >= 0 ? pageOfIndex(next.selectedIndex) : 1;
    return { ...next, page, first: firstOf(page) };
  });
  let current = state;
  if (!sameInputs(state, next)) {
    const page = pagedListNext(state, next, pageOfIndex, pages);
    current = { ...next, page, first: firstOf(page) };
    setState(current);
  }
  const page = Math.min(Math.max(1, current.page), Math.max(1, pages));
  const firstRef = React.useRef(firstOf);
  React.useLayoutEffect(() => {
    firstRef.current = firstOf;
  });
  const go = React.useCallback((p: number) => setState((s) => ({ ...s, page: p, first: firstRef.current(p) })), []);
  return { page, go };
}
