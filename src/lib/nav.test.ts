import { describe, expect, it } from "vitest";
import { ADMIN_ENTRIES, ADMIN_HOME, ADMIN_LINKS, ADMIN_TABS, NAV_ENTRIES, NAV_LINKS, SECTION_HUBS, TAB_HREFS, TAB_LIMIT, TEAM_SECTIONS, activeHref, canOpen, currentTab, encountersRedirect, entryLinks, isActivePath } from "./nav";
import type { Session } from "@/server/auth/permissions";

const entryId = (e: (typeof NAV_ENTRIES)[number]) => ("key" in e ? e.key : e.href);

describe("navigation entries", () => {
  it("Player Mode has single entries only: My Profile, Team, Clash Scout on its own, then Resources", () => {
    expect(NAV_ENTRIES.map(entryId)).toEqual(["/overview", "team", "/clash", "/resources"]);
  });

  it("Resources is for every signed-in account, and is managed in Admin Mode's Platform Settings", () => {
    expect(NAV_LINKS.find((l) => l.href === "/resources")).toMatchObject({ label: "Resources" });
    expect(NAV_LINKS.find((l) => l.href === "/resources")).not.toHaveProperty("permission");
    expect(SECTION_HUBS.find((h) => h.key === "admin-settings")!.sections.map((s) => s.href)).toEqual(["/admin/branding", "/admin/previews", "/admin/resources"]);
    expect(ADMIN_LINKS.find((l) => l.href === "/admin/resources")).toMatchObject({ permission: "manage-branding" });
  });

  it("Clash Scout is not one of Team's sections, and Team members only", () => {
    expect(TEAM_SECTIONS.map((s) => s.href)).not.toContain("/clash");
    expect(SECTION_HUBS.flatMap((h) => h.sections).map((s) => s.href)).not.toContain("/clash");
    expect(NAV_LINKS.find((l) => l.href === "/clash")).toMatchObject({ label: "Clash Scout", permission: "view-team" });
  });

  it("Admin Mode has its six sections, in order, and none of the player pages", () => {
    expect(ADMIN_ENTRIES.map((e) => e.label)).toEqual(["Dashboard", "Users & Permissions", "Platform Settings", "Data & Integrations", "System Health", "Audit Logs"]);
    expect(ADMIN_LINKS.every((l) => l.href.startsWith("/admin"))).toBe(true);
    expect(ADMIN_LINKS.map((l) => l.href)).not.toContain("/team");
    expect(ADMIN_LINKS.map((l) => l.href)).not.toContain("/clash");
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

  it("no navigation anywhere leads to the removed Meta & Trends pages", () => {
    const hrefs = [...NAV_LINKS, ...ADMIN_ENTRIES.flatMap(entryLinks), ...SECTION_HUBS.flatMap((h) => h.sections)].map((l) => l.href);
    expect(hrefs.filter((h) => h.startsWith("/trends"))).toEqual([]);
    expect(SECTION_HUBS.map((h) => h.key)).toEqual(["team", "admin-settings"]);
  });

  it("every hub section belongs to exactly one tab bar", () => {
    const hrefs = SECTION_HUBS.flatMap((h) => h.sections.map((s) => s.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});

describe("currentTab", () => {
  // A team member's phone bar: the first TAB_LIMIT of TAB_HREFS.
  const member = TAB_HREFS.slice(0, TAB_LIMIT);
  // A personal-use account: no Team, Matches or Clash Scout.
  const personal = TAB_HREFS.filter((h) => !["/team", "/matches", "/clash"].includes(h));

  it("marks a page's own tab", () => {
    expect(currentTab("/matches", member)).toBe("/matches");
    expect(currentTab("/overview/champions", personal)).toBe("/overview");
  });

  it("marks the hub's first tabbed section for a section without a tab of its own", () => {
    expect(currentTab("/players", member)).toBe("/team");
    expect(currentTab("/leaderboards", member)).toBe("/team");
  });

  it("a team member's phone bar: Profile, Team, Matches, Clash; no Draft or Meta anywhere", () => {
    expect(member).toEqual(["/overview", "/team", "/matches", "/clash"]);
    // Clash Scout marks its own tab, never Team's.
    expect(currentTab("/clash", member)).toBe("/clash");
    expect(currentTab("/clash/0f0e0d0c-0b0a-4908-8706-050403020100", member)).toBe("/clash");
    expect(TEAM_SECTIONS.map((s) => s.href)).not.toContain("/draft");
    expect(ADMIN_TABS.map((t) => t.href)).not.toContain("/draft");
    expect(currentTab("/draft", member)).toBeNull();
    expect(currentTab("/trends/solo", member)).toBeNull();
  });

  it("marks nothing outside the tabs and hubs", () => {
    expect(currentTab("/settings", member)).toBeNull();
  });
});

describe("old Team → Matches → Encounters addresses", () => {
  it("open your own profile's Encounters with the same choices", () => {
    const at = (sp: Record<string, string>) => new URL(encountersRedirect(sp), "https://x.test");
    expect(at({ view: "encounters" }).pathname).toBe("/overview/matches");
    // The old default list was Frequent allies; "Met by several members" is everyone now.
    expect(Object.fromEntries(at({ view: "encounters" }).searchParams)).toEqual({ view: "encounters", rel: "allies" });
    expect(Object.fromEntries(at({ view: "encounters", rel: "opponents", season: "16", queue: "flex", min: "3", sort: "worst", q: "Moon", member: "x", account: "y", limit: "60" }).searchParams)).toEqual({ season: "16", mode: "flex", view: "encounters", min: "3", sort: "worst", q: "Moon" });
    expect(at({ view: "encounters", rel: "shared", queue: "clash" }).searchParams.get("rel")).toBe("everyone");
    expect(at({ view: "encounters", rel: "shared", queue: "clash" }).searchParams.has("mode")).toBe(false);
    expect(at({ view: "encounters", season: "../../x" }).searchParams.has("season")).toBe(false);
  });
});

