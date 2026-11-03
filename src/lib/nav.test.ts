import { describe, expect, it } from "vitest";
import { ADMIN_ENTRIES, ADMIN_HOME, ADMIN_LINKS, ADMIN_TABS, NAV_ENTRIES, NAV_LINKS, SECTION_HUBS, TAB_HREFS, TAB_LOOK, TEAM_SECTIONS, activeHref, canOpen, currentTab, encountersRedirect, entryLinks, isActivePath } from "./nav";
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
    const hrefs = [...NAV_LINKS, ...ADMIN_ENTRIES.flatMap(entryLinks), ...SECTION_HUBS.flatMap((h) => h.sections), ...ADMIN_TABS].map((l) => l.href).concat(TAB_HREFS);
    expect(hrefs.filter((h) => h.startsWith("/trends") || h.startsWith("/clash"))).toEqual([]);
    expect(SECTION_HUBS.map((h) => h.key)).toEqual(["team", "admin-settings"]);
  });

  it("every hub section belongs to exactly one tab bar", () => {
    const hrefs = SECTION_HUBS.flatMap((h) => h.sections.map((s) => s.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});

describe("currentTab", () => {
  // A team member's phone bar: every one of TAB_HREFS.
  const member = [...TAB_HREFS];
  // A personal-use account: no Team.
  const personal = TAB_HREFS.filter((h) => h !== "/team");

  it("marks a page's own tab", () => {
    expect(currentTab("/resources", member)).toBe("/resources");
    expect(currentTab("/overview/champions", personal)).toBe("/overview");
    expect(currentTab("/resources", personal)).toBe("/resources");
  });

  it("marks the hub's first tabbed section for a section without a tab of its own", () => {
    expect(currentTab("/players", member)).toBe("/team");
    expect(currentTab("/leaderboards", member)).toBe("/team");
    // Matches is one of Team's sections, without a tab of its own.
    expect(currentTab("/matches", member)).toBe("/team");
  });

  it("a team member's phone bar: Profile, Team, Resources (the sidebar's entries); no Draft, Meta or Clash Scout anywhere", () => {
    expect(member).toEqual(["/overview", "/team", "/resources"]);
    expect(personal).toEqual(["/overview", "/resources"]);
    // The removed Clash Scout addresses belong to no tab (they are not found).
    expect(currentTab("/clash", member)).toBeNull();
    expect(currentTab("/clash/lab", member)).toBeNull();
    expect(TEAM_SECTIONS.map((s) => s.href)).not.toContain("/draft");
    expect(ADMIN_TABS.map((t) => t.href)).not.toContain("/draft");
    expect(currentTab("/draft", member)).toBeNull();
    expect(currentTab("/trends/solo", member)).toBeNull();
  });

  it("the tab bar draws each page with the sidebar's icon for it", () => {
    for (const href of TAB_HREFS) {
      const entry = NAV_ENTRIES.find((e) => ("sections" in e ? e.sections[0]!.href : e.href) === href)!;
      expect(TAB_LOOK[href].icon, href).toBe(entry.icon);
    }
  });

  it("marks nothing outside the tabs and hubs", () => {
    expect(currentTab("/settings", member)).toBeNull();
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

