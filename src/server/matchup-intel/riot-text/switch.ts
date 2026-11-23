/*
  THE SWITCH FOR THE FACTS FROM RIOT'S TEXT (L3; docs/MATCHUP_INTEL.md, "Facts from Riot's text").
  The layer is in the code (the importer, the 173 reviewed files beside this one, the reader, the
  page's chips and labels, and their tests). It shipped switched off in release 4 (19 Nov 2026),
  because the app's registration in Riot's Developer Portal had to describe it first
  (docs/RIOT_COMPLIANCE.md, "Proposed description"). On 23 Nov 2026 the owner reported the
  product's description updated to cover it, the application still Approved, and it is on (OD1).
  Off, no file of it is read, and no chip, marker, label or sentence of it shows anywhere: a
  champion without checked notes reads as one with no reviewed facts, in one line per side.
*/

/** On since 23 Nov 2026 (OD1). Turning it off again is this one line; nothing else reads the files then. */
export const RIOT_TEXT_FACTS_ENABLED = true;

/**
 * Browser tests only: a test sets this cookie to "on" or "off" to see the layer in that state
 * whatever the switch says, so the layer's tests run whichever way it ships, and the off
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
