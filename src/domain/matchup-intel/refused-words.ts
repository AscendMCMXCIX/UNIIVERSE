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

/**
 * The second list (docs/MATCHUP_INTEL.md, "Words"): for the sentences built from the team's own
 * games (S7b's evidence templates, and the fixed evidence lines S7a shows in their place). Their
 * vocabulary is agreed: "you/your" only as the possessive of the viewer's own games ("In your
 * games", "4 of your 9 games"), and "won/lost" only as counted results. Instructions, verdicts
 * (win as a verdict included) and absolutes stay refused. Riot's tips are neither list's: they are
 * attributed quotes, held byte-equal to Data Dragon instead.
 */
export const EVIDENCE_REFUSED_WORDS: ReadonlyArray<{ why: string; words: readonly string[] }> = [
  { why: "an absolute claim", words: ["always", "never", "every time", "guaranteed", "guarantee", "guarantees", "certainly", "definitely", "surely", "impossible"] },
  { why: "an instruction to the player", words: ["must", "should", "shouldn't", "ought", "need to", "needs to", "have to", "make sure", "be sure", "avoid", "try to", "wait for", "remember to", "you", "yours", "yourself", "you're", "you'll", "you'd", "you've", "your"] },
  { why: "a verdict on the matchup", words: ["best", "optimal", "counter", "counters", "countered", "counter-pick", "counterpick", "easy", "easier", "easiest", "win", "wins", "winning", "winnable", "unwinnable", "recommended", "recommend", "should build", "core build"] },
];

const EVIDENCE_REFUSED = compile(EVIDENCE_REFUSED_WORDS);
/** The possessive the evidence lines may use: "In your games", "of your 9 games", "your 3 games on patch 26.23". */
const OWN_GAMES = /\b(?:in|of|from)\s+your\s+(?:\d+\s+)?(?:games?|matches?)\b|\byour\s+\d+\s+(?:games?|matches?)\b/giu;

/** The refused words an evidence sentence uses (EVIDENCE_REFUSED_WORDS), the possessive of the viewer's own games allowed. */
export function evidenceRefusedWords(text: string): Array<{ word: string; why: string }> {
  const rest = text.replace(OWN_GAMES, " ");
  return EVIDENCE_REFUSED.filter((r) => r.pattern.test(rest)).map(({ word, why }) => ({ word, why }));
}
