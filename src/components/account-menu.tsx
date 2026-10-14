"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { ChevronsUpDown, LogOut } from "lucide-react";
import { ACCOUNT_LINKS, isActivePath } from "@/lib/nav";
import { Avatar } from "./ui/avatar";
import { Menu, MenuItem, MenuLabel, MenuLink, MenuSeparator } from "./ui/menu";
import { cn } from "@/lib/cn";

export interface AccountMenuUser {
  name: string;
  avatarUrl: string | null;
  roleLabel: string;
}

/**
 * Your avatar opens the account menu: Settings and Sign out. Profile pages (including Riot
 * Accounts) live under My Profile, and the Admin switch sits in the navigation, so nothing is
 * reachable from two places.
 */
export function AccountMenu({ user, showSignOut, variant = "sidebar" }: { user: AccountMenuUser; showSignOut: boolean; variant?: "sidebar" | "topbar" }) {
  const pathname = usePathname();
  return (
    <Menu
      label="Account"
      align={variant === "sidebar" ? "start" : "end"}
      side={variant === "sidebar" ? "top" : "bottom"}
      className="w-60"
      testId="account-menu"
      trigger={(p) =>
        variant === "sidebar" ? (
          <button {...p} type="button" title="Your account" className="flex w-full min-w-0 items-center gap-2.5 rounded-lg border border-border bg-surface/60 p-2 text-left transition-colors duration-150 hover:border-border-strong hover:bg-surface-2 group-data-[collapsed=true]/sidebar:border-transparent group-data-[collapsed=true]/sidebar:bg-transparent" data-testid="account-menu-button">
            <Avatar name={user.name} src={user.avatarUrl} size="sm" />
            <span className="min-w-0 flex-1 transition-opacity duration-150 group-data-[collapsed=true]/sidebar:opacity-0">
              <span className="block truncate text-sm font-medium text-fg">{user.name}</span>
              <span className="block truncate text-xs text-fg-subtle">{user.roleLabel}</span>
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-fg-subtle transition-opacity duration-150 group-data-[collapsed=true]/sidebar:opacity-0" aria-hidden />
          </button>
        ) : (
          <button {...p} type="button" aria-label="Your account" title="Your account" className="grid h-11 w-11 place-items-center rounded-full" data-testid="account-menu-button">
            <Avatar name={user.name} src={user.avatarUrl} size="sm" />
          </button>
        )
      }
    >
      <MenuLabel>
        <span className="block truncate text-sm font-semibold text-fg">{user.name}</span>
        <span className="block truncate">{user.roleLabel}</span>
      </MenuLabel>
      <MenuSeparator />
      {ACCOUNT_LINKS.map(({ href, label, icon: Icon }) => (
        <MenuLink key={href} href={href} icon={<Icon className="h-4 w-4" />} active={isActivePath(pathname, href)}>
          {label}
        </MenuLink>
      ))}
      {showSignOut ? (
        <>
          <MenuSeparator />
          <form action="/api/auth/logout" method="post">
            <MenuItem type="submit" icon={<LogOut className="h-4 w-4" />} className={cn("text-fg-muted")}>
              Sign out
            </MenuItem>
          </form>
        </>
      ) : null}
    </Menu>
  );
}
