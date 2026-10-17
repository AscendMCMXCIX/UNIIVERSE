"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { ChevronsUpDown, LogOut, UserPlus } from "lucide-react";
import { ACCOUNT_LINKS, isActivePath } from "@/lib/nav";
import { switchAccountAction } from "@/server/actions/account-switch";
import { Avatar } from "./ui/avatar";
import { Menu, MenuItem, MenuLabel, MenuLink, MenuSeparator } from "./ui/menu";
import { toast } from "./ui/toast";
import { announceAccountChange, markAccountChange } from "./account-guard";
import { cn } from "@/lib/cn";

export interface AccountMenuUser {
  name: string;
  avatarUrl: string | null;
  roleLabel: string;
}

export interface OtherAccount extends AccountMenuUser {
  userId: string;
}

/**
 * Your avatar opens the account menu: the account you are using, the other accounts this browser
 * is signed in to (one click switches; see account-jar.ts), Add another account, Settings, and
 * signing out of this account or of all of them. Switching reloads the whole page as the other
 * account, so nothing of this one stays on screen or in memory. Profile pages live under My
 * Profile and the Admin switch in the navigation, so nothing is reachable from two places.
 */
export function AccountMenu({ user, showSignOut, others = [], canAdd = false, variant = "sidebar" }: { user: AccountMenuUser; showSignOut: boolean; others?: OtherAccount[]; canAdd?: boolean; variant?: "sidebar" | "topbar" }) {
  const pathname = usePathname();
  const [switching, setSwitching] = React.useState<string | null>(null);
  const switchTo = async (other: OtherAccount) => {
    setSwitching(other.userId);
    markAccountChange(true);
    const r = await switchAccountAction(other.userId);
    if (!r.ok) {
      markAccountChange(false);
      setSwitching(null);
      toast.error(r.error);
      return;
    }
    announceAccountChange();
    // A full page load on purpose: nothing of the previous account's pages, router cache or
    // client state may survive the switch.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/");
  };
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
        <span className="block text-[0.6875rem] uppercase tracking-wider">Signed in as</span>
        <span className="block truncate text-sm font-semibold text-fg">{user.name}</span>
        <span className="block truncate">{user.roleLabel}</span>
      </MenuLabel>
      {others.length ? (
        <>
          <MenuSeparator />
          <MenuLabel>Switch account</MenuLabel>
          {others.map((o) => (
            <MenuItem key={o.userId} onSelect={() => void switchTo(o)} disabled={!!switching} icon={<Avatar name={o.name} src={o.avatarUrl} size="xs" />} hint={switching === o.userId ? "Switching…" : o.roleLabel} data-testid="switch-account" data-user={o.name}>
              {o.name}
            </MenuItem>
          ))}
        </>
      ) : null}
      {canAdd ? (
        <MenuLink href="/login?add=1" icon={<UserPlus className="h-4 w-4" />}>
          Add another account
        </MenuLink>
      ) : null}
      <MenuSeparator />
      {ACCOUNT_LINKS.map(({ href, label, icon: Icon }) => (
        <MenuLink key={href} href={href} icon={<Icon className="h-4 w-4" />} active={isActivePath(pathname, href)}>
          {label}
        </MenuLink>
      ))}
      {showSignOut ? (
        <>
          <MenuSeparator />
          <form action="/api/auth/logout" method="post" onSubmit={() => (markAccountChange(true), announceAccountChange())}>
            <MenuItem type="submit" icon={<LogOut className="h-4 w-4" />} className={cn("text-fg-muted")} data-testid="sign-out">
              {others.length ? `Sign out of ${user.name}` : "Sign out"}
            </MenuItem>
          </form>
          {others.length ? (
            <form action="/api/auth/logout?all=1" method="post" onSubmit={() => (markAccountChange(true), announceAccountChange())}>
              <MenuItem type="submit" icon={<LogOut className="h-4 w-4" />} className={cn("text-fg-muted")} data-testid="sign-out-all">
                Sign out of all accounts
              </MenuItem>
            </form>
          ) : null}
        </>
      ) : null}
    </Menu>
  );
}
