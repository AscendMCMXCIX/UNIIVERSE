import { describe, expect, it } from "vitest";
import { MAX_WORDS, REFUSED_WORDS, refusedWordsIn, wordCount as appWordCount } from "@/domain/match-notes";
import { noteRules, postGameVerdicts, refusedIn, wordCount, type PostGameRead } from "../../../scripts/post-game-facts.mjs";

/*
  The Production check's post-game facts (scripts/post-game-facts.mjs): the note rules it reads from
  src/domain/match-notes.ts are the module's own exports, and it finds refused words and counts words
  as the app does. The reading below is a demo game as the live check's own reader saw it (20 Nov
  2026), its notes replaced by made-up sentences of the same shape.
*/

const rules = noteRules();
const DEMO: PostGameRead = {
  open: true,
  result: "Defeat",
  itemSlots: 7,
  itemsNotRecorded: false,
  trinketRound: true,
  spellRuneSlots: 4,
  runePage: true,
  tiles: 6,
  kda: 1,
  csPerMin: 1,
  damageShare: 1,
  lane: "clear",
  laneWords: "Lane vs",
  notesShown: true,
  notesFallback: false,
  sections: { well: 1, wrong: 2, focus: 0 },
  notes: ["3 solo kills.", "KDA lower than in 23 of their last 26 ranked Top games (1.38; usually 3.30).", "8 deaths, the most on the team."],
  steps: 6,
};
const failed = (at: PostGameRead) => postGameVerdicts({ kind: "desktop", at, rules }).filter((v) => v.status === "FAIL").map((v) => v.name);

describe("the post-game facts' note rules", () => {
  it("are the app's own list and word limit", () => {
    expect(rules.refused).toEqual([...REFUSED_WORDS]);
    expect(rules.maxWords).toBe(MAX_WORDS);
  });
  it("find refused words and count words as the app does", () => {
    const samples = [...REFUSED_WORDS.map((w) => `It was ${w} here at 10 minutes.`), "Goodness, 3 kills.", "Intent: 5 wards placed", "Due  to 2 deaths", "A note with 12 CS more than the lane at 10:00."];
    for (const s of samples) {
      expect(refusedIn(s, rules.refused)).toEqual(refusedWordsIn(s));
      expect(wordCount(s)).toBe(appWordCount(s));
    }
  });
  it("refuse to run on a source without the list", () => {
    expect(() => noteRules("export const OTHER = 1;")).toThrow();
  });
});

describe("the post-game facts", () => {
  it("pass on the demo's open game", () => {
    expect(postGameVerdicts({ kind: "desktop", at: DEMO, rules }).map((v) => v.status)).toEqual(Array(7).fill("PASS"));
  });
  it("fail the regressions they exist for", () => {
    expect(failed({ ...DEMO, result: "" })).toHaveLength(1);
    expect(failed({ ...DEMO, itemSlots: 6 })).toHaveLength(1);
    expect(failed({ ...DEMO, spellRuneSlots: 2 })).toHaveLength(1);
    expect(failed({ ...DEMO, kda: 2 })).toHaveLength(1);
    expect(failed({ ...DEMO, tiles: 4 })).toHaveLength(1);
    expect(failed({ ...DEMO, lane: null, laneWords: "" })).toHaveLength(1);
    expect(failed({ ...DEMO, steps: 3 })).toHaveLength(1);
  });
  it("fail notes over the limits, without a number, too long or with a refused word", () => {
    expect(failed({ ...DEMO, sections: { well: 3, wrong: 0, focus: 0 }, notes: ["1 a", "2 b", "3 c"] })).toHaveLength(1);
    expect(failed({ ...DEMO, sections: { well: 1, wrong: 0, focus: 0 }, notes: ["Solo kills."] })).toHaveLength(1);
    expect(failed({ ...DEMO, sections: { well: 1, wrong: 0, focus: 0 }, notes: [`${"word ".repeat(20)}1`] })).toHaveLength(1);
    expect(failed({ ...DEMO, sections: { well: 1, wrong: 0, focus: 0 }, notes: ["3 deaths because of the lane."] })).toHaveLength(1);
    expect(failed({ ...DEMO, sections: { well: 2, wrong: 2, focus: 0 }, notes: ["1 a"] })).toHaveLength(1);
  });
  it("warn, not fail, for a game without its items or its timeline", () => {
    const v = postGameVerdicts({ kind: "desktop", at: { ...DEMO, itemsNotRecorded: true, itemSlots: 0, notesShown: false, notesFallback: true, sections: null, notes: [] }, rules });
    expect(v.filter((x) => x.status === "FAIL")).toEqual([]);
    expect(v.filter((x) => x.status === "WARN")).toHaveLength(2);
  });
});
