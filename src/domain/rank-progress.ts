/*
  RANKED PROGRESSION from stored rank snapshots (one per change, per account and queue).

  Riot only reports the current rank, so history exists from the day UNIIVERSE started recording
  it: the first snapshot is the start of tracking, never a fabricated past. Solo/Duo and Flex are
  separate ladders and never mixed.

  LP alone is not a ladder: Gold II 10 LP is above Gold III 90 LP. Every snapshot is placed on one
  absolute scale (each division is 100 points; Master and above add LP on top of Diamond I), so a
  promotion reads as a step up and a demotion as a step down, never as an LP collapse. A season
  reset (the account becomes unranked, or its games played this season go down) starts a new
  segment: the line is not drawn across it.
*/

export type RankQueue = "solo" | "flex";

export interface RankSnapshot {
  queue: RankQueue;
  /** IRON … CHALLENGER; null = unranked at that moment (e.g. after a season reset). */
  tier: string | null;
  /** I … IV; null for Master and above, or when unranked. */
  division: string | null;
  leaguePoints: number | null;
  wins: number | null;
  losses: number | null;
  capturedAt: number;
}

export const TIERS = ["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER"] as const;
const DIVISIONS = ["IV", "III", "II", "I"] as const;
const APEX_FROM = TIERS.indexOf("MASTER");
/** Master+ share one LP ladder above Diamond I. */
const APEX_BASE = APEX_FROM * 400;

const tierName = (t: string) => t[0]! + t.slice(1).toLowerCase();

/** "Gold II", "Master", "Unranked". */
export function rankLabel(tier: string | null, division: string | null): string {
  if (!tier) return "Unranked";
  return TIERS.indexOf(tier.toUpperCase() as (typeof TIERS)[number]) >= APEX_FROM || !division ? tierName(tier.toUpperCase()) : `${tierName(tier.toUpperCase())} ${division}`;
}

/** The snapshot's place on the absolute ladder, or null when unranked or unknown. */
export function ladderScore(s: Pick<RankSnapshot, "tier" | "division" | "leaguePoints">): number | null {
  if (!s.tier) return null;
  const t = TIERS.indexOf(s.tier.toUpperCase() as (typeof TIERS)[number]);
  if (t < 0) return null;
  const lp = Math.max(0, s.leaguePoints ?? 0);
  if (t >= APEX_FROM) return APEX_BASE + lp;
  const d = DIVISIONS.indexOf((s.division ?? "IV").toUpperCase() as (typeof DIVISIONS)[number]);
  return t * 400 + Math.max(0, d) * 100 + Math.min(lp, 100);
}

/** Whether a new reading differs from the last stored one (otherwise nothing is stored). */
export function snapshotChanged(prev: Omit<RankSnapshot, "capturedAt" | "queue"> | null, next: Omit<RankSnapshot, "capturedAt" | "queue">): boolean {
  if (!prev) return true;
  return prev.tier !== next.tier || prev.division !== next.division || prev.leaguePoints !== next.leaguePoints || prev.wins !== next.wins || prev.losses !== next.losses;
}

export type RankEventKind = "promotion" | "demotion" | "tier-up" | "tier-down" | "reset" | "placed";

export interface RankEvent {
  kind: RankEventKind;
  at: number;
  from: string;
  to: string;
}

export interface RankPoint {
  at: number;
  score: number;
  label: string;
  leaguePoints: number;
  /** Index of the season segment this point belongs to (a reset starts a new one). */
  segment: number;
}

export interface RankProgress {
  queue: RankQueue;
  trackingSince: number | null;
  current: { label: string; tier: string | null; leaguePoints: number | null; wins: number | null; losses: number | null; at: number } | null;
  points: RankPoint[];
  events: RankEvent[];
  /** Ladder points gained or lost in the window, within the current segment only (null without two points there). */
  change: { days: number; points: number; from: string; to: string } | null;
  segments: number;
}

const games = (s: RankSnapshot) => (s.wins ?? 0) + (s.losses ?? 0);

/** Builds the chart points, rank events and recent change for one queue's snapshots. */
export function rankProgress(queue: RankQueue, snapshots: readonly RankSnapshot[], now: number, windowDays = 30): RankProgress {
  const list = snapshots.filter((s) => s.queue === queue).sort((a, b) => a.capturedAt - b.capturedAt);
  const points: RankPoint[] = [];
  const events: RankEvent[] = [];
  let segment = 0;
  let prev: RankSnapshot | null = null;
  for (const s of list) {
    const score = ladderScore(s);
    if (prev) {
      const wasRanked = ladderScore(prev) !== null;
      const reset = (wasRanked && score === null) || (prev.wins !== null && s.wins !== null && games(s) < games(prev));
      if (reset) {
        segment += 1;
        events.push({ kind: "reset", at: s.capturedAt, from: rankLabel(prev.tier, prev.division), to: rankLabel(s.tier, s.division) });
      } else if (!wasRanked && score !== null) {
        events.push({ kind: "placed", at: s.capturedAt, from: "Unranked", to: rankLabel(s.tier, s.division) });
      } else if (score !== null && (prev.tier !== s.tier || prev.division !== s.division)) {
        const up = score > ladderScore(prev)!;
        const tierChange = prev.tier !== s.tier;
        events.push({ kind: tierChange ? (up ? "tier-up" : "tier-down") : up ? "promotion" : "demotion", at: s.capturedAt, from: rankLabel(prev.tier, prev.division), to: rankLabel(s.tier, s.division) });
      }
    }
    if (score !== null) points.push({ at: s.capturedAt, score, label: rankLabel(s.tier, s.division), leaguePoints: s.leaguePoints ?? 0, segment });
    prev = s;
  }
  const last = list.at(-1) ?? null;
  const since = now - windowDays * 86_400_000;
  const inSegment = points.filter((p) => p.segment === segment);
  const start = inSegment.filter((p) => p.at <= since).at(-1) ?? inSegment[0];
  const end = inSegment.at(-1);
  const change = start && end && start !== end ? { days: windowDays, points: end.score - start.score, from: `${start.label} ${start.leaguePoints} LP`, to: `${end.label} ${end.leaguePoints} LP` } : null;
  return {
    queue,
    trackingSince: list[0]?.capturedAt ?? null,
    current: last ? { label: rankLabel(last.tier, last.division), tier: last.tier ?? null, leaguePoints: last.tier ? last.leaguePoints : null, wins: last.wins, losses: last.losses, at: last.capturedAt } : null,
    points,
    events: events.reverse(),
    change,
    segments: segment + 1,
  };
}
