"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * Marks which ends of a sideways-scrolling row hide something (data-fade-start / data-fade-end),
 * so the `scroll-fade-x` utility fades only those edges: a faded edge always means "more this
 * way", and a row that fits is not faded at all. Optionally keeps the row's current item (the
 * one marked aria-current, aria-selected or aria-pressed) in view; only the row scrolls, never
 * the page.
 */
export function useScrollEdges<T extends HTMLElement>(ref: React.RefObject<T | null>, { keepCurrentInView = false, current }: { keepCurrentInView?: boolean; /** Changes when the current item does (e.g. the path). */ current?: unknown } = {}) {
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const hidden = el.scrollWidth - el.clientWidth;
      el.dataset.fadeStart = String(el.scrollLeft > 1);
      el.dataset.fadeEnd = String(hidden - el.scrollLeft > 1);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const resize = new ResizeObserver(update);
    resize.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      resize.disconnect();
    };
  }, [ref]);

  React.useEffect(() => {
    const el = ref.current;
    if (!keepCurrentInView || !el || el.scrollWidth <= el.clientWidth) return;
    const item = el.querySelector<HTMLElement>('[aria-current]:not([aria-current="false"]), [aria-selected="true"], [aria-pressed="true"]');
    if (!item) return;
    const box = el.getBoundingClientRect();
    const at = item.getBoundingClientRect();
    // Leave room for the fade, so the current item is never the one under it.
    const room = 32;
    if (at.left < box.left + room) el.scrollLeft -= box.left + room - at.left;
    else if (at.right > box.right - room) el.scrollLeft += at.right - (box.right - room);
  }, [ref, keepCurrentInView, current]);
}

/** A row that scrolls sideways when it does not fit, with faded edges where more of it is hidden (see useScrollEdges). */
export function ScrollRow({ as = "div", className, children, keepCurrentInView = false, current, ...rest }: React.HTMLAttributes<HTMLElement> & { as?: "div" | "nav" | "ul"; keepCurrentInView?: boolean; current?: unknown; "data-testid"?: string }) {
  const ref = React.useRef<HTMLElement>(null);
  useScrollEdges(ref, { keepCurrentInView, current });
  const Tag = as as React.ElementType;
  return (
    <Tag ref={ref} className={cn("scroll-fade-x overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)} {...rest}>
      {children}
    </Tag>
  );
}
