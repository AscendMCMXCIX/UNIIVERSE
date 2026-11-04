"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { PROFILE_SECTIONS, activeHref } from "@/lib/nav";
import { TabBar, tabIndicatorClass } from "@/components/ui/tab-bar";
import { ScrollRow } from "@/components/ui/scroll-row";
import { cn } from "@/lib/cn";

/** Sections that share the chosen season and game mode when you move between them. */
const KEEPS_SEASON = new Set(["overview", "champions", "matches"]);

/**
 * The profile's sections: Overview | All Champions | Match History | Riot Accounts
 * (PROFILE_SECTIONS), the one list of them (the sidebar has a single My Profile link, so the two
 * never repeat each other). Every entry is a link: the keyboard and new tabs work, and the page
 * changes without a full reload.
 *
 *   page     tablets and desktops: the bar fixed under the profile card, the same bar as Team's
 *            sections (TabBar); each section is an entry of the browser's history.
 *   chrome   phones: in the top bar (MobileNav), so the sections stay in reach however far the page
 *            scrolls; four short names sharing the width. Moving between them replaces the history
 *            entry (as a phone's tabs within one screen do), so Back leaves the profile, and a
 *            section opened far down the page starts at its top, just under the bar.
 */
export function ProfileTabs({ basePath, variant = "page" }: { basePath: string; variant?: "page" | "chrome" }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const sections = PROFILE_SECTIONS.map((s) => ({ ...s, href: `${basePath}${s.path}` }));
  const currentHref = activeHref(pathname, sections.map((s) => s.href)) ?? basePath;
  const current = sections.find((s) => s.href === currentHref) ?? sections[0]!;
  const carried = new URLSearchParams();
  if (KEEPS_SEASON.has(current.key)) for (const k of ["season", "mode"]) if (params.get(k)) carried.set(k, params.get(k)!);
  const hrefOf = (s: (typeof sections)[number]) => (KEEPS_SEASON.has(s.key) && carried.size && s.key !== current.key ? `${s.href}?${carried.toString()}` : s.href);
  if (variant === "chrome") return <ChromeTabs items={sections.map((s) => ({ key: s.key, href: hrefOf(s), label: s.short, testId: `profile-chrome-tab-${s.key}` }))} current={current.key} />;
  return <TabBar label="Profile sections" items={sections.map((s) => ({ key: s.key, href: hrefOf(s), label: s.label, icon: s.icon, testId: `profile-tab-${s.key}` }))} current={current.key} keepScroll testId="profile-tabs" className="max-md:hidden" />;
}

/** Where a section starts when it is opened far down the page: just under the bar, the profile card scrolled away. */
function sectionTop(): number | null {
  const card = document.querySelector<HTMLElement>("[data-testid=profile-header]");
  if (!card) return null;
  const bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--mobile-chrome")) || 0;
  return Math.max(0, card.getBoundingClientRect().bottom + window.scrollY - bar);
}

function ChromeTabs({ items, current }: { items: Array<{ key: string; href: string; label: string; testId: string }>; current: string }) {
  // The place to return to once the new section is drawn (only when the card was scrolled away).
  const pendingTop = React.useRef<number | null>(null);
  React.useEffect(() => {
    const top = pendingTop.current;
    pendingTop.current = null;
    if (top !== null && window.scrollY > top) window.scrollTo({ top });
  }, [current]);
  return (
    <nav aria-label="Profile sections" data-testid="profile-chrome-tabs">
      {/* The four share the width; with a larger text size they scroll sideways instead of overflowing. */}
      <ScrollRow as="ul" className="flex" keepCurrentInView current={current}>
        {items.map((t) => {
          const on = t.key === current;
          return (
            <li key={t.key} className="min-w-max flex-1 basis-0">
              <Link
                href={t.href}
                replace
                scroll={false}
                aria-current={on ? "page" : undefined}
                onClick={() => {
                  const top = sectionTop();
                  pendingTop.current = top !== null && window.scrollY > top ? top : null;
                }}
                // 6px a side: the four names fit a 320px screen with the bar's gutters.
                className={cn("flex min-h-11 items-center justify-center whitespace-nowrap px-1.5 text-sm font-medium transition-colors duration-150", tabIndicatorClass(on))}
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
