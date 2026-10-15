/*
  PATCH INSIGHTS for pool champions: what changed since the previous patch, said only when the
  evidence is strong, and never mixing two different kinds of change.

  - A verified change is a balance change or rework recorded for the patch (Admin → Riot data:
    a change point entered or confirmed by a person). It says the champion was changed, nothing
    about whether it got better or worse.
  - A statistical change is a shift in the champion's results in that role between the two
    patches of the ranked games UNIIVERSE collects. It is only shown when both patches hold
    enough games, the shift is large, and it is unlikely to be chance (two-proportion test).
    It describes what happened in games, not why.

  Nothing shown means "no reliable change", not "no change".
*/

export interface PatchSample {
  games: number;
  wins: number;
}

/** Both patches need this many games of the champion in the role. */
export const SHIFT_MIN_GAMES = 1000;
/** The win-rate shift must be at least this many percentage points… */
export const SHIFT_MIN_POINTS = 2;
/** …and unlikely to be chance (|z| of a two-proportion test, about 95%). */
export const SHIFT_MIN_Z = 1.96;

export interface StatisticalShift {
  kind: "statistical";
  /** Win-rate change in percentage points (current minus previous). */
  points: number;
  now: PatchSample;
  before: PatchSample;
  z: number;
}

export interface VerifiedChange {
  kind: "verified";
  patch: string;
  reason: string;
}

/** The win-rate shift between two patches, or null when the evidence is not strong enough. */
export function statisticalShift(now: PatchSample, before: PatchSample): StatisticalShift | null {
  if (now.games < SHIFT_MIN_GAMES || before.games < SHIFT_MIN_GAMES) return null;
  const p1 = now.wins / now.games;
  const p0 = before.wins / before.games;
  const pooled = (now.wins + before.wins) / (now.games + before.games);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / now.games + 1 / before.games));
  if (!(se > 0)) return null;
  const z = (p1 - p0) / se;
  const points = Math.round((p1 - p0) * 1000) / 10;
  if (Math.abs(points) < SHIFT_MIN_POINTS || Math.abs(z) < SHIFT_MIN_Z) return null;
  return { kind: "statistical", points, now, before, z: Math.round(z * 100) / 100 };
}

export interface PatchInsight {
  verified: VerifiedChange | null;
  shift: StatisticalShift | null;
}

/** The short badge text and its explanation, or null when there is nothing reliable to say. */
export function patchInsightText(insight: PatchInsight, previousPatch: string | null): { label: string; detail: string; tone: "good" | "bad" | "neutral" } | null {
  const { verified, shift } = insight;
  if (!verified && !shift) return null;
  const parts: string[] = [];
  if (verified) parts.push(`Changed in patch ${verified.patch} (recorded balance change${verified.reason ? `: ${verified.reason}` : ""}).`);
  if (shift)
    parts.push(
      `Win rate in this role ${shift.points > 0 ? "up" : "down"} ${Math.abs(shift.points).toFixed(1)} points since ${previousPatch ?? "the previous patch"}: ${(shift.now.wins / shift.now.games * 100).toFixed(1)}% over ${shift.now.games.toLocaleString("en")} games against ${(shift.before.wins / shift.before.games * 100).toFixed(1)}% over ${shift.before.games.toLocaleString("en")}. A statistical change in ranked games, not a confirmed balance change.`,
    );
  const label = shift ? `${shift.points > 0 ? "↑" : "↓"} ${Math.abs(shift.points).toFixed(1)} pts${previousPatch ? ` since ${previousPatch}` : ""}` : `Changed in ${verified!.patch}`;
  return { label: verified && shift ? `${label} · changed` : label, detail: parts.join(" "), tone: shift ? (shift.points > 0 ? "good" : "bad") : "neutral" };
}
