"use client";

import * as React from "react";
import { ChevronDown, RotateCcw, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";

/*
  The one filter bar. Every list that can be narrowed (Players, a profile's statistics, Match
  History, Leaderboards, Matches) behaves the same way:
    - Search, when there is one, comes first and is never folded away.
    - From the breakpoint up, the filters sit inline on one row, 36px tall with a mouse and 44px on
      touch screens, labelled for screen readers (each control says what it holds: "All roles", "Any patch").
    - Below it, they fold behind one full-width "Filters · what is chosen" button with a count of
      narrowed filters, so the content starts on the first screen; opened, each filter gets a
      visible label above it.
    - "Reset" appears only when something is narrowed and puts every filter back to its default.
    - Choices apply at once (no Apply button); the page shows a pending state meanwhile.
  Pages decide which filters they need; the bar decides how they look and behave.
*/

type Breakpoint = "md" | "lg";

// Static class strings per breakpoint (Tailwind only sees whole class names).
const AT: Record<Breakpoint, { row: string; toggle: string; controls: string; search: string; label: string; field: string }> = {
  md: {
    row: "md:flex-row md:flex-wrap md:items-center",
    toggle: "md:hidden",
    controls: "md:flex md:flex-row md:flex-wrap md:items-center",
    search: "md:w-auto md:max-w-sm md:flex-[1_1_16rem]",
    label: "md:sr-only",
    field: "md:w-auto",
  },
  lg: {
    row: "lg:flex-row lg:flex-wrap lg:items-center",
    toggle: "lg:hidden",
    controls: "lg:flex lg:flex-row lg:flex-wrap lg:items-center",
    search: "lg:w-auto lg:max-w-sm lg:flex-[1_1_16rem]",
    label: "lg:sr-only",
    field: "lg:w-auto",
  },
};

const FoldContext = React.createContext<Breakpoint>("md");

export function FilterBar({
  summary,
  activeCount = 0,
  onReset,
  resetHref,
  search,
  foldBelow = "md",
  align = "start",
  pending = false,
  testId,
  toggleTestId = "filter-toggle",
  children,
  after,
  className,
  resetLabel = "Reset",
}: {
  /** What is chosen, in a few words ("Season 2026 · All supported games"), shown on the folded button. */
  summary: string;
  /** How many filters differ from their default: shown as a count, and enables Reset. */
  activeCount?: number;
  onReset?: () => void;
  resetHref?: string;
  /** A search box (SearchInput), kept visible at every size. */
  search?: React.ReactNode;
  /** Below this breakpoint the filters fold behind the summary button. */
  foldBelow?: Breakpoint;
  /** Where the inline filters sit from the breakpoint up. */
  align?: "start" | "end";
  pending?: boolean;
  testId?: string;
  toggleTestId?: string;
  children: React.ReactNode;
  /** Shown under the bar at every size (e.g. removable chips for the active refinements). */
  after?: React.ReactNode;
  className?: string;
  /** The reset action's wording ("Clear filters"). */
  resetLabel?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const id = React.useId();
  const at = AT[foldBelow];
  const reset =
    activeCount > 0 && (onReset || resetHref)
      ? (() => {
          const cls = "inline-flex min-h-11 items-center justify-center gap-1 rounded-md px-2 text-sm font-medium text-accent hover:bg-accent/10 md:pointer-fine:min-h-9";
          const body = (
            <>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden /> {resetLabel}
            </>
          );
          return resetHref ? (
            <Link href={resetHref} scroll={false} className={cls} data-testid="reset-filters">
              {body}
            </Link>
          ) : (
            <button type="button" onClick={onReset} className={cls} data-testid="reset-filters">
              {body}
            </button>
          );
        })()
      : null;
  return (
    <FoldContext.Provider value={foldBelow}>
      <div className={cn("flex min-w-0 flex-col gap-2 transition-opacity motion-reduce:transition-none", pending && "opacity-60", className)} data-testid={testId} aria-busy={pending || undefined}>
        <div className={cn("flex min-w-0 flex-col gap-2", at.row, align === "end" && !search && "justify-end")}>
          {search ? <div className={cn("w-full min-w-0", at.search)}>{search}</div> : null}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={id}
            className={cn("flex min-h-11 w-full items-center gap-2 rounded-md border bg-bg-elevated px-3 text-left text-sm transition-colors", open || activeCount ? "border-accent/60" : "border-border-control hover:border-fg-subtle", at.toggle)}
            data-testid={toggleTestId}
            data-filter-toggle=""
          >
            <SlidersHorizontal className="h-4 w-4 shrink-0 text-accent" aria-hidden />
            <span className="min-w-0 flex-1 truncate">
              <span className="font-medium text-fg">Filters</span>
              <span className="text-fg-muted"> · {summary}</span>
            </span>
            {activeCount ? <span className="rounded-full bg-accent px-1.5 text-xs font-semibold tabular-nums text-bg">{activeCount}</span> : null}
            <ChevronDown className={cn("h-4 w-4 shrink-0 text-fg-muted transition-transform motion-reduce:transition-none", open && "rotate-180")} aria-hidden />
          </button>
          <div id={id} className={cn("min-w-0 flex-col gap-3", open ? "flex rounded-panel border border-border bg-surface p-3" : "hidden", at.controls, foldBelow === "md" ? "md:gap-2 md:border-0 md:bg-transparent md:p-0" : "lg:gap-2 lg:border-0 lg:bg-transparent lg:p-0", align === "end" && (foldBelow === "md" ? "md:ml-auto md:justify-end" : "lg:ml-auto lg:justify-end"))} data-testid={testId ? `${testId}-controls` : undefined} data-filter-controls="">
            {children}
            {reset}
          </div>
        </div>
        {after}
      </div>
    </FoldContext.Provider>
  );
}

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
