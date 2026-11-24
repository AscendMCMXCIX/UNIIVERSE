import { clampHaste } from "@/domain/champion-lookup/haste";

/*
  CHAMPION LOOKUP's address (docs/CHAMPION_LOOKUP.md, "Address"): /lookup?champion=<id>&haste=<n>,
  so a reload, a bookmark and a shared link open the same champion at the same haste. Both are left
  out when empty (no champion; haste 0). A plain module, used by the page and by links elsewhere.
*/

/** Champion Lookup's page (CHAMPION_LOOKUP in src/lib/nav.ts). */
export const LOOKUP_PATH = "/lookup";

/** The longest value the address may carry for a champion; anything longer names none. */
const MAX_PARAM = 64;

/** Champion Lookup's address for a champion (its Data Dragon id) at a haste; either may be left out. */
export function lookupHref(champion?: string | null, haste?: number | null): string {
  const q = new URLSearchParams();
  if (champion) q.set("champion", champion);
  const h = clampHaste(haste ?? 0);
  if (h > 0) q.set("haste", String(h));
  const query = q.toString();
  return query ? `${LOOKUP_PATH}?${query}` : LOOKUP_PATH;
}

/** One value of a parameter: the first of a repeated one, trimmed; "" for none. */
function one(v: string | string[] | undefined): string {
  const s = typeof v === "string" ? v : Array.isArray(v) && typeof v[0] === "string" ? v[0] : "";
  return s.trim();
}

/** A haste as the address gives it, for the page: whole and from 0 to HASTE_MAX, else 0 (an unreadable value names none). */
export function hasteFromAddress(v: string | string[] | undefined): number {
  return clampHaste(one(v));
}

/**
 * Where Matchup Intel's old address leads (/resources/matchups with any of its parameters: role,
 * champion, vs, ally, vs2, ability): Champion Lookup, carrying one champion. The old page was built
 * around the enemy's cooldowns, so the enemy (`vs`) is the one carried where the address names it;
 * else your champion (`champion`), else the bot lane's other enemy (`vs2`), else your duo partner
 * (`ally`). The page itself checks the name against the roster and drops one it does not know; a
 * value that cannot be a champion's id or name (too long) is left out here. Every other parameter
 * (the lane, the ability's details) has no place in Champion Lookup and is left out.
 */
export function legacyMatchupRedirect(sp: Record<string, string | string[] | undefined>): string {
  for (const key of ["vs", "champion", "vs2", "ally"] as const) {
    const v = one(sp[key]);
    if (v && v.length <= MAX_PARAM) return lookupHref(v);
  }
  return LOOKUP_PATH;
}
