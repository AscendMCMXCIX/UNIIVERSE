"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { ChevronsUpDown, LogOut, ShieldCheck, Undo2 } from "lucide-react";
import { ACCOUNT_LINKS, isActivePath } from "@/lib/nav";
import { switchViewAction } from "@/server/actions/view-mode";
import { Avatar } from "./ui/avatar";
import { Menu, MenuItem, MenuLabel, MenuLink, MenuSeparator } from "./ui/menu";
import { cn } from "@/lib/cn";

export interface AccountMenuUser {
  name: string;
  avatarUrl: string | null;
  roleLabel: string;
}

/**
 * Your avatar opens the account menu: My Profile, Riot Accounts, Settings, the Admin switch (for
 * accounts that may use it) and Sign out. Everything personal is reached from here, once.
 */
export function AccountMenu({ user, hasPlayer, showSignOut, canAdmin, adminMode, variant = "sidebar" }: { user: AccountMenuUser; hasPlayer: boolean; showSignOut: boolean; canAdmin: boolean; adminMode: boolean; variant?: "sidebar" | "topbar" }) {
  const pathname = usePathname();
  const links = ACCOUNT_LINKS.filter((l) => hasPlayer || l.href === "/settings");
  return (
    <Menu
      label="Account"
      align={variant === "sidebar" ? "start" : "end"}
      side={variant === "sidebar" ? "top" : "bottom"}
      className="w-60"
      testId="account-menu"
      trigger={(p) =>
        variant === "sidebar" ? (
          <button {...p} type="button" title="Your account" className="flex w-full min-w-0 items-center gap-2.5 rounded-lg border border-border bg-surface/60 p-2 text-left transition-colors hover:border-border-strong hover:bg-surface-2 group-data-[collapsed=true]/sidebar:justify-center group-data-[collapsed=true]/sidebar:border-transparent group-data-[collapsed=true]/sidebar:bg-transparent group-data-[collapsed=true]/sidebar:p-0.5" data-testid="account-menu-button">
            <Avatar name={user.name} src={user.avatarUrl} size="sm" />
            <span className="min-w-0 flex-1 group-data-[collapsed=true]/sidebar:hidden">
              <span className="block truncate text-sm font-medium text-fg">{user.name}</span>
              <span className="block truncate text-xs text-fg-subtle">{user.roleLabel}</span>
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-fg-subtle group-data-[collapsed=true]/sidebar:hidden" aria-hidden />
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
      {links.map(({ href, label, icon: Icon }) => (
        <MenuLink key={href} href={href} icon={<Icon className="h-4 w-4" />} active={href === "/overview" ? pathname === "/overview" || (pathname.startsWith("/overview/") && !pathname.startsWith("/overview/accounts")) : isActivePath(pathname, href)}>
          {label}
        </MenuLink>
      ))}
      {canAdmin ? (
        <form action={switchViewAction}>
          <input type="hidden" name="mode" value={adminMode ? "player" : "admin"} />
          <MenuItem type="submit" icon={adminMode ? <Undo2 className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}>
            {adminMode ? "Back to Player View" : "Switch to Admin"}
          </MenuItem>
        </form>
      ) : null}
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
