import { and, eq, inArray, or } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { championRoleStats, championSynergies, statPeriods } from "@/server/db/schema";
import { comparePatches } from "@/domain/patch";
import type { Role } from "@/domain/roles";
import { MIN_DUO_GAMES, scoreDuos, sortDuos, type DuoRow, type DuoSort, type PairCount } from "@/domain/duo-synergy";

/*
  Meta & Trends → Duo Synergies: champion pairs on the same team, from the global ranked games
  UNIIVERSE already collects (Emerald+ Ranked Solo/Duo, the Solo Queue Meta's evidence; never pro
  games, never our own players' games). Read from the aggregated pair table: no Riot calls.
*/

export interface RolePair {
  /** Canonical key (role order Top, Jungle, Mid, Bottom, Support): the same for either orientation. */
  key: string;
  /** In the order chosen, e.g. "Support + Top". */
  label: string;
  /** In the order chosen (rows are oriented this way). */
  roles: [Role, Role];
}

/** The five roles in canonical order: a pair's evidence is keyed by its two roles in this order. */
export const DUO_ROLES = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"] as const satisfies readonly Role[];
const SLUG: Record<(typeof DUO_ROLES)[number], string> = { TOP: "top", JUNGLE: "jungle", MID: "mid", ADC: "bot", SUPPORT: "support" };
const LABEL: Record<(typeof DUO_ROLES)[number], string> = { TOP: "Top", JUNGLE: "Jungle", MID: "Mid", ADC: "Bottom", SUPPORT: "Support" };
const isDuoRole = (r: unknown): r is (typeof DUO_ROLES)[number] => typeof r === "string" && (DUO_ROLES as readonly string[]).includes(r);

/** The two roles in canonical order (Top + Jungle and Jungle + Top are one pairing). */
export function canonicalRoles(a: Role, b: Role): [Role, Role] {
  return DUO_ROLES.indexOf(a as (typeof DUO_ROLES)[number]) <= DUO_ROLES.indexOf(b as (typeof DUO_ROLES)[number]) ? [a, b] : [b, a];
}
export const pairKey = (a: Role, b: Role) => canonicalRoles(a, b).map((r) => SLUG[r as (typeof DUO_ROLES)[number]]).join("-");
const rolePair = (a: Role, b: Role): RolePair => ({ key: pairKey(a, b), label: `${LABEL[a as (typeof DUO_ROLES)[number]]} + ${LABEL[b as (typeof DUO_ROLES)[number]]}`, roles: [a, b] });

/** All ten pairings of two different roles, in canonical order. */
export const ROLE_PAIRS: readonly RolePair[] = DUO_ROLES.flatMap((a, i) => DUO_ROLES.slice(i + 1).map((b) => rolePair(a, b)));
/** The pair shown first: Bottom + Support. */
export const DEFAULT_DUO_ROLES: [Role, Role] = ["ADC", "SUPPORT"];

/**
 * The two roles to show, in the order chosen: from `a` and `b` (any two different roles), or a
 * pair key from older links (e.g. "bot-support"); otherwise Bottom + Support.
 */
export function parseDuoRoles(options: { a?: string | null; b?: string | null; pair?: string | null }): [Role, Role] {
  if (isDuoRole(options.a) && isDuoRole(options.b) && options.a !== options.b) return [options.a, options.b];
  const legacy = ROLE_PAIRS.find((p) => p.key === options.pair);
  return legacy ? legacy.roles : DEFAULT_DUO_ROLES;
}

/** How many recent patches the default view pools together (one patch is usually too thin for pairs). */
export const DUO_PATCH_WINDOW = 3;

export interface DuoReport {
  source: "ranked" | "demo" | "none";
  pair: RolePair;
  /** Patches counted. */
  patches: string[];
  /** Selectable: the recent window, or one of its patches. */
  patchOptions: Array<{ value: string; label: string; games: number }>;
  patchValue: string;
  /** Games in the counted patches (each game holds one pair of these roles per team). */
  games: number;
  /** Pair observations (games × 2 teams) behind this role pair. */
  pairGames: number;
  /** Distinct pairs seen, and how many reach the listing minimum. */
  pairsSeen: number;
  pairsListed: number;
  rows: DuoRow[];
  /** Pairs listed per role pair, by canonical key (for the selectors, so thin pairs can be told apart). */
  listedByPair: Record<string, number>;
  minGames: number;
}

export async function buildDuoReport(db: Db, options: { a?: string | null; b?: string | null; pair?: string | null; patch?: string | null; sort?: DuoSort; limit?: number } = {}): Promise<DuoReport> {
  const [first, second] = parseDuoRoles(options);
  const pair = rolePair(first, second);
  const periods = await db.select().from(statPeriods);
  const source: DuoReport["source"] = periods.some((p) => p.source === "ranked" && p.games > 0) ? "ranked" : periods.some((p) => p.source === "demo" && p.games > 0) ? "demo" : "none";
  const empty: DuoReport = { source, pair, patches: [], patchOptions: [], patchValue: "recent", games: 0, pairGames: 0, pairsSeen: 0, pairsListed: 0, rows: [], listedByPair: {}, minGames: MIN_DUO_GAMES };
  if (source === "none") return empty;
  const recent = periods.filter((p) => p.source === source && p.games > 0).sort((a, b) => comparePatches(b.patch, a.patch)).slice(0, DUO_PATCH_WINDOW);
  if (recent.length === 0) return empty;
  const single = recent.find((p) => p.patch === options.patch);
  const counted = single ? [single] : recent;
  const patches = counted.map((p) => p.patch);
  const games = counted.reduce((n, p) => n + p.games, 0);
  const patchOptions = [
    { value: "recent", label: recent.length > 1 ? `Last ${recent.length} patches (${recent.map((p) => p.patch).join(", ")})` : `Patch ${recent[0]!.patch}`, games: recent.reduce((n, p) => n + p.games, 0) },
    ...(recent.length > 1 ? recent.map((p) => ({ value: p.patch, label: `Patch ${p.patch} only`, games: p.games })) : []),
  ];

  // Every role pair at once (cheap: aggregated rows), so the selectors can say which ones have evidence.
  const wantedRoles = [...DUO_ROLES];
  const [pairRows, soloRows] = await Promise.all([
    db
      .select({ championAId: championSynergies.championAId, roleA: championSynergies.roleA, championBId: championSynergies.championBId, roleB: championSynergies.roleB, games: championSynergies.games, wins: championSynergies.wins })
      .from(championSynergies)
      .where(and(eq(championSynergies.source, source), inArray(championSynergies.patch, patches), inArray(championSynergies.roleA, wantedRoles), inArray(championSynergies.roleB, wantedRoles))),
    db
      .select({ championId: championRoleStats.championId, role: championRoleStats.role, games: championRoleStats.games, wins: championRoleStats.wins })
      .from(championRoleStats)
      .where(and(eq(championRoleStats.source, source), inArray(championRoleStats.patch, patches), or(...wantedRoles.map((r) => eq(championRoleStats.role, r))))),
  ]);
  const solo = new Map<string, { games: number; wins: number }>();
  for (const r of soloRows) {
    const k = `${r.championId}|${r.role}`;
    const cur = solo.get(k) ?? { games: 0, wins: 0 };
    solo.set(k, { games: cur.games + r.games, wins: cur.wins + r.wins });
  }
  // Sum over patches and rank bands. Every pairing is counted under its canonical key (for the
  // selectors); the chosen pairing is oriented as chosen (first role's champion first). A row is
  // stored once per pair of champions, so swapping the two roles never counts a game twice.
  const listedCounts = new Map<string, Map<string, number>>();
  const chosen = new Map<string, PairCount>();
  for (const r of pairRows) {
    if (r.roleA === r.roleB) continue;
    const key = pairKey(r.roleA as Role, r.roleB as Role);
    const champs = r.roleA === canonicalRoles(r.roleA as Role, r.roleB as Role)[0] ? `${r.championAId}|${r.championBId}` : `${r.championBId}|${r.championAId}`;
    const m = listedCounts.get(key) ?? new Map<string, number>();
    m.set(champs, (m.get(champs) ?? 0) + r.games);
    listedCounts.set(key, m);
    let oriented: PairCount | null = null;
    if (r.roleA === first && r.roleB === second) oriented = { championA: r.championAId, roleA: first, championB: r.championBId, roleB: second, games: r.games, wins: r.wins };
    else if (r.roleA === second && r.roleB === first) oriented = { championA: r.championBId, roleA: first, championB: r.championAId, roleB: second, games: r.games, wins: r.wins };
    if (!oriented) continue;
    const k = `${oriented.championA}|${oriented.championB}`;
    const cur = chosen.get(k);
    chosen.set(k, cur ? { ...cur, games: cur.games + oriented.games, wins: cur.wins + oriented.wins } : oriented);
  }
  const listedByPair: Record<string, number> = {};
  for (const rp of ROLE_PAIRS) listedByPair[rp.key] = [...(listedCounts.get(rp.key)?.values() ?? [])].filter((g) => g >= MIN_DUO_GAMES).length;
  const counts = [...chosen.values()];
  const scored = scoreDuos(counts, solo);
  return {
    source,
    pair,
    patches,
    patchOptions,
    patchValue: single ? single.patch : "recent",
    games,
    pairGames: counts.reduce((n, p) => n + p.games, 0),
    pairsSeen: counts.length,
    pairsListed: scored.length,
    rows: sortDuos(scored, options.sort ?? "synergy").slice(0, options.limit ?? 40),
    listedByPair,
    minGames: MIN_DUO_GAMES,
  };
}
