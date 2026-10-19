import { describe, expect, it } from "vitest";
import { knownRankLabel } from "./known-rank";

describe("last-known rank badge", () => {
  const now = new Date("2026-10-19T12:00:00Z");
  it("shows a recent rank plainly, with the date it was read on hover", () => {
    expect(knownRankLabel({ tier: "GOLD", division: "II", asOf: "2026-10-10T08:00:00Z" }, now)).toEqual({
      text: "Gold 2",
      title: "Ranked Solo/Duo, last known 10 Oct 2026: their rank then, not at the time of this match",
    });
    expect(knownRankLabel({ tier: "GRANDMASTER", division: null, asOf: "2026-10-01T00:00:00Z" }, now).text).toBe("GM");
  });

  it("puts the month on the badge once the rank is over 30 days old, and the year from another year", () => {
    expect(knownRankLabel({ tier: "PLATINUM", division: "IV", asOf: "2026-08-02T00:00:00Z" }, now).text).toBe("Plat 4 · Aug");
    expect(knownRankLabel({ tier: "EMERALD", division: "I", asOf: "2025-12-30T00:00:00Z" }, now).text).toBe("Emerald 1 · Dec 2025");
    expect(knownRankLabel({ tier: "UNKNOWNTIER", division: "I", asOf: "2026-10-18T00:00:00Z" }, now).text).toBe("Unknowntier 1");
  });
});
