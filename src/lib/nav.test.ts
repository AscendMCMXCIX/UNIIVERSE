import { describe, expect, it } from "vitest";
import { ADMIN_ENTRIES, ADMIN_HOME, ADMIN_LINKS, ADMIN_TABS, NAV_ENTRIES, NAV_LINKS, PHONE_TABS, PHONE_TAB_LIMIT, SECTION_HUBS, TEAM_SECTIONS, activeHref, canOpen, currentTab, encountersRedirect, entryLinks, isActivePath, phoneParent, phoneTabs, profileBase } from "./nav";
import type { Session } from "@/server/auth/permissions";

const entryId = (e: (typeof NAV_ENTRIES)[number]) => ("key" in e ? e.key : e.href);

describe("navigation entries", () => {
  it("Player Mode has single entries only: My Profile, Team, then Resources", () => {
    expect(NAV_ENTRIES.map(entryId)).toEqual(["/overview", "team", "/resources"]);
  });

  it("Resources is for every signed-in account, and is managed in Admin Mode's Platform Settings", () => {
    expect(NAV_LINKS.find((l) => l.href === "/resources")).toMatchObject({ label: "Resources" });
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
    expect(SECTION_HUBS.map((h) => h.key)).toEqual(["team", "admin-settings"]);
  });

  it("every hub section belongs to exactly one tab bar", () => {
    const hrefs = SECTION_HUBS.flatMap((h) => h.sections.map((s) => s.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});

describe("phone tab bar", () => {
  // A team member may open every Player Mode page.
  const member = phoneTabs(NAV_LINKS.map((l) => l.href));
  // An account outside the team: its profile and Resources only.
  const personal = phoneTabs(["/overview", "/resources", "/settings"]);
  const hrefs = (tabs: typeof member) => tabs.map((t) => t.href);

  it("a team member's bar: Team, Players, Leaderboards, Matches and Profile, one tap each; Resources moves to the account sheet", () => {
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

