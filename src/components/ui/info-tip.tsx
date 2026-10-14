"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * A small ⓘ that explains a label. Desktop: shows on hover or keyboard focus. Touch screens: shows
 * on tap and hides on the next tap or when focus moves away. The text is also the accessible
 * description, so screen readers announce it without opening anything.
 */
export function InfoTip({ text, className, label }: { text: string; className?: string; label?: string }) {
  const [open, setOpen] = React.useState(false);
  const [shift, setShift] = React.useState(0);
  const tip = React.useRef<HTMLSpanElement>(null);
  const id = React.useId();
  // Keep the open bubble inside the viewport (a tip near a screen edge would otherwise overflow it).
  React.useLayoutEffect(() => {
    if (!open || !tip.current) return setShift(0);
    const r = tip.current.getBoundingClientRect();
    const margin = 8;
    const W = document.documentElement.clientWidth;
    setShift(r.left < margin ? margin - r.left : r.right > W - margin ? W - margin - r.right : 0);
  }, [open]);
  return (
    <span className="relative inline-flex align-middle">
      <button
        type="button"
        aria-label={label ?? "More information"}
        aria-describedby={id}
        aria-expanded={open}
        data-testid="info-tip"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        onPointerEnter={(e) => e.pointerType === "mouse" && setOpen(true)}
        onPointerLeave={(e) => e.pointerType === "mouse" && setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        className={cn("inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-border-strong text-[9px] font-semibold leading-none text-fg-subtle hover:border-accent hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent", className)}
      >
        i
      </button>
      {/* Closed, the text stays only for screen readers: no box that could widen the page. */}
      <span
        id={id}
        ref={tip}
        role="tooltip"
        style={open ? { transform: `translateX(calc(-50% + ${shift}px))` } : undefined}
        className={open ? "absolute bottom-full left-1/2 z-50 mb-1.5 block w-60 max-w-[75vw] rounded-md border border-border-strong bg-bg-elevated px-2.5 py-1.5 text-left text-xs font-normal normal-case leading-snug tracking-normal text-fg shadow-lg" : "sr-only"}
      >
        {text}
      </span>
    </span>
  );
}
