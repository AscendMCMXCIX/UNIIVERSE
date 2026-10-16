import { Medal, Users, Swords, Handshake, UserCog, ChartNoAxesCombined, Settings, History, UserPlus, SlidersHorizontal, Database, Paintbrush, Activity, LayoutGrid, CircleUserRound, TrendingUp, Trophy, Gauge, Library, NotebookPen, ScrollText, Link2, Crosshair, KeyRound, MonitorSmartphone, type LucideIcon } from "lucide-react";
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

/**
 * My Profile's sections, in order: the sidebar group and the bar under the profile card both read
 * this list. `path` is relative to the profile (/overview for your own, /players/[id] for a
 * teammate's); `own` sections exist only on your own profile.
 */
export const PROFILE_SECTIONS: Array<{ key: string; path: string; label: string; icon: LucideIcon; own?: boolean }> = [
  { key: "overview", path: "", label: "Overview", icon: Gauge },
  { key: "champions", path: "/champions", label: "All Champions", icon: Library },
  { key: "blocks", path: "/blocks", label: "Solo Queue Blocks", icon: NotebookPen, own: true },
  { key: "matches", path: "/matches", label: "Match History", icon: ScrollText },
  { key: "matchups", path: "/matchups", label: "Matchups", icon: Crosshair },
  { key: "accounts", path: "/accounts", label: "Riot Accounts", icon: Link2 },
];

export function isNavGroup(entry: NavEntry): entry is NavGroup {
  return "links" in entry;
}

/**
 * Player View, as the sidebar shows it: three collapsible groups, in this order.
 *   My Profile     Overview, All Champions, Solo Queue Blocks, Match History, Riot Accounts (the
 *                  same sections as the bar under the profile card, so both always agree);
 *   Team           the competitive workspace: Team Overview, Players, Leaderboards, Draft, Matches (only for
 *                  members of the team: the whole group is absent otherwise);
 *   Meta & Trends  Solo Queue Meta (global ranked evidence) and Pro Play (professional drafts),
 *                  kept apart because they answer different questions.
 * The account menu holds Settings and Sign out only.
 */
export const NAV_ENTRIES: NavEntry[] = [
  {
    key: "profile",
    label: "My Profile",
    icon: CircleUserRound,
    links: PROFILE_SECTIONS.map((s) => ({ href: `/overview${s.path}`, label: s.label, icon: s.icon })),
  },
  {
    key: "team",
    label: "Team",
    icon: Users,
    links: [
      { href: "/team", label: "Team Overview", icon: LayoutGrid, permission: "view-team" },
      { href: "/players", label: "Players", icon: UserCog, permission: "view-players" },
      { href: "/leaderboards", label: "Leaderboards", icon: Medal, permission: "view-teammate-stats" },
      { href: "/draft", label: "Draft", icon: Swords, permission: "create-draft" },
      { href: "/matches", label: "Matches", icon: History, permission: "view-matches" },
    ],
  },
  {
    key: "trends",
    label: "Meta & Trends",
    icon: ChartNoAxesCombined,
    links: [
      { href: "/trends/solo", label: "Solo Queue Meta", icon: TrendingUp, permission: "view-trends" },
      { href: "/trends/duos", label: "Duo Synergies", icon: Handshake, permission: "view-trends" },
      { href: "/trends/pro", label: "Pro Play", icon: Trophy, permission: "view-trends" },
    ],
  },
];

/** Every Player-View page in sidebar order (groups flattened). */
export const NAV_LINKS: NavLink[] = NAV_ENTRIES.flatMap((e) => (isNavGroup(e) ? e.links : [e]));

/** The account menu (your avatar): account settings only; profile pages live under My Profile. */
export const ACCOUNT_LINKS: NavLink[] = [{ href: "/settings", label: "Settings", icon: Settings }];

/**
 * Phone bottom tabs: the first five of these this account may open (team members: Profile, Team,
 * Players, Draft, Matches; everyone else: Profile and the two meta pages).
 */
export const TAB_HREFS = ["/overview", "/team", "/players", "/draft", "/matches", "/trends/solo", "/trends/pro"] as const;

/** How the phone tab bar names and draws those pages (short words; the profile as a person). */
export const TAB_LOOK: Record<(typeof TAB_HREFS)[number], { label: string; icon: LucideIcon }> = {
  "/overview": { label: "Profile", icon: CircleUserRound },
  "/team": { label: "Team", icon: LayoutGrid },
  "/players": { label: "Players", icon: UserCog },
  "/draft": { label: "Draft", icon: Swords },
  "/matches": { label: "Matches", icon: History },
  "/trends/solo": { label: "Meta", icon: TrendingUp },
  "/trends/pro": { label: "Pro Play", icon: Trophy },
};

/**
 * Admin Mode (the Owner account only): administration in four groups. People holds every account
 * and its access; Team holds the lineup, players, drafts and matches (the same pages the team
 * uses, opened inside Admin Mode, so nothing needs Player View); Site holds the settings; League
 * holds the global meta pages for reference.
 */
export const ADMIN_ENTRIES: NavGroup[] = [
  {
    key: "admin-people",
    label: "People",
    icon: UserPlus,
    links: [
      { href: "/admin/people", label: "Accounts", icon: UserPlus, permission: "manage-users" },
      { href: "/admin/people/access", label: "Access levels", icon: KeyRound, permission: "manage-users" },
    ],
  },
  {
    key: "admin-team",
    label: "Team",
    icon: Users,
    links: [
      { href: "/team", label: "Team Overview", icon: LayoutGrid, permission: "manage-lineup" },
      { href: "/players", label: "Players", icon: UserCog, permission: "view-players" },
      { href: "/leaderboards", label: "Leaderboards", icon: Medal, permission: "view-teammate-stats" },
      { href: "/draft", label: "Draft", icon: Swords, permission: "create-draft" },
      { href: "/matches", label: "Matches", icon: History, permission: "manage-matches" },
    ],
  },
  {
    key: "admin-site",
    label: "Site",
    icon: Settings,
    links: [
      { href: "/admin/branding", label: "Branding", icon: Paintbrush, permission: "manage-branding" },
      { href: "/admin/previews", label: "Previews", icon: MonitorSmartphone, permission: "manage-branding" },
      { href: "/admin/competition", label: "Draft Settings", icon: SlidersHorizontal, permission: "manage-competition" },
      { href: "/admin/data", label: "Riot Data", icon: Database, permission: "manage-data" },
      { href: "/admin/system", label: "System Health", icon: Activity, permission: "manage-data" },
    ],
  },
  {
    key: "admin-league",
    label: "Meta & Trends",
    icon: ChartNoAxesCombined,
    links: [
      { href: "/trends/solo", label: "Solo Queue Meta", icon: TrendingUp, permission: "view-trends" },
      { href: "/trends/duos", label: "Duo Synergies", icon: Handshake, permission: "view-trends" },
      { href: "/trends/pro", label: "Pro Play", icon: Trophy, permission: "view-trends" },
    ],
  },
];

/** Every Admin-Mode page in sidebar order (groups flattened). */
export const ADMIN_LINKS: NavLink[] = ADMIN_ENTRIES.flatMap((g) => g.links);

/** Phone bottom tabs in Admin Mode, with short labels. */
export const ADMIN_TABS: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/admin/people", label: "Accounts", icon: UserPlus },
  { href: "/team", label: "Team", icon: LayoutGrid },
  { href: "/draft", label: "Draft", icon: Swords },
  { href: "/admin/branding", label: "Branding", icon: Paintbrush },
  { href: "/admin/system", label: "Health", icon: Activity },
];

/** May this session open the link? (Pages enforce the same rule on the server.) */
export function canOpen(session: Session | null, link: Pick<NavLink, "permission" | "anyOf">): boolean {
  if (link.permission && !hasPermission(session, link.permission)) return false;
  if (link.anyOf && !link.anyOf.some((p) => hasPermission(session, p))) return false;
  return true;
}

/** Where Admin Mode opens: the first admin page this account may use. */
export function firstAdminPath(session: Session | null): string {
  return ADMIN_LINKS.find((l) => canOpen(session, l))?.href ?? "/settings";
}

export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The one link of a list that the page belongs to: the longest matching href, so /overview/blocks
 * marks "Solo Queue Blocks" and not also "Overview" (/overview).
 */
export function activeHref(pathname: string, hrefs: readonly string[]): string | null {
  return hrefs.filter((h) => isActivePath(pathname, h)).sort((a, b) => b.length - a.length)[0] ?? null;
}

