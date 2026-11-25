"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useAddressItem } from "./address-item";
import { keepsEscape, modalOpen } from "./posture";

/*
  Unfold: an item opened in place, under its card, for items compared down a vertical list (games;
  docs/DESIGN_SYSTEM.md §7, "Unfold").

  - One open at a time. Opening another keeps the card pressed where it was on screen: its top is
    noted before the change and the page is scrolled by the difference before the next paint
    (useLayoutEffect), so the card above closing never pulls it up.
  - Close: the card again, Escape, the compact header pinned at the top of the screen while the open
    item is on it (UnfoldHeader), or Back.
  - The address and history follow the one rule (address-item.ts): the first open pushes, a switch
    replaces, closing goes Back.
  - Its height is stable: no sub-tabs that change it (the content's part). It grows from nothing over
    200ms and its content fades in over 120ms (unfold-grow, swap-in), instant with reduced motion.
  - Touch phones and short windows open the item as a window of their own instead (posture.ts:
    prefersWindow), never inline.
*/

/** How far the page must scroll to bring a card back to where it was: its top on screen before the change, and after. */
export function anchorCorrection(before: number, after: number): number {
  return after - before;
}

/** How long the region's growth may take before it counts as done regardless (unfold-grow runs 200ms). */
const SETTLE_MS = 260;

export interface UnfoldControl {
  /** The open item, or null. */
  id: string | null;
  /** The card pressed: opens its item, switches to it, or closes it when it is the one open. `card`: the card's element, kept where it is on screen. */
  toggle: (id: string, card?: HTMLElement | null) => void;
  close: () => void;
  /** Props for a card's button: its expanded state, its region and its press. */
  cardProps: (id: string) => { "aria-expanded": boolean; "aria-controls"?: string; "data-unfold-card": string; onClick: (e: React.MouseEvent<HTMLElement>) => void };
  /** The id of an item's region (for aria-controls). */
  regionId: (id: string) => string;
}

/**
 * An Unfold list's state: the open item in the address under `param` (`initial` from the page's
 * search params), `valid` for the ids the list has.
 */
export function useUnfold({ param, initial = null, valid, prefix = "unfold" }: { param: string; initial?: string | null; valid?: (id: string) => boolean; prefix?: string }): UnfoldControl {
  const item = useAddressItem(param, { initial, valid });
  const anchor = React.useRef<{ el: HTMLElement; top: number } | null>(null);
  const id = item.id;
  const regionId = React.useCallback((itemId: string) => `${prefix}-${itemId}`, [prefix]);

  React.useLayoutEffect(() => {
    const a = anchor.current;
    anchor.current = null;
    if (!a || !a.el.isConnected) return;
    const by = anchorCorrection(a.top, a.el.getBoundingClientRect().top);
    if (Math.abs(by) >= 1) window.scrollBy({ top: by, behavior: "instant" });
  }, [id]);

  const toggle = React.useCallback(
    (itemId: string, card?: HTMLElement | null) => {
      if (card) anchor.current = { el: card, top: card.getBoundingClientRect().top };
      item.toggle(itemId);
    },
    [item],
  );
  const close = React.useCallback(() => {
    const was = id;
    const card = was ? document.querySelector<HTMLElement>(`[data-unfold-card="${CSS.escape(was)}"]`) : null;
    if (card) anchor.current = { el: card, top: card.getBoundingClientRect().top };
    const inside = !!(was && document.activeElement?.closest(`#${CSS.escape(regionId(was))}`));
    item.close();
    // The way back from a long item: its card, brought into view if it sits above the screen.
    if (card && (inside || document.activeElement === document.body)) {
      card.focus({ preventScroll: true });
      if (card.getBoundingClientRect().top < 0) {
        // Brought into view on purpose: the anchor must not scroll it back up.
        anchor.current = null;
        card.scrollIntoView({ block: "start" });
      }
    }
  }, [id, item, regionId]);

  React.useEffect(() => {
    if (id === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || modalOpen() || keepsEscape(e.target)) return;
      e.preventDefault();
      close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [id, close]);

  const cardProps = React.useCallback(
    (itemId: string) => ({
      "aria-expanded": itemId === id,
      ...(itemId === id ? { "aria-controls": regionId(itemId) } : {}),
      "data-unfold-card": itemId,
      onClick: (e: React.MouseEvent<HTMLElement>) => toggle(itemId, e.currentTarget),
    }),
    [id, toggle, regionId],
  );
  return { id, toggle, close, cardProps, regionId };
}

/**
 * The region an item unfolds into, under its card. `header`: the compact header pinned while the
 * item is on screen (UnfoldHeader). Rendered only while open.
 */
export function UnfoldRegion({ id, label, header, children, className, testId = "unfold-region" }: { id: string; label: string; header?: React.ReactNode; children: React.ReactNode; className?: string; testId?: string }) {
  const [settled, setSettled] = React.useState(false);
  React.useEffect(() => {
    const t = window.setTimeout(() => setSettled(true), SETTLE_MS);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <div id={id} role="region" aria-label={label} className={cn("unfold-grow", className)} onTransitionEnd={(e) => e.target === e.currentTarget && setSettled(true)} data-testid={testId}>
      {/* Clipped while it grows; once grown nothing clips it, so its pinned header can stick. */}
      <div className={cn("min-h-0", settled ? "overflow-visible" : "overflow-hidden")} data-unfold-body="" data-settled={settled || undefined}>
        {header}
        <div className="motion-safe:swap-in">{children}</div>
      </div>
    </div>
  );
}

/**
 * The compact header of an open item: it takes no room and shows only once the item's top has gone
 * under what is pinned above the page, then stays pinned there (the item's name and Close) until the
 * item leaves the screen.
 */
export function UnfoldHeader({ title, onClose, closeLabel = "Close", testId = "unfold-header" }: { title: React.ReactNode; onClose: () => void; closeLabel?: string; testId?: string }) {
  const sentinel = React.useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = React.useState(false);
  React.useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const pinned = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    // The newest entry: a late callback carries every change since the last, oldest first.
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        setStuck(!!entry && !entry.isIntersecting && entry.boundingClientRect.top < pinned + 1);
      },
      { rootMargin: `-${Math.round(pinned)}px 0px 0px 0px` },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <>
      <div ref={sentinel} aria-hidden className="h-0" />
      {/* As tall as the strip, so sticky positioning stops it at the region's last pixel: it leaves with
          the game rather than lying over the next card (a zero-height wrapper let it overhang by its
          own height). The empty block after it takes that height back, so it still takes no room; a
          negative margin on the wrapper itself would shrink the box sticky positioning keeps inside. */}
      <div className="pointer-events-none sticky top-[calc(var(--bar-top)+var(--tabs-top))] z-10 h-11 max-md:top-[calc(3.5rem+env(safe-area-inset-top))]">
        <div
          className={cn("flex min-h-11 items-center gap-2 rounded-panel border border-border bg-bg-elevated/95 px-3 shadow-lg shadow-black/40 transition-opacity duration-150", stuck ? "pointer-events-auto opacity-100" : "opacity-0")}
          aria-hidden={!stuck}
          data-testid={testId}
          data-stuck={stuck || undefined}
        >
          <div className="min-w-0 flex-1 truncate text-sm font-medium">{title}</div>
          <button type="button" onClick={onClose} tabIndex={stuck ? 0 : -1} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11" data-testid={`${testId}-close`}>
            <X className="h-3.5 w-3.5" aria-hidden />
            {closeLabel}
          </button>
        </div>
      </div>
      <div aria-hidden className="-mt-11" />
    </>
  );
}
