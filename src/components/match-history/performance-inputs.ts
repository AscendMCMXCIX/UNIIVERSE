import type { MatchTimelineView } from "@/server/accounts/match-timeline";
import type { DetailParticipant, MatchDetailView } from "@/server/players/match-history";
import { laneOf } from "@/domain/match-analysis";
import { laneValue, scoreMatch, scoreModeOf, timelineScores, type MatchScores, type ScoreInput, type TimelineInput, type TimelinePoint } from "@/domain/performance-score";

/*
  The post-game view's performance scores, from what the opened game has already loaded: its record
  (the scoreboard's ten players) and its stored timeline (the lane at 10:00 and 15:00, and the
  minute-by-minute record the timeline score reads). Nothing is fetched for them: switching between
  players reads the same two answers (domain/performance-score has the model).
*/

const n = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** The game's players as the score reads them (a removed player is left out), with the lane from the timeline where it confirms one. */
export function scoreInputsOf(view: Pick<MatchDetailView, "teams" | "queueId">, timeline: Pick<MatchTimelineView, "players" | "t"> | null): ScoreInput[] {
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
export function teamKillsOf(view: Pick<MatchDetailView, "teams">): Record<number, number> {
  return Object.fromEntries(view.teams.map((t) => [t.teamId, t.kills]));
}

export interface GameScores {
  scores: MatchScores | null;
  /** The timeline score's points; null without a usable timeline (none stored, frames missing, or contradicting the record). */
  points: TimelinePoint[] | null;
}

/** The final scores and the timeline score of one opened game. */
export function gameScoresOf(view: Pick<MatchDetailView, "teams" | "queueId" | "durationS">, timeline: Pick<MatchTimelineView, "players" | "t"> | null): GameScores {
  const mode = scoreModeOf(view.queueId);
  const inputs = scoreInputsOf(view, timeline);
  const minutes = view.durationS / 60;
  const scores = scoreMatch(inputs, { mode, minutes }, teamKillsOf(view));
  // A removed player's kills are not kept, so a team's kills by a moment would be short: no kill figures at the moments then.
  const whole = view.teams.every((t) => t.participants.every((p) => !p.removed));
  const players: TimelineInput[] = (timeline?.players ?? []).map((p) => ({ slot: p.slot, kills: whole ? p.kills : null, deaths: whole ? p.deaths : null, assists: whole ? p.assists : null, frames: p.frames }));
  const points = timeline?.t && players.length ? timelineScores(inputs, { t: timeline.t, players }, scores, { mode, durationMinutes: minutes }) : null;
  return { scores, points };
}

/** A participant of the opened game by place in the record. */
export function participantOf(view: Pick<MatchDetailView, "teams">, slot: number): DetailParticipant | null {
  return view.teams.flatMap((t) => t.participants).find((p) => p.slot === slot) ?? null;
}
