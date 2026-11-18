"use client";

import { isPlainClick } from "@/lib/back-to-top";
import { cn } from "@/lib/cn";
import { historyShowsEntries } from "@/lib/nav";

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
  row.scrollIntoView({ block: "start" });
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

/**
 * A long page's own sections, as a line of in-page links ("Season records · Multikills ·
 * Milestones"): where a phone's narrow column makes the page several screens long, the reader jumps
 * to a section instead of scrolling past the ones before it. Each is a plain link to its section's
 * anchor, so it works before the page's code has run and opens in a new tab like any link; once the
 * code runs, a plain click makes the jump itself (jumpToAnchor: an entry the phone's Back steps past,
 * the section in view under the bars and focused). Quiet text, the page's own ink: it is the page's
 * table of contents, not a choice of view (SubTabs) or a filter. 24px targets with a mouse, 44px on
 * touch screens without moving the line (touch-target).
 */
export function SectionIndex({ items, label = "On this page", className, testId = "section-index" }: { items: readonly SectionIndexItem[]; /** The navigation's name for screen readers. */ label?: string; className?: string; testId?: string }) {
  return (
    <nav aria-label={label} className={cn("min-w-0", className)} data-testid={testId}>
      <ul className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-sm">
        {items.map((item, i) => (
          <li key={item.id} className="flex min-w-0 items-center gap-x-1.5">
            {i ? (
              <span aria-hidden className="text-fg-subtle">
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
              className="touch-target inline-flex min-h-6 items-center rounded-sm font-medium text-fg-muted underline-offset-4 transition-colors duration-150 hover:text-fg hover:underline"
              data-testid={`${testId}-link`}
              data-target={item.id}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
