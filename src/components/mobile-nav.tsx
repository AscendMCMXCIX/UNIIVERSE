"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";
import { BrandMark } from "./brand-mark";
import { NavLinks } from "./nav-links";
import { Avatar } from "./ui/avatar";
import { ACCOUNT_LINKS, ADMIN_ACCOUNT_LINKS, ADMIN_TABS, TAB_HREFS, TAB_LOOK, currentTab, isActivePath } from "@/lib/nav";
import { AccountMenu } from "./account-menu";
import { InstallAppEntry } from "./install/install-app";
import { cn } from "@/lib/cn";

export interface MobileNavProps {
  logoSrc: string | null;
  /** Still frame of an animated logo, for reduced motion. */
  logoStill?: string | null;
  shortName: string;
  tagline: string;
  home: string;
  user: { name: string; username?: string | null; avatarUrl: string | null; roleLabel: string } | null;
  /** A quiet data-freshness line at the foot of the drawer. */
  status: React.ReactNode;
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

/**
 * Phone and tablet navigation: a sticky top bar (menu, brand, your avatar) and a drawer with every
 * page, plus a bottom tab bar on phones with the sidebar's entries. Hidden from lg up, where
 * the sidebar takes over. The drawer opens from the left, the side the desktop sidebar is on, from
 * the menu button at the bar's left end. Safe-area insets keep both bars clear of notches, rounded
 * corners and the home indicator. In short windows (a phone held sideways) the tab bar is hidden
 * and the top bar slides away while the page scrolls down, coming back as soon as it scrolls up.
 */
export function MobileNav({ logoSrc, logoStill, shortName, tagline, home, user, status, showSignOut, allowed, adminMode = false, hasPlayer = false, modeSwitch = null }: MobileNavProps) {
  // The account's own pages in this mode (Settings), so it never leaves the mode.
  const accountLinks = adminMode ? ADMIN_ACCOUNT_LINKS : ACCOUNT_LINKS;
  const pathname = usePathname();
  const tabs = adminMode ? ADMIN_TABS.filter((t) => allowed.includes(t.href)) : TAB_HREFS.filter((href) => allowed.includes(href)).map((href) => ({ href, ...TAB_LOOK[href] }));
  const activeTab = currentTab(pathname, tabs.map((t) => t.href));
  // The drawer remembers the path it was opened on, so any navigation closes it without an effect.
  const [openedAt, setOpenedAt] = React.useState<string | null>(null);
  const open = openedAt === pathname;
  const setOpen = (next: boolean) => setOpenedAt(next ? pathname : null);
  const closeRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLButtonElement>(null);
  const hidden = useHideOnScroll();

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

  return (
    <>
      <header
        className="sticky top-0 z-40 flex items-center gap-2 border-b border-border bg-chrome/90 px-safe-3 pt-safe backdrop-blur-md transition-transform duration-200 ease-out data-[hidden=true]:not-focus-within:-translate-y-full sm:px-safe-4 lg:hidden"
        data-hidden={hidden && !open}
        data-testid="mobile-topbar"
      >
        {/* The menu button at the left end, by the side the menu opens from; its icon lines up
            with the page's content below. */}
        <button ref={menuRef} type="button" onClick={() => setOpen(true)} className="-ml-1.5 grid h-11 w-11 shrink-0 place-items-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg sm:-ml-2.5" aria-label="Open menu" aria-expanded={open} aria-controls="mobile-drawer" data-testid="menu-button">
          <Menu className="h-5 w-5" aria-hidden />
        </button>
        <Link href={home} className="flex min-h-14 min-w-0 flex-1 items-center gap-2.5" title={shortName}>
          <BrandMark src={logoSrc} still={logoStill} name={shortName} className="h-8 w-8 rounded-md text-base" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold tracking-label text-fg">{shortName}</span>
            {adminMode ? <span className="block truncate text-xs font-semibold uppercase tracking-label text-accent">Admin mode</span> : tagline ? <span className="block truncate text-xs text-fg-subtle">{tagline}</span> : null}
          </span>
        </Link>
        {user ? <AccountMenu user={user} showSignOut={showSignOut} variant="topbar" adminMode={adminMode} /> : null}
      </header>

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
                <Link key={href} href={href} onClick={() => setOpen(false)} aria-current={isActivePath(pathname, href) ? "page" : undefined} className={cn("flex min-h-12 items-center gap-3 rounded-lg pl-[0.9375rem] pr-3 text-sm hover:bg-surface-2 hover:text-fg", isActivePath(pathname, href) ? "text-fg" : "text-fg-muted")}>
                  <Icon className="h-[1.125rem] w-[1.125rem] text-fg-subtle" /> {label}
                </Link>
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
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-chrome/95 px-safe pb-safe backdrop-blur-md short:hidden md:hidden" aria-label="Primary">
          {/* Equal columns, one per tab (three for team members, four in Admin Mode). The current tab
              is lit twice over: its icon sits in an accent pill and its label turns bright, so it
              reads at a glance without colour alone. */}
          <ul className="mx-auto grid max-w-md" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
            {tabs.map(({ href, label, icon: Icon }) => {
              // The profile tab covers every profile section, Team the Team sections without a tab of their own.
              const active = href === activeTab;
              return (
                <li key={href}>
                  <Link href={href} aria-current={active ? "page" : undefined} className={cn("group flex min-h-14 flex-col items-center justify-center gap-1 pb-1 pt-1.5 text-2xs font-medium tracking-wide transition-colors duration-150", active ? "font-semibold text-fg" : "text-fg-muted hover:text-fg")} data-testid={`tab-${href.slice(1)}`}>
                    <span className={cn("grid h-7 w-14 place-items-center rounded-full transition-colors duration-150", active ? "bg-accent/15 text-accent" : "group-hover:bg-surface-2")} aria-hidden>
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="max-w-full truncate px-1 leading-none">{label}</span>
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

/** Distance the page must scroll before the top bar may slide away (about its own height). */
const HIDE_AFTER = 64;
/** Distance scrolled one way, from where that direction began, that hides or shows the bar. */
const INTENT = 8;

/**
 * In short windows (a phone held sideways) the sticky top bar takes a sixth of the screen, so it
 * slides away while the page scrolls down and returns on any scroll up, at the top of the page,
 * and whenever focus moves into it. Taller windows keep it in place. Distances count from where
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
