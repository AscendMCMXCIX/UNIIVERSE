"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";
import { BrandMark } from "./brand-mark";
import { NavLinks } from "./nav-links";
import { Avatar } from "./ui/avatar";
import { ACCOUNT_LINKS, ADMIN_TABS, TAB_HREFS, TAB_LIMIT, TAB_LOOK, currentTab, isActivePath } from "@/lib/nav";
import { AccountMenu } from "./account-menu";
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
  /** Other accounts this browser is signed in to, and room to add one (the account menu). */
  otherAccounts?: Array<{ userId: string; name: string; avatarUrl: string | null; roleLabel: string }>;
  canAddAccount?: boolean;
  /** Paths this account may open in the current mode (the server decides). */
  allowed: string[];
  navClosed?: string[];
  /** Admin Mode: the top bar says so and the drawer offers the way back. */
  adminMode?: boolean;
  /** The Player View ↔ Admin Mode switch, rendered in the drawer. */
  hasPlayer?: boolean;
}

/**
 * Phone and tablet navigation: a sticky top bar (brand, your avatar, menu) and a drawer with every
 * page, plus a bottom tab bar on phones with the five most used pages. Hidden from lg up, where
 * the sidebar takes over. Safe-area insets keep both bars clear of notches, rounded corners and
 * the home indicator. In short windows (a phone held sideways) the tab bar is hidden and the top
 * bar slides away while the page scrolls down, coming back as soon as it scrolls up.
 */
export function MobileNav({ logoSrc, logoStill, shortName, tagline, home, user, status, showSignOut, otherAccounts = [], canAddAccount = false, allowed, navClosed, adminMode = false, hasPlayer = false }: MobileNavProps) {
  const pathname = usePathname();
  const tabs = adminMode ? ADMIN_TABS.filter((t) => allowed.includes(t.href)) : TAB_HREFS.filter((href) => allowed.includes(href)).slice(0, TAB_LIMIT).map((href) => ({ href, ...TAB_LOOK[href] }));
  const activeTab = currentTab(pathname, tabs.map((t) => t.href));
  const accountLinks = ACCOUNT_LINKS;
  // The drawer remembers the path it was opened on, so any navigation closes it without an effect.
  const [openedAt, setOpenedAt] = React.useState<string | null>(null);
  const open = openedAt === pathname;
  const setOpen = (next: boolean) => setOpenedAt(next ? pathname : null);
  const closeRef = React.useRef<HTMLButtonElement>(null);
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
        className="sticky top-0 z-40 flex items-center gap-2 border-b border-border bg-bg-elevated/90 px-safe-3 pt-safe backdrop-blur-md transition-transform duration-200 ease-out data-[hidden=true]:not-focus-within:-translate-y-full sm:px-safe-4 lg:hidden"
        data-hidden={hidden && !open}
        data-testid="mobile-topbar"
      >
        <Link href={home} className="flex min-h-14 min-w-0 flex-1 items-center gap-2.5" title={shortName}>
          <BrandMark src={logoSrc} still={logoStill} name={shortName} className="h-8 w-8 rounded-md text-base" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold tracking-[0.12em] text-fg">{shortName}</span>
            {adminMode ? <span className="block truncate text-xs font-semibold uppercase tracking-[0.2em] text-accent">Admin mode</span> : tagline ? <span className="block truncate text-xs text-fg-subtle">{tagline}</span> : null}
          </span>
        </Link>
        {user ? <AccountMenu user={user} showSignOut={showSignOut} others={otherAccounts} canAdd={canAddAccount} variant="topbar" /> : null}
        <button type="button" onClick={() => setOpen(true)} className="grid h-11 w-11 place-items-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg" aria-label="Open menu" aria-expanded={open} aria-controls="mobile-drawer">
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu" id="mobile-drawer">
          <button type="button" className="fade-in absolute inset-0 bg-black/60 backdrop-blur-sm" aria-label="Close menu" onClick={() => setOpen(false)} />
          <div className="drawer-in absolute inset-y-0 right-0 flex w-[min(calc(20rem+env(safe-area-inset-right)),86vw)] flex-col overflow-y-auto overscroll-contain border-l border-border bg-bg-elevated pt-safe pr-[env(safe-area-inset-right)] pb-safe shadow-2xl">
            <div className="flex items-center justify-between gap-2 px-4 py-3">
              {user ? (
                <Link href={hasPlayer ? "/overview" : "/settings"} onClick={() => setOpen(false)} className="flex min-w-0 items-center gap-2.5">
                  <Avatar name={user.name} src={user.avatarUrl} size="md" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{user.name}</span>
                    <span className="block truncate text-xs text-fg-subtle">{user.roleLabel}</span>
                  </span>
                </Link>
              ) : (
                <span className="text-sm font-bold tracking-[0.12em]">{shortName}</span>
              )}
              <button ref={closeRef} type="button" onClick={() => setOpen(false)} className="grid h-11 w-11 place-items-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg" aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavLinks allowed={allowed} admin={adminMode} large initialClosed={navClosed} onNavigate={() => setOpen(false)} />
            <div className="mx-3 mt-3 flex flex-col gap-1 border-t border-border pt-3">
              {accountLinks.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href} onClick={() => setOpen(false)} aria-current={isActivePath(pathname, href) ? "page" : undefined} className={cn("flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm hover:bg-surface-2 hover:text-fg", isActivePath(pathname, href) ? "text-fg" : "text-fg-muted")}>
                  <Icon className="h-[18px] w-[18px] text-fg-subtle" /> {label}
                </Link>
              ))}
              {showSignOut ? (
                <form action="/api/auth/logout" method="post">
                  <button className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-fg-muted hover:bg-surface-2 hover:text-fg" type="submit">
                    <LogOut className="h-[18px] w-[18px] text-fg-subtle" /> {otherAccounts.length && user ? `Sign out of ${user.name}` : "Sign out"}
                  </button>
                </form>
              ) : null}
            </div>
            <div className="mt-auto border-t border-border px-4 py-3">{status}</div>
          </div>
        </div>
      ) : null}

      {tabs.length > 0 ? (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg-elevated/95 px-safe pb-safe backdrop-blur-md short:hidden md:hidden" aria-label="Primary">
          <ul className="grid" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
            {tabs.map(({ href, label, icon: Icon }) => {
              // The profile tab covers every profile section, Team the Team sections without a tab of their own.
              const active = href === activeTab;
              return (
                <li key={href}>
                  <Link href={href} aria-current={active ? "page" : undefined} className={cn("flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors", active ? "text-accent" : "text-fg-muted")}>
                    <Icon className="h-5 w-5" aria-hidden />
                    <span className="max-w-full truncate px-1">{label}</span>
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
