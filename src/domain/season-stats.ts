import type { GameRecord } from "./player-stats";
import { seasonOfPatch } from "./season";

/*
  Current-season player statistics. These come from individual stored games (one row per game per
  linked account) rather than pre-aggregated buckets, so season boundaries, game modes and
  duplicates are exact:
    - a game appears once per player even when two of their linked accounts were in it,
    - every figure is counted from the games themselves (never an average of per-account rates),
    - the season is read from each game's patch (16.x = Season 2026).
  This is the player-profile window. Draft recommendations use a separate, patch-recency window
  (current patch and the two before it) over global evidence; the two are deliberately apart.
*/

export interface SeasonGame {
  matchId: string;
  accountId: string;
  queueId: number | null;
  championId: string;
  role: string | null;
  win: boolean | null;
  patch: string | null;
  /** Game start, epoch milliseconds. */
  gameCreation: number;
  /** Per-game performance; null when the game was stored before these were recorded (or kills = -1: Riot no longer serves the details). */
  kills?: number | null;
  deaths?: number | null;
  assists?: number | null;
  cs?: number | null;
  damage?: number | null;
  visionScore?: number | null;
  /** Seconds. */
  gameDuration?: number | null;
}

/**
 * Averages over the games actually collected, each figure over the games that have it (sample
 * counts kept so the page can say "from 37 of 42 games"):
 *   - KDA ratio = (total kills + total assists) ÷ total deaths across the games: one game with
 *     zero deaths cannot make it infinite; with no deaths at all it is reported as "perfect"
 *     and the ratio shown is kills + assists per game;
 *   - CS, champion damage and vision score are per-game averages (CS = lane minions + monsters);
 *   - CS per minute = total CS ÷ total minutes, for comparing games of different lengths.
 */
export interface PerformanceSummary {
  /** Games in the population (record), whether or not they carry details. */
  games: number;
  /** Games with kills/deaths/assists. */
  detailedGames: number;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  kdaRatio: number | null;
  perfectKda: boolean;
  csPerGame: number | null;
  csPerMinute: number | null;
  csGames: number;
  damagePerGame: number | null;
  damageGames: number;
  visionPerGame: number | null;
  visionGames: number;
}

export function performanceOfGames(
  games: readonly SeasonGame[],
): PerformanceSummary {
  let n = 0;
  let k = 0;
  let d = 0;
  let a = 0;
  let csSum = 0;
  let csN = 0;
  let csMinSum = 0;
  let csMinMinutes = 0;
  let dmgSum = 0;
  let dmgN = 0;
  let visSum = 0;
  let visN = 0;
  for (const g of games) {
    const detailed =
      typeof g.kills === "number" &&
      g.kills >= 0 &&
      typeof g.deaths === "number" &&
      typeof g.assists === "number";
    if (detailed) {
      n += 1;
      k += g.kills!;
      d += g.deaths!;
      a += g.assists!;
    }
    if (typeof g.cs === "number" && g.cs >= 0) {
      csSum += g.cs;
      csN += 1;
      if (typeof g.gameDuration === "number" && g.gameDuration > 0) {
        csMinSum += g.cs;
        csMinMinutes += g.gameDuration / 60;
      }
    }
    if (typeof g.damage === "number" && g.damage >= 0) {
      dmgSum += g.damage;
      dmgN += 1;
    }
    if (typeof g.visionScore === "number" && g.visionScore >= 0) {
      visSum += g.visionScore;
      visN += 1;
    }
  }
  return {
    games: games.length,
    detailedGames: n,
    kills: n ? k / n : null,
    deaths: n ? d / n : null,
    assists: n ? a / n : null,
    kdaRatio: n ? (d > 0 ? (k + a) / d : (k + a) / n) : null,
    perfectKda: n > 0 && d === 0,
    csPerGame: csN ? csSum / csN : null,
    csPerMinute: csMinMinutes > 0 ? csMinSum / csMinMinutes : null,
    csGames: csN,
    damagePerGame: dmgN ? dmgSum / dmgN : null,
    damageGames: dmgN,
    visionPerGame: visN ? visSum / visN : null,
    visionGames: visN,
  };
}

export type SeasonMode = "all" | "solo" | "flex" | "normal";

export const SEASON_MODES: Array<{
  key: SeasonMode;
  label: string;
  queues: readonly number[];
  description: string;
}> = [
  {
    key: "all",
    label: "All supported games",
    queues: [420, 440, 400, 430, 480, 490, 700],
    description:
      "Ranked Solo/Duo, Ranked Flex, Normal games (Draft, Quickplay, Swiftplay) and Clash",
  },
  {
    key: "solo",
    label: "Ranked Solo/Duo",
    queues: [420],
    description: "Ranked Solo/Duo only",
  },
  {
    key: "flex",
    label: "Ranked Flex",
    queues: [440],
    description: "Ranked Flex only",
  },
  {
    key: "normal",
    label: "Normal games",
    queues: [400, 430, 480, 490],
    description: "Normal Draft, Blind, Quickplay and Swiftplay",
  },
];

export function isSeasonMode(value: unknown): value is SeasonMode {
  return SEASON_MODES.some((m) => m.key === value);
}

export function seasonModeInfo(mode: SeasonMode) {
  return SEASON_MODES.find((m) => m.key === mode) ?? SEASON_MODES[0]!;
}

/** One game per match: if two of a player's accounts were in the same game it still counts once. */
export function dedupeGames(games: readonly SeasonGame[]): SeasonGame[] {
  const seen = new Set<string>();
  const out: SeasonGame[] = [];
  for (const g of [...games].sort(
    (a, b) =>
      b.gameCreation - a.gameCreation || a.accountId.localeCompare(b.accountId),
  )) {
    if (seen.has(g.matchId)) continue;
    seen.add(g.matchId);
    out.push(g);
  }
  return out;
}

/** Seasons present in the stored games, newest first. */
export function seasonsInGames(games: readonly SeasonGame[]): number[] {
  return [
    ...new Set(
      games
        .map((g) => seasonOfPatch(g.patch))
        .filter((s): s is number => s !== null),
    ),
  ].sort((a, b) => b - a);
}

export function gamesFor(
  games: readonly SeasonGame[],
  options: { season: number; mode: SeasonMode; championId?: string },
): SeasonGame[] {
  const queues = new Set(seasonModeInfo(options.mode).queues);
  return games.filter(
    (g) =>
      seasonOfPatch(g.patch) === options.season &&
      g.queueId !== null &&
      queues.has(g.queueId) &&
      (!options.championId || g.championId === options.championId),
  );
}

export function recordOf(games: readonly SeasonGame[]): GameRecord {
  let wins = 0;
  let decided = 0;
  let last = 0;
  for (const g of games) {
    if (g.win !== null) {
      decided += 1;
      if (g.win) wins += 1;
    }
    last = Math.max(last, g.gameCreation);
  }
  return {
    games: decided,
    wins,
    losses: decided - wins,
    winRate: decided ? wins / decided : null,
    lastPlayedAt: last ? new Date(last) : null,
  };
}

export interface SeasonChampionStats {
  championId: string;
  /** Games in the selected mode. */
  selected: GameRecord;
  /** Averages over the selected games. */
  performance: PerformanceSummary;
  /** Per game mode, always shown as context. */
  solo: GameRecord;
  flex: GameRecord;
  normal: GameRecord;
}

export function seasonChampionStats(
  games: readonly SeasonGame[],
  championIds: readonly string[],
  options: { season: number; mode: SeasonMode },
): SeasonChampionStats[] {
  return championIds.map((championId) => {
    const selected = gamesFor(games, { ...options, championId });
    return {
      championId,
      selected: recordOf(selected),
      performance: performanceOfGames(selected),
      solo: recordOf(
        gamesFor(games, { season: options.season, mode: "solo", championId }),
      ),
      flex: recordOf(
        gamesFor(games, { season: options.season, mode: "flex", championId }),
      ),
      normal: recordOf(
        gamesFor(games, { season: options.season, mode: "normal", championId }),
      ),
    };
  });
}

/** Champions with games in the season and mode that are not in `exclude`, most played first. */
export function otherSeasonChampions(
  games: readonly SeasonGame[],
  exclude: readonly string[],
  options: { season: number; mode: SeasonMode; limit?: number },
): string[] {
  const counts = new Map<string, number>();
  for (const g of gamesFor(games, options))
    if (!exclude.includes(g.championId))
      counts.set(g.championId, (counts.get(g.championId) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, options.limit ?? 12)
    .map(([id]) => id);
}

export interface MasteryEntry {
  accountId: string;
  /** "Name#TAG · OCE" for the breakdown. */
  account: string;
  points: number;
  level: number;
  lastPlayedAt: Date | null;
}

export interface CombinedMastery {
  points: number;
  level: number;
  lastPlayedAt: Date | null;
  accounts: MasteryEntry[];
}

/** Mastery summed over the player's linked accounts (each account once), with the per-account breakdown. */
export function combineMastery(
  entries: readonly MasteryEntry[],
): CombinedMastery | null {
  const byAccount = new Map<string, MasteryEntry>();
  for (const e of entries)
    if (!byAccount.has(e.accountId)) byAccount.set(e.accountId, e);
  const list = [...byAccount.values()]
    .filter((e) => e.points > 0)
    .sort((a, b) => b.points - a.points);
  if (list.length === 0) return null;
  return {
    points: list.reduce((s, e) => s + e.points, 0),
    level: Math.max(...list.map((e) => e.level)),
    lastPlayedAt: list.reduce<Date | null>(
      (m, e) =>
        e.lastPlayedAt && (!m || e.lastPlayedAt > m) ? e.lastPlayedAt : m,
      null,
    ),
    accounts: list,
  };
}

/** Season query string for the profile and My Overview (plain GET parameters). */
export function seasonQuery(
  season: number,
  mode: SeasonMode,
  others: boolean,
): string {
  const params = new URLSearchParams({ season: String(season), mode });
  if (others) params.set("others", "1");
  return params.toString();
}
