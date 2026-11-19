"use client";

import * as React from "react";
import Link from "next/link";
import { isPlainClick, scrollToTop, stayOnCurrentPage } from "@/lib/back-to-top";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, LogOut, SlidersHorizontal } from "lucide-react";
import { BrandMark } from "./brand-mark";
import { Avatar } from "./ui/avatar";
import { DetailModal } from "./ui/detail-modal";
import { ChromeTabs } from "./ui/chrome-tabs";
import { ModeSwitch } from "./mode-switch";
import { ACCOUNT_LINKS, ADMIN_ACCOUNT_LINKS, backSteps, currentDestination, destinations, isActivePath, pageName, phoneParent, prefetchOf, profileBase, sectionHubOf, withSectionMemory, type Destination } from "@/lib/nav";
import { AccountMenu, otherUsername } from "./account-menu";
import { announceAccountChange, markAccountChange } from "./account-guard";
import { InstallAppEntry } from "./install/install-app";
import { useInstallState } from "./install/install-state";
import { ProfileTabs } from "./players/profile-tabs";
import { useHeld, usePageFilters, useScrolledAway } from "./ui/page-toolbar";
import { ScrollRow } from "./ui/scroll-row";
import { useBackCloses } from "./ui/use-back-closes";
import { releaseEarlyTaps } from "./early-taps";
import { cn } from "@/lib/cn";
import { ACCOUNT_GROUP, ACCOUNT_ROW, ACCOUNT_ROW_CHEVRON, ACCOUNT_ROW_CURRENT, ACCOUNT_ROW_ICON, ACCOUNT_ROW_IDLE, ACCOUNT_ROW_LABEL } from "@/lib/sheet";
import { RAIL_CURRENT, RAIL_HOVER } from "@/lib/sidebar";

export interface MobileNavProps {
  logoSrc: string | null;
  /** Still frame of an animated logo, for reduced motion. */
  logoStill?: string | null;
  shortName: string;
  tagline: string;
  home: string;
  user: { name: string; username?: string | null; avatarUrl: string | null; roleLabel: string } | null;
  /** A quiet data-freshness line at the foot of the account screen and of a tablet's avatar menu. */
  status: React.ReactNode;
  /** Riot's notice at the foot of the account screen and of a tablet's avatar menu: its full text (the line's title) and where its Details link leads. */
  legal: { title: string; href: string };
  showSignOut: boolean;
  /** Paths this account may open in the current mode (the server decides). */
  allowed: string[];
  /** Admin Mode: the top bar says so beside the team's mark (held sideways in a compact line of its own, read with the mark's link), and the destinations are its own. */
  adminMode?: boolean;
  /** The account has a player profile (your own profile's sections then ride in the top bar). */
  hasPlayer?: boolean;
  /** The mode this administrator is in, for the switch between Player Mode and Admin Mode (administrators only, placed apart from the pages); null for everyone else. */
  modeSwitch?: "player" | "admin" | null;
}

/*
  The frame below lg (the sidebar takes over from lg), by posture (docs/MOBILE.md, "Frames by
  posture"). The posture is CSS's to decide (the window's width and height), so the first paint is
  right and a turn of the phone changes it at once; the parts each posture does not use are drawn
  but not displayed (one `nav[aria-label=Primary]` is exposed at a time).

  ONE SET OF DESTINATIONS EVERYWHERE (navigation N1, 19 Nov 2026): the sidebar's four, in its order,
  with its icons and names (nav.ts, destinations): Player Mode's My Profile, Team, Matchup Intel and
  Resources; Admin Mode's Dashboard, Users & Permissions, Platform Settings and System. A
  destination that stands for a set of pages (Team; Users & Permissions, Platform Settings and
  System) shows them as tabs: on phones the top bar's second row (ChromeTabs), on tablets the tabs
  pinned in the page (SectionTabs). Every bar names its destinations by one label ladder, by its own
  width in rem (so the reader's text size counts): the whole names, then the short ones ("Profile",
  "Intel"; "Users", "Platform"; the whole names still read out), then the icons alone (the names
  read out only).

  PHONES HELD UPRIGHT (below md, taller than 480px): one frame, the same on every page:
    - the top bar says where you are: the team's mark on a destination's own pages, or Back on a page
      reached from one (a teammate's profile, Settings), labelled with where it leads; the page's
      title joins it once the page's own heading has scrolled up under it; the page's Filters once
      its own have; your avatar at its right end opens the account screen. Under it ride a profile's
      sections on a profile, and a destination's tabs on its pages (Team's sections on Team's), so
      they stay in reach however far the page scrolls;
    - the bottom tab bar holds the four destinations, one tap each, within reach of the thumb. A
      destination with tabs reopens the one last used in this tab of the browser, and tapped again
      while it is the current one leads to its first (Team: Overview) (withSectionMemory);
    - the account screen holds the account's own items only, on a screen of its own (DetailModal
      size "screen"): who is signed in; Settings and Install App; the switch between the modes and
      Sign out; the team's mark, the patch and Riot's notice at its foot. It is fixed to the screen's
      four edges, so its height is the screen's: the sheet and the panel before it were as tall as
      their content, which Safari 26 worked out as a header alone, and the owner's iPhone showed each
      as a strip (DetailModal's BODY_SCROLLS, docs/MOBILE.md). Back closes it and leaves the page as
      it is (useBackCloses), as it closes a game.
  PHONES HELD SIDEWAYS (a short window, 480px tall or less, below lg, whatever its width): the
    same destinations in one compact bar, 44px plus the status bar's inset, and no bottom bar: Back
    or the team's mark (in Admin Mode with "Admin mode" beside it), the four destinations (by the
    label ladder, then only the current one labelled, then the icons alone: SIDEWAYS_FIT), the
    page's title where room is left, Filters, the avatar (the account screen); a profile's sections,
    or a destination's tabs, as a 44px second row. It slides away while the page scrolls down and
    comes back on a scroll up, and while it holds the focus (useHideOnScroll).
  TABLETS (md to lg, taller than 480px): the top bar holds the destinations, one tap each, the page
    tabs (a destination's, a profile's) are pinned in the page, and the avatar opens the account
    menu (AccountMenu), which holds what the sidebar's footer holds on a desktop: Settings, Install
    App, the switch between the modes, Sign out, the patch and Riot's notice. Installed as an app, a
    tablet has no browser Back, so the bar offers Back there too, on a page reached from another.

  The avatar answers a tap made before the page's code has run: the inline script in the root
  layout keeps it (early-taps.ts), shows the button pressed, and this opens what was asked for once
  it runs, exactly once.

  Safe-area insets keep the bars clear of notches, rounded corners and the home indicator.
*/
export function MobileNav({ logoSrc, logoStill, shortName, tagline, home, user, status, legal, showSignOut, allowed, adminMode = false, hasPlayer = false, modeSwitch = null }: MobileNavProps) {
  // The account's own pages in this mode (Settings), so it never leaves the mode.
  const accountLinks = adminMode ? ADMIN_ACCOUNT_LINKS : ACCOUNT_LINKS;
  const pathname = usePathname();
  // The mode's destinations for this account: the sidebar's, in its order (a tablet's top bar).
  const list = destinations(allowed, adminMode);
  const current = currentDestination(pathname, list);
  // A phone's (its bottom bar upright, its compact bar sideways): each destination with tabs
  // reopens the one last used, while it is not the current destination.
  const memory = useSectionMemory();
  const tabs = withSectionMemory(list, pathname, memory);
  React.useEffect(() => {
    const hub = sectionHubOf(pathname);
    if (hub) rememberSection(hub.key, pathname);
  }, [pathname]);
  // A destination's tabs on its pages (Team's sections; Admin Mode's sets), as the top bar's second
  // row on phones: the ones this account may open, when there is a choice.
  const hub = sectionHubOf(pathname);
  const hubSections = hub ? hub.sections.filter((s) => allowed.includes(s.href)) : [];
  // The account screen remembers the path it was opened on, so any navigation closes it without an
  // effect; forgotten once the page has changed, so coming back to that page (Forward) opens nothing unasked.
  const [sheetAt, setSheetAt] = React.useState<string | null>(null);
  const [seenPath, setSeenPath] = React.useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    if (sheetAt !== null && sheetAt !== pathname) setSheetAt(null);
  }
  const sheetOpen = sheetAt === pathname;
  // Back (the browser's, Android's) closes the account screen and the page stays (its own history entry).
  const sheetBack = useBackCloses(sheetOpen, () => setSheetAt(null));
  // The page's code runs now: a tap on the avatar made before it (early-taps.ts) is passed on to the
  // button, once, which opens the account screen; from here on the button answers for itself. (The
  // tablet's avatar is the account menu's, which releases its own.)
  React.useEffect(() => releaseEarlyTaps("sheet"), []);
  // The installed app has no browser Back: tablets get one in the bar too (phones always have it).
  const { standalone } = useInstallState();
  const headerRef = React.useRef<HTMLElement>(null);
  const hidden = useHideOnScroll();
  const bar = useTopBarHeight(headerRef);
  const heading = usePageHeading(pathname, bar);
  const back = useBack(pathname, heading.text, list, home);
  // The page's filters (its FilterBar), offered in the bar once the page's own have gone up under it,
  // and kept while in use: pressed or focused, while the sheet it opened is open, and until that sheet
  // has handed it the focus back (useHeld).
  const filters = usePageFilters();
  const filtersAway = useScrolledAway(filters?.root ?? null, bar || null);
  const filtersButton = React.useRef<HTMLButtonElement>(null);
  const filtersSheet = filters?.openedFrom === "topbar";
  const filtersHold = useHeld(filtersButton, filtersAway, filtersSheet);
  // A profile's sections, when this page is one (your own only when you have a profile).
  const profile = adminMode ? null : profileBase(pathname);
  const sections = profile === "/overview" && !hasPlayer ? null : profile;
  const titleShown = heading.past && !!heading.text;
  // A tablet's bar gives way at a larger text size (BAR_FIT): the team's name first, then the
  // destinations' whole names to their short ones, then to the icons; beside Back (the installed
  // app, on a page reached from another) each step comes sooner, Back having taken the name's room
  // (shown as Back is: by the browser's answer, or by the display mode until the page has run).
  const barFit = BAR_FIT[adminMode ? "admin" : "member"];
  const besideBack = back ? (standalone ? barFit.besideBack : barFit.besideBackInstalled) : null;
  const fit = TAB_FIT[adminMode ? "admin" : "member"];
  const sideways = SIDEWAYS_FIT[adminMode ? "admin" : "member"];

  return (
    <>
      <header
        ref={headerRef}
        className="sticky top-0 z-40 border-b border-border bg-chrome/90 pt-safe backdrop-blur-md transition-transform duration-200 ease-out data-[hidden=true]:not-focus-within:-translate-y-full lg:hidden"
        data-hidden={hidden && !sheetOpen}
        data-testid="mobile-topbar"
      >
        {/* The bar's row is the container its parts give way by (in rem, so the reader's text size
            counts): a phone held sideways names its destinations by SIDEWAYS_FIT, a tablet's brand
            name and names give way at large text (BAR_FIT). */}
        <div className="@container/topbar flex min-h-13 items-center gap-1 px-safe-2 sm:px-safe-4 md:min-h-14 md:gap-2 short:min-h-11 short:gap-1">
          {/* Back where the page was reached from another (labelled with where it leads), else the
              team's mark: on phones either way round; on tablets in the installed app only. */}
          {back ? (
            back.history ? (
              <button type="button" onClick={back.go} className={cn(BACK_CLASS, !standalone && BACK_TABLET)} data-testid="mobile-back">
                <ChevronLeft className="h-5 w-5 shrink-0" aria-hidden />
                <span className="truncate">{back.label}</span>
                <span className="sr-only">, back</span>
              </button>
            ) : (
              <Link href={back.href} prefetch={prefetchOf(back.href)} className={cn(BACK_CLASS, !standalone && BACK_TABLET)} data-testid="mobile-back">
                <ChevronLeft className="h-5 w-5 shrink-0" aria-hidden />
                <span className="truncate">{back.label}</span>
                <span className="sr-only">, back</span>
              </Link>
            )
          ) : null}
          {/* The team's mark, and on tablets and upright phones its name. It gives way (its name
              truncates, or goes on a tablet: BAR_FIT) only when a larger text size leaves the bar
              no room, so the bar never makes the page wider than the screen. Held sideways the mark
              alone, so the destinations have the room. */}
          <Link href={home} prefetch={prefetchOf(home)} className={cn("flex min-h-11 min-w-0 items-center gap-2.5 rounded-md md:min-h-14 md:min-w-8 md:shrink-[1000] short:min-h-11 short:shrink-0", back ? "max-md:hidden short:hidden" : "max-md:pl-1.5 short:pl-1.5")} title={shortName} data-testid="mobile-brand">
            <BrandMark src={logoSrc} still={logoStill} name={shortName} className="h-8 w-8 rounded-md text-base" />
            <span className={cn("min-w-0 transition-opacity duration-150 short:hidden", barFit.brand, titleShown && "max-md:hidden")} data-testid="mobile-brand-name">
              <span className="block truncate text-sm font-bold tracking-label text-fg">{shortName}</span>
              {adminMode ? <span className="block truncate text-xs font-semibold uppercase tracking-label text-accent">Admin mode</span> : tagline ? <span className="block truncate text-xs text-fg-subtle max-md:hidden">{tagline}</span> : null}
            </span>
            {/* Held sideways the mark stands alone, but the mode is still said: "Admin mode" beside it,
                in the accent, the link read as the team's name and the mode; at a larger text size the
                words give way to the destinations and are read out only (SIDEWAYS_FIT). */}
            {adminMode ? (
              <span className="hidden whitespace-nowrap short:block" data-testid="mobile-brand-mode">
                <span className="sr-only">{shortName}, </span>
                <span className={cn("label-caps text-accent", sideways.mode)}>Admin mode</span>
              </span>
            ) : null}
          </Link>
          {/* Held sideways: the destinations, one tap each, in the bar (there is no bottom bar). The
              current one is lit twice (its icon in an accent pill, its name shown and bright); by the
              label ladder the names go short, then the others' are left to screen readers, then the
              current one's too (SIDEWAYS_FIT). Too long for the bar even so (large text), the row
              scrolls sideways inside it, the current one kept in view, never widening the page. */}
          {tabs.length > 0 ? (
            <nav aria-label="Primary" className="hidden min-w-0 shrink-[0.001] short:flex" data-testid="topbar-tabs">
              <ScrollRow as="ul" className="flex items-center gap-0.5" keepCurrentInView current={current?.key}>
                {tabs.map((d) => {
                  const active = d.key === current?.key;
                  const own = d.key === "/overview" && user?.avatarUrl;
                  const id = destinationId(d);
                  return (
                    <li key={d.key} className="shrink-0">
                      <Link
                        href={d.href}
                        prefetch={prefetchOf(d.href)}
                        aria-current={active ? "page" : undefined}
                        // The current destination on its own page: back to the top, as the tab bar's does.
                        onClick={(e) => stayOnCurrentPage(e, active && pathname === d.href)}
                        className="group flex h-11 min-w-11 items-center justify-center rounded-md focus-visible:-outline-offset-2"
                        data-testid={`topbar-tab-${id}`}
                      >
                        <span className={cn("flex h-8 items-center gap-1.5 rounded-full px-2 transition-colors duration-150", active ? "bg-accent/15 text-accent" : "text-fg-muted group-hover:bg-surface-2 group-hover:text-fg")}>
                          {own ? <Avatar name={user!.name} src={user!.avatarUrl} size="xs" className={cn(active && "ring-2 ring-accent")} /> : <d.icon className="h-5 w-5 shrink-0" aria-hidden />}
                          <LadderName label={d.label} short={d.short} rest={sideways.rest} className={cn("whitespace-nowrap text-2xs font-medium leading-none", active ? cn("font-semibold text-fg", sideways.current) : sideways.others)} />
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ScrollRow>
            </nav>
          ) : null}
          {/* Tablets: the destinations, one tap each (the drawer they were in has gone). The current
              one is marked as in the sidebar, with its four signals: a neutral lift with a hairline of
              light, the brand's gradient as a short bar, its icon in the brand blue and its name
              bright. The list grows into the room left, so the avatar stays at the bar's end; at a
              larger text size the team's name beside the mark gives way first, then the names to
              their short ones, then to the icons (BAR_FIT), and as a last resort the list scrolls
              sideways inside the bar, never widening the page. */}
          {list.length > 0 ? (
            <nav aria-label="Primary" className="hidden min-w-0 md:not-short:flex md:not-short:grow" data-testid="topbar-destinations">
              <ScrollRow as="ul" className="flex min-w-0 items-center gap-1" keepCurrentInView current={current?.key}>
                {list.map((d) => {
                  const active = d.key === current?.key;
                  return (
                    <li key={d.key} className="shrink-0">
                      <Link
                        href={d.href}
                        prefetch={prefetchOf(d.href)}
                        aria-current={active ? "page" : undefined}
                        // The page already shown stays as it is (its view and filters) and goes back to the top, as the sidebar's entry does.
                        onClick={(e) => stayOnCurrentPage(e, d.href === pathname)}
                        title={d.label}
                        className={cn("group isolate relative flex min-h-11 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition-colors duration-150 focus-visible:-outline-offset-2", active ? "text-fg" : "text-fg-muted hover:text-fg")}
                        data-testid={`topbar-nav-${destinationId(d)}`}
                      >
                        <span className={cn("absolute inset-0 -z-10 rounded-lg transition-[background-color,box-shadow] duration-150", active ? RAIL_CURRENT : RAIL_HOVER)} aria-hidden />
                        {/* The brand's gradient as a short bar at the destination's foot, growing in from its centre, as the sidebar's at its row's edge. */}
                        <span className={cn("absolute inset-x-3 bottom-1 h-0.5 rounded-full bg-gradient-to-r from-accent to-accent-2 transition-[opacity,scale] duration-200 ease-emphasized", active ? "scale-x-100 opacity-100" : "scale-x-50 opacity-0")} aria-hidden data-testid={active ? "topbar-current-bar" : undefined} />
                        <d.icon className={cn("h-[1.125rem] w-[1.125rem] shrink-0 transition-colors duration-150", active ? "text-accent" : "text-fg-subtle group-hover:text-fg-muted")} aria-hidden />
                        <LadderName label={d.label} short={d.short} rest={cn(barFit.rest, besideBack?.rest)} className={cn("whitespace-nowrap", barFit.label, besideBack?.label)} />
                      </Link>
                    </li>
                  );
                })}
              </ScrollRow>
            </nav>
          ) : null}
          {/* Phones (and tablet widths held sideways, where the section tabs do not pin): the page's
              own title, once its heading has gone up under the bar; a tap on it goes back to the
              top, as iOS's status bar does. It takes the room the bar has left: held sideways, where
              the destinations share the bar, it shows only where that room is at least 6rem (the
              current destination's label says where you are, and leads back to the top too). */}
          <div className="@container/title min-w-0 flex-1 md:not-short:hidden">
            {titleShown ? (
              <button type="button" onClick={scrollToTop} className="min-h-11 w-full min-w-0 truncate rounded-md px-1 text-left text-base font-semibold text-fg transition-opacity duration-150 short:@max-[6rem]/title:hidden" aria-label={`${heading.text}: back to top`} data-testid="mobile-title">
                {heading.text}
              </button>
            ) : (
              <p className="px-1 opacity-0" aria-hidden data-testid="mobile-title" />
            )}
          </div>
          {/* Phones, and tablet widths in a window 480px tall or less (where the section tabs do not pin
              and their row cannot offer them): the page's Filters, once its own have scrolled up under
              the bar; its sheet, as from the page's own button. 44px, with the count of narrowed filters. */}
          {filters && (filtersAway || filtersHold.held || filtersSheet) ? (
            <button ref={filtersButton} type="button" onClick={() => filters.open("topbar")} onFocus={filtersHold.grab} onPointerDown={filtersHold.grab} onBlur={filtersHold.onBlur} aria-haspopup="dialog" className="relative grid h-11 w-11 shrink-0 place-items-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg md:not-short:hidden" data-testid="topbar-filters">
              <SlidersHorizontal className="h-5 w-5 text-accent" aria-hidden />
              {/* At tablet widths (a phone held sideways) a list's own choices are its toolbar's, not the sheet's: the bar's own name and count there. */}
              <span className={cn("sr-only", filters.wideSummary !== filters.summary && "md:hidden")}>Filters: {filters.summary}</span>
              {filters.wideSummary !== filters.summary ? <span className="sr-only max-md:hidden">Filters: {filters.wideSummary}</span> : null}
              {filters.count ? <span className={cn(TOPBAR_COUNT, filters.wideCount !== filters.count && "md:hidden")}>{filters.count}</span> : null}
              {filters.wideCount && filters.wideCount !== filters.count ? <span className={cn(TOPBAR_COUNT, "max-md:hidden")}>{filters.wideCount}</span> : null}
            </button>
          ) : null}
          {user ? (
            <>
              {/* Tablets: the account menu, with what the sidebar's footer holds on a desktop. */}
              <span className="shrink-0 max-md:hidden short:hidden">
                <AccountMenu user={user} showSignOut={showSignOut} variant="topbar" adminMode={adminMode} extras={{ modeSwitch, status, legal }} />
              </span>
              {/* Phones, either way round: the account screen. A tap before the page's code has run is
                  kept (data-early; suppressHydrationWarning: the script may have marked it aria-busy,
                  which React leaves alone). */}
              <button type="button" onClick={() => setSheetAt(pathname)} aria-haspopup="dialog" aria-expanded={sheetOpen} aria-label={`Your account: ${user.name}`} className="-mr-1 grid h-11 w-11 shrink-0 place-items-center rounded-full transition-transform duration-100 active:scale-90 motion-reduce:active:scale-100 md:not-short:hidden" data-early="sheet" suppressHydrationWarning data-testid="account-sheet-button">
                <Avatar name={user.name} src={user.avatarUrl} size="sm" />
              </button>
            </>
          ) : null}
        </div>
        {/* Phones, either way round: a profile's sections, or a destination's tabs, stay under the bar
            while the page scrolls (the same row: ChromeTabs). */}
        {sections ? (
          <div className="px-safe-2 md:not-short:hidden" data-testid="profile-sections-bar">
            <ProfileTabs basePath={sections} variant="chrome" />
          </div>
        ) : hub && hubSections.length > 1 ? (
          <div className="px-safe-2 md:not-short:hidden" data-testid="hub-sections-bar">
            <ChromeTabs label={hub.label} items={hubSections.map((s) => ({ key: s.href, href: s.href, label: s.label, testId: `${hub.key}-chrome-tab-${s.href.split("/").pop()}` }))} current={pathname} testId={`${hub.key}-chrome-tabs`} />
          </div>
        ) : null}
      </header>

      {sheetOpen && user ? (
        // The account screen (its test ids keep the name of the sheet it replaced): the whole screen,
        // fixed to its edges (DetailModal size "screen"). Its header, with the close button, stays
        // under the status bar; the rest is one region that scrolls only where it must (large text, a
        // phone held sideways, a 320pt screen in Safari's tab), the team's mark and the notes at its
        // foot. The account's own items only: every page is a destination, one tap in the bar.
        <DetailModal open onClose={() => setSheetAt(null)} size="screen" title="Account" titleId={SHEET_TITLE_ID} header={<AccountScreenHeader />} headerClassName="border-transparent" className="bg-chrome" bodyClassName="flex flex-col" testId="account-sheet" closeTestId="account-sheet-close">
          <div className="mx-auto flex w-full max-w-md grow flex-col">
            {/* Who is signed in: their picture, name and role, and their username on a line of its own
                where it differs from the name (it tells apart accounts that share a name). Nothing is
                cut short: a long name or username wraps (usernames run to 32 characters). */}
            <div className="flex min-w-0 items-center gap-4 pb-5" data-testid="account-identity">
              <Avatar name={user.name} src={user.avatarUrl} size="lg" />
              <div className="min-w-0">
                <p className="text-xl font-semibold leading-tight text-fg [overflow-wrap:anywhere]" data-testid="account-name">
                  {user.name}
                </p>
                <p className="mt-1 text-sm text-fg-muted" data-testid="account-role">
                  {user.roleLabel}
                </p>
                {otherUsername(user) ? (
                  <p className="text-sm text-fg-muted [overflow-wrap:anywhere]" data-testid="account-username">
                    Username: {otherUsername(user)}
                  </p>
                ) : null}
              </div>
            </div>
            {/* The account's own pages (Settings) and Install App, one full-width row each (lib/sheet.ts). */}
            <nav aria-label="Your account" className={ACCOUNT_GROUP}>
              {accountLinks.map(({ href, label, icon }) => (
                <AccountRow
                  key={href}
                  href={href}
                  icon={icon}
                  active={isActivePath(pathname, href)}
                  here={href === pathname}
                  replace={sheetBack.replace}
                  onNavigate={(leaves) => {
                    // Leaving the page: the link takes the screen's history entry for its own.
                    if (leaves) sheetBack.leaving();
                    setSheetAt(null);
                  }}
                >
                  {label}
                </AccountRow>
              ))}
              {/* The install window opens over the page: the screen closes first, and hands it its entry. */}
              <InstallAppEntry
                variant="row"
                beforeOpen={() => {
                  sheetBack.handOver();
                  setSheetAt(null);
                }}
              />
            </nav>
            {modeSwitch || showSignOut ? (
              // The way between the modes, and Sign out: a group of their own, under the pages.
              <div className={cn(ACCOUNT_GROUP, "mt-4")} data-testid="account-sheet-actions">
                {modeSwitch ? <ModeSwitch mode={modeSwitch} variant="row" /> : null}
                {showSignOut ? (
                  <form action="/api/auth/logout" method="post" onSubmit={onSignOut}>
                    <button className={cn(ACCOUNT_ROW, "text-bad")} type="submit" data-testid="sign-out">
                      <LogOut className={ACCOUNT_ROW_ICON} aria-hidden /> Sign out
                    </button>
                  </form>
                ) : null}
              </div>
            ) : null}
            {/* The team's mark, the patch and Riot's notice: quiet lines at the screen's foot, as the
                sidebar's footer has them. Following a link there (Riot's notice leads to Settings)
                closes the screen first: on Settings itself only the address's anchor changes, which
                would leave the screen open over the section it leads to. */}
            <div
              className="mt-auto flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1 pt-6 text-center"
              onClickCapture={(e) => {
                // Only a plain click follows the link here: a modified one opens it elsewhere (a new
                // tab or window), and this page, with its screen, stays as it was.
                if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                if ((e.target as Element | null)?.closest?.("a[href]")) {
                  sheetBack.leaving();
                  setSheetAt(null);
                }
              }}
              data-testid="account-sheet-notes"
            >
              <p className="flex w-full items-center justify-center gap-2 pb-1 text-xs font-semibold tracking-label text-fg-muted" data-testid="account-sheet-team">
                <BrandMark src={logoSrc} still={logoStill} name={shortName} className="h-5 w-5 rounded text-2xs" />
                <span className="min-w-0 truncate">{shortName}</span>
              </p>
              {status}
              <p className="text-xs leading-snug text-fg-subtle" title={legal.title}>
                Not endorsed by Riot Games.{" "}
                <Link href={legal.href} replace={sheetBack.replace} className="touch-target underline underline-offset-2">
                  Details
                </Link>
              </p>
            </div>
          </div>
        </DetailModal>
      ) : null}

      {tabs.length > 0 ? (
        <nav className="@container/tabbar fixed inset-x-0 bottom-0 z-40 border-t border-border bg-chrome/95 px-safe pb-safe backdrop-blur-md md:hidden short:hidden" aria-label="Primary" data-testid="phone-tabbar">
          {/* One column per destination, as wide as the bar allows and never narrower than its name,
              so the names stay whole on a 320px screen. The current tab is lit twice over: its icon
              sits in an accent pill and its name turns bright, so it reads at a glance without colour
              alone. By the label ladder (TAB_FIT), measured in the bar's own width in rem, so the
              user's text size counts (a 320px phone has 20rem at 100% and 10rem at 200%): the whole
              names, then the short ones ("Profile", "Intel"; the whole names still read out), then
              the icons alone, each pill sharing the width, the names left to screen readers. Wider
              than the phone, the bar made the browser widen the area every fixed element is placed
              in. Held sideways there is no bottom bar: the destinations ride in the top bar. */}
          <ul className="mx-auto flex max-w-lg">
            {tabs.map((d) => {
              const active = d.key === current?.key;
              const own = d.key === "/overview" && user?.avatarUrl;
              return (
                <li key={d.key} className={cn("min-w-max flex-1 basis-0", fit.li)}>
                  <Link
                    href={d.href}
                    prefetch={prefetchOf(d.href)}
                    aria-current={active ? "page" : undefined}
                    // The current tab on its own page: back to the top, as a phone's tab bar does (a page
                    // under it, such as a teammate's profile under Team, goes to its first page).
                    onClick={(e) => stayOnCurrentPage(e, active && pathname === d.href)}
                    className={cn("group flex min-h-14 flex-col items-center justify-center gap-1 px-1 pb-1 pt-1.5 text-2xs font-medium transition-colors duration-150", fit.link, active ? "font-semibold text-fg" : "text-fg-muted hover:text-fg")}
                    data-testid={`tab-${destinationId(d)}`}
                  >
                    <span className={cn("grid h-7 w-12 place-items-center rounded-full transition-colors duration-150", fit.pill, active ? "bg-accent/15 text-accent" : "group-hover:bg-surface-2")} aria-hidden>
                      {own ? <Avatar name={user!.name} src={user!.avatarUrl} size="xs" className={cn(active && "ring-2 ring-accent")} /> : <d.icon className="h-5 w-5" />}
                    </span>
                    <LadderName label={d.label} short={d.short} rest={fit.rest} className={cn("whitespace-nowrap leading-none", fit.label)} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}
    </>
  );
}

/** A destination's test id in the bars: its set's key (Team's "team"), else its address ("overview", "resources-matchups"). */
function destinationId(d: Destination): string {
  return d.hub ?? d.key.slice(1).replaceAll("/", "-");
}

/*
  The section each destination with tabs was last left on, in this tab of the browser (the iOS
  per-tab pattern: withSectionMemory), kept in sessionStorage so a reload or the installed app's
  return keeps it, and read once. A browser that keeps nothing (a private window, storage blocked)
  remembers nothing: each destination then opens its first page, as before.
*/
const SECTION_MEMORY = "uniiverse.sections";
let sectionMemory: Record<string, string> | null = null;
const memoryListeners = new Set<() => void>();
const subscribeMemory = (l: () => void) => {
  memoryListeners.add(l);
  return () => void memoryListeners.delete(l);
};
function readSectionMemory(): Record<string, string> {
  if (sectionMemory) return sectionMemory;
  let read: Record<string, string> = {};
  try {
    const raw: unknown = JSON.parse(window.sessionStorage.getItem(SECTION_MEMORY) ?? "{}");
    if (raw && typeof raw === "object" && !Array.isArray(raw)) read = Object.fromEntries(Object.entries(raw).filter((e): e is [string, string] => typeof e[1] === "string"));
  } catch {
    // Nothing kept, or nothing readable: nothing remembered.
  }
  sectionMemory = read;
  return read;
}
function rememberSection(hub: string, href: string) {
  const now = readSectionMemory();
  if (now[hub] === href) return;
  sectionMemory = { ...now, [hub]: href };
  try {
    window.sessionStorage.setItem(SECTION_MEMORY, JSON.stringify(sectionMemory));
  } catch {
    // Kept for this page's life only.
  }
  for (const l of memoryListeners) l();
}
/** The remembered sections (none on the server and while the page hydrates, so its first paint is the server's). */
function useSectionMemory(): Record<string, string> | null {
  return React.useSyncExternalStore(subscribeMemory, readSectionMemory, () => null);
}

/**
 * A destination's name in a bar, by the label ladder, written once: its whole name where the bar
 * has room; then its short form, the rest of the whole name read out only (`rest`: "My" before
 * "Profile", "& Permissions" after "Users"), so what shows is always part of what is read out; then
 * read out only, the icon alone (`label`, on the whole name). Each bar gives the classes for its
 * own steps (TAB_FIT, SIDEWAYS_FIT, BAR_FIT); `data-name` marks the name ("label") and the part of it
 * that gives way ("rest").
 */
function LadderName({ label, short, rest, className }: { label: string; short?: string; rest: string; className: string }) {
  if (!short || short === label)
    return (
      <span className={className} data-name="label">
        {label}
      </span>
    );
  const before = label.endsWith(short);
  const part = before ? label.slice(0, -short.length) : label.slice(short.length);
  const restSpan = (
    <span className={rest} data-name="rest">
      {part}
    </span>
  );
  return (
    <span className={className} data-name="label">
      {before ? restSpan : null}
      {short}
      {before ? null : restSpan}
    </span>
  );
}

/**
 * Sign out (a plain form post, from the account screen, as from the account menu): this tab's
 * account guard stands aside while it leaves, and the browser's other tabs are told (account-guard.tsx).
 */
function onSignOut() {
  markAccountChange(true);
  announceAccountChange();
}

/**
 * The upright tab bar's label ladder, in the bar's own width in rem (the `tabbar` container), as
 * static class lists (Tailwind reads them whole): the whole names where `rest` allows, then the short
 * ones (the rest of each read out only) down to `label`'s width, and below it each destination's icon
 * alone, each pill sharing the width, the names read out only (docs/MOBILE.md, the tab bar).
 * Measured on 19 Nov 2026 with the bundled Inter at 100% text, each tab at its own width: Player
 * Mode's four need 16.28rem with their whole names (My Profile, Team, Matchup Intel, Resources) and
 * 14.46rem short (Profile, Intel); Admin Mode's four 14.63rem short (Dashboard, Users, Platform,
 * System). Admin Mode's phone bars keep the short names at every width (its whole names, 21.02rem,
 * read out): "Platform Settings" shown in full would put a second "Settings" on the phone beside the
 * account's own (docs/MOBILE.md, the account screen). A 320px phone's bar is 20rem at 100% text, 16rem
 * at 125%, 13.3rem at 150% and 10rem at 200%; 375px 23.4, 18.8, 15.6 and 11.7; 393px 24.6, 19.7, 16.4
 * and 12.3; 430px 26.9, 21.5, 17.9 and 13.4. So Player Mode shows the whole names at 100% everywhere,
 * at 125% from 375px and at 150% on 430px, the short names at 125% on 320px and at 150% from 375px,
 * and the icons alone only at 200%, or at 150% on 320px (e2e/mobile-nav.spec.ts, the label ladder).
 */
const TAB_FIT = {
  member: {
    li: "@max-[14.8rem]/tabbar:min-w-0",
    link: "@max-[14.8rem]/tabbar:px-0.5",
    pill: "@max-[14.8rem]/tabbar:w-full @max-[14.8rem]/tabbar:max-w-12",
    rest: "@max-[16.6rem]/tabbar:sr-only",
    label: "@max-[14.8rem]/tabbar:sr-only",
  },
  admin: {
    li: "@max-[15rem]/tabbar:min-w-0",
    link: "@max-[15rem]/tabbar:px-0.5",
    pill: "@max-[15rem]/tabbar:w-full @max-[15rem]/tabbar:max-w-12",
    rest: "sr-only",
    label: "@max-[15rem]/tabbar:sr-only",
  },
} as const;

/**
 * A tablet's top bar at a larger text size, in the bar's own width in rem (the `topbar` container:
 * its row less its gutters, 1rem a side from sm, which grow with the text too), as static class
 * lists (Tailwind reads them whole). Measured on 19 Nov 2026 with the bundled Inter at 100% text,
 * the row's shown parts at their own widths and the gaps between them:
 *   Player Mode  the team's name and the whole names 42.00rem, the whole names alone 35.88rem, the
 *                short ones alone 30.38rem: the name gives way first (below 42.5rem), then the whole
 *                names (below 36.25rem), then the short ones (below 30.75rem);
 *   Admin Mode   the name (two lines, "Admin mode" under the team's) and the whole names 49.28rem,
 *                the name and the short names 39.35rem, the short names alone 32.81rem: the name
 *                says the mode, so it stays with the short names and gives way only below 39.75rem;
 *                the whole names show from 49.75rem, the short ones down to 33.25rem.
 * A 768px tablet's bar is 768px over the root's size less the 2rem of gutters: 46rem at 100% text,
 * 36.4rem at 125%, 30rem at 150%, 22rem at 200%. So Player Mode shows the name and the whole names
 * at 100%, the whole names alone at 125% and the icons alone from 150% (an 820px tablet keeps the
 * short ones at 150%); Admin Mode the name and the short names at 100%, the short names alone at
 * 125%, the icons alone from 150%. Back, which the installed app adds on a page reached from another,
 * takes about the room the name had (Back and its gap: 4.67rem as "Team", 6.94rem as "Dashboard"),
 * so beside it each step comes sooner (`besideBack`), and where both show the name shortens first. A
 * longer Back label (a teammate's long name) can still leave the list a few pixels short, where it
 * scrolls: the last resort. With the root's size raised (the specs' emulation), the bar keeps the
 * tablet's frame at any size; a real text-size setting moves the breakpoints too, so at 125% a 768px
 * window has the phone's frame (RESPONSIVE.md, "Two ways to emulate a larger text size").
 */
const BAR_FIT = {
  member: {
    brand: "md:@max-[42.5rem]/topbar:hidden",
    rest: "md:@max-[36.25rem]/topbar:sr-only",
    label: "md:@max-[30.75rem]/topbar:sr-only",
    besideBack: { rest: "md:@max-[41rem]/topbar:sr-only", label: "md:@max-[35.5rem]/topbar:sr-only" },
    besideBackInstalled: { rest: "md:standalone:@max-[41rem]/topbar:sr-only", label: "md:standalone:@max-[35.5rem]/topbar:sr-only" },
  },
  admin: {
    brand: "md:@max-[39.75rem]/topbar:hidden",
    rest: "md:@max-[49.75rem]/topbar:sr-only",
    label: "md:@max-[33.25rem]/topbar:sr-only",
    besideBack: { rest: "md:@max-[56.75rem]/topbar:sr-only", label: "md:@max-[40rem]/topbar:sr-only" },
    besideBackInstalled: { rest: "md:standalone:@max-[56.75rem]/topbar:sr-only", label: "md:standalone:@max-[40rem]/topbar:sr-only" },
  },
} as const;

/**
 * The destinations' names in a phone's bar held sideways, in the bar's own width in rem (the row less
 * its gutters, which take the notches' insets): the whole names where `rest` allows, the short ones
 * down to `others`, then only the current one's (short) down to `current`, then the icons alone.
 * Measured on 19 Nov 2026 with the bundled Inter at 100% text, with the mark and the avatar, and with
 * Filters too (3rem more), which a page offers there once its own have scrolled away: Player Mode's
 * four need 29.88rem with their whole names (32.88rem with Filters), 25.56rem short (28.56rem), the
 * current one alone 18.94rem (21.94rem); Admin Mode, short names only as upright, 33.54rem (36.54rem
 * with Filters), the current one alone 26.79rem (29.79rem) with the mode's words beside the mark and
 * 20.75rem (23.75rem) without them. A 568 × 320 phone's row is 34.5rem at 100% text, so Player Mode
 * names all four there in full (the five before could name only the current one); an iPhone 15 held
 * sideways, installed (852 × 393, 734px between the notches), 45.9rem at 100%, 36.7rem at 125% and
 * 30.6rem at 150%: all four named at every one of them, in full to 125%.
 */
const SIDEWAYS_FIT = {
  member: {
    rest: "@max-[33.25rem]/topbar:sr-only",
    others: "@max-[29rem]/topbar:sr-only",
    current: "@max-[22.25rem]/topbar:sr-only",
    mode: "",
  },
  admin: {
    rest: "sr-only",
    others: "@max-[37rem]/topbar:sr-only",
    current: "@max-[24rem]/topbar:sr-only",
    /** Admin Mode's words beside the mark (6.04rem with their gap), read out only below 32rem, where the current one's name still fits with Filters (29.79rem). */
    mode: "@max-[32rem]/topbar:sr-only",
  },
} as const;

/** The top bar's Filters count, over the button's corner. */
const TOPBAR_COUNT = "absolute right-0.5 top-1 min-w-4 rounded-full bg-accent px-1 text-center text-2xs font-semibold leading-4 tabular-nums text-bg";

/**
 * Back: phones, either way round; tablets in the installed app, which has no browser Back (a tablet
 * in a browser has the browser's). Up to 45% of the bar, and it gives way first (its label shortens,
 * its name stays whole for screen readers) when a larger text size leaves the bar too little room for
 * Filters and the avatar; held sideways, where the destinations share the bar, likewise when the bar
 * is full, down to the chevron (a 44px target), so the destinations keep their room.
 */
const BACK_CLASS = "-ml-1 flex min-h-11 min-w-0 max-w-[45%] shrink items-center gap-0.5 rounded-md pr-2 text-sm font-medium text-accent hover:bg-surface-2 short:min-w-11";
/**
 * Tablets: hidden in a browser, shown in the installed app's display mode from the first paint (the
 * `standalone` variant, globals.css), so a cold start never draws the bar without it and then with
 * it. Once the page runs, the browser's answer (useInstallState) shows it too: iOS's own flag, and
 * the test's stand-in for a display mode Chromium cannot emulate. Held sideways it is the phone's
 * Back, shown whatever the display mode (`not-short`).
 */
const BACK_TABLET = "md:not-short:hidden md:standalone:flex";

/** The account screen's title (its custom header names the dialog). */
const SHEET_TITLE_ID = "account-sheet-title";

/**
 * The account screen's header: its name, in a bar 52px tall under the status bar, beside the close
 * button (DetailModal places it at the bar's right end, centred in it: top-2 on a 36px button).
 */
function AccountScreenHeader() {
  return (
    // The title lines up with the column the screen's content keeps (max-w-md, centred).
    <div className="px-4 sm:px-6">
      <div className="mx-auto flex h-13 w-full max-w-md items-center pr-12">
        <h2 id={SHEET_TITLE_ID} className="text-base font-semibold leading-tight text-fg">
          Account
        </h2>
      </div>
    </div>
  );
}

/**
 * A page in the account screen: its icon, its name and a chevron, the whole width (lib/sheet.ts).
 * The row of the page shown (`here`: Settings with a section in view) keeps the page as it is, its
 * query with it, and takes it back to the top once the screen has closed, as the current tab does
 * (its own link has no query). The screen keeps the page in place while it is open, so the page goes
 * up only after it has gone. A row that leaves the page replaces the screen's history entry
 * (`replace`), so Back from the page it opens comes back to this one; `onNavigate` is told whether
 * the press leaves this page (a plain click on another page's row).
 */
function AccountRow({ href, icon: Icon, active, here, replace, onNavigate, children }: { href: string; icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>; active: boolean; here: boolean; replace: boolean; onNavigate: (leaves: boolean) => void; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      replace={replace}
      onClick={(e) => {
        const plain = isPlainClick(e);
        if (here && plain) {
          e.preventDefault();
          requestAnimationFrame(() => requestAnimationFrame(scrollToTop));
        }
        onNavigate(plain && !here);
      }}
      aria-current={active ? "page" : undefined}
      className={cn(ACCOUNT_ROW, active ? ACCOUNT_ROW_CURRENT : ACCOUNT_ROW_IDLE)}
    >
      <Icon className={cn(ACCOUNT_ROW_ICON, active ? "text-accent" : "text-fg-subtle")} aria-hidden />
      <span className={ACCOUNT_ROW_LABEL}>{children}</span>
      <ChevronRight className={ACCOUNT_ROW_CHEVRON} aria-hidden />
    </Link>
  );
}

/**
 * Where the top bar's height is measured: phones either way round, and any window held sideways
 * below lg (a phone 768px or wider held sideways: the compact bar, with a profile's sections under it).
 */
const MEASURED_BAR = "(max-width: 47.99rem), (max-width: 63.99rem) and (max-height: 480px)";

/**
 * The top bar's height (status bar included, a profile's sections too), measured, and on phones
 * (either way round, MEASURED_BAR) the page's scroll-padding-top to match, so whatever scrolls into
 * view (a link to a section, a game brought up, the keyboard's focus) stops below the bar rather than
 * under it (WCAG 2.4.11; globals.css has the value before this runs). On tablets the bar's height is
 * fixed and the stylesheet's value stands, with the pinned section tabs added where a page has them
 * (globals.css --bar-top and --tabs-top); the sidebar's widths have no bar. Written as
 * scroll-padding-top itself: a custom property set on the root re-styles every element of the page
 * (about 870 on a profile, 50 ms on a slow phone), even one registered as not inherited, where this
 * re-styles the root alone.
 */
function useTopBarHeight(ref: React.RefObject<HTMLElement | null>): number {
  const [height, setHeight] = React.useState(0);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const phone = window.matchMedia(MEASURED_BAR);
    const apply = () => {
      const h = el.offsetHeight;
      setHeight(h);
      // The bar's own controls keep clear of that padding (globals.css: their scroll margin takes it
      // back), so focus moving onto them never scrolls the page; the value sits on the bar, which
      // re-styles the bar alone.
      if (h && phone.matches) {
        root.style.scrollPaddingTop = `${h + 8}px`;
        el.style.setProperty("--bar-pad", `${h + 8}px`);
      } else {
        root.style.removeProperty("scroll-padding-top");
        el.style.removeProperty("--bar-pad");
      }
    };
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    phone.addEventListener("change", apply);
    return () => {
      observer.disconnect();
      phone.removeEventListener("change", apply);
      root.style.removeProperty("scroll-padding-top");
      el.style.removeProperty("--bar-pad");
    };
  }, [ref]);
  return height;
}

/**
 * The page's own heading (its h1) and whether it has scrolled up under the top bar: the bar then
 * shows its words, so the title is in view however far the page scrolls (an iOS-style large
 * title). Follows the heading as pages change and as their content arrives.
 */
function usePageHeading(pathname: string, barHeight: number): { text: string | null; past: boolean } {
  const [state, setState] = React.useState<{ text: string | null; past: boolean }>({ text: null, past: false });
  React.useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;
    let h1: HTMLElement | null = null;
    let io: IntersectionObserver | null = null;
    const watch = () => {
      const next = main.querySelector<HTMLElement>("h1");
      if (next === h1) return;
      io?.disconnect();
      h1 = next;
      if (!h1) {
        setState({ text: null, past: false });
        return;
      }
      const text = (h1.textContent ?? "").replace(/\s+/g, " ").trim() || null;
      const bar = barHeight || 56;
      io = new IntersectionObserver(
        ([e]) => {
          if (!e) return;
          setState({ text, past: !e.isIntersecting && e.boundingClientRect.top < bar });
        },
        { rootMargin: `-${Math.round(bar)}px 0px 0px 0px` },
      );
      io.observe(h1);
      setState((s) => (s.text === text ? s : { text, past: false }));
    };
    watch();
    // A page's content can arrive after its address (a loading state first): look again whenever
    // the heading being followed has left the page.
    const mo = new MutationObserver(() => {
      if (!h1 || !h1.isConnected) watch();
    });
    mo.observe(main, { childList: true, subtree: true });
    return () => {
      io?.disconnect();
      mo.disconnect();
    };
  }, [pathname, barHeight]);
  return state;
}

/*
  Back on a phone. The pages visited in this tab of the browser since the app opened, newest last,
  each with its heading: when the page before this one is known, Back goes to it (the browser's own
  history, so the place on that page is kept) and is named after it ("Leaderboards", "Demo Mid");
  otherwise (a link from elsewhere, a reload, the installed app's start) Back leads to the page
  above this one (phoneParent). Moving between a profile's sections replaces the entry, as the
  sections do on phones (ProfileTabs), so Back leaves the profile rather than stepping through them.
  A page that adds entries of its own address (Matchup Intel's pairs) is still one visit: Back goes
  past them to the page it is named after (goBackTo), as its label says.
*/
interface Visit {
  path: string;
  title: string | null;
}
const visits: Visit[] = [];
let visitsVersion = 0;
const visitListeners = new Set<() => void>();
const subscribeVisits = (l: () => void) => {
  visitListeners.add(l);
  return () => void visitListeners.delete(l);
};
function recordVisit(path: string) {
  const top = visits[visits.length - 1];
  if (top?.path === path) return;
  if (visits[visits.length - 2]?.path === path) visits.pop();
  else if (top && profileBase(top.path) && profileBase(top.path) === profileBase(path)) visits[visits.length - 1] = { path, title: top.title };
  else visits.push({ path, title: null });
  visitsVersion++;
  for (const l of visitListeners) l();
}

function useBack(pathname: string, heading: string | null, list: readonly Destination[], home: string): ({ history: true; label: string; go: () => void } | { history: false; label: string; href: string }) | null {
  const router = useRouter();
  React.useEffect(() => recordVisit(pathname), [pathname]);
  React.useEffect(() => {
    const top = visits[visits.length - 1];
    if (top?.path === pathname && heading) top.title = heading;
  }, [pathname, heading]);
  React.useSyncExternalStore(subscribeVisits, () => visitsVersion, () => 0);
  const parent = phoneParent(pathname, list, home);
  if (!parent) return null;
  const top = visits[visits.length - 1];
  const before = top?.path === pathname ? visits[visits.length - 2] : null;
  if (before) return { history: true, label: before.title ?? pageName(before.path, list), go: () => goBackTo(before.path, pathname, router.back) };
  return { history: false, label: parent.label, href: parent.href };
}

/** The Navigation API's view of this tab's history, as far as Back needs it (not every browser has it). */
type HistoryEntries = { currentEntry: { index: number } | null; entries: () => ReadonlyArray<{ url: string | null }> };

/**
 * Back to the page it is named after, past the entries this page made of itself (Matchup Intel's
 * pairs: the browser's Back steps through them, the bar's Back promises the page before), where
 * the Navigation API shows them (backSteps); one step back otherwise.
 */
function goBackTo(target: string, pathname: string, back: () => void) {
  const nav = (window as unknown as { navigation?: HistoryEntries }).navigation;
  const steps = nav?.currentEntry ? backSteps(nav.entries(), nav.currentEntry.index, pathname, target) : null;
  if (steps !== null && steps < -1) window.history.go(steps);
  else back();
}

/** Distance the page must scroll before the bar may slide away (about the top bar's height). */
const HIDE_AFTER = 64;
/** Distance scrolled one way, from where that direction began, that hides or shows the bar. */
const INTENT = 8;

/**
 * In short windows (a phone held sideways) even the one compact bar takes a share of the screen, so
 * it slides away while the page scrolls down and returns on any scroll up, at the top of the page,
 * and whenever focus moves into it. Taller windows keep it in place. Distances count from where the
 * scroll last changed direction, so a slow drag (a pixel or two a frame) counts as well.
 */
function useHideOnScroll() {
  const [hidden, setHidden] = React.useState(false);
  React.useEffect(() => {
    const short = window.matchMedia("(max-height: 480px)");
    let last = window.scrollY;
    let turn = last;
    let down = true;
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = window.scrollY;
      if (y !== last && y > last !== down) {
        down = y > last;
        turn = last;
      }
      if (!short.matches || y < HIDE_AFTER) setHidden(false);
      else if (down && y - turn > INTENT) setHidden(true);
      else if (!down && turn - y > INTENT) setHidden(false);
      last = y;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const onChange = () => {
      last = turn = window.scrollY;
      update();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    short.addEventListener("change", onChange);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      short.removeEventListener("change", onChange);
    };
  }, []);
  return hidden;
}
