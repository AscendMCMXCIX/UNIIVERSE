import { Users, Swords, UserCog, TrendingUp, Settings, History, UserPlus, SlidersHorizontal, Database, Paintbrush, Activity, LayoutGrid, CircleUserRound, Gamepad2, type LucideIcon } from "lucide-react";
import { hasPermission, type Permission, type Session } from "@/server/auth/permissions";

export interface NavLink {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown only to accounts holding this permission (checked again on the page itself). */
  permission?: Permission;
  /** Any one of these permissions is enough. */
  anyOf?: Permission[];
}

/** A group of related pages in the sidebar (expands and collapses; never nested deeper). */
export interface NavGroup {
  key: string;
  label: string;
  icon: LucideIcon;
  links: NavLink[];
}

export type NavEntry = NavLink | NavGroup;

export function isNavGroup(entry: NavEntry): entry is NavGroup {
  return "links" in entry;
}

/**
 * Player View, as the sidebar shows it: the team's pages grouped under Team (Draft and Matches
 * belong to the team), then Players, Trends and My Profile (which holds the private Solo Queue
 * Blocks as one of its sections).
 * Account pages (Riot accounts, Settings, sign out) live in the account menu on your avatar.
 */
export const NAV_ENTRIES: NavEntry[] = [
  {
    key: "team",
    label: "Team",
    icon: Users,
    links: [
      { href: "/team", label: "Overview", icon: LayoutGrid, permission: "view-team" },
      { href: "/draft", label: "Draft", icon: Swords, permission: "create-draft" },
      { href: "/matches", label: "Matches", icon: History, permission: "view-matches" },
    ],
  },
  { href: "/players", label: "Players", icon: UserCog, permission: "view-players" },
  { href: "/trends", label: "Trends", icon: TrendingUp, permission: "view-trends" },
  { href: "/overview", label: "My Profile", icon: CircleUserRound },
];

/** Every Player-View page in sidebar order (groups flattened). */
export const NAV_LINKS: NavLink[] = NAV_ENTRIES.flatMap((e) => (isNavGroup(e) ? e.links : [e]));

/** The account menu (your avatar): the personal pages, one place each. */
export const ACCOUNT_LINKS: NavLink[] = [
  { href: "/overview", label: "My Profile", icon: CircleUserRound },
  { href: "/overview/accounts", label: "Riot Accounts", icon: Gamepad2 },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** Phone bottom tabs: the five most used pages this account may open. */
export const TAB_HREFS = ["/team", "/draft", "/matches", "/players", "/overview"] as const;

/** Admin Mode: administration split into pages that each hold real settings. */
export const ADMIN_LINKS: NavLink[] = [
  { href: "/admin/people", label: "People & Access", icon: UserPlus, anyOf: ["manage-users", "manage-players"] },
  { href: "/admin/competition", label: "Draft Settings", icon: SlidersHorizontal, permission: "manage-competition" },
  { href: "/admin/data", label: "Riot Data", icon: Database, permission: "manage-data" },
  { href: "/admin/branding", label: "Branding", icon: Paintbrush, permission: "manage-branding" },
  { href: "/admin/system", label: "System Health", icon: Activity, permission: "manage-data" },
];

/** May this session open the link? (Pages enforce the same rule on the server.) */
export function canOpen(session: Session | null, link: Pick<NavLink, "permission" | "anyOf">): boolean {
  if (link.permission && !hasPermission(session, link.permission)) return false;
  if (link.anyOf && !link.anyOf.some((p) => hasPermission(session, p))) return false;
  return true;
}

/** Where Admin Mode opens: the first admin page this account may use. */
export function firstAdminPath(session: Session | null): string {
  return ADMIN_LINKS.find((l) => canOpen(session, l))?.href ?? "/team";
}

export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

