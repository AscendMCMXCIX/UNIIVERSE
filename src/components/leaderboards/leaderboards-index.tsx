"use client";

import * as React from "react";
import { COMPACT_CONTROL, PageToolbar, useScrolledAway } from "@/components/ui/page-toolbar";
import { SectionIndex, type SectionIndexItem } from "@/components/ui/section-index";
import { cn } from "@/lib/cn";

/*
  The Leaderboards index in reach at any scroll (UD.L1, UM.L1). The page's own index sits in its
  header (59–86rem of page) or under it (one column); once the header has gone up out of view:
    from md     a compact copy at the pinned Team tabs' end (PageToolbar, the pinned row's slot);
    phones      a 44px chip row pinned under the top bar (below md, never in a short window, where
                the bars themselves slide away), the section being read marked.
  Both are plain in-page links (SectionIndex: jumpToAnchor, an entry the phone's Back steps past).
  Nothing is drawn until the header has gone, so nothing moves on the first screen. On phones the
  page's scroll padding takes the row's height as well as the top bar's while the page is open, so
  a section jumped to, or whatever the focus moves to, stops clear of the row (WCAG 2.4.11), even
  from the index under the header, where the row appears as the header goes up.
*/

/** A chip of the index: 44px on touch screens (the phone's row), the pinned row's height from md. */
const CHIP = "inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent";
const chipLook = (on: boolean) => (on ? "border-accent bg-accent/15 text-fg" : "border-border bg-surface text-fg-muted hover:border-border-strong hover:text-fg");

/** The element with this id, once the page has mounted (a server-rendered header). */
const noSubscribe = () => () => {};
function useElementById(id: string): HTMLElement | null {
  return React.useSyncExternalStore(
    noSubscribe,
    () => document.getElementById(id),
    () => null,
  );
}

/** The phone's top bar's bottom edge, in px from the window's top (it is sticky at 0), while it is shown. */
function useTopBarFoot(): number | null {
  const [foot, setFoot] = React.useState<number | null>(null);
  React.useEffect(() => {
    const bar = document.querySelector<HTMLElement>("[data-testid=mobile-topbar]");
    if (!bar) return;
    const measure = () => setFoot(bar.offsetHeight || null);
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);
  return foot;
}

/** What the row adds to the phone's scroll padding before it has been drawn: a 2.75rem chip, its 0.25rem padding above and below, a 1px line. */
const ROW_ESTIMATE = "calc(3.25rem + 1px)";

/**
 * On phones the root's scroll padding is the top bar's (MobileNav writes it) plus the chip row's
 * (its height once drawn, else ROW_ESTIMATE): written in a layout effect, before any effect of the
 * page's (the old Records address lands on its section in one), and again whenever the bar or the
 * row changes size (this observer is registered after MobileNav's, so it writes last); MobileNav's
 * own value is put back on leaving.
 */
function useRowScrollPadding(row: HTMLElement | null) {
  React.useLayoutEffect(() => {
    const bar = document.querySelector<HTMLElement>("[data-testid=mobile-topbar]");
    const phone = window.matchMedia("(max-width: 47.99rem) and (min-height: 481px)");
    if (!bar) return;
    const root = document.documentElement;
    let own = "";
    const apply = () => {
      if (!phone.matches || !bar.offsetHeight) return;
      own = `calc(${bar.offsetHeight + 8}px + ${row ? `${row.offsetHeight}px` : ROW_ESTIMATE})`;
      root.style.scrollPaddingTop = own;
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(bar);
    if (row) observer.observe(row);
    return () => {
      observer.disconnect();
      if (own && root.style.scrollPaddingTop === own) root.style.scrollPaddingTop = `${bar.offsetHeight + 8}px`;
    };
  }, [row]);
}

export function LeaderboardsPinnedIndex({ anchorId, items, phoneItems }: { /** The header's id: once it has gone up, the copies show. */ anchorId: string; items: readonly SectionIndexItem[]; /** The phone's row, in short words, so four chips fit a line at 375 (two lines at most at 320 or large text). */ phoneItems: readonly SectionIndexItem[] }) {
  const header = useElementById(anchorId);
  // PageToolbar watches a ref: this one always holds the header.
  const anchor = React.useMemo(() => ({ current: header }), [header]);
  const foot = useTopBarFoot();
  const away = useScrolledAway(header, foot);
  const [row, setRow] = React.useState<HTMLDivElement | null>(null);
  // At a large text size the chips can need more than two lines (a third of a 320px phone at 200%): the row is then not
  // drawn, and the index under the header is the way (the page is not held under a band of chips).
  const [fits, setFits] = React.useState(true);
  React.useLayoutEffect(() => {
    if (!row) return;
    const check = () => setFits(new Set([...row.querySelectorAll("a")].map((a) => Math.round(a.getBoundingClientRect().top))).size <= 2);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(row);
    return () => observer.disconnect();
  }, [row]);
  useRowScrollPadding(away && fits ? row : null);
  return (
    <>
      {header ? (
        <PageToolbar anchor={anchor} label="Leaderboards sections">
          <SectionIndex items={items} label="Leaderboards sections" testId="pinned-section-index" spy listClassName="flex-nowrap gap-x-1.5" separatorClassName="hidden" linkClassName={(on) => cn(CHIP, COMPACT_CONTROL, "touch-target", chipLook(on))} />
        </PageToolbar>
      ) : null}
      {/* Phones: under the top bar (fixed at its foot, so the page never moves), once the header has gone up under it. */}
      {away && foot ? (
        <div ref={setRow} className={cn("fixed inset-x-0 z-30 border-b border-border bg-bg/95 px-4 py-1 backdrop-blur-md motion-safe:animate-[fade-in_160ms_var(--ease-emphasized)] md:hidden short:hidden", !fits && "invisible")} style={{ top: foot }} aria-hidden={fits ? undefined : true} data-fits={fits ? "" : undefined} data-testid="leaderboards-chip-row">
          <SectionIndex items={phoneItems} label="Leaderboards sections" testId="phone-section-index" spy listClassName="gap-x-2 gap-y-1" separatorClassName="hidden" linkClassName={(on) => cn(CHIP, "h-11", chipLook(on))} />
        </div>
      ) : null}
    </>
  );
}
