import { describe, expect, it } from "vitest";
import { ADMIN_ACCOUNT_LINKS, ADMIN_ENTRIES, ADMIN_HOME, ADMIN_LINKS, ADMIN_TABS, NAV_ENTRIES, NAV_LINKS, PAGE_WIDTH, PHONE_TABS, ROW_WIDTH, PHONE_TAB_LIMIT, RESOURCES, RESOURCES_SECTIONS, SECTION_HUBS, TEAM_SECTIONS, activeHref, adminSheetLinks, backSteps, canOpen, currentDestination, currentTab, encountersRedirect, entryLinks, isActivePath, pageName, pageWidthOf, phoneParent, phoneTabs, profileBase, tabletDestinations } from "./nav";
import type { Session } from "@/server/auth/permissions";

const entryId = (e: (typeof NAV_ENTRIES)[number]) => ("key" in e ? e.key : e.href);

describe("navigation entries", () => {
  it("Player Mode has single entries only: My Profile, Team, then Resources", () => {
    expect(NAV_ENTRIES.map(entryId)).toEqual(["/overview", "team", "resources"]);
  });

  it("Resources is for every signed-in account, and is managed in Admin Mode's Platform Settings", () => {
    expect(NAV_LINKS.find((l) => l.href === "/resources")).toMatchObject({ label: "Library" });
    expect(NAV_LINKS.find((l) => l.href === "/resources")).not.toHaveProperty("permission");
    expect(SECTION_HUBS.find((h) => h.key === "admin-settings")!.sections.map((s) => s.href)).toEqual(["/admin/branding", "/admin/previews", "/admin/resources"]);
    expect(ADMIN_LINKS.find((l) => l.href === "/admin/resources")).toMatchObject({ permission: "manage-branding" });
  });


  it("Admin Mode has its six sections, in order, and none of the player pages", () => {
    expect(ADMIN_ENTRIES.map((e) => e.label)).toEqual(["Dashboard", "Users & Permissions", "Platform Settings", "Data & Integrations", "System Health", "Audit Logs"]);
    expect(ADMIN_LINKS.every((l) => l.href.startsWith("/admin"))).toBe(true);
    expect(ADMIN_LINKS.map((l) => l.href)).not.toContain("/team");
    expect(NAV_LINKS.some((l) => l.href.startsWith("/admin"))).toBe(false);
    expect(ADMIN_TABS.every((t) => ADMIN_LINKS.some((l) => l.href === t.href))).toBe(true);
  });

  it("every admin page needs an administrator permission, so a player can open none of them", () => {
    const player: Session = { userId: "u", role: "player", label: "P", playerId: "p", username: "p", hasPassword: true, mustChangePassword: false, setupComplete: true, capabilities: ["view-team", "view-players", "view-teammate-stats", "view-matches", "manage-lineup", "manage-players", "manage-matches"] };
    expect(ADMIN_LINKS.filter((l) => canOpen(player, l)).map((l) => l.href)).toEqual([]);
    expect(ADMIN_LINKS.filter((l) => !canOpen({ ...player, admin: true }, l)).map((l) => l.href)).toEqual([]);
  });

  it("the dashboard is current only on itself, not on the admin pages beneath it", () => {
    expect(isActivePath(ADMIN_HOME, ADMIN_HOME)).toBe(true);
    expect(isActivePath("/admin/people", ADMIN_HOME)).toBe(false);
    expect(activeHref("/admin/people/access", ADMIN_LINKS.map((l) => l.href))).toBe("/admin/people/access");
    expect(activeHref("/admin/settings", ADMIN_LINKS.map((l) => l.href))).toBeNull();
  });

  it("no navigation anywhere leads to the removed Meta & Trends or Clash Scout pages", () => {
    const hrefs = [...NAV_LINKS, ...ADMIN_ENTRIES.flatMap(entryLinks), ...SECTION_HUBS.flatMap((h) => h.sections), ...ADMIN_TABS, ...PHONE_TABS].map((l) => l.href);
    expect(hrefs.filter((h) => h.startsWith("/trends") || h.startsWith("/clash"))).toEqual([]);
    expect(SECTION_HUBS.map((h) => h.key)).toEqual(["team", "resources", "admin-settings"]);
  });

  it("Resources is one entry for its two sections, the library and Matchup Intel, which every account may open", () => {
    const hub = NAV_ENTRIES.find((e) => entryId(e) === "resources")!;
    expect(hub).toMatchObject({ label: "Resources", icon: RESOURCES.icon });
    // The library first: the entry opens it, and the account screen's Resources row leads there.
    expect(entryLinks(hub).map((l) => [l.href, l.label])).toEqual([
      ["/resources", "Library"],
      ["/resources/matchups", "Matchup Intel"],
    ]);
    expect(RESOURCES).toMatchObject({ href: "/resources", label: "Resources" });
    // Both are tabs at the top of both pages, and nowhere else.
    expect(SECTION_HUBS.find((h) => h.key === "resources")!.sections).toBe(RESOURCES_SECTIONS);
    const stranger: Session = { userId: "u", role: "player", label: "P", playerId: null, username: "p", hasPassword: true, mustChangePassword: false, setupComplete: true, capabilities: [] };
    expect(RESOURCES_SECTIONS.every((l) => canOpen(stranger, l))).toBe(true);
    // Matchup Intel is the static reference, kept apart by name from a champion's own Matchups.
    expect(NAV_LINKS.filter((l) => /matchups/i.test(l.href)).map((l) => l.label)).toEqual(["Matchup Intel"]);
  });

  it("every hub section belongs to exactly one tab bar", () => {
    const hrefs = SECTION_HUBS.flatMap((h) => h.sections.map((s) => s.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("from a 1600px window the pages of a tab bar share one width (Team's the wide one), and under it every page keeps the width it always had", () => {
    expect(SECTION_HUBS.map((h) => [h.key, h.width])).toEqual([
      ["team", "wide"],
      ["resources", "max"],
      ["admin-settings", "max"],
    ]);
    // Team Overview and Leaderboards were always 100rem; Players and Matches join them from 1600px.
    expect(TEAM_SECTIONS.map((s) => pageWidthOf(s.href))).toEqual(["wide", "wideFrom1600", "wide", "wideFrom1600"]);
    // A teammate's profile sits under Players' address, in the profile's own (ordinary) width.
    for (const path of ["/players/p1", "/players/p1/matches", "/resources", "/resources/matchups", "/admin/branding", "/settings", "/overview"]) expect(pageWidthOf(path), path).toBe("max");
    expect(PAGE_WIDTH).toEqual({ max: "max-w-[var(--content-max)]", wide: "max-w-[var(--content-wide)]", wideFrom1600: "max-w-[var(--content-max)] min-[100rem]:max-w-[var(--content-wide)]" });
    // The row of tabs is the bar's width under 1600px, as it always was, and the set's width from there.
    expect(ROW_WIDTH).toEqual({ max: "min-[100rem]:max-w-[var(--content-max)]", wide: "min-[100rem]:max-w-[var(--content-wide)]" });
  });
});

describe("phone tab bar", () => {
  // A team member may open every Player Mode page.
  const member = phoneTabs(NAV_LINKS.map((l) => l.href));
  // An account outside the team: its profile and Resources only.
  const personal = phoneTabs(["/overview", "/resources", "/settings"]);
  const hrefs = (tabs: typeof member) => tabs.map((t) => t.href);

  it("a team member's bar: Team, Players, Leaderboards, Matches and Profile, one tap each; Resources moves to the account screen", () => {
    expect(hrefs(member)).toEqual(["/team", "/players", "/leaderboards", "/matches", "/overview"]);
    expect(member).toHaveLength(PHONE_TAB_LIMIT);
    expect(hrefs(personal)).toEqual(["/overview", "/resources"]);
  });

  it("offers only pages the account may open", () => {
    expect(hrefs(phoneTabs(["/team", "/overview", "/resources"]))).toEqual(["/team", "/overview", "/resources"]);
  });

  it("uses the same names and icons as the sidebar and the Team tabs", () => {
    for (const tab of PHONE_TABS) {
      const team = TEAM_SECTIONS.find((s) => s.href === tab.href);
      if (team && tab.href !== "/team") {
        expect(tab.label, tab.href).toBe(team.label);
        expect(tab.icon, tab.href).toBe(team.icon);
      }
      const entry = NAV_ENTRIES.find((e) => ("sections" in e ? e.sections[0]!.href : e.href) === tab.href);
      if (entry) expect(tab.icon, tab.href).toBe(entry.icon);
    }
  });

  it("marks a page's own tab: a teammate's profile is under Players, your own profile's sections under Profile", () => {
    const m = hrefs(member);
    expect(currentTab("/players", m)).toBe("/players");
    expect(currentTab("/players/abc/matches", m)).toBe("/players");
    expect(currentTab("/leaderboards", m)).toBe("/leaderboards");
    expect(currentTab("/matches", m)).toBe("/matches");
    expect(currentTab("/overview/champions", m)).toBe("/overview");
    expect(currentTab("/me", m)).toBe("/overview");
    expect(currentTab("/resources", hrefs(personal))).toBe("/resources");
    // Matchup Intel is Resources' second section: its tab where Resources has one, none where it has not.
    expect(currentTab("/resources/matchups", hrefs(personal))).toBe("/resources");
    expect(currentTab("/resources/matchups", m)).toBeNull();
  });

  it("Admin Mode's Platform Settings pages are its Settings tab", () => {
    const admin = ADMIN_TABS.map((t) => t.href);
    expect(currentTab("/admin/previews", admin)).toBe("/admin/branding");
    expect(currentTab("/admin/people/access", admin)).toBe("/admin/people");
  });

  it("marks nothing outside the tabs and hubs; no Draft, Meta or Clash Scout anywhere", () => {
    const m = hrefs(member);
    expect(currentTab("/settings", m)).toBeNull();
    expect(currentTab("/resources", m)).toBeNull();
    expect(currentTab("/clash", m)).toBeNull();
    expect(currentTab("/draft", m)).toBeNull();
    expect(currentTab("/trends/solo", m)).toBeNull();
    expect(ADMIN_TABS.map((t) => t.href)).not.toContain("/draft");
  });
});

describe("tablet top bar", () => {
  const all = NAV_LINKS.map((l) => l.href);
  const adminAll = ADMIN_LINKS.map((l) => l.href);

  it("Player Mode: the sidebar's three entries, one tap each, a hub's to its first page this account may open", () => {
    const bar = tabletDestinations(all, false);
    expect(bar.map((d) => [d.href, d.label])).toEqual([
      ["/overview", "My Profile"],
      ["/team", "Team"],
      ["/resources", "Resources"],
    ]);
    // The same icons as the sidebar's entries.
    expect(bar.map((d) => d.icon)).toEqual(NAV_ENTRIES.map((e) => e.icon));
    // Team stands for its four sections, Resources for its two.
    expect(bar[1]!.pages).toEqual(TEAM_SECTIONS.map((s) => s.href));
    expect(bar[2]!.pages).toEqual(RESOURCES_SECTIONS.map((s) => s.href));
    // An account outside the team: no Team entry; one that may open only Players: Team leads there.
    expect(tabletDestinations(["/overview", "/resources", "/resources/matchups"], false).map((d) => d.href)).toEqual(["/overview", "/resources"]);
    expect(tabletDestinations(["/overview", "/players", "/resources"], false).map((d) => d.href)).toEqual(["/overview", "/players", "/resources"]);
  });

  it("Admin Mode: the phone's four tabs, Platform Settings by its full name, and the pages without a tab (for the avatar menu) are Data & Integrations and Audit Logs", () => {
    const bar = tabletDestinations(adminAll, true);
    expect(bar.map((d) => d.href)).toEqual(ADMIN_TABS.map((t) => t.href));
    // Never two "Settings" side by side: the avatar menu under the bar holds the account's own.
    expect(bar.map((d) => d.label)).toEqual(["Dashboard", "Users", "Platform Settings", "Health"]);
    expect(bar.map((d) => d.label)).not.toContain(ADMIN_ACCOUNT_LINKS[0]!.label);
    expect(adminSheetLinks(adminAll, bar.map((d) => d.href)).map((l) => l.label)).toEqual(["Data & Integrations", "Audit Logs"]);
    // Only what the account may open.
    expect(tabletDestinations([ADMIN_HOME, "/admin/system"], true).map((d) => d.href)).toEqual([ADMIN_HOME, "/admin/system"]);
  });

  it("marks the destination a page belongs to, as the sidebar and the tabs do; none for Settings", () => {
    const bar = tabletDestinations(all, false);
    expect(currentDestination("/team", bar, false)).toBe("/team");
    expect(currentDestination("/matches", bar, false)).toBe("/team");
    expect(currentDestination("/players/abc/matches", bar, false)).toBe("/team");
    expect(currentDestination("/overview/champions", bar, false)).toBe("/overview");
    expect(currentDestination("/resources/matchups", bar, false)).toBe("/resources");
    expect(currentDestination("/settings", bar, false)).toBeNull();
    const admin = tabletDestinations(adminAll, true);
    expect(currentDestination("/admin", admin, true)).toBe(ADMIN_HOME);
    expect(currentDestination("/admin/previews", admin, true)).toBe("/admin/branding");
    expect(currentDestination("/admin/people/access", admin, true)).toBe("/admin/people");
    expect(currentDestination("/admin/data", admin, true)).toBeNull();
  });
});

describe("phone top bar", () => {
  const member = phoneTabs(NAV_LINKS.map((l) => l.href));

  it("knows a profile's sections, yours and a teammate's", () => {
    expect(profileBase("/overview")).toBe("/overview");
    expect(profileBase("/overview/matches")).toBe("/overview");
    expect(profileBase("/players/abc")).toBe("/players/abc");
    expect(profileBase("/players/abc/accounts")).toBe("/players/abc");
    expect(profileBase("/players")).toBeNull();
    expect(profileBase("/players/abc/edit")).toBeNull();
    expect(profileBase("/team")).toBeNull();
  });

  it("Back from a page opened directly leads to the page above it; a tab's pages have no Back", () => {
    expect(phoneParent("/players/abc", member, "/team")).toEqual({ href: "/players", label: "Players" });
    expect(phoneParent("/players/abc/matches", member, "/team")).toEqual({ href: "/players", label: "Players" });
    expect(phoneParent("/settings", member, "/team")).toEqual({ href: "/team", label: "Team" });
    expect(phoneParent("/resources", member, "/team")).toEqual({ href: "/team", label: "Team" });
    expect(phoneParent("/me", member, "/team")).toEqual({ href: "/overview", label: "Profile" });
    for (const tab of member) expect(phoneParent(tab.href, member, "/team"), tab.href).toBeNull();
    expect(phoneParent("/overview/champions", member, "/team")).toBeNull();
  });

  it("Matchup Intel's Back leads to Resources, not Team; where Resources is a tab, its sections are where you start", () => {
    expect(phoneParent("/resources/matchups", member, "/team")).toEqual({ href: "/resources", label: "Resources" });
    const personal = phoneTabs(["/overview", "/resources", "/resources/matchups", "/settings"]);
    expect(phoneParent("/resources/matchups", personal, "/overview")).toBeNull();
    expect(phoneParent("/resources", personal, "/overview")).toBeNull();
  });

  it("names a page for Back when its heading was never read", () => {
    expect(pageName("/resources/matchups", member)).toBe("Matchup Intel");
    expect(pageName("/resources", member)).toBe("Resources");
    expect(pageName("/settings", member)).toBe("Settings");
    expect(pageName("/players/abc", member)).toBe("Players");
    expect(pageName("/team", member)).toBe("Team");
    expect(pageName("/somewhere", member)).toBe("Back");
    // Where Resources is a tab, Matchup Intel keeps its own name.
    expect(pageName("/resources/matchups", phoneTabs(["/overview", "/resources", "/resources/matchups"]))).toBe("Matchup Intel");
  });

  it("Back named after the page before goes there, past the entries the current page made of itself", () => {
    const at = (...paths: string[]) => paths.map((p) => ({ url: `https://team.example${p}` }));
    // Resources, then Matchup Intel and two pairs chosen there: three steps back to Resources, not one pair.
    const pairs = at("/team", "/resources", "/resources/matchups", "/resources/matchups?champion=Riven", "/resources/matchups?champion=Riven&vs=Mordekaiser");
    expect(backSteps(pairs, 4, "/resources/matchups", "/resources")).toBe(-3);
    // Straight from the page before: one step, as before.
    expect(backSteps(pairs, 2, "/resources/matchups", "/resources")).toBe(-1);
    // A profile's sections are one visit.
    expect(backSteps(at("/players", "/players/abc", "/players/abc/matches"), 2, "/players/abc/matches", "/players")).toBe(-2);
    // The history does not show that page there (the visits list and the history disagree): not known.
    expect(backSteps(pairs, 4, "/resources/matchups", "/leaderboards")).toBeNull();
    // An address that is not shown, an entry that is not one, or nothing before: not known.
    expect(backSteps([{ url: null }, ...at("/resources/matchups")], 1, "/resources/matchups", "/resources")).toBeNull();
    expect(backSteps([{ url: "not a url" }, ...at("/resources/matchups")], 1, "/resources/matchups", "/resources")).toBeNull();
    expect(backSteps(at("/resources/matchups", "/resources/matchups?vs=Riven"), 1, "/resources/matchups", "/resources")).toBeNull();
    expect(backSteps(pairs, 0, "/team", "/resources")).toBeNull();
    expect(backSteps(pairs, 9, "/resources/matchups", "/resources")).toBeNull();
  });

  it("Admin Mode: pages outside its tabs lead back to the Dashboard", () => {
    const admin = ADMIN_TABS.map((t) => ({ ...t }));
    expect(phoneParent("/admin", admin, ADMIN_HOME)).toBeNull();
    expect(phoneParent("/admin/people", admin, ADMIN_HOME)).toBeNull();
    expect(phoneParent("/admin/previews", admin, ADMIN_HOME)).toBeNull();
    expect(phoneParent("/admin/data", admin, ADMIN_HOME)).toEqual({ href: ADMIN_HOME, label: "Dashboard" });
    expect(phoneParent("/admin/audit", admin, ADMIN_HOME)).toEqual({ href: ADMIN_HOME, label: "Dashboard" });
  });
});

describe("old Team → Matches → Encounters addresses", () => {
  it("open your own profile's Encounters with the same choices", () => {
    const at = (sp: Record<string, string>) => new URL(encountersRedirect(sp), "https://x.test");
    expect(at({ view: "encounters" }).pathname).toBe("/overview/matches");
    // The old default list was Frequent allies (Alongside now); "Met by several members" is All.
    expect(Object.fromEntries(at({ view: "encounters" }).searchParams)).toEqual({ view: "encounters", rel: "alongside" });
    expect(Object.fromEntries(at({ view: "encounters", rel: "opponents", season: "16", queue: "flex", min: "3", sort: "worst", q: "Moon", member: "x", account: "y", limit: "60" }).searchParams)).toEqual({ season: "16", mode: "flex", view: "encounters", rel: "against", min: "3", sort: "worst", q: "Moon" });
    expect(at({ view: "encounters", rel: "shared", queue: "clash" }).searchParams.has("rel")).toBe(false);
    expect(at({ view: "encounters", rel: "shared", queue: "clash" }).searchParams.has("mode")).toBe(false);
    expect(at({ view: "encounters", season: "../../x" }).searchParams.has("season")).toBe(false);
  });
});

