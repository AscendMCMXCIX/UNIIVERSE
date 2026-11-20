import type { Db } from "@/server/db/types";
import type { Role } from "@/domain/roles";
import type { SeasonMode } from "@/domain/season-stats";
import type { OpponentTally, TenMinutes } from "@/domain/champion-preview";
import { getPlayerMatchups, type TimelineStatus } from "@/server/players/matchups";

/*
  All Champions' preview, read for one champion in one role in the list's scope (season, game mode,
  accounts). Two reads, each light:

    getChampionPreview   the lane opponents' tally, from the stored rows only (no match record)
    getPairingGames      one opponent's games, through Matchups' pairing path (that pair only)

  The lane opponent is the game's stored one (accounts/sync's fold, domain/match-analysis
  laneOpponentOf: only when exactly one enemy held the player's position). Nothing about another
  player leaves the server: champions only. The caller checks who may see the profile.
*/

export interface PreviewScope {
  season: number | "all";
  mode: SeasonMode;
  /** An account id, or "all" for every linked account. */
  account: string;
  champion: string;
  role: Role;
}

export interface ChampionPreviewData {
  champion: string;
  role: Role;
  /** The champion's games in the lane scope (decided, long enough to have had a lane). */
  games: number;
  /** Of those, games with a known lane opponent. */
  known: number;
  opponents: OpponentTally[];
}

export interface PairingGame {
  matchId: string;
  playedAt: number;
  win: boolean;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  cs: number | null;
  /** The gold difference at 10:00 (+ ahead), null without a timeline or before 10:00. */
  gold10: number | null;
  timeline: TimelineStatus;
}

export interface PairingGamesData {
  champion: string;
  role: Role;
  vs: string;
  games: PairingGame[];
  ten: TenMinutes | null;
}

export async function getChampionPreview(db: Db, playerId: string, scope: PreviewScope): Promise<ChampionPreviewData> {
  const m = await getPlayerMatchups(db, playerId, { account: scope.account, season: scope.season, mode: scope.mode, champion: scope.champion, vs: null, role: scope.role, exact: true, tallyOnly: true });
  return { champion: scope.champion, role: scope.role, games: m.championGames, known: m.opponents.reduce((n, o) => n + o.games, 0), opponents: m.opponents };
}

export async function getPairingGames(db: Db, playerId: string, scope: PreviewScope, vs: string): Promise<PairingGamesData> {
  const m = await getPlayerMatchups(db, playerId, { account: scope.account, season: scope.season, mode: scope.mode, champion: scope.champion, vs, role: scope.role });
  // Only the pair asked for: Matchups falls back to the most played champion and opponent, the preview never does.
  const detail = m.champion === scope.champion && m.vs === vs ? m.detail : null;
  const ten = detail?.checkpoints.find((c) => c.minute === 10);
  return {
    champion: scope.champion,
    role: scope.role,
    vs,
    games: (detail?.matches ?? []).map((g) => ({ matchId: g.matchId, playedAt: g.playedAt, win: g.win, kills: g.kills, deaths: g.deaths, assists: g.assists, cs: g.cs, gold10: g.at.find((a) => a.minute === 10)?.gold ?? null, timeline: g.timeline })),
    ten: ten && ten.games && ten.goldMean !== null ? { games: ten.games, ahead: ten.aheadInGold, goldMean: ten.goldMean } : null,
  };
}
