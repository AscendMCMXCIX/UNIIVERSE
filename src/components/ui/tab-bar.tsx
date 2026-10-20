"use client";

import * as React from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { useScrollEdges } from "@/components/ui/scroll-row";

export interface TabBarItem {
  key: string;
  href: string;
  label: string;
  icon: LucideIcon;
  testId?: string;
}

/**
 * Section tabs: the one way to move between the sections of a page (Team's sections, a player's
 * profile), the same on every screen. Every tab is a link with its own address, so Back/Forward,
 * new tabs and the keyboard work. On phones the tabs share the width when they fit; when they do
 * not, the bar scrolls sideways, an edge fades where more tabs are hidden and the current tab is
 * kept in view. `keepScroll`: the page stays where it is when the section changes (a profile, whose
 * header sits above its tabs). `end`: content at the bar's right end (Team names the team there).
 */
export function TabBar({ label, items, current, keepScroll = false, dense = false, className, testId, end }: { label: string; items: readonly TabBarItem[]; current: string; keepScroll?: boolean; dense?: boolean; className?: string; testId?: string; end?: React.ReactNode }) {
  const listRef = React.useRef<HTMLUListElement>(null);
  useScrollEdges(listRef, { keepCurrentInView: true, current });
  return (
    <nav aria-label={label} className={cn("flex items-end gap-4 border-b border-border", className)} data-testid={testId}>
      <ul ref={listRef} className="scroll-fade-x -mb-px flex min-w-0 flex-1 snap-x gap-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((s) => {
          const on = s.key === current;
          return (
            <li key={s.key} className="shrink-0 snap-start max-sm:grow">
              <Link
                href={s.href}
                aria-current={on ? "page" : undefined}
                scroll={!keepScroll}
                className={cn(
                  "inline-flex min-h-11 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors duration-150 max-sm:w-full max-sm:justify-center max-sm:px-2",
                  dense && "lg:min-h-10",
                  on ? "border-accent text-fg" : "border-transparent text-fg-muted hover:border-border-strong hover:text-fg",
                )}
                data-testid={s.testId}
              >
                <s.icon className={cn("hidden h-4 w-4 sm:block", on ? "text-accent" : "text-fg-subtle")} aria-hidden />
                {s.label}
              </Link>
            </li>
          );
        })}
      </ul>
      {end}
    </nav>
  );
}
