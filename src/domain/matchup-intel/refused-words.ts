/*
  MATCHUP INTEL's refused words (docs/MATCHUP_INTEL.md, "Curated notes", Rules): the words and
  phrases no curated text and no fixed sentence of the page may use, and the words that give a value
  as an estimate. Shared by the curation rules (curated.test.ts) and the assembled reference's
  fixed sentences (wording.test.ts), so both are held to the same list.
*/

/**
 * Words and phrases no briefing point or matchup interaction uses. Riot's League of Legends policies
 * (https://developer.riotgames.com/docs/lol) say products "may highlight decisions that are
 * important and give multiple choices", and list "Apps that dictate player decisions" among the
 * uses that will not be approved (docs/MATCHUP_INTEL.md, "Curated notes"). Each matches as a whole
 * word or phrase, in any case, with a straight or curly apostrophe: "win" does not match "Wind
 * Slash", nor "counter" "encounter".
 */
export const REFUSED_WORDS: ReadonlyArray<{ why: string; words: readonly string[] }> = [
  { why: "an absolute claim", words: ["always", "never", "every time", "guaranteed", "guarantee", "guarantees", "certainly", "definitely", "surely", "impossible"] },
  {
    why: "an instruction to the player",
    words: ["must", "should", "shouldn't", "ought", "need to", "have to", "make sure", "be sure", "avoid", "try to", "wait for", "remember to", "you", "your", "yours", "yourself", "you're", "you'll", "you'd", "you've"],
  },
  {
    why: "a verdict on the matchup",
    words: ["easy", "easier", "easiest", "easily", "free win", "free kill", "auto-win", "auto win", "autowin", "can't lose", "cannot lose", "can't win", "cannot win", "win", "wins", "winning", "winnable", "unwinnable", "best", "optimal", "counter", "counters", "countered", "counter-pick", "counterpick", "punish", "punishes", "punished", "punishing", "outplay", "outplays", "abuse", "exploit", "dominate", "dominates", "stomp", "all-in"],
  },
];

/** What may stand next to a refused word inside a longer one: a letter, a digit, "_", an apostrophe or a hyphen. */
const WORD_CHAR = "[\\p{L}\\p{N}_'’-]";
const REFUSED: ReadonlyArray<{ word: string; why: string; pattern: RegExp }> = REFUSED_WORDS.flatMap(({ why, words }) =>
  words.map((word) => {
    const body = word
      .split(" ")
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/'/g, "['’]"))
      .join("\\s+");
    return { word, why, pattern: new RegExp(`(?<!${WORD_CHAR})${body}(?!${WORD_CHAR})`, "iu") };
  }),
);

/** The refused words a text uses (REFUSED_WORDS), each with why it is refused. */
export function refusedWords(text: string): Array<{ word: string; why: string }> {
  return REFUSED.filter((r) => r.pattern.test(text)).map(({ word, why }) => ({ word, why }));
}

/**
 * Words that give a value as an estimate, as whole words in any case. A value the wiki marks as
 * estimated is left out (docs/MATCHUP_INTEL.md, "Curated notes", Rules): Bellows Breath's page
 * gives the speed below which Ornn does not lunge as an estimate, and the notes once repeated it.
 */
export const ESTIMATE_WORDS = ["estimated", "estimate", "estimates", "approximately", "approximate", "roughly"] as const;
const ESTIMATE = new RegExp(`(?<!${WORD_CHAR})(${ESTIMATE_WORDS.join("|")})(?!${WORD_CHAR})`, "iu");

/** The word a text gives a value as an estimate with, in lower case, or null. */
export function estimateWord(text: string): string | null {
  return ESTIMATE.exec(text)?.[1]?.toLowerCase() ?? null;
}
