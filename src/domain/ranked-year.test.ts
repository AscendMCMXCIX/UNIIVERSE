import { describe, expect, it } from "vitest";
import { nextRankedYear, RANKED_2027_FROM, RANKED_YEAR_START, RANKED_YEARS, rankedSeasonAt, rankedSeasonName, rankedSeasonOfPatch, rankedYearAt, rankedYearOfPatch, seasonOfYearAt } from "./ranked-year";

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
    expect(rankedSeasonOfPatch("16.24")?.year).toBe(2026);
    expect(rankedSeasonOfPatch("15.24")).toBeNull();
    expect(rankedSeasonOfPatch(null)).toBeNull();
  });

  it("places a moment in its season by day", () => {
    expect(rankedSeasonAt(Date.UTC(2026, 0, 7, 23))).toBeNull();
    expect(rankedSeasonAt(Date.UTC(2026, 3, 28, 23))?.key).toBe("s1");
    expect(rankedSeasonAt(Date.UTC(2026, 3, 29, 1))?.key).toBe("s2");
    expect(rankedSeasonAt(Date.UTC(2026, 9, 16))?.key).toBe("s3");
  });
});

describe("the 2027 ranked year", () => {
  it("is known, game version 17, its first day an estimate until Riot publishes it", () => {
    const y2027 = RANKED_YEARS.find((y) => y.year === 2027)!;
    expect(y2027).toMatchObject({ major: 17, confirmed: false });
    expect(y2027.from).toBe(RANKED_2027_FROM);
    // Riot said "January" (16 Nov 2026): the estimate stays in January, after the 2026 year's last day.
    expect(new Date(RANKED_2027_FROM).getUTCFullYear()).toBe(2027);
    expect(new Date(RANKED_2027_FROM).getUTCMonth()).toBe(0);
    expect(nextRankedYear(RANKED_YEARS[0]!)).toBe(y2027);
    expect(nextRankedYear(y2027)).toBeNull();
  });

  it("places 17.x games, and Riot's public 27.x names, in 2027's Season 1", () => {
    expect(rankedSeasonOfPatch("17.1")).toMatchObject({ year: 2027, key: "s1", label: "Season 1" });
    expect(rankedSeasonOfPatch("27.1")).toMatchObject({ year: 2027, key: "s1" });
    expect(rankedSeasonOfPatch("17.12")?.year).toBe(2027);
    expect(rankedYearOfPatch("27.3")?.year).toBe(2027);
    expect(rankedYearOfPatch("16.24")?.year).toBe(2026);
    expect(rankedYearOfPatch("15.24")).toBeNull();
    expect(rankedYearOfPatch("18.1")).toBeNull();
    expect(rankedYearOfPatch("not a patch")).toBeNull();
  });

  it("by date: 2026's Season 3 to the estimate, then 2027's Season 1", () => {
    expect(rankedSeasonName(rankedSeasonAt(Date.UTC(2026, 11, 31, 23))!)).toBe("2026 Season 3");
    expect(rankedSeasonName(rankedSeasonAt(Date.UTC(2027, 0, 2))!)).toBe("2026 Season 3");
    expect(rankedSeasonName(rankedSeasonAt(Date.UTC(2027, 0, 9))!)).toBe("2027 Season 1");
    expect(rankedSeasonName(rankedSeasonAt(Date.UTC(2027, 2, 1))!)).toBe("2027 Season 1");
    expect(rankedYearAt(Date.UTC(2027, 0, 4))?.year).toBe(2026);
    expect(rankedYearAt(Date.UTC(2027, 2, 1))?.year).toBe(2027);
    expect(rankedYearAt(Date.UTC(2025, 11, 1))).toBeNull();
  });

  it("names a year's first season for a moment before its first day (a reset read a few days early)", () => {
    const y2027 = RANKED_YEARS.find((y) => y.year === 2027)!;
    expect(seasonOfYearAt(y2027, Date.UTC(2027, 0, 3)).label).toBe("Season 1");
    // The 2026 ladder read in January 2027 (an account not reset yet) is still in its Season 3.
    expect(seasonOfYearAt(RANKED_YEARS[0]!, Date.UTC(2027, 0, 20)).label).toBe("Season 3");
  });
});
