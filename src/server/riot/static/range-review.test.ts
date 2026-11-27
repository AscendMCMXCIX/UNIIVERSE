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
    // Mel's W, which Riot changed at 16.23.1, is the one changed row: reviewed as self, so it showed nothing and hides nothing.
    expect(c).toMatchObject({ version: "16.22.1", spells: 692, shown: 269, global: 11, self: 180, none: 231, changedSinceReview: 1, hiddenSinceReview: 0, notReviewed: 0, noRangeYet: 0, rows: rangeReviewRows().length, at: "2026-11-27T12:00:00.000Z" });
    expect(c.shown + c.global + c.self + c.none + c.changedSinceReview + c.notReviewed + c.noRangeYet).toBe(c.spells);
    expect(c.reviewedVersions).toEqual(["16.23.1"]);
  });

  it("count a spell Riot changed since its row as hidden, and one stored before rules format 5 as waiting for the next read, never as shown", () => {
    const champions = structuredClone(fixture.champions);
    champions.Ahri!.abilities.find((a) => a.slot === "Q")!.textHash = "0000000000000000";
    for (const a of champions.Zed!.abilities) delete a.range;
    const c = countRangeReviews(champions, "16.22.1", undefined, at);
    // Mel's W (Riot changed it at 16.23.1, the review's version) and Ahri's Q; only Ahri's Q (a reach) showed a range the page now hides.
    expect(c.changedSinceReview).toBe(2);
    expect(c.hiddenSinceReview).toBe(1);
    expect(c.noRangeYet).toBe(4);
    expect(c.shown).toBeLessThan(269);
  });

  it("count as hidden only a changed row that showed a range (reach or Global), never a changed self or none row", () => {
    const champions = structuredClone(fixture.champions);
    const rows = rangeReviewRows();
    const pick = (kind: string) => rows.find((r) => r.kind === kind && r.champion !== "Mel" && champions[r.champion])!;
    const changed = ["reach", "global", "self", "none"].map(pick);
    for (const r of changed) champions[r.champion]!.abilities.find((a) => a.slot === r.slot)!.textHash = "0000000000000000";
    const c = countRangeReviews(champions, "16.22.1", undefined, at);
    // Mel's W and the four changed here: five to review again, two of them ranges the page stopped showing.
    expect(c).toMatchObject({ changedSinceReview: 5, hiddenSinceReview: 2, shown: 268, global: 10, self: 179, none: 230 });
  });
});
