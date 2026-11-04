import { SEASON_MODES, type GameRole } from "./season-stats";

/*
  Team Leaderboards' shared data: one stored game of one member (a match seen from two linked
  accounts counts once, server/leaderboards/service.ts), the queues the boards read and the roles
  they name. The boards themselves are Recent form (leaderboard-recent.ts) and Records &
  achievements (leaderboard-records.ts); docs/LEADERBOARDS_MODEL.md has their rules. A game without
  a figure is left out of what needs it; it never counts as zero.
*/

/**
 * Game scopes, from the queues UNIIVERSE collects and uses for its season statistics (all are
 * 5v5 Summoner's Rift games, so the figures are comparable). "All supported games" is the default,
 * as everywhere else in UNIIVERSE; the ranked queues and normal games can be singled out.
 */
const seasonMode = (key: "all" | "solo" | "flex" | "normal") => SEASON_MODES.find((m) => m.key === key)!;
export const LEADERBOARD_QUEUES = {
  all: { label: seasonMode("all").label, queues: seasonMode("all").queues, description: seasonMode("all").description },
  ranked: { label: "All ranked", queues: [...seasonMode("solo").queues, ...seasonMode("flex").queues], description: "Ranked Solo/Duo and Ranked Flex" },
  solo: { label: seasonMode("solo").label, queues: seasonMode("solo").queues, description: seasonMode("solo").description },
  flex: { label: seasonMode("flex").label, queues: seasonMode("flex").queues, description: seasonMode("flex").description },
  normal: { label: seasonMode("normal").label, queues: seasonMode("normal").queues, description: seasonMode("normal").description },
} as const satisfies Record<string, { label: string; queues: readonly number[]; description: string }>;

export const LEADERBOARD_ROLES = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"] as const satisfies readonly GameRole[];
export const isLeaderboardRole = (v: unknown): v is GameRole => typeof v === "string" && (LEADERBOARD_ROLES as readonly string[]).includes(v);

/** One game of one player, as stored (null = Riot did not provide the figure for this game). */
export interface LeaderboardGame {
  matchId: string;
  playerId: string;
  championId: string;
  role: GameRole | null;
  queueId: number | null;
  patch: string | null;
  win: boolean | null;
  gameCreation: number;
  durationS: number | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  cs: number | null;
  damage: number | null;
  vision: number | null;
  /** From the stored match details (null when that game has none). */
  gold: number | null;
  wardsPlaced: number | null;
  teamKills: number | null;
  teamDamage: number | null;
  /** Kept on games stored from Phase 14 on; null on older games. */
  extra: LeaderboardExtra | null;
}

export interface LeaderboardExtra {
  doubleKills?: number;
  tripleKills?: number;
  quadraKills?: number;
  pentaKills?: number;
  firstBloodKill?: boolean;
  wardsKilled?: number;
  controlWardsBought?: number;
  objectiveDamage?: number;
  buildingDamage?: number;
  turretTakedowns?: number;
  ccSeconds?: number;
  soloKills?: number;
}

export interface LeaderboardMastery {
  playerId: string;
  championId: string;
  points: number;
}

/** Longest run of consecutive wins, in the order the games were played (games without a result are skipped). */
export function longestWinStreak(games: readonly LeaderboardGame[]): { length: number; endedAt: number | null; games: number } {
  const decided = games.filter((g) => g.win !== null).sort((a, b) => a.gameCreation - b.gameCreation || a.matchId.localeCompare(b.matchId));
  let bestLen = 0;
  let bestEnd: number | null = null;
  let run = 0;
  for (const g of decided) {
    run = g.win ? run + 1 : 0;
    if (run > bestLen) {
      bestLen = run;
      bestEnd = g.gameCreation;
    }
  }
  return { length: bestLen, endedAt: bestEnd, games: decided.length };
}
