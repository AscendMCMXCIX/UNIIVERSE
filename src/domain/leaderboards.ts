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
  /** Riot's largest multikill in the game (2 = double … 5 = penta). */
  largestMultiKill?: number;
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

/*
  Who the boards show (25 Nov 2026, the owner's rule): a player appears on any of them only while
  they are active, which takes BOTH of
    a game the boards count (a supported Summoner's Rift queue, not a remake) that started within
    the last LEADERBOARD_ACTIVE_DAYS days, and
    a successful data update of one of their accounts within the same days (a sync that read the
    history it was due to read: riot_accounts.sync_cursor, written on success only; a demo
    account's seeded time stands for it).
  A sync without new games alone never makes a player active: the rule needs gameplay. It is a
  matter of what is shown, recalculated from the stored data on every request (a returning player
  shows again with their next synced game); nothing is deleted, the season's statistics stay
  season-based, and each board's own qualification applies on top.
*/

/** The days within which a player needs both a counted game and a successful data update to appear on the boards. */
export const LEADERBOARD_ACTIVE_DAYS = 30;
const ACTIVE_MS = LEADERBOARD_ACTIVE_DAYS * 86_400_000;
const ACTIVE_QUEUES = new Set<number>(LEADERBOARD_QUEUES.all.queues);
/** Remakes are left out, as everywhere in UNIIVERSE. */
const REMAKE_S = 300;

/** The newest game the boards count (a supported queue, not a remake, not after `now`), as its start in ms; null when there is none. */
export function lastCountedGame(games: readonly Pick<LeaderboardGame, "queueId" | "durationS" | "gameCreation">[], now: Date | number): number | null {
  const at = typeof now === "number" ? now : now.getTime();
  let last: number | null = null;
  for (const g of games) {
    if (g.queueId === null || !ACTIVE_QUEUES.has(g.queueId) || (g.durationS !== null && g.durationS < REMAKE_S) || g.gameCreation > at) continue;
    if (last === null || g.gameCreation > last) last = g.gameCreation;
  }
  return last;
}

/** What makes a player active: their newest counted game and their accounts' newest successful data update (ms; null for none). */
export interface PlayerActivity {
  lastGameAt: number | null;
  lastSyncedAt: number | null;
}

/** Whether the boards show this player: a counted game AND a successful data update, both within LEADERBOARD_ACTIVE_DAYS of `now`. */
export function isActivePlayer(activity: PlayerActivity, now: Date | number): boolean {
  const at = typeof now === "number" ? now : now.getTime();
  const since = at - ACTIVE_MS;
  return activity.lastGameAt !== null && activity.lastGameAt >= since && activity.lastGameAt <= at && activity.lastSyncedAt !== null && activity.lastSyncedAt >= since;
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
