/*
  MATCHUP INTEL's refused words: THE one list (docs/MATCHUP_INTEL.md, "Reviewed notes", Rules), in
  plain JavaScript so that every reader holds the same words with the same matching:

  - the notes' validation (./refused-words.ts, ./notes.ts validateNote): every point and every
    source's title, on each save on the server and live in the editor;
  - the band's own sentences (./words.test.ts, ./early-kit.test.ts);
  - the browser tests (e2e/champion-matchup.spec.ts) and the Production check (scripts/matchup-facts.mjs,
    plain Node, the fact "no instruction or verdict words in the band"), each over every text in the
    band.

  So a note the editor accepts can never fail the Production check, and the check refuses no word a
  note may hold. Restored from the Matchup Intel retired on 23 Nov 2026, with the comparison verdicts
  (favoured, advantage, stronger, weaker, better, worse, faster, slower) and every form of a verdict
  verb (recommend…, punish…, outplay…) added on 27 Nov 2026, when the notes' list and the check's
  pattern were found to differ.

  Riot's League of Legends policies (https://developer.riotgames.com/docs/lol) say products "may
  highlight decisions that are important and give multiple choices", and list "Apps that dictate
  player decisions" among the uses that will not be approved (docs/RIOT_COMPLIANCE.md).

  Each entry matches as a whole word or phrase, in any case, with a straight or curly apostrophe: "win"
  does not match "Wind Slash", nor "counter" "encounter". A word is letters, digits and "_": an
  apostrophe or a hyphen ends it, so "should've", "easy-to-land" and "counter-attack" are refused as
  "should", "easy" and "counter" (as the check's own reading of a word would see them). An entry
  ending in "*" also matches every longer form: "recommend*" is recommend, recommends, recommended,
  recommendation.
*/

/** @type {ReadonlyArray<{ why: string; words: readonly string[] }>} */
export const REFUSED_WORDS = [
  { why: "an absolute claim", words: ["always", "never", "every time", "guaranteed", "guarantee", "guarantees", "certainly", "definitely", "surely", "impossible"] },
  {
    why: "an instruction to the player",
    words: ["must", "should", "shouldn't", "ought", "need to", "needs to", "have to", "make sure", "be sure", "avoid", "try to", "wait for", "remember to", "you", "your", "yours", "yourself", "you're", "you'll", "you'd", "you've", "should build", "core build"],
  },
  {
    why: "a verdict on the matchup",
    words: [
      "easy", "easier", "easiest", "easily", "free win", "free kill", "auto-win", "auto win", "autowin", "can't lose", "cannot lose", "can't win", "cannot win", "win", "wins", "winning", "winnable", "unwinnable", "best", "optimal",
      "counter", "counters", "countered", "countering", "counter-pick", "counterpick", "punish*", "outplay*", "abuse", "exploit", "dominate", "dominates", "stomp", "all-in",
      "favoured", "favored", "advantage", "stronger", "weaker", "recommend*", "better", "worse", "faster", "slower",
    ],
  },
];

/** What a word is made of: a letter, a digit or "_" (an apostrophe or a hyphen is between words). */
const WORD_CHAR = "[\\p{L}\\p{N}_]";

/** The flags every pattern is compiled with: any case, Unicode. */
export const REFUSED_FLAGS = "iu";

/** One entry as a pattern's source: a whole word or phrase, any run of spaces between its words, either apostrophe, "*" for its longer forms. */
export function refusedSource(word) {
  const stem = word.endsWith("*");
  const bare = stem ? word.slice(0, -1) : word;
  const body = bare
    .split(" ")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/'/g, "['’]"))
    .join("\\s+");
  return `(?<!${WORD_CHAR})${body}${stem ? `${WORD_CHAR}*` : ""}(?!${WORD_CHAR})`;
}

/** Every entry of the list with why it is refused and its pattern's source (compile with REFUSED_FLAGS). */
export function refusedSources(list = REFUSED_WORDS) {
  return list.flatMap(({ why, words }) => words.map((word) => ({ word, why, source: refusedSource(word) })));
}
