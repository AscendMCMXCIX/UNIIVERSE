"use client";

import * as React from "react";
import { chipClass } from "@/components/ui/segmented";
import { cn } from "@/lib/cn";

export interface SectionIndexItem {
  /** The id of the section's element: the link goes to #id. */
  id: string;
  label: string;
}

/**
 * Jumps to the sections of one page (Settings: Name · Links · Password). Plain links to #id, so
 * they work before the page's code has run and land as any link to a fragment does: the page's
 * scroll padding keeps the section clear of the bars. `spy`: the section being read is marked
 * (aria-current="location") as the page scrolls: the last one whose top has passed the upper third
 * of the window, or the last one once a page that scrolls is at its end. Chips by default;
 * `className` (the list) and `linkClassName` (each link, told whether it is the current one)
 * restyle it, a list in a card for instance. Small and generic: it reads nothing but the ids.
 */
export function SectionIndex({ label, items, spy = false, className, linkClassName, testId }: { label: string; items: readonly SectionIndexItem[]; spy?: boolean; className?: string; linkClassName?: (current: boolean) => string; testId?: string }) {
  const ids = items.map((i) => i.id).join(" ");
  const [current, setCurrent] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!spy || !ids) return;
    const list = ids.split(" ");
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = window.innerHeight / 3;
      let at = list[0]!;
      for (const id of list) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) at = id;
      }
      const root = document.documentElement;
      if (window.scrollY > 0 && window.scrollY + window.innerHeight >= root.scrollHeight - 2) at = list[list.length - 1]!;
      setCurrent(at);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [spy, ids]);

  return (
    <nav aria-label={label} data-testid={testId}>
      <ul className={cn("flex flex-wrap gap-2", className)}>
        {items.map(({ id, label: text }) => {
          const on = current === id;
          return (
            <li key={id} className="min-w-0">
              <a href={`#${id}`} aria-current={on ? "location" : undefined} className={linkClassName ? linkClassName(on) : chipClass(on)} data-testid={testId ? `${testId}-${id}` : undefined}>
                {text}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
