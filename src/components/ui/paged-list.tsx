"use client";

import * as React from "react";
import { formatCount } from "@/lib/format";
import { useRowBreaks, useRowBudget } from "./fit-rows";
import { Pager, type PagerProps } from "./pager";
import { isTyping } from "./posture";
import { pageCount, pageOf, pageRange, startsPageOf, startsRange, startsSizes, usePagedList } from "./row-budget";
import { WorkspaceFoot, useWorkspaceSection } from "./workspace";

/*
  A paged list in a one-screen workspace (docs/RESPONSIVE.md, "One-screen desktop pages", pattern a;
  lifted from All Champions' champion list): the complete rows that fit between the list's first row
  and its card's footer (useRowBudget), a page of them drawn at a time, the inline Pager in the
  card's footer (PagedFooter), and the keys across pages (PageUp/PageDown a page, Home/End the first
  or the last row; with `arrows`, ↑/↓ the row above or below, its page turning). Nothing scrolls
  inside, nothing is clipped, no text shrinks: a shorter window shows fewer rows, and every row is on
  exactly one page.

  Outside the workspace (and before the page has measured) the list is the flow's: `shown` is the
  caller's flow rows (every row by default), and the footer is not drawn (WorkspaceFoot).

  The page a list shows follows usePagedList's rules (row-budget.ts): a search goes to page 1; new
  data (a filter: pass `data`) to the selected row's page or page 1; another order likewise; another
  selection to its page; another budget (a resize) to the selected row's page or the page holding the
  first row shown. A page change the reader makes is read out once (`live`), never after a resize.

  The data contract (ui/workspace.tsx): each row carries data-ws-row (the measured row) and
  data-row-key (its key, for the keys and the focus), and aria-posinset/aria-setsize while paged
  (only a page is in the page; on the row element where it is an li, a tr or a [role=option], else on
  its listitem: RowPropsOptions); the card carries data-ws-region with data-per, data-page, data-pages
  and data-total while paged (regionProps); the list is described by the range (listProps).
*/

/** A list's noun, in the singular and the plural, lower case: "champion", "champions". */
export interface PagedWords {
  one: string;
  many: string;
}

const capital = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

/** The words read out after a page change the reader made: "Champions 8 to 14 of 30". */
export function rangeWords(words: PagedWords, from: number, to: number, total: number): string {
  return `${capital(words.many)} ${formatCount(from)} to ${formatCount(to)} of ${formatCount(total)}`;
}

/** The pager's range: "8–14 of 30" (its noun read out only) on a list of several pages, else the count ("30 champions"). */
export function rangeText(words: PagedWords, range: { from: number; to: number } | null, pages: number, total: number): React.ReactNode {
  if (range && pages > 1)
    return (
      <>
        <span className="sr-only">{capital(words.many)} </span>
        {formatCount(range.from)}–{formatCount(range.to)} of {formatCount(total)}
      </>
    );
  return `${formatCount(total)} ${total === 1 ? words.one : words.many}`;
}

/**
 * The row a key moves the focus to (pure, for its unit test): PageDown the next page's first row,
 * PageUp the previous page's last, Home the first row, End the last; with `arrows`, ↓/↑ the next or
 * the previous row from the focused one (`index`, -1 where the focus is on no row). A cumulative list
 * passes where its pages start (`starts`). undefined: not a key of the list's (left to the browser);
 * null: the list's key, with nowhere to go (at an end).
 */
export function listKeyTarget(key: string, at: { index: number; page: number; pages: number; perPage: number; total: number; arrows?: boolean; starts?: readonly number[] }): number | null | undefined {
  const { index, page, pages, perPage, total, arrows = false, starts } = at;
  if (total <= 0) return key === "PageDown" || key === "PageUp" || key === "Home" || key === "End" ? null : undefined;
  // A cumulative list's pages are not `perPage` each: where they start (`starts`) says.
  if (key === "PageDown") return page < pages ? (starts ? starts[page]! : page * perPage) : null;
  if (key === "PageUp") return page > 1 ? (starts ? starts[page - 1]! : (page - 1) * perPage) - 1 : null;
  if (key === "Home") return index === 0 ? null : 0;
  if (key === "End") return index === total - 1 ? null : total - 1;
  if (arrows && key === "ArrowDown") return index >= 0 && index < total - 1 ? index + 1 : null;
  if (arrows && key === "ArrowUp") return index > 0 ? index - 1 : null;
  return undefined;
}

/**
 * Whether a key was pressed inside a dialog that a row of the list holds (pure, for its unit test):
 * a record's Release confirmation, drawn inline in its row. The list's keys are not that dialog's:
 * PageDown there would turn the page and unmount the row with the dialog in it, and Home would move
 * the focus to a row behind the modal. A list that is itself inside a window (a picker's) keeps its
 * keys: only a dialog inside `list` counts.
 */
export function inDialogWithin(target: EventTarget | null, list: { contains(other: Node | null): boolean }): boolean {
  if (!target || typeof (target as Element).closest !== "function") return false;
  const dialog = (target as Element).closest("dialog");
  return !!dialog && dialog !== list && list.contains(dialog);
}

/** What a page change the reader made has read out (the Pager's live region), and the page it was said for. */
export interface Said {
  text: string;
  page: number;
}

export const NOTHING_SAID: Said = { text: "", page: 0 };

/**
 * The live words to keep as the list draws `page` (pure, for its unit test): the last ones said while
 * their page is shown, else none. A page change the list makes itself (an order, a search, a filter, a
 * budget) clears them, so the reader's next turn is a new text in the live region even where its words
 * are the ones said before (React would bail out of setting the same string: no mutation, nothing
 * read), and a resize that comes back to the page said never says it again.
 */
export function keepSaid(said: Said, page: number): Said {
  return said.page === page ? said : NOTHING_SAID;
}

const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

/** What takes the focus in a row: the row itself where it is focusable, else its [data-row-focus], else its first control. */
export function rowFocusTarget(row: HTMLElement): HTMLElement | null {
  if (row.matches(FOCUSABLE)) return row;
  return row.querySelector<HTMLElement>("[data-row-focus]") ?? row.querySelector<HTMLElement>(FOCUSABLE);
}

/** The row element of `key` in `list` (its data-row-key). */
export function rowElement(list: HTMLElement | null, key: string): HTMLElement | null {
  return list?.querySelector<HTMLElement>(`[data-row-key="${CSS.escape(key)}"]`) ?? null;
}

/**
 * A row to focus once it is drawn (a key or a step that turned the page): set it with `want(key)`;
 * every render looks for it and focuses it, then lets go. `settled` (the list drawn in its pages)
 * lets go too where the row is not drawn, so a pending focus never takes the focus later from what
 * the reader does next. While `hold` (a cumulative list measuring, every row drawn) it waits.
 */
export function useFocusOnceDrawn(listRef: React.RefObject<HTMLElement | null>, settled: boolean, hold = false): (key: string) => void {
  const pending = React.useRef<string | null>(null);
  const [, redraw] = React.useState(0);
  React.useLayoutEffect(() => {
    const key = pending.current;
    // A cumulative list measuring (`hold`) draws every row for a render: the row is focused on its page, drawn next.
    if (!key || hold) return;
    const target = (() => {
      const row = rowElement(listRef.current, key);
      return row ? rowFocusTarget(row) : null;
    })();
    if (target) {
      target.focus({ preventScroll: true });
      pending.current = null;
    } else if (settled) pending.current = null;
  });
  return React.useCallback((key: string) => {
    pending.current = key;
    // A row already drawn is focused by the render this asks for; one on another page by the render its page turn makes.
    redraw((n) => n + 1);
  }, []);
}

type Primitive = string | number | boolean | null | undefined;

export interface PagedRowsOptions<T> {
  rows: readonly T[];
  keyOf: (row: T) => string;
  /** The list's noun ("champion", "champions"): the range, the words read out, the pager's name. */
  words: PagedWords;
  /** The test ids' stem: `${testId}-pager`, `-prev`, `-next`, `-foot` (and the range's id, `${testId}-range`, unless `rangeId`). */
  testId: string;
  /** Measure and page (the workspace, known: ws === true). The nearest WorkspaceSection's `paged` by default. */
  active?: boolean;
  /** The list (its rows' parent), its card's footer and its card: the page's own refs, or the hook's (returned). */
  listRef?: React.RefObject<HTMLElement | null>;
  footRef?: React.RefObject<HTMLDivElement | null>;
  cardRef?: React.RefObject<HTMLElement | null>;
  /** A row (useRowBudget's): `[data-ws-row]` by default, which rowProps sets. */
  rowSelector?: string;
  /** A row's height in rem while none is drawn. */
  probeRem: number;
  /** 1 for a divided list (divide-y: its last row has no border). */
  lastLess?: number;
  /**
   * "uniform": rows of one height, every page `perPage` rows (useRowBudget; the default). "cumulative": rows
   * of several heights, in groups or not, the pages cut once over the whole list by the rows' own heights
   * (useRowBreaks): while it measures, `shown` is every row for one render that is never painted; a group's
   * element carries `data-ws-group` and a page that starts inside a group draws its heading again.
   */
  mode?: "uniform" | "cumulative";
  /** The fixed bands above the rows inside the card (a toolbar, the column heads): a wrap there moves the first row. */
  observe?: () => ReadonlyArray<Element | null | undefined>;
  /** What else the rows' layout depends on (the list's width, a split): measured again when it changes. */
  measureKey?: ReadonlyArray<Primitive>;
  /** A browser test's cap on the measured count (server/demo/test-hooks.ts, rowsPerPageForTest). */
  cap?: number | null;
  /** The selected row's key: its page is shown when it is chosen, and kept through a resize. */
  selected?: string | null;
  /** The search's words: typing goes to page 1. */
  search?: string;
  /** The order: the selected row's page, else page 1. */
  order?: unknown;
  /** What the rows are from (a filter's key): a new answer goes to the selected row's page, else page 1. */
  data?: unknown;
  /** Anything else that starts the list again. */
  reset?: unknown;
  /** The region's name (data-ws-region): "list" by default. */
  region?: string;
  /** The range's id (the list's aria-describedby): `${testId}-range` by default. */
  rangeId?: string;
  /** The pager's name: "Champion pages" (from `words`) by default. */
  label?: string;
  /** ↑/↓ move the focus to the row above or below, across pages. */
  arrows?: boolean;
  /** The rows the flow draws (outside the workspace, and before it measures): every row by default. */
  flowRows?: readonly T[];
}

/** The attributes of a paged list's region (its card): the data contract's, while paged. */
export interface RegionProps {
  "data-ws-region"?: string;
  "data-per"?: number;
  "data-page"?: number;
  "data-pages"?: number;
  "data-total"?: number;
  /** A paged grid's divider slot (usePagedGrid's `divider`, where its pages draw one): the row it stands before. */
  "data-divider"?: number;
  /** A cumulative list's pages: where each starts (0-based row indexes, comma-separated: "0,7,13"). */
  "data-starts"?: string;
}

export interface PositionProps {
  "aria-posinset"?: number;
  "aria-setsize"?: number;
}

export interface RowProps extends PositionProps {
  "data-ws-row": "";
  "data-row-key": string;
}

/**
 * Where a row's place on the whole list goes. aria-posinset and aria-setsize are allowed on a listitem,
 * a row and an option, not on a link or a button (axe's aria-allowed-attr fails them there, as the
 * Production check's axe pass would). A row element that is an li, a tr or a [role=option] takes them
 * with rowProps (the default); a row element that is a link or a button takes `{ position: false }`,
 * and its listitem takes positionProps(row).
 */
export interface RowPropsOptions {
  position?: boolean;
}

/** A paged row's place (pure): aria-posinset and aria-setsize while paged (`at` ≥ 0), else nothing. */
export function positionAttributes(at: number, total: number): PositionProps {
  return at >= 0 ? { "aria-posinset": at + 1, "aria-setsize": total } : {};
}

/** A row's attributes (pure, for its unit test): the data contract's, and its place where paged (`at` ≥ 0) unless `position: false`. */
export function rowAttributes(key: string, at: number, total: number, o: RowPropsOptions = {}): RowProps {
  return { "data-ws-row": "", "data-row-key": key, ...(o.position === false ? {} : positionAttributes(at, total)) };
}

export interface PagedRows<T> {
  /** Rows a page (a cumulative list's: the most a page holds); null while not paged (the flow, or not measured yet). */
  perPage: number | null;
  /** A cumulative list's pages: where each starts (0-based row indexes); null in the uniform mode and while not paged. */
  starts: readonly number[] | null;
  /** The page (1-based) holding the row at `index` (of `rows`), as the list is paged now; 1 while not paged. */
  pageOf: (index: number) => number;
  /** A cumulative list measuring: `shown` is every row, for one render that is never painted. */
  measuring: boolean;
  /** Paged: a page of the rows is drawn (perPage measured, the workspace known). */
  paged: boolean;
  /** 1-based, and the pages there are (1 while not paged). */
  page: number;
  pages: number;
  /** The rows the page holds, 1-based and inclusive ("8–14 of 30"); null while not paged. */
  range: { from: number; to: number } | null;
  /** The index of the first row drawn. */
  offset: number;
  /** The rows to draw: a page of them, or the flow's (every row while a cumulative list measures). */
  shown: readonly T[];
  /** Shows page `p` and reads its range out (a page the reader chose). */
  turn: (p: number) => void;
  /** The words read out after the reader's page change (the Pager's `live`). */
  live: string;
  /** Shows the page holding the row at `index` (of `rows`) and focuses it once drawn. */
  goToIndex: (index: number) => void;
  /** Focuses the row of `key` once drawn (its page already shown, or turning). */
  focusKey: (key: string) => void;
  /** The list's keys across pages: on the list's element (its onKeyDown). */
  onListKeyDown: (e: React.KeyboardEvent) => void;
  /** The card's region attributes. */
  regionProps: RegionProps;
  /** The list's description: the range (aria-describedby), in the workspace. */
  listProps: { "aria-describedby"?: string };
  /** A row's attributes: data-ws-row, data-row-key, and its place on the whole list while paged (on an li, a tr or a [role=option]; `{ position: false }` on a link or a button, with positionProps on its listitem). */
  rowProps: (row: T, o?: RowPropsOptions) => RowProps;
  /** A row's place on the whole list while paged, for the listitem of a row element that is a link or a button. */
  positionProps: (row: T) => PositionProps;
  /** The inline Pager's props, for PagedFooter. */
  pagerProps: PagerProps;
  /** The refs the measure reads (the caller's where given). */
  listRef: React.RefObject<HTMLElement | null>;
  footRef: React.RefObject<HTMLDivElement | null>;
  cardRef: React.RefObject<HTMLElement | null>;
  /** The footer's test id (`${testId}-foot`). */
  footTestId: string;
}

/**
 * A list's pages in the workspace: useRowBudget's measure, usePagedList's page, the rows sliced, the
 * range and its words, the keys across pages and the focus following them, the region's attributes
 * and the inline Pager's props. Draw the rows from `shown` with `rowProps(row)`, the list's element
 * with `listRef`, `listProps` and `onListKeyDown`, its card with `cardRef` and `regionProps`
 * (WorkspaceCard), and the footer with PagedFooter.
 */
export function usePagedRows<T>(o: PagedRowsOptions<T>): PagedRows<T> {
  const section = useWorkspaceSection();
  const active = o.active ?? section?.paged ?? false;
  const workspace = section?.workspace ?? active;
  const ownList = React.useRef<HTMLElement | null>(null);
  const ownFoot = React.useRef<HTMLDivElement | null>(null);
  const ownCard = React.useRef<HTMLElement | null>(null);
  const listRef = o.listRef ?? ownList;
  const footRef = o.footRef ?? ownFoot;
  const cardRef = o.cardRef ?? ownCard;
  const { rows, keyOf, words, testId, search = "", order = null, data = null, reset = null, selected = null, arrows = false } = o;
  const total = rows.length;
  const cumulative = o.mode === "cumulative";
  const measureKey = [total, search, typeof order === "string" || typeof order === "number" ? order : JSON.stringify(order ?? null), ...(o.measureKey ?? [])];
  const budget = useRowBudget(listRef, {
    footRef,
    cardRef,
    rowSelector: o.rowSelector,
    probeRem: o.probeRem,
    lastLess: o.lastLess,
    mode: o.mode,
    active: active && total > 0 && !cumulative,
    observe: o.observe,
    key: measureKey,
    cap: o.cap ?? null,
  });
  // A cumulative list's pages, cut once over the whole list (useRowBreaks); the uniform mode's measure is useRowBudget's alone.
  const breaks = useRowBreaks(listRef, { footRef, cardRef, rowSelector: o.rowSelector, probeRem: o.probeRem, lastLess: o.lastLess, active: active && total > 0 && cumulative, observe: o.observe, key: measureKey, cap: o.cap ?? null, total });
  // The rows they were cut for may be more than there are for the one render that measures the new rows (a search): within them.
  const cut = cumulative && active && breaks.starts ? breaks.starts.filter((s, i) => i === 0 || s < total).join(",") : null;
  const starts = React.useMemo(() => (cut === null ? null : cut.split(",").map(Number)), [cut]);
  const perPage = active ? (cumulative ? (starts ? Math.max(...startsSizes(starts, total)) : null) : budget) : null;
  const index = React.useMemo(() => new Map(rows.map((r, i) => [keyOf(r), i])), [rows, keyOf]);
  const selectedIndex = selected !== null ? (index.get(selected) ?? -1) : -1;
  const { page, go } = usePagedList(
    { perPage, total, selected, selectedIndex, search, order, data, reset, ...(cut !== null ? { layout: cut } : {}) },
    starts ? { pageOfIndex: (i) => startsPageOf(starts, i), firstOf: (p) => starts[Math.min(Math.max(1, p), starts.length) - 1]!, pages: starts.length } : undefined,
  );
  const pages = perPage === null ? 1 : starts ? starts.length : pageCount(total, perPage);
  const range = perPage === null ? null : starts ? startsRange(starts, page, total) : pageRange(page, perPage, total);
  const offset = range && range.from > 0 ? range.from - 1 : 0;
  const flow = o.flowRows ?? rows;
  const measuring = breaks.measuring;
  const shown = React.useMemo(() => (measuring ? rows : range ? rows.slice(offset, starts ? range.to : offset + (perPage ?? 0)) : flow), [measuring, range, rows, offset, starts, perPage, flow]);
  const pageOfRow = React.useCallback((i: number) => (perPage === null ? 1 : starts ? startsPageOf(starts, i) : pageOf(i, perPage)), [perPage, starts]);
  const [said, setSaid] = React.useState<Said>(NOTHING_SAID);
  // The page changed for another reason than the reader's turn: what was said goes (keepSaid).
  if (keepSaid(said, page) !== said) setSaid(NOTHING_SAID);
  const live = keepSaid(said, page).text;
  const turn = React.useCallback(
    (p: number) => {
      if (perPage === null) return;
      go(p);
      const r = starts ? startsRange(starts, p, total) : pageRange(p, perPage, total);
      setSaid({ text: rangeWords(words, r.from, r.to, total), page: p });
    },
    [go, perPage, starts, total, words],
  );
  const focusKey = useFocusOnceDrawn(listRef, range !== null, measuring);
  const goToIndex = (i: number) => {
    if (perPage === null || i < 0 || i >= total) return;
    const p = pageOfRow(i);
    focusKey(keyOf(rows[i]!));
    if (p !== page) turn(p);
  };
  const onListKeyDown = (e: React.KeyboardEvent) => {
    if (perPage === null || !range || e.altKey || e.ctrlKey || e.metaKey || isTyping(e.target) || inDialogWithin(e.target, e.currentTarget)) return;
    const row = (e.target as Element).closest?.<HTMLElement>("[data-row-key]");
    const at = row?.dataset.rowKey !== undefined ? (index.get(row.dataset.rowKey) ?? -1) : -1;
    const to = listKeyTarget(e.key, { index: at, page, pages, perPage, total, arrows, ...(starts ? { starts } : {}) });
    if (to === undefined) return;
    e.preventDefault();
    if (to !== null) goToIndex(to);
  };
  const regionProps: RegionProps = range ? { "data-ws-region": o.region ?? "list", "data-per": perPage ?? undefined, "data-page": page, "data-pages": pages, "data-total": total, ...(cut !== null ? { "data-starts": cut } : {}) } : {};
  const rangeId = o.rangeId ?? `${testId}-range`;
  const rowProps = (row: T, o?: RowPropsOptions): RowProps => {
    const key = keyOf(row);
    return rowAttributes(key, range ? (index.get(key) ?? -1) : -1, total, o);
  };
  const positionProps = (row: T): PositionProps => (range ? positionAttributes(index.get(keyOf(row)) ?? -1, total) : {});
  const pagerProps: PagerProps = {
    layout: "inline",
    label: o.label ?? `${capital(words.one)} pages`,
    page: range ? page : 1,
    pages: range ? pages : 1,
    onPage: turn,
    range: rangeText(words, range, pages, total),
    widest: `${total}–${total} of ${total}`,
    rangeId,
    prevLabel: "Previous page",
    nextLabel: "Next page",
    live,
    testId: `${testId}-pager`,
    prevTestId: `${testId}-prev`,
    nextTestId: `${testId}-next`,
  };
  return { perPage, starts: range ? starts : null, pageOf: pageOfRow, measuring, paged: range !== null, page, pages, range, offset, shown, turn, live, goToIndex, focusKey, onListKeyDown, regionProps, listProps: workspace ? { "aria-describedby": rangeId } : {}, rowProps, positionProps, pagerProps, listRef, footRef, cardRef, footTestId: `${testId}-foot` };
}

/**
 * A paged list's footer in the workspace (WorkspaceFoot: drawn in the workspace only, at the card's
 * foot): `leading` first (a legend, a coverage line: it gives way before the pager does), then the
 * range and the inline Pager at the right. From the list's usePagedRows (or usePagedGrid) result:
 * `<PagedFooter footRef={list.footRef} pager={list.pagerProps} testId={list.footTestId} />`.
 */
export function PagedFooter({ footRef, pager, leading, className, testId }: { footRef: React.Ref<HTMLDivElement>; pager: PagerProps; leading?: React.ReactNode; className?: string; testId?: string }) {
  return (
    <WorkspaceFoot ref={footRef} testId={testId} className={className}>
      {leading}
      <Pager {...pager} />
    </WorkspaceFoot>
  );
}
