"use client";

import * as React from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { useScrollEdges } from "@/components/ui/scroll-row";
import { isPlainClick, stayOnCurrentPage } from "@/lib/back-to-top";
import { publishToolbarSlot } from "@/components/ui/page-toolbar";

/**
 * The look of a tab and its indicator, shared by every row of tabs (a page's sections, a game's
 * Scoreboard/Analysis/Timeline/Build, a champion's views): the label in the secondary grey, brighter
 * while pointed at with a quiet line under it; the selected tab in the main text colour over a short
 * bar in the brand gradient (accent to accent-2). The 2px border keeps every tab the same height.
 */
export function tabIndicatorClass(on: boolean): string {
  return cn(
    "relative border-b-2 border-transparent after:pointer-events-none after:absolute after:inset-x-2 after:-bottom-0.5 after:h-0.5 after:rounded-full after:transition-opacity after:duration-150",
    on ? "text-fg after:bg-gradient-to-r after:from-accent after:to-accent-2" : "text-fg-muted after:bg-border-strong after:opacity-0 hover:text-fg hover:after:opacity-100",
  );
}

export interface TabBarItem {
  key: string;
  href: string;
  label: string;
  icon: LucideIcon;
  testId?: string;
}

/**
 * Marks a pinned bar while it is actually pinned (data-stuck): the stylesheet then gives it the
 * frame's ink and blur, and leaves it plain while it sits in the page. A bar is pinned once its top
 * edge has reached its sticky offset, which an observer with that offset taken off the top of the
 * window reports as the bar no longer wholly inside. Watched again when the window changes size
 * (the offset differs between a tablet and the sidebar's widths, and a short window pins nothing).
 */
function useStuck(ref: React.RefObject<HTMLElement | null>, enabled: boolean): boolean {
  const [stuck, setStuck] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;
    let observer: IntersectionObserver | null = null;
    const mark = (on: boolean) => {
      el.toggleAttribute("data-stuck", on);
      setStuck(on);
    };
    const watch = () => {
      observer?.disconnect();
      observer = null;
      mark(false);
      const style = getComputedStyle(el);
      if (style.position !== "sticky") return;
      const top = parseFloat(style.top) || 0;
      observer = new IntersectionObserver(
        ([entry]) => {
          if (entry) mark(entry.intersectionRatio < 1 && entry.boundingClientRect.top <= top + 1);
        },
        { threshold: [1], rootMargin: `-${Math.ceil(top) + 1}px 0px 0px 0px` },
      );
      observer.observe(el);
    };
    watch();
    window.addEventListener("resize", watch);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", watch);
      el.removeAttribute("data-stuck");
      setStuck(false);
    };
  }, [ref, enabled]);
  return stuck;
}

/**
 * The pinned row's end, where a page's compact controls are drawn once the row is pinned and the
 * page's own toolbar has gone up under it (ui/page-toolbar.tsx): published for the page while the
 * bar is on it, with whether the bar is pinned now.
 */
function useToolbarSlot(nav: React.RefObject<HTMLElement | null>, slot: React.RefObject<HTMLDivElement | null>, stuck: boolean, enabled: boolean) {
  React.useEffect(() => {
    const el = slot.current;
    const bar = nav.current;
    if (!enabled || !el || !bar) return;
    publishToolbarSlot({ el, bar, stuck }, el);
  }, [nav, slot, stuck, enabled]);
  React.useEffect(() => {
    const el = slot.current;
    return () => publishToolbarSlot(null, el);
  }, [slot]);
}

/**
 * Section tabs: the one way to move between the sections of a page (Team's sections, a player's
 * profile), the same on every screen. Every tab is a link with its own address, so Back/Forward,
 * new tabs and the keyboard work. On phones the tabs share the width when they fit; when they do
 * not, the bar scrolls sideways, an edge fades where more tabs are hidden and the current tab is
 * kept in view. `keepScroll`: the page stays where it is when the section changes (a profile, whose
 * header sits above its tabs). `sticky`: on tablets and desktops the bar stays pinned at the top of
 * the page once it has scrolled past it (under the tablet's top bar), so the sections stay in reach
 * however long the page (globals.css sticky-tabs; docs/RESPONSIVE.md → Shell); it must be a child of
 * the element the page scrolls through, never of a wrapper that ends with it. `end`: content at the
 * bar's right end (Team names the team there). `inner`: classes for the row's width, for a bar that
 * spans more than the pages under it (Team's, Resources' and Platform Settings' sections, a child of
 * `main` above pages centred in their own width). SectionTabs passes ROW_WIDTH: the bar's width in a
 * window under 1600px, the set's width from there. From 1600px the first tab starts at the pages'
 * column and `end` ends where it ends; the bar's line and its pinned background still span the bar.
 * The current tab, pressed again, keeps the page as it is (its view and filters, which its own link
 * leaves out) and goes back to the top, as the phone's tab bar does. `onChoose`: told which other tab
 * was pressed with a plain click, before the page changes.
 */
export function TabBar({ label, items, current, keepScroll = false, dense = false, sticky = false, className, testId, end, inner, onChoose }: { label: string; items: readonly TabBarItem[]; current: string; keepScroll?: boolean; dense?: boolean; sticky?: boolean; className?: string; testId?: string; end?: React.ReactNode; inner?: string; onChoose?: (key: string) => void }) {
  const listRef = React.useRef<HTMLUListElement>(null);
  const navRef = React.useRef<HTMLElement>(null);
  const slotRef = React.useRef<HTMLDivElement>(null);
  useScrollEdges(listRef, { keepCurrentInView: true, current });
  const stuck = useStuck(navRef, sticky);
  useToolbarSlot(navRef, slotRef, stuck, sticky);
  return (
    <nav ref={navRef} aria-label={label} className={cn("border-b border-border", sticky && "sticky-tabs", className)} data-testid={testId} data-sticky-tabs={sticky || undefined}>
      {/* The row: as wide as the bar, or as the pages under it (`inner`), centred as they are. Its
          width decides whether a page's compact controls show their labels (COMPACT_LABEL). */}
      <div className={cn("group/tabrow @container/tabrow mx-auto flex w-full min-w-0 items-end gap-4", inner)} data-testid={testId ? `${testId}-row` : undefined}>
        <ul ref={listRef} className="scroll-fade-x -mb-px flex min-w-0 flex-1 snap-x gap-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {items.map((s) => {
            const on = s.key === current;
            return (
              <li key={s.key} className="shrink-0 snap-start max-sm:grow">
                <Link
                  href={s.href}
                  aria-current={on ? "page" : undefined}
                  scroll={!keepScroll}
                  // The page keeps its place (ScrollOnNavigate leaves these links to the page).
                  data-keep-scroll={keepScroll ? "" : undefined}
                  onClick={(e) => {
                    // A click that opens a new tab or window leaves this page as it is: nothing to tell.
                    if (!stayOnCurrentPage(e, on) && isPlainClick(e)) onChoose?.(s.key);
                  }}
                  className={cn("inline-flex min-h-11 items-center gap-2 whitespace-nowrap px-3 text-sm font-medium transition-colors duration-150 max-sm:w-full max-sm:justify-center max-sm:px-2", dense && "lg:min-h-10", tabIndicatorClass(on))}
                  data-testid={s.testId}
                >
                  <s.icon className={cn("hidden h-4 w-4 sm:block", on ? "text-accent" : "text-fg-subtle")} aria-hidden />
                  {s.label}
                </Link>
              </li>
            );
          })}
        </ul>
        {/* While a page's compact controls are at the row's end, they take the place of `end` (Team's name). */}
        {end ? <span className="contents group-has-[[data-page-toolbar]]/tabrow:hidden">{end}</span> : null}
        {/* The pinned row's end, for a page's compact controls (PageToolbar draws them here); nothing while empty. */}
        {sticky ? <div ref={slotRef} className="flex shrink-0 items-center self-center empty:hidden" data-page-toolbar-slot="" /> : null}
      </div>
    </nav>
  );
}
