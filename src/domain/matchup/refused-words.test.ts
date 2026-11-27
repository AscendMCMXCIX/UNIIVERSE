import { describe, expect, it } from "vitest";
import { ESTIMATE_WORDS, REFUSED_WORDS, estimateWord, refusedWords } from "./refused-words";
import { REFUSED_FLAGS, refusedSources } from "./refused-words-list.mjs";

/* Matchup Intel's refused words (docs/MATCHUP_INTEL.md, "Reviewed notes", Rules): one list, ./refused-words-list.mjs. */

const words = (text: string) => refusedWords(text).map((r) => r.word);

describe("the refused words", () => {
  it("match whole words and phrases in any case, straight or curly apostrophes, never inside a longer word", () => {
    expect(words("You SHOULD look at it")).toEqual(["should", "you"]);
    expect(words("you’re close")).toContain("you're");
    expect(refusedWords("Wind Slash meets an encounter")).toEqual([]);
    expect(refusedWords("Winter's Approach and the countdown")).toEqual([]);
    expect(words("A free  win at level 2")).toEqual(expect.arrayContaining(["free win", "win"]));
  });

  it("refuse the comparison verdicts", () => {
    for (const word of ["favoured", "favored", "advantage", "stronger", "weaker", "recommended", "better", "worse", "faster", "slower"]) {
      expect(REFUSED_WORDS.flatMap((g) => g.words).some((w) => w === word || (w.endsWith("*") && word.startsWith(w.slice(0, -1)))), word).toBe(true);
      expect(refusedWords(`Darius is ${word} here`).map((r) => r.why), word).toContain("a verdict on the matchup");
    }
  });

  // 27 Nov 2026: these passed the notes' save while the Production check's pattern refused them.
  it("refuse every form of a verdict verb, and a word an apostrophe or a hyphen joins to another", () => {
    expect(words("Zed's Q travels faster than Ahri's Q.")).toEqual(["faster"]);
    expect(words("Darius's E has a better reach at level 1.")).toEqual(["better"]);
    expect(words("Riven is often outplayed before level 6.")).toEqual(["outplayed"]);
    expect(words("Zed's R recommends caution.")).toEqual(["recommends"]);
    expect(words("A recommendation of the wiki.")).toEqual(["recommendation"]);
    expect(words("Zed's punishment window.")).toEqual(["punishment"]);
    expect(words("Ahri's E is easy-to-land at range.")).toEqual(["easy"]);
    expect(words("Zed's R has a counter-attack window.")).toEqual(["counter"]);
    expect(words("Zed's W should've landed.")).toEqual(["should"]);
    expect(words("Ahri's charm is slower to land.")).toEqual(["slower"]);
    // "won" is a counted result, never a verdict: the band's own "Riven's side won".
    expect(refusedWords("Riven's side won 8 of 14 games")).toEqual([]);
    expect(words("Riven wins lane")).toContain("wins");
  });

  it("compile from the one list the Production check reads, with the same flags", () => {
    const sources = refusedSources();
    expect(sources).toHaveLength(REFUSED_WORDS.flatMap((g) => g.words).length);
    expect(REFUSED_FLAGS).toBe("iu");
    for (const s of sources) expect(new RegExp(s.source, REFUSED_FLAGS).test(s.word.replace(/\*$/, "")), s.word).toBe(true);
  });

  it("name estimate words", () => {
    expect(estimateWord("roughly 500 units")).toBe("roughly");
    expect(estimateWord("Estimated range")).toBe("estimated");
    expect(estimateWord("535 units")).toBeNull();
    expect(ESTIMATE_WORDS).toContain("approximately");
  });
});
