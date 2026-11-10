"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, LogOut, Menu, X } from "lucide-react";
import { BrandMark } from "./brand-mark";
import { NavLinks } from "./nav-links";
import { Avatar } from "./ui/avatar";
import { DetailModal } from "./ui/detail-modal";
import { ModeSwitch } from "./mode-switch";
import { ACCOUNT_LINKS, ADMIN_ACCOUNT_LINKS, ADMIN_TABS, PROFILE_SECTIONS, RESOURCES, adminSheetLinks, currentTab, isActivePath, phoneParent, phoneTabs, profileBase, type NavLink, type PhoneTab } from "@/lib/nav";
import { AccountMenu, otherUsername } from "./account-menu";
import { announceAccountChange, markAccountChange } from "./account-guard";
import { InstallAppEntry } from "./install/install-app";
import { useInstallState } from "./install/install-state";
import { ProfileTabs } from "./players/profile-tabs";
import { PHONE_QUERY } from "./ui/use-phone";
import { releaseEarlyTaps } from "./early-taps";
import { cn } from "@/lib/cn";
import { ACCOUNT_GROUP, ACCOUNT_ROW, ACCOUNT_ROW_CHEVRON, ACCOUNT_ROW_CURRENT, ACCOUNT_ROW_ICON, ACCOUNT_ROW_IDLE } from "@/lib/sheet";

export interface MobileNavProps {
  logoSrc: string | null;
  /** Still frame of an animated logo, for reduced motion. */
  logoStill?: string | null;
  shortName: string;
  tagline: string;
  home: string;
  user: { name: string; username?: string | null; avatarUrl: string | null; roleLabel: string } | null;
  /** A quiet data-freshness line at the foot of the drawer and the account panel. */
  status: React.ReactNode;
  /** Riot's notice, at the foot of the account panel. */
  legal?: React.ReactNode;
  showSignOut: boolean;
  /** Paths this account may open in the current mode (the server decides). */
  allowed: string[];
  /** Admin Mode: the top bar says so and the drawer offers the way back. */
  adminMode?: boolean;
  /** The account has a player profile (the drawer's header then opens it). */
  hasPlayer?: boolean;
  /** The mode this administrator is in, for the switch between Player Mode and Admin Mode (administrators only, placed apart from the pages); null for everyone else. */
  modeSwitch?: "player" | "admin" | null;
}

/*
  PHONES (below md) and TABLETS (md to lg); the sidebar takes over from lg.

  Phones have one frame, the same on every page (docs/MOBILE.md):
    - the top bar says where you are: the team's mark on a tab's own pages, or Back on a page you
      reached from one (a teammate's profile, Settings), labelled with where it leads; the page's
      title joins it once the page's own heading has scrolled up under it; your avatar at its right
      end opens the account screen. On a profile the profile's sections ride under it, so they stay
      in reach however far the page scrolls;
    - the bottom tab bar holds the five places a member goes to most (PHONE_TABS), one tap each,
      within reach of the thumb;
    - the account screen holds the rest, on a screen of its own (DetailModal size "screen"): who is
      signed in; full-width rows for the pages the tab bar does not hold (Resources when it has no
      tab; in Admin Mode the admin pages without a tab), Settings and Install App; the switch
      between the modes and Sign out; the patch and Riot's notice. It is fixed to the screen's four
      edges, so its height is the screen's: the sheet and the panel before it were as tall as their
      content, which Safari 26 worked out as a header alone, and the owner's iPhone showed each as a
      strip (DetailModal's BODY_SCROLLS, docs/MOBILE.md).
  Tablets keep the top bar with the menu at its left end and the drawer with every page, and the
  page tabs (Team's sections) in the page, pinned at its top once it scrolls. Installed as an app, a
  tablet has no browser Back, so the bar offers Back there too, on a page reached from another.

  The avatar and the menu answer a tap made before the page's code has run: the inline script in
  the root layout keeps it (early-taps.ts), shows the button pressed, and this opens what was asked
  for once it runs, exactly once.

  Safe-area insets keep both bars clear of notches, rounded corners and the home indicator. In
  short windows (a phone held sideways) both bars slide away while the page scrolls down and come
  back on any scroll up.
*/
export function MobileNav({ logoSrc, logoStill, shortName, tagline, home, user, status, legal = null, showSignOut, allowed, adminMode = false, hasPlayer = false, modeSwitch = null }: MobileNavProps) {
  // The account's own pages in this mode (Settings), so it never leaves the mode.
  const accountLinks = adminMode ? ADMIN_ACCOUNT_LINKS : ACCOUNT_LINKS;
  const pathname = usePathname();
  const tabs: PhoneTab[] = adminMode ? ADMIN_TABS.filter((t) => allowed.includes(t.href)) : phoneTabs(allowed);
  const activeTab = currentTab(pathname, tabs.map((t) => t.href));
  // The drawer (tablets) and the account panel (phones) remember the path they were opened on, so any
  // navigation closes them without an effect.
  const [openedAt, setOpenedAt] = React.useState<{ what: "drawer" | "sheet"; path: string } | null>(null);
  // Forgotten once the page has changed, so coming back to that page (Forward) opens nothing unasked.
  const [seenPath, setSeenPath] = React.useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    if (openedAt && openedAt.path !== pathname) setOpenedAt(null);
  }
  const open = openedAt?.what === "drawer" && openedAt.path === pathname;
  const sheetOpen = openedAt?.what === "sheet" && openedAt.path === pathname;
  const menuRef = React.useRef<HTMLButtonElement>(null);
  const setOpen = (next: boolean) => setOpenedAt(next ? { what: "drawer", path: pathname } : null);
  // The page's code runs now: a tap on the avatar or the menu made before it (early-taps.ts) is
  // passed on to the button, once, which opens what was asked for; from here on the buttons answer
  // for themselves.
  React.useEffect(() => releaseEarlyTaps("sheet", "drawer"), []);
  // Focus goes back to the menu button once the drawer has gone: while the drawer is open the page
  // behind it is inert, so the button cannot take focus any earlier. Without scrolling: the button
  // is in the bar, inside the page's scroll padding, and the page stays where the reader left it.
  const drawerWasOpen = React.useRef(false);
  React.useEffect(() => {
    if (drawerWasOpen.current && !open) menuRef.current?.focus({ preventScroll: true });
    drawerWasOpen.current = open;
  }, [open]);
  const closeRef = React.useRef<HTMLButtonElement>(null);
  // The installed app has no browser Back: tablets get one in the bar too (phones always have it).
  const { standalone } = useInstallState();
  const headerRef = React.useRef<HTMLElement>(null);
  const hidden = useHideOnScroll();
  const bar = useTopBarHeight(headerRef);
  const heading = usePageHeading(pathname, bar);
  const back = useBack(pathname, heading.text, tabs, home);
  // A profile's sections, when this page is one (your own only when you have a profile).
  const profile = adminMode ? null : profileBase(pathname);
  const sections = profile === "/overview" && !hasPlayer ? null : profile;
  // Things pinned above the tab bar (a save bar, notifications) follow it down when it slides away (globals.css: bottom-tabbar).
  const tabsHidden = hidden && !sheetOpen && tabs.length > 0;
  React.useEffect(() => {
    document.documentElement.toggleAttribute("data-tabbar-hidden", tabsHidden);
    return () => document.documentElement.removeAttribute("data-tabbar-hidden");
  }, [tabsHidden]);

  // The panel holds what the tab bar does not: in Player Mode Resources (when it has no tab) and My
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
        data-hidden={hidden && !open && !sheetOpen}
        data-testid="mobile-topbar"
      >
        <div className="flex min-h-13 items-center gap-1 px-safe-2 sm:px-safe-4 md:min-h-14 md:gap-2">
          {/* Tablets: the menu button at the left end, by the side the drawer opens from. A tap before
              the page's code has run is kept (data-early; suppressHydrationWarning: the script may
              have marked it aria-busy, which React leaves alone). */}
          <button ref={menuRef} type="button" onClick={() => setOpen(true)} className="-ml-1.5 grid h-11 w-11 shrink-0 place-items-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg max-md:hidden sm:-ml-2.5" aria-label="Open menu" aria-expanded={open} aria-controls="mobile-drawer" data-early="drawer" suppressHydrationWarning data-testid="menu-button">
            <Menu className="h-5 w-5" aria-hidden />
          </button>
          {/* Phones: Back where the page was reached from another (labelled with where it leads), else the team's mark. */}
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
          <Link href={home} className={cn("flex min-h-11 min-w-0 items-center gap-2.5 rounded-md", back ? "max-md:hidden" : "max-md:shrink-0 max-md:pl-1.5", "md:min-h-14 md:flex-1")} title={shortName} data-testid="mobile-brand">
            <BrandMark src={logoSrc} still={logoStill} name={shortName} className="h-8 w-8 rounded-md text-base" />
            <span className={cn("min-w-0 transition-opacity duration-150", titleShown && "max-md:hidden")}>
              <span className="block truncate text-sm font-bold tracking-label text-fg">{shortName}</span>
              {adminMode ? <span className="block truncate text-xs font-semibold uppercase tracking-label text-accent">Admin mode</span> : tagline ? <span className="block truncate text-xs text-fg-subtle max-md:hidden">{tagline}</span> : null}
            </span>
          </Link>
          {/* Phones: the page's own title, once its heading has gone up under the bar; a tap on it goes
              back to the top, as iOS's status bar does. */}
          {titleShown ? (
            <button type="button" onClick={toTop} className="min-h-11 min-w-0 flex-1 truncate rounded-md px-1 text-left text-base font-semibold text-fg transition-opacity duration-150 md:hidden" aria-label={`${heading.text}: back to top`} data-testid="mobile-title">
              {heading.text}
            </button>
          ) : (
            <p className="min-w-0 flex-1 px-1 opacity-0 md:hidden" aria-hidden data-testid="mobile-title" />
          )}
          {user ? (
            <>
              <span className="max-md:hidden">
                <AccountMenu user={user} showSignOut={showSignOut} variant="topbar" adminMode={adminMode} />
              </span>
              {/* A tap before the page's code has run is kept, as on the menu button. */}
              <button type="button" onClick={() => setOpenedAt({ what: "sheet", path: pathname })} aria-haspopup="dialog" aria-expanded={sheetOpen} aria-label={`Your account: ${user.name}`} className="-mr-1 grid h-11 w-11 shrink-0 place-items-center rounded-full transition-transform duration-100 active:scale-90 motion-reduce:active:scale-100 md:hidden" data-early="sheet" suppressHydrationWarning data-testid="account-sheet-button">
                <Avatar name={user.name} src={user.avatarUrl} size="sm" />
              </button>
            </>
          ) : null}
        </div>
        {/* Phones: a profile's sections stay under the bar while the page scrolls. */}
        {sections ? (
          <div className="px-safe-2 md:hidden" data-testid="profile-sections-bar">
            <ProfileTabs basePath={sections} variant="chrome" />
          </div>
        ) : null}
      </header>

      {sheetOpen && user ? (
        // The account screen (its test ids keep the name of the sheet it replaced): the whole screen,
        // fixed to its edges (DetailModal size "screen"). Its header, with the close button, stays
        // under the status bar; the rest is one region that scrolls only where it must (a small phone
        // in Admin Mode, large text, a phone held sideways).
        <DetailModal open onClose={() => setOpenedAt(null)} size="screen" title="Account" titleId={SHEET_TITLE_ID} header={<AccountScreenHeader />} headerClassName="border-transparent" className="bg-chrome" testId="account-sheet" closeTestId="account-sheet-close" bodyClassName="px-4 pt-1 sm:px-6">
          <div className="mx-auto w-full max-w-md">
            {/* Who is signed in: their picture, name and role (and username, where the name differs). */}
            <div className="flex min-w-0 items-center gap-4 pb-5" data-testid="account-identity">
              <Avatar name={user.name} src={user.avatarUrl} size="lg" />
              <div className="min-w-0">
                <p className="truncate text-xl font-semibold leading-tight text-fg">{user.name}</p>
                <p className="mt-1 truncate text-sm text-fg-muted">{[user.roleLabel, otherUsername(user) ? `Username: ${otherUsername(user)}` : null].filter(Boolean).join(" · ")}</p>
              </div>
            </div>
            {/* The pages the tab bar does not hold (Resources when it has no tab; in Admin Mode the
                admin pages without one), Settings and Install App, one full-width row each (lib/sheet.ts). */}
            <nav aria-label={adminMode ? "More admin pages and your account" : "More pages and your account"} className={ACCOUNT_GROUP}>
              {sheetLinks.map(({ href, label, icon }) => (
                <AccountRow key={href} href={href} icon={icon} active={isActivePath(pathname, href)} onNavigate={() => setOpenedAt(null)}>
                  {label}
                </AccountRow>
              ))}
              {/* The install window opens over the page: the screen closes first. */}
              <InstallAppEntry variant="row" beforeOpen={() => setOpenedAt(null)} />
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
            {/* The patch and Riot's notice: quiet lines at the foot. */}
            <div className="mt-5 flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1 text-center" data-testid="account-sheet-notes">
              {status}
              {legal}
            </div>
          </div>
        </DetailModal>
      ) : null}

      {open ? (
        <Drawer onClose={() => setOpen(false)} initialFocus={closeRef}>
          <div className="drawer-in flex h-full w-full flex-col overflow-y-auto overscroll-contain border-r border-border bg-chrome pt-safe pl-[env(safe-area-inset-left)] pb-safe shadow-2xl" data-testid="mobile-drawer-panel">
            <div className="flex items-center justify-between gap-2 px-4 py-3">
              {user ? (
                <Link href={hasPlayer && !adminMode ? "/overview" : (accountLinks[0]?.href ?? "/settings")} onClick={() => setOpen(false)} className="flex min-w-0 items-center gap-2.5">
                  <Avatar name={user.name} src={user.avatarUrl} size="md" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{user.name}</span>
                    <span className="block truncate text-xs text-fg-subtle">{user.roleLabel}</span>
                  </span>
                </Link>
              ) : (
                <span className="text-sm font-bold tracking-label">{shortName}</span>
              )}
              <button ref={closeRef} type="button" onClick={() => setOpen(false)} className="grid h-11 w-11 place-items-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg" aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavLinks allowed={allowed} admin={adminMode} large onNavigate={() => setOpen(false)} />
            {modeSwitch ? (
              <div className="mx-3 mt-3">
                <ModeSwitch mode={modeSwitch} variant="drawer" />
              </div>
            ) : null}
            <div className="mx-3 mt-3 flex flex-col gap-1 border-t border-border pt-3">
              {accountLinks.map(({ href, label, icon: Icon }) => (
                <SheetLink key={href} href={href} icon={Icon} active={isActivePath(pathname, href)} onNavigate={() => setOpen(false)}>
                  {label}
                </SheetLink>
              ))}
              {/* The install window opens over the page: the menu closes first, and focus goes back
                  to the menu button (the effect above, once the menu has gone), where the window
                  returns it when it closes. */}
              <InstallAppEntry variant="drawer" beforeOpen={() => setOpen(false)} />
              {showSignOut ? (
                // The same Sign out as the panel's and the account menu's: the browser's other tabs are told.
                <form action="/api/auth/logout" method="post" onSubmit={onSignOut}>
                  <button className="flex min-h-12 w-full items-center gap-3 rounded-lg pl-[0.9375rem] pr-3 text-left text-sm text-fg-muted hover:bg-surface-2 hover:text-fg" type="submit">
                    <LogOut className="h-[1.125rem] w-[1.125rem] text-fg-subtle" /> Sign out
                  </button>
                </form>
              ) : null}
            </div>
            <div className="mt-auto border-t border-border px-4 py-3">{status}</div>
          </div>
        </Drawer>
      ) : null}

      {tabs.length > 0 ? (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-chrome/95 px-safe pb-safe backdrop-blur-md transition-transform duration-200 ease-out data-[hidden=true]:not-focus-within:translate-y-full md:hidden" aria-label="Primary" data-hidden={tabsHidden} data-testid="phone-tabbar">
          {/* One column per destination, as wide as the bar allows and never narrower than its label,
              so the longest (Leaderboards) stays whole on a 320px screen. The current tab is lit twice
              over: its icon sits in an accent pill and its label turns bright, so it reads at a glance
              without colour alone. */}
          <ul className="mx-auto flex max-w-lg">
            {tabs.map(({ href, label, icon: Icon }) => {
              const active = href === activeTab;
              const own = href === "/overview" && user?.avatarUrl;
              return (
                <li key={href} className="min-w-max flex-1 basis-0">
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    // The current tab on its own page: back to the top, as a phone's tab bar does (a page
                    // under the tab, such as a teammate's profile under Players, still goes to the tab's page).
                    onClick={(e) => {
                      if (active && pathname === href) {
                        e.preventDefault();
                        toTop();
                      }
                    }}
                    className={cn("group flex min-h-14 flex-col items-center justify-center gap-1 px-1 pb-1 pt-1.5 text-2xs font-medium transition-colors duration-150 short:min-h-11 short:flex-row short:gap-1.5 short:py-1", active ? "font-semibold text-fg" : "text-fg-muted hover:text-fg")} data-testid={`tab-${href.slice(1)}`}>
                    <span className={cn("grid h-7 w-12 place-items-center rounded-full transition-colors duration-150", active ? "bg-accent/15 text-accent" : "group-hover:bg-surface-2")} aria-hidden>
                      {own ? <Avatar name={user!.name} src={user!.avatarUrl} size="xs" className={cn(active && "ring-2 ring-accent")} /> : <Icon className="h-5 w-5" />}
                    </span>
                    <span className="leading-none">{label}</span>
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
 * Sign out (a plain form post, from the panel or the drawer, as from the account menu): this tab's
 * account guard stands aside while it leaves, and the browser's other tabs are told (account-guard.tsx).
 */
function onSignOut() {
  markAccountChange(true);
  announceAccountChange();
}

/** Back to the top of the page: smooth, or at once with reduced motion. */
function toTop() {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: 0, behavior: reduce ? "instant" : "smooth" });
}

/** Phones; and tablets in the installed app, which has no browser Back (a tablet in a browser has the browser's). */
const BACK_CLASS = "-ml-1 flex min-h-11 min-w-0 max-w-[45%] shrink-0 items-center gap-0.5 rounded-md pr-2 text-sm font-medium text-accent hover:bg-surface-2";
/**
 * Tablets: hidden in a browser, shown in the installed app's display mode from the first paint (the
 * `standalone` variant, globals.css), so a cold start never draws the bar without it and then with
 * it. Once the page runs, the browser's answer (useInstallState) shows it too: iOS's own flag, and
 * the test's stand-in for a display mode Chromium cannot emulate.
 */
const BACK_TABLET = "md:hidden md:standalone:flex";

/**
 * The tablet's menu: a modal dialog (the native <dialog>, as every sheet and window), so focus stays
 * inside, the page behind is inert and never scrolls, and Escape or a tap beside the panel closes
 * it. The panel is docked to the left edge, the sidebar's side. Closed, or removed while open (a
 * navigation, the window grown to the sidebar's widths), it gives focus back where it came from.
 */
function Drawer({ onClose, initialFocus, children }: { onClose: () => void; /** What takes focus when it opens (the close button). */ initialFocus: React.RefObject<HTMLElement | null>; children: React.ReactNode }) {
  const ref = React.useRef<HTMLDialogElement>(null);
  const latest = React.useRef(onClose);
  React.useLayoutEffect(() => {
    latest.current = onClose;
  });
  // A layout effect: its cleanup runs while the dialog is still on the page, so it can be closed
  // properly (out of the top layer, the page no longer inert) before it is removed.
  React.useLayoutEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (!d.open) d.showModal();
    initialFocus.current?.focus({ preventScroll: true });
    // The page behind stays where it is.
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    // The sidebar takes over from lg: a menu left open across that width would keep the page inert.
    const wide = window.matchMedia("(min-width: 64rem)");
    const onWide = () => wide.matches && latest.current();
    wide.addEventListener("change", onWide);
    return () => {
      wide.removeEventListener("change", onWide);
      root.style.overflow = previous;
      if (d.open) d.close();
    };
  }, [initialFocus]);
  return (
    <dialog
      ref={ref}
      id="mobile-drawer"
      aria-label="Menu"
      // Escape asks the owner to close, so the menu button gets focus back the same way every time.
      onCancel={(e) => {
        e.preventDefault();
        latest.current();
      }}
      onClick={(e) => {
        if (e.target === ref.current) latest.current();
      }}
      // overflow-visible: the panel scrolls itself, and its shadow falls over the backdrop (a dialog clips its contents by default).
      // Full height by the screen it is fixed to (stretched between the dialog's own top and bottom
      // insets), not by viewport units, so its size and its place come from the same box
      // (DetailModal); its width a share of that screen too.
      className="m-0 h-auto max-h-none w-[min(calc(20rem+env(safe-area-inset-left)),86%)] max-w-none overflow-visible border-0 bg-transparent p-0 text-fg backdrop:bg-black/60 backdrop:backdrop-blur-sm open:flex motion-safe:backdrop:fade-in"
      data-testid="mobile-drawer"
    >
      {children}
    </dialog>
  );
}

/** The account screen's title (its custom header names the dialog). */
const SHEET_TITLE_ID = "account-sheet-title";

/**
 * The account screen's header: its name, in a bar 52px tall under the status bar, beside the close
 * button (DetailModal places it at the bar's right end, centred in it).
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

/** A row of the tablet drawer: an icon and a page, 48px tall. */
function SheetLink({ href, icon: Icon, active, onNavigate, children }: { href: string; icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>; active: boolean; onNavigate: () => void; children: React.ReactNode }) {
  return (
    <Link href={href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={cn("flex min-h-12 items-center gap-3 rounded-lg pl-[0.9375rem] pr-3 text-sm hover:bg-surface-2 hover:text-fg", active ? "text-fg" : "text-fg-muted")}>
      <Icon className="h-[1.125rem] w-[1.125rem] text-fg-subtle" aria-hidden /> {children}
    </Link>
  );
}

/**
 * The top bar's height (status bar included, a profile's sections too), measured, and on phones the
 * page's scroll-padding-top to match, so whatever scrolls into view (a link to a section, a game
 * brought up, the keyboard's focus) stops below the bar rather than under it (WCAG 2.4.11;
 * globals.css has the value before this runs). On tablets the bar's height is fixed and the
 * stylesheet's value stands, with the pinned section tabs added where a page has them (globals.css
 * --bar-top and --tabs-top); the sidebar's widths have no bar. Written as scroll-padding-top itself:
 * a custom property set on the root re-styles every element of the page (about 870 on a profile,
 * 50 ms on a slow phone), even one registered as not inherited, where this re-styles the root alone.
 */
function useTopBarHeight(ref: React.RefObject<HTMLElement | null>): number {
  const [height, setHeight] = React.useState(0);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const phone = window.matchMedia(PHONE_QUERY);
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

/** The name of the page a path opens, for Back when its heading was never read. */
function pageName(path: string, tabs: readonly PhoneTab[]): string {
  const tab = tabs.find((t) => isActivePath(path, t.href));
  if (tab) return tab.label;
  if (path.startsWith("/settings") || path === "/admin/settings") return "Settings";
  if (path === "/resources") return "Resources";
  return "Back";
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
  if (before) return { history: true, label: before.title ?? pageName(before.path, tabs), go: () => router.back() };
  return { history: false, label: parent.label, href: parent.href };
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
