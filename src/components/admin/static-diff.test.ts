import { describe, expect, it } from "vitest";
import { rangeReviewLines, staticDiffLines } from "./static-diff";

/* Admin's view of the per-version diff of Riot's static data (server/riot/static/digests.ts): counts and patch names only, in each state. */

const recorded = { champion: 172, item: 1_204, rune: 63 };

describe("Admin's static-data diff", () => {
  it("no digests yet", () => {
    expect(staticDiffLines({ digests: null, failedPatch: null })).toEqual([{ text: "No patch recorded yet.", warn: false }]);
  });

  it("one patch only: its counts, and nothing to compare with", () => {
    expect(staticDiffLines({ digests: { patch: "16.22", recorded, previous: null, changed: null }, failedPatch: null }).map((l) => l.text)).toEqual(["26.22 recorded: 172 champions, 1,204 items, 63 runes.", "No earlier patch recorded to compare with."]);
  });

  it("two patches: what changed against the earlier, each count through format.ts, one in the singular", () => {
    const lines = staticDiffLines({ digests: { patch: "16.23", recorded, previous: "16.22", changed: { champion: 4, item: 11, rune: 0 } }, failedPatch: null });
    expect(lines.map((l) => l.text)).toEqual(["26.23 recorded: 172 champions, 1,204 items, 63 runes.", "26.23 against 26.22: 4 champions, 11 items, 0 runes changed."]);
    expect(staticDiffLines({ digests: { patch: "16.23", recorded: { champion: 1, item: 1, rune: 1 }, previous: "16.22", changed: { champion: 1, item: 0, rune: 1 } }, failedPatch: null })[1]!.text).toBe("26.23 against 26.22: 1 champion, 0 items, 1 rune changed.");
    // Two patches with nothing recorded in both.
    expect(staticDiffLines({ digests: { patch: "16.23", recorded, previous: "16.22", changed: null }, failedPatch: null })[1]!.text).toBe("26.23 against 26.22: nothing recorded in both to compare.");
  });

  it("a failed attempt: marked after the figures, or alone when nothing is recorded", () => {
    const lines = staticDiffLines({ digests: { patch: "16.22", recorded, previous: "16.21", changed: { champion: 0, item: 2, rune: 0 } }, failedPatch: "16.23" });
    expect(lines.at(-1)).toEqual({ text: "The attempt to record 26.23 failed; it is tried again after a day.", warn: true });
    expect(staticDiffLines({ digests: null, failedPatch: "16.22" })).toEqual([
      { text: "No patch recorded yet.", warn: false },
      { text: "The attempt to record 26.22 failed; it is tried again after a day.", warn: true },
    ]);
  });

  it("the ability ranges: what is shown, a warning when Riot changed reviewed abilities, and abilities stored before ranges were read", () => {
    const counts = { version: "16.23.1", shown: 89, global: 7, changedSinceReview: 0, notReviewed: 527, noRangeYet: 0 };
    expect(rangeReviewLines(counts)).toEqual([{ text: "Ability ranges at 26.23: 89 shown, 7 Global, 527 not reviewed yet.", warn: false }]);
    expect(rangeReviewLines({ ...counts, changedSinceReview: 3 })[1]).toEqual({ text: "3 ranges are hidden until reviewed again: Riot changed those abilities.", warn: true });
    expect(rangeReviewLines({ ...counts, changedSinceReview: 1 })[1]!.text).toBe("1 range is hidden until reviewed again: Riot changed that ability.");
    expect(rangeReviewLines({ ...counts, version: null, notReviewed: 1_204, noRangeYet: 692 }).map((l) => l.text)).toEqual(["Ability ranges: 89 shown, 7 Global, 1,204 not reviewed yet.", "692 abilities were stored before ranges were read; the next game-data update reads them."]);
  });
});
