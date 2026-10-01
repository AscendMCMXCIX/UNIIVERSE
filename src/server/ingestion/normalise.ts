import { patchFromVersion } from "@/domain/patch";
import { RIOT_POSITION_TO_ROLE } from "@/domain/roles";
import type { RiotMatch } from "@/server/riot/api/schemas";

export interface NormalisedMatch {
  match: { matchId: string; platform: string; gameVersion: string; patch: string; queueId: number; gameCreation: number; gameDuration: number; winningTeamId: number };
  participants: Array<{ matchId: string; puuid: string; teamId: number; championKey: number; championId: string | null; position: string; win: boolean; kills: number; deaths: number; assists: number }>;
  bans: Array<{ matchId: string; teamId: number; pickTurn: number; championKey: number }>;
  /** True when both teams have five distinct recognised positions. */
  rolesReliable: boolean;
}

export type NormaliseResult = { ok: true; value: NormalisedMatch } | { ok: false; reason: string };

export interface NormaliseOptions {
  allowedQueueIds?: number[];
  minDurationSeconds?: number;
}

/**
 * Validates and normalises a Riot match into UNIIVERSE rows. Rejects remakes, non-ranked queues
 * and malformed participant lists; marks role data as unreliable when positions are inconsistent
 * so aggregation can skip role-based statistics for that match.
 */
export function normaliseMatch(match: RiotMatch, platform: string, championKeyToId: Map<number, string>, options: NormaliseOptions = {}): NormaliseResult {
  const allowed = options.allowedQueueIds ?? [420];
  const minDuration = options.minDurationSeconds ?? 600;
  const info = match.info;
  if (!allowed.includes(info.queueId)) return { ok: false, reason: `queue ${info.queueId} not tracked` };
  if (info.gameDuration < minDuration) return { ok: false, reason: "remake or too short" };
  if (info.participants.length !== 10) return { ok: false, reason: `expected 10 participants, got ${info.participants.length}` };
  const patch = patchFromVersion(info.gameVersion);
  if (!patch) return { ok: false, reason: `unrecognised game version ${info.gameVersion}` };
  const winning = info.teams.find((t) => t.win)?.teamId ?? info.participants.find((p) => p.win)?.teamId;
  if (!winning) return { ok: false, reason: "no winning team" };

  const participants = info.participants.map((p) => {
    const role = RIOT_POSITION_TO_ROLE[p.teamPosition] ? p.teamPosition : "UNKNOWN";
    return {
      matchId: match.metadata.matchId,
      puuid: p.puuid,
      teamId: p.teamId,
      championKey: p.championId,
      championId: championKeyToId.get(p.championId) ?? null,
      position: role,
      win: p.win,
      kills: p.kills,
      deaths: p.deaths,
      assists: p.assists,
    };
  });
  const teams = [...new Set(participants.map((p) => p.teamId))];
  if (teams.length !== 2) return { ok: false, reason: "expected two teams" };
  let rolesReliable = true;
  for (const teamId of teams) {
    const positions = participants.filter((p) => p.teamId === teamId).map((p) => p.position);
    if (positions.length !== 5 || new Set(positions).size !== 5 || positions.includes("UNKNOWN")) rolesReliable = false;
  }
  if (participants.some((p) => p.championId === null)) {
    // Unknown champion key: likely a champion released after the last static sync. Keep the match
    // (ids are stored) and let the next static sync + aggregation pick it up.
    rolesReliable = rolesReliable && true;
  }
  const bans = info.teams.flatMap((t) => t.bans.filter((b) => b.championId > 0).map((b) => ({ matchId: match.metadata.matchId, teamId: t.teamId, pickTurn: b.pickTurn, championKey: b.championId })));
  return {
    ok: true,
    value: {
      match: {
        matchId: match.metadata.matchId,
        platform,
        gameVersion: info.gameVersion,
        patch,
        queueId: info.queueId,
        gameCreation: info.gameCreation,
        gameDuration: info.gameDuration,
        winningTeamId: winning,
      },
      participants,
      bans,
      rolesReliable,
    },
  };
}
