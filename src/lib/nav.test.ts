import { describe, expect, it } from "vitest";
import { ADMIN_ENTRIES, ADMIN_TABS, NAV_ENTRIES, NAV_LINKS, SECTION_HUBS, TAB_HREFS, TAB_LIMIT, TEAM_SECTIONS, currentTab, isNavGroup } from "./nav";

describe("navigation entries", () => {
  it("Player View has single entries only: My Profile and Team", () => {
    expect(NAV_ENTRIES.some(isNavGroup)).toBe(false);
    expect(NAV_ENTRIES.map((e) => ("key" in e ? e.key : e.href))).toEqual(["/overview", "team"]);
  });

  it("no navigation anywhere leads to the removed Meta & Trends pages", () => {
    const hrefs = [...NAV_LINKS, ...ADMIN_ENTRIES.flatMap((e) => ("links" in e ? e.links : e.sections)), ...SECTION_HUBS.flatMap((h) => h.sections)].map((l) => l.href);
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
  // A personal-use account: no Team or Matches.
  const personal = TAB_HREFS.filter((h) => !["/team", "/matches"].includes(h));

  it("marks a page's own tab", () => {
    expect(currentTab("/matches", member)).toBe("/matches");
    expect(currentTab("/overview/champions", personal)).toBe("/overview");
  });

  it("marks the hub's first tabbed section for a section without a tab of its own", () => {
    expect(currentTab("/players", member)).toBe("/team");
    expect(currentTab("/leaderboards", member)).toBe("/team");
  });

  it("a team member's phone bar: Profile, Team, Matches; no Draft or Meta anywhere", () => {
    expect(member).toEqual(["/overview", "/team", "/matches"]);
    expect(TEAM_SECTIONS.map((s) => s.href)).not.toContain("/draft");
    expect(ADMIN_TABS.map((t) => t.href)).not.toContain("/draft");
    expect(currentTab("/draft", member)).toBeNull();
    expect(currentTab("/trends/solo", member)).toBeNull();
  });

  it("marks nothing outside the tabs and hubs", () => {
    expect(currentTab("/settings", member)).toBeNull();
  });
});
