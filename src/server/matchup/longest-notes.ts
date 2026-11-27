import { MAX_POINT_REFS, MAX_POINTS, scopeChampions, type MatchupNote, type NotePoint } from "@/domain/matchup/notes";

/*
  BROWSER TESTS ONLY (the in-memory demo, through server/demo/test-hooks longestNotesForTest):
  the longest notes a note may hold, so Matchup Intel's band can be measured with them
  (e2e/champion-matchup.spec.ts, "one screen … with the longest notes"): every shown note's points
  replaced by MAX_POINTS points of exactly MAX_POINT_WORDS words each, long words, a level tag and
  MAX_POINT_REFS abilities of the note's own champions. Observations that pass the notes' rules
  (longest-notes.test.ts validates them), about no champion in particular. Nothing is stored.
*/

const SLOTS = ["P", "Q", "W", "E", "R"] as const;

/** The longest points' words: MAX_POINT_WORDS words each, from 217 to 242 characters. */
export const LONGEST_POINTS: ReadonlyArray<Pick<NotePoint, "text" | "levels">> = [
  {
    text: "This ability's missile travels along a straight line, stops at the first champion it reaches, marks that champion for several seconds, and a second cast inside that window dashes the caster toward the marked champion.",
    levels: "1-3",
  },
  {
    text: "The shadow created by this ability copies the caster's following basic abilities from its own position, so two identical skillshots arrive from separate directions, and recasting it exchanges the caster's location with the shadow's location.",
    levels: "1-3",
  },
  {
    text: "While this passive's tally builds up, each damaging ability applies another stack, and the fifth stack within several seconds triggers additional magic damage that scales with ability power and the target champion's missing health afterwards.",
    levels: "6",
  },
  {
    text: "Casting this ultimate makes the caster untargetable while travelling behind the selected champion, applies a mark that stores part of the following damage dealt, then detonates after three seconds, repeating that stored damage once more.",
    levels: "6",
  },
];

/** A note with its points replaced by the longest ones: each naming MAX_POINT_REFS abilities of the note's champions, in turn. */
export function withLongestPoints(note: MatchupNote): MatchupNote {
  const champions = scopeChampions(note);
  const refs = champions.flatMap((c) => SLOTS.map((s) => `${c}.${s}`));
  const points: NotePoint[] = LONGEST_POINTS.slice(0, MAX_POINTS).map((p, i) => ({ ...p, refs: Array.from({ length: MAX_POINT_REFS }, (_, k) => refs[(i + k * champions.length) % refs.length]!).filter((r, k, all) => all.indexOf(r) === k) }));
  return { ...note, points };
}
