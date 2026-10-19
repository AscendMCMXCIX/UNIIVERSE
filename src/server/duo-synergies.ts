import { and, eq, inArray, or, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { championRoleStats, championSynergies, statPeriods } from "@/server/db/schema";
import { comparePatches } from "@/domain/patch";
import type { Role } from "@/domain/roles";
import { MIN_DUO_GAMES, scoreDuos, sortDuos, type DuoRow, type DuoSort, type PairCount } from "@/domain/duo-synergy";
import { poolFor } from "@/domain/roster/eligibility";
import { getCurrentLineup, listPlayers } from "@/server/repositories/team";
import { getStatsVersion } from "@/server/stats/loader";

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
  /** Lineup mode: the two lineup players' pools the pairs were limited to (null for all champions). */
  lineup: { a: { playerId: string; name: string; pool: string[] }; b: { playerId: string; name: string; pool: string[] }; poolPairs: number; withGames: number } | null;
}

/**
 * The listed counts change only when the aggregation job rewrites the pair table, which bumps the
 * statistics version: cached per instance by version, source and patches (a role switch then reads
 * only the chosen pairing).
 */
const listedCache = new Map<string, Promise<Array<{ roleA: string; roleB: string; listed: number | string }>>>();
async function listedPairsCached(db: Db, source: "ranked" | "demo", patches: string[]) {
  const key = `${await getStatsVersion(db)}|${source}|${patches.join(",")}`;
  let hit = listedCache.get(key);
  if (!hit) {
    if (listedCache.size >= 8) listedCache.clear();
    hit = listedPairsByRoles(db, source, patches);
    hit.catch(() => listedCache.delete(key));
    listedCache.set(key, hit);
  }
  return hit;
}

/**
 * Per pairing of two roles, how many champion pairs reach the listing minimum over these patches
 * (all rank bands summed). Each stored row is put in canonical role order first, so a pair stored
 * as (Support, Bottom) and one stored as (Bottom, Support) are one pair, as on the page.
 */
async function listedPairsByRoles(db: Db, source: "ranked" | "demo", patches: string[]): Promise<Array<{ roleA: string; roleB: string; listed: number | string }>> {
  const order = sql.raw(`ARRAY[${DUO_ROLES.map((r) => `'${r}'`).join(",")}]::text[]`);
  const posA = sql`array_position(${order}, ${championSynergies.roleA}::text)`;
  const posB = sql`array_position(${order}, ${championSynergies.roleB}::text)`;
  const firstFirst = sql`${posA} <= ${posB}`;
  const pairs = db
    .select({
      r1: sql<string>`CASE WHEN ${firstFirst} THEN ${championSynergies.roleA}::text ELSE ${championSynergies.roleB}::text END`.as("r1"),
      r2: sql<string>`CASE WHEN ${firstFirst} THEN ${championSynergies.roleB}::text ELSE ${championSynergies.roleA}::text END`.as("r2"),
      c1: sql<string>`CASE WHEN ${firstFirst} THEN ${championSynergies.championAId} ELSE ${championSynergies.championBId} END`.as("c1"),
      c2: sql<string>`CASE WHEN ${firstFirst} THEN ${championSynergies.championBId} ELSE ${championSynergies.championAId} END`.as("c2"),
    })
    .from(championSynergies)
    .where(and(eq(championSynergies.source, source), inArray(championSynergies.patch, patches), sql`${championSynergies.roleA} <> ${championSynergies.roleB}`, inArray(championSynergies.roleA, [...DUO_ROLES]), inArray(championSynergies.roleB, [...DUO_ROLES])))
    .groupBy(sql`1, 2, 3, 4`)
    .having(sql`sum(${championSynergies.games}) >= ${MIN_DUO_GAMES}`)
    .as("pairs");
  return db
    .select({ roleA: pairs.r1, roleB: pairs.r2, listed: sql<number>`count(*)` })
    .from(pairs)
    .groupBy(pairs.r1, pairs.r2);
}

export interface LineupPools {
  a: { playerId: string; name: string; pool: string[] };
  b: { playerId: string; name: string; pool: string[] };
}

/** The active lineup's players in the two roles and their pools for those roles (null when a slot is empty). */
export async function lineupPools(db: Db, teamId: string, roleA: Role, roleB: Role): Promise<LineupPools | null> {
  const [lineup, roster] = await Promise.all([getCurrentLineup(db, teamId), listPlayers(db, teamId)]);
  const pick = (role: Role) => {
    const p = roster.find((x) => x.id === lineup.slots[role]);
    return p ? { playerId: p.id, name: p.displayName, pool: poolFor(p, role) } : null;
  };
  const a = pick(roleA);
  const b = pick(roleB);
  return a && b ? { a, b } : null;
}

export async function buildDuoReport(db: Db, options: { a?: string | null; b?: string | null; pair?: string | null; patch?: string | null; sort?: DuoSort; limit?: number; pools?: LineupPools | null } = {}): Promise<DuoReport> {
  const [first, second] = parseDuoRoles(options);
  const pair = rolePair(first, second);
  const periods = await db.select().from(statPeriods);
  const source: DuoReport["source"] = periods.some((p) => p.source === "ranked" && p.games > 0) ? "ranked" : periods.some((p) => p.source === "demo" && p.games > 0) ? "demo" : "none";
  const pools = options.pools ?? null;
  const poolPairs = pools ? pools.a.pool.reduce((n, x) => n + pools.b.pool.filter((y) => y !== x).length, 0) : 0;
  const lineupInfo = (withGames: number): DuoReport["lineup"] => (pools ? { ...pools, poolPairs, withGames } : null);
  const empty: DuoReport = { source, pair, patches: [], patchOptions: [], patchValue: "recent", games: 0, pairGames: 0, pairsSeen: 0, pairsListed: 0, rows: [], listedByPair: {}, minGames: MIN_DUO_GAMES, lineup: lineupInfo(0) };
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

  // Only the chosen pairing travels, summed in the database over patches and rank bands and
  // oriented as chosen (first role's champion first; a pair is stored once, so swapping the two
  // roles never counts a game twice): the pairs that reach the listing minimum, plus one row of
  // totals for the counts on the page. The two roles' solo records and the other pairings' listed
  // counts (one small row per pairing, for the selectors) come alongside.
  const aFirst = sql`${championSynergies.roleA} = ${first}`;
  const championA = sql<string>`CASE WHEN ${aFirst} THEN ${championSynergies.championAId} ELSE ${championSynergies.championBId} END`;
  const championB = sql<string>`CASE WHEN ${aFirst} THEN ${championSynergies.championBId} ELSE ${championSynergies.championAId} END`;
  // Lineup mode: only pairs where each champion is in that lineup player's pool for the role. The
  // evidence, minimum and maths are the same as for all champions; only the candidates are fewer.
  const inPools = pools ? [inArray(championA, pools.a.pool), inArray(championB, pools.b.pool)] : [];
  const pairsOf = db
    .select({ championA: championA.as("champion_a"), championB: championB.as("champion_b"), games: sql<number>`sum(${championSynergies.games})::int`.as("games"), wins: sql<number>`sum(${championSynergies.wins})::int`.as("wins") })
    .from(championSynergies)
    .where(and(eq(championSynergies.source, source), inArray(championSynergies.patch, patches), or(and(eq(championSynergies.roleA, first), eq(championSynergies.roleB, second)), and(eq(championSynergies.roleA, second), eq(championSynergies.roleB, first))), ...inPools))
    .groupBy(sql`1, 2`)
    .as("pairs");
  const [pairRows, [totals], soloRows, listedRows] = await Promise.all([
    db.select().from(pairsOf).where(sql`${pairsOf.games} >= ${MIN_DUO_GAMES}`),
    db.select({ pairs: sql<number>`count(*)::int`, games: sql<number>`coalesce(sum(${pairsOf.games}), 0)::int` }).from(pairsOf),
    db
      .select({ championId: championRoleStats.championId, role: championRoleStats.role, games: championRoleStats.games, wins: championRoleStats.wins })
      .from(championRoleStats)
      .where(and(eq(championRoleStats.source, source), inArray(championRoleStats.patch, patches), inArray(championRoleStats.role, [first, second]))),
    listedPairsCached(db, source, patches),
  ]);
  const solo = new Map<string, { games: number; wins: number }>();
  for (const r of soloRows) {
    const k = `${r.championId}|${r.role}`;
    const cur = solo.get(k) ?? { games: 0, wins: 0 };
    solo.set(k, { games: cur.games + r.games, wins: cur.wins + r.wins });
  }
  const counts: PairCount[] = pairRows.map((r) => ({ championA: r.championA, roleA: first, championB: r.championB, roleB: second, games: Number(r.games), wins: Number(r.wins) }));
  const listedByPair: Record<string, number> = {};
  for (const rp of ROLE_PAIRS) listedByPair[rp.key] = 0;
  for (const r of listedRows) {
    if (isDuoRole(r.roleA) && isDuoRole(r.roleB) && r.roleA !== r.roleB) listedByPair[pairKey(r.roleA, r.roleB)] = Number(r.listed);
  }
  const scored = scoreDuos(counts, solo);
  return {
    source,
    pair,
    patches,
    patchOptions,
    patchValue: single ? single.patch : "recent",
    games,
    pairGames: Number(totals?.games ?? 0),
    pairsSeen: Number(totals?.pairs ?? 0),
    pairsListed: scored.length,
    rows: sortDuos(scored, options.sort ?? "synergy").slice(0, options.limit ?? 40),
    listedByPair,
    minGames: MIN_DUO_GAMES,
    lineup: lineupInfo(scored.length),
  };
}
