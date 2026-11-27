import { describe, expect, it } from "vitest";
import { abilityFixture } from "./ability-fixture";
import { rangeReviewRows } from "./ability-ranges";
import { countRangeReviews } from "./range-review";

/* The version-check's counts of the reviewed ability ranges (docs/CHAMPION_INTEL.md, "Ranges"), on the offline fixture (Data Dragon 16.22.1): counts only. */

const fixture = abilityFixture();
const at = new Date("2026-11-27T12:00:00Z");

describe("the ability ranges' counts", () => {
  it("count every spell of the stored abilities against the committed table: shown, Global, self, none, hidden since a change, not reviewed", () => {
    const c = countRangeReviews(fixture.champions, fixture.version, undefined, at);
    expect(c).toMatchObject({ version: "16.22.1", spells: 692, shown: 89, global: 7, self: 2, none: 67, changedSinceReview: 0, notReviewed: 527, noRangeYet: 0, rows: rangeReviewRows().length, at: "2026-11-27T12:00:00.000Z" });
    expect(c.shown + c.global + c.self + c.none + c.changedSinceReview + c.notReviewed + c.noRangeYet).toBe(c.spells);
    expect(c.reviewedVersions).toEqual(["16.23.1"]);
  });

  it("count a spell Riot changed since its row as hidden, and one stored before rules format 5 as waiting for the next read, never as shown", () => {
    const champions = structuredClone(fixture.champions);
    champions.Ahri!.abilities.find((a) => a.slot === "Q")!.textHash = "0000000000000000";
    for (const a of champions.Zed!.abilities) delete a.range;
    const c = countRangeReviews(champions, "16.22.1", undefined, at);
    expect(c.changedSinceReview).toBe(1);
    expect(c.noRangeYet).toBe(4);
    expect(c.shown).toBeLessThan(89);
  });
});
