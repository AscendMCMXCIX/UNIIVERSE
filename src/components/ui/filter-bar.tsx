"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { RotateCcw, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { focusInSlidingBar, scrollToStart } from "@/lib/screen";
import { Button } from "./button";
import { DetailModal, useModalClose } from "./detail-modal";
import { Popover } from "./popover";
import { useWindowPosture } from "./posture";
import { ScrollRow } from "./scroll-row";
import { landTarget, publishPageFilters } from "./page-toolbar";

/*
  The one filter bar. Every list that can be narrowed (Players, a profile's statistics, Match
  History, Leaderboards, Matches, Resources) behaves the same way:
    - Search, when there is one, comes first and is never folded away.
    - From the breakpoint up, the filters sit inline on one row, 36px tall with a mouse and 44px on
      touch screens, labelled for screen readers (each control says what it holds: "All roles", "Any patch").
    - Below it (phones), one compact "Filters" button with the count of narrowed filters, followed
      by those filters as chips that remove themselves with a tap, so what is narrowed is always in
      view and the content starts on the first screen. The button opens every filter in a sheet
      from the bottom edge, within reach of the thumb, each with its visible label; Reset and Done
      at its foot. The page's own line above says what is counted (the scope line), so the button
      does not repeat it.
    - "Reset" appears only when something is narrowed and puts every filter back to its default.
    - Choices apply at once (no Apply button); the page shows a pending state meanwhile.
    - Once the bar has scrolled away, its sheet opens from the frame too (PR 2b, ui/page-toolbar.tsx):
      the pinned row's Filters from md, the top bar's on phones. The bar publishes how to open it
      (one bar a page). Opened that way it is the sheet at every width, its fields in their sheet
      form (labels shown, the whole width, a page's Refine fields in place: useInFilterSheet), while
      the inline row keeps its size in the page; closed after a change, the list's start comes into
      view under what is pinned (the page's PageToolbar names it; else the bar itself), unless the
      reader has moved on first (scrolled, pressed, typed, stepped Back or Forward).
  Pages decide which filters they need; the bar decides how they look and behave.
*/

/** md, lg, or "phone": folded on every phone, upright and held sideways (below md, and in a window 480px tall or less: one filter interface on phones, UM.P1/X3). */
type Breakpoint = "md" | "lg" | "phone";

// Static class strings per breakpoint (Tailwind only sees whole class names). `searchCompact`: the
// search starts from 9rem instead of 16rem (a `compact` bar), and grows into what the filters leave.
const AT: Record<Breakpoint, { row: string; toggle: string; controls: string; search: string; searchCompact: string; label: string; field: string }> = {
  md: {
    row: "md:flex-row md:flex-wrap md:items-center",
    toggle: "md:hidden",
    controls: "md:flex md:flex-row md:flex-wrap md:items-center",
    search: "md:w-auto md:max-w-sm md:flex-[1_1_16rem]",
    searchCompact: "md:w-auto md:max-w-sm md:flex-[1_1_9rem]",
    label: "md:sr-only",
    field: "md:w-auto",
  },
  lg: {
    row: "lg:flex-row lg:flex-wrap lg:items-center",
    toggle: "lg:hidden",
    controls: "lg:flex lg:flex-row lg:flex-wrap lg:items-center",
    search: "lg:w-auto lg:max-w-sm lg:flex-[1_1_16rem]",
    searchCompact: "lg:w-auto lg:max-w-sm lg:flex-[1_1_9rem]",
    label: "lg:sr-only",
    field: "lg:w-auto",
  },
  phone: {
    row: "md:not-short:flex-row md:not-short:flex-wrap md:not-short:items-center",
    toggle: "md:not-short:hidden",
    controls: "md:not-short:flex md:not-short:flex-row md:not-short:flex-wrap md:not-short:items-center",
    search: "md:not-short:w-auto md:not-short:max-w-sm md:not-short:flex-[1_1_16rem]",
    searchCompact: "md:not-short:w-auto md:not-short:max-w-sm md:not-short:flex-[1_1_9rem]",
    label: "md:not-short:sr-only",
    field: "md:not-short:w-auto",
  },
};
/** The same breakpoints for the bar's own layout (static class lists, which Tailwind reads whole). */
const INLINE: Record<Breakpoint, { contents: string; gap: string; end: string; endJustify: string }> = {
  md: { contents: "md:contents", gap: "md:gap-2", end: "md:ml-auto", endJustify: "md:ml-auto md:justify-end" },
  lg: { contents: "lg:contents", gap: "lg:gap-2", end: "lg:ml-auto", endJustify: "lg:ml-auto lg:justify-end" },
  phone: { contents: "md:not-short:contents", gap: "md:not-short:gap-2", end: "md:not-short:ml-auto", endJustify: "md:not-short:ml-auto md:not-short:justify-end" },
};

const FoldContext = React.createContext<Breakpoint>("md");
/** Inside the Filters sheet, at any width. */
const SheetContext = React.createContext(false);

/** Whether a field is in the Filters sheet (it then takes its sheet form at every width: labels shown, the whole width, Refine's fields in place). */
export function useInFilterSheet(): boolean {
  return React.useContext(SheetContext);
}

/** For a bar's children made by the page that renders the bar: told whether they are drawn in the sheet. */
export function InFilterSheet({ children }: { children: (inSheet: boolean) => React.ReactNode }) {
  return <>{children(useInFilterSheet())}</>;
}

/** Whether the window is md or wider (48rem, as the md: breakpoint): what the sheet holds of a list's own choices. */
const WIDE_QUERY = "(min-width: 48rem)";
function subscribeWide(change: () => void) {
  const query = window.matchMedia(WIDE_QUERY);
  query.addEventListener("change", change);
  return () => query.removeEventListener("change", change);
}
const isWide = () => window.matchMedia(WIDE_QUERY).matches;
const notWide = () => false;

/** What the reader does next that ends the wait for a change to land (as profile-tabs.tsx's), and a step Back or Forward. */
const READER_INPUT = ["wheel", "touchstart", "pointerdown", "keydown", "popstate"] as const;

/** How long after the sheet closes a change still brings the list's start into view (a slow page). */
const LAND_WITHIN_MS = 8_000;

/** A narrowed filter shown as a chip beside the folded Filters button: a tap removes it (clear) or follows its link (href). */
export interface FilterChip {
  key: string;
  text: string;
  clear?: () => void;
  href?: string;
}

export function FilterBar({
  summary,
  activeCount = 0,
  onReset,
  resetHref,
  search,
  compact = false,
  foldBelow = "md",
  align = "start",
  pending = false,
  testId,
  toggleTestId = "filter-toggle",
  children,
  after,
  className,
  resetLabel = "Reset",
  chips = [],
  end,
  compactToggle = false,
  inlineReset,
  toggleOnPhones,
}: {
  /** What is chosen, in a few words ("Season 2026 · All supported games"): the sheet's subtitle, and read with the folded button. */
  summary: string;
  /** How many filters differ from their default: shown as a count, and enables Reset. */
  activeCount?: number;
  onReset?: () => void;
  resetHref?: string;
  /** A search box (SearchInput), kept visible at every size. */
  search?: React.ReactNode;
  /**
   * A bar with several filters (Players), kept to one row inline: the search starts from 9rem rather
   * than 16rem and grows into what the filters leave, and below xl Reset shows its icon only (its
   * name kept for screen readers; in the sheet it keeps its word).
   */
  compact?: boolean;
  /** Below this breakpoint the filters fold behind the Filters button and its sheet. */
  foldBelow?: Breakpoint;
  /** Where the inline filters sit from the breakpoint up. */
  align?: "start" | "end";
  pending?: boolean;
  testId?: string;
  toggleTestId?: string;
  children: React.ReactNode;
  /** Shown under the bar at every size (e.g. removable chips for the active refinements on wide screens). */
  after?: React.ReactNode;
  className?: string;
  /** The reset action's wording ("Clear filters"). */
  resetLabel?: string;
  /** The narrowed filters, as chips beside the folded button (phones). */
  chips?: readonly FilterChip[];
  /** Beside the folded button at the row's far end (phones): a page's own action, such as Bookmarked. */
  end?: React.ReactNode;
  /**
   * A folded bar that shares its row with a section's views (Match History): under 360px the Filters
   * button shows its icon alone (its word, the summary and the count stay for screen readers), and no
   * empty room follows it when there is no chip and no `end`, so the views, Filters and Refresh keep
   * one row on a 320px phone. Other bars are unchanged.
   */
  compactToggle?: boolean;
  /**
   * What the bar is from md, where a phone's sheet also holds choices that wider screens keep elsewhere
   * (Encounters' minimum and order, in its list's toolbar): from md they are not this bar's, so they
   * count, reset and are named only below md (the folded Filters button, the sheet there, a phone's
   * top bar). `count` and `summary` are the bar's own from md: the inline row's Reset counts `count`,
   * as do the pinned row's Filters and a sideways phone's top bar, which read `summary` out, and so
   * does the sheet while the window is 768px or wider (its subtitle `summary`). Its Reset, `onReset`,
   * leaves the list's choices as they are.
   */
  inlineReset?: { count: number; summary: string; onReset: () => void };
  /**
   * Phones (below sm): the folded Filters button is drawn in `host`, a place in the list's own row
   * (All Champions' search and sort row), so it never takes a row of its own (PLAN §S2b). There it
   * shows its icon, with the count on its corner, its word and the summary kept for screen readers.
   * The bar, its chips and its sheet stay where they are (the sheet is in the top layer). `host` is
   * null until the page has measured that it is a phone: meanwhile the button is not drawn below sm
   * (the host keeps its room), so the page never moves as it starts. From sm the button stays here.
   */
  toggleOnPhones?: { host: HTMLElement | null };
}) {
  // Who opened the sheet: its own Filters button (phones), or the frame once the bar has scrolled away.
  const [openedFrom, setOpenedFrom] = React.useState<"own" | "toolbar" | "topbar" | null>(null);
  const open = openedFrom !== null;
  const from = React.useRef(openedFrom);
  const id = React.useId();
  const at = AT[foldBelow];
  const rootRef = React.useRef<HTMLDivElement>(null);
  const controlsRef = React.useRef<HTMLDivElement>(null);
  // The inline row's size while its fields are in the sheet, so nothing in the page moves.
  const [kept, setKept] = React.useState<{ width: number; height: number } | null>(null);
  // What was chosen when the sheet opened, and when to bring the list's start into view after it closes.
  const now = React.useRef({ summary, activeCount });
  React.useLayoutEffect(() => {
    now.current = { summary, activeCount };
    from.current = openedFrom;
  });
  const atOpen = React.useRef({ summary, activeCount });
  // A choice was made in the sheet (a field changed, a control pressed, Reset): only then may closing
  // it bring the list's start into view.
  const chose = React.useRef(false);
  const [landBy, setLandBy] = React.useState<number | null>(null);
  // Opened with the focus in a phone's top bar (its Filters, tapped or reached with the keys; a tap
  // focuses no button in Safari): closing, the sheet hands the focus back there (DetailModal), and
  // the bar keeps its sliding row while it has the focus, so the list lands under the whole bar.
  const rowStays = React.useRef(false);
  // From md (the pinned row's sheet, a phone held sideways) the sheet holds the bar's own fields only:
  // a list's own choices (`inlineReset`) are its toolbar's there (their fields md:hidden), so the sheet
  // counts, names and resets what the bar narrows. Followed live, as the fields are: a phone turned, or
  // a window resized, with the sheet open.
  const wide = React.useSyncExternalStore(subscribeWide, isWide, notWide);
  // Pointer and posture decide (posture.ts): a screen that opens previews beside the list gets the
  // Filters as a popover under the button that opened it (the pinned row's, or the bar's own where it
  // is folded); a touch phone, or a window that small, and a sideways phone's top bar keep the sheet.
  const windowed = useWindowPosture();
  const ownRef = React.useRef<HTMLButtonElement>(null);
  const asPopover = open && !windowed && openedFrom !== "topbar";
  // Who opened it, as it opens (before the layout effect above has caught up): what the popover hangs from.
  const openedBy = React.useRef<"own" | "toolbar" | "topbar" | null>(null);
  const anchor = React.useCallback(() => (openedBy.current === "own" ? ownRef.current : document.querySelector<HTMLElement>("[data-testid=toolbar-filters]")), []);
  const openSheet = React.useCallback((from: "own" | "toolbar" | "topbar") => {
    const row = controlsRef.current;
    setKept(row && row.offsetHeight ? { width: row.offsetWidth, height: row.offsetHeight } : null);
    atOpen.current = now.current;
    chose.current = false;
    rowStays.current = focusInSlidingBar();
    setLandBy(null);
    openedBy.current = from;
    setOpenedFrom(from);
  }, []);
  const closeSheet = React.useCallback(() => {
    // Opened from the frame far down the page, and a choice made in it: once the change has arrived,
    // within LAND_WITHIN_MS, the list starts again in view. Closed unchanged, nothing is armed.
    const was = atOpen.current;
    const changed = chose.current || was.summary !== now.current.summary || was.activeCount !== now.current.activeCount;
    if ((from.current === "toolbar" || from.current === "topbar") && changed) setLandBy(Date.now() + LAND_WITHIN_MS);
    // Opened from its own button, which a phone turned (or a text size's reflow) has since redrawn
    // elsewhere (toggleOnPhones): the window hands the focus back to the button it saved, now gone
    // from the page, so the focus would fall to the page. After its hand-back, to the button as it is.
    if (from.current === "own")
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const now = document.activeElement;
          if ((!now || now === document.body || !now.isConnected) && ownRef.current?.isConnected) ownRef.current.focus({ preventScroll: true });
        }),
      );
    setOpenedFrom(null);
  }, []);
  const choose = React.useCallback(() => {
    chose.current = true;
  }, []);
  // No history entry of their own: a choice in them replaces the page's query (router.replace), and
  // an entry pushed under it would make Back, a close during a pending choice, or a link pressed
  // with them open restore the old address and cancel the change (review of 20 Nov 2026). Android's
  // Back closes the sheet as any open dialog's close request; the popover closes on Escape, a press
  // outside and Done.
  const closePopover = React.useCallback(
    (restoreFocus: boolean) => {
      const back = anchor();
      closeSheet();
      if (restoreFocus) requestAnimationFrame(() => back?.isConnected && back.focus({ preventScroll: true }));
    },
    [anchor, closeSheet],
  );
  // One bar a page tells the frame how to open its sheet, and whether its sheet is open and from where
  // (ui/page-toolbar.tsx: the control that opened it stays until it has the focus back).
  // From md a list's own choices are not this bar's (`inlineReset`): the pinned row's Filters counts and names what the bar narrows there.
  const wideCount = inlineReset ? inlineReset.count : activeCount;
  const wideSummary = inlineReset ? inlineReset.summary : summary;
  React.useEffect(() => {
    const root = rootRef.current;
    if (root) publishPageFilters({ open: openSheet, openedFrom, count: activeCount, wideCount, summary, wideSummary, root }, root);
  }, [openSheet, openedFrom, activeCount, wideCount, summary, wideSummary]);
  React.useEffect(() => {
    const root = rootRef.current;
    return () => publishPageFilters(null, root);
  }, []);
  // The list's start under what is pinned, once the change has arrived. Until then it is disarmed when
  // the time is up, or by the reader's next scroll, press or key, or a step Back or Forward (a change
  // made any other way starts with one of these; captured, so no handler can hide it), so a later
  // change keeps the place as every change does. Done's and Escape's own events come before the close.
  React.useEffect(() => {
    if (landBy === null || open) return;
    const was = atOpen.current;
    const changed = was.summary !== summary || was.activeCount !== activeCount;
    const left = landBy - Date.now();
    if (pending || !changed || left < 0) {
      const disarm = () => setLandBy(null);
      const t = window.setTimeout(disarm, Math.max(0, left));
      for (const type of READER_INPUT) window.addEventListener(type, disarm, { capture: true, passive: true });
      return () => {
        window.clearTimeout(t);
        for (const type of READER_INPUT) window.removeEventListener(type, disarm, { capture: true });
      };
    }
    setLandBy(null);
    land(landTarget() ?? rootRef.current, rowStays.current);
  }, [landBy, open, pending, summary, activeCount]);
  const resetCls = "inline-flex min-h-11 items-center justify-center gap-1 rounded-md px-2 text-sm font-medium text-accent hover:bg-accent/10 md:pointer-fine:min-h-9";
  // Inline in a compact bar, below xl: the icon alone, as wide as it is tall.
  const iconOnly = (inSheet: boolean) => compact && !inSheet;
  const resetBody = (inSheet: boolean) => (
    <>
      <RotateCcw className="h-3.5 w-3.5" aria-hidden /> <span className={iconOnly(inSheet) ? "max-xl:sr-only" : undefined}>{resetLabel}</span>
    </>
  );
  const resetClass = (inSheet: boolean) => cn(resetCls, inSheet && "mr-auto", iconOnly(inSheet) && "max-xl:min-w-11 md:pointer-fine:max-xl:min-w-9");
  // The full Reset, or the inline one: in the page from the breakpoint up, and in the sheet from md.
  const fullReset = (inSheet: boolean) => !inlineReset || (inSheet && !wide);
  const reset = (inSheet: boolean) =>
    (fullReset(inSheet) ? activeCount : inlineReset!.count) > 0 && (onReset || resetHref) ? (
      resetHref ? (
        <Link
          href={resetHref}
          replace
          scroll={false}
          className={resetClass(inSheet)}
          title={iconOnly(inSheet) ? resetLabel : undefined}
          data-testid="reset-filters"
          onClick={
            inSheet
              ? () => {
                  choose();
                  closeSheet();
                }
              : undefined
          }
        >
          {resetBody(inSheet)}
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => {
            if (inSheet) choose();
            (fullReset(inSheet) ? onReset : inlineReset!.onReset)?.();
          }}
          className={resetClass(inSheet)}
          title={iconOnly(inSheet) ? resetLabel : undefined}
          data-testid="reset-filters"
        >
          {resetBody(inSheet)}
        </button>
      )
    ) : null;
  // Drawn in the page's own row on a phone (toggleOnPhones): its icon alone, the count on its corner.
  const hosted = !!toggleOnPhones?.host;
  const filtersButton = (
    <button
      ref={ownRef}
      type="button"
      onClick={() => openSheet("own")}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls={open ? id : undefined}
      className={toolbarButtonClass(activeCount > 0, cn(hosted ? cn("relative w-11 px-0 transition-opacity motion-reduce:transition-none", pending && "opacity-60") : at.toggle, !hosted && toggleOnPhones && "max-sm:hidden", compactToggle && "max-[22.5rem]:min-w-11 max-[22.5rem]:px-2.5"))}
      data-testid={toggleTestId}
      data-filter-toggle=""
    >
      <SlidersHorizontal className="h-4 w-4 shrink-0 text-accent" aria-hidden />
      {hosted ? (
        <span className="sr-only">Filters: {summary}</span>
      ) : (
        <>
          {compactToggle ? <span className="max-[22.5rem]:sr-only">Filters</span> : "Filters"}
          <span className="sr-only">: {summary}</span>
        </>
      )}
      {activeCount ? (
        <span className={cn("rounded-full bg-accent px-1.5 text-xs font-semibold tabular-nums text-bg", hosted && "absolute -right-1.5 -top-1.5 min-w-5 text-center leading-5")} data-testid="filter-count">
          {activeCount}
        </span>
      ) : null}
    </button>
  );
  // On a phone, in the page's row instead of here (one button: the sheet hands the focus back to it).
  const toggleHere = hosted ? null : filtersButton;
  return (
    <FoldContext.Provider value={foldBelow}>
      <div ref={rootRef} className={cn("flex min-w-0 flex-col gap-2 transition-opacity motion-reduce:transition-none", pending && "opacity-60", className)} data-testid={testId} data-filter-bar="" aria-busy={pending || undefined}>
        <div className={cn("flex min-w-0 flex-col gap-2", at.row, align === "end" && !search && "justify-end")}>
          {/* Folded (phones): the search and Filters share the first row; what is narrowed follows as
              chips, then the page's own action. From the breakpoint up the wrapper steps aside
              (display: contents) and the search sits in the bar's row as before. */}
          {search ? (
            // Folded and narrower than 21rem (a phone from 125% text), the search takes a line of its own, so its words are never cut ("Searc…"; UM.P1).
            <div className={cn("@container/fbar flex min-w-0 flex-wrap items-center gap-2 [&>:first-child]:@max-[21rem]/fbar:basis-full", INLINE[foldBelow].contents)}>
              <div className={cn("w-full min-w-0 flex-1", compact ? at.searchCompact : at.search)}>{search}</div>
              {toggleHere}
            </div>
          ) : null}
          {!search || chips.length > 0 || end ? (
            // It wraps only when a larger text size leaves no room for Filters and the page's own
            // action side by side (the chips and the spacer take no room of their own: flex-1).
            // With the button in the page's row on a phone (toggleOnPhones), this row is the chips' alone, and none without chips.
            <div className={cn("flex min-w-0 flex-wrap items-center gap-2", at.toggle, toggleOnPhones && !chips.length && !end && "max-sm:hidden")}>
              {search ? null : toggleHere}
              {chips.length ? (
                <ScrollRow as="ul" className="-my-1 flex min-w-0 flex-1 gap-1.5 py-1" aria-label="Active filters" data-testid={testId ? `${testId}-chips` : undefined}>
                  {chips.map((c) => (
                    <li key={c.key} className="shrink-0">
                      {c.href ? (
                        <Link href={c.href} replace scroll={false} className={CHIP} aria-label={`${c.text}: remove this filter`}>
                          {c.text} <X className="h-3 w-3 text-fg-subtle" aria-hidden />
                        </Link>
                      ) : (
                        <button type="button" onClick={c.clear} className={CHIP} aria-label={`${c.text}: remove this filter`}>
                          {c.text} <X className="h-3 w-3 text-fg-subtle" aria-hidden />
                        </button>
                      )}
                    </li>
                  ))}
                </ScrollRow>
              ) : compactToggle && !end ? null : (
                <span className="flex-1" />
              )}
              {end}
            </div>
          ) : null}
          {/* Inline from the breakpoint up; while the sheet is open its fields live there instead (one
              copy of each field and its id), and an empty box of the row's size keeps its place. */}
          {open ? (
            kept ? <div aria-hidden className={cn("hidden min-w-0 flex-none", at.controls, align === "end" && INLINE[foldBelow].end)} style={{ width: kept.width, height: kept.height }} data-filter-placeholder="" /> : null
          ) : (
            <div ref={controlsRef} className={cn("hidden min-w-0 flex-col gap-3", at.controls, INLINE[foldBelow].gap, align === "end" && INLINE[foldBelow].endJustify)} data-testid={testId ? `${testId}-controls` : undefined} data-filter-controls="">
              {children}
              {reset(false)}
            </div>
          )}
        </div>
        {hosted ? createPortal(filtersButton, toggleOnPhones!.host!) : null}
        {after}
        {/* The sheet: a native dialog in the browser's top layer, so its place inside the bar changes
            nothing on screen, and the bar's fields stay the bar's for whoever looks for them there. */}
        {asPopover ? (
          <Popover
            anchor={anchor}
            onClose={closePopover}
            title="Filters"
            description={inlineReset && wide ? wideSummary : summary}
            testId={testId ? `${testId}-sheet` : "filter-sheet"}
            closeTestId="filter-sheet-close"
            footer={
              <>
                {reset(true)}
                <Button variant="primary" onClick={() => closePopover(true)} className="min-w-24" data-testid="filter-sheet-done">
                  Done
                </Button>
              </>
            }
          >
            <SheetContext.Provider value>
              <div id={id} className={cn("flex min-w-0 flex-col gap-4 transition-opacity [&_select]:w-full", pending && "opacity-60")} onChangeCapture={choose} onClickCapture={choose} data-testid={testId ? `${testId}-controls` : undefined} data-filter-controls="" aria-busy={pending || undefined}>
                {children}
              </div>
            </SheetContext.Provider>
          </Popover>
        ) : open ? (
          <DetailModal
            open
            onClose={closeSheet}
            size="sheet"
            sheetWidth="filters"
            title="Filters"
            description={inlineReset && wide ? wideSummary : summary}
            testId={testId ? `${testId}-sheet` : "filter-sheet"}
            closeTestId="filter-sheet-close"
            footer={
              <>
                {reset(true)}
                <SheetDone />
              </>
            }
          >
            {/* The sheet's form at every width: each field labelled and as wide as the sheet (FilterField; a select sized for the inline row too). */}
            <SheetContext.Provider value>
              <div id={id} className={cn("flex min-w-0 flex-col gap-4 transition-opacity [&_select]:w-full", pending && "opacity-60")} onChangeCapture={choose} onClickCapture={choose} data-testid={testId ? `${testId}-controls` : undefined} data-filter-controls="" aria-busy={pending || undefined}>
                {children}
              </div>
            </SheetContext.Provider>
          </DetailModal>
        ) : null}
      </div>
    </FoldContext.Provider>
  );
}

/**
 * Brings the list's first item to the top, under what is pinned (the page's scroll padding: the
 * phone's top bar, the pinned tabs, and a phone's sliding bar row as it comes back: scrollToStart),
 * and under anything else pinned over its start (All Champions' column headings, pinned under the tabs).
 * `rowStays`: the focus goes back into a phone's top bar as the sheet closes, and the bar keeps its row with it.
 * The top bar is scrollToStart's to clear, as it will be once landed: measured as it is now, its row
 * on its way out on a move down, it stopped the list a row lower than the bar would be (R6 review BX2).
 */
function land(target: Element | null, rowStays = false) {
  if (!target) return;
  if (target instanceof HTMLElement) scrollToStart(target, "instant", { rowStays });
  else target.scrollIntoView({ block: "start", behavior: "instant" });
  const at = target.getBoundingClientRect();
  const over = document.elementFromPoint(at.left + Math.min(16, at.width / 2), at.top + 1);
  if (!over || target.contains(over) || over.contains(target) || over.closest("[data-testid=mobile-topbar]")) return;
  const covered = over.getBoundingClientRect().bottom - at.top;
  // Whole pixels, rounded up: a bar at a fractional edge (the status bar's inset) would otherwise keep a hairline over the target.
  if (covered > 0) window.scrollBy({ top: -Math.ceil(covered + 0.5), behavior: "instant" });
}

/** Done, at the sheet's foot: closes it the way the close button does, with the sheet's motion. */
function SheetDone() {
  const close = useModalClose();
  return (
    <Button variant="primary" onClick={close} className="min-w-24" data-testid="filter-sheet-done">
      Done
    </Button>
  );
}

/** A narrowed filter beside the folded Filters button: a small pill with a finger-sized target. */
const CHIP = "touch-target inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-full border border-accent/40 bg-accent/10 px-2.5 text-xs font-medium text-fg hover:border-accent/70";

/**
 * The look of a button in a page's toolbar beside the filters (Refine, Refresh): the height of the
 * bar's fields (36px with a mouse, 44px on touch screens and phones), a visible edge, the label in
 * the secondary text colour until pointed at; lit in the accent while it is on (open, narrowed).
 */
export function toolbarButtonClass(on = false, className?: string): string {
  return cn(
    "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border px-3 text-sm font-medium transition-colors max-md:min-h-11 pointer-coarse:min-h-11 focus-visible:outline-2 focus-visible:outline-accent",
    on ? "border-accent/60 bg-accent/10 text-fg" : "border-border-control bg-bg-elevated text-fg-muted hover:border-fg-subtle hover:text-fg",
    className,
  );
}

/**
 * The button that opens further filters behind "Refine" (a profile's statistics, Match History, a
 * champion's window): one look everywhere, the size of the bar's other controls (36px with a mouse,
 * 44px on touch screens), highlighted while open or while any of its filters is narrowed, with
 * their count.
 */
export function RefineButton({ open, count = 0, controls, onClick, haspopup, buttonRef, className, testId, unavailable }: { open: boolean; count?: number; controls?: string; onClick: () => void; haspopup?: "dialog"; buttonRef?: React.Ref<HTMLButtonElement>; className?: string; testId?: string; /** Shown but off on a page whose list it cannot narrow (Encounters, UD.H4): still focusable, so its reason (aria-describedby) is reached. */ unavailable?: { describedBy: string } }) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={unavailable ? undefined : onClick}
      aria-expanded={unavailable ? undefined : open}
      aria-controls={unavailable ? undefined : controls}
      aria-haspopup={unavailable ? undefined : haspopup}
      aria-disabled={unavailable ? true : undefined}
      aria-describedby={unavailable?.describedBy}
      className={toolbarButtonClass(!unavailable && (open || count > 0), cn(unavailable && "cursor-not-allowed opacity-50 hover:border-border-control hover:text-fg-muted", className))}
      data-testid={testId}
      data-unavailable={unavailable ? true : undefined}
    >
      <SlidersHorizontal className="h-4 w-4" aria-hidden /> Refine
      {count ? <span className="rounded-full bg-accent px-1.5 text-xs font-semibold tabular-nums text-bg">{count}</span> : null}
    </button>
  );
}

const BESIDE = "xl:ml-1 xl:flex-row xl:items-center xl:gap-1.5";

/**
 * One filter inside a FilterBar: its label shows above it when the bar is unfolded on a phone and is
 * read by screen readers on wide screens, where the control's own text says what it holds.
 */
export function FilterField({ label, htmlFor, labelId, children, className, alwaysLabel = false, labelBeside = false }: { label: string; htmlFor?: string; labelId?: string; children: React.ReactNode; className?: string; /** Keep the label visible on wide screens too (fields in a panel, such as Refine). */ alwaysLabel?: boolean; /** In the inline row, the label shown beside the field rather than read out only: for a control whose own text does not say what it holds (a date field's "mm/dd/yyyy"). */ labelBeside?: boolean }) {
  const at = AT[React.useContext(FoldContext)];
  // In the sheet the label shows at every width, and the field takes the sheet's width.
  const inSheet = React.useContext(SheetContext);
  const inline = !alwaysLabel && !inSheet;
  // Beside the field only where the row has room for it (xl, in rem: 1280px at the usual text size,
  // so not at 150–200% text or on a phone held sideways, where it would push a field onto a row of its own).
  const cls = cn("text-xs font-medium text-fg-muted", inline && at.label, inline && labelBeside && "xl:not-sr-only");
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", inline && at.field, inline && labelBeside && BESIDE, className)}>
      {htmlFor ? (
        <label htmlFor={htmlFor} className={cls} data-filter-label="">
          {label}
        </label>
      ) : (
        <span id={labelId} className={cls} data-filter-label="">
          {label}
        </span>
      )}
      {children}
    </div>
  );
}
