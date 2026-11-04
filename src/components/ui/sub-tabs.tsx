"use client";

import Link, { useLinkStatus } from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export interface SubTab {
  key: string;
  href: string;
  label: string;
  /** The start of the label, shown alone on phones when the full labels would not share a line
   * ("Records" for "Records & achievements"); the rest is still read out, so the name is the same. */
  short?: string;
  icon?: LucideIcon;
  testId?: string;
}

/**
 * The look of one secondary tab: a quiet label, and the current view as a lit pill (a raised
 * surface, an outline, the main text colour) with its icon in the accent. One level below the
 * primary tabs' underline (TabBar), and never a form control: the segmented control is for
 * choosing a filter (ui/segmented.tsx). 36px tall with a mouse, 44px on touch screens.
 */
export function subTabClass(on: boolean, className?: string): string {
  return cn(
    "relative inline-flex min-h-9 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3.5 text-sm font-semibold transition-colors duration-150 pointer-coarse:min-h-11 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
    on ? "bg-surface-2 text-fg ring-1 ring-inset ring-border-strong" : "text-fg-muted hover:bg-surface-2/60 hover:text-fg",
    className,
  );
}

/** While the view a tab opens is loading: a thin bar along the tab's foot, so nothing moves. */
function Pending() {
  const { pending } = useLinkStatus();
  return <span className={cn("pointer-events-none absolute inset-x-3 bottom-1 h-0.5 rounded-full bg-accent/70 transition-opacity duration-150", pending ? "opacity-100 motion-safe:animate-pulse" : "opacity-0")} aria-hidden data-testid="sub-tab-pending" data-pending={pending || undefined} />;
}

/**
 * Secondary navigation: the views of one section that are equally important (Match History's Games
 * and Encounters), directly under the section's primary tabs. Every view is a link with its own
 * address, so Back/Forward, new tabs and the keyboard work, and the current one is
 * aria-current="page". `keepScroll` (the default): the page stays where it is, as views of one
 * section do; separate pages (SubNav) start at the top. On phones the tabs share the width of one
 * track (a long label shows its `short` start), and wrap onto a second line rather than run off the
 * screen.
 */
export function SubTabs({ label, items, current, keepScroll = true, className, testId }: { label: string; items: readonly SubTab[]; current: string; keepScroll?: boolean; className?: string; testId?: string }) {
  return (
    <nav aria-label={label} className={cn("min-w-0 max-sm:w-full", className)} data-testid={testId}>
      {/* Phones: the views share one quiet track, so the pair reads as one choice of view rather than
          two buttons. */}
      <ul className="flex min-w-0 flex-wrap items-center gap-1 max-sm:rounded-[0.875rem] max-sm:bg-surface/70 max-sm:p-1 max-sm:ring-1 max-sm:ring-inset max-sm:ring-border">
        {items.map((t) => {
          const on = t.key === current;
          return (
            <li key={t.key} className="max-sm:flex-1">
              <Link href={t.href} scroll={!keepScroll} aria-current={on ? "page" : undefined} className={subTabClass(on, "max-sm:w-full")} data-testid={t.testId}>
                {t.icon ? <t.icon className={cn("h-4 w-4 shrink-0", on ? "text-accent" : "text-fg-subtle")} aria-hidden /> : null}
                {t.short && t.label.startsWith(t.short) ? (
                  <span>
                    {t.short}
                    <span className="max-sm:sr-only">{t.label.slice(t.short.length)}</span>
                  </span>
                ) : (
                  t.label
                )}
                <Pending />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
