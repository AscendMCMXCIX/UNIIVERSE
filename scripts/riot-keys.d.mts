/** Types for scripts/riot-keys.mjs (the live check is plain JavaScript run by node). */
export const RIOT_KEYS: readonly ["puuid", "gameName", "tagLine", "riotId"];
export function riotKeysOnPage(html: string): { keys: Record<(typeof RIOT_KEYS)[number], number>; total: number; chunks: number; unreadable: number };
export const RIOT_FIGURE_KEYS: readonly ["winRate", "kda", "kdaRatio", "csPerMinute", "visionPerGame", "damagePerMinute", "masteryPoints", "leaguePoints", "lastPlayedAt"];
export function riotFiguresOnPage(html: string): { figures: Record<(typeof RIOT_FIGURE_KEYS)[number], number>; statsVisible: number; games: number; tiers: number; total: number; chunks: number; unreadable: number };
