import { Medal, Users, Handshake, UserCog, ChartNoAxesCombined, Settings, History, UserPlus, SlidersHorizontal, Database, Paintbrush, Activity, LayoutGrid, CircleUserRound, TrendingUp, Trophy, Gauge, Library, NotebookPen, ScrollText, Link2, KeyRound, MonitorSmartphone, Globe, type LucideIcon } from "lucide-react";
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

/**
 * One sidebar entry that stands for a set of pages with their own tabs (Team): it opens the first
 * page this account may use and stays marked on every one of them.
 */
export interface NavHub {
  key: string;
  label: string;
  icon: LucideIcon;
  sections: NavLink[];
  /** Pages that belong to the entry without a tab of their own (Team: the draft pages). */
  related?: string[];
}

export type NavEntry = NavLink | NavGroup | NavHub;

/**
 * A profile's sections, in this deliberate order: Overview, All Champions, Match History,
 * Solo Queue Blocks, Riot Accounts (Matchups live inside All Champions: a champion's window). The bar under the profile card (a picker on phones) reads this
 * list, on your own profile and on every teammate's. `path` is relative to the profile (/overview
 * for your own, /players/[id] for a teammate's); `own` sections exist only on your own profile.
 */
export const PROFILE_SECTIONS: Array<{ key: string; path: string; label: string; icon: LucideIcon; own?: boolean }> = [
  { key: "overview", path: "", label: "Overview", icon: Gauge },
  { key: "champions", path: "/champions", label: "All Champions", icon: Library },
  { key: "matches", path: "/matches", label: "Match History", icon: ScrollText },
  { key: "blocks", path: "/blocks", label: "Solo Queue Blocks", icon: NotebookPen, own: true },
  { key: "accounts", path: "/accounts", label: "Riot Accounts", icon: Link2 },
];

/**
 * Where an old Matchups address leads: All Champions with the champion's window open on Matchups,
 * keeping the champion, the opponent, the season, the game mode and the account.
 */
export function matchupsRedirect(profile: string, sp: Record<string, string | string[] | undefined>): string {
  const q = new URLSearchParams();
  for (const k of ["season", "mode", "account", "champion", "vs", "role"] as const) {
    const v = sp[k];
    if (typeof v === "string" && v) q.set(k === "role" ? "crole" : k, v);
  }
  q.set("tab", "matchups");
  return `${profile}/champions?${q.toString()}`;
}

export function isNavGroup(entry: NavEntry): entry is NavGroup {
  return "links" in entry;
}

export function isNavHub(entry: NavEntry): entry is NavHub {
  return "sections" in entry;
}

/**
 * Team's sections, in this order: the tabs at the top of every Team page and the pages the one
 * Team entry of the sidebar stands for. Each keeps its own address (deep links, Back and Forward
 * work as before); the pages check the same permissions again.
 */
export const TEAM_SECTIONS: NavLink[] = [
  { href: "/team", label: "Overview", icon: LayoutGrid, permission: "view-team" },
  { href: "/players", label: "Players", icon: UserCog, permission: "view-players" },
  { href: "/leaderboards", label: "Leaderboards", icon: Medal, permission: "view-teammate-stats" },
  { href: "/matches", label: "Matches", icon: History, permission: "view-matches" },
];

/** The same sections in Admin Mode (the lineup and the match archive are managed there). */
export const ADMIN_TEAM_SECTIONS: NavLink[] = [
  { href: "/team", label: "Overview", icon: LayoutGrid, permission: "manage-lineup" },
  { href: "/players", label: "Players", icon: UserCog, permission: "view-players" },
  { href: "/leaderboards", label: "Leaderboards", icon: Medal, permission: "view-teammate-stats" },
  { href: "/matches", label: "Matches", icon: History, permission: "manage-matches" },
];

/**
 * Drafting is something the team starts (Team Overview → Start a draft, or Resume draft), not a
 * place to browse, so it has no tab; its pages (/draft, a draft room, a series) still belong to
 * Team, which stays marked on them. Addresses, links from matches and Back/Forward are unchanged.
 */
export const TEAM_RELATED = ["/draft"];

/**
 * Meta & Trends' sections, in this order: the tabs at the top of each of its pages and the pages
 * its one sidebar entry stands for (the same in Player View and Admin Mode).
 */
export const TRENDS_SECTIONS: NavLink[] = [
  { href: "/trends/solo", label: "Solo Queue Meta", icon: TrendingUp, permission: "view-trends" },
  { href: "/trends/duos", label: "Duo Synergies", icon: Handshake, permission: "view-trends" },
  { href: "/trends/pro", label: "Pro Play", icon: Trophy, permission: "view-trends" },
];

/**
 * The sets of pages shown as tabs at the top of each of their pages (SectionTabs), one per
 * sidebar entry that stands for several pages. `label` names the tab bar for screen readers.
 */
export const SECTION_HUBS: Array<{ key: string; label: string; sections: NavLink[]; adminSections?: NavLink[]; related?: string[] }> = [
  { key: "team", label: "Team sections", sections: TEAM_SECTIONS, adminSections: ADMIN_TEAM_SECTIONS, related: TEAM_RELATED },
  { key: "meta", label: "Meta & Trends sections", sections: TRENDS_SECTIONS },
];

/** The pages of an entry, whatever its kind. */
export function entryLinks(entry: NavEntry): NavLink[] {
  return isNavHub(entry) ? entry.sections : isNavGroup(entry) ? entry.links : [entry];
}

/**
 * Player View, as the sidebar shows it, in this order:
 *   My Profile     one link (marked on every profile section). Its sections are the bar under the
 *                  profile card, the one place they are listed, so the sidebar and the page no longer
 *                  repeat the same six links side by side; every section keeps its own address;
 *   Team           one entry for the competitive workspace (only for members of the team): it opens
 *                  Team Overview, the team's home page, and stays marked on all of its sections,
 *                  which are the tabs at the top of every Team page (TEAM_SECTIONS);
 *   Meta & Trends  one entry the same way: it opens Solo Queue Meta and stays marked on Duo
 *                  Synergies and Pro Play too, which are the tabs at the top of each of those pages
 *                  (TRENDS_SECTIONS).
 * The account menu holds Settings and Sign out only.
 */
export const NAV_ENTRIES: NavEntry[] = [
  { href: "/overview", label: "My Profile", icon: CircleUserRound },
  { key: "team", label: "Team", icon: Users, sections: TEAM_SECTIONS, related: TEAM_RELATED },
  { key: "trends", label: "Meta & Trends", icon: ChartNoAxesCombined, sections: TRENDS_SECTIONS },
];

/** Every Player-View page in sidebar order (groups flattened). */
export const NAV_LINKS: NavLink[] = NAV_ENTRIES.flatMap(entryLinks);

/** The account menu (your avatar): account settings only; profile pages live under My Profile. */
export const ACCOUNT_LINKS: NavLink[] = [{ href: "/settings", label: "Settings", icon: Settings }];

/**
 * Phone bottom tabs: the first TAB_LIMIT of these this account may open (team members: Profile,
 * Team, Matches, Meta; everyone else: Profile and the two meta pages). Team and Meta stand for
 * their sections without a tab of their own (see currentTab), like their sidebar entries; Team
 * also stands for the draft pages, which are started from Team Overview.
 */
export const TAB_HREFS = ["/overview", "/team", "/matches", "/trends/solo", "/trends/pro"] as const;
export const TAB_LIMIT = 4;

/**
 * The bottom tab the page belongs to: its own tab, else the first tab of its section set (Team for
 * Players and Leaderboards; Meta for Duo Synergies, and for Pro Play when it has no tab of its own).
 */
export function currentTab(pathname: string, tabs: readonly string[]): string | null {
  const own = activeHref(pathname, tabs);
  if (own) return own;
  const hub = SECTION_HUBS.find((h) => h.sections.some((l) => isActivePath(pathname, l.href)) || h.related?.some((href) => isActivePath(pathname, href)));
  return hub?.sections.map((l) => l.href).find((href) => tabs.includes(href)) ?? null;
}

/** How the phone tab bar names and draws those pages (short words; the profile as a person). */
export const TAB_LOOK: Record<(typeof TAB_HREFS)[number], { label: string; icon: LucideIcon }> = {
  "/overview": { label: "Profile", icon: CircleUserRound },
  "/team": { label: "Team", icon: LayoutGrid },
  "/matches": { label: "Matches", icon: History },
  "/trends/solo": { label: "Meta", icon: TrendingUp },
  "/trends/pro": { label: "Pro Play", icon: Trophy },
};

/**
 * Admin Mode (the Owner account only): administration in four groups. People holds every account
 * and its access; Team holds the lineup, players, leaderboards and matches (drafts start from Team Overview) (the same pages the team
 * uses, one entry with the same tabs, opened inside Admin Mode, so nothing needs Player View); Site holds the settings; League
 * holds the global meta pages for reference (one entry with the same tabs as in Player View).
 */
export const ADMIN_ENTRIES: Array<NavGroup | NavHub> = [
  {
    key: "admin-people",
    label: "People",
    icon: UserPlus,
    links: [
      { href: "/admin/people", label: "Accounts", icon: UserPlus, permission: "manage-users" },
      { href: "/admin/people/access", label: "Access levels", icon: KeyRound, permission: "manage-users" },
    ],
  },
  { key: "admin-team", label: "Team", icon: Users, sections: ADMIN_TEAM_SECTIONS, related: TEAM_RELATED },
  {
    key: "admin-site",
    label: "Site",
    icon: Settings,
    links: [
      { href: "/admin/branding", label: "Branding", icon: Paintbrush, permission: "manage-branding" },
      { href: "/admin/previews", label: "Previews", icon: MonitorSmartphone, permission: "manage-branding" },
      { href: "/admin/public-access", label: "Public Access", icon: Globe, permission: "manage-users" },
      { href: "/admin/competition", label: "Draft Settings", icon: SlidersHorizontal, permission: "manage-competition" },
      { href: "/admin/data", label: "Riot Data", icon: Database, permission: "manage-data" },
      { href: "/admin/system", label: "System Health", icon: Activity, permission: "manage-data" },
    ],
  },
  { key: "admin-league", label: "Meta & Trends", icon: ChartNoAxesCombined, sections: TRENDS_SECTIONS },
];

/** Every Admin-Mode page in sidebar order (groups flattened). */
export const ADMIN_LINKS: NavLink[] = ADMIN_ENTRIES.flatMap(entryLinks);

/** Phone bottom tabs in Admin Mode, with short labels. */
export const ADMIN_TABS: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/admin/people", label: "Accounts", icon: UserPlus },
  { href: "/team", label: "Team", icon: LayoutGrid },
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

