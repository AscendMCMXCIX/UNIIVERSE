import { describe, expect, it } from "vitest";
import { NAV_ENTRIES, PROFILE_SECTIONS, isNavGroup } from "./nav";

describe("profile sections", () => {
  it("are listed in the deliberate order, with Solo Queue Blocks private to your own profile", () => {
    expect(PROFILE_SECTIONS.map((s) => s.label)).toEqual(["Overview", "All Champions", "Match History", "Matchups", "Solo Queue Blocks", "Riot Accounts"]);
    expect(PROFILE_SECTIONS.filter((s) => s.own).map((s) => s.key)).toEqual(["blocks"]);
    // Every section keeps its address (deep links and bookmarks).
    expect(PROFILE_SECTIONS.map((s) => s.path)).toEqual(["", "/champions", "/matches", "/matchups", "/blocks", "/accounts"]);
  });

  it("the sidebar holds one My Profile link, not a second list of the sections", () => {
    const first = NAV_ENTRIES[0]!;
    expect(isNavGroup(first)).toBe(false);
    expect(first).toMatchObject({ href: "/overview", label: "My Profile" });
  });
});
