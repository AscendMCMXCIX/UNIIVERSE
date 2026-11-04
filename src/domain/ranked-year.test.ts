import { describe, expect, it } from "vitest";
import { rankedRange, rankedSeasonAt, rankedSeasonOfPatch, RANKED_YEAR_START } from "./ranked-year";

describe("the 2026 ranked year", () => {
  it("starts on 8 January 2026", () => {
    expect(new Date(RANKED_YEAR_START).toISOString()).toBe("2026-01-08T00:00:00.000Z");
  });

  it("places a game in its season by patch, year-named patches included", () => {
    expect(rankedSeasonOfPatch("16.1")?.label).toBe("Season 1");
    expect(rankedSeasonOfPatch("16.8")?.label).toBe("Season 1");
    expect(rankedSeasonOfPatch("26.9")?.label).toBe("Season 2");
    expect(rankedSeasonOfPatch("16.14")?.label).toBe("Season 2");
    expect(rankedSeasonOfPatch("16.15")?.label).toBe("Season 3");
    expect(rankedSeasonOfPatch("26.21")?.label).toBe("Season 3");
    expect(rankedSeasonOfPatch("15.24")).toBeNull();
    expect(rankedSeasonOfPatch(null)).toBeNull();
  });

  it("places a moment in its season by day", () => {
    expect(rankedSeasonAt(Date.UTC(2026, 0, 7, 23))).toBeNull();
    expect(rankedSeasonAt(Date.UTC(2026, 3, 28, 23))?.key).toBe("s1");
    expect(rankedSeasonAt(Date.UTC(2026, 3, 29, 1))?.key).toBe("s2");
    expect(rankedSeasonAt(Date.UTC(2026, 9, 16))?.key).toBe("s3");
    expect(rankedSeasonAt(Date.UTC(2027, 0, 2))).toBeNull();
  });

  it("gives each view its range: the year and every season up to now", () => {
    const now = Date.UTC(2026, 10, 4);
    expect(rankedRange("year", now)).toEqual({ from: Date.UTC(2026, 0, 8), to: now });
    expect(rankedRange("s2", now)).toEqual({ from: Date.UTC(2026, 3, 29), to: Date.UTC(2026, 6, 29) });
    expect(rankedRange("s3", now)).toEqual({ from: Date.UTC(2026, 6, 29), to: now });
  });
});
