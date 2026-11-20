import { publicPatchName } from "@/domain/patch";
import type { Verification } from "@/domain/matchup-intel/types";

/*
  BROWSER TESTS ONLY: Matchup Intel as production shows it once patches have come out after the
  curated notes' check (docs/MATCHUP_INTEL.md, "What the browser tests pin"). The browser tests'
  demo is pinned to the Data Dragon version the notes were checked on (e2e/ddragon-version.ts), so
  on its own it never shows "Not re-checked for 26.23", the state production is in from the next
  patch until the notes are re-checked: Release 6 shipped a page that held 1440 × 900 only without
  those words (Production check of 20 Nov 2026). A test sets this cookie to "1", "2" or "3", and the
  curated notes read as checked that many patches before they were: the same words in the same
  places, one patch on "Checked on patch 26.21 · Not re-checked for 26.22" (the length of
  production's "26.22 · … 26.23"), three on the briefing hidden as too old. Riot's records still
  match the notes, so no ability reads as changed. Read only on the in-memory demo, never on a
  deployment (the bounds of the riot-text switch's cookie): anywhere else the notes read as they are.
*/

export const NOTES_AGE_TEST_COOKIE = "uniiverse-test-notes-age";

/** How many patches earlier the curated notes read as checked: a browser test's cookie on the in-memory demo, else 0. */
export function notesAgeForTest(cookie?: string | null): number {
  const demo = process.env.UNIIVERSE_DB_MODE === "memory" && !process.env.VERCEL;
  return demo && typeof cookie === "string" && /^[1-3]$/.test(cookie) ? Number(cookie) : 0;
}

/**
 * Notes as checked `patches` patches earlier than they say: their Data Dragon version and patch
 * moved back that many within the version's year ("16.22.1", patch 26.22, one back: "16.21.1",
 * 26.21). None, 0, or a version it cannot move back that far: the notes as they are.
 */
export function checkedEarlier<T extends { verified: Verification }>(notes: T | null, patches: number): T | null {
  if (!notes || patches <= 0) return notes;
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(notes.verified.ddragonVersion);
  if (!m || Number(m[2]) <= patches) return notes;
  const minor = Number(m[2]) - patches;
  return { ...notes, verified: { ...notes.verified, ddragonVersion: `${m[1]}.${minor}.${m[3]}`, patch: publicPatchName(`${m[1]}.${minor}`) } };
}
