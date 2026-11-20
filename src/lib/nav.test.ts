import { describe, expect, it } from "vitest";
import { ADMIN_ENTRIES, ADMIN_HOME, ADMIN_LINKS, MANIFEST_SHORTCUTS, MATCHUP_INTEL, NAV_ENTRIES, NAV_LINKS, PAGE_WIDTH, ROW_WIDTH, RESOURCES, SECTION_HUBS, TEAM_SECTIONS, activeHref, backSteps, canOpen, currentDestination, destinations, encountersRedirect, entryLinks, isActivePath, isNavHub, pageName, pageWidthOf, phoneParent, prefetchOf, profileBase, sectionHubOf, withSectionMemory } from "./nav";
import { MATCHUP_INTEL_PATH } from "@/components/matchup-intel/address";
import { BookMarked, Swords } from "lucide-react";
import type { Session } from "@/server/auth/permissions";

const entryId = (e: (typeof NAV_ENTRIES)[number]) => ("key" in e ? e.key : e.href);

describe("navigation entries", () => {
  it("Player Mode has single entries only: My Profile, Team, Matchup Intel, then Resources", () => {
    expect(NAV_ENTRIES.map(entryId)).toEqual(["/overview", "team", "/resources/matchups", "/resources"]);
    expect(NAV_ENTRIES.map((e) => e.label)).toEqual(["My Profile", "Team", "Matchup Intel", "Resources"]);
  });

  it("Resources is for every signed-in account, and is managed in Admin Mode's Platform Settings", () => {
    expect(NAV_LINKS.find((l) => l.href === "/resources")).toMatchObject({ label: "Resources" });
    expect(NAV_LINKS.find((l) => l.href === "/resources")).not.toHaveProperty("permission");
    expect(SECTION_HUBS.find((h) => h.key === "admin-settings")!.sections.map((s) => s.href)).toEqual(["/admin/branding", "/admin/previews", "/admin/resources"]);
    expect(ADMIN_LINKS.find((l) => l.href === "/admin/resources")).toMatchObject({ permission: "manage-branding" });
  });


  it("Admin Mode has four destinations, in order, three of them with tabs, every admin page under one of them, and none of the player pages", () => {
    expect(ADMIN_ENTRIES.map((e) => [e.label, e.short ?? null])).toEqual([
      ["Dashboard", null],
      ["Users & Permissions", "Users"],
      ["Platform Settings", "Platform"],
      ["System", null],
    ]);
    // System is Health, Data & Integrations and Audit Logs, at the addresses they always had.
    const system = ADMIN_ENTRIES.find((e) => isNavHub(e) && e.key === "admin-system")!;
    expect(entryLinks(system).map((l) => [l.href, l.label])).toEqual([
      ["/admin/system", "Health"],
      ["/admin/data", "Data & Integrations"],
      ["/admin/audit", "Audit Logs"],
    ]);
    expect(ADMIN_LINKS.map((l) => l.href)).toEqual(["/admin", "/admin/people", "/admin/people/access", "/admin/people/privacy", "/admin/branding", "/admin/previews", "/admin/resources", "/admin/system", "/admin/data", "/admin/audit"]);
    expect(ADMIN_LINKS.every((l) => l.href.startsWith("/admin"))).toBe(true);
    expect(ADMIN_LINKS.map((l) => l.href)).not.toContain("/team");
    expect(NAV_LINKS.some((l) => l.href.startsWith("/admin"))).toBe(false);
    // One "Settings" on a phone in Admin Mode: the account's. Platform Settings is "Platform" where a bar has no room.
    const names = ADMIN_ENTRIES.flatMap((e) => [e.label, e.short].filter(Boolean));
    expect(names.filter((n) => n === "Settings")).toEqual([]);
  });

  it("every set of tabs is an entry of one of the modes, in their order, and every entry with tabs has its set", () => {
    const hubs = [...NAV_ENTRIES, ...ADMIN_ENTRIES].filter(isNavHub);
    expect(SECTION_HUBS.map((h) => h.key)).toEqual(hubs.map((h) => h.key));
    for (const hub of hubs) expect(SECTION_HUBS.find((h) => h.key === hub.key)!.sections, hub.key).toBe(hub.sections);
    expect(sectionHubOf("/admin/data")?.key).toBe("admin-system");
    expect(sectionHubOf("/players")?.key).toBe("team");
    // A page inside a section (a teammate's profile) is not one of its tabs.
    expect(sectionHubOf("/players/abc")).toBeNull();
    expect(sectionHubOf("/admin")).toBeNull();
  });

  it("a short name is the start or the end of the whole name, so what a bar shows is always part of what is read out", () => {
    const named = [...NAV_ENTRIES, ...ADMIN_ENTRIES].filter((e) => e.short);
    expect(named.map((e) => [e.label, e.short])).toEqual([
      ["My Profile", "Profile"],
      ["Matchup Intel", "Intel"],
      ["Users & Permissions", "Users"],
      ["Platform Settings", "Platform"],
    ]);
    for (const e of named) expect(e.label.startsWith(`${e.short} `) || e.label.endsWith(` ${e.short}`), e.label).toBe(true);
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
    const hrefs = [...NAV_LINKS, ...ADMIN_ENTRIES.flatMap(entryLinks), ...SECTION_HUBS.flatMap((h) => h.sections), ...MANIFEST_SHORTCUTS.map((s) => ({ href: s.url }))].map((l) => l.href);
    expect(hrefs.filter((h) => h.startsWith("/trends") || h.startsWith("/clash"))).toEqual([]);
    expect(SECTION_HUBS.map((h) => h.key)).toEqual(["team", "admin-users", "admin-settings", "admin-system"]);
  });

  it("Matchup Intel and Resources are entries of their own, one page each, with no tabs, which every account may open", () => {
    // Matchup Intel with its swords, at the address every link to it has used (nothing redirects).
    expect(MATCHUP_INTEL).toEqual({ href: "/resources/matchups", label: "Matchup Intel", short: "Intel", icon: Swords });
    expect(MATCHUP_INTEL.href).toBe(MATCHUP_INTEL_PATH);
    expect(RESOURCES).toEqual({ href: "/resources", label: "Resources", icon: BookMarked });
    for (const link of [MATCHUP_INTEL, RESOURCES]) {
      const entry = NAV_ENTRIES.find((e) => !isNavHub(e) && e.href === link.href)!;
      expect(entry, link.label).toBe(link);
      // Neither has tabs, and neither is a section of anything: one place in the sidebar each.
      expect(SECTION_HUBS.some((h) => h.sections.some((s) => s.href === link.href)), link.label).toBe(false);
      expect(NAV_LINKS.filter((l) => l.href === link.href), link.label).toHaveLength(1);
    }
    const stranger: Session = { userId: "u", role: "player", label: "P", playerId: null, username: "p", hasPassword: true, mustChangePassword: false, setupComplete: true, capabilities: [] };
    expect([MATCHUP_INTEL, RESOURCES].every((l) => canOpen(stranger, l))).toBe(true);
    // Matchup Intel is the static reference, kept apart by name from a champion's own Matchups.
    expect(NAV_LINKS.filter((l) => /matchups/i.test(l.href)).map((l) => l.label)).toEqual(["Matchup Intel"]);
  });

  it("Matchup Intel is marked on its page, whatever pair it shows, and Resources on the Library alone", () => {
    const hrefs = NAV_LINKS.map((l) => l.href);
    expect(activeHref("/resources/matchups", hrefs)).toBe("/resources/matchups");
    expect(activeHref("/resources", hrefs)).toBe("/resources");
    // Resources' address starts Matchup Intel's (kept from when it was Resources' second section),
    // yet Matchup Intel is not under Resources: Resources is the current page only on itself.
    expect(isActivePath("/resources/matchups", RESOURCES.href)).toBe(false);
    expect(isActivePath("/resources", RESOURCES.href)).toBe(true);
    expect(activeHref("/resources/matchups", [RESOURCES.href, "/settings"])).toBeNull();
  });

  it("every hub section belongs to exactly one tab bar", () => {
    const hrefs = SECTION_HUBS.flatMap((h) => h.sections.map((s) => s.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("from a 1600px window the pages of a tab bar share one width (Team's the wide one), and under it every page keeps the width it always had", () => {
    expect(SECTION_HUBS.map((h) => [h.key, h.width])).toEqual([
      ["team", "wide"],
      ["admin-users", "max"],
      ["admin-settings", "max"],
      ["admin-system", "max"],
    ]);
    // Team Overview and Leaderboards were always 100rem; Players and Matches join them from 1600px.
    expect(TEAM_SECTIONS.map((s) => pageWidthOf(s.href))).toEqual(["wide", "wideFrom1600", "wide", "wideFrom1600"]);
    // A teammate's profile sits under Players' address, in the profile's own (ordinary) width.
    for (const path of ["/players/p1", "/players/p1/matches", "/resources", "/resources/matchups", "/admin/branding", "/settings", "/overview"]) expect(pageWidthOf(path), path).toBe("max");
    expect(PAGE_WIDTH).toEqual({ max: "max-w-[var(--content-max)]", wide: "max-w-[var(--content-wide)]", wideFrom1600: "max-w-[var(--content-max)] min-[100rem]:max-w-[var(--content-wide)]" });
    // The row of tabs is the bar's width under 1600px, as it always was, and the set's width from
    // there, starting at the shared frame's left edge (a narrower set's row is not centred: S2c).
    expect(ROW_WIDTH).toEqual({ max: "min-[100rem]:max-w-[var(--content-max)] min-[100rem]:ml-[max(0px,calc((100%-var(--content-wide))/2))]", wide: "min-[100rem]:max-w-[var(--content-wide)]" });
  });
});

describe("the destinations every bar shows", () => {
  const all = NAV_LINKS.map((l) => l.href);
  const adminAll = ADMIN_LINKS.map((l) => l.href);
  const view = (list: ReturnType<typeof destinations>) => list.map((d) => [d.key, d.href, d.label, d.short ?? null]);

  it("Player Mode: My Profile, Team, Matchup Intel and Resources, the sidebar's entries with their names, short names and icons, each to its first page", () => {
    const list = destinations(all, false);
    expect(view(list)).toEqual([
      ["/overview", "/overview", "My Profile", "Profile"],
      ["team", "/team", "Team", null],
      ["/resources/matchups", "/resources/matchups", "Matchup Intel", "Intel"],
      ["/resources", "/resources", "Resources", null],
    ]);
    expect(list.map((d) => d.icon)).toEqual(NAV_ENTRIES.map((e) => e.icon));
    // Team stands for its four sections; the others for their own page each.
    expect(list[1]!.pages).toEqual(TEAM_SECTIONS.map((s) => s.href));
    expect(list[1]!.hub).toBe("team");
    expect(list.filter((d) => d.hub).map((d) => d.key)).toEqual(["team"]);
    expect(list[2]!.pages).toEqual(["/resources/matchups"]);
  });

  it("Admin Mode: Dashboard, Users & Permissions, Platform Settings and System, each to the first page of it the account may open", () => {
    const list = destinations(adminAll, true);
    expect(view(list)).toEqual([
      ["/admin", "/admin", "Dashboard", null],
      ["admin-users", "/admin/people", "Users & Permissions", "Users"],
      ["admin-settings", "/admin/branding", "Platform Settings", "Platform"],
      ["admin-system", "/admin/system", "System", null],
    ]);
    expect(list.map((d) => d.icon)).toEqual(ADMIN_ENTRIES.map((e) => e.icon));
    expect(list[3]!.pages).toEqual(["/admin/system", "/admin/data", "/admin/audit"]);
    // An administrator who may manage branding only: System is its Audit Logs.
    expect(view(destinations(["/admin", "/admin/branding", "/admin/previews", "/admin/resources", "/admin/audit"], true))).toEqual([
      ["/admin", "/admin", "Dashboard", null],
      ["admin-settings", "/admin/branding", "Platform Settings", "Platform"],
      ["admin-system", "/admin/audit", "System", null],
    ]);
  });

  it("only what the account may open: an account outside the team has no Team; one that may open only Players has Team leading there", () => {
    expect(destinations(["/overview", "/resources", "/resources/matchups"], false).map((d) => d.href)).toEqual(["/overview", "/resources/matchups", "/resources"]);
    expect(destinations(["/overview", "/players", "/resources"], false).map((d) => d.href)).toEqual(["/overview", "/players", "/resources"]);
  });

  it("marks the destination a page belongs to, as the sidebar does: a teammate's profile is Team's, your own profile's sections My Profile's, Matchup Intel its own; none for Settings", () => {
    const list = destinations(all, false);
    const at = (path: string) => currentDestination(path, list)?.key ?? null;
    expect(at("/team")).toBe("team");
    expect(at("/matches")).toBe("team");
    expect(at("/matches/insights")).toBe("team");
    expect(at("/players/abc/matches")).toBe("team");
    expect(at("/overview/champions")).toBe("/overview");
    expect(at("/me")).toBe("/overview");
    expect(at("/resources/matchups")).toBe("/resources/matchups");
    expect(at("/resources")).toBe("/resources");
    expect(at("/settings")).toBeNull();
    expect(at("/clash")).toBeNull();
    expect(at("/trends/solo")).toBeNull();
    const admin = destinations(adminAll, true);
    const atAdmin = (path: string) => currentDestination(path, admin)?.key ?? null;
    expect(atAdmin("/admin")).toBe("/admin");
    expect(atAdmin("/admin/previews")).toBe("admin-settings");
    expect(atAdmin("/admin/people/access")).toBe("admin-users");
    expect(atAdmin("/admin/data")).toBe("admin-system");
    expect(atAdmin("/admin/audit")).toBe("admin-system");
    expect(atAdmin("/admin/settings")).toBeNull();
  });

  it("a phone's destination with tabs reopens the one last used while it is not the current one, and leads to its first tapped again", () => {
    const list = destinations(all, false);
    const team = (path: string, memory: Record<string, string> | null) => withSectionMemory(list, path, memory).find((d) => d.key === "team")!.href;
    // Nothing remembered (the server, a new tab): Team Overview.
    expect(team("/overview", null)).toBe("/team");
    expect(team("/overview", {})).toBe("/team");
    // Players last used: Team reopens it from anywhere outside Team.
    expect(team("/overview", { team: "/players" })).toBe("/players");
    expect(team("/resources", { team: "/leaderboards" })).toBe("/leaderboards");
    // On Team's pages (a teammate's profile among them) a second tap leads to Overview.
    expect(team("/players", { team: "/players" })).toBe("/team");
    expect(team("/players/abc", { team: "/players" })).toBe("/team");
    // A remembered page this account may not open, or not one of Team's, is ignored.
    expect(withSectionMemory(destinations(["/overview", "/team", "/players"], false), "/overview", { team: "/leaderboards" }).find((d) => d.key === "team")!.href).toBe("/team");
    expect(team("/overview", { team: "/settings" })).toBe("/team");
    // The others are unchanged, and nothing else moves.
    expect(withSectionMemory(list, "/overview", { team: "/players" }).map((d) => d.key)).toEqual(list.map((d) => d.key));
    expect(withSectionMemory(list, "/overview", { team: "/players" }).filter((d) => d.key !== "team")).toEqual(list.filter((d) => d.key !== "team"));
  });

  it("the installed app's shortcuts are Player Mode's destinations, in their order and by their names", () => {
    expect(MANIFEST_SHORTCUTS).toEqual(destinations(all, false).map((d) => ({ name: d.label, url: d.href })));
  });

  it("no frame link fetches a profile ahead of a tap (its layout starts the player's Riot refresh); the rest keep Next's default", () => {
    for (const href of ["/overview", "/overview/matches", "/overview/champions?season=16", "/players/abc", "/players/abc/accounts#x"]) expect(prefetchOf(href), href).toBe(false);
    for (const href of ["/team", "/players", "/leaderboards", "/resources", "/resources/matchups", "/settings", "/admin", "/players/abc/edit"]) expect(prefetchOf(href), href).toBeUndefined();
  });
});

describe("phone top bar", () => {
  const member = destinations(NAV_LINKS.map((l) => l.href), false);

  it("knows a profile's sections, yours and a teammate's", () => {
    expect(profileBase("/overview")).toBe("/overview");
    expect(profileBase("/overview/matches")).toBe("/overview");
    expect(profileBase("/players/abc")).toBe("/players/abc");
    expect(profileBase("/players/abc/accounts")).toBe("/players/abc");
    expect(profileBase("/players")).toBeNull();
    expect(profileBase("/players/abc/edit")).toBeNull();
    expect(profileBase("/team")).toBeNull();
  });

  it("Back from a page opened directly leads to the page above it; every destination's own pages have none, so no page claims Team unless it is under Team", () => {
    expect(phoneParent("/players/abc", member, "/team")).toEqual({ href: "/players", label: "Players" });
    expect(phoneParent("/players/abc/matches", member, "/team")).toEqual({ href: "/players", label: "Players" });
    // Settings, not a destination, leads home (Back named after the page before goes there when it is known).
    expect(phoneParent("/settings", member, "/team")).toEqual({ href: "/team", label: "Team" });
    for (const d of member) for (const page of d.pages) expect(phoneParent(page, member, "/team"), page).toBeNull();
    for (const page of ["/overview/champions", "/overview/accounts", "/me", "/matches/insights", "/resources", "/resources/matchups", "/no-access"]) expect(phoneParent(page, member, "/team"), page).toBeNull();
    // An account outside the team: home is its first page, by its destination's name.
    const personal = destinations(["/overview", "/resources", "/resources/matchups", "/settings"], false);
    expect(phoneParent("/resources/matchups", personal, "/resources/matchups")).toBeNull();
    expect(phoneParent("/settings", personal, "/resources/matchups")).toEqual({ href: "/resources/matchups", label: "Matchup Intel" });
  });

  it("names a page for Back when its heading was never read: a section by its tab, a set's first by its destination", () => {
    expect(pageName("/resources/matchups", member)).toBe("Matchup Intel");
    expect(pageName("/resources", member)).toBe("Resources");
    expect(pageName("/settings", member)).toBe("Settings");
    expect(pageName("/players", member)).toBe("Players");
    expect(pageName("/players/abc", member)).toBe("Players");
    expect(pageName("/leaderboards", member)).toBe("Leaderboards");
    expect(pageName("/team", member)).toBe("Team");
    expect(pageName("/overview/matches", member)).toBe("My Profile");
    expect(pageName("/somewhere", member)).toBe("Back");
    const admin = destinations(ADMIN_LINKS.map((l) => l.href), true);
    expect(pageName("/admin", admin)).toBe("Dashboard");
    expect(pageName("/admin/people", admin)).toBe("Users & Permissions");
    expect(pageName("/admin/data", admin)).toBe("Data & Integrations");
    expect(pageName("/admin/settings", admin)).toBe("Settings");
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

  it("Admin Mode: every admin page is a destination's, with no Back; the account's Settings leads back to the Dashboard", () => {
    const admin = destinations(ADMIN_LINKS.map((l) => l.href), true);
    for (const page of ADMIN_LINKS.map((l) => l.href)) expect(phoneParent(page, admin, ADMIN_HOME), page).toBeNull();
    expect(phoneParent("/admin/settings", admin, ADMIN_HOME)).toEqual({ href: ADMIN_HOME, label: "Dashboard" });
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

