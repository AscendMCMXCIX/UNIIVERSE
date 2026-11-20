"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { DetailModal } from "@/components/ui/detail-modal";
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
 *   fold        where the names no longer fit the row whole (a larger text size), the row gives
 *               way to one 44px button naming the current section ("Section: History ▾"), which
 *               opens a sheet of them all: nothing is cut off or scrolled out of sight (docs/MOBILE.md,
 *               "The sections row"). Static class lists by the row's own width in rem (FOLD).
 */
export function ChromeTabs({ label, items, current, replace = false, keepScroll = false, onChoose, testId, fold }: { label: string; items: readonly ChromeTab[]; current: string; replace?: boolean; keepScroll?: boolean; onChoose?: (key: string | null) => void; testId: string; fold?: keyof typeof FOLD }) {
  const [sheet, setSheet] = React.useState(false);
  const folded = fold ? FOLD[fold] : null;
  const shown = items.find((t) => t.key === current) ?? items[0];
  return (
    <nav aria-label={label} data-testid={testId} className={folded ? "@container/sections" : undefined}>
      {folded && shown ? (
        <button type="button" onClick={() => setSheet(true)} aria-haspopup="dialog" className={cn("hidden min-h-11 w-full items-center gap-1.5 px-2 text-left text-sm font-medium text-fg", folded.button)} data-testid={`${testId}-fold`}>
          <span className="text-fg-muted">Section:</span>
          <span className="min-w-0 flex-1 truncate">{shown.label}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
        </button>
      ) : null}
      {sheet && folded ? (
        <DetailModal open onClose={() => setSheet(false)} size="sheet" title={label} testId={`${testId}-sheet`}>
          <ul className="flex flex-col gap-1">
            {items.map((t) => {
              const on = t.key === current;
              return (
                <li key={t.key}>
                  <Link
                    href={t.href}
                    replace={replace}
                    scroll={!keepScroll}
                    prefetch={t.prefetch}
                    data-keep-scroll={keepScroll ? "" : undefined}
                    aria-current={on ? "page" : undefined}
                    onClick={(e) => {
                      setSheet(false);
                      if (stayOnCurrentPage(e, on)) return;
                      onChoose?.(!on && isPlainClick(e) ? t.key : null);
                    }}
                    className={cn("flex min-h-12 items-center gap-3 rounded-lg px-3 text-base font-medium", on ? "bg-accent/10 text-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg")}
                    data-testid={`${t.testId}-sheet`}
                  >
                    <span className="min-w-0 flex-1">{t.label}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        </DetailModal>
      ) : null}
      <ScrollRow as="ul" className={cn("flex", folded?.row)} keepCurrentInView current={current}>
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

/**
 * Where each set's names stop fitting the row whole, in the row's own width in rem (so the reader's
 * text size counts), with the 4px a side each tab keeps. Measured on 20 Nov 2026 with the bundled
 * Inter at 100% text: a profile's four short names (Overview, Champions, History, Accounts) need
 * PROFILE_REM; Team's four (Overview, Players, Leaderboards, Matches) TEAM_REM. A 393px phone's row
 * is 23.6rem at 100% text, 18.9rem at 125% and 15.7rem at 150%; a 320px one's 19.0, 15.2 and 12.7rem.
 */
const FOLD = {
  profile: { row: "@max-[17.5rem]/sections:hidden", button: "@max-[17.5rem]/sections:flex" },
  team: { row: "@max-[19rem]/sections:hidden", button: "@max-[19rem]/sections:flex" },
} as const;
