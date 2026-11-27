import { describe, expect, it } from "vitest";
import { curationQueue, keyOf, type MeetCount } from "./curation";
import type { MatchupNote, NoteFreshness } from "./notes";

/* Matchup Intel's curation queue (docs/MATCHUP_INTEL.md, "Curation"): re-review first, then what the team meets most without a note. */

const meet = (over: Partial<MeetCount>): MeetCount => ({ role: "TOP", championId: null, opponentId: "Darius", games: 5, last: 1, withTimeline: 4, ...over });
const note = (over: Partial<MatchupNote>, freshness: NoteFreshness): { note: MatchupNote; freshness: NoteFreshness } => ({
  note: { id: "n", scope: "opponent", role: "TOP", opponentId: "Darius", championId: null, status: "published", points: [], sources: [], reviewedPatch: "16.22", reviewedVersion: "16.22.1", reviewedAt: null, kitHashes: {}, abilityHashes: {}, updatedAt: "", ...over },
  freshness,
});

describe("the curation queue", () => {
  it("lists notes needing re-review first, by games; then opponents not written, then pairings; then fresh ones", () => {
    const q = curationQueue(
      [meet({ opponentId: "Darius", games: 9 }), meet({ opponentId: "Garen", games: 12 }), meet({ opponentId: "Nasus", games: 3 }), meet({ championId: "Riven", opponentId: "Garen", games: 7 }), meet({ role: "MID", opponentId: "Ahri", games: 20 })],
      [note({ opponentId: "Darius" }, { state: "stale", distance: 2 }), note({ id: "m", opponentId: "Nasus" }, { state: "fresh", distance: 0 })],
    );
    expect(q.needsReview.map((e) => e.opponentId)).toEqual(["Darius"]);
    expect(q.notWritten.map((e) => `${e.scope}:${e.championId ?? ""}:${e.opponentId}`)).toEqual(["opponent::Ahri", "opponent::Garen", "pair:Riven:Garen"]);
    expect(q.fresh.map((e) => e.opponentId)).toEqual(["Nasus"]);
  });

  it("filters by role, keeps a note the team has not met, and counts a draft as written", () => {
    const q = curationQueue([meet({ opponentId: "Garen" })], [note({ opponentId: "Sion", status: "draft" }, { state: "fresh", distance: 0 }), note({ role: "MID", opponentId: "Zed" }, { state: "hidden-changed", changed: ["Zed"] })], "TOP");
    expect(q.drafts.map((e) => [e.opponentId, e.games])).toEqual([["Sion", 0]]);
    expect(q.needsReview).toEqual([]);
    expect(q.notWritten.map((e) => e.opponentId)).toEqual(["Garen"]);
    expect(keyOf("opponent", "TOP", "Darius", "Riven")).toBe("opponent|TOP|Darius|");
    // A record's mirror (one champion on both sides) is never a pairing to write about.
    expect(curationQueue([meet({ championId: "Jinx", opponentId: "Jinx" })], []).notWritten).toEqual([]);
  });
});
