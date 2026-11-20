"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * The site's one fold (DESIGN_SYSTEM §7, container 6): a native <details>, so it works before the
 * page's code has run, with the keyboard, and with find-in-page; one chevron (ChevronDown, turned
 * half a turn while its own fold is open, never a parent's) and one spacing for each of its three looks:
 *
 * - `panel`: a boxed section (a panel's border and surface), its title and a line of description,
 *   the chevron at the row's end; the body under a rule with a panel's padding (`flush` for content
 *   that brings its own, such as a divided list).
 * - `row`: the same row without a box, inside a panel of its own (Riot's tips).
 * - `inline`: a line of small text ("3 more", "The wiki pages"), the chevron before the words; the
 *   body under it.
 *
 * Every summary is a 44px row on a touch screen (its own height, not an invisible area over its
 * words, which would take the press from them), and a row's or an inline fold's body starts 16px under it there (a panel's past its border and
 * padding), so the touch areas of the links in it reach nothing of the summary.
 *
 * Its open state is the browser's: `onToggle` reports it, `lazy` keeps the body out of the page until
 * the first open (a chart that costs something to draw), and SectionIndex opens a closed fold it
 * links into by setting `open` itself. Every fold was its own markup before (S4a): three chevrons
 * (›, ChevronRight, ChevronDown), five sizes and a native triangle on two.
 */
export type FoldVariant = "panel" | "row" | "inline";

const DETAILS: Record<FoldVariant, string> = {
  panel: "group/fold rounded-panel border border-border bg-surface",
  row: "group/fold",
  inline: "group/fold",
};

const SUMMARY: Record<FoldVariant, string> = {
  panel: "flex min-h-11 items-center justify-between gap-3 rounded-panel px-4 py-1.5 hover:bg-surface-2/50 pointer-fine:min-h-9",
  row: "flex min-h-11 items-center justify-between gap-2 rounded-sm pointer-fine:min-h-7",
  inline: "inline-flex min-h-11 items-center gap-1 rounded-sm text-xs pointer-fine:min-h-7",
};
/**
 * A panel whose summary is a line of small text on a page measured to the pixel (`dense`: Matchup
 * Intel's sources, under its one-screen fit and the phone's page budget): 12px at the sides and 8px
 * before the chevron, not 16 and 12. At 320px with 150% text the room it gives back is one line of
 * that summary (24px); it is how that summary was spaced before the Fold (Release 8).
 */
const SUMMARY_DENSE_PANEL = "flex min-h-11 items-center justify-between gap-2 rounded-panel px-3 py-1.5 hover:bg-surface-2/50 pointer-fine:min-h-9";

/** The summary's colour (inline and row folds): a quiet line, an accent "more" link, or the text's own colour. */
const TONE = { muted: "text-fg-muted hover:text-fg", accent: "font-medium text-accent hover:text-accent-strong", fg: "font-medium text-fg hover:text-accent-strong", none: "" } as const;

const CHEVRON: Record<FoldVariant, string> = {
  panel: "h-4 w-4",
  row: "h-4 w-4",
  inline: "h-3.5 w-3.5",
};

const BODY: Record<FoldVariant, string> = {
  panel: "border-t border-border",
  row: "mt-1.5 pb-1 pointer-coarse:mt-4",
  inline: "mt-1.5 pointer-coarse:mt-4",
};

export function Fold({
  summary,
  title,
  description,
  children,
  variant = "panel",
  tone = "none",
  defaultOpen = false,
  lazy = false,
  flush = false,
  dense = false,
  onToggle,
  id,
  className,
  summaryClassName,
  bodyClassName,
  testId,
  summaryTestId,
  ...data
}: {
  /** The summary line's own content; or `title` (and `description`) for a panel's two lines. */
  summary?: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  variant?: FoldVariant;
  tone?: keyof typeof TONE;
  defaultOpen?: boolean;
  /** Render the body only once the fold has been opened. */
  lazy?: boolean;
  /** A panel's body without its padding: the content brings its own. */
  flush?: boolean;
  /** A panel's summary spaced for a line of small text (SUMMARY_DENSE_PANEL); panels only. */
  dense?: boolean;
  onToggle?: (open: boolean) => void;
  id?: string;
  /** On the details element: its place in a grid or a row (`open:col-span-2`, `basis-full`). */
  className?: string;
  /** The summary's colour and type, where it is not the default (an accent "more" link). */
  summaryClassName?: string;
  bodyClassName?: string;
  testId?: string;
  summaryTestId?: string;
  /** data-* attributes for the details element (a count tests read). */
  [data: `data-${string}`]: string | number | undefined;
}) {
  const [opened, setOpened] = React.useState(defaultOpen);
  const chevron = <ChevronDown className={cn(CHEVRON[variant], "shrink-0 text-fg-subtle transition-transform motion-reduce:transition-none [details[open]>summary>&]:rotate-180", variant === "panel" || variant === "row" ? "order-last" : "")} aria-hidden data-fold-chevron="" />;
  const head =
    summary ??
    (
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-fg">{title}</span>
        {description ? <span className="block text-sm text-fg-muted">{description}</span> : null}
      </span>
    );
  return (
    <details
      className={cn(DETAILS[variant], className)}
      open={defaultOpen}
      id={id}
      data-testid={testId}
      data-fold={variant}
      {...data}
      onToggle={(e) => {
        const open = (e.currentTarget as HTMLDetailsElement).open;
        if (open) setOpened(true);
        onToggle?.(open);
      }}
    >
      <summary className={cn("cursor-pointer list-none focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden", variant === "panel" && dense ? SUMMARY_DENSE_PANEL : SUMMARY[variant], TONE[tone], summaryClassName)} data-testid={summaryTestId}>
        {chevron}
        {head}
      </summary>
      {lazy && !opened ? null : <div className={cn(BODY[variant], variant === "panel" && !flush && "space-y-4 p-3 sm:p-4", bodyClassName)}>{children}</div>}
    </details>
  );
}
