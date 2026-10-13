import { desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { proGameBans, proGamePicks, proGames, statPeriods } from "@/server/db/schema";
import { comparePatches } from "@/domain/patch";
import type { Role } from "@/domain/roles";
import { banSlotFor, draftSlotFor } from "@/domain/pro";
import { cachedFor } from "@/server/observability/cache";
import { getStatsVersion } from "@/server/stats/loader";

export interface SlotEntry {
  championId: string;
  role: Role | null;
  games: number;
  winRate: number;
}
export interface PairEntry {
  a: string;
  b: string;
  games: number;
  winRate: number;
}

/** Professional draft patterns derived from games whose pick order is known. */
export interface ProDraftPatterns {
  patches: string[];
  /** Games with full pick order (the sample behind every list below). */
  games: number;
  /** Blue first picks (B1): what pros take when they can take anything. */
  firstPicks: SlotEntry[];
  /** Red first-rotation pairs (R1/R2). */
  firstRotationPairs: PairEntry[];
  /** Blue second-rotation pairs (B2/B3). */
  secondRotationPairs: PairEntry[];
  /** Red last picks (R5): the counterpick slot. */
  counterpicks: SlotEntry[];
  /** Champions banned in the second phase (targeted after seeing the draft). */
  secondPhaseBans: Array<{ championId: string; games: number }>;
  /** Champions picked in several roles (flex retention). */
  flexChampions: Array<{ championId: string; roles: Array<{ role: Role; games: number }> }>;
}

const EMPTY: ProDraftPatterns = { patches: [], games: 0, firstPicks: [], firstRotationPairs: [], secondRotationPairs: [], counterpicks: [], secondPhaseBans: [], flexChampions: [] };

/**
 * Reads pro games on the most recent patches with professional data (up to `maxPatches`) and
 * derives the slot patterns. Pure aggregation: nothing here changes recommendations by itself;
 * the engine consumes the per-champion slot shares through the stats provider.
 */
export async function loadProDraftPatterns(db: Db, options: { maxPatches?: number; limit?: number } = {}): Promise<ProDraftPatterns> {
  const version = await getStatsVersion(db);
  return cachedFor(`pro-patterns:${version}:${options.maxPatches ?? 2}:${options.limit ?? 8}`, 10 * 60_000, () => computeProDraftPatterns(db, options), db);
}

async function computeProDraftPatterns(db: Db, options: { maxPatches?: number; limit?: number }): Promise<ProDraftPatterns> {
  const limit = options.limit ?? 8;
  const periods = await db.select().from(statPeriods).where(eq(statPeriods.source, "pro")).orderBy(desc(statPeriods.updatedAt));
  const patches = [...new Set(periods.filter((p) => p.games > 0).map((p) => p.patch))].sort((a, b) => comparePatches(b, a)).slice(0, options.maxPatches ?? 2);
  if (patches.length === 0) return EMPTY;
  const games = await db.select({ id: proGames.id, winnerSide: proGames.winnerSide }).from(proGames).where(inArray(proGames.patch, patches));
  if (games.length === 0) return { ...EMPTY, patches };
  const ids = games.map((g) => g.id);
  const winnerById = new Map(games.map((g) => [g.id, g.winnerSide]));
  const picks = await db.select().from(proGamePicks).where(inArray(proGamePicks.gameId, ids));
  const bans = ids.length ? await db.select().from(proGameBans).where(inArray(proGameBans.gameId, ids)) : [];

  // Only games where every pick carries an order are usable for slot statistics.
  const byGame = new Map<string, typeof picks>();
  for (const p of picks) byGame.set(p.gameId, [...(byGame.get(p.gameId) ?? []), p]);
  const ordered = [...byGame.entries()].filter(([, ps]) => ps.length === 10 && ps.every((p) => p.pickOrder > 0));

  const slot = new Map<string, { championId: string; roles: Map<Role, number>; games: number; wins: number }>();
  const pairs = { R1R2: new Map<string, PairEntry>(), B2B3: new Map<string, PairEntry>() };
  const roleUse = new Map<string, Map<Role, number>>();
  const bump = (key: string, championId: string, role: Role, win: boolean) => {
    const c = slot.get(key) ?? { championId, roles: new Map<Role, number>(), games: 0, wins: 0 };
    c.games += 1;
    if (win) c.wins += 1;
    c.roles.set(role, (c.roles.get(role) ?? 0) + 1);
    slot.set(key, c);
  };
  for (const [gameId, ps] of ordered) {
    const winner = winnerById.get(gameId) ?? null;
    for (const p of ps) {
      const s = draftSlotFor(p.side, p.pickOrder);
      const win = winner === p.side;
      if (s === "B1") bump(`B1|${p.championId}`, p.championId, p.role, win);
      if (s === "R5") bump(`R5|${p.championId}`, p.championId, p.role, win);
      const ru = roleUse.get(p.championId) ?? new Map<Role, number>();
      ru.set(p.role, (ru.get(p.role) ?? 0) + 1);
      roleUse.set(p.championId, ru);
    }
    const windows: Array<{ key: "R1R2" | "B2B3"; side: "blue" | "red"; orders: number[] }> = [
      { key: "R1R2", side: "red", orders: [1, 2] },
      { key: "B2B3", side: "blue", orders: [2, 3] },
    ];
    for (const { key, side, orders } of windows) {
      const pair = ps.filter((p) => p.side === side && orders.includes(p.pickOrder)).map((p) => p.championId).sort();
      if (pair.length !== 2) continue;
      const k = pair.join("|");
      const cur = pairs[key].get(k) ?? { a: pair[0]!, b: pair[1]!, games: 0, winRate: 0 };
      cur.games += 1;
      if (winner === side) cur.winRate += 1;
      pairs[key].set(k, cur);
    }
  }
  const secondBans = new Map<string, number>();
  const orderedIds = new Set(ordered.map(([id]) => id));
  for (const b of bans) {
    if (!orderedIds.has(b.gameId) || banSlotFor(b.banOrder) !== "BAN2") continue;
    secondBans.set(b.championId, (secondBans.get(b.championId) ?? 0) + 1);
  }

  const entries = (prefix: string): SlotEntry[] =>
    [...slot.entries()]
      .filter(([k]) => k.startsWith(`${prefix}|`))
      .map(([, v]) => ({ championId: v.championId, role: [...v.roles.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null, games: v.games, winRate: v.games ? v.wins / v.games : 0 }))
      .sort((a, b) => b.games - a.games)
      .slice(0, limit);
  const pairList = (m: Map<string, PairEntry>): PairEntry[] =>
    [...m.values()]
      .map((p) => ({ ...p, winRate: p.games ? p.winRate / p.games : 0 }))
      .sort((a, b) => b.games - a.games)
      .slice(0, limit);
  const flexChampions = [...roleUse.entries()]
    .map(([championId, roles]) => {
      const total = [...roles.values()].reduce((s, g) => s + g, 0);
      const list = [...roles.entries()].filter(([, g]) => g / total >= 0.2 && g >= 2).map(([role, games]) => ({ role, games })).sort((a, b) => b.games - a.games);
      return { championId, roles: list, total };
    })
    .filter((f) => f.roles.length >= 2)
    .sort((a, b) => b.total - a.total)
    .slice(0, limit)
    .map(({ championId, roles }) => ({ championId, roles }));

  return {
    patches,
    games: ordered.length,
    firstPicks: entries("B1"),
    firstRotationPairs: pairList(pairs.R1R2),
    secondRotationPairs: pairList(pairs.B2B3),
    counterpicks: entries("R5"),
    secondPhaseBans: [...secondBans.entries()].map(([championId, games]) => ({ championId, games })).sort((a, b) => b.games - a.games).slice(0, limit),
    flexChampions,
  };
}

