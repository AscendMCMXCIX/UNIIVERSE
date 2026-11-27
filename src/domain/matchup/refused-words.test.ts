import { describe, expect, it } from "vitest";
import { ESTIMATE_WORDS, REFUSED_WORDS, estimateWord, evidenceRefusedWords, refusedWords } from "./refused-words";

/* Matchup Intel's refused words (docs/MATCHUP_INTEL.md, "Reviewed notes", Rules), restored from 23 Nov 2026 with six comparison verdicts added. */

describe("the refused words", () => {
  it("match whole words and phrases in any case, straight or curly apostrophes, never inside a longer word", () => {
    expect(refusedWords("You SHOULD look at it").map((r) => r.word)).toEqual(["should", "you"]);
    expect(refusedWords("you’re close").map((r) => r.word)).toContain("you're");
    expect(refusedWords("Wind Slash meets an encounter")).toEqual([]);
    expect(refusedWords("A free  win at level 2").map((r) => r.word)).toEqual(expect.arrayContaining(["free win", "win"]));
  });

  it("refuse the comparison verdicts added on 27 Nov 2026", () => {
    for (const word of ["favoured", "favored", "advantage", "stronger", "weaker", "recommended"]) {
      expect(REFUSED_WORDS.flatMap((g) => g.words)).toContain(word);
      expect(refusedWords(`Darius is ${word} here`).map((r) => r.why)).toContain("a verdict on the matchup");
    }
  });

  it("name estimate words", () => {
    expect(estimateWord("roughly 500 units")).toBe("roughly");
    expect(estimateWord("Estimated range")).toBe("estimated");
    expect(estimateWord("535 units")).toBeNull();
    expect(ESTIMATE_WORDS).toContain("approximately");
  });

  it("allow 'won' as a counted result in the band's own sentences, never 'win' or a comparison", () => {
    expect(evidenceRefusedWords("Riven's side won 8 of 14 games")).toEqual([]);
    expect(evidenceRefusedWords("Riven wins lane").map((r) => r.word)).toContain("wins");
    expect(evidenceRefusedWords("Riven is faster").map((r) => r.word)).toContain("faster");
    expect(evidenceRefusedWords("your games").map((r) => r.word)).toContain("your");
  });
});
