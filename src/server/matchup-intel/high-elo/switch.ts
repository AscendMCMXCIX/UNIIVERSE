/*
  THE SWITCH FOR MATCHUP INTEL'S HIGH-ELO COLLECTION (docs/HIGH_ELO_EVIDENCE.md).
  The owner approved the collection on 23 Nov 2026 (OD4), on condition that nothing is collected
  until Riot's registration describes it, the privacy notice says it, and the resource limits are
  verified ("Before collection is switched on"). Off, the high-elo-sample job makes no Riot request
  and writes nothing, the tick never runs it, and the page shows "No high-elo evidence (not
  collected)" as before. Turning it on is this one line, through a pull request, after those checks.
*/

/** Off until the owner's checks are done (docs/HIGH_ELO_EVIDENCE.md, "Before collection is switched on"). */
export const HIGH_ELO_COLLECTION_ENABLED = false;

/**
 * Browser tests only: "on" shows the high-elo section over the in-memory demo's own counts whatever
 * the switch says, so its tests run while collection is off. Read only on the in-memory demo,
 * never on a deployment (the bounds of server/riot/browser-test.ts).
 */
export const HIGH_ELO_TEST_COOKIE = "uniiverse-test-high-elo";

/** Whether the page shows the high-elo section: the switch, or a browser test's cookie on the in-memory demo. */
export function highEloShown(testCookie?: string | null): boolean {
  const demo = process.env.UNIIVERSE_DB_MODE === "memory" && !process.env.VERCEL;
  if (demo && (testCookie === "on" || testCookie === "off")) return testCookie === "on";
  return HIGH_ELO_COLLECTION_ENABLED;
}
