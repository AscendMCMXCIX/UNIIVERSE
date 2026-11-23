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
