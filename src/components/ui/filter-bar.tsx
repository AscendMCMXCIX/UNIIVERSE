"use client";

import * as React from "react";
import { RotateCcw, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { Button } from "./button";
import { DetailModal, useModalClose } from "./detail-modal";
import { ScrollRow } from "./scroll-row";

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
}) {
  const [open, setOpen] = React.useState(false);
  const id = React.useId();
  const at = AT[foldBelow];
  const resetCls = "inline-flex min-h-11 items-center justify-center gap-1 rounded-md px-2 text-sm font-medium text-accent hover:bg-accent/10 md:pointer-fine:min-h-9";
  // Inline in a compact bar, below xl: the icon alone, as wide as it is tall.
  const iconOnly = (inSheet: boolean) => compact && !inSheet;
  const resetBody = (inSheet: boolean) => (
    <>
      <RotateCcw className="h-3.5 w-3.5" aria-hidden /> <span className={iconOnly(inSheet) ? "max-xl:sr-only" : undefined}>{resetLabel}</span>
    </>
  );
  const resetClass = (inSheet: boolean) => cn(resetCls, inSheet && "mr-auto", iconOnly(inSheet) && "max-xl:min-w-11 md:pointer-fine:max-xl:min-w-9");
  const reset = (inSheet: boolean) =>
    activeCount > 0 && (onReset || resetHref) ? (
      resetHref ? (
        <Link href={resetHref} scroll={false} className={resetClass(inSheet)} title={iconOnly(inSheet) ? resetLabel : undefined} data-testid="reset-filters" onClick={inSheet ? () => setOpen(false) : undefined}>
          {resetBody(inSheet)}
        </Link>
      ) : (
        <button type="button" onClick={onReset} className={resetClass(inSheet)} title={iconOnly(inSheet) ? resetLabel : undefined} data-testid="reset-filters">
          {resetBody(inSheet)}
        </button>
      )
    ) : null;
  const filtersButton = (
    <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} className={toolbarButtonClass(activeCount > 0, at.toggle)} data-testid={toggleTestId} data-filter-toggle="">
      <SlidersHorizontal className="h-4 w-4 shrink-0 text-accent" aria-hidden />
      Filters
      <span className="sr-only">: {summary}</span>
      {activeCount ? <span className="rounded-full bg-accent px-1.5 text-xs font-semibold tabular-nums text-bg">{activeCount}</span> : null}
    </button>
  );
  return (
    <FoldContext.Provider value={foldBelow}>
      <div className={cn("flex min-w-0 flex-col gap-2 transition-opacity motion-reduce:transition-none", pending && "opacity-60", className)} data-testid={testId} aria-busy={pending || undefined}>
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
            <div className={cn("flex min-w-0 items-center gap-2", at.toggle)}>
              {search ? null : filtersButton}
              {chips.length ? (
                <ScrollRow as="ul" className="-my-1 flex min-w-0 flex-1 gap-1.5 py-1" aria-label="Active filters" data-testid={testId ? `${testId}-chips` : undefined}>
                  {chips.map((c) => (
                    <li key={c.key} className="shrink-0">
                      {c.href ? (
                        <Link href={c.href} scroll={false} className={CHIP} aria-label={`${c.text}: remove this filter`}>
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
              ) : (
                <span className="flex-1" />
              )}
              {end}
            </div>
          ) : null}
          {/* Inline from the breakpoint up; while the sheet is open its fields live there instead (one copy of each field and its id). */}
          {open ? null : (
            <div className={cn("hidden min-w-0 flex-col gap-3", at.controls, foldBelow === "md" ? "md:gap-2" : "lg:gap-2", align === "end" && (foldBelow === "md" ? "md:ml-auto md:justify-end" : "lg:ml-auto lg:justify-end"))} data-testid={testId ? `${testId}-controls` : undefined} data-filter-controls="">
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
            onClose={() => setOpen(false)}
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
            <div id={id} className={cn("flex min-w-0 flex-col gap-4 transition-opacity", pending && "opacity-60")} data-testid={testId ? `${testId}-controls` : undefined} data-filter-controls="" aria-busy={pending || undefined}>
              {children}
            </div>
          </DetailModal>
        ) : null}
      </div>
    </FoldContext.Provider>
  );
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
  const cls = cn("text-xs font-medium text-fg-muted", !alwaysLabel && at.label);
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", !alwaysLabel && at.field, className)}>
      {htmlFor ? (
        <label htmlFor={htmlFor} className={cls}>
          {label}
        </label>
      ) : (
        <span id={labelId} className={cls}>
          {label}
        </span>
      )}
      {children}
    </div>
  );
}
