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
 *   page     tablets and desktops: the bar under the profile card, the same bar as Team's sections
 *            (TabBar), pinned at the top of the page once the card has scrolled away; each section
 *            is an entry of the browser's history.
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
  // Tucked right under the profile card (the frame's own gap taken back), and pinned at the top of
  // the page once the card has scrolled away, so the sections stay in reach (TabBar's sticky).
  return <TabBar label="Profile sections" items={sections.map((s) => ({ key: s.key, href: hrefOf(s), label: s.label, icon: s.icon, testId: `profile-tab-${s.key}` }))} current={current.key} keepScroll sticky testId="profile-tabs" className="max-md:hidden md:-mt-2.5" />;
}

/** Where a section starts when it is opened far down the page: just under the bar, the profile card scrolled away. */
function sectionTop(): number | null {
  const card = document.querySelector<HTMLElement>("[data-testid=profile-header]");
  if (!card) return null;
  const bar = document.querySelector<HTMLElement>("[data-testid=mobile-topbar]")?.offsetHeight ?? 0;
  return Math.max(0, card.getBoundingClientRect().bottom + window.scrollY - bar);
}

/** How long a section just chosen is held at its top while its content arrives (its loading state comes first). */
const SETTLE_MS = 3000;

/**
 * Brings a section just chosen to its top and keeps it there while its content arrives. The card
 * on the new section is not the card on the old one (the Overview's is tall, the others' a band),
 * so the top is measured once the section has committed, with its own header on the page. The
 * route commits with the section's loading state, shorter than the content (the browser clamps the
 * scroll offset to it), and the content then replaces it (scroll anchoring can move the page to
 * keep a piece of the loading state in view): so the place is set again on each change to the page
 * until it has settled, unless the reader has scrolled meanwhile. Returns the cleanup.
 */
function settleSectionTop(): () => void {
  const main = document.querySelector("main");
  let expected = -1;
  let timer = 0;
  const observer = new MutationObserver(() => place());
  const stop = () => {
    observer.disconnect();
    window.removeEventListener("scroll", onScroll);
    window.clearTimeout(timer);
  };
  const place = () => {
    const top = sectionTop();
    if (top === null) return;
    expected = top;
    window.scrollTo({ top });
  };
  // The reader scrolled: the page is theirs (a scroll clamped by a shorter loading state is not theirs).
  const onScroll = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (Math.abs(window.scrollY - expected) > 1 && window.scrollY < max - 1) stop();
  };
  place();
  if (main) observer.observe(main, { childList: true, subtree: true });
  window.addEventListener("scroll", onScroll, { passive: true });
  timer = window.setTimeout(stop, SETTLE_MS);
  return stop;
}

function ChromeTabs({ items, current }: { items: Array<{ key: string; href: string; label: string; testId: string }>; current: string }) {
  // The section was chosen with the card scrolled away: the new one starts at its top (settleSectionTop).
  const pending = React.useRef(false);
  React.useEffect(() => {
    if (!pending.current) return;
    pending.current = false;
    return settleSectionTop();
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
                  pending.current = !on && top !== null && window.scrollY > top;
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
