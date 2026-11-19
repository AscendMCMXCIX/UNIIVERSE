"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { PROFILE_SECTIONS, activeHref, prefetchOf } from "@/lib/nav";
import { TabBar } from "@/components/ui/tab-bar";
import { ChromeTabs } from "@/components/ui/chrome-tabs";

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
 *            is an entry of the browser's history. Not in a phone held sideways (a short window
 *            below lg), which carries them in its top bar as upright.
 *   chrome   phones, either way round: in the top bar (MobileNav), so the sections stay in reach
 *            however far the page scrolls; four short names sharing the width, 44px tall (held
 *            sideways the compact bar's second row), the same row as a destination's tabs there
 *            (ChromeTabs). Moving between them replaces the history entry (as a phone's tabs
 *            within one screen do), so Back leaves the profile, and a section opened far down the
 *            page starts at its top, just under the bar.
 * No section is fetched ahead of a tap: a profile's layout starts its player's Riot refresh (nav.ts,
 * prefetchOf).
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
  // Tablets and desktops: a section chosen from further down than its own top starts at that top,
  // under the pinned tabs (settleSectionTop), as on a phone. One chosen with its top still in view
  // (the card at rest, or only scrolled a little) keeps the page where it is: it never moves down.
  const pending = React.useRef<{ key: string; from: number } | null>(null);
  React.useEffect(() => {
    const chosen = pending.current;
    pending.current = null;
    if (variant !== "page" || !chosen || chosen.key !== current.key) return;
    const top = sectionTop("page");
    if (top === null || chosen.from <= top) return;
    return settleSectionTop("page");
  }, [current.key, variant]);
  if (variant === "chrome") return <ProfileChromeTabs items={sections.map((s) => ({ key: s.key, href: hrefOf(s), label: s.short, testId: `profile-chrome-tab-${s.key}`, prefetch: prefetchOf(s.href) }))} current={current.key} />;
  // Tucked right under the profile card (the frame's own gap taken back), and pinned at the top of
  // the page once the card has scrolled away, so the sections stay in reach (TabBar's sticky).
  return (
    <TabBar
      label="Profile sections"
      items={sections.map((s) => ({ key: s.key, href: hrefOf(s), label: s.label, icon: s.icon, testId: `profile-tab-${s.key}`, prefetch: prefetchOf(s.href) }))}
      current={current.key}
      keepScroll
      sticky
      testId="profile-tabs"
      className="max-md:hidden max-lg:short:hidden md:-mt-2.5"
      onChoose={(key) => {
        pending.current = { key, from: window.scrollY };
      }}
    />
  );
}

const CARD = "[data-testid=profile-header]";
const BAR = "[data-testid=mobile-topbar]";

/**
 * Where a section starts when it is opened far down the page, the profile card scrolled away. Phones
 * (`chrome`): just under the top bar, which carries the sections. Tablets and desktops (`page`): with
 * the section tabs just pinned (at the top bar's foot, or the window's edge beside the sidebar,
 * where the bar is hidden) and the section right under them. The tabs' place in the page is read
 * with their pinning set aside for the measurement (in the same frame, so nothing is drawn), as
 * whatever spacing puts them under the card.
 */
function sectionTop(variant: "page" | "chrome"): number | null {
  const card = document.querySelector<HTMLElement>(CARD);
  if (!card) return null;
  const tabs = variant === "page" ? document.querySelector<HTMLElement>("[data-testid=profile-tabs]") : null;
  const bar = document.querySelector<HTMLElement>(BAR)?.offsetHeight ?? 0;
  if (tabs) {
    // Pinned at their sticky offset; in a window too short for them to pin (globals.css sticky-tabs),
    // just under the top bar.
    const style = getComputedStyle(tabs);
    const pinnedAt = style.position === "sticky" ? parseFloat(style.top) || 0 : bar;
    const sticky = tabs.style.position;
    tabs.style.position = "static";
    const top = tabs.getBoundingClientRect().top + window.scrollY;
    tabs.style.position = sticky;
    return Math.max(0, Math.round(top - pinnedAt));
  }
  return Math.max(0, card.getBoundingClientRect().bottom + window.scrollY - bar);
}

/** The profile card has gone under the bar, wholly or in part: the reader is in the section's content. */
function cardScrolledPast(): boolean {
  const card = document.querySelector<HTMLElement>(CARD);
  if (!card) return false;
  const bar = document.querySelector<HTMLElement>(BAR)?.offsetHeight ?? 0;
  return card.getBoundingClientRect().top < bar;
}

/** The settle ends once the section's content has replaced its loading state, or after this long at most. */
const SETTLE_MAX_MS = 10_000;
/** Input from the reader: from then on the page is theirs. */
const READER_INPUT = ["wheel", "touchstart", "pointerdown", "keydown"] as const;

/**
 * Brings a section just chosen to its top and keeps it there while its content arrives. The card
 * on the new section is not the card on the old one (the Overview's is tall, the others' a band),
 * so the top is measured once the section has committed, with its own header on the page. The
 * route commits with the section's loading state, shorter than the content (the browser clamps the
 * scroll offset to it), and the content then replaces it (scroll anchoring can move the page to
 * keep a piece of the loading state in view): so the place is set again on each change to the page
 * until the loading state has gone and the top has been reached, or for ten seconds at most on a
 * slow connection. The route can also commit for a moment with neither the loading state nor the
 * content, no taller than the screen: the offset is clamped to 0 then, and only a later change to
 * the page brings the top within reach. The reader takes over with any input, or with a scroll of
 * their own (one that moved the page while its height stayed the same: a clamp or an anchoring
 * adjustment comes with a change of height). Returns the cleanup.
 */
function settleSectionTop(variant: "page" | "chrome"): () => void {
  const main = document.querySelector("main");
  let expected = -1;
  let height = 0;
  let timer = 0;
  let target: number | null = null;
  const loading = () => !!main?.querySelector('[role="status"][aria-label="Loading"]');
  const place = () => {
    const top = sectionTop(variant);
    if (top === null) return;
    target = top;
    // Instant: a smooth scroll would still be under way when the next change to the page arrives.
    window.scrollTo({ top, behavior: "instant" });
    // Where the page is now: a page too short for the top clamps it, and that is still this
    // settle's own doing (the next change to the page brings the top within reach).
    expected = window.scrollY;
    height = document.documentElement.scrollHeight;
  };
  // Done once the content is on the page and the page is at the section's top.
  const settled = () => !loading() && target !== null && Math.abs(window.scrollY - target) <= 1;
  const observer = new MutationObserver(() => {
    place();
    if (settled()) stop();
  });
  const stop = () => {
    observer.disconnect();
    window.removeEventListener("scroll", onScroll);
    for (const type of READER_INPUT) window.removeEventListener(type, stop);
    window.clearTimeout(timer);
  };
  const onScroll = () => {
    if (Math.abs(window.scrollY - expected) > 1 && document.documentElement.scrollHeight === height) stop();
  };
  place();
  if (!main || settled()) return () => undefined;
  observer.observe(main, { childList: true, subtree: true });
  window.addEventListener("scroll", onScroll, { passive: true });
  for (const type of READER_INPUT) window.addEventListener(type, stop, { passive: true });
  timer = window.setTimeout(stop, SETTLE_MAX_MS);
  return stop;
}

/** The profile's sections in a phone's top bar: the shared row (ChromeTabs), a section chosen once the card has gone under the bar landing at its own top. */
function ProfileChromeTabs({ items, current }: { items: React.ComponentProps<typeof ChromeTabs>["items"]; current: string }) {
  // The section chosen while the card was under the bar: it starts at its top (settleSectionTop)
  // once it is the current one. Any other change of section (Back to one reached by a link) is
  // the reader's own place to keep.
  const pending = React.useRef<string | null>(null);
  React.useEffect(() => {
    const chosen = pending.current;
    pending.current = null;
    if (chosen !== current) return;
    return settleSectionTop("chrome");
  }, [current]);
  return (
    <ChromeTabs
      label="Profile sections"
      items={items}
      current={current}
      // Lands at the section's own top (settleSectionTop), never at the page's (ScrollOnNavigate).
      replace
      keepScroll
      onChoose={(key) => {
        pending.current = key && cardScrolledPast() ? key : null;
      }}
      testId="profile-chrome-tabs"
    />
  );
}
