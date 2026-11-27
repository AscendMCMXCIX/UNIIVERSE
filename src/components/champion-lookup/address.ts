import { clampHaste } from "@/domain/champion-lookup/haste";
import { BUILD_QUEUE_KEYS, DEFAULT_BUILD_QUEUE, type BuildQueueKey, type BuildSource } from "@/domain/champion-builds";
import { isRole, parseRole, type Role } from "@/domain/roles";

/*
  CHAMPION INTEL's address (docs/CHAMPION_INTEL.md, "Address"):
  /lookup?champion=<id>&haste=<n>&role=<role>&champion2=<id>&haste2=<n>&role2=<role>&lane=<lane>&queue=<queue>&source=<source>,
  so a reload, a bookmark and a shared link open the same champions at the same hastes, each builds
  section on the role chosen there (left out for its default), in Compare Matchup Intel's lane
  (lane=TOP|JUNGLE|MID|BOTTOM|SUPPORT, written only with a second champion), and the page's queue
  and builds source (queue=solo|flex|draft|clash, Ranked Solo/Duo left out, read by the builds and
  by Matchup Intel's band alike; source=master for the Master+ builds where offered). The path
  stayed /lookup when Champion Lookup was renamed Champion Intel (24 Nov 2026), so every link made
  before still opens. Each part is left out when empty or the default (no champion; haste 0; Ranked
  Solo/Duo; the team's matches). A plain module, used by the page, by links elsewhere and by the
  proxy (Matchup Intel's old address).
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

/** The page's own parts after both champions: Matchup Intel's lane (Compare only), the queue and the builds' source. */
export interface AddressPage {
  lane?: Role | null;
  queue?: BuildQueueKey | null;
  source?: BuildSource;
}

/** The lane as the address writes it: the position's name players read ("BOTTOM" for the bot lane's carry, the app's "ADC"). */
const LANE_PARAM: Record<Role, string> = { TOP: "TOP", JUNGLE: "JUNGLE", MID: "MID", ADC: "BOTTOM", SUPPORT: "SUPPORT" };

/**
 * Champion Intel's address for one champion, or two side by side: champion, haste and role for
 * the first, champion2, haste2 and role2 for the second, then the page's lane, queue and source. A
 * second champion with no first is written as the first; a haste of 0, a role not chosen, Ranked
 * Solo/Duo and the team's matches are left out; the lane only with two champions. The Master+
 * builds are Ranked Solo/Duo by definition, but the page's queue is still Matchup Intel's band's, so
 * it is written beside `source=master` too (a reload and Swap keep the band on it).
 */
export function intelHref(first: AddressChampion | null, second?: AddressChampion | null, page: AddressPage = {}): string {
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
    if (page.lane) q.set("lane", LANE_PARAM[page.lane]);
  }
  if (a?.id) {
    // The queue is the page's (the builds' and Matchup Intel's band's): kept beside the Master+ source, which reads Ranked Solo/Duo of its own while the band still reads it.
    if (page.queue && page.queue !== DEFAULT_BUILD_QUEUE) q.set("queue", page.queue);
    if (page.source === "master") q.set("source", "master");
  }
  const query = q.toString();
  return query ? `${LOOKUP_PATH}?${query}` : LOOKUP_PATH;
}

/** Two champions exchanged: the second becomes the first, each with its own haste (Compare's Swap); the lane, the queue and the source stay, so the matchup is seen from the other side. */
export function swappedHref(first: AddressChampion, second: AddressChampion, page: AddressPage = {}): string {
  return intelHref(second, first, page);
}

/**
 * Two champions less one (Compare's ✕ on either column): removing the second leaves the first;
 * removing the first makes the second the first, its haste with it. The lane goes with Compare;
 * the queue and the source stay.
 */
export function withoutHref(first: AddressChampion, second: AddressChampion, removed: 0 | 1, page: AddressPage = {}): string {
  return intelHref(removed === 0 ? second : first, null, { queue: page.queue, source: page.source });
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

/** The page's queue as the address gives it ("flex", in any case), or Ranked Solo/Duo for none or anything else: one parameter for the builds and Matchup Intel's band. */
export function queueFromAddress(v: string | string[] | undefined): BuildQueueKey {
  const s = one(v).toLowerCase();
  return (BUILD_QUEUE_KEYS as readonly string[]).includes(s) ? (s as BuildQueueKey) : DEFAULT_BUILD_QUEUE;
}

/** The builds' source as the address gives it: "master" (the page shows it only where the server offers it), else the team's matches. */
export function sourceFromAddress(v: string | string[] | undefined): BuildSource {
  return one(v).toLowerCase() === "master" ? "master" : "team";
}

/** Matchup Intel's lane as the address gives it ("MID", "BOTTOM", "bot", "adc", any case), or null for none or anything else. */
export function laneFromAddress(v: string | string[] | undefined): Role | null {
  const s = one(v);
  return s.length <= 12 ? parseRole(s) : null;
}

/** A haste as the address gives it, for the page: whole and from 0 to HASTE_MAX, else 0 (an unreadable value names none). */
export function hasteFromAddress(v: string | string[] | undefined): number {
  return clampHaste(one(v));
}

/**
 * Where Matchup Intel's old address leads (/resources/matchups with any of its parameters: role,
 * champion, vs, ally, vs2, ability): Champion Intel, which since 27 Nov 2026 holds Matchup Intel in
 * Compare with a lane. Your champion (`champion`) and the enemy (`vs`) become the two champions,
 * and the old lane (`role`: top, jungle, mid, adc, support) the lane: /resources/matchups?role=top&
 * champion=Riven&vs=Mordekaiser leads to /lookup?champion=Riven&champion2=Mordekaiser&lane=TOP.
 * One of the two alone is carried alone, with no lane (a lane needs two champions); with neither,
 * the bot lane's other enemy (`vs2`), else your duo partner (`ally`), alone: the old two-against-two
 * has no place in the new page. The page checks each name against the roster and drops one it does
 * not know; a value that cannot be a champion's id or name (too long) is left out here, and an
 * ability's details are dropped.
 */
export function legacyMatchupRedirect(sp: Record<string, string | string[] | undefined>): string {
  const named = (key: string) => {
    const v = one(sp[key]);
    return v && v.length <= MAX_PARAM ? v : null;
  };
  const champion = named("champion");
  const vs = named("vs");
  if (champion && vs) return intelHref({ id: champion, haste: 0 }, { id: vs, haste: 0 }, { lane: laneFromAddress(sp.role) });
  const alone = vs ?? champion ?? named("vs2") ?? named("ally");
  return alone ? lookupHref(alone) : LOOKUP_PATH;
}
