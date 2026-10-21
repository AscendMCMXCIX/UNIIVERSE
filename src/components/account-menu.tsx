"use client";

import { usePathname } from "next/navigation";
import { ChevronsUpDown, LogOut } from "lucide-react";
import { ACCOUNT_LINKS, ADMIN_ACCOUNT_LINKS, isActivePath } from "@/lib/nav";
import { Avatar } from "./ui/avatar";
import { Menu, MenuItem, MenuLabel, MenuLink, MenuSeparator } from "./ui/menu";
import { announceAccountChange, markAccountChange } from "./account-guard";
import { cn } from "@/lib/cn";

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
 * reachable from two places.
 */
export function AccountMenu({ user, showSignOut, variant = "sidebar", adminMode = false }: { user: AccountMenuUser; showSignOut: boolean; variant?: "sidebar" | "topbar"; /** Admin Mode: Settings without leaving it. */ adminMode?: boolean }) {
  const links = adminMode ? ADMIN_ACCOUNT_LINKS : ACCOUNT_LINKS;
  const pathname = usePathname();
  return (
    <Menu
      label="Account"
      align={variant === "sidebar" ? "start" : "end"}
      side={variant === "sidebar" ? "top" : "bottom"}
      className="w-64"
      testId="account-menu"
      trigger={(p) =>
        variant === "sidebar" ? (
          <button {...p} type="button" title="Your account" className="flex w-full min-w-0 items-center gap-2.5 rounded-lg border border-border bg-surface/60 p-2 text-left transition-colors duration-150 hover:border-border-strong hover:bg-surface-2 group-data-[collapsed=true]/sidebar:border-transparent group-data-[collapsed=true]/sidebar:bg-transparent" data-testid="account-menu-button">
            <Avatar name={user.name} src={user.avatarUrl} size="sm" />
            <span className="min-w-0 flex-1 transition-opacity duration-150 group-data-[collapsed=true]/sidebar:opacity-0 group-data-[collapsed=true]/sidebar:duration-75">
              <span className="block truncate text-sm font-medium text-fg" data-testid="account-current-name">
                {user.name}
              </span>
              <span className="block truncate text-xs text-fg-subtle">{user.roleLabel}</span>
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-fg-subtle transition-opacity duration-150 group-data-[collapsed=true]/sidebar:opacity-0 group-data-[collapsed=true]/sidebar:duration-75" aria-hidden />
          </button>
        ) : (
          <button {...p} type="button" aria-label={`Your account: ${user.name}`} title="Your account" className="grid h-11 w-11 place-items-center rounded-full" data-testid="account-menu-button">
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
