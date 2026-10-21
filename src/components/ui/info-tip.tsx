"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

const MARGIN = 8;
const GAP = 6;

/**
 * Where an open bubble goes: above its trigger, or below when there is no room above; centred on
 * it but kept inside the viewport. Fixed to the viewport, so no card, table or window clips it.
 */
export function placeTip(anchor: { left: number; top: number; bottom: number; width: number }, bubble: { width: number; height: number }, viewport: { width: number; height: number }): { left: number; top: number; side: "top" | "bottom" } {
  const centre = anchor.left + anchor.width / 2;
  const left = Math.min(Math.max(MARGIN, centre - bubble.width / 2), Math.max(MARGIN, viewport.width - MARGIN - bubble.width));
  const above = anchor.top - GAP - bubble.height;
  if (above >= MARGIN || anchor.bottom + GAP + bubble.height > viewport.height - MARGIN) return { left, top: Math.max(MARGIN, above), side: "top" };
  return { left, top: anchor.bottom + GAP, side: "bottom" };
}

/**
 * The one tooltip of the app: explanatory text for whatever it wraps (by default a small ⓘ).
 * Mouse: opens while pointed at, closes when the pointer leaves. Keyboard: opens on focus, closes
 * on blur or Escape. Touch: a tap opens it, another tap (on it or anywhere else) closes it. The
 * bubble is drawn in a layer above the page, so it is never cut off by the card it sits in. The
 * text is also the trigger's accessible description, so screen readers read it without opening it.
 * Interactive menus are not tooltips: they stay click-to-open popovers.
 */
export function InfoTip({ text, className, label, children, testId = "info-tip" }: { text: React.ReactNode; className?: string; label?: string; children?: React.ReactNode; testId?: string }) {
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState<{ left: number; top: number } | null>(null);
  const trigger = React.useRef<HTMLButtonElement>(null);
  const bubble = React.useRef<HTMLSpanElement>(null);
  // The pointer that pressed the trigger, so a tap does not count as keyboard focus.
  const pressed = React.useRef<string | null>(null);
  const id = React.useId();

  const place = React.useCallback(() => {
    const a = trigger.current?.getBoundingClientRect();
    const b = bubble.current?.getBoundingClientRect();
    if (!a || !b) return;
    const p = placeTip(a, b, { width: document.documentElement.clientWidth, height: window.innerHeight });
    setPos({ left: p.left, top: p.top });
  }, []);

  React.useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!trigger.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      // Escape closes the bubble first (and only the bubble, not the window it sits in).
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  const show = () => {
    if (open) return;
    setPos(null);
    setOpen(true);
  };

  return (
    <span className="inline-flex align-middle">
      <button
        ref={trigger}
        type="button"
        aria-label={children ? undefined : (label ?? "More information")}
        aria-describedby={id}
        data-testid={testId}
        data-open={open || undefined}
        onPointerDown={(e) => {
          pressed.current = e.pointerType;
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          // A mouse click keeps the hover bubble open; a tap toggles it.
          if (pressed.current === "mouse") show();
          else if (open) setOpen(false);
          else show();
          pressed.current = null;
        }}
        onPointerEnter={(e) => e.pointerType === "mouse" && show()}
        onPointerLeave={(e) => e.pointerType === "mouse" && setOpen(false)}
        onFocus={() => {
          if (!pressed.current) show();
        }}
        onBlur={() => setOpen(false)}
        // The ⓘ is a 24px target (WCAG 2.5.8) around its 16px mark, with negative margins so the line
        // around it keeps its size; on touch screens an invisible area makes it 40px. Wrapped text is
        // 24px tall the same way, and gets no larger area: it often sits on a card that is itself a
        // link, which must keep its taps.
        className={cn(
          children
            ? "-my-1 inline-flex min-h-6 cursor-help items-center rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            : "group/tip relative -m-1 inline-flex h-6 w-6 shrink-0 cursor-help items-center justify-center rounded-full text-fg-subtle hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:after:absolute pointer-coarse:after:-inset-2 pointer-coarse:after:content-['']",
          className,
        )}
      >
        {children ?? (
          <span aria-hidden className="grid h-4 w-4 place-items-center rounded-full border border-border-strong text-[9px] font-semibold leading-none group-hover/tip:border-accent">
            i
          </span>
        )}
      </button>
      {/* Always present for screen readers; the visible bubble below is drawn only while open. */}
      <span id={id} className="sr-only">
        {text}
      </span>
      {open
        ? createPortal(
            <span
              ref={bubble}
              role="tooltip"
              aria-hidden
              style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? "visible" : "hidden" }}
              className="pointer-events-none fixed z-[100] block w-max max-w-[min(18rem,calc(100vw-16px))] rounded-md border border-border-strong bg-bg-elevated px-2.5 py-1.5 text-left text-xs font-normal normal-case leading-snug tracking-normal text-fg shadow-lg motion-safe:animate-[fade-in_100ms_ease-out]"
              data-testid={`${testId}-bubble`}
            >
              {text}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}
