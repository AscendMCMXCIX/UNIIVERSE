import { describe, expect, it } from "vitest";
import { staticDiffLines } from "./static-diff";

/* Admin's view of Matchup Intel's per-version diff (docs/MATCHUP_INTEL.md, "Admin for the diff"): counts and patch names only, in each state. */

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
});
