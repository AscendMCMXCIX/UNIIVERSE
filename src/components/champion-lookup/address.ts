import { clampHaste } from "@/domain/champion-lookup/haste";

/*
  CHAMPION INTEL's address (docs/CHAMPION_INTEL.md, "Address"):
  /lookup?champion=<id>&haste=<n>&champion2=<id>&haste2=<n>, so a reload, a bookmark and a shared
  link open the same champions at the same hastes. The path stayed /lookup when Champion Lookup was
  renamed Champion Intel (24 Nov 2026), so every link made before still opens. Each part is left out
  when empty (no champion; haste 0). A plain module, used by the page and by links elsewhere.
*/

/** Champion Intel's page (CHAMPION_INTEL in src/lib/nav.ts). */
export const LOOKUP_PATH = "/lookup";

/** The longest value the address may carry for a champion; anything longer names none. */
const MAX_PARAM = 64;

/** Champion Intel's address for a champion (its Data Dragon id) at a haste; either may be left out. */
export function lookupHref(champion?: string | null, haste?: number | null): string {
  return intelHref({ id: champion ?? null, haste: haste ?? 0 });
}

/** One champion as the address carries it: its Data Dragon id (null for none) and its haste. */
export interface AddressChampion {
  id: string | null;
  haste: number;
}

/**
 * Champion Intel's address for one champion, or two side by side: champion and haste for the
 * first, champion2 and haste2 for the second. A second champion with no first is written as the
 * first; a haste of 0 is left out.
 */
export function intelHref(first: AddressChampion | null, second?: AddressChampion | null): string {
  const q = new URLSearchParams();
  const both = [first, second ?? null].filter((c): c is AddressChampion => !!c && (!!c.id || clampHaste(c.haste) > 0));
  const [a, b] = both[0]?.id || !both[1] ? [both[0], both[1]] : [both[1], both[0]];
  if (a?.id) q.set("champion", a.id);
  if (a && clampHaste(a.haste) > 0) q.set("haste", String(clampHaste(a.haste)));
  if (b?.id) {
    q.set("champion2", b.id);
    if (clampHaste(b.haste) > 0) q.set("haste2", String(clampHaste(b.haste)));
  }
  const query = q.toString();
  return query ? `${LOOKUP_PATH}?${query}` : LOOKUP_PATH;
}

/** One value of a parameter: the first of a repeated one, trimmed; "" for none. */
function one(v: string | string[] | undefined): string {
  const s = typeof v === "string" ? v : Array.isArray(v) && typeof v[0] === "string" ? v[0] : "";
  return s.trim();
}

/** The first value of a parameter, trimmed, or undefined: what the page hands the server as a champion's name. */
export function paramOf(v: string | string[] | undefined): string | undefined {
  return one(v) || undefined;
}

/** A haste as the address gives it, for the page: whole and from 0 to HASTE_MAX, else 0 (an unreadable value names none). */
export function hasteFromAddress(v: string | string[] | undefined): number {
  return clampHaste(one(v));
}

/**
 * Where Matchup Intel's old address leads (/resources/matchups with any of its parameters: role,
 * champion, vs, ally, vs2, ability): Champion Intel, carrying one champion. The old page was built
 * around the enemy's cooldowns, so the enemy (`vs`) is the one carried where the address names it;
 * else your champion (`champion`), else the bot lane's other enemy (`vs2`), else your duo partner
 * (`ally`). The page itself checks the name against the roster and drops one it does not know; a
 * value that cannot be a champion's id or name (too long) is left out here. Every other parameter
 * (the lane, the ability's details) has no place in Champion Intel and is left out.
 */
export function legacyMatchupRedirect(sp: Record<string, string | string[] | undefined>): string {
  for (const key of ["vs", "champion", "vs2", "ally"] as const) {
    const v = one(sp[key]);
    if (v && v.length <= MAX_PARAM) return lookupHref(v);
  }
  return LOOKUP_PATH;
}
