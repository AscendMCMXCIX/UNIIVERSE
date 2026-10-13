"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, UserCircle } from "lucide-react";
import { NAV_LINKS, NavLinks, isActivePath } from "./nav-links";
import { cn } from "@/lib/cn";

export interface MobileNavProps {
  logoSrc: string;
  shortName: string;
  tagline: string;
  /** Rows shown at the bottom of the drawer (patch, data freshness, who is signed in…). */
  status: React.ReactNode;
  showProfile: boolean;
  showSignOut: boolean;
}

/** The five destinations that fit a thumb-reach tab bar; Trends and Settings stay in the drawer. */
const TAB_LINKS = NAV_LINKS.filter((l) => l.href !== "/settings" && l.href !== "/trends");

/**
 * Phone and tablet navigation: a sticky top bar with the brand and a menu button that opens a
 * drawer (all links, profile, sign-out, status), plus a bottom tab bar on phones. Hidden from lg
 * up, where the sidebar takes over. Safe-area insets keep both bars clear of notches and the
 * home indicator; the tab bar hides in short landscape viewports.
 */
export function MobileNav({ logoSrc, shortName, tagline, status, showProfile, showSignOut }: MobileNavProps) {
  const pathname = usePathname();
  // The drawer remembers the path it was opened on, so any navigation closes it without an effect.
  const [openedAt, setOpenedAt] = React.useState<string | null>(null);
  const open = openedAt === pathname;
  const setOpen = (next: boolean) => setOpenedAt(next ? pathname : null);
  const closeRef = React.useRef<HTMLButtonElement>(null);

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
      <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-border bg-bg-elevated/95 px-4 pt-safe backdrop-blur lg:hidden">
        <Link href="/team" className="flex min-h-14 min-w-0 flex-1 items-center gap-2.5" title={shortName}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoSrc} alt="" className="h-8 w-8 shrink-0 rounded-md object-contain" />
          <span className="min-w-0">
            <span className="block truncate text-[9px] tracking-[0.28em] text-fg-subtle">{tagline.toUpperCase()}</span>
            <span className="block truncate text-sm font-bold tracking-[0.14em] text-fg">{shortName}</span>
          </span>
        </Link>
        {showProfile ? (
          <Link href="/me" className="grid h-11 w-11 place-items-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg" aria-label="My profile" title="My profile">
            <UserCircle className="h-5 w-5" />
          </Link>
        ) : null}
        <button type="button" onClick={() => setOpen(true)} className="grid h-11 w-11 place-items-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg" aria-label="Open menu" aria-expanded={open} aria-controls="mobile-drawer">
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu" id="mobile-drawer">
          <button type="button" className="absolute inset-0 bg-black/60" aria-label="Close menu" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 right-0 flex w-[min(20rem,85vw)] flex-col border-l border-border bg-bg-elevated pt-safe pb-safe shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm font-bold tracking-[0.14em]">{shortName}</span>
              <button ref={closeRef} type="button" onClick={() => setOpen(false)} className="grid h-11 w-11 place-items-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg" aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavLinks large onNavigate={() => setOpen(false)} />
            <div className="mx-2 mt-2 flex flex-col gap-0.5 border-t border-border pt-2">
              {showProfile ? (
                <Link href="/me" onClick={() => setOpen(false)} className="flex min-h-11 items-center gap-2.5 rounded-md px-3 text-sm text-fg-muted hover:bg-surface hover:text-fg">
                  <UserCircle className="h-4 w-4 text-fg-subtle" /> My profile
                </Link>
              ) : null}
              {showSignOut ? (
                <form action="/api/auth/logout" method="post">
                  <button className="flex min-h-11 w-full items-center rounded-md px-3 text-left text-sm text-fg-muted hover:bg-surface hover:text-fg" type="submit">
                    Sign out
                  </button>
                </form>
              ) : null}
            </div>
            <div className="mt-auto space-y-1.5 border-t border-border px-4 py-3 text-[11px] text-fg-subtle">{status}</div>
          </div>
        </div>
      ) : null}

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg-elevated/95 pb-safe backdrop-blur md:hidden [@media(max-height:480px)]:hidden" aria-label="Primary">
        <ul className="grid grid-cols-5">
          {TAB_LINKS.map(({ href, label, icon: Icon }) => {
            const active = isActivePath(pathname, href);
            return (
              <li key={href}>
                <Link href={href} aria-current={active ? "page" : undefined} className={cn("flex min-h-14 flex-col items-center justify-center gap-0.5 text-[10px] font-medium", active ? "text-accent" : "text-fg-muted")}>
                  <Icon className="h-5 w-5" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
