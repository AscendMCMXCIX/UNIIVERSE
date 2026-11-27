/*
  MATCHUP INTEL's refused words (docs/MATCHUP_INTEL.md, "Reviewed notes", Rules): the words and
  phrases no reviewed note and no fixed sentence of the band may use, and the words that give a
  value as an estimate. Restored from the Matchup Intel retired on 23 Nov 2026 (its lists
  unchanged), with six more verdict words of the comparison kind (favoured, favored, advantage,
  stronger, weaker, recommended). Shared by the notes' validation (./notes.ts) and the band's fixed
  words (./words.test.ts), so both are held to one list.
*/

/**
 * Words and phrases no note uses. Riot's League of Legends policies
 * (https://developer.riotgames.com/docs/lol) say products "may highlight decisions that are
 * important and give multiple choices", and list "Apps that dictate player decisions" among the
 * uses that will not be approved (docs/RIOT_COMPLIANCE.md). Each matches as a whole word or phrase,
 * in any case, with a straight or curly apostrophe: "win" does not match "Wind Slash", nor
 * "counter" "encounter".
 */
export const REFUSED_WORDS: ReadonlyArray<{ why: string; words: readonly string[] }> = [
  { why: "an absolute claim", words: ["always", "never", "every time", "guaranteed", "guarantee", "guarantees", "certainly", "definitely", "surely", "impossible"] },
  {
    why: "an instruction to the player",
    words: ["must", "should", "shouldn't", "ought", "need to", "have to", "make sure", "be sure", "avoid", "try to", "wait for", "remember to", "you", "your", "yours", "yourself", "you're", "you'll", "you'd", "you've"],
  },
  {
    why: "a verdict on the matchup",
    words: [
      "easy", "easier", "easiest", "easily", "free win", "free kill", "auto-win", "auto win", "autowin", "can't lose", "cannot lose", "can't win", "cannot win", "win", "wins", "winning", "winnable", "unwinnable", "best", "optimal",
      "counter", "counters", "countered", "counter-pick", "counterpick", "punish", "punishes", "punished", "punishing", "outplay", "outplays", "abuse", "exploit", "dominate", "dominates", "stomp", "all-in",
      "favoured", "favored", "advantage", "stronger", "weaker", "recommended",
    ],
  },
];

/** What may stand next to a refused word inside a longer one: a letter, a digit, "_", an apostrophe or a hyphen. */
const WORD_CHAR = "[\\p{L}\\p{N}_'’-]";
/** Each listed word or phrase as a whole-word pattern, in any case, with a straight or curly apostrophe. */
function compile(list: ReadonlyArray<{ why: string; words: readonly string[] }>): ReadonlyArray<{ word: string; why: string; pattern: RegExp }> {
  return list.flatMap(({ why, words }) =>
    words.map((word) => {
      const body = word
        .split(" ")
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/'/g, "['’]"))
        .join("\\s+");
      return { word, why, pattern: new RegExp(`(?<!${WORD_CHAR})${body}(?!${WORD_CHAR})`, "iu") };
    }),
  );
}
const REFUSED = compile(REFUSED_WORDS);

/** The refused words a text uses (REFUSED_WORDS), each with why it is refused. */
export function refusedWords(text: string): Array<{ word: string; why: string }> {
  return REFUSED.filter((r) => r.pattern.test(text)).map(({ word, why }) => ({ word, why }));
}

/**
 * Words that give a value as an estimate, as whole words in any case: a value a source marks as
 * estimated is left out of a note.
 */
export const ESTIMATE_WORDS = ["estimated", "estimate", "estimates", "approximately", "approximate", "roughly"] as const;
const ESTIMATE = new RegExp(`(?<!${WORD_CHAR})(${ESTIMATE_WORDS.join("|")})(?!${WORD_CHAR})`, "iu");

/** The word a text gives a value as an estimate with, in lower case, or null. */
export function estimateWord(text: string): string | null {
  return ESTIMATE.exec(text)?.[1]?.toLowerCase() ?? null;
}

/**
 * The second list, for the band's own sentences built from the team's games ("Games won", "8 of
 * 14 games"): "won" only as a counted result. Instructions, verdicts (win as a verdict included)
 * and absolutes stay refused, and "you/your" with them: the band is opened for teammates' pairs too.
 */
export const EVIDENCE_REFUSED_WORDS: ReadonlyArray<{ why: string; words: readonly string[] }> = [
  { why: "an absolute claim", words: ["always", "never", "every time", "guaranteed", "guarantee", "guarantees", "certainly", "definitely", "surely", "impossible"] },
  { why: "an instruction to the player", words: ["must", "should", "shouldn't", "ought", "need to", "needs to", "have to", "make sure", "be sure", "avoid", "try to", "wait for", "remember to", "you", "yours", "yourself", "you're", "you'll", "you'd", "you've", "your"] },
  { why: "a verdict on the matchup", words: ["best", "optimal", "counter", "counters", "countered", "counter-pick", "counterpick", "easy", "easier", "easiest", "win", "wins", "winning", "winnable", "unwinnable", "recommended", "recommend", "should build", "core build", "favoured", "favored", "advantage", "stronger", "weaker", "better", "worse", "faster", "slower"] },
];

const EVIDENCE_REFUSED = compile(EVIDENCE_REFUSED_WORDS);

/** The refused words a band sentence uses (EVIDENCE_REFUSED_WORDS). */
export function evidenceRefusedWords(text: string): Array<{ word: string; why: string }> {
  return EVIDENCE_REFUSED.filter((r) => r.pattern.test(text)).map(({ word, why }) => ({ word, why }));
}
