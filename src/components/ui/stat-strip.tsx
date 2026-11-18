import type * as React from "react";
import { cn } from "@/lib/cn";

/*
  A strip of figures over a list (Match History's line about its newest games): each figure a strong
  value with its quiet label (StatTile), laid out by the strip's own width (@container/strip), never
  the window's:
    under 36rem  its lines (StatLine), one under the other, each a line of figures with the value and
                 its label on one baseline; a line wraps only where its figures do not fit (a large
                 text size, the narrowest phones);
    36–60rem     the lines step aside (display: contents): one flowing line of figures that wraps
                 where it must;
    from 60rem   one row of tiles: each figure a column, its value over its label (a caption, 11px),
                 the tiles split by hairlines; a second row only where a caller's figures outgrow
                 the row (Match History's, every one at its widest, fit a 60rem strip), never a cut
                 or a sideways scroll;
    from 78rem   with `wideLine` (the caller's figures fit: Match History's without a trend), the
                 same cells as one line, each value beside its label: a strip a text line tall on
                 the widest screens, where the page's measure (80rem) leaves the room.
  Owner decision D8 (8 Nov 2026): Match History's summary is one row on a desktop and three lines on
  a phone. The values keep tabular figures and the page's colours for meaning (a result's blue or
  red, a trend's good or bad), the labels the caption grey.
*/

export function StatStrip({ label, children, className, testId }: { label: string; children: React.ReactNode; className?: string; testId?: string }) {
  return (
    // The container is the section, without a border, so its width is the list's (a 60rem list is a
    // 60rem strip); the panel and the row's padding are inside it, where its queries reach.
    <section aria-label={label} className={cn("@container/strip", className)} data-testid={testId}>
      <div className="rounded-panel border border-border bg-surface">
        <div className="flex min-w-0 flex-col gap-y-1 px-3 py-2 @min-[36rem]/strip:flex-row @min-[36rem]/strip:flex-wrap @min-[36rem]/strip:items-center @min-[36rem]/strip:gap-x-5 @min-[36rem]/strip:gap-y-2 @min-[60rem]/strip:items-stretch @min-[60rem]/strip:gap-x-0 @min-[60rem]/strip:py-1">
          {children}
        </div>
      </div>
    </section>
  );
}

/** One of a phone's lines; from 36rem its figures join the strip's own flow. */
export function StatLine({ children, className, testId }: { children: React.ReactNode; className?: string; testId?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 @min-[36rem]/strip:contents", className)} data-stat-line="" data-testid={testId}>
      {children}
    </div>
  );
}

/**
 * One figure: its value and label on one baseline, and from 60rem a tile, the value over the label,
 * with a hairline before it (`lead`: the strip's first tile, which has none). `labelFirst` reads the
 * label first, on one line ("Last 20" before its squares) and in a tile (a caption over them): the
 * order it is drawn in is its order in the page. `labelFrom60`: a label shown only in the tile (a
 * value that names itself on one line, as a row of champion portraits does for screen readers).
 * `valueClassName`: the value's own box (a value that fills its line, as a phone's squares do).
 */
export function StatTile({ value, label, title, lead = false, labelFirst = false, labelFrom60 = false, wideLine = false, className, valueClassName, testId }: { value: React.ReactNode; label: React.ReactNode; title?: string; lead?: boolean; labelFirst?: boolean; labelFrom60?: boolean; /** From 78rem, value and label side by side again (see StatStrip). */ wideLine?: boolean; className?: string; valueClassName?: string; testId?: string }) {
  const labelSize = cn("text-xs leading-5 text-fg-subtle @min-[60rem]/strip:text-2xs @min-[60rem]/strip:leading-3.5", wideLine && "@min-[78rem]/strip:text-xs @min-[78rem]/strip:leading-5");
  return (
    <div
      className={cn(
        // On a phone a figure wider than a whole line (a large text size) wraps inside itself, its
        // label under its value; from 36rem a figure is one unbroken line or tile.
        "flex min-w-0 flex-wrap @min-[36rem]/strip:flex-nowrap @min-[36rem]/strip:whitespace-nowrap @min-[60rem]/strip:justify-center @min-[60rem]/strip:gap-0 @min-[60rem]/strip:px-2.5",
        labelFirst ? "items-center gap-2 @min-[60rem]/strip:flex-col @min-[60rem]/strip:items-start" : "items-baseline gap-1 @min-[60rem]/strip:flex-col @min-[60rem]/strip:items-start",
        wideLine && (labelFirst ? "@min-[78rem]/strip:flex-row @min-[78rem]/strip:items-center @min-[78rem]/strip:gap-2" : "@min-[78rem]/strip:flex-row @min-[78rem]/strip:items-baseline @min-[78rem]/strip:gap-1"),
        lead ? "@min-[60rem]/strip:pl-0" : "@min-[60rem]/strip:border-l @min-[60rem]/strip:border-border/60",
        className,
      )}
      title={title}
      data-stat-tile=""
      data-testid={testId}
    >
      {labelFirst ? <span className={labelSize}>{label}</span> : null}
      <span className={cn("flex items-center gap-1 text-sm font-semibold leading-5 tabular-nums text-fg", valueClassName)}>{value}</span>
      {labelFirst ? null : (
        <span className={cn(labelSize, labelFrom60 && "hidden @min-[60rem]/strip:inline", labelFrom60 && wideLine && "@min-[78rem]/strip:hidden")} aria-hidden={labelFrom60 || undefined}>
          {label}
        </span>
      )}
    </div>
  );
}
