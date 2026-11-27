import { clampHaste } from "@/domain/champion-lookup/haste";
import { BUILD_QUEUE_KEYS, DEFAULT_BUILD_QUEUE, type BuildQueueKey, type BuildSource } from "@/domain/champion-builds";
import { isRole, type Role } from "@/domain/roles";

/*
  CHAMPION INTEL's address (docs/CHAMPION_INTEL.md, "Address"):
  /lookup?champion=<id>&haste=<n>&role=<role>&champion2=<id>&haste2=<n>&role2=<role>&queue=<queue>&source=<source>,
  so a reload, a bookmark and a shared link open the same champions at the same hastes, each builds
  section on the role chosen there (left out for its default), and the builds' queue and source
  (the page's, both columns alike: Compare sets two champions' builds from one population side by
  side). The path stayed /lookup when Champion Lookup was renamed Champion Intel (24 Nov 2026), so
  every link made before still opens. Each part is left out when empty or the default (no champion;
  haste 0; Ranked Solo/Duo; the team's matches). A plain module, used by the page and by links
  elsewhere (Matchup Intel's band reads the same `queue`).
*/

/** Champion Intel's page (CHAMPION_INTEL in src/lib/nav.ts). */
export const LOOKUP_PATH = "/lookup";

/** The longest value the address may carry for a champion; anything longer names none. */
const MAX_PARAM = 64;

/** Champion Intel's address for a champion (its Data Dragon id) at a haste; either may be left out. */
export function lookupHref(champion?: string | null, haste?: number | null): string {
  return intelHref({ id: champion ?? null, haste: haste ?? 0 });
}

/** One champion as the address carries it: its Data Dragon id (null for none), its haste and, where one was chosen, the role its builds show. */
export interface AddressChampion {
  id: string | null;
  haste: number;
  role?: Role | null;
}

/** The page's parts of the address, after both champions: the builds' queue and their source. */
export interface AddressPage {
  queue?: BuildQueueKey;
  source?: BuildSource;
}

/**
 * Champion Intel's address for one champion, or two side by side: champion, haste and role for
 * the first, champion2, haste2 and role2 for the second, then the page's queue and source. A second
 * champion with no first is written as the first; a haste of 0, a role not chosen, Ranked Solo/Duo
 * and the team's matches are left out. With the Master+ source the queue is Ranked Solo/Duo by
 * definition, so no queue is written beside it.
 */
export function intelHref(first: AddressChampion | null, second?: AddressChampion | null, page?: AddressPage): string {
  const q = new URLSearchParams();
  const both = [first, second ?? null].filter((c): c is AddressChampion => !!c && (!!c.id || clampHaste(c.haste) > 0));
  const [a, b] = both[0]?.id || !both[1] ? [both[0], both[1]] : [both[1], both[0]];
  if (a?.id) q.set("champion", a.id);
  if (a && clampHaste(a.haste) > 0) q.set("haste", String(clampHaste(a.haste)));
  if (a?.id && a.role) q.set("role", a.role);
  if (b?.id) {
    q.set("champion2", b.id);
    if (clampHaste(b.haste) > 0) q.set("haste2", String(clampHaste(b.haste)));
    if (b.role) q.set("role2", b.role);
  }
  if (a?.id) {
    if (page?.source === "master") q.set("source", "master");
    else if (page?.queue && page.queue !== DEFAULT_BUILD_QUEUE) q.set("queue", page.queue);
  }
  const query = q.toString();
  return query ? `${LOOKUP_PATH}?${query}` : LOOKUP_PATH;
}

/** Two champions exchanged: the second becomes the first, each with its own haste (Compare's Swap); the page's queue and source stay. */
export function swappedHref(first: AddressChampion, second: AddressChampion, page?: AddressPage): string {
  return intelHref(second, first, page);
}

/**
 * Two champions less one (Compare's ✕ on either column): removing the second leaves the first;
 * removing the first makes the second the first, its haste with it; the page's queue and source stay.
 */
export function withoutHref(first: AddressChampion, second: AddressChampion, removed: 0 | 1, page?: AddressPage): string {
  return intelHref(removed === 0 ? second : first, null, page);
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

/** A role as the address gives it ("SUPPORT", in any case), or null for none or anything else. */
export function roleFromAddress(v: string | string[] | undefined): Role | null {
  const s = one(v).toUpperCase();
  return isRole(s) ? s : null;
}

/** The builds' queue as the address gives it ("flex", in any case), or Ranked Solo/Duo for none or anything else (the Matchup Intel band reads it too). */
export function queueFromAddress(v: string | string[] | undefined): BuildQueueKey {
  const s = one(v).toLowerCase();
  return (BUILD_QUEUE_KEYS as readonly string[]).includes(s) ? (s as BuildQueueKey) : DEFAULT_BUILD_QUEUE;
}

/** The builds' source as the address gives it: "master" (the page shows it only where the server offers it), else the team's matches. */
export function sourceFromAddress(v: string | string[] | undefined): BuildSource {
  return one(v).toLowerCase() === "master" ? "master" : "team";
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
