"use client";

import type * as React from "react";
import { jumpToAnchor } from "@/components/ui/section-index";

const SIZES = {
  sm: "touch-target inline-flex min-h-6 items-center rounded-full border border-border-strong bg-surface-2 px-2 text-xs font-medium leading-tight text-fg-muted transition-colors hover:border-accent/60 hover:text-fg",
  md: "touch-target inline-flex min-h-7 items-center rounded-full border border-border-strong bg-surface-2 px-2.5 text-xs font-medium text-fg-muted transition-colors hover:border-accent/60 hover:text-fg",
  chip: "touch-target inline-flex items-center rounded-full border border-border-strong bg-surface-2 px-2 py-0.5 text-xs font-medium leading-tight text-fg-muted transition-colors before:absolute before:inset-x-0 before:-inset-y-0.5 before:content-[''] hover:border-accent/60 hover:text-fg",
} as const;

/**
 * A chip that jumps to the row of the ability a briefing point rests on ("Renekton W"). It is a
 * plain link to the row's anchor, so it works before the page's code has run and opens in a new tab
 * like any link; once the code runs, a plain click makes the jump itself (jumpToAnchor).
 */
export function AbilityRefLink({ anchor, children, size = "md", className, testId = "briefing-ability", label }: { anchor: string; children: React.ReactNode; /** In place of a size's look (the phone's glance tiles). */ className?: string; testId?: string; /** The link's accessible name, where its words are short forms. */ label?: string; /** sm: a chip in a line of text or a dense list (24px; 44px of target on touch screens). chip: the key that starts a line of fact chips, as tall as they are (21px, its target reaching 25px with a pseudo-element that takes no room; 44px on touch screens). */ size?: "sm" | "md" | "chip" }) {
  return (
    <a
      href={`#${anchor}`}
      onClick={(e) => {
        // A click that asks for another tab or window is the browser's.
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        jumpToAnchor(anchor);
      }}
      className={className ?? SIZES[size]}
      aria-label={label}
      data-testid={testId}
      data-anchor={anchor}
    >
      {children}
    </a>
  );
}
