/**
 * Whether this server may read the browser tests' cookies: the in-memory demo only, never on Vercel
 * and never with a database address set (a real database, even with the memory mode named beside it
 * by mistake).
 */
export function demoTestHooksAllowed(): boolean {
  return process.env.UNIIVERSE_DB_MODE === "memory" && !process.env.VERCEL && !process.env.DATABASE_URL;
}

/*
  BROWSER TESTS ONLY: All Champions
  folds its list after 20 rows behind "Show all" (all-champions.tsx, FIRST), and no demo profile
  plays more than 8 champions. A test names a smaller fold ("3") so a row reached through Show all
  can be tested on the demo's data; nothing else on the page moves. Read only on the in-memory demo.
*/

export const CHAMPIONS_FIRST_TEST_COOKIE = "uniiverse-test-champions-first";

/** The rows All Champions shows before "Show all" for a browser test's cookie (1–19); null anywhere but the in-memory demo, or for any other value. */
export function championsFirstForTest(cookie: string | null | undefined): number | null {
  return demoTestHooksAllowed() && typeof cookie === "string" && /^(1[0-9]|[1-9])$/.test(cookie) ? Number(cookie) : null;
}

/*
  BROWSER TESTS ONLY: All Champions' one-screen workspace pages its champions, its lane opponents and
  an opponent's games by the rows that fit the window (useRowBudget), and the default demo's lists are
  shorter than a page (8 champions, 4 opponents, 13 games). A test caps the measured count ("3"
  champions a page, "1" opponent or game a column) so CI's usual server exercises the page jumps, the
  keys across pages and the pagers on the demo's data. A cap only lowers the measured count: it never
  draws a row that does not fit. Read only on the in-memory demo.
*/

export const CHAMPIONS_PER_PAGE_TEST_COOKIE = "uniiverse-test-champions-per-page";
export const OPPONENTS_PER_COLUMN_TEST_COOKIE = "uniiverse-test-opponents-per-column";

/** The most champions a page shows for a browser test's cookie (1–19); null anywhere but the in-memory demo, or for any other value. */
export function championsPerPageForTest(cookie: string | null | undefined): number | null {
  return demoTestHooksAllowed() && typeof cookie === "string" && /^(1[0-9]|[1-9])$/.test(cookie) ? Number(cookie) : null;
}

/** The most lane opponents (and an opponent's games) a column shows for a browser test's cookie (1–5); null anywhere but the in-memory demo, or for any other value. */
export function opponentsPerColumnForTest(cookie: string | null | undefined): number | null {
  return demoTestHooksAllowed() && typeof cookie === "string" && /^[1-5]$/.test(cookie) ? Number(cookie) : null;
}

/*
  BROWSER TESTS ONLY: the preview's lane opponents offer their search from four opponents
  (domain/champion-preview OPPONENT_SEARCH_FROM), and the demo's champions meet at most three in a
  position that has a second position beside it. A test names a smaller threshold ("2") so a search
  typed in one position and a switch to another can be tested on the demo's data. Read only on the
  in-memory demo.
*/

export const OPPONENT_SEARCH_TEST_COOKIE = "uniiverse-test-opponent-search-from";

/** The opponents from which the preview offers its search, for a browser test's cookie (1–3); null anywhere but the in-memory demo, or for any other value. */
export function opponentSearchFromForTest(cookie: string | null | undefined): number | null {
  return demoTestHooksAllowed() && typeof cookie === "string" && /^[1-3]$/.test(cookie) ? Number(cookie) : null;
}

/*
  BROWSER TESTS ONLY: Matchup Intel's reviewed notes (docs/MATCHUP_INTEL.md, "Reviewed notes") are
  fresh, not re-checked or hidden by the patches since their review and by Riot's data, which the
  in-memory demo cannot age. A test names how many patches ago a note was reviewed ("2": not
  re-checked; "4": hidden) or that Riot changed the opponent since ("1"), so production's states can
  be tested on the demo's notes. Read only on the in-memory demo; nothing is stored.
*/

export const NOTE_AGE_TEST_COOKIE = "uniiverse-test-note-age";
export const KIT_CHANGED_TEST_COOKIE = "uniiverse-test-kit-changed";

/** The patches since the demo's notes were reviewed, for a browser test's cookie (0–9); null anywhere but the in-memory demo, or for any other value. */
export function noteAgeForTest(cookie: string | null | undefined): number | null {
  return demoTestHooksAllowed() && typeof cookie === "string" && /^[0-9]$/.test(cookie) ? Number(cookie) : null;
}

/** Whether a browser test's cookie says Riot changed the opponent's kit since the review; false anywhere but the in-memory demo. */
export function kitChangedForTest(cookie: string | null | undefined): boolean {
  return demoTestHooksAllowed() && cookie === "1";
}

/*
  BROWSER TESTS ONLY: Matchup Intel's band holds the longest notes a note may hold (four points of
  35 words, each with a level tag and four abilities: server/matchup/longest-notes.ts) on one screen
  at 1440 × 900, and the demo's notes are short. A test asks for the demo's notes with the longest
  points in their place ("1"). Read only on the in-memory demo; nothing is stored.
*/

export const LONGEST_NOTES_TEST_COOKIE = "uniiverse-test-longest-notes";

/** Whether a browser test's cookie asks for the longest notes in the band; false anywhere but the in-memory demo. */
export function longestNotesForTest(cookie: string | null | undefined): boolean {
  return demoTestHooksAllowed() && cookie === "1";
}
