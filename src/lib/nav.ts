import { Users, Swords, UserCog, TrendingUp, Settings, History, Target, ShieldCheck, UserPlus, SlidersHorizontal, Database, Paintbrush, Activity, type LucideIcon } from "lucide-react";
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

/** Player View: what a member uses day to day. */
export const NAV_LINKS: NavLink[] = [
  { href: "/team", label: "Team", icon: Users, permission: "view-team" },
  { href: "/draft", label: "Draft", icon: Swords, permission: "create-draft" },
  { href: "/players", label: "Players", icon: UserCog, permission: "view-players" },
  { href: "/matches", label: "Matches", icon: History, permission: "view-matches" },
  { href: "/overview", label: "My Overview", icon: Target },
  { href: "/trends", label: "Trends", icon: TrendingUp, permission: "view-trends" },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** Admin Mode: administration split into pages that each hold real settings. */
export const ADMIN_LINKS: NavLink[] = [
  { href: "/admin/players", label: "Players & Accounts", icon: UserPlus, anyOf: ["manage-users", "manage-players", "manage-lineup"] },
  { href: "/admin/users", label: "Users & Permissions", icon: ShieldCheck, permission: "manage-users" },
  { href: "/admin/competition", label: "Competition", icon: SlidersHorizontal, permission: "manage-competition" },
  { href: "/admin/data", label: "Data & Riot", icon: Database, permission: "manage-data" },
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

