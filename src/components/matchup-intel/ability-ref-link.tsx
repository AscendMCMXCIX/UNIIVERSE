"use client";

import type * as React from "react";
import { jumpToAnchor } from "@/components/ui/section-index";

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
