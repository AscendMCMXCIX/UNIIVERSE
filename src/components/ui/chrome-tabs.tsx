"use client";

import Link from "next/link";
import { ScrollRow } from "@/components/ui/scroll-row";
import { tabIndicatorClass } from "@/components/ui/tab-bar";
import { isPlainClick, stayOnCurrentPage } from "@/lib/back-to-top";
import { cn } from "@/lib/cn";

export interface ChromeTab {
  key: string;
  href: string;
  label: string;
  testId: string;
  /** False: never fetched ahead of a tap (a profile's sections: nav.ts, prefetchOf). */
  prefetch?: false;
}

/**
 * A phone's sections row: the second row of the top bar (MobileNav), 44px tall either way round,
 * so a page's sections stay in reach however far it scrolls. One component for every set of
 * sections a phone shows there: a profile's (ProfileTabs: Overview, Champions, History, Accounts)
 * and a destination's tabs (Team's Overview, Players, Leaderboards and Matches; Admin Mode's
 * Users & Permissions, Platform Settings and System). The names share the width; with a larger text
 * size they scroll sideways, the current one kept in view, instead of overflowing. Every tab is a
 * link with its own address. The current one, pressed again, keeps the page as it is and goes back
 * to the top, as the current tab does everywhere (src/lib/back-to-top.ts).
 *
 *   replace     moving between them replaces the history entry (a profile's sections: Back leaves
 *               the profile); otherwise each is an entry of its own, as a destination's pages are.
 *   keepScroll  the page decides where a section starts (ScrollOnNavigate leaves it alone): a
 *               profile's land at their own top (ProfileTabs).
 *   onChoose    told which other tab a plain click chose (null for any other press), before the
 *               page changes.
 */
export function ChromeTabs({ label, items, current, replace = false, keepScroll = false, onChoose, testId }: { label: string; items: readonly ChromeTab[]; current: string; replace?: boolean; keepScroll?: boolean; onChoose?: (key: string | null) => void; testId: string }) {
  return (
    <nav aria-label={label} data-testid={testId}>
      <ScrollRow as="ul" className="flex" keepCurrentInView current={current}>
        {items.map((t) => {
          const on = t.key === current;
          return (
            <li key={t.key} className="min-w-max flex-1 basis-0">
              <Link
                href={t.href}
                replace={replace}
                scroll={!keepScroll}
                prefetch={t.prefetch}
                data-keep-scroll={keepScroll ? "" : undefined}
                aria-current={on ? "page" : undefined}
                onClick={(e) => {
                  if (stayOnCurrentPage(e, on)) return;
                  onChoose?.(!on && isPlainClick(e) ? t.key : null);
                }}
                // 4px a side: the longest set, Team's four names, fits a 320px screen with the bar's
                // gutters at the usual text size. 44px tall either way round: a touch screen's target
                // (STANDARDS.md), under the compact bar's 44px held sideways.
                className={cn("flex min-h-11 items-center justify-center whitespace-nowrap px-1 text-sm font-medium transition-colors duration-150", tabIndicatorClass(on))}
                data-testid={t.testId}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ScrollRow>
    </nav>
  );
}
