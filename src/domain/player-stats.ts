/*
  Player statistics from stored Riot match history: plain counts and win rates over a patch
  window and a set of queues. Shared by the Team page (compact champion context) and the Player
  Overview (champion cards). Everything here is a count of games the pipeline already stored;
  nothing is modelled, so a number is only shown when games exist.
*/

export type QueueGroup = "solo" | "flex" | "normal" | "other";

/** One stored history bucket (account × champion × role × queue × patch), with the patch distance resolved. */
export interface HistoryBucket {
  championId: string;
  queueGroup: string;
  /** 0 = current patch, 1 = previous, …; null when the patch is unknown. */
  patchDistance: number | null;
  games: number;
  wins: number;
  lastPlayedAt: Date | null;
}

export type GameMode = "ranked" | "solo" | "flex";
export const GAME_MODES: Array<{ key: GameMode; label: string; queues: QueueGroup[] }> = [
  { key: "ranked", label: "All ranked (Solo/Duo + Flex)", queues: ["solo", "flex"] },
  { key: "solo", label: "Solo/Duo", queues: ["solo"] },
  { key: "flex", label: "Ranked Flex", queues: ["flex"] },
];

export type PatchWindow = 0 | 1 | 2 | "all";
export const PATCH_WINDOWS: Array<{ key: PatchWindow; label: string }> = [
  { key: 0, label: "Current patch" },
  { key: 1, label: "Current + previous patch" },
  { key: 2, label: "Current + previous 2" },
  { key: "all", label: "Longer history (every stored patch)" },
];
export const DEFAULT_PATCH_WINDOW: PatchWindow = 2;

export function isGameMode(value: unknown): value is GameMode {
  return GAME_MODES.some((m) => m.key === value);
}

export function parsePatchWindow(value: string | null | undefined): PatchWindow {
  if (value === "all") return "all";
  const n = Number(value);
  return n === 0 || n === 1 || n === 2 ? n : DEFAULT_PATCH_WINDOW;
}

export interface GameRecord {
  games: number;
  wins: number;
  losses: number;
  /** 0..1, null when there are no games (never shown as 0%). */
  winRate: number | null;
  lastPlayedAt: Date | null;
}

export const EMPTY_RECORD: GameRecord = { games: 0, wins: 0, losses: 0, winRate: null, lastPlayedAt: null };

function inWindow(b: HistoryBucket, window: PatchWindow): boolean {
  if (window === "all") return true;
  return b.patchDistance !== null && b.patchDistance <= window;
}

function record(buckets: HistoryBucket[]): GameRecord {
  let games = 0;
  let wins = 0;
  let last: Date | null = null;
  for (const b of buckets) {
    games += b.games;
    wins += b.wins;
    if (b.lastPlayedAt && (!last || b.lastPlayedAt > last)) last = b.lastPlayedAt;
  }
  return { games, wins, losses: games - wins, winRate: games ? wins / games : null, lastPlayedAt: last };
}

/** Games and win rate for a set of queues inside a patch window. */
export function summarise(buckets: HistoryBucket[], options: { queues: readonly QueueGroup[]; window: PatchWindow; championId?: string }): GameRecord {
  const queues = new Set<string>(options.queues);
  return record(buckets.filter((b) => queues.has(b.queueGroup) && inWindow(b, options.window) && (!options.championId || b.championId === options.championId)));
}

export interface ChampionCard {
  championId: string;
  /** The selected game mode inside the selected patch window. */
  selected: GameRecord;
  /** Fixed context on every card, independent of the mode dropdown. */
  solo: GameRecord;
  flex: GameRecord;
  /** All ranked games on the current and previous two patches. */
  recentThreePatches: GameRecord;
}

/** One card per champion, in the order given (pool order), so configured champions come first. */
export function championCards(buckets: HistoryBucket[], championIds: readonly string[], options: { mode: GameMode; window: PatchWindow }): ChampionCard[] {
  const mode = GAME_MODES.find((m) => m.key === options.mode) ?? GAME_MODES[0]!;
  return championIds.map((championId) => ({
    championId,
    selected: summarise(buckets, { queues: mode.queues, window: options.window, championId }),
    solo: summarise(buckets, { queues: ["solo"], window: options.window, championId }),
    flex: summarise(buckets, { queues: ["flex"], window: options.window, championId }),
    recentThreePatches: summarise(buckets, { queues: ["solo", "flex"], window: 2, championId }),
  }));
}

/** Champions with ranked games in the window that are not in the given list (for "other champions"). */
export function otherChampionsPlayed(buckets: HistoryBucket[], exclude: readonly string[], options: { mode: GameMode; window: PatchWindow; limit?: number }): string[] {
  const mode = GAME_MODES.find((m) => m.key === options.mode) ?? GAME_MODES[0]!;
  const queues = new Set<string>(mode.queues);
  const games = new Map<string, number>();
  for (const b of buckets) {
    if (!queues.has(b.queueGroup) || !inWindow(b, options.window) || exclude.includes(b.championId)) continue;
    games.set(b.championId, (games.get(b.championId) ?? 0) + b.games);
  }
  return [...games.entries()]
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, options.limit ?? 12)
    .map(([id]) => id);
}

/** Query string for the Player Overview filters (plain GET parameters, no state anywhere else). */
export function overviewQuery(mode: GameMode, window: PatchWindow, others: boolean): string {
  const params = new URLSearchParams({ mode, window: String(window) });
  if (others) params.set("others", "1");
  return params.toString();
}
