"use client";

import * as React from "react";
import { RotateCcw, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { Button } from "./button";
import { DetailModal, useModalClose } from "./detail-modal";
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

type Breakpoint = "md" | "lg";

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
   * The inline Reset (from the breakpoint up), where it differs from the sheet's: a page whose sheet
   * also holds choices that wider screens keep elsewhere (Encounters' minimum and order, in its list's
   * toolbar) counts them for the Filters button and the sheet's Reset only (`count`), and its inline
   * Reset leaves them as they are (`onReset`).
   */
  inlineReset?: { count: number; onReset: () => void };
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
  // Opened from md (the pinned row, or the top bar of a phone held sideways), the sheet holds the bar's
  // own fields only: a list's own choices (`inlineReset`) are its toolbar's there, so the sheet's Reset
  // is the inline one.
  const [sheetWide, setSheetWide] = React.useState(false);
  const openSheet = React.useCallback((from: "own" | "toolbar" | "topbar") => {
    const row = controlsRef.current;
    setKept(row && row.offsetHeight ? { width: row.offsetWidth, height: row.offsetHeight } : null);
    setSheetWide(window.matchMedia("(min-width: 48rem)").matches);
    atOpen.current = now.current;
    chose.current = false;
    setLandBy(null);
    setOpenedFrom(from);
  }, []);
  const closeSheet = React.useCallback(() => {
    // Opened from the frame far down the page, and a choice made in it: once the change has arrived,
    // within LAND_WITHIN_MS, the list starts again in view. Closed unchanged, nothing is armed.
    const was = atOpen.current;
    const changed = chose.current || was.summary !== now.current.summary || was.activeCount !== now.current.activeCount;
    if ((from.current === "toolbar" || from.current === "topbar") && changed) setLandBy(Date.now() + LAND_WITHIN_MS);
    setOpenedFrom(null);
  }, []);
  const choose = React.useCallback(() => {
    chose.current = true;
  }, []);
  // One bar a page tells the frame how to open its sheet, and whether its sheet is open and from where
  // (ui/page-toolbar.tsx: the control that opened it stays until it has the focus back).
  // From md a list's own choices are not this bar's (`inlineReset`): the pinned row's Filters counts what the bar narrows there.
  const wideCount = inlineReset ? inlineReset.count : activeCount;
  React.useEffect(() => {
    const root = rootRef.current;
    if (root) publishPageFilters({ open: openSheet, openedFrom, count: activeCount, wideCount, summary, root }, root);
  }, [openSheet, openedFrom, activeCount, wideCount, summary]);
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
    land(landTarget() ?? rootRef.current);
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
  // The full Reset, or the inline one: in the page from the breakpoint up, and in a sheet opened from md.
  const fullReset = (inSheet: boolean) => !inlineReset || (inSheet && !sheetWide);
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
  const filtersButton = (
    <button type="button" onClick={() => openSheet("own")} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} className={toolbarButtonClass(activeCount > 0, cn(at.toggle, compactToggle && "max-[22.5rem]:min-w-11 max-[22.5rem]:px-2.5"))} data-testid={toggleTestId} data-filter-toggle="">
      <SlidersHorizontal className="h-4 w-4 shrink-0 text-accent" aria-hidden />
      {compactToggle ? <span className="max-[22.5rem]:sr-only">Filters</span> : "Filters"}
      <span className="sr-only">: {summary}</span>
      {activeCount ? (
        <span className="rounded-full bg-accent px-1.5 text-xs font-semibold tabular-nums text-bg" data-testid="filter-count">
          {activeCount}
        </span>
      ) : null}
    </button>
  );
  return (
    <FoldContext.Provider value={foldBelow}>
      <div ref={rootRef} className={cn("flex min-w-0 flex-col gap-2 transition-opacity motion-reduce:transition-none", pending && "opacity-60", className)} data-testid={testId} data-filter-bar="" aria-busy={pending || undefined}>
        <div className={cn("flex min-w-0 flex-col gap-2", at.row, align === "end" && !search && "justify-end")}>
          {/* Folded (phones): the search and Filters share the first row; what is narrowed follows as
              chips, then the page's own action. From the breakpoint up the wrapper steps aside
              (display: contents) and the search sits in the bar's row as before. */}
          {search ? (
            <div className={cn("flex min-w-0 items-center gap-2", foldBelow === "md" ? "md:contents" : "lg:contents")}>
              <div className={cn("w-full min-w-0 flex-1", compact ? at.searchCompact : at.search)}>{search}</div>
              {filtersButton}
            </div>
          ) : null}
          {!search || chips.length > 0 || end ? (
            // It wraps only when a larger text size leaves no room for Filters and the page's own
            // action side by side (the chips and the spacer take no room of their own: flex-1).
            <div className={cn("flex min-w-0 flex-wrap items-center gap-2", at.toggle)}>
              {search ? null : filtersButton}
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
            kept ? <div aria-hidden className={cn("hidden min-w-0 flex-none", at.controls, align === "end" && (foldBelow === "md" ? "md:ml-auto" : "lg:ml-auto"))} style={{ width: kept.width, height: kept.height }} data-filter-placeholder="" /> : null
          ) : (
            <div ref={controlsRef} className={cn("hidden min-w-0 flex-col gap-3", at.controls, foldBelow === "md" ? "md:gap-2" : "lg:gap-2", align === "end" && (foldBelow === "md" ? "md:ml-auto md:justify-end" : "lg:ml-auto lg:justify-end"))} data-testid={testId ? `${testId}-controls` : undefined} data-filter-controls="">
              {children}
              {reset(false)}
            </div>
          )}
        </div>
        {after}
        {/* The sheet: a native dialog in the browser's top layer, so its place inside the bar changes
            nothing on screen, and the bar's fields stay the bar's for whoever looks for them there. */}
        {open ? (
          <DetailModal
            open
            onClose={closeSheet}
            size="sheet"
            title="Filters"
            description={summary}
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
 * phone's top bar, the pinned tabs), and under anything else pinned over its start (All Champions'
 * column headings, pinned under the tabs).
 */
function land(target: Element | null) {
  if (!target) return;
  target.scrollIntoView({ block: "start", behavior: "instant" });
  const at = target.getBoundingClientRect();
  const over = document.elementFromPoint(at.left + Math.min(16, at.width / 2), at.top + 1);
  if (!over || target.contains(over) || over.contains(target)) return;
  const covered = over.getBoundingClientRect().bottom - at.top;
  if (covered > 0) window.scrollBy({ top: -covered, behavior: "instant" });
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
export function RefineButton({ open, count = 0, controls, onClick, haspopup, buttonRef, className, testId }: { open: boolean; count?: number; controls: string; onClick: () => void; haspopup?: "dialog"; buttonRef?: React.Ref<HTMLButtonElement>; className?: string; testId?: string }) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-controls={controls}
      aria-haspopup={haspopup}
      className={toolbarButtonClass(open || count > 0, className)}
      data-testid={testId}
    >
      <SlidersHorizontal className="h-4 w-4" aria-hidden /> Refine
      {count ? <span className="rounded-full bg-accent px-1.5 text-xs font-semibold tabular-nums text-bg">{count}</span> : null}
    </button>
  );
}

/**
 * One filter inside a FilterBar: its label shows above it when the bar is unfolded on a phone and is
 * read by screen readers on wide screens, where the control's own text says what it holds.
 */
export function FilterField({ label, htmlFor, labelId, children, className, alwaysLabel = false }: { label: string; htmlFor?: string; labelId?: string; children: React.ReactNode; className?: string; /** Keep the label visible on wide screens too (fields in a panel, such as Refine). */ alwaysLabel?: boolean }) {
  const at = AT[React.useContext(FoldContext)];
  // In the sheet the label shows at every width, and the field takes the sheet's width.
  const inSheet = React.useContext(SheetContext);
  const inline = !alwaysLabel && !inSheet;
  const cls = cn("text-xs font-medium text-fg-muted", inline && at.label);
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", inline && at.field, className)}>
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
