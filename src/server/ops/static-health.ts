import { patchFromVersion, publicPatchName } from "@/domain/patch";
import type { StaticAttempt, StaticProblems } from "@/server/riot/static/assets";

/*
  `/api/health` → `staticData` and the `static-data` key in `failingJobs` (docs/MONITORING.md): the
  static refresh (item, summoner spell and rune files from Data Dragon, read by version-check once a
  game version) listed when it failed or has gone stale, so a scheduled Data jobs run fails on it,
  which is the alert. Counts and patch names only.

  The rule, chosen so a normal week never trips it (Riot ships a patch about every two weeks;
  version-check runs on the tick every hour, and a run with nothing new is a success):
  - failed: the current version's files were downloaded and failed validation (assets.ts,
    staticProblems), so the last good copy is in use. At once: Riot's files do not fail on their own
    (0 dangling ids and 0 unreadable haste figures at 15.10, 15.24, 16.20, 16.22 and 16.23).
  - stale: the current version's files could not be downloaded for 24 hours (about 24 hourly
    attempts: a Data Dragon outage of an afternoon is not an alert, a day without the new patch's
    items is); or no version-check or static-sync run has succeeded for 72 hours (a weekend's
    outage of the tick, which the tick's own checks also name, never one missed run). Not while
    version-check is set to 0 in Admin: that is off by choice, which `notices` says.
*/

export const STATIC_DOWNLOAD_STALE_MS = 24 * 60 * 60_000;
export const STATIC_SILENT_MS = 72 * 60 * 60_000;

export interface StaticDataHealth {
  /** "ok", "failed" (the newest files failed validation) or "stale" (see the rule above). */
  state: "ok" | "failed" | "stale";
  /** The game's current patch as its public name ("26.22"), and the patch of the item and rune names in use; null when none is known. */
  patch: string | null;
  stored: string | null;
  /** Why it is listed: "validation", "download" or "no-success"; null when ok. */
  reason: "validation" | "download" | "no-success" | null;
  /** The failed validation's counts; null otherwise. */
  problems: StaticProblems | null;
}

const name = (version: string | null) => {
  const p = version ? patchFromVersion(version) : null;
  return p ? publicPatchName(p) : null;
};

/** The static refresh's state for health, from the current Data Dragon version, the stored names' version, the last attempt that kept nothing, and when version-check last succeeded. */
export function staticDataHealth(input: { currentVersion: string | null; storedVersion: string | null; attempt: StaticAttempt | null; lastSuccessAt: number | null; turnedOff: boolean; now: number }): StaticDataHealth {
  const { currentVersion, storedVersion, attempt, lastSuccessAt, turnedOff, now } = input;
  const base = { patch: name(currentVersion), stored: name(storedVersion) };
  const behind = !!currentVersion && storedVersion !== currentVersion && attempt?.version === currentVersion;
  if (behind && attempt!.reason === "validation") return { ...base, state: "failed", reason: "validation", problems: attempt!.problems };
  const firstAt = attempt ? Date.parse(attempt.firstAt) : NaN;
  if (behind && attempt!.reason === "download" && Number.isFinite(firstAt) && now - firstAt > STATIC_DOWNLOAD_STALE_MS) return { ...base, state: "stale", reason: "download", problems: null };
  if (!turnedOff && lastSuccessAt !== null && now - lastSuccessAt > STATIC_SILENT_MS) return { ...base, state: "stale", reason: "no-success", problems: null };
  return { ...base, state: "ok", reason: null, problems: null };
}
