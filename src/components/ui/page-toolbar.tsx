"use client";

import * as React from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/cn";

/*
  A page's controls always in reach (PR 2b; docs/DESIGN_SYSTEM.md → The navigation contract).

  A long page's own controls (its view switch, Filters, search) sit in its header and scroll away
  with it. From md, once the section tabs are pinned (TabBar's sticky row) and the page's own
  toolbar has gone up under them, the page's compact copy of those controls shows at the pinned
  row's end (`PageToolbar`, rendered by the page, drawn into the row's slot), so they are one press
  away however far down the page is; back up at the toolbar, the copy goes. On phones (and in a
  short window as wide as a tablet, where nothing is pinned) the top bar offers Filters instead,
  once the page's own Filters has scrolled up under it (MobileNav, from the same registration).

  Small stores tie the parts together, each holding one value at a time on a page:
    - the pinned row's slot: the sticky TabBar of the page (Team's, Resources', Platform Settings'
      or a profile's) publishes the element at its row's end and whether it is pinned now;
    - the page's filters: the page's FilterBar publishes how to open its sheet, its count and its
      summary, and its own element (whose place says whether it has scrolled away);
    - how many pages' own toolbars are mounted (a shared part's fallback gives way to them), and
      where the page's list starts (`land`, for the sheet closed after a change).
  A control in the row is drawn only while it shows, so nothing hidden stays focusable; while the
  focus is in it, it stays, as the bars of a short window do.
*/

type Listener = () => void;

function store<T>(initial: T) {
  let value = initial;
  const listeners = new Set<Listener>();
  return {
    get: () => value,
    set(next: T) {
      if (Object.is(next, value)) return;
      value = next;
      for (const l of listeners) l();
    },
    subscribe(l: Listener) {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
  };
}

/** The pinned row's slot: where the compact controls go, the bar it belongs to, and whether that bar is pinned now. */
export interface ToolbarSlot {
  el: HTMLElement;
  bar: HTMLElement;
  stuck: boolean;
}
const slotStore = store<ToolbarSlot | null>(null);

/** Called by a sticky TabBar: its slot, or null when it goes; `bar` is the pinned nav. */
export function publishToolbarSlot(next: ToolbarSlot | null, owner: HTMLElement | null) {
  const now = slotStore.get();
  // Only the bar that owns the slot clears it (a page leaving after the next one arrived must not).
  if (!next && now && now.el !== owner) return;
  slotStore.set(next);
}

export function useToolbarSlot(): ToolbarSlot | null {
  return React.useSyncExternalStore(slotStore.subscribe, slotStore.get, () => null);
}

/** Where the page's filters can be opened from: the page's FilterBar (one a page), as it is now. */
export interface PageFilters {
  /** Opens the sheet; `from` says what asked (the pinned row's control, the top bar's), so closing it after a change brings the list's start into view. */
  open: (from: "toolbar" | "topbar") => void;
  /** Whether the sheet is open, and what opened it: that control stays until the sheet has handed it the focus back. */
  openedFrom: "own" | "toolbar" | "topbar" | null;
  count: number;
  /** What the bar narrows from md, where a list's own choices are its toolbar's (FilterBar's `inlineReset`): the pinned row's count. */
  wideCount: number;
  summary: string;
  /** What the bar chooses from md, in words (the list's own choices left out, as from `wideCount`): the pinned row's name. */
  wideSummary: string;
  /** The bar's own element: once it has gone up under what is pinned, the copies show. */
  root: HTMLElement;
}
const filtersStore = store<PageFilters | null>(null);

export function publishPageFilters(next: PageFilters | null, owner: HTMLElement | null) {
  const now = filtersStore.get();
  if (!next && now && now.root !== owner) return;
  filtersStore.set(next);
}

export function usePageFilters(): PageFilters | null {
  return React.useSyncExternalStore(filtersStore.subscribe, filtersStore.get, () => null);
}

/**
 * Where the page's list starts (its first item), for the sheet closed after a change, as each
 * mounted PageToolbar names it (`land`): the page's own outranks a shared part's fallback, whatever
 * order their effects ran in.
 */
const landings: Array<{ find: () => Element | null; fallback: boolean }> = [];

/** The page's list's first item, as its PageToolbar names it (null: none named, or none on the page now). */
export function landTarget(): Element | null {
  const named = [...landings].reverse().find((l) => !l.fallback) ?? landings.at(-1);
  return named?.find() ?? null;
}

/**
 * Whether `el` has gone up out of view under what is pinned above the page (`top`, in px): its
 * bottom edge at or above that line. Below the window (not reached yet) does not count. Watched again
 * when `top` changes (the pinned stack follows the window: a tablet's top bar and the tabs).
 */
export function useScrolledAway(target: HTMLElement | React.RefObject<HTMLElement | null> | null, top: number | null): boolean {
  // The observer's last answer, for the target (and line) it was about: a new target, such as the
  // next page's filter bar, starts as not away until its own observer has answered.
  const [seen, setSeen] = React.useState<{ of: typeof target; at: number; away: boolean } | null>(null);
  React.useEffect(() => {
    const el = target && "current" in target ? target.current : target;
    if (!el || top === null) return;
    const line = Math.max(0, Math.round(top));
    const observer = new IntersectionObserver(
      (entries) => {
        // The newest entry: a late callback carries every change since the last, oldest first (#323).
        const entry = entries[entries.length - 1];
        if (!entry) return;
        // An element with no box (hidden at this width) is never away: there is nothing to scroll back to.
        const box = entry.boundingClientRect;
        setSeen({ of: target, at: top, away: !entry.isIntersecting && box.height > 0 && box.bottom <= line + 1 });
      },
      { rootMargin: `-${line}px 0px 0px 0px`, threshold: [0] },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      // No longer watched (unpinned, another target): the next watch starts as not away.
      setSeen(null);
    };
  }, [target, top]);
  return target !== null && top !== null && !!seen && seen.of === target && seen.at === top && seen.away;
}

/**
 * Keeps a frame control drawn while it is in use after what shows it has gone (its toolbar back in
 * view, the page shortened by a filter): from a press or the focus on it (`grab`), while the sheet it
 * opened is open (`sheetOpen`), and until that sheet has handed the focus back as it closes (it does
 * on the next frame). Let go when the focus moves on to the page (`onBlur`; a move into the sheet it
 * opened does not count), or, once it is not wanted, when the focus is not in it two frames after
 * any render (a focused button removed by its own press, as a search's Clear, sends no blur, and
 * changes nothing this hook watches: the page's render after it does). `el`: the control or its group.
 */
export function useHeld(el: React.RefObject<HTMLElement | null>, wanted: boolean, sheetOpen: boolean) {
  const [held, setHeld] = React.useState(false);
  // After every render, not only when these change: see above.
  React.useEffect(() => {
    if (!held || wanted || sheetOpen) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        if (!el.current?.contains(document.activeElement)) setHeld(false);
      });
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  });
  const grab = React.useCallback(() => setHeld(true), []);
  const onBlur = React.useCallback(
    (e: React.FocusEvent) => {
      const next = e.relatedTarget as Element | null;
      if (el.current?.contains(next) || next?.closest?.("dialog")) return;
      setHeld(false);
    },
    [el],
  );
  return { held, grab, onBlur };
}

/** The pinned stack's foot, in px from the window's top: the pinned bar's sticky offset (a tablet's top bar) and its height. */
function useStackFoot(bar: HTMLElement | null): number | null {
  const [foot, setFoot] = React.useState<{ bar: HTMLElement; px: number } | null>(null);
  React.useEffect(() => {
    if (!bar) return;
    const measure = () => setFoot({ bar, px: (parseFloat(getComputedStyle(bar).top) || 0) + bar.offsetHeight });
    // A resize observer answers once as it starts watching, and again whenever the bar's size changes.
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [bar]);
  return bar && foot?.bar === bar ? foot.px : null;
}

/** How many pages' own toolbars are mounted (a fallback shows only while there is none). */
const mains = store(0);

/** The pinned row's width below which compact controls show their icons alone (a tablet, a laptop with the sidebar open). */
export const COMPACT_LABEL = "@max-[56rem]/tabrow:sr-only";

/** A compact control's look: one height in the pinned row (32px with a mouse, 38px on touch screens, with a 44px target). */
export const COMPACT_CONTROL = "h-8 pointer-coarse:h-9.5";

/**
 * A page's own action as a chip in the pinned row (Team Matches' Bookmarked): a link that replaces the
 * history entry, as the filter it is; the row's height, lit while on; its icon (`children`), its label
 * where the row has room (else read out) and a count.
 */
export function ToolbarChip({ href, on, label, count, children, testId }: { href: string; on: boolean; label: string; count?: number; children?: React.ReactNode; testId?: string }) {
  return (
    <Link
      href={href}
      replace
      // A filter: the page keeps its place, as the original keeps it (the copy is only ever pressed far down).
      scroll={false}
      aria-current={on ? "page" : undefined}
      title={label}
      className={cn(
        "touch-target inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent",
        COMPACT_CONTROL,
        on ? "border-accent bg-accent/15 text-fg" : "border-border text-fg-muted hover:border-border-strong hover:text-fg",
      )}
      data-testid={testId}
    >
      {children}
      <span className={COMPACT_LABEL}>{label}</span>
      {count ? <span className="tabular-nums">{count}</span> : null}
    </Link>
  );
}

/**
 * A page's search in the pinned row (SearchInput's `className`): 12rem, 8rem where the row is narrow;
 * with a mouse the field 32px and its clear button 28px; on a touch screen the field keeps every
 * field's 44px (and 16px text) and its clear button its own 40px, the field's negative margins
 * keeping the row's height (the pinned row is 44px on touch screens, its tabs included).
 */
export const COMPACT_SEARCH = "w-48 shrink-0 @max-[56rem]/tabrow:w-32 [&_input]:h-8 pointer-fine:[&_button]:h-7 pointer-fine:[&_button]:w-7 pointer-coarse:-my-1 pointer-coarse:[&_input]:h-11";

/**
 * A page's compact controls, shown at the pinned section tabs' end once the row is pinned and the
 * page's own toolbar (`anchor`; the page's FilterBar when not given) has gone up under it, from md;
 * never in a short window (nothing is pinned there). `children`: the compact controls (SubTabs
 * `size="compact"`, `FiltersControl`, a compact search, a page's own action), in the order they
 * read in the page's toolbar.
 */
export function PageToolbar({ anchor, land, fallback = false, label = "This page's controls", children }: {
  anchor?: React.RefObject<HTMLElement | null>;
  /** The list's first item, brought under what is pinned when the Filters sheet closes after a change (a selector: the first match on the page with a size). */
  land?: string;
  /** A shared part's own (OverviewFilters' Filters alone), shown only where the page registers none of its own. */
  fallback?: boolean;
  label?: string;
  children: React.ReactNode;
}) {
  const slot = useToolbarSlot();
  // A page's own toolbar outranks a shared part's fallback.
  React.useEffect(() => {
    if (fallback) return;
    mains.set(mains.get() + 1);
    return () => mains.set(mains.get() - 1);
  }, [fallback]);
  const outranked = React.useSyncExternalStore(mains.subscribe, mains.get, () => 0) > 0 && fallback;
  React.useEffect(() => {
    if (!land) return;
    const entry = { find: () => [...document.querySelectorAll(land)].find((el) => el.getBoundingClientRect().height > 0) ?? null, fallback };
    landings.push(entry);
    return () => {
      const at = landings.indexOf(entry);
      if (at >= 0) landings.splice(at, 1);
    };
  }, [land, fallback]);
  const filters = usePageFilters();
  // The page's own toolbar: its element as the page names it, else its filter bar's.
  const foot = useStackFoot(slot?.stuck ? slot.bar : null);
  const away = useScrolledAway(slot?.stuck ? (anchor ?? filters?.root ?? null) : null, foot);
  const wanted = !!slot?.stuck && away;
  // In use, the controls stay: while the focus or a press is in them, while the sheet their Filters
  // opened is open, and until it has handed the focus back (useHeld).
  const group = React.useRef<HTMLDivElement>(null);
  const sheetOpen = filters?.openedFrom === "toolbar";
  const { held, grab, onBlur } = useHeld(group, wanted, sheetOpen);
  const shown = !!slot && !outranked && (wanted || held || sheetOpen);
  if (!slot || !shown) return null;
  return createPortal(
    <div ref={group} role="group" aria-label={label} className="flex items-center gap-2" onFocus={grab} onPointerDown={grab} onBlur={onBlur} data-page-toolbar="" data-testid="page-toolbar">
      {children}
    </div>,
    slot.el,
  );
}

/**
 * Filters in the pinned row: the page's FilterBar's sheet, opened here at any width in its sheet
 * form; "Filters", the number of narrowed filters, and what is chosen for screen readers, as the
 * folded button on a phone.
 */
export function FiltersControl() {
  const filters = usePageFilters();
  if (!filters) return null;
  return (
    <button
      type="button"
      onClick={() => filters.open("toolbar")}
      aria-haspopup="dialog"
      className={cn(
        "touch-target inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 text-sm font-medium transition-colors",
        COMPACT_CONTROL,
        filters.wideCount > 0 ? "border-accent/60 bg-accent/10 text-fg" : "border-border-control bg-bg-elevated text-fg-muted hover:border-fg-subtle hover:text-fg",
      )}
      data-testid="toolbar-filters"
    >
      <SlidersHorizontal className="h-4 w-4 shrink-0 text-accent" aria-hidden />
      <span className={COMPACT_LABEL}>Filters</span>
      <span className="sr-only">: {filters.wideSummary}</span>
      {filters.wideCount ? <span className="rounded-full bg-accent px-1.5 text-xs font-semibold tabular-nums text-bg">{filters.wideCount}</span> : null}
    </button>
  );
}
