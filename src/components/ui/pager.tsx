"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { MOUSE_BUTTON_REM, pagerFold, pagerItems, widestItems } from "./pager-data";
import { rootPx } from "./posture";

/*
  Pager (docs/DESIGN_SYSTEM.md §7, "Paged list"): compact page controls, arrows, the ends and the
  neighbourhood of the current page. Their targets are 44px on a touch screen (a finger, phones and
  tablets alike), 32px with a mouse from md and 40px below it. A line too narrow for every button
  leaves the pages either side of the current one to the arrows, so both arrows stay on the line,
  at its ends (pager-data.ts).

  Two layouts:
  - "stacked": Match History's own (Release 16, the owner's approved look), the buttons over the
    range, centred; it folds by its current line and wraps only past that (very large text);
  - "inline": a workspace footer's (All Champions, 27 Nov 2026), the range then the buttons on one
    line at the footer's right. It folds by the widest line its page count draws and reserves the
    range's widest text, so it never changes its width or its fold as the reader turns its pages.

  A page change the reader makes (a button here, or a list's keys) is read out once, politely, by the
  `live` words the list gives (never after a resize or a measure). The focus stays on the pressed
  button (the buttons are keyed by page); where it folds away, disappears or is disabled at an end,
  it goes to the current page's button.
*/

const ARROW = "grid h-10 w-10 place-items-center rounded-lg border border-border text-fg-muted hover:border-border-strong hover:text-fg disabled:cursor-not-allowed disabled:text-fg-disabled disabled:hover:border-border disabled:hover:text-fg-disabled pointer-coarse:h-11 pointer-coarse:w-11 md:pointer-fine:h-8 md:pointer-fine:w-8";
const PAGE = "h-10 min-w-10 rounded-lg px-1.5 text-sm tabular-nums pointer-coarse:h-11 pointer-coarse:min-w-11 md:pointer-fine:h-8 md:pointer-fine:min-w-8";

export interface PagerProps {
  layout: "stacked" | "inline";
  /** The nav's name: "Champion pages", "Lane opponent pages", "Darius's games, pages". */
  label: string;
  /** 1-based. */
  page: number;
  pages: number;
  onPage: (page: number) => void;
  /** "8–14 of 30" (inline: the noun read out only, `<span className="sr-only">Champions </span>8–14 of 30`). */
  range: React.ReactNode;
  /** Inline: the widest range text for this total (`${total}–${total} of ${total}`), reserved as its least width. */
  widest?: string;
  /** The range's id (a list's aria-describedby names it). */
  rangeId?: string;
  prevLabel: string;
  nextLabel: string;
  /** Match History's pending page. */
  disabled?: boolean;
  /** Inline: the words read out after a page change the reader made (empty otherwise). */
  live?: string;
  testId: string;
  prevTestId: string;
  nextTestId: string;
}

export function Pager(p: PagerProps) {
  return p.layout === "stacked" ? <StackedPager {...p} /> : <InlinePager {...p} />;
}

const gap = (key: string, className?: string) => (
  <span key={key} className={cn("px-0.5 text-fg-subtle", className)} aria-hidden>
    …
  </span>
);

/** Match History's: the DOM it has drawn since Release 16, unchanged. */
function StackedPager({ label, page, pages, onPage, range, prevLabel, nextLabel, disabled = false, testId, prevTestId, nextTestId }: PagerProps) {
  const items = pagerItems(page, pages);
  const fold = pagerFold(items);
  return (
    <nav aria-label={label} className="@container/pages flex flex-wrap items-center justify-center gap-x-3 gap-y-1" data-testid={testId}>
      <span className="flex flex-wrap items-center justify-center gap-1">
        <button type="button" disabled={page <= 1 || disabled} onClick={() => onPage(page - 1)} className={ARROW} aria-label={prevLabel} data-testid={prevTestId}>
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        {items.map((item, i) =>
          "gap" in item ? (
            gap(`g${i}`)
          ) : (
            <React.Fragment key={item.page}>
              {item.jump ? gap(`j${item.page}`, fold.show) : null}
              <button type="button" aria-current={item.page === page ? "page" : undefined} aria-label={`Page ${item.page}`} onClick={() => onPage(item.page)} className={cn(PAGE, item.page === page ? "bg-accent/15 font-semibold text-accent" : "text-fg-muted hover:bg-surface-2 hover:text-fg", item.folds && fold.hide)}>
                {item.page}
              </button>
            </React.Fragment>
          ),
        )}
        <button type="button" disabled={page >= pages || disabled} onClick={() => onPage(page + 1)} className={ARROW} aria-label={nextLabel} data-testid={nextTestId}>
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </span>
      <span className="text-xs tabular-nums text-fg-subtle">{range}</span>
    </nav>
  );
}

/** A workspace footer's: the range and the buttons on one line, at a constant width. */
function InlinePager({ label, page, pages, onPage, range, widest, rangeId, prevLabel, nextLabel, disabled = false, live = "", testId, prevTestId, nextTestId }: PagerProps) {
  const navRef = React.useRef<HTMLElement>(null);
  const rangeRef = React.useRef<HTMLSpanElement>(null);
  const pressed = React.useRef(false);
  const [folded, setFolded] = React.useState(false);
  // Folded or not by the widest line this many pages draw, against the room the footer leaves it.
  React.useLayoutEffect(() => {
    const nav = navRef.current;
    const at = rangeRef.current;
    if (!nav || !at || pages <= 1) return;
    const fold = pagerFold(widestItems(pages), MOUSE_BUTTON_REM);
    const check = () => {
      if (!fold.hide) return setFolded(false);
      const room = nav.clientWidth - at.getBoundingClientRect().width - (parseFloat(getComputedStyle(nav).columnGap) || 0);
      setFolded(room < fold.below * rootPx() - 0.5);
    };
    check();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(check) : null;
    observer?.observe(nav);
    return () => observer?.disconnect();
  }, [pages]);
  // The focus after a press: on the pressed button where it still stands, else on the current page's.
  React.useLayoutEffect(() => {
    if (!pressed.current) return;
    pressed.current = false;
    const nav = navRef.current;
    const at = document.activeElement as HTMLButtonElement | null;
    if (!nav || (at && at !== document.body && nav.contains(at) && !at.disabled)) return;
    nav.querySelector<HTMLButtonElement>("[aria-current=page]")?.focus({ preventScroll: true });
  }, [page, folded]);
  const go = (to: number) => {
    pressed.current = true;
    onPage(to);
  };
  const items = pagerItems(page, pages);
  return (
    <>
      <nav ref={navRef} aria-label={label} className="flex min-w-0 flex-1 items-center justify-end gap-3" data-testid={testId} data-folded={folded || undefined}>
        <span ref={rangeRef} id={rangeId} className="shrink-0 whitespace-nowrap text-right text-xs tabular-nums text-fg-subtle" style={widest ? { minWidth: `${widest.length}ch` } : undefined} data-testid={`${testId}-range`}>
          {range}
        </span>
        {pages > 1 ? (
          <span className="flex shrink-0 items-center gap-1">
            <button type="button" disabled={page <= 1 || disabled} onClick={() => go(page - 1)} className={ARROW} aria-label={prevLabel} data-testid={prevTestId}>
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            {items.map((item, i) =>
              "gap" in item ? (
                gap(`g${i}`)
              ) : (
                <React.Fragment key={item.page}>
                  {item.jump && folded ? gap(`j${item.page}`) : null}
                  {item.folds && folded ? null : (
                    <button type="button" aria-current={item.page === page ? "page" : undefined} aria-label={`Page ${item.page}`} onClick={() => go(item.page)} className={cn(PAGE, item.page === page ? "bg-accent/15 font-semibold text-accent" : "text-fg-muted hover:bg-surface-2 hover:text-fg")} data-page={item.page}>
                      {item.page}
                    </button>
                  )}
                </React.Fragment>
              ),
            )}
            <button type="button" disabled={page >= pages || disabled} onClick={() => go(page + 1)} className={ARROW} aria-label={nextLabel} data-testid={nextTestId}>
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </span>
        ) : null}
      </nav>
      <span className="sr-only" aria-live="polite" data-testid={`${testId}-live`}>
        {live}
      </span>
    </>
  );
}
