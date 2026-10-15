/*
  RIOT MATCH SUGGESTIONS for a drafted match record.

  A drafted match can be linked to the Riot game it became (Matches → a match → Riot match). This
  module ranks the stored Riot games of the lineup that could be that game, from facts the app
  already holds: when the game started compared with the draft, which lineup members played it
  and on which side, the champions and roles they played, and the queue. Nothing is fetched from
  Riot and nothing is linked automatically: a person confirms a suggestion (the same manual link
  as typing the match id) or dismisses it.

  Only games in the members' stored histories can be suggested: Ranked Flex, Clash and normal
  queues. Custom games (scrims, tournament codes) are not stored, so they are linked by hand.
*/

import type { CompetitionMode } from "./competition";
import type { Role } from "./roles";

/** One stored game of one lineup member (from their account's match history). */
export interface LinkCandidateRow {
  matchId: string;
  playerId: string;
  /** 100 (blue) or 200 (red); null when the match details are not stored. */
  teamId: number | null;
  queueId: number | null;
  gameCreation: number;
  durationS: number | null;
  win: boolean | null;
  championId: string;
  /** TOP | JUNGLE | MID | ADC | SUPPORT | UNKNOWN */
  role: string | null;
}

export interface LinkableMatch {
  playedAt: number;
  side: "blue" | "red";
  mode: CompetitionMode;
  /** Role → player id, as the draft ended. */
  assignments: Partial<Record<Role, string>>;
  ourPicks: ReadonlyArray<{ playerId: string | null; role: Role | null; championId: string }>;
}

export interface LinkSuggestion {
  matchId: string;
  gameCreation: number;
  queueId: number | null;
  durationS: number | null;
  win: boolean | null;
  teamId: number;
  /** 0–1, from the weighted facts below. */
  score: number;
  strength: "strong" | "possible";
  members: number;
  lineupSize: number;
  championsMatched: number;
  picks: number;
  rolesMatched: number;
  sameSide: boolean;
  queueMatches: boolean | null;
  /** Minutes from the draft's recorded time to the game's start (negative: before). */
  minutesFromDraft: number;
  /** Short facts for the reason line, strongest first. */
  reasons: string[];
  /** The lineup members in that game and what they played, in lineup role order. */
  played: Array<{ playerId: string; championId: string; role: string | null }>;
}

/** Games further than this from the draft are never suggested. */
export const LINK_WINDOW_MS = 6 * 60 * 60_000;
/** At least this many lineup members on one side: a duo game is not a team game. */
export const LINK_MIN_MEMBERS = 3;
const SHOW_THRESHOLD = 0.55;
const STRONG_THRESHOLD = 0.85;

/** The Riot queue a mode's games are played in, when it has exactly one. */
export const MODE_QUEUE: Partial<Record<CompetitionMode, number>> = { "ranked-flex": 440, clash: 700 };

const ORDER: Role[] = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"];
const WEIGHTS = { champions: 0.3, lineup: 0.25, timing: 0.2, roles: 0.1, side: 0.1, queue: 0.05 } as const;

/** 1 within 20 minutes of the draft, falling to 0 at the edge of the window. */
export function timingScore(diffMs: number): number {
  const d = Math.abs(diffMs);
  const full = 20 * 60_000;
  if (d <= full) return 1;
  if (d >= LINK_WINDOW_MS) return 0;
  return 1 - (d - full) / (LINK_WINDOW_MS - full);
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function timingPhrase(minutes: number): string {
  const m = Math.round(Math.abs(minutes));
  if (m < 2) return "started as the draft ended";
  const span = m < 90 ? plural(m, "minute") : `${(m / 60).toFixed(1)} hours`;
  return minutes >= 0 ? `started ${span} after the draft` : `started ${span} before the draft was saved`;
}

/**
 * Ranks the games that could be this drafted match, most likely first. `excluded` holds match ids
 * already linked to another record or dismissed for this one.
 */
export function suggestRiotMatches(match: LinkableMatch, rows: readonly LinkCandidateRow[], excluded: ReadonlySet<string> = new Set(), limit = 3): LinkSuggestion[] {
  const lineup = new Map<string, Role>();
  for (const [role, playerId] of Object.entries(match.assignments) as Array<[Role, string | undefined]>) if (playerId) lineup.set(playerId, role);
  if (lineup.size === 0) return [];
  const ourTeam = match.side === "blue" ? 100 : 200;
  const pickOf = new Map(match.ourPicks.filter((p) => p.playerId).map((p) => [p.playerId!, p.championId]));
  const pickedChampions = new Set(match.ourPicks.map((p) => p.championId));
  const expectedQueue = MODE_QUEUE[match.mode] ?? null;

  // Group the lineup's rows by game and side (one row per member).
  const games = new Map<string, Map<number, Map<string, LinkCandidateRow>>>();
  for (const r of rows) {
    if (r.teamId === null || !lineup.has(r.playerId) || excluded.has(r.matchId.toUpperCase())) continue;
    if (Math.abs(r.gameCreation - match.playedAt) > LINK_WINDOW_MS) continue;
    const sides = games.get(r.matchId) ?? new Map<number, Map<string, LinkCandidateRow>>();
    const members = sides.get(r.teamId) ?? new Map<string, LinkCandidateRow>();
    if (!members.has(r.playerId)) members.set(r.playerId, r);
    sides.set(r.teamId, members);
    games.set(r.matchId, sides);
  }

  const out: LinkSuggestion[] = [];
  for (const [matchId, sides] of games) {
    // The side with the most lineup members is the team's side in that game.
    const [teamId, members] = [...sides.entries()].sort((a, b) => b[1].size - a[1].size || (a[0] === ourTeam ? -1 : 1))[0]!;
    if (members.size < LINK_MIN_MEMBERS) continue;
    const list = [...members.values()];
    const first = list[0]!;
    const championsMatched = list.filter((r) => (pickOf.get(r.playerId) ?? null) === r.championId || (!pickOf.has(r.playerId) && pickedChampions.has(r.championId))).length;
    const rolesMatched = list.filter((r) => lineup.get(r.playerId) === r.role).length;
    const sameSide = teamId === ourTeam;
    const queueMatches = expectedQueue === null ? null : first.queueId === expectedQueue;
    const diff = first.gameCreation - match.playedAt;
    const picks = Math.max(1, Math.min(lineup.size, match.ourPicks.length || lineup.size));
    const score =
      WEIGHTS.champions * Math.min(1, championsMatched / picks) +
      WEIGHTS.lineup * (members.size / lineup.size) +
      WEIGHTS.timing * timingScore(diff) +
      WEIGHTS.roles * (rolesMatched / members.size) +
      WEIGHTS.side * (sameSide ? 1 : 0) +
      WEIGHTS.queue * (queueMatches === null ? 0.5 : queueMatches ? 1 : 0);
    if (score < SHOW_THRESHOLD) continue;
    const reasons = [
      `${members.size} of ${lineup.size} lineup players`,
      championsMatched ? `${championsMatched} of ${picks} drafted champions` : "none of the drafted champions",
      timingPhrase(diff / 60_000),
      sameSide ? `${match.side} side, as drafted` : `played on the ${teamId === 100 ? "blue" : "red"} side, not ${match.side}`,
    ];
    out.push({
      matchId,
      gameCreation: first.gameCreation,
      queueId: first.queueId,
      durationS: first.durationS,
      win: first.win,
      teamId,
      score: Math.round(score * 1000) / 1000,
      strength: score >= STRONG_THRESHOLD && championsMatched >= Math.min(picks, 3) && sameSide ? "strong" : "possible",
      members: members.size,
      lineupSize: lineup.size,
      championsMatched,
      picks,
      rolesMatched,
      sameSide,
      queueMatches,
      minutesFromDraft: Math.round(diff / 60_000),
      reasons,
      played: [...list].sort((a, b) => ORDER.indexOf(lineup.get(a.playerId)!) - ORDER.indexOf(lineup.get(b.playerId)!)).map((r) => ({ playerId: r.playerId, championId: r.championId, role: r.role })),
    });
  }
  return out.sort((a, b) => b.score - a.score || Math.abs(a.minutesFromDraft) - Math.abs(b.minutesFromDraft)).slice(0, limit);
}
