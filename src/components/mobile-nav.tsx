"use client";

import * as React from "react";
import Link from "next/link";
import { scrollToTop, stayOnCurrentPage } from "@/lib/back-to-top";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, LogOut, SlidersHorizontal } from "lucide-react";
import { BrandMark } from "./brand-mark";
import { Avatar } from "./ui/avatar";
import { DetailModal } from "./ui/detail-modal";
import { ModeSwitch } from "./mode-switch";
import { ACCOUNT_LINKS, ADMIN_ACCOUNT_LINKS, ADMIN_TABS, PROFILE_SECTIONS, RESOURCES, adminSheetLinks, backSteps, currentDestination, currentTab, isActivePath, pageName, phoneParent, phoneTabs, profileBase, tabletDestinations, type NavLink, type PhoneTab } from "@/lib/nav";
import { AccountMenu, otherUsername } from "./account-menu";
import { announceAccountChange, markAccountChange } from "./account-guard";
import { InstallAppEntry } from "./install/install-app";
import { useInstallState } from "./install/install-state";
import { ProfileTabs } from "./players/profile-tabs";
import { usePageFilters, useScrolledAway } from "./ui/page-toolbar";
import { ScrollRow } from "./ui/scroll-row";
import { releaseEarlyTaps } from "./early-taps";
import { cn } from "@/lib/cn";
import { ACCOUNT_GROUP, ACCOUNT_ROW, ACCOUNT_ROW_CHEVRON, ACCOUNT_ROW_CURRENT, ACCOUNT_ROW_ICON, ACCOUNT_ROW_IDLE } from "@/lib/sheet";
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
  /** Admin Mode: the top bar says so, and the destinations are its own. */
  adminMode?: boolean;
  /** The account has a player profile (the account screen then offers My Profile where Profile has no tab). */
  hasPlayer?: boolean;
  /** The mode this administrator is in, for the switch between Player Mode and Admin Mode (administrators only, placed apart from the pages); null for everyone else. */
  modeSwitch?: "player" | "admin" | null;
}

/*
  The frame below lg (the sidebar takes over from lg), by posture (docs/MOBILE.md, "Frames by
  posture"). The posture is CSS's to decide (the window's width and height), so the first paint is
  right and a turn of the phone changes it at once; the parts each posture does not use are drawn
  but not displayed (one `nav[aria-label=Primary]` is exposed at a time).

  PHONES HELD UPRIGHT (below md, taller than 480px): one frame, the same on every page:
    - the top bar says where you are: the team's mark on a destination's own pages, or Back on a page
      you reached from one (a teammate's profile, Settings), labelled with where it leads; the
      page's title joins it once the page's own heading has scrolled up under it; the page's Filters
      once its own have; your avatar at its right end opens the account screen. On a profile the
      profile's sections ride under it, so they stay in reach however far the page scrolls;
    - the bottom tab bar holds the five places a member goes to most (PHONE_TABS), one tap each,
      within reach of the thumb;
    - the account screen holds the rest, on a screen of its own (DetailModal size "screen"): who is
      signed in; full-width rows for the pages the tab bar does not hold (Resources when it has no
      tab; in Admin Mode the admin pages without a tab), Settings and Install App; the switch
      between the modes and Sign out; the patch and Riot's notice. It is fixed to the screen's four
      edges, so its height is the screen's: the sheet and the panel before it were as tall as their
      content, which Safari 26 worked out as a header alone, and the owner's iPhone showed each as a
      strip (DetailModal's BODY_SCROLLS, docs/MOBILE.md).
  PHONES HELD SIDEWAYS (a short window, 480px tall or less, below lg, whatever its width): the
    same destinations in one compact bar, 44px plus the status bar's inset, and no bottom bar: Back
    or the team's mark, the five destinations (only the current one labelled where the bar is
    narrower than 38rem), the page's title where room is left, Filters, the avatar (the account
    screen); a profile's sections as a 40px second row. It slides away while the page scrolls down
    and comes back on a scroll up, and while it holds the focus (useHideOnScroll).
  TABLETS (md to lg, taller than 480px): the top bar holds the destinations, one tap each (Player
    Mode: My Profile, Team, Resources; Admin Mode: its four tabs), the page tabs (Team's sections, a
    profile's) are pinned in the page, and the avatar opens the account menu (AccountMenu), which
    holds what the sidebar's footer holds on a desktop: Settings, Install App, the switch between
    the modes, Sign out, the patch and Riot's notice (and in Admin Mode the pages without a tab).
    Installed as an app, a tablet has no browser Back, so the bar offers Back there too, on a page
    reached from another.

  The avatar answers a tap made before the page's code has run: the inline script in the root
  layout keeps it (early-taps.ts), shows the button pressed, and this opens what was asked for once
  it runs, exactly once.

  Safe-area insets keep the bars clear of notches, rounded corners and the home indicator.
*/
export function MobileNav({ logoSrc, logoStill, shortName, tagline, home, user, status, legal, showSignOut, allowed, adminMode = false, hasPlayer = false, modeSwitch = null }: MobileNavProps) {
  // The account's own pages in this mode (Settings), so it never leaves the mode.
  const accountLinks = adminMode ? ADMIN_ACCOUNT_LINKS : ACCOUNT_LINKS;
  const pathname = usePathname();
  // A phone's destinations: the bottom tab bar upright, the compact bar sideways.
  const tabs: PhoneTab[] = adminMode ? ADMIN_TABS.filter((t) => allowed.includes(t.href)) : phoneTabs(allowed);
  // Where the labels give way to the icons alone, for this set of destinations (TAB_FIT).
  const fit = adminMode ? TAB_FIT.admin : TAB_FIT.member;
  const activeTab = currentTab(pathname, tabs.map((t) => t.href));
  // A tablet's destinations, in its top bar.
  const destinations = tabletDestinations(allowed, adminMode);
  const currentDestinationHref = currentDestination(pathname, destinations, adminMode);
  // The account screen remembers the path it was opened on, so any navigation closes it without an
  // effect; forgotten once the page has changed, so coming back to that page (Forward) opens nothing unasked.
  const [sheetAt, setSheetAt] = React.useState<string | null>(null);
  const [seenPath, setSeenPath] = React.useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    if (sheetAt !== null && sheetAt !== pathname) setSheetAt(null);
  }
  const sheetOpen = sheetAt === pathname;
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
  const back = useBack(pathname, heading.text, tabs, home);
  // The page's filters (its FilterBar), offered in the bar once the page's own have gone up under it,
  // and kept while the button has the focus (the sheet hands it back there as it closes).
  const filters = usePageFilters();
  const filtersAway = useScrolledAway(filters?.root ?? null, bar || null);
  const [filtersFocused, setFiltersFocused] = React.useState(false);
  // A profile's sections, when this page is one (your own only when you have a profile).
  const profile = adminMode ? null : profileBase(pathname);
  const sections = profile === "/overview" && !hasPlayer ? null : profile;

  // The account screen holds what the phone's destinations do not: in Player Mode Resources (when it has no tab) and My
  // Profile (likewise), in Admin Mode the admin pages without a tab; then the account's own pages.
  const tabHrefs = tabs.map((t) => t.href);
  const sheetLinks: NavLink[] = [
    ...(adminMode ? adminSheetLinks(allowed, tabHrefs) : [RESOURCES].filter((l) => allowed.includes(l.href) && !tabHrefs.includes(l.href))),
    ...(hasPlayer && !adminMode && !tabHrefs.includes("/overview") ? [{ href: "/overview", label: "My Profile", icon: PROFILE_SECTIONS[0]!.icon }] : []),
    ...accountLinks,
  ];
  const titleShown = heading.past && !!heading.text;

  return (
    <>
      <header
        ref={headerRef}
        className="sticky top-0 z-40 border-b border-border bg-chrome/90 pt-safe backdrop-blur-md transition-transform duration-200 ease-out data-[hidden=true]:not-focus-within:-translate-y-full lg:hidden"
        data-hidden={hidden && !sheetOpen}
        data-testid="mobile-topbar"
      >
        {/* The bar's row is the container its parts give way by (in rem, so the reader's text size
            counts): a phone held sideways labels only the current destination below 38rem, a
            tablet's brand name and labels give way at large text (BAR_FIT). */}
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
              <Link href={back.href} className={cn(BACK_CLASS, !standalone && BACK_TABLET)} data-testid="mobile-back">
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
          <Link href={home} className={cn("flex min-h-11 min-w-0 items-center gap-2.5 rounded-md md:min-h-14 short:min-h-11", back ? "max-md:hidden short:hidden" : "max-md:pl-1.5 short:pl-1.5")} title={shortName} data-testid="mobile-brand">
            <BrandMark src={logoSrc} still={logoStill} name={shortName} className="h-8 w-8 rounded-md text-base" />
            <span className={cn("min-w-0 transition-opacity duration-150 short:hidden", BAR_FIT.brand, titleShown && "max-md:hidden")}>
              <span className="block truncate text-sm font-bold tracking-label text-fg">{shortName}</span>
              {adminMode ? <span className="block truncate text-xs font-semibold uppercase tracking-label text-accent">Admin mode</span> : tagline ? <span className="block truncate text-xs text-fg-subtle max-md:hidden">{tagline}</span> : null}
            </span>
          </Link>
          {/* Held sideways: the phone's destinations, one tap each, in the bar (there is no bottom
              bar). The current one is lit twice (its icon in an accent pill, its label shown and
              bright); where the bar is narrower than 38rem only its label shows, the others' left to
              screen readers. Too long for the bar (large text), the row scrolls sideways inside it,
              the current one kept in view, never widening the page. */}
          {tabs.length > 0 ? (
            <nav aria-label="Primary" className="hidden min-w-0 shrink-[0.001] short:flex" data-testid="topbar-tabs">
              <ScrollRow as="ul" className="flex items-center gap-0.5" keepCurrentInView current={activeTab}>
                {tabs.map(({ href, label, icon: Icon }) => {
                  const active = href === activeTab;
                  const own = href === "/overview" && user?.avatarUrl;
                  return (
                    <li key={href} className="shrink-0">
                      <Link
                        href={href}
                        aria-current={active ? "page" : undefined}
                        // The current destination on its own page: back to the top, as the tab bar's does.
                        onClick={(e) => stayOnCurrentPage(e, active && pathname === href)}
                        className="group flex h-11 min-w-11 items-center justify-center rounded-md"
                        data-testid={`topbar-tab-${href.slice(1).replaceAll("/", "-")}`}
                      >
                        <span className={cn("flex h-8 items-center gap-1.5 rounded-full px-2 transition-colors duration-150", active ? "bg-accent/15 text-accent" : "text-fg-muted group-hover:bg-surface-2 group-hover:text-fg")}>
                          {own ? <Avatar name={user!.name} src={user!.avatarUrl} size="xs" className={cn(active && "ring-2 ring-accent")} /> : <Icon className="h-5 w-5 shrink-0" aria-hidden />}
                          <span className={cn("whitespace-nowrap text-2xs font-medium leading-none", active ? "font-semibold text-fg" : "@max-[38rem]/topbar:sr-only")}>{label}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ScrollRow>
            </nav>
          ) : null}
          {/* Tablets: the destinations, one tap each (the drawer they were in has gone). The current
              one is marked as in the sidebar: a neutral lift with a hairline of light, its icon in
              the brand blue and its name bright. The bar takes the rest of the room, so the avatar
              stays at its end; at large text the labels give way to the icons (BAR_FIT). */}
          {destinations.length > 0 ? (
            <nav aria-label="Primary" className="hidden min-w-0 flex-1 md:not-short:flex" data-testid="topbar-destinations">
              <ul className="flex min-w-0 items-center gap-1">
                {destinations.map(({ href, label, icon: Icon }) => {
                  const active = href === currentDestinationHref;
                  return (
                    <li key={href} className="min-w-0">
                      <Link
                        href={href}
                        aria-current={active ? "page" : undefined}
                        // The page already shown stays as it is (its view and filters) and goes back to the top, as the sidebar's entry does.
                        onClick={(e) => stayOnCurrentPage(e, href === pathname)}
                        title={label}
                        className={cn("group isolate relative flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors duration-150", active ? "text-fg" : "text-fg-muted hover:text-fg")}
                        data-testid={`topbar-nav-${href.slice(1).replaceAll("/", "-")}`}
                      >
                        <span className={cn("absolute inset-0 -z-10 rounded-lg transition-[background-color,box-shadow] duration-150", active ? RAIL_CURRENT : RAIL_HOVER)} aria-hidden />
                        <Icon className={cn("h-[1.125rem] w-[1.125rem] shrink-0 transition-colors duration-150", active ? "text-accent" : "text-fg-subtle group-hover:text-fg-muted")} aria-hidden />
                        <span className={cn("truncate", BAR_FIT[adminMode ? "admin" : "member"])}>{label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
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
          {filters && (filtersAway || filtersFocused) ? (
            <button type="button" onClick={() => filters.open("topbar")} onFocus={() => setFiltersFocused(true)} onBlur={() => setFiltersFocused(false)} aria-haspopup="dialog" className="relative grid h-11 w-11 shrink-0 place-items-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg md:not-short:hidden" data-testid="topbar-filters">
              <SlidersHorizontal className="h-5 w-5 text-accent" aria-hidden />
              <span className="sr-only">Filters: {filters.summary}</span>
              {filters.count ? <span className="absolute right-0.5 top-1 min-w-4 rounded-full bg-accent px-1 text-center text-2xs font-semibold leading-4 tabular-nums text-bg">{filters.count}</span> : null}
            </button>
          ) : null}
          {user ? (
            <>
              {/* Tablets: the account menu, with what the sidebar's footer holds on a desktop. */}
              <span className="shrink-0 max-md:hidden short:hidden">
                <AccountMenu user={user} showSignOut={showSignOut} variant="topbar" adminMode={adminMode} extras={{ pages: adminMode ? adminSheetLinks(allowed, destinations.map((d) => d.href)) : [], modeSwitch, status, legal }} />
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
        {/* Phones, either way round: a profile's sections stay under the bar while the page scrolls. */}
        {sections ? (
          <div className="px-safe-2 md:not-short:hidden" data-testid="profile-sections-bar">
            <ProfileTabs basePath={sections} variant="chrome" />
          </div>
        ) : null}
      </header>

      {sheetOpen && user ? (
        // The account screen (its test ids keep the name of the sheet it replaced): the whole screen,
        // fixed to its edges (DetailModal size "screen"). Its header, with the close button, stays
        // under the status bar; the rest is one region that scrolls only where it must (large text, a
        // phone held sideways, a 320pt screen in Safari's tab).
        <DetailModal open onClose={() => setSheetAt(null)} size="screen" title="Account" titleId={SHEET_TITLE_ID} header={<AccountScreenHeader />} headerClassName="border-transparent" className="bg-chrome" testId="account-sheet" closeTestId="account-sheet-close">
          <div className="mx-auto w-full max-w-md">
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
            {/* The pages the phone's destinations do not hold (Resources when it has no tab; in Admin
                Mode the admin pages without one), Settings and Install App, one full-width row each (lib/sheet.ts). */}
            <nav aria-label={adminMode ? "More admin pages and your account" : "More pages and your account"} className={ACCOUNT_GROUP}>
              {sheetLinks.map(({ href, label, icon }) => (
                <AccountRow key={href} href={href} icon={icon} active={isActivePath(pathname, href)} onNavigate={() => setSheetAt(null)}>
                  {label}
                </AccountRow>
              ))}
              {/* The install window opens over the page: the screen closes first. */}
              <InstallAppEntry variant="row" beforeOpen={() => setSheetAt(null)} />
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
            {/* The patch and Riot's notice: quiet lines at the foot. Following a link there (Riot's
                notice leads to Settings) closes the screen first: on Settings itself only the address's
                anchor changes, which would leave the screen open over the section it leads to. */}
            <div
              className="mt-5 flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1 text-center"
              onClickCapture={(e) => {
                // Only a plain click follows the link here: a modified one opens it elsewhere (a new
                // tab or window), and this page, with its screen, stays as it was.
                if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                if ((e.target as Element | null)?.closest?.("a[href]")) setSheetAt(null);
              }}
              data-testid="account-sheet-notes"
            >
              {status}
              <p className="text-xs leading-snug text-fg-subtle" title={legal.title}>
                Not endorsed by Riot Games.{" "}
                <Link href={legal.href} className="touch-target underline underline-offset-2">
                  Details
                </Link>
              </p>
            </div>
          </div>
        </DetailModal>
      ) : null}

      {tabs.length > 0 ? (
        <nav className="@container/tabbar fixed inset-x-0 bottom-0 z-40 border-t border-border bg-chrome/95 px-safe pb-safe backdrop-blur-md md:hidden short:hidden" aria-label="Primary" data-testid="phone-tabbar">
          {/* One column per destination, as wide as the bar allows and never narrower than its label,
              so the longest (Leaderboards) stays whole on a 320px screen. The current tab is lit twice
              over: its icon sits in an accent pill and its label turns bright, so it reads at a glance
              without colour alone. With larger text the labels can stop fitting: then the bar shows
              the icons alone, each pill sharing the width, and the labels stay the destinations'
              names for screen readers. Measured in the bar's own width in rem, so the user's text
              size counts (a 320px phone has 20rem at 100% and 10rem at 200%), against what each set
              of labels needs (TAB_FIT). Wider than the phone, the bar made the browser widen the area
              every fixed element is placed in. Held sideways there is no bottom bar: the
              destinations ride in the top bar. */}
          <ul className="mx-auto flex max-w-lg">
            {tabs.map(({ href, label, icon: Icon }) => {
              const active = href === activeTab;
              const own = href === "/overview" && user?.avatarUrl;
              return (
                <li key={href} className={cn("min-w-max flex-1 basis-0", fit.li)}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    // The current tab on its own page: back to the top, as a phone's tab bar does (a page
                    // under the tab, such as a teammate's profile under Players, still goes to the tab's page).
                    onClick={(e) => stayOnCurrentPage(e, active && pathname === href)}
                    className={cn("group flex min-h-14 flex-col items-center justify-center gap-1 px-1 pb-1 pt-1.5 text-2xs font-medium transition-colors duration-150", fit.link, active ? "font-semibold text-fg" : "text-fg-muted hover:text-fg")} data-testid={`tab-${href.slice(1)}`}>
                    <span className={cn("grid h-7 w-12 place-items-center rounded-full transition-colors duration-150", fit.pill, active ? "bg-accent/15 text-accent" : "group-hover:bg-surface-2")} aria-hidden>
                      {own ? <Avatar name={user!.name} src={user!.avatarUrl} size="xs" className={cn(active && "ring-2 ring-accent")} /> : <Icon className="h-5 w-5" />}
                    </span>
                    <span className={cn("leading-none", fit.label)}>{label}</span>
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

/**
 * Sign out (a plain form post, from the account screen, as from the account menu): this tab's
 * account guard stands aside while it leaves, and the browser's other tabs are told (account-guard.tsx).
 */
function onSignOut() {
  markAccountChange(true);
  announceAccountChange();
}

/**
 * Where the upright tab bar's labels stop fitting, as static class lists (Tailwind reads them whole).
 * Measured on 18 Nov 2026 with the bundled Inter at 100% text, by a clone of a real tab per label:
 * Player Mode's five need up to 19.64rem under their icons (with Resources as the fifth; 19.13rem
 * with Profile); Admin Mode's four 14.63rem. Below these widths of the bar, each destination shows
 * its icon alone (docs/MOBILE.md, the tab bar).
 */
const TAB_FIT = {
  member: {
    li: "@max-[20rem]/tabbar:min-w-0",
    link: "@max-[20rem]/tabbar:px-0.5",
    pill: "@max-[20rem]/tabbar:w-full @max-[20rem]/tabbar:max-w-12",
    label: "@max-[20rem]/tabbar:sr-only",
  },
  admin: {
    li: "@max-[15rem]/tabbar:min-w-0",
    link: "@max-[15rem]/tabbar:px-0.5",
    pill: "@max-[15rem]/tabbar:w-full @max-[15rem]/tabbar:max-w-12",
    label: "@max-[15rem]/tabbar:sr-only",
  },
} as const;

/**
 * Where a tablet's top bar gives way at a larger text size, in the bar's own width in rem (the
 * `topbar` container: its row less its gutters), as static class lists: first the team's name
 * beside its mark goes, then the destinations' labels (each destination keeps its name for screen
 * readers and in its title). Measured with the bundled Inter (BAR_FIT_MEASURED in the docs).
 */
const BAR_FIT = {
  brand: "md:@max-[44rem]/topbar:hidden",
  member: "md:@max-[30rem]/topbar:sr-only",
  admin: "md:@max-[34rem]/topbar:sr-only",
} as const;

/**
 * Back: phones, either way round; tablets in the installed app, which has no browser Back (a tablet
 * in a browser has the browser's). Held sideways it gives way first when the bar is full (its label
 * truncates down to the chevron), so the destinations keep their room.
 */
const BACK_CLASS = "-ml-1 flex min-h-11 min-w-0 max-w-[45%] shrink-0 items-center gap-0.5 rounded-md pr-2 text-sm font-medium text-accent hover:bg-surface-2 short:min-w-11 short:shrink";
/**
 * Tablets: hidden in a browser, shown in the installed app's display mode from the first paint (the
 * `standalone` variant, globals.css), so a cold start never draws the bar without it and then with
 * it. Once the page runs, the browser's answer (useInstallState) shows it too: iOS's own flag, and
 * the test's stand-in for a display mode Chromium cannot emulate.
 */
const BACK_TABLET = "md:not-short:hidden md:not-short:standalone:flex";

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

/** A page in the account screen: its icon, its name and a chevron, the whole width (lib/sheet.ts). */
function AccountRow({ href, icon: Icon, active, onNavigate, children }: { href: string; icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>; active: boolean; onNavigate: () => void; children: React.ReactNode }) {
  return (
    <Link href={href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={cn(ACCOUNT_ROW, active ? ACCOUNT_ROW_CURRENT : ACCOUNT_ROW_IDLE)}>
      <Icon className={cn(ACCOUNT_ROW_ICON, active ? "text-accent" : "text-fg-subtle")} aria-hidden />
      <span className="min-w-0 flex-1 truncate">{children}</span>
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
  history, so the place on that page is kept) and is named after it ("Team Leaderboards", "Demo Mid");
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

function useBack(pathname: string, heading: string | null, tabs: readonly PhoneTab[], home: string): ({ history: true; label: string; go: () => void } | { history: false; label: string; href: string }) | null {
  const router = useRouter();
  React.useEffect(() => recordVisit(pathname), [pathname]);
  React.useEffect(() => {
    const top = visits[visits.length - 1];
    if (top?.path === pathname && heading) top.title = heading;
  }, [pathname, heading]);
  React.useSyncExternalStore(subscribeVisits, () => visitsVersion, () => 0);
  const parent = phoneParent(pathname, tabs, home);
  if (!parent) return null;
  const top = visits[visits.length - 1];
  const before = top?.path === pathname ? visits[visits.length - 2] : null;
  if (before) return { history: true, label: before.title ?? pageName(before.path, tabs), go: () => goBackTo(before.path, pathname, router.back) };
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

/** Distance the page must scroll before the bars may slide away (about the top bar's height). */
const HIDE_AFTER = 64;
/** Distance scrolled one way, from where that direction began, that hides or shows the bars. */
const INTENT = 8;

/**
 * In short windows (a phone held sideways) the bars take a large share of the screen, so they slide
 * away while the page scrolls down and return on any scroll up, at the top of the page, and
 * whenever focus moves into them. Taller windows keep them in place. Distances count from where
 * the scroll last changed direction, so a slow drag (a pixel or two a frame) counts as well.
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
