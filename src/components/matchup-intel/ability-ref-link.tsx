"use client";

import type * as React from "react";

/**
 * A chip that jumps to the row of the ability a briefing point rests on ("Renekton W"). It is a
 * plain link to the row's anchor, so it works before the page's code has run; once it has, a row
 * inside a closed section (your own champion's abilities, collapsed) is opened first, so the jump
 * always lands on something visible.
 */
export function AbilityRefLink({ anchor, children }: { anchor: string; children: React.ReactNode }) {
  return (
    <a
      href={`#${anchor}`}
      onClick={() => {
        let el = document.getElementById(anchor)?.parentElement?.closest("details:not([open])") as HTMLDetailsElement | null | undefined;
        while (el) {
          el.open = true;
          el = el.parentElement?.closest("details:not([open])") as HTMLDetailsElement | null | undefined;
        }
      }}
      className="touch-target inline-flex min-h-7 items-center rounded-full border border-border-strong bg-surface-2 px-2.5 text-xs font-medium text-fg-muted transition-colors hover:border-accent/60 hover:text-fg"
      data-testid="briefing-ability"
      data-anchor={anchor}
    >
      {children}
    </a>
  );
}
