import { BookMarked, Fingerprint, Medal, Users, UserCog, Settings, History, UserPlus, Database, Paintbrush, Activity, LayoutGrid, LayoutDashboard, CircleUserRound, Gauge, Library, ScrollText, Link2, KeyRound, MonitorSmartphone, SlidersHorizontal, ClipboardList, type LucideIcon } from "lucide-react";
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

/**
 * One sidebar entry that stands for a set of pages with their own tabs (Team, Users & Permissions,
 * Platform Settings): it opens the first page this account may use and stays marked on every one
 * of them.
 */
export interface NavHub {
  key: string;
  label: string;
  icon: LucideIcon;
  sections: NavLink[];
}

/** A sidebar entry: one page, or one entry for a set of pages. Neither mode has headings or nested groups. */
export type NavEntry = NavLink | NavHub;

/**
 * A profile's sections, in this deliberate order: Overview, All Champions, Match History, Riot
 * Accounts (Matchups live inside All Champions: a champion's window). The bar under the profile
 * card reads this list, on your own profile and on every teammate's. `path` is relative to the
 * profile (/overview for your own, /players/[id] for a teammate's).
 */
export const PROFILE_SECTIONS: Array<{ key: string; path: string; label: string; /** The phone's name for it, in the top bar where four share a narrow screen. */ short: string; icon: LucideIcon }> = [
  { key: "overview", path: "", label: "Overview", short: "Overview", icon: Gauge },
  { key: "champions", path: "/champions", label: "All Champions", short: "Champions", icon: Library },
  { key: "matches", path: "/matches", label: "Match History", short: "History", icon: ScrollText },
  { key: "accounts", path: "/accounts", label: "Riot Accounts", short: "Accounts", icon: Link2 },
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

/**
 * Where Team → Matches → Encounters leads now that encounters belong to each profile: your own
 * Match History → Encounters, with the season, the game mode, the list (Frequent allies becomes
 * Alongside, Frequent opponents Against; Met by several members becomes All), the minimum, the
 * order and the search. Clash has no game mode of its own there: it stays among All supported games.
 */
export function encountersRedirect(sp: Record<string, string | string[] | undefined>): string {
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const q = new URLSearchParams();
  if (/^\d{1,3}$/.test(str("season"))) q.set("season", str("season"));
  if (["solo", "flex", "normal"].includes(str("queue"))) q.set("mode", str("queue"));
  q.set("view", "encounters");
  // The old list showed Frequent allies unless told otherwise; "Met by several members" is All, the
  // list's default now, so it needs no rel.
  const rel = str("rel");
  const relation = rel === "opponents" ? "against" : rel === "shared" ? "all" : "alongside";
  if (relation !== "all") q.set("rel", relation);
  for (const k of ["min", "sort", "q"] as const) if (str(k)) q.set(k, str(k));
  return `/overview/matches?${q.toString()}`;
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

/**
 * Resources: the team's library of League of Legends sites (news, statistics, builds, guides), for
 * every signed-in account. Administrators keep it in Admin Mode → Platform Settings → Resources.
 */
export const RESOURCES: NavLink = { href: "/resources", label: "Resources", icon: BookMarked };

/** Admin Mode's Platform Settings: the site's look, how its pages appear, and the Resources library (administrators only). */
export const ADMIN_SETTINGS_SECTIONS: NavLink[] = [
  { href: "/admin/branding", label: "Branding", icon: Paintbrush, permission: "manage-branding" },
  { href: "/admin/previews", label: "Previews", icon: MonitorSmartphone, permission: "manage-branding" },
  { href: "/admin/resources", label: "Resources", icon: BookMarked, permission: "manage-branding" },
];

/**
 * The sets of pages shown as tabs at the top of each of their pages (SectionTabs), one per
 * sidebar entry that stands for several pages. `label` names the tab bar for screen readers.
 */
export const SECTION_HUBS: Array<{ key: string; label: string; sections: NavLink[] }> = [
  { key: "team", label: "Team sections", sections: TEAM_SECTIONS },
  { key: "admin-settings", label: "Platform Settings sections", sections: ADMIN_SETTINGS_SECTIONS },
];

/** The pages of an entry, whatever its kind. */
export function entryLinks(entry: NavEntry): NavLink[] {
  return isNavHub(entry) ? entry.sections : [entry];
}

/**
 * Player View, as the sidebar shows it, in this order:
 *   My Profile     one link (marked on every profile section). Its sections are the bar under the
 *                  profile card, the one place they are listed, so the sidebar and the page no longer
 *                  repeat the same six links side by side; every section keeps its own address;
 *   Team           one entry for our own team (only for members of the team): it opens Team
 *                  Overview, the team's home page, and stays marked on all of its sections, which
 *                  are the tabs at the top of every Team page (TEAM_SECTIONS);
 *   Resources      the team's library of League of Legends sites.
 * The account menu holds Settings and Sign out only.
 */
export const NAV_ENTRIES: NavEntry[] = [
  { href: "/overview", label: "My Profile", icon: CircleUserRound },
  { key: "team", label: "Team", icon: Users, sections: TEAM_SECTIONS },
  RESOURCES,
];

/** Every Player Mode page in sidebar order (hubs flattened). */
export const NAV_LINKS: NavLink[] = NAV_ENTRIES.flatMap(entryLinks);

/** The account menu (your avatar): account settings only; profile pages live under My Profile. */
export const ACCOUNT_LINKS: NavLink[] = [{ href: "/settings", label: "Settings", icon: Settings }];

/** A destination of the phone tab bar. */
export interface PhoneTab {
  href: string;
  label: string;
  icon: LucideIcon;
}

/**
 * PHONES (below md) have no sidebar and no page tabs for Team: the bottom tab bar holds the places a
 * member goes to most, each one tap from anywhere, in this order:
 *   Team           the lineup (Team Overview), the team's home page;
 *   Players        everyone, and the way into a teammate's profile;
 *   Leaderboards   the team's comparisons;
 *   Matches        the games members played together;
 *   Profile        your own profile and its sections;
 *   Resources      when there is room (an account without the Team pages); otherwise in the account
 *                  sheet behind your avatar, with Settings and Sign out.
 * At most five, those this account may open (the pages check again). Tablets and desktops keep the
 * sidebar's three entries and the page tabs (TEAM_SECTIONS), so the two never disagree on names.
 */
export const PHONE_TABS: PhoneTab[] = [
  { href: "/team", label: "Team", icon: Users },
  { href: "/players", label: "Players", icon: UserCog },
  { href: "/leaderboards", label: "Leaderboards", icon: Medal },
  { href: "/matches", label: "Matches", icon: History },
  { href: "/overview", label: "Profile", icon: CircleUserRound },
  { href: "/resources", label: "Resources", icon: BookMarked },
];

/** The most destinations a phone tab bar holds: more would leave each too narrow for a thumb and its label. */
export const PHONE_TAB_LIMIT = 5;

/** The phone tab bar for an account: the destinations it may open, in PHONE_TABS order, at most PHONE_TAB_LIMIT. */
export function phoneTabs(allowed: readonly string[]): PhoneTab[] {
  return PHONE_TABS.filter((t) => allowed.includes(t.href)).slice(0, PHONE_TAB_LIMIT);
}

/**
 * The bottom tab a page belongs to: its own (the longest match, so a teammate's profile under
 * /players/… is Players and your own profile's sections are Profile), else the first tab of its
 * section set (Admin Mode's Platform Settings pages are its Settings tab), else none (Settings).
 */
export function currentTab(pathname: string, tabs: readonly string[]): string | null {
  const own = activeHref(pathname, tabs);
  if (own) return own;
  if (pathname === "/me" && tabs.includes("/overview")) return "/overview";
  const hub = SECTION_HUBS.find((h) => h.sections.some((l) => isActivePath(pathname, l.href)));
  return hub?.sections.map((l) => l.href).find((href) => tabs.includes(href)) ?? null;
}

/**
 * A profile's own address (its Overview) when the page is one of its sections: /overview for your
 * own, /players/[id] for a teammate's; null elsewhere. Phones show the profile's sections in the top
 * bar on these pages.
 */
export function profileBase(pathname: string): string | null {
  if (pathname === "/overview" || pathname.startsWith("/overview/")) return "/overview";
  const m = /^\/players\/([^/]+)(?:\/([^/]+))?$/.exec(pathname);
  if (!m) return null;
  const section = m[2] ?? "";
  return PROFILE_SECTIONS.some((s) => s.path === (section ? `/${section}` : "")) ? `/players/${m[1]}` : null;
}

/**
 * On a phone, where Back leads from a page opened with no page of this app before it (a link from
 * elsewhere, a reload, the installed app's start): the page above it, named for the button. A tab's
 * own pages and their sections have none: they are where you start.
 */
export function phoneParent(pathname: string, tabs: readonly PhoneTab[], home: string): { href: string; label: string } | null {
  const tabHrefs = tabs.map((t) => t.href);
  const homeLabel = tabs.find((t) => t.href === home)?.label ?? (home === ADMIN_HOME ? "Dashboard" : "Home");
  if (/^\/players\/[^/]+/.test(pathname)) return { href: "/players", label: "Players" };
  if (pathname === "/me") return { href: "/overview", label: "Profile" };
  if (pathname.startsWith("/admin")) {
    if (pathname === ADMIN_HOME || currentTab(pathname, tabHrefs)) return null;
    return { href: ADMIN_HOME, label: "Dashboard" };
  }
  if (currentTab(pathname, tabHrefs) || pathname === home) return null;
  if (pathname === "/no-access") return null;
  return { href: home, label: homeLabel };
}

/** Admin Mode's start page (its dashboard). It is current only on itself, not on the pages beneath it. */
export const ADMIN_HOME = "/admin";

/**
 * ADMIN MODE (administrators only; see src/app/(admin)): six entries and none of the player pages.
 *   Dashboard               the state of accounts, data and recent admin activity, at a glance;
 *   Users & Permissions     every account and its access, the access levels, and personal data
 *                           (privacy requests, erasure and its records): three tabs;
 *   Platform Settings       branding, the page previews and the Resources library (three tabs);
 *   Data & Integrations     Riot data: linked accounts, syncing and the Riot API;
 *   System Health           database, background jobs and the evidence behind each status;
 *   Audit Logs              who changed what, newest first.
 * The team's own pages (lineup, players, leaderboards, matches) are Player Mode's, where an
 * administrator manages them like any lineup manager. "Return to Player Mode" sits apart from these.
 */
export const ADMIN_ENTRIES: NavEntry[] = [
  { href: ADMIN_HOME, label: "Dashboard", icon: LayoutDashboard, anyOf: ["manage-users", "manage-branding", "manage-data"] },
  {
    key: "admin-users",
    label: "Users & Permissions",
    icon: UserCog,
    sections: [
      { href: "/admin/people", label: "Accounts", icon: UserPlus, permission: "manage-users" },
      { href: "/admin/people/access", label: "Access levels", icon: KeyRound, permission: "manage-users" },
      { href: "/admin/people/privacy", label: "Personal data", icon: Fingerprint, permission: "manage-users" },
    ],
  },
  { key: "admin-settings", label: "Platform Settings", icon: SlidersHorizontal, sections: ADMIN_SETTINGS_SECTIONS },
  { href: "/admin/data", label: "Data & Integrations", icon: Database, permission: "manage-data" },
  { href: "/admin/system", label: "System Health", icon: Activity, permission: "manage-data" },
  { href: "/admin/audit", label: "Audit Logs", icon: ClipboardList, anyOf: ["manage-users", "manage-branding", "manage-data"] },
];

/** Every Admin Mode page in sidebar order (hubs flattened). */
export const ADMIN_LINKS: NavLink[] = ADMIN_ENTRIES.flatMap(entryLinks);

/** Phone bottom tabs in Admin Mode, with short labels (the rest are in the menu). */
export const ADMIN_TABS: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: ADMIN_HOME, label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/people", label: "Users", icon: UserCog },
  { href: "/admin/branding", label: "Settings", icon: SlidersHorizontal },
  { href: "/admin/system", label: "Health", icon: Activity },
];

/**
 * Admin Mode's pages in the phone account panel: one link per entry, as the drawer lists them (a
 * hub's link opens its first section this account may open, under the hub's name), less the pages
 * the tab bar already holds, so the sheet repeats nothing that is one tap away (as Player Mode's
 * sheet holds Resources only when it has no tab).
 */
export function adminSheetLinks(allowed: readonly string[], tabHrefs: readonly string[]): NavLink[] {
  return ADMIN_ENTRIES.flatMap((entry): NavLink[] => {
    if (isNavHub(entry)) {
      const first = entry.sections.find((l) => allowed.includes(l.href));
      return first && !tabHrefs.includes(first.href) ? [{ href: first.href, label: entry.label, icon: entry.icon }] : [];
    }
    return allowed.includes(entry.href) && !tabHrefs.includes(entry.href) ? [entry] : [];
  });
}

/** Account settings in Admin Mode: the same page as Player Mode's, without leaving Admin Mode. */
export const ADMIN_ACCOUNT_LINKS: NavLink[] = [{ href: "/admin/settings", label: "Settings", icon: Settings }];

/** May this session open the link? (Pages enforce the same rule on the server.) */
export function canOpen(session: Session | null, link: Pick<NavLink, "permission" | "anyOf">): boolean {
  if (link.permission && !hasPermission(session, link.permission)) return false;
  if (link.anyOf && !link.anyOf.some((p) => hasPermission(session, p))) return false;
  return true;
}

export function isActivePath(pathname: string, href: string): boolean {
  // The dashboard is Admin Mode's root: every admin page starts with its address, so it is the
  // current page only on itself.
  if (href === ADMIN_HOME) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The one link of a list that the page belongs to: the longest matching href, so
 * /overview/matches marks "Match History" and not also "Overview" (/overview).
 */
export function activeHref(pathname: string, hrefs: readonly string[]): string | null {
  return hrefs.filter((h) => isActivePath(pathname, h)).sort((a, b) => b.length - a.length)[0] ?? null;
}

