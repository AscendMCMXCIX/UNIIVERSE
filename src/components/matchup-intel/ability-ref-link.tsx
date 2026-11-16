"use client";

import type * as React from "react";

/**
 * Jumps to the row with this anchor, as following a link to it would, through the router's own
 * history: a closed section the row sits in (your own champion's abilities, collapsed) is opened
 * first; the anchor is written into the address with history.pushState, which Next.js's router
 * extends to copy its own state into the new entry; the row is brought into view and takes the
 * focus until it moves on (tabIndex -1 meanwhile, so a click inside a row never focuses it), so a
 * screen reader lands there too. The browser's own jump to an anchor makes an entry without that
 * state, which the router does not restore: after a later choice of champions, Back would show that
 * choice under this pair's address. With no such row on the page (abilities not stored yet) there
 * is nothing to jump to, and the address is left as it is.
 */
export function jumpToAnchor(anchor: string): void {
  const row = document.getElementById(anchor);
  if (!row) return;
  for (let d = row.parentElement?.closest("details:not([open])"); d; d = d.parentElement?.closest("details:not([open])")) (d as HTMLDetailsElement).open = true;
  const hash = `#${anchor}`;
  if (window.location.hash !== hash) window.history.pushState(null, "", hash);
  row.scrollIntoView({ block: "start" });
  if (!row.hasAttribute("tabindex")) {
    row.setAttribute("tabindex", "-1");
    row.addEventListener("blur", () => row.removeAttribute("tabindex"), { once: true });
  }
  row.focus({ preventScroll: true });
}

/**
 * A chip that jumps to the row of the ability a briefing point rests on ("Renekton W"). It is a
 * plain link to the row's anchor, so it works before the page's code has run and opens in a new tab
 * like any link; once the code runs, a plain click makes the jump itself (jumpToAnchor).
 */
export function AbilityRefLink({ anchor, children }: { anchor: string; children: React.ReactNode }) {
  return (
    <a
      href={`#${anchor}`}
      onClick={(e) => {
        // A click that asks for another tab or window is the browser's.
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        jumpToAnchor(anchor);
      }}
      className="touch-target inline-flex min-h-7 items-center rounded-full border border-border-strong bg-surface-2 px-2.5 text-xs font-medium text-fg-muted transition-colors hover:border-accent/60 hover:text-fg"
      data-testid="briefing-ability"
      data-anchor={anchor}
    >
      {children}
    </a>
  );
}
