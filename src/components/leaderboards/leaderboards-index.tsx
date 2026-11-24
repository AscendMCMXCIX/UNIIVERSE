"use client";

import * as React from "react";
import { COMPACT_CONTROL, PageToolbar, useScrolledAway } from "@/components/ui/page-toolbar";
import { SectionIndex, type SectionIndexItem } from "@/components/ui/section-index";
import { cn } from "@/lib/cn";

/*
  The Leaderboards index in reach at any scroll (UD.L1, UM.L1). The page's own index sits under its
  header on a one-column page (from 59rem every board is on the first screen); once the header has gone
  up out of view:
    from xl     a compact copy at the pinned Team tabs' end (PageToolbar, the pinned row's slot; below xl
                the row has no room for it beside the four tabs, and the index under the header serves);
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

/**
 * The phone's top bar's visible foot, in px from the window's top (it is sticky at 0), and its
 * element. Its first row slides away while the page scrolls down on a crowded phone (MobileNav's
 * data-hidden "row"; the whole bar, "true"), never while it holds the focus: the foot follows it,
 * and the chip row moves with the bar's own 200ms slide.
 */
function useTopBarFoot(): { foot: number | null; bar: HTMLElement | null } {
  const [state, setState] = React.useState<{ foot: number | null; bar: HTMLElement | null }>({ foot: null, bar: null });
  React.useEffect(() => {
    const bar = document.querySelector<HTMLElement>("[data-testid=mobile-topbar]");
    if (!bar) return;
    const measure = () => {
      const hidden = bar.matches(":focus-within") ? null : bar.dataset.hidden;
      const row = bar.querySelector<HTMLElement>("[data-testid=mobile-topbar-row]")?.offsetHeight ?? 0;
      const shift = hidden === "true" ? bar.offsetHeight : hidden === "row" ? row : 0;
      setState({ foot: bar.offsetHeight ? bar.offsetHeight - shift : null, bar });
    };
    measure();
    const sized = new ResizeObserver(measure);
    sized.observe(bar);
    const slid = new MutationObserver(measure);
    slid.observe(bar, { attributes: true, attributeFilter: ["data-hidden", "data-slides"] });
    const onFocus = () => requestAnimationFrame(measure);
    bar.addEventListener("focusin", onFocus);
    bar.addEventListener("focusout", onFocus);
    return () => {
      sized.disconnect();
      slid.disconnect();
      bar.removeEventListener("focusin", onFocus);
      bar.removeEventListener("focusout", onFocus);
    };
  }, []);
  return state;
}

/** What the row adds to the phone's scroll padding before it has been drawn: a 2.75rem chip, its 0.25rem padding above and below, a 1px line. */
const ROW_ESTIMATE = "calc(3.25rem + 1px)";

/**
 * On phones the root's scroll padding is MobileNav's (the top bar as it stays over the page, which it
 * also writes on the bar as --bar-pad) plus the chip row's (its height once drawn, else
 * ROW_ESTIMATE), so a section jumped to, or what the focus moves to, stops clear of both (WCAG
 * 2.4.11). Written in a layout effect, before any effect of the page's (the old Records address lands
 * on its section in one), and again whenever MobileNav rewrites its own (the bar's style, size or
 * slide changes); MobileNav's value is put back on leaving.
 */
function useRowScrollPadding(row: HTMLElement | null | "none") {
  React.useLayoutEffect(() => {
    const bar = document.querySelector<HTMLElement>("[data-testid=mobile-topbar]");
    if (!bar || row === "none") return;
    const phone = window.matchMedia("(max-width: 47.99rem) and (min-height: 481px)");
    const root = document.documentElement;
    let own = "";
    let written = "";
    let theirs = "";
    const apply = () => {
      // MobileNav's value, or before its first write (its effect runs after this one) the whole bar's, as it is on arrival.
      const pad = bar.style.getPropertyValue("--bar-pad") || (bar.offsetHeight ? `${bar.offsetHeight + 8}px` : "");
      if (!phone.matches || !pad) return;
      const extra = row ? `${row.offsetHeight}px` : ROW_ESTIMATE;
      const next = `calc(${pad} + ${extra})`;
      // The bar's own controls take the row back too (globals.css), so pressing them never scrolls the page.
      if (bar.style.getPropertyValue("--bar-extra") !== extra) bar.style.setProperty("--bar-extra", extra);
      if (written === next && root.style.scrollPaddingTop === own) return;
      theirs = pad;
      written = next;
      root.style.scrollPaddingTop = next;
      // As the browser stores it (it simplifies a calc: "calc(53px + 53px)" reads back "calc(106px)"), for the checks above and below.
      own = root.style.scrollPaddingTop;
    };
    apply();
    // After MobileNav's own observers (registered earlier, so they run first): its value, then this one.
    const sized = new ResizeObserver(apply);
    sized.observe(bar);
    if (row) sized.observe(row);
    const restyled = new MutationObserver(apply);
    restyled.observe(bar, { attributes: true, attributeFilter: ["style", "data-slides", "data-hidden"] });
    restyled.observe(root, { attributes: true, attributeFilter: ["style"] });
    return () => {
      sized.disconnect();
      restyled.disconnect();
      if (own && root.style.scrollPaddingTop === own) root.style.scrollPaddingTop = theirs;
      bar.style.removeProperty("--bar-extra");
    };
  }, [row]);
}

export function LeaderboardsPinnedIndex({ anchorId, items, phoneItems }: { /** The header's id: once it has gone up, the copies show. */ anchorId: string; items: readonly SectionIndexItem[]; /** The phone's row, in short words, so four chips fit a line at 375 (two lines at most at 320 or large text). */ phoneItems: readonly SectionIndexItem[] }) {
  const header = useElementById(anchorId);
  // PageToolbar watches a ref: this one always holds the header.
  const anchor = React.useMemo(() => ({ current: header }), [header]);
  const { foot } = useTopBarFoot();
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
    // Nothing added where the chips would not fit (large text): the row is not drawn there.
  useRowScrollPadding(!fits ? "none" : away ? row : null);
  return (
    <>
      {header ? (
        <PageToolbar anchor={anchor} label="Leaderboards sections">
          {/* From xl only: below it (a tablet, a 1024 window beside the sidebar) Team's four tabs and the index did not fit the row
              together, the tab list scrolled under the index and a press on "Matches" landed on "Recent form" (Release 16); there
              the index under the header, at the page's top, is the way. */}
          <span className="contents max-xl:hidden">
            <SectionIndex items={items} label="Leaderboards sections" testId="pinned-section-index" spy listClassName="flex-nowrap gap-x-1.5" separatorClassName="hidden" linkClassName={(on) => cn(CHIP, COMPACT_CONTROL, "touch-target", chipLook(on))} />
          </span>
        </PageToolbar>
      ) : null}
      {/* Phones: under the top bar (fixed at its foot, so the page never moves), once the header has gone up under it. */}
      {away && foot ? (
        <div ref={setRow} className={cn("fixed inset-x-0 z-30 border-b border-border bg-bg/95 px-4 py-1 backdrop-blur-md transition-[top] duration-200 ease-out motion-safe:animate-[fade-in_160ms_var(--ease-emphasized)] motion-reduce:transition-none md:hidden short:hidden", !fits && "invisible")} style={{ top: foot }} aria-hidden={fits ? undefined : true} data-fits={fits ? "" : undefined} data-testid="leaderboards-chip-row">
          <SectionIndex items={phoneItems} label="Leaderboards sections" testId="phone-section-index" spy listClassName="gap-x-2 gap-y-1" separatorClassName="hidden" linkClassName={(on) => cn(CHIP, "h-11 [scroll-margin-top:-100vh]", chipLook(on))} />
        </div>
      ) : null}
    </>
  );
}
