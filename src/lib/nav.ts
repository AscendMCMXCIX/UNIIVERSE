import { Users, Swords, UserCog, ChartNoAxesCombined, Settings, History, UserPlus, SlidersHorizontal, Database, Paintbrush, Activity, LayoutGrid, CircleUserRound, type LucideIcon } from "lucide-react";
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

/** A titled section of related pages in the sidebar (a heading, never nested deeper). */
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
 * Player View, as the sidebar shows it: the team's pages under a TEAM heading, in the order a
 * session runs (who is on the team → who plays → the draft → the record), then the two pages that
 * stand on their own: Meta & Trends (global champion trends, for everyone) and My Profile (with its
 * own sections: Overview, Champions & Roles, Solo Queue Blocks, Match History, Riot Accounts).
 * Single pages get no heading of their own; the account menu holds Settings and Sign out.
 */
export const NAV_ENTRIES: NavEntry[] = [
  {
    key: "team",
    label: "Team",
    icon: Users,
    links: [
      { href: "/team", label: "Overview", icon: LayoutGrid, permission: "view-team" },
      { href: "/players", label: "Players", icon: UserCog, permission: "view-players" },
      { href: "/draft", label: "Draft", icon: Swords, permission: "create-draft" },
      { href: "/matches", label: "Matches", icon: History, permission: "view-matches" },
    ],
  },
  { href: "/trends", label: "Meta & Trends", icon: ChartNoAxesCombined, permission: "view-trends" },
  { href: "/overview", label: "My Profile", icon: CircleUserRound },
];

/** Every Player-View page in sidebar order (groups flattened). */
export const NAV_LINKS: NavLink[] = NAV_ENTRIES.flatMap((e) => (isNavGroup(e) ? e.links : [e]));

/** The account menu (your avatar): account settings only; profile pages live under My Profile. */
export const ACCOUNT_LINKS: NavLink[] = [{ href: "/settings", label: "Settings", icon: Settings }];

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

