"use client";

import Link, { useLinkStatus } from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn, withDefaults } from "@/lib/cn";
import { choiceIndicatorClass } from "./segmented";
import { COMPACT_CONTROL, COMPACT_LABEL } from "./page-toolbar";

export interface SubTab {
  key: string;
  href: string;
  label: string;
  icon?: LucideIcon;
  testId?: string;
}

/**
 * The look of one secondary tab: text-led, as every selection control (ui/segmented.tsx). The current
 * view in the main text colour and semibold over the accent underline, its icon in the accent; the
 * others in the secondary grey, brighter while pointed at with a faint line under them. One level
 * below the primary tabs (TabBar: a row with its own hairline, 44px, the bar in the brand gradient)
 * and one above a segmented choice (smaller words, no icons), so the three never compete; never a
 * form control: the segmented control is for choosing a filter. No box, no fill, on any screen.
 * 36px tall with a mouse, 44px on touch screens. A caller's width, padding or text size replaces the
 * default (withDefaults).
 */
export function subTabClass(on: boolean, className?: string): string {
  return withDefaults(
    cn(
      "ui-segment inline-flex min-h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 text-sm transition-colors duration-150 pointer-coarse:min-h-11 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
      on ? "font-semibold" : "font-medium",
      choiceIndicatorClass(on, { inset: "after:inset-x-3" }),
    ),
    className,
  );
}

/**
 * A view's tab in the pinned row (`size="compact"`, a page's PageToolbar), and the pinned row's other
 * in-page links (Leaderboards' sections): the row's one height for its controls (COMPACT_CONTROL, a
 * 44px target on touch screens), the label where the row has room for it (COMPACT_LABEL), else the
 * icon alone with the name read out; text-led, the current one underlined.
 */
export function compactTabClass(on: boolean, className?: string): string {
  return withDefaults(
    cn(
      "ui-segment touch-target inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
      COMPACT_CONTROL,
      on ? "font-semibold" : "font-medium",
      choiceIndicatorClass(on, { inset: "after:inset-x-2.5" }),
    ),
    className,
  );
}

/** While the view a tab opens is loading: a thin bar along the tab's foot, so nothing moves. */
function Pending() {
  const { pending } = useLinkStatus();
  return <span className={cn("pointer-events-none absolute inset-x-3 bottom-1 z-[1] h-0.5 rounded-full bg-accent/70 transition-opacity duration-150", pending ? "opacity-100 motion-safe:animate-pulse" : "opacity-0")} aria-hidden data-testid="sub-tab-pending" data-pending={pending || undefined} />;
}

/**
 * Secondary navigation: the views of one section that are equally important (Match History's Games
 * and Encounters), directly under the section's primary tabs. Every view is a link with its own
 * address, so Back/Forward, new tabs and the keyboard work, and the current one is
 * aria-current="page". `keepScroll` (the default): the page stays where it is, as views of one
 * section do; `keepScroll={false}` starts each at the top. On phones the tabs share the width, and
 * wrap onto a second line rather than run off the screen.
 */
export function SubTabs({ label, items, current, keepScroll = true, className, testId, size = "default" }: { label: string; items: readonly SubTab[]; current: string; keepScroll?: boolean; className?: string; testId?: string; /** `compact`: the copy in the pinned row (PageToolbar), its test ids prefixed with "toolbar-". */ size?: "default" | "compact" }) {
  if (size === "compact") {
    // In the pinned row's group of controls: a labelled list, not a second landmark of the same name.
    return (
      <ul aria-label={label} className={cn("ui-segmented flex items-center gap-1", className)} data-testid={testId ? `toolbar-${testId}` : undefined}>
        {items.map((t) => {
          const on = t.key === current;
          return (
            <li key={t.key}>
              <Link href={t.href} scroll={!keepScroll} aria-current={on ? "page" : undefined} className={compactTabClass(on)} title={t.label} data-testid={t.testId ? `toolbar-${t.testId}` : undefined}>
                {t.icon ? <t.icon className={cn("h-4 w-4 shrink-0", on ? "text-accent" : "text-fg-subtle")} aria-hidden /> : null}
                <span className={COMPACT_LABEL}>{t.label}</span>
                <Pending />
              </Link>
            </li>
          );
        })}
      </ul>
    );
  }
  return (
    <nav aria-label={label} className={cn("min-w-0 max-sm:w-full", className)} data-testid={testId}>
      {/* Phones: the views share the width, words with the current one underlined, as on every screen
          (the quiet track they shared until Release 17 went with the boxed controls). */}
      <ul className="ui-segmented flex min-w-0 flex-wrap items-center gap-1">
        {items.map((t) => {
          const on = t.key === current;
          return (
            <li key={t.key} className="max-sm:flex-1">
              <Link href={t.href} scroll={!keepScroll} aria-current={on ? "page" : undefined} className={subTabClass(on, "max-sm:w-full")} data-testid={t.testId}>
                {t.icon ? <t.icon className={cn("h-4 w-4 shrink-0", on ? "text-accent" : "text-fg-subtle")} aria-hidden /> : null}
                {t.label}
                <Pending />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
