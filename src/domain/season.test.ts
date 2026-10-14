import { describe, expect, it } from "vitest";
import { seasonForDate, seasonLabel, seasonOfPatch, seasonStartUnix } from "./season";
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
