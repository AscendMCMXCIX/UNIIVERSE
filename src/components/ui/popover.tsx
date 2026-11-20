"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { screenBox, screenHeight } from "@/lib/screen";

/*
  Popover: anchored choices (PLAN S4a, container 4; docs/DESIGN_SYSTEM.md §7). The family Select's
  list belongs to (select.tsx): the same layer, look and motion, and the same ways to close. This is
  the panel form, for a set of fields rather than one list: the pinned row's Filters (D1).

  - **Where.** Screens that open previews beside the list (posture.ts). A touch phone, or a window
    that small, keeps its sheet (the caller decides, as FilterBar does).
  - **Opens** on its trigger's click, Enter or Space (a button's own). The panel takes the focus
    (without scrolling anything), so Tab goes through its fields in order.
  - **Closes** on Escape (the focus back on the trigger), a press outside it, the focus leaving it,
    a choice where the caller closes it, or the trigger leaving the screen. A scroll otherwise moves
    the panel with its trigger; so does a resize.
  - **No dimming and no address of its own.** The choices in it replace the page's query, as they do
    in the page. The caller may give it a history entry of its own (useBackCloses), so Back closes it.
  - **Look.** `bg-elevated`, a border and a shadow, a 160ms fade with a 2px slide away from the
    trigger (popover-in, none with reduced motion). As tall as its content, up to the room under
    (or over) the trigger; then its body alone scrolls, its title and actions in place.
  - **Layer.** Fixed to the screen, in the page where its caller draws it (no portal), so what holds
    it keeps seeing a press on it as inside; where what holds it moves the box fixed positioning uses
    (a transform, a blurred sticky bar), it measures where its (0, 0) landed and corrects for it.
*/

/** Room kept between the trigger and the panel, and between the panel and the screen's edges, in px. */
const GAP = 6;
const MARGIN = 8;

/** Where a fixed element at (0, 0) actually is: the corner of the box its fixed positioning uses. */
export function fixedOrigin(el: HTMLElement): { x: number; y: number } {
  const prev = { top: el.style.top, left: el.style.left };
  el.style.top = "0px";
  el.style.left = "0px";
  const r = el.getBoundingClientRect();
  el.style.top = prev.top;
  el.style.left = prev.left;
  return { x: r.left, y: r.top };
}

export interface PopoverProps {
  /** What it is anchored to: the trigger that opened it (looked up as it opens). */
  anchor: () => HTMLElement | null;
  /** Closes it; `restoreFocus` when the focus should go back to the trigger (Escape, Done). */
  onClose: (restoreFocus: boolean) => void;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** The panel's width class: `w-[min(34rem,calc(100%-1rem))]` for the filters (the five role segments in view). */
  widthClassName?: string;
  testId?: string;
  closeTestId?: string;
  id?: string;
}

export function Popover({ anchor, onClose, title, description, children, footer, widthClassName = "w-[min(34rem,calc(100%-1rem))]", testId, closeTestId, id }: PopoverProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  const descriptionId = React.useId();
  const [pos, setPos] = React.useState<{ top: number; left: number; maxHeight: number; up: boolean } | null>(null);
  const latest = React.useRef({ anchor, onClose });
  React.useLayoutEffect(() => {
    latest.current = { anchor, onClose };
  });

  const place = React.useCallback(() => {
    const p = ref.current;
    const a = latest.current.anchor();
    if (!p) return;
    if (!a || !a.isConnected) return latest.current.onClose(false);
    const r = a.getBoundingClientRect();
    const { width: W, height: H } = screenBox();
    const needs = p.scrollHeight;
    const below = H - r.bottom - GAP - MARGIN;
    const above = r.top - GAP - MARGIN;
    const up = below < needs && above > below;
    const room = Math.max(160, up ? above : below);
    const shown = Math.min(needs, room);
    const width = p.offsetWidth;
    // Its start under the trigger's, or as far as it fits inside the screen.
    const left = Math.max(MARGIN, Math.min(r.left, W - MARGIN - width));
    const top = up ? r.top - GAP - shown : r.bottom + GAP;
    const origin = fixedOrigin(p);
    setPos({ top: Math.max(MARGIN, top) - origin.y, left: left - origin.x, maxHeight: room, up });
  }, []);

  React.useLayoutEffect(() => {
    place();
  }, [place]);
  // The focus moves in once it is placed (a hidden panel cannot take it), once.
  const placed = pos !== null;
  React.useEffect(() => {
    if (!placed) return;
    const frame = requestAnimationFrame(() => {
      const p = ref.current;
      if (p && !p.contains(document.activeElement)) p.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [placed]);

  React.useEffect(() => {
    const inside = (t: EventTarget | null) => !!t && (ref.current?.contains(t as Node) || latest.current.anchor()?.contains(t as Node));
    const onPointer = (e: PointerEvent) => {
      if (!inside(e.target)) latest.current.onClose(false);
    };
    let frame = 0;
    const follow = (e?: Event) => {
      if (e && ref.current?.contains(e.target as Node)) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = latest.current.anchor()?.getBoundingClientRect();
        if (!r || r.bottom < 0 || r.top > screenHeight()) latest.current.onClose(false);
        else place();
      });
    };
    const onResize = () => follow();
    document.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("scroll", follow, true);
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("scroll", follow, true);
      window.removeEventListener("resize", onResize);
    };
  }, [place]);

  return (
    <div
      ref={ref}
      id={id}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      tabIndex={-1}
      data-popover=""
      data-testid={testId}
      onKeyDown={(e) => {
        if (e.key !== "Escape" || e.defaultPrevented) return;
        e.preventDefault();
        e.stopPropagation();
        latest.current.onClose(true);
      }}
      onBlur={(e) => {
        // The focus gone somewhere else on the page (Tab past the last field, a click elsewhere):
        // closed, the focus where it went. Not when it moves within, or to nothing (a press on the
        // panel's own text).
        const to = e.relatedTarget as Node | null;
        if (to && !ref.current?.contains(to) && !latest.current.anchor()?.contains(to)) latest.current.onClose(false);
      }}
      style={{ position: "fixed", top: pos?.top ?? 0, left: pos?.left ?? 0, maxHeight: pos?.maxHeight, visibility: pos ? "visible" : "hidden" }}
      // No transition of its own: with reduced motion every element's transitions last 0.01ms
      // (globals.css), which would hold its first frame hidden, where it cannot take the focus.
      className={cn("z-50 flex flex-col overflow-hidden rounded-lg border border-border-strong bg-bg-elevated text-fg shadow-2xl outline-none transition-none", widthClassName, pos && (pos.up ? "popover-in-up" : "popover-in"))}
    >
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 id={titleId} className="text-base font-semibold leading-tight">
            {title}
          </h2>
          {description ? (
            <p id={descriptionId} className="mt-1 text-sm text-fg-muted">
              {description}
            </p>
          ) : null}
        </div>
        <button type="button" onClick={() => latest.current.onClose(true)} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent" data-testid={closeTestId}>
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="min-h-0 flex-auto overflow-y-auto overscroll-contain px-4 py-4" data-testid={testId ? `${testId}-body` : undefined}>
        {children}
      </div>
      {footer ? <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-3">{footer}</div> : null}
    </div>
  );
}
