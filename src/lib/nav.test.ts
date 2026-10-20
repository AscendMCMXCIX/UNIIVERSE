import { describe, expect, it } from "vitest";
import { ADMIN_ENTRIES, ADMIN_TABS, ADMIN_TEAM_SECTIONS, NAV_ENTRIES, NAV_LINKS, SECTION_HUBS, TAB_HREFS, TAB_LIMIT, TEAM_SECTIONS, currentTab, entryLinks, isNavGroup } from "./nav";

const entryId = (e: (typeof NAV_ENTRIES)[number]) => ("key" in e ? e.key : e.href);

describe("navigation entries", () => {
  it("Player View has single entries only: My Profile, Team, then Clash Scout on its own", () => {
    expect(NAV_ENTRIES.some(isNavGroup)).toBe(false);
    expect(NAV_ENTRIES.map(entryId)).toEqual(["/overview", "team", "/clash"]);
  });

  it("Clash Scout is not one of Team's sections, in Player View or Admin Mode; Admin Mode lists it right below Team", () => {
    expect(TEAM_SECTIONS.map((s) => s.href)).not.toContain("/clash");
    expect(ADMIN_TEAM_SECTIONS.map((s) => s.href)).not.toContain("/clash");
    expect(SECTION_HUBS.flatMap((h) => [...h.sections, ...(h.adminSections ?? [])]).map((s) => s.href)).not.toContain("/clash");
    const admin = ADMIN_ENTRIES.map(entryId);
    expect(admin[admin.indexOf("admin-team") + 1]).toBe("/clash");
    // Team members only, as before.
    expect(NAV_LINKS.find((l) => l.href === "/clash")).toMatchObject({ label: "Clash Scout", permission: "view-team" });
  });

  it("no navigation anywhere leads to the removed Meta & Trends pages", () => {
    const hrefs = [...NAV_LINKS, ...ADMIN_ENTRIES.flatMap(entryLinks), ...SECTION_HUBS.flatMap((h) => h.sections)].map((l) => l.href);
    expect(hrefs.filter((h) => h.startsWith("/trends"))).toEqual([]);
    expect(SECTION_HUBS.map((h) => h.key)).toEqual(["team"]);
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
