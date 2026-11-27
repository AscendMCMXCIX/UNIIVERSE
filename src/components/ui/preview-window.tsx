"use client";

import type * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DetailModal } from "./detail-modal";
import { WINDOW_CONTROL_TOUCH } from "./window-control";
import { formatCount } from "@/lib/format";

/*
  PreviewWindow: the phone window shell (PLAN S4a, container 8; docs/DESIGN_SYSTEM.md §7). The
  window an item opens in on a touch phone or in a short window: a Peek's (a player, a champion)
  and a game's. It is DetailModal at a whole-screen size, which gives the shell itself:
  - its header collapses to a 56px bar once the body scrolls (DetailModal's `compact`);
  - pulling the header (or that bar) down closes it, as a sheet closes (useSheetDrag's handles);
  - focus goes back to what opened it without scrolling the page, which never moves (UM.X4).
  What it adds is the one ‹ › for the item's siblings, where the opener has siblings (the rows of
  the list it was opened from), beside the close button, with the same names and the same size on
  every window.
*/

export interface PreviewSiblings {
  prev: (() => void) | null;
  next: (() => void) | null;
  /** What the items are, for the buttons' names ("player": "Previous player"). */
  label: string;
  prevTestId?: string;
  nextTestId?: string;
}

/** The look of a window's and a Peek's own controls (‹ ›, ✕): 36px, 44px on touch screens (WINDOW_CONTROL_TOUCH). */
export const PREVIEW_NAV = `inline-flex h-9 w-9 items-center justify-center rounded-lg bg-bg/60 text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:cursor-not-allowed disabled:text-fg-disabled disabled:hover:bg-bg/60 disabled:hover:text-fg-disabled focus-visible:outline-2 focus-visible:outline-accent ${WINDOW_CONTROL_TOUCH}`;

/**
 * ‹ › for an item's siblings: disabled at either end of the list, never wrapping. With `position`,
 * where the item stands between them ("3 of 40", read as "Opponent 3 of 40").
 */
export function SiblingSteps({ siblings, position }: { siblings: PreviewSiblings; position?: { at: number; of: number } }) {
  const label = siblings.label.toLowerCase();
  return (
    <>
      <button type="button" onClick={siblings.prev ?? undefined} disabled={!siblings.prev} aria-label={`Previous ${label}`} className={PREVIEW_NAV} data-testid={siblings.prevTestId}>
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </button>
      {position ? (
        <span className="whitespace-nowrap px-0.5 text-xs tabular-nums text-fg-subtle" data-testid="sibling-position">
          <span className="sr-only">{siblings.label} </span>
          {formatCount(position.at)} of {formatCount(position.of)}
        </span>
      ) : null}
      <button type="button" onClick={siblings.next ?? undefined} disabled={!siblings.next} aria-label={`Next ${label}`} className={PREVIEW_NAV} data-testid={siblings.nextTestId}>
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
    </>
  );
}

export function PreviewWindow({ siblings, headerExtra, size = "standard", ...modal }: Omit<React.ComponentProps<typeof DetailModal>, "size"> & { siblings?: PreviewSiblings | null; size?: "standard" | "wide" | "full" | "sheet" }) {
  const extra =
    siblings || headerExtra ? (
      <div className="flex items-center gap-1" data-testid="preview-window-nav">
        {headerExtra}
        {siblings ? <SiblingSteps siblings={siblings} /> : null}
      </div>
    ) : undefined;
  return <DetailModal {...modal} size={size} headerExtra={extra} />;
}
