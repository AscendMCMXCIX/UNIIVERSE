import { describe, expect, it } from "vitest";
import { MAX_POINTS, MAX_POINT_REFS, MAX_POINT_WORDS, validateNote, type MatchupNote } from "@/domain/matchup/notes";
import { LONGEST_POINTS, withLongestPoints } from "./longest-notes";

/* The browser tests' longest notes (longest-notes.ts): as long as a note may be, and a note the save accepts. */

const stored = (over: Partial<MatchupNote>): MatchupNote => ({
  id: "n1",
  scope: "opponent",
  role: "MID",
  opponentId: "Zed",
  championId: null,
  status: "published",
  points: [{ text: "Zed's R marks its target.", refs: ["Zed.R"], levels: null }],
  sources: [{ kind: "ddragon", title: "Zed's abilities in Riot's Data Dragon", url: "", patch: "26.23" }],
  reviewedPatch: "16.23",
  reviewedVersion: "16.23.1",
  reviewedAt: null,
  kitHashes: null,
  abilityHashes: null,
  updatedAt: new Date(0).toISOString(),
  ...over,
});
const kits = { Zed: ["P", "Q", "W", "E", "R"], Ahri: ["P", "Q", "W", "E", "R"] };

describe("the longest notes", () => {
  it("are MAX_POINTS points of exactly MAX_POINT_WORDS words, each with a level tag", () => {
    expect(LONGEST_POINTS).toHaveLength(MAX_POINTS);
    for (const p of LONGEST_POINTS) {
      expect(p.text.split(/\s+/).length, p.text).toBe(MAX_POINT_WORDS);
      expect(p.levels).not.toBeNull();
    }
  });

  it("name MAX_POINT_REFS abilities of the note's own champions and pass the notes' rules, an opponent note and a pair note", () => {
    for (const note of [stored({}), stored({ scope: "pair", championId: "Ahri" })]) {
      const long = withLongestPoints(note);
      for (const p of long.points) expect(new Set(p.refs).size, p.text).toBe(MAX_POINT_REFS);
      expect(long.points.flatMap((p) => p.refs).every((r) => [note.opponentId, note.championId].includes(r.split(".")[0]!))).toBe(true);
      expect(validateNote(long, { kits, roster: new Set(["Zed", "Ahri"]), names: [] })).toEqual([]);
    }
  });
});
