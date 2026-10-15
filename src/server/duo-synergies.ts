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
  key: string;
  label: string;
  roles: [Role, Role];
}

/** The role pairs that actually play together in lane or around the map, in the order offered. */
export const ROLE_PAIRS: readonly RolePair[] = [
  { key: "bot-support", label: "Bottom + Support", roles: ["ADC", "SUPPORT"] },
  { key: "jungle-mid", label: "Jungle + Mid", roles: ["JUNGLE", "MID"] },
  { key: "top-jungle", label: "Top + Jungle", roles: ["TOP", "JUNGLE"] },
  { key: "jungle-support", label: "Jungle + Support", roles: ["JUNGLE", "SUPPORT"] },
  { key: "mid-support", label: "Mid + Support", roles: ["MID", "SUPPORT"] },
];

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
  /** Pairs listed per role pair (for the selector, so thin pairs can be told apart). */
  listedByPair: Record<string, number>;
  minGames: number;
}

export async function buildDuoReport(db: Db, options: { pair?: string | null; patch?: string | null; sort?: DuoSort; limit?: number } = {}): Promise<DuoReport> {
  const pair = ROLE_PAIRS.find((p) => p.key === options.pair) ?? ROLE_PAIRS[0]!;
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

  // Every role pair at once (cheap: aggregated rows), so the selector can say which ones have evidence.
  const wantedRoles = [...new Set(ROLE_PAIRS.flatMap((p) => p.roles))];
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
  // Sum over patches and rank bands, oriented as the role pair reads (first role first).
  const byPair = new Map<string, Map<string, PairCount>>();
  for (const r of pairRows) {
    for (const rp of ROLE_PAIRS) {
      const [first, second] = rp.roles;
      let oriented: PairCount | null = null;
      if (r.roleA === first && r.roleB === second) oriented = { championA: r.championAId, roleA: first, championB: r.championBId, roleB: second, games: r.games, wins: r.wins };
      else if (r.roleA === second && r.roleB === first) oriented = { championA: r.championBId, roleA: first, championB: r.championAId, roleB: second, games: r.games, wins: r.wins };
      if (!oriented) continue;
      const m = byPair.get(rp.key) ?? new Map<string, PairCount>();
      const k = `${oriented.championA}|${oriented.championB}`;
      const cur = m.get(k);
      m.set(k, cur ? { ...cur, games: cur.games + oriented.games, wins: cur.wins + oriented.wins } : oriented);
      byPair.set(rp.key, m);
    }
  }
  const listedByPair: Record<string, number> = {};
  for (const rp of ROLE_PAIRS) listedByPair[rp.key] = [...(byPair.get(rp.key)?.values() ?? [])].filter((p) => p.games >= MIN_DUO_GAMES).length;
  const counts = [...(byPair.get(pair.key)?.values() ?? [])];
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
