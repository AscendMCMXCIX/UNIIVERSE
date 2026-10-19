import { describe, expect, it } from "vitest";
import { chosenSeason, inMatchesSeasons, matchesSeasons, MATCHES_FIRST_SEASON } from "./matches-seasons";

describe("Team → Matches seasons", () => {
  it("starts at Season 2026: 2025 and older never count", () => {
    expect(MATCHES_FIRST_SEASON).toBe(16);
    expect(inMatchesSeasons(15)).toBe(false);
    expect(inMatchesSeasons(null)).toBe(false);
    expect(inMatchesSeasons(16)).toBe(true);
    expect(matchesSeasons(16, [15, 15, 16, 14, null])).toEqual({ seasons: [16], current: 16 });
  });

  it("offers a later season on its own once games exist, newest first, and keeps 2026", () => {
    expect(matchesSeasons(17, [16, 17, 15])).toEqual({ seasons: [17, 16], current: 17 });
    // A new season with no games yet is still the default.
    expect(matchesSeasons(17, [16])).toEqual({ seasons: [17, 16], current: 17 });
  });

  it("never goes below the floor, even if the current patch reads older", () => {
    expect(matchesSeasons(15, [15])).toEqual({ seasons: [16], current: 16 });
  });

  it("falls back to the current season for anything it does not offer (old links, 'all', nonsense)", () => {
    const seasons = [17, 16];
    expect(chosenSeason("16", seasons, 17)).toBe(16);
    for (const p of ["15", "all", "", "abc", "16.5"]) expect(chosenSeason(p, seasons, 17)).toBe(17);
  });
});
