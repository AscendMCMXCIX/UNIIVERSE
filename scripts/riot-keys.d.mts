/** Types for scripts/riot-keys.mjs (the live check is plain JavaScript run by node). */
export const RIOT_KEYS: readonly ["puuid", "gameName", "tagLine", "riotId"];
export function riotKeysOnPage(html: string): { keys: Record<(typeof RIOT_KEYS)[number], number>; total: number; chunks: number; unreadable: number };
