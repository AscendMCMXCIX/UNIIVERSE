import { laneOf } from "@/domain/match-analysis";
import { laneValue, scoreMatch, scoreModeOf, type MatchScores, type ScoreInput } from "@/domain/performance-score";

/*
  A game's performance scores from its record (the scoreboard's ten players) and its stored
  timeline (the lane at 10:00 and 15:00: the timeline's one part in the score).
  One calculation wherever a score shows (finalScoresOf): the opened game computes it in the
  browser from the two answers it has loaded (components/match-history/post-game: getMatchDetail's
  view and getMatchTimeline's), and Match History's cards and Team → Matches' members on the server
  from the same record and timeline, mapped by the same functions (server/players/match-history
  recordTeamsOf, scoreFiguresOf and gameScores; server/accounts/match-timeline scoreTimelineOf).
  Nothing is fetched for them; the model is domain/performance-score's.

  The shapes below are what the score reads, no more: MatchDetailView and MatchTimelineView have
  them, and so does what a card's score is computed from.
*/

const n = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** One player of the game's record as the score reads them (DetailParticipant has these fields). */
export interface ScoreParticipant {
  /** Place in the stored record (0–9). */
  slot: number;
  /** A player whose personal data was erased: not scored. */
  removed: boolean;
  position: string | null;
  /** The lane opponent by place in the record (domain/match-analysis laneOpponentOf); null when unclear. */
  laneOpponentSlot: number | null;
  kills: number;
  deaths: number;
  assists: number;
  cs: number | null;
  gold: number | null;
  damage: number | null;
  damageTaken: number | null;
  vision: number | null;
  wardsPlaced: number | null;
  stats: { damageMitigated?: number; wardsKilled?: number; objectiveDamage?: number; turretTakedowns?: number; ccSeconds?: number; teamHealing?: number; teamShielding?: number } | null;
}

/** The game's record as the score reads it: its queue, length, and the two teams (their result and kills, the scoreboard's count). */
export interface ScoreRecord {
  queueId: number | null;
  durationS: number;
  teams: ReadonlyArray<{ teamId: number; win: boolean; kills: number; participants: readonly ScoreParticipant[] }>;
}

/** One player of the stored timeline as the final score reads them: their gold and experience at every frame, and whether their lane is confirmed. */
export interface ScoreTimelinePlayer {
  slot: number;
  frames: { g: readonly number[]; x: readonly number[] } | null;
  /** Non-null where the timeline confirms the lane: both players' frames, against the one lane opponent. */
  lane: object | null;
}

/** The stored timeline as the final score reads it (MatchTimelineView has these fields). */
export interface ScoreTimeline {
  /** The frames' own times; null without frames or when the timeline contradicts the record. */
  t: readonly number[] | null;
  players: readonly ScoreTimelinePlayer[];
}

/** The game's players as the score reads them (a removed player is left out), with the lane from the timeline where it confirms one. */
export function scoreInputsOf(view: Pick<ScoreRecord, "teams" | "queueId">, timeline: ScoreTimeline | null): ScoreInput[] {
  const mode = scoreModeOf(view.queueId);
  const tl = new Map((timeline?.players ?? []).map((p) => [p.slot, p]));
  const all = view.teams.flatMap((t) => t.participants.map((p) => ({ p, teamId: t.teamId, win: t.win })));
  return all
    .filter(({ p }) => !p.removed)
    .map(({ p, teamId, win }): ScoreInput => {
      const st = p.stats;
      const mine = tl.get(p.slot);
      const them = p.laneOpponentSlot !== null ? tl.get(p.laneOpponentSlot) : undefined;
      // The lane at 10:00 and 15:00, both from the timeline's frames (the same reading as the lane section).
      const laneDiff = mode === "rift" && timeline?.t && mine?.frames && them?.frames && mine.lane ? laneValue(timeline.t, mine.frames, them.frames, Number.POSITIVE_INFINITY) : null;
      return {
        slot: p.slot,
        teamId,
        win,
        lane: mode === "rift" ? laneOf(p.position) : null,
        counterpart: mode === "rift" ? p.laneOpponentSlot : null,
        kills: n(p.kills),
        deaths: n(p.deaths),
        assists: n(p.assists),
        cs: n(p.cs),
        gold: n(p.gold),
        damage: n(p.damage),
        damageTaken: n(p.damageTaken),
        damageMitigated: n(st?.damageMitigated),
        vision: n(p.vision),
        wardsPlaced: n(p.wardsPlaced),
        wardsKilled: n(st?.wardsKilled),
        objectiveDamage: n(st?.objectiveDamage),
        turretTakedowns: n(st?.turretTakedowns),
        ccSeconds: n(st?.ccSeconds),
        teamHealing: n(st?.teamHealing),
        teamShielding: n(st?.teamShielding),
        laneDiff,
      };
    });
}

/** Each team's kills as the scoreboard counts them (a removed player's included through the record's team total). */
export function teamKillsOf(view: Pick<ScoreRecord, "teams">): Record<number, number> {
  return Object.fromEntries(view.teams.map((t) => [t.teamId, t.kills]));
}

/** Whether the game's score reads its timeline at all: a Summoner's Rift game with a lane opponent for someone (the lane is the timeline's only part in the final score). */
export function scoreReadsTimeline(view: Pick<ScoreRecord, "teams" | "queueId">): boolean {
  return scoreModeOf(view.queueId) === "rift" && view.teams.some((t) => t.participants.some((p) => !p.removed && p.laneOpponentSlot !== null));
}

function scoresFrom(view: Pick<ScoreRecord, "teams" | "queueId" | "durationS">, inputs: ScoreInput[]): MatchScores | null {
  return scoreMatch(inputs, { mode: scoreModeOf(view.queueId), minutes: view.durationS / 60 }, teamKillsOf(view));
}

/** The final scores of one game: the opened game's, its card's and Team → Matches' alike. */
export function finalScoresOf(view: ScoreRecord, timeline: ScoreTimeline | null): MatchScores | null {
  return scoresFrom(view, scoreInputsOf(view, timeline));
}

/** A participant of the opened game by place in the record. */
export function participantOf<P extends { slot: number }>(view: { teams: ReadonlyArray<{ participants: readonly P[] }> }, slot: number): P | null {
  return view.teams.flatMap((t) => t.participants).find((p) => p.slot === slot) ?? null;
}
