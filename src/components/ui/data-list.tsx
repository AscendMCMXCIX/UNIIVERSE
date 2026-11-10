import * as React from "react";
import Link from "next/link";
import { Crown } from "lucide-react";
import { CardAvatar, CardName, cardColourVars } from "@/components/players/card-look";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { CardLook } from "@/domain/card-style";
import { cn } from "@/lib/cn";
import { formatOrdinal } from "@/lib/format";

/*
  A list of rows that reads as one board (docs/STANDARDS.md, Components): Recent form's ranking
  first, later Records' rows and the Players roster. The pieces:

    DataList     the board: its surface, the container its rows measure (@container/list), the
                 column template they share (--dl-cols, set per width on the body), the headings,
                 and one hairline between each of its parts (headings, groups, captions);
    DataGroup    an ol or ul of rows, with its caption ("Provisional · 10 to 19 recent games");
    DataRow      one row: a grid on the board's columns, its cells in reading order (lead, link,
                 children, figures, trail), its height by the board's width (density), your own
                 row's wash and bar, and the hover and pressed states when it is a link;
    RowLink      the row's one link, laid over the whole row (a whole-row target on every device)
                 and named by the member's name; a control that must stay pressable sits above it
                 (ROW_CONTROL);
    Place        the place: "4=" for a shared place, said "Tied for 4th", with the bracket joining
                 the tied rows; the crown on first place; "–" (Provisional) without one;
    FigureCell   a figure, right-aligned, tabular, never cut, with its own words for screen readers;
    MemberCell   a member as their card shows them (CardAvatar, CardName in their colours, "You").

  The board's width, not the window's, picks each row's layout, in three tiers: narrow under 36rem,
  medium from 36rem, wide from 58rem (1280×800 with the sidebar open is 59.9rem, so it is wide).
  Every class is a literal, so Tailwind sees it. No "use client", hooks or context, and nothing from
  src/server: the pieces render in server components (Leaderboards) and client trees alike.
*/

export type Density = "dense" | "regular" | "two-line";
/** One density at every width, or one per tier of the board: narrow (under 36rem), medium (from 36rem), wide (from 58rem). */
export type DensityByWidth = Density | { narrow: Density; medium?: Density; wide?: Density };
export type TiePosition = "start" | "mid" | "end";
type DataAttrs = { [key: `data-${string}`]: string | number | boolean | undefined };

/** A row's side padding (also the headings', captions' and an empty row's): 12px, 16px on a wide board. */
export const ROW_PAD_X = "px-3 @min-[58rem]/list:px-4";
/** The gap between a row's columns: 10px on a narrow board, 12px from 36rem (the tie bracket takes 4px of it). */
export const ROW_GAP_X = "gap-x-2.5 @min-[36rem]/list:gap-x-3";
/**
 * A linked row's states: hover surface-2, pressed surface-3, and pressed surface-2 on phones
 * (docs/MOBILE.md, owner-checked). Tailwind 4's hover: applies only where the device can hover, so
 * a tap never leaves a row lit.
 */
export const ROW_STATES = "transition-colors duration-150 hover:bg-surface-2 has-[[data-row-link]:active]:bg-surface-3 max-md:has-[[data-row-link]:active]:bg-surface-2";
/** A control drawn above the row's link, so it keeps its own press (later: Players' social icons). */
export const ROW_CONTROL = "relative z-[2]";

const SURFACE = {
  panel: "rounded-card border border-border bg-surface panel-depth",
  lead: "rounded-card border border-border bg-surface surface-lead",
  none: "",
} as const;

/**
 * The board. `columns` sets the --dl-cols template for each tier, as literal classes (Recent form's
 * FORM_COLS): a container query cannot style its own container, so the template goes on the body,
 * and the headings and every row inherit it. Headings, groups and captions are the body's direct
 * children, so one divide-y draws every line between them and a missing group never doubles one.
 */
export function DataList({ columns, heads, headsTestId, headsClassName, surface = "panel", className, testId, children }: { columns?: string; /** aria-hidden column headings (DataHead), on the board's columns; every row names its own figures for screen readers. */ heads?: React.ReactNode; headsTestId?: string; headsClassName?: string; surface?: keyof typeof SURFACE; className?: string; testId?: string; children: React.ReactNode }) {
  return (
    <div className={cn("@container/list min-w-0 overflow-clip", SURFACE[surface], className)} data-testid={testId}>
      <div className={cn("divide-y divide-border/70", columns)}>
        {heads ? (
          <div aria-hidden data-testid={headsTestId} className={cn("grid grid-cols-(--dl-cols) items-end py-2 label-caps", ROW_GAP_X, ROW_PAD_X, headsClassName)}>
            {heads}
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}

/** A column heading: one line, never wrapped (each must fit its track). */
export function DataHead({ children, align = "start", className }: { children?: React.ReactNode; align?: "start" | "end"; className?: string }) {
  return <span className={cn("min-w-0 whitespace-nowrap", align === "end" && "text-right", className)}>{children}</span>;
}

/**
 * A group of rows: its caption (phrasing content only: it is a <p>), then the list. `rule="row"`
 * draws a hairline under every row but the last (Tailwind 4's divide-y is each row's bottom border).
 */
export function DataGroup({ as: List = "ol", label, caption, captionTestId, rule = "row", className, testId, children }: { as?: "ol" | "ul"; /** The list's name for screen readers ("Ranking"). */ label?: string; caption?: React.ReactNode; captionTestId?: string; rule?: "row" | "none"; className?: string; testId?: string; children: React.ReactNode }) {
  return (
    <>
      {caption ? (
        <p className={cn("bg-surface-2/40 py-2 text-xs text-fg-muted", ROW_PAD_X)} data-testid={captionTestId}>
          {caption}
        </p>
      ) : null}
      <List aria-label={label} data-testid={testId} className={cn(rule === "row" && "divide-y divide-border/60", className)}>
        {children}
      </List>
    </>
  );
}

/** Row heights with a 40px picture: dense 48px, regular 52px, two lines 64px (the minimums; a row that needs more grows). */
const DENSITY = {
  narrow: { dense: "min-h-11 py-1", regular: "min-h-13 py-1.5", "two-line": "min-h-16 py-2" },
  medium: { dense: "@min-[36rem]/list:min-h-11 @min-[36rem]/list:py-1", regular: "@min-[36rem]/list:min-h-13 @min-[36rem]/list:py-1.5", "two-line": "@min-[36rem]/list:min-h-16 @min-[36rem]/list:py-2" },
  wide: { dense: "@min-[58rem]/list:min-h-11 @min-[58rem]/list:py-1", regular: "@min-[58rem]/list:min-h-13 @min-[58rem]/list:py-1.5", "two-line": "@min-[58rem]/list:min-h-16 @min-[58rem]/list:py-2" },
} as const;

export function densityClasses(density: DensityByWidth): string {
  if (typeof density === "string") return DENSITY.narrow[density];
  return cn(DENSITY.narrow[density.narrow], density.medium && DENSITY.medium[density.medium], density.wide && DENSITY.wide[density.wide]);
}

/**
 * One row of a DataList, a grid on the board's columns (--dl-cols). Its cells render in this order,
 * which is also the reading order: your own row's bar, `lead` (the place, the picture), `link` (the
 * row's RowLink, a direct child so it covers the row), `children` (the member), `figures`, `trail`.
 * Cells place themselves on the columns per tier. `title` (through the data attributes) is the
 * row's hint: under the overlay link no cell's own title shows, and a tooltip comes from the
 * nearest ancestor with one, the row.
 */
export function DataRow({ lead, link, children, figures, trail, own = false, density = "regular", align = "center", className, testId, ...rest }: { lead?: React.ReactNode; link?: React.ReactNode; children?: React.ReactNode; figures?: React.ReactNode; trail?: React.ReactNode; /** Your own row: the accent wash and the 2px bar at its left edge. */ own?: boolean; density?: DensityByWidth; align?: "center" | "start"; className?: string; testId?: string; title?: string } & DataAttrs) {
  return (
    <li className={cn("group/row relative isolate grid grid-cols-(--dl-cols) gap-y-0.5", ROW_GAP_X, ROW_PAD_X, align === "center" ? "items-center content-center" : "items-start content-start", densityClasses(density), own && "bg-accent/5", link ? ROW_STATES : null, className)} data-testid={testId} {...rest}>
      {own ? <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-0.5 bg-accent" /> : null}
      {lead}
      {link}
      {children}
      {figures}
      {trail}
    </li>
  );
}

/**
 * The row's one link, over the whole row (RosterRow's): named by its sr-only text (the member's
 * name, so speech control finds it by the visible name), the shared 2px accent ring drawn inside
 * the row, its radius the row's (a chip's). No title: the row carries the hint. It must be a
 * direct child of the row, never inside a positioned cell, or it covers only that cell.
 */
export function RowLink({ href, children, prefetch, scroll, className, testId, ...data }: { href: string; children: React.ReactNode; prefetch?: boolean | null; scroll?: boolean; className?: string; testId?: string } & DataAttrs) {
  return (
    <Link href={href} prefetch={prefetch} scroll={scroll} className={cn("absolute inset-0 z-[1] rounded-[inherit] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent", className)} data-row-link="" data-testid={testId} {...data}>
      <span className="sr-only">{children}</span>
    </Link>
  );
}

/**
 * Where each row sits in a run of shared places, from the places the ranking gave (1, 2, 2, 4):
 * consecutive equal places are start, mid…, end; a place shared with no neighbour, and a row
 * without a place (provisional), are null. It reads the places only, never the figures.
 */
export function tieRuns(places: ReadonlyArray<number | null | undefined>): Array<TiePosition | null> {
  return places.map((place, i) => {
    if (place === null || place === undefined) return null;
    const before = i > 0 && places[i - 1] === place;
    const after = i < places.length - 1 && places[i + 1] === place;
    return before && after ? "mid" : after ? "start" : before ? "end" : null;
  });
}

/** Each segment of the bracket joining tied rows, drawn by its own row (-bottom-px covers the row's own hairline, so the line runs on). */
const BRACKET: Record<TiePosition, string> = {
  start: "top-[calc(50%-1px)] -bottom-px rounded-tr-xs border-t-2 border-r-2",
  mid: "top-0 -bottom-px border-r-2 before:absolute before:right-0 before:top-1/2 before:h-0.5 before:w-full before:-translate-y-1/2 before:bg-fg-subtle/55",
  end: "top-0 bottom-[calc(50%-1px)] rounded-br-xs border-b-2 border-r-2",
};
const PLACE = "flex min-w-0 items-center justify-end gap-0.5 pr-1 text-sm font-bold tabular-nums";

/**
 * A row's place, as two direct children of the row (the bracket is positioned on the row's first
 * column, so it cannot sit inside the label): "7"; "4=" for a shared place, said and titled "Tied
 * for 4th", with its bracket segment; the gold crown on first place (every 1= row has one; on a
 * narrow board a shared first place stacks the crown under "1=", which with the crown is wider than
 * the column); "–" said `unplaced` for a row without a place. The bracket needs a column gap of at
 * least 10px; it takes 4px of it.
 */
export function Place({ place, tie = null, crown = false, unplaced = "Provisional", className, testId }: { place: number | null; tie?: TiePosition | null; crown?: boolean; unplaced?: string; className?: string; testId?: string }) {
  if (place === null) {
    return (
      <span className={cn(PLACE, "text-fg-subtle", className)} data-testid={testId} title={unplaced}>
        <span aria-hidden>–</span>
        <span className="sr-only">{unplaced}</span>
      </span>
    );
  }
  const words = tie ? `Tied for ${formatOrdinal(place)}` : null;
  return (
    <>
      <span className={cn(PLACE, "text-fg", tie && crown && "@max-[36rem]/list:flex-col @max-[36rem]/list:items-end @max-[36rem]/list:justify-center @max-[36rem]/list:gap-0", className)} data-testid={testId} data-tie={tie ?? undefined} title={words ?? undefined}>
        {tie ? (
          <>
            <span aria-hidden>{place}=</span>
            <span className="sr-only">{words}</span>
          </>
        ) : (
          place
        )}
        {crown ? <Crown className="h-4 w-4 shrink-0 text-gold" aria-label="First place" role="img" /> : null}
      </span>
      {tie ? <span aria-hidden className={cn("pointer-events-none absolute col-[1/2] -right-1 w-1.5 border-fg-subtle/55", BRACKET[tie])} /> : null}
    </>
  );
}

const FIGURE_SIZE = { sm: "text-sm", base: "text-base", lg: "text-lg leading-tight" } as const;
const FIGURE_EMPHASIS = { strong: "font-semibold text-fg", muted: "text-fg-muted", subtle: "text-fg-subtle" } as const;

/**
 * A figure, already formatted (src/lib/format.ts): tabular, never cut (a long value wraps rather
 * than overflow, P10). `spoken` replaces what screen readers hear ("13W 7L" → "13 wins, 7 losses");
 * `label` follows the value for them (" win rate"). `size={null}` takes the size of the line it
 * sits in (a row's second line).
 */
export function FigureCell({ children, spoken, label, size = "sm", emphasis = "muted", align = "end", className, testId, ...data }: { children: React.ReactNode; spoken?: string; label?: React.ReactNode; size?: keyof typeof FIGURE_SIZE | null; emphasis?: keyof typeof FIGURE_EMPHASIS; align?: "start" | "end"; className?: string; testId?: string } & DataAttrs) {
  return (
    <span data-figure="" data-testid={testId} className={cn("min-w-0 tabular-nums [overflow-wrap:anywhere]", align === "end" ? "text-right" : "text-left", size ? FIGURE_SIZE[size] : null, FIGURE_EMPHASIS[emphasis], className)} {...data}>
      {spoken ? (
        <>
          <span aria-hidden>{children}</span>
          <span className="sr-only">{spoken}</span>
        </>
      ) : (
        children
      )}
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}

/**
 * A member as their card shows them (the Leaderboards' Who, generalised): the framed picture, the
 * name in their name style with their emblem, in their colours (cardColourVars, on this cell only:
 * no look colour reaches a place or a figure), and "You". Exactly one CardName, never cut.
 * `readName={false}` when the row's link already says the name: the visible one is then hidden
 * from screen readers, so it is not read twice.
 */
export function MemberCell({ look, name, avatarUrl = null, avatar = "md", you = false, readName = true, nameClassName, nameTestId, className }: { look: CardLook | null | undefined; name: string; avatarUrl?: string | null; avatar?: "xs" | "sm" | "md" | false; you?: boolean; readName?: boolean; nameClassName?: string; nameTestId?: string; className?: string }) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2.5 text-sm", className)} style={cardColourVars(look)}>
      {avatar ? <CardAvatar look={look} name={name} src={avatarUrl} size={avatar} /> : null}
      <span className="flex min-w-0 flex-1 flex-col" data-testid={nameTestId}>
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 text-fg" aria-hidden={readName ? undefined : true}>
            <CardName look={look} name={name} className={nameClassName} />
          </span>
          {you ? (
            <span className="inline-flex shrink-0" data-testid="card-you">
              <Badge tone="accent">You</Badge>
            </span>
          ) : null}
        </span>
      </span>
    </span>
  );
}

/**
 * A DataList while its rows load, in their shape: the place, the picture, the name over a second
 * line (gone on a wide board), the bar and a figure, each tier at its rows' height, so the page
 * does not move when the board arrives. Hidden from screen readers (the loading state says it).
 */
export function DataListSkeleton({ rows = 7, heads = true, surface = "panel", density = "regular" }: { rows?: number; heads?: boolean; surface?: keyof typeof SURFACE; density?: DensityByWidth }) {
  return (
    <div aria-hidden>
      <DataList
        surface={surface}
        columns="[--dl-cols:2rem_2.5rem_minmax(0,1fr)_3rem] @min-[36rem]/list:[--dl-cols:2.5rem_2.5rem_minmax(0,1fr)_minmax(0,1fr)_4rem]"
        headsClassName="hidden @min-[36rem]/list:grid"
        heads={
          heads ? (
            <>
              <Skeleton className="h-2.5 w-3 justify-self-end" />
              <Skeleton className="col-span-2 h-2.5 w-14" />
              <Skeleton className="h-2.5 w-12" />
              <Skeleton className="h-2.5 w-10 justify-self-end" />
            </>
          ) : undefined
        }
      >
        <DataGroup as="ul">
          {Array.from({ length: rows }, (_, i) => (
            <DataRow key={i} density={density}>
              <Skeleton className="col-[1/2] row-[1/span_2] h-4 w-4 self-center justify-self-end @min-[58rem]/list:row-[1/2]" />
              <Skeleton className="col-[2/3] row-[1/span_2] size-10 self-center rounded-full @min-[58rem]/list:row-[1/2]" />
              <Skeleton className="col-[3/4] row-[1/2] h-4 w-[min(8rem,100%)]" />
              <Skeleton className="col-[3/-1] row-[2/3] h-3 w-[min(10rem,100%)] @min-[36rem]/list:col-[3/4] @min-[58rem]/list:hidden" />
              <Skeleton className="col-[4/5] row-[1/2] hidden h-1.5 w-full self-center @min-[36rem]/list:row-[1/span_2] @min-[36rem]/list:block @min-[58rem]/list:row-[1/2]" />
              <Skeleton className="col-[4/5] row-[1/2] h-5 w-10 justify-self-end @min-[36rem]/list:col-[5/6] @min-[36rem]/list:row-[1/span_2] @min-[36rem]/list:self-center @min-[58rem]/list:row-[1/2]" />
            </DataRow>
          ))}
        </DataGroup>
      </DataList>
    </div>
  );
}
