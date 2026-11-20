import { publicPatchName } from "@/domain/patch";
import type { ChampionNotes, Slot, Verification } from "@/domain/matchup-intel/types";

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

/**
 * Whether this server may read the browser tests' Matchup Intel cookies: the in-memory demo only,
 * never on Vercel and never with a database address set (a real database, even with the memory mode
 * named beside it by mistake).
 */
export function demoTestHooksAllowed(): boolean {
  return process.env.UNIIVERSE_DB_MODE === "memory" && !process.env.VERCEL && !process.env.DATABASE_URL;
}

/** How many patches earlier the curated notes read as checked: a browser test's cookie on the in-memory demo, else 0. */
export function notesAgeForTest(cookie?: string | null): number {
  return demoTestHooksAllowed() && typeof cookie === "string" && /^[1-3]$/.test(cookie) ? Number(cookie) : 0;
}

/*
  BROWSER TESTS ONLY, with the notes' age above: Matchup Intel as production shows it once Riot has
  changed some of the curated abilities after the check (the "Changed since the check" state: the
  tile's badge and flagged notes, the panel's warning, the briefing's points on them hidden). The
  pinned demo's records match the notes, so on its own it never shows it. A test names the abilities
  ("Mordekaiser.Q,Mordekaiser.E", at most ten), and the notes' record of Riot's cooldown array for
  each reads as one Riot no longer has: nothing shown is made up, since the page then shows Riot's own
  stored line for the ability, and the curated cooldown as checked, flagged, both as they are. Only
  with a notes' age of one patch or more (a change comes with a later patch), and, like the age, read
  only on the in-memory demo.
*/

export const CHANGED_ABILITIES_TEST_COOKIE = "uniiverse-test-changed-abilities";

const REF = /^([A-Za-z0-9]{1,40})\.(P|Q|W|E|R)$/;

/** The abilities a browser test's cookie names as changed since the check, by champion: none anywhere but the in-memory demo, or for a value that is not a list of up to ten "Champion.Slot". */
export function changedAbilitiesForTest(cookie?: string | null): ReadonlyMap<string, ReadonlySet<Slot>> {
  const out = new Map<string, Set<Slot>>();
  if (!demoTestHooksAllowed() || typeof cookie !== "string" || cookie.length > 500) return out;
  const refs = cookie.split(",");
  if (refs.length > 10 || !refs.every((r) => REF.test(r))) return out;
  for (const r of refs) {
    const [, id, slot] = REF.exec(r)!;
    if (!out.has(id!)) out.set(id!, new Set());
    out.get(id!)!.add(slot as Slot);
  }
  return out;
}

/** A champion's notes with the named abilities' record of Riot's cooldown read as one Riot no longer has (empty); everything else, the curated cooldown included, as it is. */
export function changedSinceCheck(notes: ChampionNotes | null, slots: ReadonlySet<Slot> | undefined): ChampionNotes | null {
  if (!notes || !slots || slots.size === 0) return notes;
  const abilities = { ...notes.abilities };
  for (const slot of slots) {
    const n = abilities[slot];
    if (n) abilities[slot] = { ...n, ddragonCooldown: [] };
  }
  return { ...notes, abilities };
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
