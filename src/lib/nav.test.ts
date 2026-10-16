import { describe, expect, it } from "vitest";
import { NAV_ENTRIES, PROFILE_SECTIONS, isNavGroup, matchupsRedirect } from "./nav";

describe("profile sections", () => {
  it("are listed in the deliberate order, with Solo Queue Blocks private to your own profile", () => {
    expect(PROFILE_SECTIONS.map((s) => s.label)).toEqual(["Overview", "All Champions", "Match History", "Solo Queue Blocks", "Riot Accounts"]);
    expect(PROFILE_SECTIONS.filter((s) => s.own).map((s) => s.key)).toEqual(["blocks"]);
    // Every section keeps its address (deep links and bookmarks).
    expect(PROFILE_SECTIONS.map((s) => s.path)).toEqual(["", "/champions", "/matches", "/blocks", "/accounts"]);
  });

  it("old Matchups addresses open the champion window on Matchups, keeping champion, opponent and filters", () => {
    expect(matchupsRedirect("/overview", { champion: "Riven", vs: "Renekton", season: "16", mode: "solo", account: "a1", junk: "x" })).toBe("/overview/champions?season=16&mode=solo&account=a1&champion=Riven&vs=Renekton&tab=matchups");
    expect(matchupsRedirect("/players/p1", {})).toBe("/players/p1/champions?tab=matchups");
    expect(matchupsRedirect("/players/p1", { champion: ["a", "b"], role: "TOP" })).toBe("/players/p1/champions?crole=TOP&tab=matchups");
  });

  it("the sidebar holds one My Profile link, not a second list of the sections", () => {
    const first = NAV_ENTRIES[0]!;
    expect(isNavGroup(first)).toBe(false);
    expect(first).toMatchObject({ href: "/overview", label: "My Profile" });
  });
});
