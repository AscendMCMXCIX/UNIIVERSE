import { REFUSED_FLAGS, REFUSED_WORDS as LIST, refusedSources } from "./refused-words-list.mjs";

/*
  MATCHUP INTEL's refused words (docs/MATCHUP_INTEL.md, "Reviewed notes", Rules): the words and
  phrases no reviewed note (its points and its sources' titles) and no sentence of the band may use,
  and the words that give a value as an estimate.

  The list itself is ./refused-words-list.mjs, plain JavaScript, so the Production check (plain
  Node, scripts/matchup-facts.mjs) and the browser tests read the very same words with the same
  matching: a note the editor accepts can never fail the check's "no instruction or verdict words in
  the band", and the check refuses no word a note may hold (refused-words.test.ts). One list for the
  notes and for the band's own sentences: "won", a counted result ("Riven's side won"), is not on it;
  "win" and "wins" are.
*/

/**
 * Words and phrases no note uses, by why. Each matches as a whole word or phrase, in any case, with
 * a straight or curly apostrophe; an apostrophe or a hyphen ends a word; "*" takes in every longer
 * form ("recommend*": recommends, recommended, recommendation).
 */
export const REFUSED_WORDS: ReadonlyArray<{ why: string; words: readonly string[] }> = LIST;

/** Each listed word or phrase as a pattern, compiled once. */
const REFUSED = refusedSources().map(({ word, why, source }) => ({ word, why, pattern: new RegExp(source, REFUSED_FLAGS) }));

/** The refused words a text uses (REFUSED_WORDS), each with why it is refused: the listed word, or for a "*" entry the form the text uses ("outplayed"). */
export function refusedWords(text: string): Array<{ word: string; why: string }> {
  return REFUSED.flatMap(({ word, why, pattern }) => {
    const m = pattern.exec(text);
    return m ? [{ word: word.endsWith("*") ? m[0].toLowerCase() : word, why }] : [];
  });
}

/** What may stand next to an estimate word inside a longer one. */
const WORD_CHAR = "[\\p{L}\\p{N}_'’-]";

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
