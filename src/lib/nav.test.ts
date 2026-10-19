import { describe, expect, it } from "vitest";
import { ADMIN_ENTRIES, ADMIN_TABS, NAV_ENTRIES, SECTION_HUBS, TAB_HREFS, TAB_LIMIT, TEAM_SECTIONS, TRENDS_SECTIONS, currentTab, isNavGroup, isNavHub } from "./nav";

describe("navigation entries", () => {
  it("Player View has single entries only: My Profile, Team, Meta & Trends", () => {
    expect(NAV_ENTRIES.some(isNavGroup)).toBe(false);
    const trends = NAV_ENTRIES.find((e) => isNavHub(e) && e.key === "trends");
    expect(trends && isNavHub(trends) ? trends.sections.map((s) => s.href) : []).toEqual(["/trends/solo", "/trends/duos", "/trends/pro"]);
  });

  it("Admin Mode reaches Meta & Trends through one entry with the same sections", () => {
    const league = ADMIN_ENTRIES.find((e) => e.key === "admin-league");
    expect(league && isNavHub(league) ? league.sections : null).toBe(TRENDS_SECTIONS);
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
    expect(currentTab("/trends/solo", member)).toBe("/trends/solo");
    expect(currentTab("/trends/pro", personal)).toBe("/trends/pro");
  });

  it("marks the hub's first tabbed section for a section without a tab of its own", () => {
    expect(currentTab("/players", member)).toBe("/team");
    expect(currentTab("/leaderboards", member)).toBe("/team");
    expect(currentTab("/trends/duos", member)).toBe("/trends/solo");
    expect(currentTab("/trends/pro", member)).toBe("/trends/solo");
    expect(currentTab("/trends/duos", personal)).toBe("/trends/solo");
  });

  it("a team member's phone bar: Overview, Team, Matches, Meta & Trends; no Draft anywhere", () => {
    expect(member).toEqual(["/overview", "/team", "/matches", "/trends/solo"]);
    expect(TEAM_SECTIONS.map((s) => s.href)).not.toContain("/draft");
    expect(ADMIN_TABS.map((t) => t.href)).not.toContain("/draft");
    expect(currentTab("/draft", member)).toBeNull();
  });

  it("marks nothing outside the tabs and hubs", () => {
    expect(currentTab("/settings", member)).toBeNull();
  });
});
