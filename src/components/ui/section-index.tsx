"use client";

import * as React from "react";
import { isPlainClick } from "@/lib/back-to-top";
import { cn } from "@/lib/cn";
import { historyShowsEntries } from "@/lib/nav";
import { scrollToStart } from "@/lib/screen";

/**
 * Jumps to the element with this id, as following a link to it would, through the router's own
 * history: a closed section it sits in (a collapsed <details>) is opened first; the anchor is written
 * into the address with history.pushState (replaceState where the browser has no Navigation API, see
 * historyShowsEntries), which Next.js's router extends to copy its own state into the entry; the
 * element is brought into view, clear of the bars (the page's scroll padding), and takes the focus
 * until it moves on (tabIndex -1 meanwhile, so a click inside it never focuses it), so a screen
 * reader lands there too. The browser's own jump to an anchor makes an entry without that state,
 * which the router does not restore: after a later choice on the page (a view, a pair), Back would
 * show that choice under the jump's address. With no such element on the page there is nothing to
 * jump to, and the address is left as it is. Every in-page link uses it: SectionIndex's, and Matchup
 * Intel's chips that jump to an ability's row (AbilityRefLink).
 */
export function jumpToAnchor(anchor: string): void {
  const row = document.getElementById(anchor);
  if (!row) return;
  for (let d = row.parentElement?.closest("details:not([open])"); d; d = d.parentElement?.closest("details:not([open])")) (d as HTMLDetailsElement).open = true;
  const hash = `#${anchor}`;
  // An entry of its own where the phone's Back can step past it (backSteps); else the entry is replaced.
  if (window.location.hash !== hash) {
    if (historyShowsEntries()) window.history.pushState(null, "", hash);
    else window.history.replaceState(null, "", hash);
  }
  // Under the bars as they will be once landed (a phone's sliding bar row comes back on a jump up).
  scrollToStart(row, "auto");
  if (!row.hasAttribute("tabindex")) {
    row.setAttribute("tabindex", "-1");
    row.addEventListener("blur", () => row.removeAttribute("tabindex"), { once: true });
  }
  row.focus({ preventScroll: true });
}

export interface SectionIndexItem {
  /** The id of the section it jumps to. */
  id: string;
  label: string;
}

/** A link's own look: quiet text, the page's ink (a page's linkClassName replaces it). */
const SECTION_INDEX_LINK = "touch-target inline-flex min-h-6 items-center rounded-sm font-medium text-fg-muted underline-offset-4 transition-colors duration-150 hover:text-fg hover:underline";

/**
 * The section being read, for `spy`: the last one whose top has passed the upper third of the
 * window, or the last one once a page that scrolls is at its end; the first until the page has
 * hydrated and measured. Off (null) without ids.
 */
function useSectionInView(ids: string): string | null {
  const [current, setCurrent] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!ids) return;
    const list = ids.split(" ");
    let frame = 0;
    let jumped: string | null = null;
    let landed = false;
    const onJump = (e: MouseEvent) => {
      const href = (e.target as Element | null)?.closest?.("a[href^='#']")?.getAttribute("href");
      if (href && list.includes(href.slice(1))) {
        jumped = href.slice(1);
        landed = false;
      }
    };
    const update = () => {
      frame = 0;
      const line = window.innerHeight / 3;
      let at = list[0]!;
      for (const id of list) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) at = id;
      }
      // A section the reader jumped to stays the one being read while it is at the window's top, even where a short panel puts the next one's top above the line (Settings' Name over Password, G3-5).
      const target = jumped ? document.getElementById(jumped) : null;
      const top = target?.getBoundingClientRect().top;
      // (Until it has landed there, a smooth jump may still be on its way.)
      const held = top !== undefined && top >= -2 && top <= line;
      if (held) {
        at = jumped!;
        landed = true;
      } else if (landed) jumped = null;
      // At the page's top, the first section; at its end, the last (at its end unless the reader jumped to a section now at the window's top: a tall window can end the page right under it).
      if (window.scrollY <= 0) at = list[0]!;
      const root = document.documentElement;
      if (!held && window.scrollY > 0 && window.scrollY + window.innerHeight >= root.scrollHeight - 2) at = list[list.length - 1]!;
      setCurrent(at);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    document.addEventListener("click", onJump, true);
    return () => {
      document.removeEventListener("click", onJump, true);
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [ids]);
  return ids ? current : null;
}

/**
 * A long page's own sections, as a line of in-page links ("Season records · Multikills ·
 * Milestones"): where a phone's narrow column makes the page several screens long, the reader jumps
 * to a section instead of scrolling past the ones before it. Each is a plain link to its section's
 * anchor, so it works before the page's code has run and opens in a new tab like any link; once the
 * code runs, a plain click makes the jump itself (jumpToAnchor: an entry the phone's Back steps past,
 * the section in view under the bars and focused). Quiet text, the page's own ink: it is the page's
 * table of contents, not a choice of view (SubTabs) or a filter. 24px targets with a mouse, 44px on
 * touch screens without moving the line (touch-target).
 *
 * Optional, for a page that keeps its index in view (Settings' account card): `spy` marks the section
 * being read (aria-current="location"); `listClassName`, `linkClassName` (told whether its link is
 * the one being read) and `separatorClassName` restyle the list, its links and the dots between
 * them. Without them the index is exactly the line above. `clipLineDots`: where the line wraps (a
 * phone's Branding index), no line starts with a dot: each dot sits in the gap before its link, and
 * the dot of a line's first link falls outside the list's left edge, which clips it (G4-13).
 */
export function SectionIndex({
  items,
  label = "On this page",
  className,
  testId = "section-index",
  spy = false,
  listClassName,
  linkClassName,
  separatorClassName,
  clipLineDots = false,
}: {
  items: readonly SectionIndexItem[];
  /** The navigation's name for screen readers. */
  label?: string;
  className?: string;
  testId?: string;
  spy?: boolean;
  listClassName?: string;
  linkClassName?: (current: boolean) => string;
  separatorClassName?: string;
  /** Hide the dot that would start a wrapped line. */
  clipLineDots?: boolean;
}) {
  const current = useSectionInView(spy ? items.map((i) => i.id).join(" ") : "");
  return (
    <nav aria-label={label} className={cn("min-w-0", className)} data-testid={testId}>
      {/* clipLineDots: a 6px gap, the 8px dot, a 6px gap (gap-x-5), each dot pulled back over the gap
          before it (-ml-3.5); at a line's start that puts the dot left of the list, past its 4px of
          room for a focus ring (-ml-1 pl-1), where the horizontal clip hides it. Vertical overflow
          stays visible, so the links' 44px touch areas are whole. */}
      <ul className={cn("flex min-w-0 flex-wrap items-center gap-x-1.5 text-sm", clipLineDots && "-ml-1 gap-x-5 overflow-x-clip pl-1", listClassName)}>
        {items.map((item, i) => {
          const on = current === item.id;
          return (
            <li key={item.id} className={cn("flex min-w-0 items-center gap-x-1.5", clipLineDots && i > 0 && "-ml-3.5")}>
              {i ? (
                <span aria-hidden className={cn("text-fg-subtle", clipLineDots && "w-2 shrink-0 text-center", separatorClassName)} data-section-dot="">
                  ·
                </span>
              ) : null}
              <a
                href={`#${item.id}`}
                onClick={(e) => {
                  // A click that asks for another tab or window is the browser's.
                  if (!isPlainClick(e)) return;
                  e.preventDefault();
                  jumpToAnchor(item.id);
                }}
                aria-current={on ? "location" : undefined}
                className={linkClassName ? linkClassName(on) : SECTION_INDEX_LINK}
                data-testid={`${testId}-link`}
                data-target={item.id}
              >
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
