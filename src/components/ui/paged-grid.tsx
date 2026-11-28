"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { useRowBudget } from "./fit-rows";
import { NOTHING_SAID, keepSaid, positionAttributes, rangeText, rangeWords, rowAttributes, useFocusOnceDrawn, type PagedWords, type PositionProps, type RegionProps, type RowProps, type RowPropsOptions, type Said } from "./paged-list";
import type { PagerProps } from "./pager";
import { isTyping, rootPx } from "./posture";
import { columnRows, slotPageOf, slotPages, useFollowed, usePagedList, type Slot } from "./row-budget";
import { useWorkspaceSection } from "./workspace";

/*
  A paged grid in a one-screen workspace (docs/RESPONSIVE.md, "One-screen desktop pages"; lifted from
  All Champions' lane opponents): the cells in one column, or two from a width of the region
  (`twoColumnsRem`), filled column-major (down the first column, then the second), as many a column
  as fit between the first cell and the card's footer (useRowBudget, per column), a page of them at a
  time, the inline Pager in the footer (PagedFooter). An optional divider slot (a section's line: the
  small samples' "Fewer than 3 games") goes before the row at `divider`, never as a page's last slot,
  and again at the top of every page that starts after it (slotPages).

  The keys: ↑/↓ the cell before or after in the reading order (across pages), ←/→ the same row of
  the other column, PageUp/PageDown the first cell of the page before or after, Home/End the first
  or the last cell. The focus follows once the cell is drawn. The open item (`open`) is followed
  through useFollowed: closing it brings the grid back on the page holding it.

  Cells carry data-ws-row and data-row-key (cellProps), the divider data-ws-row and data-ws-divider
  (dividerProps): both are measured rows. Before the page measures (the server's HTML, the flow),
  `slotsToDraw` is every row with the divider in its place, and `gridClassName` is undefined: the
  page draws its own first paint (a list, or a ws: grid with its tiers).
*/

/** Its width less its side padding (the region's content width), compared with `rem`: true from it, rechecked as it resizes. */
export function useWideAs(ref: React.RefObject<HTMLElement | null>, rem: number | null, active: boolean): boolean {
  const [wide, setWide] = React.useState(true);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!active || !el || rem === null) return;
    const check = () => {
      const s = getComputedStyle(el);
      setWide(el.clientWidth - (parseFloat(s.paddingLeft) || 0) - (parseFloat(s.paddingRight) || 0) >= rem * rootPx() - 0.5);
    };
    check();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(check) : null;
    observer?.observe(el);
    return () => observer?.disconnect();
  }, [ref, rem, active]);
  return rem !== null && wide;
}

/** The hairline down the middle of the gap between two columns: a rule, not a box (drawn with the second column). */
const HAIRLINE = "ws:before:absolute ws:before:inset-y-0 ws:before:left-1/2 ws:before:w-px ws:before:bg-border/60";

/** A page's grid (pure): the rows its columns take (4 cells are 2 + 2), whether the second column is drawn, its classes and its rows' template. */
export function gridShape(onPage: number, perColumn: number, columns: 1 | 2): { rowsHere: number; secondColumn: boolean; className: string; style: React.CSSProperties } {
  const rowsHere = columnRows(onPage, perColumn, columns);
  const secondColumn = columns === 2 && onPage > rowsHere;
  return { rowsHere, secondColumn, className: cn("relative grid grid-flow-col gap-x-4", columns === 2 ? "grid-cols-2" : "grid-cols-1", secondColumn && HAIRLINE), style: { gridTemplateRows: `repeat(${rowsHere}, auto)` } };
}

/** The divider slotPages draws (pure): `divider` where it is a row of the list and a page holds two slots or more, else none. Published as data-divider, so a test works out the pages (e2e/workspace.ts). */
export function pagesDivider(total: number, perPage: number, divider: number | null): number | null {
  return divider !== null && divider >= 0 && divider < total && Math.floor(perPage) >= 2 ? divider : null;
}

const firstRowOf = <T,>(slots: ReadonlyArray<Slot<T>> | undefined) => slots?.find((x): x is Extract<Slot<T>, { kind: "row" }> => x.kind === "row")?.index ?? 0;
const lastRowOf = <T,>(slots: ReadonlyArray<Slot<T>> | undefined) => [...(slots ?? [])].reverse().find((x): x is Extract<Slot<T>, { kind: "row" }> => x.kind === "row")?.index ?? 0;

/**
 * The cell a key moves the focus to (pure, for its unit test; the lane opponents' keys): `index` the
 * focused cell's row, `pages` the slot pages, `page` the one shown. undefined: not a key of the grid's;
 * null: the grid's key, with nowhere to go.
 */
export function gridKeyTarget<T>(key: string, at: { index: number; pages: ReadonlyArray<ReadonlyArray<Slot<T>>>; page: number; perColumn: number; columns: 1 | 2; total: number }): number | null | undefined {
  const { index: i, pages, page, perColumn, columns, total } = at;
  const slots = pages[page - 1] ?? [];
  let to: number;
  if (key === "ArrowDown") to = i + 1;
  else if (key === "ArrowUp") to = i - 1;
  else if (key === "Home") to = 0;
  else if (key === "End") to = total - 1;
  else if (key === "PageDown") to = page < pages.length ? firstRowOf(pages[page]) : -1;
  else if (key === "PageUp") to = page > 1 ? firstRowOf(pages[page - 2]) : -1;
  else if (key === "ArrowLeft" || key === "ArrowRight") {
    if (columns !== 2) return undefined;
    const pos = slots.findIndex((x) => x.kind === "row" && x.index === i);
    const rows = columnRows(slots.length, perColumn, 2);
    const toColumn = Math.floor(pos / rows) + (key === "ArrowRight" ? 1 : -1);
    const target = pos >= 0 && toColumn >= 0 && toColumn < 2 ? slots[toColumn * rows + (pos % rows)] : undefined;
    to = target && target.kind === "row" ? target.index : -1;
  } else return undefined;
  return to < 0 || to >= total || to === i ? null : to;
}

type Primitive = string | number | boolean | null | undefined;

export interface PagedGridOptions<T> {
  rows: readonly T[];
  keyOf: (row: T) => string;
  words: PagedWords;
  /** The test ids' stem: `${testId}-pager`, `-prev`, `-next`, `-foot`; the range's id `${testId}-range` unless `rangeId`. */
  testId: string;
  /** Two columns from this content width of the region (rem); null: one column always. */
  twoColumnsRem: number | null;
  /** Measure and page: the nearest WorkspaceSection's `paged` by default. */
  active?: boolean;
  /** The element whose width decides the columns (the hook's own, returned, unless given). */
  regionRef?: React.RefObject<HTMLElement | null>;
  listRef?: React.RefObject<HTMLElement | null>;
  footRef?: React.RefObject<HTMLDivElement | null>;
  cardRef?: React.RefObject<HTMLElement | null>;
  rowSelector?: string;
  probeRem: number;
  mode?: "uniform" | "cumulative";
  observe?: () => ReadonlyArray<Element | null | undefined>;
  measureKey?: ReadonlyArray<Primitive>;
  /** A browser test's cap on the cells a column shows. */
  cap?: number | null;
  /** The divider slot's place: before this row (its index in `rows`); null for none. */
  divider?: number | null;
  /** The open item's key: its page is shown, and the page holding it once it closes. */
  open?: string | null;
  search?: string;
  order?: unknown;
  data?: unknown;
  reset?: unknown;
  region?: string;
  rangeId?: string;
  label?: string;
}

export interface PagedGrid<T> {
  columns: 1 | 2;
  /** Cells a column holds, and a page; null while not paged. */
  perColumn: number | null;
  perPage: number | null;
  paged: boolean;
  page: number;
  pages: number;
  /** The page's slots (null while not paged), or every row with the divider in place (the first paint): what to draw. */
  slots: Slot<T>[] | null;
  slotsToDraw: Slot<T>[];
  range: { from: number; to: number } | null;
  rowsHere: number;
  secondColumn: boolean;
  /** The paged grid's classes and its rows' template (undefined while not paged: the page's own first paint). */
  gridClassName: string | undefined;
  gridStyle: React.CSSProperties | undefined;
  onGridKeyDown: (e: React.KeyboardEvent) => void;
  turn: (p: number) => void;
  live: string;
  goToIndex: (index: number) => void;
  focusKey: (key: string) => void;
  regionProps: RegionProps;
  listProps: { "aria-describedby"?: string };
  /** A cell's attributes (rowProps'): its place while paged unless `{ position: false }` (a cell that is a link or a button: positionProps on its listitem). */
  cellProps: (slot: Extract<Slot<T>, { kind: "row" }>, o?: RowPropsOptions) => RowProps;
  positionProps: (slot: Extract<Slot<T>, { kind: "row" }>) => PositionProps;
  dividerProps: { "data-ws-row": ""; "data-ws-divider": "" };
  pagerProps: PagerProps;
  regionRef: React.RefObject<HTMLElement | null>;
  listRef: React.RefObject<HTMLElement | null>;
  footRef: React.RefObject<HTMLDivElement | null>;
  cardRef: React.RefObject<HTMLElement | null>;
  footTestId: string;
}

/** A grid's pages in the workspace (see the file's header). */
export function usePagedGrid<T>(o: PagedGridOptions<T>): PagedGrid<T> {
  const section = useWorkspaceSection();
  const active = o.active ?? section?.paged ?? false;
  const workspace = section?.workspace ?? active;
  const ownRegion = React.useRef<HTMLElement | null>(null);
  const ownList = React.useRef<HTMLElement | null>(null);
  const ownFoot = React.useRef<HTMLDivElement | null>(null);
  const ownCard = React.useRef<HTMLElement | null>(null);
  const regionRef = o.regionRef ?? ownRegion;
  const listRef = o.listRef ?? ownList;
  const footRef = o.footRef ?? ownFoot;
  const cardRef = o.cardRef ?? ownCard;
  const { rows, keyOf, words, testId, search = "", order = null, data = null, reset = null, open = null, divider = null } = o;
  const total = rows.length;
  const two = useWideAs(regionRef, o.twoColumnsRem, active);
  const columns: 1 | 2 = two ? 2 : 1;
  const budget = useRowBudget(listRef, {
    footRef,
    cardRef,
    rowSelector: o.rowSelector,
    probeRem: o.probeRem,
    mode: o.mode,
    active: active && total > 0,
    observe: o.observe,
    key: [total, search, typeof order === "string" || typeof order === "number" ? order : JSON.stringify(order ?? null), columns, divider, ...(o.measureKey ?? [])],
    cap: o.cap ?? null,
  });
  const perColumn = active ? budget : null;
  const perPage = perColumn === null ? null : perColumn * columns;
  const pages = React.useMemo(() => (perPage === null ? null : slotPages(rows, perPage, divider)), [rows, perPage, divider]);
  const followed = useFollowed(open, pages !== null);
  const index = React.useMemo(() => new Map(rows.map((r, i) => [keyOf(r), i])), [rows, keyOf]);
  const { page, go } = usePagedList(
    { perPage, total, selected: followed, selectedIndex: followed !== null ? (index.get(followed) ?? -1) : -1, search, order, data, reset },
    pages ? { pageOfIndex: (i) => slotPageOf(pages, i), firstOf: (p) => firstRowOf(pages[p - 1]), pages: pages.length } : undefined,
  );
  const slots = pages ? (pages[page - 1] ?? []) : null;
  const flowSlots = React.useMemo(() => rows.flatMap((item, i): Slot<T>[] => (divider === i ? [{ kind: "divider" }, { kind: "row", item, index: i }] : [{ kind: "row", item, index: i }])), [rows, divider]);
  const [said, setSaid] = React.useState<Said>(NOTHING_SAID);
  // The page changed for another reason than the reader's turn: what was said goes (keepSaid).
  if (keepSaid(said, page) !== said) setSaid(NOTHING_SAID);
  const live = keepSaid(said, page).text;
  const turn = (p: number) => {
    if (!pages) return;
    go(p);
    setSaid({ text: rangeWords(words, firstRowOf(pages[p - 1]) + 1, lastRowOf(pages[p - 1]) + 1, total), page: p });
  };
  const focusKey = useFocusOnceDrawn(listRef, pages !== null);
  const goToIndex = (i: number) => {
    if (!pages || i < 0 || i >= total) return;
    const p = slotPageOf(pages, i);
    focusKey(keyOf(rows[i]!));
    if (p !== page) turn(p);
  };
  const onGridKeyDown = (e: React.KeyboardEvent) => {
    if (!pages || !slots || e.altKey || e.ctrlKey || e.metaKey || isTyping(e.target)) return;
    const cell = (e.target as Element).closest?.<HTMLElement>("[data-row-key]");
    const i = cell?.dataset.rowKey !== undefined ? (index.get(cell.dataset.rowKey) ?? -1) : -1;
    if (i < 0) return;
    const to = gridKeyTarget(e.key, { index: i, pages, page, perColumn: perColumn ?? 1, columns, total });
    if (to === undefined) return;
    e.preventDefault();
    if (to !== null) goToIndex(to);
  };
  const onPage = slots ? slots.length : 0;
  const shape = slots ? gridShape(onPage, perColumn ?? 1, columns) : null;
  const range = slots ? { from: firstRowOf(slots) + 1, to: lastRowOf(slots) + 1 } : null;
  const pageTotal = pages ? pages.length : 1;
  const rangeId = o.rangeId ?? `${testId}-range`;
  const pagerProps: PagerProps = {
    layout: "inline",
    label: o.label ?? `${words.one[0]?.toUpperCase() ?? ""}${words.one.slice(1)} pages`,
    page: pages ? page : 1,
    pages: pageTotal,
    onPage: turn,
    range: rangeText(words, range, pageTotal, total),
    widest: `${total}–${total} of ${total}`,
    rangeId,
    prevLabel: "Previous page",
    nextLabel: "Next page",
    live,
    testId: `${testId}-pager`,
    prevTestId: `${testId}-prev`,
    nextTestId: `${testId}-next`,
  };
  return {
    columns,
    perColumn,
    perPage,
    paged: slots !== null,
    page,
    pages: pageTotal,
    slots,
    slotsToDraw: slots ?? flowSlots,
    range,
    rowsHere: shape?.rowsHere ?? 0,
    secondColumn: shape?.secondColumn ?? false,
    gridClassName: shape?.className,
    gridStyle: shape?.style,
    onGridKeyDown,
    turn,
    live,
    goToIndex,
    focusKey,
    regionProps: pages ? { "data-ws-region": o.region ?? "grid", "data-per": perPage ?? undefined, "data-page": page, "data-pages": pageTotal, "data-total": total, "data-divider": pagesDivider(total, perPage ?? 1, divider) ?? undefined } : {},
    listProps: workspace ? { "aria-describedby": rangeId } : {},
    cellProps: (slot, opts) => rowAttributes(keyOf(slot.item), pages ? slot.index : -1, total, opts),
    positionProps: (slot) => (pages ? positionAttributes(slot.index, total) : {}),
    dividerProps: { "data-ws-row": "", "data-ws-divider": "" },
    pagerProps,
    regionRef,
    listRef,
    footRef,
    cardRef,
    footTestId: `${testId}-foot`,
  };
}
