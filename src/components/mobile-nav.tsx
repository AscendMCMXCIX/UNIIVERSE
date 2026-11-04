"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, LogOut, Menu, X } from "lucide-react";
import { BrandMark } from "./brand-mark";
import { NavLinks } from "./nav-links";
import { Avatar } from "./ui/avatar";
import { DetailModal } from "./ui/detail-modal";
import { ACCOUNT_LINKS, ADMIN_ACCOUNT_LINKS, ADMIN_TABS, PROFILE_SECTIONS, RESOURCES, currentTab, isActivePath, phoneParent, phoneTabs, profileBase, type PhoneTab } from "@/lib/nav";
import { AccountMenu, otherUsername } from "./account-menu";
import { announceAccountChange, markAccountChange } from "./account-guard";
import { InstallAppEntry } from "./install/install-app";
import { ProfileTabs } from "./players/profile-tabs";
import { cn } from "@/lib/cn";

export interface MobileNavProps {
  logoSrc: string | null;
  /** Still frame of an animated logo, for reduced motion. */
  logoStill?: string | null;
  shortName: string;
  tagline: string;
  home: string;
  user: { name: string; username?: string | null; avatarUrl: string | null; roleLabel: string } | null;
  /** A quiet data-freshness line at the foot of the drawer and the account sheet. */
  status: React.ReactNode;
  /** Riot's notice, at the foot of the account sheet. */
  legal?: React.ReactNode;
  showSignOut: boolean;
  /** Paths this account may open in the current mode (the server decides). */
  allowed: string[];
  /** Admin Mode: the top bar says so and the drawer offers the way back. */
  adminMode?: boolean;
  /** The account has a player profile (the drawer's header then opens it). */
  hasPlayer?: boolean;
  /** The switch between Player Mode and Admin Mode (administrators only), placed apart from the pages. */
  modeSwitch?: React.ReactNode;
}

/*
  PHONES (below md) and TABLETS (md to lg); the sidebar takes over from lg.

  Phones have one frame, the same on every page (docs/MOBILE.md):
    - the top bar says where you are: the team's mark on a tab's own pages, or Back on a page you
      reached from one (a teammate's profile, Settings), labelled with where it leads; the page's
      title joins it once the page's own heading has scrolled up under it; your avatar at its right
      end opens the account sheet. On a profile the profile's sections ride under it, so they stay
      in reach however far the page scrolls;
    - the bottom tab bar holds the five places a member goes to most (PHONE_TABS), one tap each,
      within reach of the thumb;
    - the account sheet (a sheet from the bottom edge) holds the rest: Resources when it has no tab,
      Settings, Install App, the switch between the modes, Sign out, the patch and Riot's notice.
  Tablets keep the top bar with the menu at its left end and the drawer with every page, and the
  page tabs (Team's sections) in the page.

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
  // The drawer (tablets) and the account sheet (phones) remember the path they were opened on, so any
  // navigation closes them without an effect.
  const [openedAt, setOpenedAt] = React.useState<{ what: "drawer" | "sheet"; path: string } | null>(null);
  const open = openedAt?.what === "drawer" && openedAt.path === pathname;
  const sheetOpen = openedAt?.what === "sheet" && openedAt.path === pathname;
  const setOpen = (next: boolean) => setOpenedAt(next ? { what: "drawer", path: pathname } : null);
  const closeRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLButtonElement>(null);
  const headerRef = React.useRef<HTMLElement>(null);
  const hidden = useHideOnScroll();
  const heading = usePageHeading(pathname);
  const back = useBack(pathname, heading.text, tabs, home);
  const profile = adminMode ? null : profileBase(pathname);
  useChromeHeight(headerRef);
  // Things pinned above the tab bar (a save bar, notifications) follow it down when it slides away (globals.css: bottom-tabbar).
  const tabsHidden = hidden && !sheetOpen && tabs.length > 0;
  React.useEffect(() => {
    document.documentElement.toggleAttribute("data-tabbar-hidden", tabsHidden);
    return () => document.documentElement.removeAttribute("data-tabbar-hidden");
  }, [tabsHidden]);

  React.useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenedAt(null);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Resources has a tab when the bar has room; otherwise it is the sheet's first entry.
  const sheetPages = adminMode ? [] : [RESOURCES].filter((l) => allowed.includes(l.href) && !tabs.some((t) => t.href === l.href));
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
          {/* Tablets: the menu button at the left end, by the side the drawer opens from. */}
          <button ref={menuRef} type="button" onClick={() => setOpen(true)} className="-ml-1.5 grid h-11 w-11 shrink-0 place-items-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg max-md:hidden sm:-ml-2.5" aria-label="Open menu" aria-expanded={open} aria-controls="mobile-drawer" data-testid="menu-button">
            <Menu className="h-5 w-5" aria-hidden />
          </button>
          {/* Phones: Back where the page was reached from another (labelled with where it leads), else the team's mark. */}
          {back ? (
            back.history ? (
              <button type="button" onClick={back.go} className={BACK_CLASS} data-testid="mobile-back">
                <ChevronLeft className="h-5 w-5 shrink-0" aria-hidden />
                <span className="truncate">{back.label}</span>
                <span className="sr-only">, back</span>
              </button>
            ) : (
              <Link href={back.href} className={BACK_CLASS} data-testid="mobile-back">
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
          {/* Phones: the page's own title, once its heading has gone up under the bar. */}
          <p className={cn("min-w-0 flex-1 truncate px-1 text-base font-semibold text-fg transition-opacity duration-150 md:hidden", titleShown ? "opacity-100" : "opacity-0")} aria-hidden data-testid="mobile-title">
            {titleShown ? heading.text : ""}
          </p>
          {user ? (
            <>
              <span className="max-md:hidden">
                <AccountMenu user={user} showSignOut={showSignOut} variant="topbar" adminMode={adminMode} />
              </span>
              <button type="button" onClick={() => setOpenedAt({ what: "sheet", path: pathname })} aria-haspopup="dialog" aria-expanded={sheetOpen} aria-label={`Your account: ${user.name}`} className="-mr-1 grid h-11 w-11 shrink-0 place-items-center rounded-full md:hidden" data-testid="account-sheet-button">
                <Avatar name={user.name} src={user.avatarUrl} size="sm" />
              </button>
            </>
          ) : null}
        </div>
        {/* Phones: a profile's sections stay under the bar while the page scrolls. */}
        {profile ? (
          <div className="px-safe-2 md:hidden" data-testid="profile-sections-bar">
            <ProfileTabs basePath={profile} variant="chrome" />
          </div>
        ) : null}
      </header>

      {sheetOpen && user ? (
        <DetailModal open onClose={() => setOpenedAt(null)} size="sheet" title={user.name} description={[otherUsername(user) ? `Username: ${otherUsername(user)}` : null, user.roleLabel].filter(Boolean).join(" · ")} testId="account-sheet" closeTestId="account-sheet-close">
          <div className="-mx-1 flex flex-col gap-1">
            {adminMode ? <NavLinks allowed={allowed} admin large onNavigate={() => setOpenedAt(null)} /> : null}
            {sheetPages.map(({ href, label, icon: Icon }) => (
              <SheetLink key={href} href={href} icon={Icon} active={isActivePath(pathname, href)} onNavigate={() => setOpenedAt(null)}>
                {label}
              </SheetLink>
            ))}
            {hasPlayer && !adminMode && !tabs.some((t) => t.href === "/overview") ? (
              <SheetLink href="/overview" icon={PROFILE_SECTIONS[0]!.icon} active={isActivePath(pathname, "/overview")} onNavigate={() => setOpenedAt(null)}>
                My Profile
              </SheetLink>
            ) : null}
            {accountLinks.map(({ href, label, icon: Icon }) => (
              <SheetLink key={href} href={href} icon={Icon} active={isActivePath(pathname, href)} onNavigate={() => setOpenedAt(null)}>
                {label}
              </SheetLink>
            ))}
            {/* The install window opens over the page: the sheet closes first. */}
            <InstallAppEntry variant="drawer" beforeOpen={() => setOpenedAt(null)} />
            {modeSwitch ? <div className="mt-1">{modeSwitch}</div> : null}
            {showSignOut ? (
              <form action="/api/auth/logout" method="post" onSubmit={() => (markAccountChange(true), announceAccountChange())}>
                <button className="flex min-h-12 w-full items-center gap-3 rounded-lg pl-[0.9375rem] pr-3 text-left text-sm text-fg-muted hover:bg-surface-2 hover:text-fg" type="submit" data-testid="sign-out">
                  <LogOut className="h-[1.125rem] w-[1.125rem] text-fg-subtle" aria-hidden /> Sign out
                </button>
              </form>
            ) : null}
          </div>
          <div className="mt-3 space-y-1 border-t border-border pt-3">
            {status}
            {legal}
          </div>
        </DetailModal>
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu" id="mobile-drawer">
          <button type="button" className="fade-in absolute inset-0 bg-black/60 backdrop-blur-sm" aria-label="Close menu" onClick={() => setOpen(false)} />
          <div className="drawer-in absolute inset-y-0 left-0 flex w-[min(calc(20rem+env(safe-area-inset-left)),86vw)] flex-col overflow-y-auto overscroll-contain border-r border-border bg-chrome pt-safe pl-[env(safe-area-inset-left)] pb-safe shadow-2xl" data-testid="mobile-drawer-panel">
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
            {modeSwitch ? <div className="mx-3 mt-3">{modeSwitch}</div> : null}
            <div className="mx-3 mt-3 flex flex-col gap-1 border-t border-border pt-3">
              {accountLinks.map(({ href, label, icon: Icon }) => (
                <SheetLink key={href} href={href} icon={Icon} active={isActivePath(pathname, href)} onNavigate={() => setOpen(false)}>
                  {label}
                </SheetLink>
              ))}
              {/* The install window opens over the page: the menu closes first, and focus goes back
                  to the menu button, where the window returns it when it closes. */}
              <InstallAppEntry
                variant="drawer"
                beforeOpen={() => {
                  menuRef.current?.focus();
                  setOpen(false);
                }}
              />
              {showSignOut ? (
                <form action="/api/auth/logout" method="post">
                  <button className="flex min-h-12 w-full items-center gap-3 rounded-lg pl-[0.9375rem] pr-3 text-left text-sm text-fg-muted hover:bg-surface-2 hover:text-fg" type="submit">
                    <LogOut className="h-[1.125rem] w-[1.125rem] text-fg-subtle" /> Sign out
                  </button>
                </form>
              ) : null}
            </div>
            <div className="mt-auto border-t border-border px-4 py-3">{status}</div>
          </div>
        </div>
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
                  <Link href={href} aria-current={active ? "page" : undefined} className={cn("group flex min-h-14 flex-col items-center justify-center gap-1 px-1 pb-1 pt-1.5 text-2xs font-medium transition-colors duration-150 short:min-h-11 short:flex-row short:gap-1.5 short:py-1", active ? "font-semibold text-fg" : "text-fg-muted hover:text-fg")} data-testid={`tab-${href.slice(1)}`}>
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

const BACK_CLASS = "-ml-1 flex min-h-11 min-w-0 max-w-[45%] shrink-0 items-center gap-0.5 rounded-md pr-2 text-sm font-medium text-accent hover:bg-surface-2 md:hidden";

/** A row of the account sheet or the tablet drawer: an icon and a page, 48px tall. */
function SheetLink({ href, icon: Icon, active, onNavigate, children }: { href: string; icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>; active: boolean; onNavigate: () => void; children: React.ReactNode }) {
  return (
    <Link href={href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={cn("flex min-h-12 items-center gap-3 rounded-lg pl-[0.9375rem] pr-3 text-sm hover:bg-surface-2 hover:text-fg", active ? "text-fg" : "text-fg-muted")}>
      <Icon className="h-[1.125rem] w-[1.125rem] text-fg-subtle" aria-hidden /> {children}
    </Link>
  );
}

/**
 * The phone top bar's height (status bar included) as --mobile-chrome on the page, so whatever
 * scrolls into view (a link to a section, a game brought up, the keyboard's focus) stops below it
 * rather than under it (globals.css: scroll-padding-top on phones).
 */
function useChromeHeight(ref: React.RefObject<HTMLElement | null>) {
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const observer = new ResizeObserver(() => root.style.setProperty("--mobile-chrome", `${el.offsetHeight}px`));
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--mobile-chrome");
    };
  }, [ref]);
}

/**
 * The page's own heading (its h1) and whether it has scrolled up under the top bar: the bar then
 * shows its words, so the title is in view however far the page scrolls (an iOS-style large
 * title). Follows the heading as pages change and as their content arrives.
 */
function usePageHeading(pathname: string): { text: string | null; past: boolean } {
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
      const bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--mobile-chrome")) || 56;
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
  }, [pathname]);
  return state;
}

/*
  Back on a phone. The pages visited in this tab of the browser since the app opened, newest last,
  each with its heading: when the page before this one is known, Back goes to it (the browser's own
  history, so the place on that page is kept) and is named after it ("Leaderboards", "Demo Mid");
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
