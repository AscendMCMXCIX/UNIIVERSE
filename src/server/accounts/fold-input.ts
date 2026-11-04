import type { RiotMatch } from "@/server/riot/api/schemas";
import type { MatchParticipantDetail } from "@/server/db/schema";

/*
  What folding a game into one linked account's history needs (accounts/sync foldMatch), from
  either source it can come from:
  - a match Riot just returned (match-v5), or
  - the match's stored record (match_details), which every game a linked account has played is
    stored as once, the first time any linked account fetches it.

  A game several members played is therefore fetched from Riot once: the other accounts fold the
  same game from its record, without another request. Both sources carry the same figures,
  derived the same way (match-details participantDetail), so the stored game is the same either
  way. The position is Riot's team position, or its individual position when the team position is
  empty: the record has always kept that fallback, and the fold uses it from both sources so a
  game's role never depends on which account fetched it first.
*/

export interface FoldParticipant {
  /** "" for a player whose personal data was erased (a "Removed player" in a stored record). */
  puuid: string;
  /** "Name#TAG" when known. */
  riotId: string | null;
  teamId: number;
  /** Riot's numeric champion key (0 for a removed player). */
  championKey: number;
  /** TOP | JUNGLE | MIDDLE | BOTTOM | UTILITY, or "" when Riot gave none. */
  position: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  cs: number | null;
  damage: number | null;
  visionScore: number | null;
  removed: boolean;
}

export interface FoldInput {
  matchId: string;
  gameCreation: number;
  gameDuration: number;
  queueId: number | null;
  gameVersion: string | null;
  participants: FoldParticipant[];
}

/** From a match Riot returned. */
export function foldInputFromMatch(match: RiotMatch): FoldInput {
  return {
    matchId: match.metadata.matchId,
    gameCreation: match.info.gameCreation,
    gameDuration: match.info.gameDuration,
    queueId: match.info.queueId,
    gameVersion: match.info.gameVersion,
    participants: match.info.participants.map((p) => ({
      puuid: p.puuid,
      riotId: p.riotIdGameName ? `${p.riotIdGameName}${p.riotIdTagline ? `#${p.riotIdTagline}` : ""}` : p.summonerName || null,
      teamId: p.teamId,
      championKey: p.championId,
      position: p.teamPosition || p.individualPosition || "",
      win: p.win,
      kills: p.kills,
      deaths: p.deaths,
      assists: p.assists,
      cs: p.totalMinionsKilled === undefined && p.neutralMinionsKilled === undefined ? null : (p.totalMinionsKilled ?? 0) + (p.neutralMinionsKilled ?? 0),
      damage: p.totalDamageDealtToChampions ?? null,
      visionScore: p.visionScore ?? null,
      removed: false,
    })),
  };
}

/** The few columns of a stored record the fold reads. */
export interface FoldRecord {
  matchId: string;
  gameCreation: number;
  gameDuration: number;
  queueId: number | null;
  gameVersion: string | null;
  participants: readonly Pick<MatchParticipantDetail, "puuid" | "name" | "teamId" | "championKey" | "position" | "win" | "kills" | "deaths" | "assists" | "cs" | "damage" | "vision" | "removed">[];
}

/**
 * From a stored record, or null when the record cannot stand in for Riot's answer: a record of a
 * game Riot no longer serves (no players), or one with a nonsensical duration.
 */
export function foldInputFromRecord(record: FoldRecord): FoldInput | null {
  if (!Array.isArray(record.participants) || record.participants.length === 0 || !(record.gameDuration > 0)) return null;
  return {
    matchId: record.matchId,
    gameCreation: Number(record.gameCreation),
    gameDuration: record.gameDuration,
    queueId: record.queueId,
    gameVersion: record.gameVersion,
    participants: record.participants.map((p) => ({
      puuid: p.removed ? "" : p.puuid,
      riotId: p.removed ? null : p.name,
      teamId: p.teamId,
      championKey: p.removed ? 0 : p.championKey,
      position: p.removed ? "" : (p.position ?? ""),
      win: p.win,
      kills: p.kills,
      deaths: p.deaths,
      assists: p.assists,
      cs: p.cs,
      damage: p.damage,
      visionScore: p.vision,
      removed: p.removed === true,
    })),
  };
}
