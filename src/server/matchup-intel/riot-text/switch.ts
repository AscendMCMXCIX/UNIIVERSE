/*
  THE SWITCH FOR THE FACTS FROM RIOT'S TEXT (L3; docs/MATCHUP_INTEL.md, "Facts from Riot's text").
  The layer is in the code (the importer, the 173 reviewed files beside this one, the reader, the
  page's chips and labels, and their tests), but it ships switched off: the app's registration in
  Riot's Developer Portal must first describe it (docs/RIOT_COMPLIANCE.md, "Proposed description").
  Off, no file of it is read, and no chip, marker, label or sentence of it shows anywhere: a
  champion without checked notes reads as one with no reviewed facts, in one line per side.
*/

/** The owner turns this on (true), in this one line, once the new registration text is pasted in Riot's Developer Portal. */
export const RIOT_TEXT_FACTS_ENABLED = false;

/**
 * Browser tests only: a test sets this cookie to "on" or "off" to see the layer in that state
 * whatever the switch says, so the layer's tests keep running while it ships off, and the off
 * state's tests while it is on. Read only on the in-memory demo database, never on a deployment
 * (the same bounds as server/riot/browser-test.ts): anywhere else the switch alone decides.
 */
export const RIOT_TEXT_TEST_COOKIE = "uniiverse-test-riot-text";

/** Whether the page shows the facts from Riot's text: the switch, or a browser test's cookie on the in-memory demo. */
export function riotTextFactsShown(testCookie?: string | null): boolean {
  const demo = process.env.UNIIVERSE_DB_MODE === "memory" && !process.env.VERCEL;
  if (demo && (testCookie === "on" || testCookie === "off")) return testCookie === "on";
  return RIOT_TEXT_FACTS_ENABLED;
}
