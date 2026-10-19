import { describe, expect, it } from "vitest";
import { chooseSeason, FIRST_SEASON, isOfferedSeason, offeredCurrentSeason, offeredSeasons, seasonForDate, seasonLabel, seasonOfPatch, seasonStartUnix } from "./season";
import { canonicalPatch, comparePatches, publicPatchName } from "./patch";

describe("seasons and patch names", () => {
  it("reads the season from the client patch or the public year name", () => {
    expect(seasonOfPatch("16.20")).toBe(16);
    expect(seasonOfPatch("26.20")).toBe(16);
    expect(seasonOfPatch("15.24")).toBe(15);
    expect(seasonOfPatch("unknown")).toBeNull();
    expect(seasonLabel(16)).toBe("Season 2026");
    expect(new Date(seasonStartUnix(16) * 1000).toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(seasonForDate(new Date("2026-10-14T00:00:00Z"))).toBe(16);
  });

  it("maps year-named patches to the client version so pro and ranked evidence line up", () => {
    expect(canonicalPatch("26.20")).toBe("16.20");
    expect(canonicalPatch("25.3")).toBe("15.3");
    expect(canonicalPatch("16.20")).toBe("16.20");
    expect(canonicalPatch("14.24")).toBe("14.24");
    expect(comparePatches("26.20", "16.20")).toBe(0);
    expect(comparePatches("26.19", "16.20")).toBeLessThan(0);
    expect(publicPatchName("16.20")).toBe("26.20");
    expect(publicPatchName("14.24")).toBe("14.24");
  });
});

describe("offered seasons (every season choice)", () => {
  it("starts at Season 2026: 2025 and older are never offered", () => {
    expect(FIRST_SEASON).toBe(16);
    expect(isOfferedSeason(15, 16)).toBe(false);
    expect(isOfferedSeason(null, 16)).toBe(false);
    expect(isOfferedSeason(16, 16)).toBe(true);
    expect(offeredSeasons(16, [15, 15, 16, 14, null])).toEqual([16]);
  });

  it("offers a later season on its own once it is current, newest first, and keeps 2026", () => {
    expect(offeredSeasons(17, [16, 17, 15])).toEqual([17, 16]);
    // A new season with no games yet is still offered (it is the default).
    expect(offeredSeasons(17, [16])).toEqual([17, 16]);
  });

  it("never offers a season after the current one (a stray or unreleased patch)", () => {
    expect(isOfferedSeason(17, 16)).toBe(false);
    expect(offeredSeasons(16, [16, 17, 99])).toEqual([16]);
  });

  it("never goes below the floor, even if the current patch reads older", () => {
    expect(offeredSeasons(15, [15])).toEqual([16]);
    expect(offeredCurrentSeason(15)).toBe(16);
  });

  it("falls back to the current season for anything not offered (old links, saved 2025 filters, 'all', nonsense)", () => {
    const seasons = [17, 16];
    expect(chooseSeason("16", seasons, 17)).toBe(16);
    expect(chooseSeason(16, seasons, 17)).toBe(16);
    for (const p of ["15", 15, "all", "", "abc", "16.5", null, undefined, "18"]) expect(chooseSeason(p, seasons, 17)).toBe(17);
  });
});
