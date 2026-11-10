"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { ChevronsUpDown, LogOut } from "lucide-react";
import { ACCOUNT_LINKS, ADMIN_ACCOUNT_LINKS, isActivePath } from "@/lib/nav";
import { Avatar } from "./ui/avatar";
import { Menu, MenuItem, MenuLabel, MenuLink, MenuSeparator } from "./ui/menu";
import { announceAccountChange, markAccountChange } from "./account-guard";
import { releaseEarlyTaps } from "./early-taps";
import { cn } from "@/lib/cn";
import { RAIL_FADE, RAIL_HIGHLIGHT } from "@/lib/sidebar";

export interface AccountMenuUser {
  /** The display name. */
  name: string;
  /** The sign-in username, shown beside the name when it differs (display names need not be unique). */
  username?: string | null;
  avatarUrl: string | null;
  roleLabel: string;
}

/** The username when it reads differently from the display name, else null (nothing to tell apart). */
export function otherUsername(a: AccountMenuUser): string | null {
  return a.username && a.username.toLowerCase() !== a.name.toLowerCase() ? a.username : null;
}

/**
 * Your avatar opens the account menu: the account you are using, Settings and Sign out. One
 * account per browser: signing in as someone else means signing out first. Profile pages live
 * under My Profile and the switch between the modes beside the navigation, so nothing is
 * reachable from two places. A tap on it before the page's code has run is kept and opens the menu
 * once the code runs (early-taps.ts), as the phone's avatar opens its sheet.
 */
export function AccountMenu({ user, showSignOut, variant = "sidebar", adminMode = false }: { user: AccountMenuUser; showSignOut: boolean; variant?: "sidebar" | "topbar"; /** Admin Mode: Settings without leaving it. */ adminMode?: boolean }) {
  const links = adminMode ? ADMIN_ACCOUNT_LINKS : ACCOUNT_LINKS;
  const pathname = usePathname();
  // The page's code runs now: a tap on either trigger made before it (the sidebar's tile, the
  // tablet's avatar) is passed on to the trigger tapped, once, which opens the menu.
  React.useEffect(() => releaseEarlyTaps("account"), []);
  return (
    <Menu
      label="Account"
      align={variant === "sidebar" ? "start" : "end"}
      side={variant === "sidebar" ? "top" : "bottom"}
      className="w-64"
      testId="account-menu"
      trigger={(p) =>
        variant === "sidebar" ? (
          // A raised tile in the open sidebar (the one surface in the footer: who you are), its
          // avatar 8px inside, so the avatar's centre is the collapsed rail's centre line. Collapsed,
          // the tile is the rail's 3rem highlight square, like every other row's.
          // A tap before the page's code has run is kept (data-early; suppressHydrationWarning: the
          // script may have marked it aria-busy, which React leaves alone).
          <button {...p} type="button" title="Your account" className="group isolate relative flex w-full min-w-0 items-center gap-2.5 rounded-lg p-2 text-left transition-colors duration-150 aria-expanded:[&>[data-tile]]:bg-fg/7" data-early="account" suppressHydrationWarning data-testid="account-menu-button">
            <Avatar name={user.name} src={user.avatarUrl} size="sm" />
            <span data-tile className={cn(RAIL_HIGHLIGHT, "bg-fg/[0.035] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-fg)_6%,transparent)] group-hover:bg-fg/6 group-data-[collapsed=true]/sidebar:bg-transparent group-data-[collapsed=true]/sidebar:shadow-none group-data-[collapsed=true]/sidebar:group-hover:bg-fg/5")} aria-hidden />
            <span className={cn("min-w-0 flex-1", RAIL_FADE)}>
              <span className="block truncate text-sm font-medium text-fg" data-testid="account-current-name">
                {user.name}
              </span>
              <span className="block truncate text-xs text-fg-subtle">{user.roleLabel}</span>
            </span>
            <ChevronsUpDown className={cn("h-4 w-4 shrink-0 text-fg-subtle", RAIL_FADE)} aria-hidden />
          </button>
        ) : (
          <button {...p} type="button" aria-label={`Your account: ${user.name}`} title="Your account" className="grid h-11 w-11 place-items-center rounded-full" data-early="account" suppressHydrationWarning data-testid="account-menu-button">
            <Avatar name={user.name} src={user.avatarUrl} size="sm" />
          </button>
        )
      }
    >
      <MenuLabel>
        <span className="block text-2xs uppercase tracking-label">Signed in as</span>
        <span className="block truncate text-sm font-semibold text-fg">{user.name}</span>
        {otherUsername(user) ? <span className="block truncate" data-testid="account-current-username">Username: {otherUsername(user)}</span> : null}
        <span className="block truncate">{user.roleLabel}</span>
      </MenuLabel>
      <MenuSeparator />
      {links.map(({ href, label, icon: Icon }) => (
        <MenuLink key={href} href={href} icon={<Icon className="h-4 w-4" />} active={isActivePath(pathname, href)}>
          {label}
        </MenuLink>
      ))}
      {showSignOut ? (
        <>
          <MenuSeparator />
          <form action="/api/auth/logout" method="post" onSubmit={() => (markAccountChange(true), announceAccountChange())}>
            <MenuItem type="submit" icon={<LogOut className="h-4 w-4" />} className={cn("text-fg-muted")} data-testid="sign-out">
              Sign out
            </MenuItem>
          </form>
        </>
      ) : null}
    </Menu>
  );
}
