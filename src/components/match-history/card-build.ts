/*
  A Match History card's build place when the game's record is not stored (still being collected,
  or Riot no longer serves it): a quiet phrase instead of the items. From a 36rem list it is drawn
  at the build's own width (5.875rem: four 22px items and their gaps, the width of a stored build
  and of an unrecorded build's kept room), wrapping onto a second line, so the columns before it
  (the champion, the K/D/A and the performance score) keep their places on every card of a list
  (review of 26 Nov 2026: the phrase at its own width moved the score's column 5–12px). Kept apart
  from the card so a browser test can draw the same markup on a demo card (the demo has no such game).
*/

/** The build's width on a card from a 36rem list. */
export const CARD_BUILD_WIDTH = "@min-[36rem]/mh:w-[5.875rem]";

/** The phrase's classes. */
export const NO_BUILD_CLASS = `text-xs text-fg-subtle ${CARD_BUILD_WIDTH}`;

/** The phrase, by why the record is not there. */
export function noBuildWords(record: "missing" | "unavailable"): string {
  return record === "missing" ? "Items being collected" : "Items not provided by Riot";
}
