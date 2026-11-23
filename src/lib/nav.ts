import { BookMarked, Fingerprint, Medal, Users, UserCog, Settings, History, UserPlus, Database, Paintbrush, Activity, LayoutGrid, LayoutDashboard, CircleUserRound, Gauge, Library, ScrollText, Link2, KeyRound, MonitorSmartphone, SlidersHorizontal, ClipboardList, ScanSearch, ServerCog, type LucideIcon } from "lucide-react";
import { hasPermission, type Permission, type Session } from "@/server/auth/permissions";

export interface NavLink {
  href: string;
  label: string;
  /**
   * A shorter name for the bars where the full one does not fit (the label ladder: the full name,
   * then this one with the rest of the full name read out, then the icon alone; mobile-nav.tsx). The
   * full name starts or ends with it ("Champion Lookup": "Lookup"), so what shows is always part of
   * what is read out.
   */
  short?: string;
  icon: LucideIcon;
  /** Shown only to accounts holding this permission (checked again on the page itself). */
  permission?: Permission;
  /** Any one of these permissions is enough. */
  anyOf?: Permission[];
  /** A section's own page width (PAGE_WIDTH), where it is not its set's: what its loading state takes (pageWidthOf). */
  width?: PageWidth;
}

/**
 * One sidebar entry that stands for a set of pages with their own tabs (Team, Users & Permissions,
 * Platform Settings): it opens the first page this account may use and stays marked on every one
 * of them.
 */
export interface NavHub {
  key: string;
  label: string;
  /** A shorter name for the bars (NavLink's `short`). */
  short?: string;
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
 * CHAMPION LOOKUP, a destination of its own (the owner's request of 23 Nov 2026, in Matchup Intel's
 * place), for every signed-in account: choose any champion and read its abilities, base cooldowns
 * and those cooldowns at an ability haste (docs/CHAMPION_LOOKUP.md), at /lookup?champion=<id>&haste=<n>.
 * Matchup Intel's address, /resources/matchups with any of its parameters, leads here (its page
 * redirects, carrying one champion). Not the personal Matchups (a player's own games against an
 * opponent), which live in a champion's window. Where a bar has no room for its whole name it shows
 * "Lookup", the end of it (the label ladder), and is read out in full.
 */
export const CHAMPION_LOOKUP: NavLink = { href: "/lookup", label: "Champion Lookup", short: "Lookup", icon: ScanSearch };

/**
 * RESOURCES, a destination of its own, for every signed-in account: the Library, the team's library
 * of League of Legends sites (news, statistics, builds, guides), kept by administrators in Admin
 * Mode → Platform Settings → Resources. One page, so no tabs.
 */
export const RESOURCES: NavLink = { href: "/resources", label: "Resources", icon: BookMarked };

/** Admin Mode's Users & Permissions: every account and its access, the access levels and groups, and personal data (privacy requests, erasure and its records). */
export const ADMIN_USERS_SECTIONS: NavLink[] = [
  { href: "/admin/people", label: "Accounts", icon: UserPlus, permission: "manage-users" },
  { href: "/admin/people/access", label: "Access levels", icon: KeyRound, permission: "manage-users" },
  { href: "/admin/people/privacy", label: "Personal data", icon: Fingerprint, permission: "manage-users" },
];

/** Admin Mode's Platform Settings: the site's look, how its pages appear, and the Resources library (administrators only). */
export const ADMIN_SETTINGS_SECTIONS: NavLink[] = [
  { href: "/admin/branding", label: "Branding", icon: Paintbrush, permission: "manage-branding" },
  { href: "/admin/previews", label: "Previews", icon: MonitorSmartphone, permission: "manage-branding" },
  { href: "/admin/resources", label: "Resources", icon: BookMarked, permission: "manage-branding" },
];

/**
 * Admin Mode's System (19 Nov 2026, navigation N1): the platform's own state, its three pages at the
 * addresses they always had: Health (database, background jobs and the evidence behind each status),
 * Data & Integrations (Riot data: linked accounts, syncing and the Riot API) and Audit Logs (who
 * changed what, newest first).
 */
export const ADMIN_SYSTEM_SECTIONS: NavLink[] = [
  { href: "/admin/system", label: "Health", icon: Activity, permission: "manage-data" },
  { href: "/admin/data", label: "Data & Integrations", icon: Database, permission: "manage-data" },
  { href: "/admin/audit", label: "Audit Logs", icon: ClipboardList, anyOf: ["manage-users", "manage-branding", "manage-data"] },
];

/**
 * The page widths (globals.css; docs/STANDARDS.md → Page layout), as the class a page's column takes:
 * `max` (--content-max, 80rem) for profiles, lists of cards, documents and forms; `wide`
 * (--content-wide, 100rem) for Team's four sections (Overview, Players, Leaderboards, Matches), which
 * share it so their tabs line up with each of them. Every page's column is centred in the room
 * beside the sidebar (app-shell.tsx, FRAME; 23 Nov 2026), so a width is all a page chooses.
 */
export const PAGE_WIDTH = {
  max: "max-w-[var(--content-max)]",
  wide: "max-w-[var(--content-wide)]",
} as const;
export type PageWidth = keyof typeof PAGE_WIDTH;

/**
 * A set's row of tabs (TabBar's `inner`): the set's one width, centred in the bar as its pages are
 * centred in the room beside the sidebar (app-shell.tsx, FRAME), so the first tab starts where every
 * page of the set starts, at any window size. Where the room is narrower than the width, the row is
 * the bar's width, as the pages are the room's.
 */
export const ROW_WIDTH: Record<"max" | "wide", string> = {
  max: "max-w-[var(--content-max)]",
  wide: "max-w-[var(--content-wide)]",
};

/**
 * The sets of pages shown as tabs at the top of each of their pages, one per entry that stands for
 * several pages (every NavHub of both modes, in their order): on tablets and desktops a row of tabs
 * in the page (SectionTabs), on phones the top bar's second row (MobileNav), so they stay in reach
 * however far the page scrolls. `label` names the row for screen readers. `width`: the one width
 * every page of the set takes, so the tabs start and end where each page does and never move between
 * them (the bar's row: ROW_WIDTH), at every window size (23 Nov 2026; until then only from a 1600px
 * window, Players and Matches staying 80rem under it).
 */
export const SECTION_HUBS: Array<{ key: string; label: string; width: "max" | "wide"; sections: NavLink[] }> = [
  { key: "team", label: "Team sections", width: "wide", sections: TEAM_SECTIONS },
  { key: "admin-users", label: "Users & Permissions sections", width: "max", sections: ADMIN_USERS_SECTIONS },
  { key: "admin-settings", label: "Platform Settings sections", width: "max", sections: ADMIN_SETTINGS_SECTIONS },
  { key: "admin-system", label: "System sections", width: "max", sections: ADMIN_SYSTEM_SECTIONS },
];

/** The set of tabs a page is one of (its address exactly), or none. */
export function sectionHubOf(pathname: string): (typeof SECTION_HUBS)[number] | null {
  return SECTION_HUBS.find((h) => h.sections.some((s) => s.href === pathname)) ?? null;
}

/**
 * The width of the page at `pathname`, for its loading state: a section's own width, else its set's,
 * else the ordinary 80rem. Narrower pages outside the sets (Settings, 48rem) are not told apart.
 */
export function pageWidthOf(pathname: string): PageWidth {
  for (const hub of SECTION_HUBS) {
    const section = hub.sections.find((s) => s.href === pathname);
    if (section) return section.width ?? hub.width;
  }
  return "max";
}

/** The pages of an entry, whatever its kind. */
export function entryLinks(entry: NavEntry): NavLink[] {
  return isNavHub(entry) ? entry.sections : [entry];
}

/**
 * Player Mode, in this order, the same four everywhere (navigation N1, 19 Nov 2026): the desktop's
 * sidebar, a tablet's top bar, a phone's bottom bar and its compact bar held sideways, and the
 * installed app's shortcuts (MANIFEST_SHORTCUTS):
 *   My Profile     one link (marked on every profile section of your own). Its sections are the bar
 *                  under the profile card (on phones the top bar's second row), the one place they
 *                  are listed; every section keeps its own address. "Profile" where a bar has no room;
 *   Team           one entry for our own team (only for members of the team): Team Overview, the
 *                  team's home page, first, and marked on all of its sections, which are the tabs at
 *                  the top of every Team page (TEAM_SECTIONS; on phones the top bar's second row);
 *   Champion Lookup one link (CHAMPION_LOOKUP), marked on its page whatever champion the address holds;
 *   Resources      one link (RESOURCES), the Library, marked on it alone.
 * The account's own items (Settings, Install App, the switch between the modes, Sign out, the patch
 * and Riot's notice) are never destinations: the sidebar's footer, a tablet's avatar menu, a phone's
 * account screen.
 */
export const NAV_ENTRIES: NavEntry[] = [
  { href: "/overview", label: "My Profile", short: "Profile", icon: CircleUserRound },
  { key: "team", label: "Team", icon: Users, sections: TEAM_SECTIONS },
  CHAMPION_LOOKUP,
  RESOURCES,
];

/** Every Player Mode page in sidebar order (hubs flattened). */
export const NAV_LINKS: NavLink[] = NAV_ENTRIES.flatMap(entryLinks);

/** The account menu (your avatar): account settings only; profile pages live under My Profile. */
export const ACCOUNT_LINKS: NavLink[] = [{ href: "/settings", label: "Settings", icon: Settings }];

/**
 * The installed app's shortcuts (the icon's menu: a long press on Android, a right-click on the
 * Windows taskbar or Start), read from Player Mode's entries so they cannot drift from the bars: the
 * same four, in the same order, under the same names, each to the entry's first page (Team to Team
 * Overview). Each page still checks who may open it.
 */
export const MANIFEST_SHORTCUTS: ReadonlyArray<{ name: string; url: string; icon: string }> = NAV_ENTRIES.map((e) => ({ name: e.label, url: entryLinks(e)[0]!.href, icon: shortcutIcon(e.icon) }));

/**
 * A shortcut's icon: the destination's own icon from the bars, as a 96×96 PNG named after the lucide
 * icon (public/icons/shortcuts, drawn by scripts/shortcut-icons.mjs; nav-parity.test.ts fails while
 * one is missing). "CircleUserRound" is circle-user-round.png.
 */
export function shortcutIcon(icon: { displayName?: string }): string {
  const name = (icon.displayName ?? "").replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
  return `/icons/shortcuts/${name}.png`;
}

/** Admin Mode's start page (its dashboard). It is current only on itself, not on the pages beneath it. */
export const ADMIN_HOME = "/admin";

/**
 * ADMIN MODE (administrators only; see src/app/(admin)), the same four on every screen (navigation
 * N1, 19 Nov 2026), and none of the player pages:
 *   Dashboard               the state of accounts, data and recent admin activity, at a glance;
 *   Users & Permissions     every account and its access, the access levels, and personal data
 *                           (three tabs); "Users" where a bar has no room;
 *   Platform Settings       branding, the page previews and the Resources library (three tabs);
 *                           "Platform" where a bar has no room, so a phone never shows two
 *                           "Settings" (the account's own is on the account screen);
 *   System                  Health, Data & Integrations and Audit Logs (three tabs).
 * The team's own pages (lineup, players, leaderboards, matches) are Player Mode's, where an
 * administrator manages them like any lineup manager. "Return to Player Mode" sits apart from these.
 */
export const ADMIN_ENTRIES: NavEntry[] = [
  { href: ADMIN_HOME, label: "Dashboard", icon: LayoutDashboard, anyOf: ["manage-users", "manage-branding", "manage-data"] },
  { key: "admin-users", label: "Users & Permissions", short: "Users", icon: UserCog, sections: ADMIN_USERS_SECTIONS },
  { key: "admin-settings", label: "Platform Settings", short: "Platform", icon: SlidersHorizontal, sections: ADMIN_SETTINGS_SECTIONS },
  { key: "admin-system", label: "System", icon: ServerCog, sections: ADMIN_SYSTEM_SECTIONS },
];

/** Every Admin Mode page in sidebar order (hubs flattened). */
export const ADMIN_LINKS: NavLink[] = ADMIN_ENTRIES.flatMap(entryLinks);

/** Account settings in Admin Mode: the same page as Player Mode's, without leaving Admin Mode. */
export const ADMIN_ACCOUNT_LINKS: NavLink[] = [{ href: "/admin/settings", label: "Settings", icon: Settings }];

/**
 * A destination, as every bar shows it: one entry of the mode (NAV_ENTRIES, ADMIN_ENTRIES), leading
 * to the first of its pages this account may open, and marked on all of them (`pages`). `hub` is the
 * set of tabs it stands for (SECTION_HUBS), if it is one.
 */
export interface Destination {
  key: string;
  href: string;
  label: string;
  short?: string;
  icon: LucideIcon;
  pages: string[];
  hub?: string;
}

/**
 * The destinations of a mode for an account: its entries in order, each with the pages of it this
 * account may open (`allowed`, decided by the server; the pages check again), leaving out an entry
 * it may open none of. The one list every bar draws (the sidebar, a tablet's top bar, a phone's bar
 * either way round), so they never disagree on names, icons or order (nav-parity.test.ts).
 */
export function destinations(allowed: readonly string[], admin: boolean): Destination[] {
  return (admin ? ADMIN_ENTRIES : NAV_ENTRIES).flatMap((entry): Destination[] => {
    const pages = entryLinks(entry)
      .filter((l) => allowed.includes(l.href))
      .map((l) => l.href);
    if (!pages.length) return [];
    const hub = isNavHub(entry);
    return [{ key: hub ? entry.key : entry.href, href: pages[0]!, label: entry.label, ...(entry.short ? { short: entry.short } : {}), icon: entry.icon, pages, ...(hub ? { hub: entry.key } : {}) }];
  });
}

/**
 * The destination a page belongs to: the one holding the longest matching page (a teammate's profile
 * under /players/… is Team's, your own profile's sections My Profile's, Champion Lookup its own
 * whatever champion its address holds; every admin page its entry's); none for Settings
 * and the few pages outside them. /me, which leads to your own profile, is My Profile's.
 */
export function currentDestination(pathname: string, list: readonly Destination[]): Destination | null {
  const path = pathname === "/me" ? "/overview" : pathname;
  const page = activeHref(path, list.flatMap((d) => d.pages));
  return page === null ? null : (list.find((d) => d.pages.includes(page)) ?? null);
}

/**
 * Where a phone's destinations lead, with the section each set of tabs was last left on (`memory`,
 * by hub; the iOS per-tab pattern): a destination that stands for a set of tabs reopens the one last
 * used in this tab of the browser, while it is not the current destination; tapped again while it
 * is, it leads to its first section (Team: Overview). A remembered page this account may no longer
 * open is ignored.
 */
export function withSectionMemory(list: readonly Destination[], pathname: string, memory: Readonly<Record<string, string>> | null): Destination[] {
  if (!memory) return [...list];
  const current = currentDestination(pathname, list);
  return list.map((d) => {
    if (!d.hub || d === current) return d;
    const last = memory[d.hub];
    return last && last !== d.href && d.pages.includes(last) ? { ...d, href: last } : d;
  });
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
 * Whether the frame's link to `href` may be fetched ahead of a tap (Next's prefetch on viewport and
 * on intent): never for a profile, yours or a teammate's, any section of it (its layout starts the
 * refresh of the player's Riot accounts, so a prefetch of My Profile on every page synced your own
 * accounts: docs/HOSTING_USAGE.md, "Prefetches start Riot syncs"); the default otherwise. Next's Link
 * takes `false` as "never" and `undefined` as its default.
 */
export function prefetchOf(href: string): false | undefined {
  return profileBase(href.split(/[?#]/)[0]!) ? false : undefined;
}

/**
 * On a phone, where Back leads from a page opened with no page of this app before it (a link from
 * elsewhere, a reload, the installed app's start): the page above it, named for the button. Every
 * destination's own pages (Team's sections, your profile's, Champion Lookup, Resources, every admin
 * page under its entry) have none: they are where you start, so no page claims Team as its parent
 * unless it is under Team (a teammate's profile, under Players). Settings, which is not a
 * destination, leads home (Back named after the page before goes there instead, when it is known:
 * MobileNav's useBack).
 */
export function phoneParent(pathname: string, list: readonly Destination[], home: string): { href: string; label: string } | null {
  if (/^\/players\/[^/]+/.test(pathname)) return { href: "/players", label: "Players" };
  if (pathname === "/no-access" || pathname === home || currentDestination(pathname, list)) return null;
  if (pathname.startsWith("/admin")) return { href: ADMIN_HOME, label: "Dashboard" };
  const label = home === ADMIN_HOME ? "Dashboard" : (currentDestination(home, list)?.label ?? "Home");
  return { href: home, label };
}

/**
 * The name of the page a path opens, for a phone's Back when that page's heading was never read: a
 * page with a name of its own (Champion Lookup), else a section by its tab's name (Players,
 * Leaderboards; a set's first section by its destination's: Team for Team Overview), else its
 * destination's, else the few pages outside them by name; "Back" for anything else.
 */
export function pageName(path: string, list: readonly Destination[]): string {
  if (path === CHAMPION_LOOKUP.href) return CHAMPION_LOOKUP.label;
  for (const hub of SECTION_HUBS) {
    const section = activeHref(path, hub.sections.map((s) => s.href));
    if (!section) continue;
    if (section !== hub.sections[0]!.href) return hub.sections.find((s) => s.href === section)!.label;
    const entry = [...NAV_ENTRIES, ...ADMIN_ENTRIES].find((e) => isNavHub(e) && e.key === hub.key);
    return entry?.label ?? "Back";
  }
  const destination = currentDestination(path, list);
  if (destination) return destination.label;
  if (path.startsWith("/settings") || path === "/admin/settings") return "Settings";
  return "Back";
}

/** Two paths that are one place for a phone's Back: the same page, or two sections of one profile (which share a visit). */
function samePlace(a: string, b: string): boolean {
  if (a === b) return true;
  const base = profileBase(a);
  return base !== null && base === profileBase(b);
}

/**
 * How far back, in this tab's history, the page a phone's Back is named after lies: the steps to
 * give history.go (negative), past the entries the current page made of itself (a window's own
 * entry, which Back closes). Null when the history does not show that page there: the entry
 * before those is another page, or an entry's address is not known. `entries` are the tab's history
 * in order (the Navigation API's), `index` the current one's place in them.
 */
export function backSteps(entries: ReadonlyArray<{ url: string | null }>, index: number, path: string, target: string): number | null {
  if (index < 1 || index >= entries.length) return null;
  for (let i = index - 1; i >= 0; i--) {
    const url = entries[i]!.url;
    if (!url) return null;
    let at: string;
    try {
      at = new URL(url).pathname;
    } catch {
      return null;
    }
    if (samePlace(at, path)) continue;
    return at === target ? i - index : null;
  }
  return null;
}

/**
 * Whether this browser shows the page its own history (the Navigation API), which backSteps needs to
 * step a phone's Back past the entries a page made of itself. Where it does not (Safari before 26.2,
 * Firefox before 147), such a page replaces its entry instead of adding one: otherwise the Back named
 * after the page before would step back through each of them, one tap at a time, under that name.
 */
export function historyShowsEntries(): boolean {
  return typeof window !== "undefined" && !!(window as unknown as { navigation?: { currentEntry?: unknown } }).navigation?.currentEntry;
}

/** May this session open the link? (Pages enforce the same rule on the server.) */
export function canOpen(session: Session | null, link: Pick<NavLink, "permission" | "anyOf">): boolean {
  if (link.permission && !hasPermission(session, link.permission)) return false;
  if (link.anyOf && !link.anyOf.some((p) => hasPermission(session, p))) return false;
  return true;
}

export function isActivePath(pathname: string, href: string): boolean {
  // The dashboard is Admin Mode's root: every admin page starts with its address, so it is the
  // current page only on itself. Resources is the Library alone: Matchup Intel's old address under
  // it (/resources/matchups) only redirects to Champion Lookup, so Resources is the current page
  // only on itself too.
  if (href === ADMIN_HOME || href === RESOURCES.href) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The one link of a list that the page belongs to: the longest matching href, so
 * /overview/matches marks "Match History" and not also "Overview" (/overview).
 */
export function activeHref(pathname: string, hrefs: readonly string[]): string | null {
  return hrefs.filter((h) => isActivePath(pathname, h)).sort((a, b) => b.length - a.length)[0] ?? null;
}
