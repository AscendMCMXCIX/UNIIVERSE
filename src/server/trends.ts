import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { championBanStats, championRoleStats, statPeriods } from "@/server/db/schema";
import { comparePatches } from "@/domain/patch";
import { ROLES, type Role } from "@/domain/roles";
import { shrinkRate } from "@/domain/stats";
import type { PlayerProfile } from "@/domain/roster";
import { poolFor, legalRolesFor } from "@/domain/roster";

export interface ChampionTrend {
  championId: string;
  role: Role | null;
  pickRate: number;
  banRate: number;
  presence: number;
  winRate: number;
  games: number;
  confidence: number;
  presenceDelta: number | null;
  winRateDelta: number | null;
  proPresence: number;
}

export interface PoolAlert {
  playerId: string;
  displayName: string;
  role: Role;
  championId: string;
  message: string;
  severity: "info" | "warn";
}

export interface TrendsReport {
  patch: string | null;
  previousPatch: string | null;
  source: "ranked" | "demo" | "none";
  totalGames: number;
  contested: ChampionTrend[];
  rising: ChampionTrend[];
  falling: ChampionTrend[];
  byRole: Record<Role, ChampionTrend[]>;
  pro: Array<{ championId: string; presence: number; games: number }>;
  poolAlerts: PoolAlert[];
}

/**
 * Trends compare the current statistical period with the previous one. Everything is computed
 * from the aggregate tables (never raw matches) so the page is cheap to render.
 */
export async function buildTrendsReport(db: Db, currentPatch: string | null, lineup: PlayerProfile[] | null): Promise<TrendsReport> {
  const periods = await db.select().from(statPeriods);
  const real = periods.filter((p) => p.source === "ranked" && p.games > 0);
  const source: TrendsReport["source"] = real.length > 0 ? "ranked" : periods.some((p) => p.source === "demo" && p.games > 0) ? "demo" : "none";
  const empty: TrendsReport = { patch: currentPatch, previousPatch: null, source, totalGames: 0, contested: [], rising: [], falling: [], byRole: { TOP: [], JUNGLE: [], MID: [], ADC: [], SUPPORT: [] }, pro: [], poolAlerts: [] };
  if (source === "none") return empty;

  const sourcePeriods = periods.filter((p) => p.source === source && p.games > 0).sort((a, b) => comparePatches(b.patch, a.patch));
  const patch = currentPatch && sourcePeriods.some((p) => p.patch === currentPatch) ? currentPatch : sourcePeriods[0]?.patch ?? null;
  if (!patch) return empty;
  const previous = sourcePeriods.find((p) => comparePatches(p.patch, patch) < 0)?.patch ?? null;
  const totalGames = sourcePeriods.find((p) => p.patch === patch)?.games ?? 0;
  const prevGames = previous ? sourcePeriods.find((p) => p.patch === previous)?.games ?? 0 : 0;

  const patches = previous ? [patch, previous] : [patch];
  const roleRows = await db.select().from(championRoleStats).where(and(eq(championRoleStats.source, source), inArray(championRoleStats.patch, patches)));
  const banRows = await db.select().from(championBanStats).where(and(eq(championBanStats.source, source), inArray(championBanStats.patch, patches)));
  const proPeriod = periods.find((p) => p.source === "pro" && p.patch === patch);
  const proGames = proPeriod?.games ?? 0;
  const proRows = proGames > 0 ? await db.select().from(championRoleStats).where(and(eq(championRoleStats.source, "pro"), eq(championRoleStats.patch, patch))) : [];
  const proBans = proGames > 0 ? await db.select().from(championBanStats).where(and(eq(championBanStats.source, "pro"), eq(championBanStats.patch, patch))) : [];

  const agg = (rows: typeof roleRows, p: string) => {
    const map = new Map<string, { games: number; wins: number; byRole: Map<Role, { games: number; wins: number }> }>();
    for (const r of rows) {
      if (r.patch !== p) continue;
      const e = map.get(r.championId) ?? { games: 0, wins: 0, byRole: new Map() };
      e.games += r.games;
      e.wins += r.wins;
      const br = e.byRole.get(r.role) ?? { games: 0, wins: 0 };
      br.games += r.games;
      br.wins += r.wins;
      e.byRole.set(r.role, br);
      map.set(r.championId, e);
    }
    return map;
  };
  const cur = agg(roleRows, patch);
  const prev = previous ? agg(roleRows, previous) : new Map();
  const curBans = new Map(banRows.filter((b) => b.patch === patch).map((b) => [b.championId, b.bans]));
  const prevBans = new Map(banRows.filter((b) => b.patch === previous).map((b) => [b.championId, b.bans]));
  const proPresence = new Map<string, number>();
  for (const r of proRows) proPresence.set(r.championId, (proPresence.get(r.championId) ?? 0) + r.games);
  for (const b of proBans) proPresence.set(b.championId, (proPresence.get(b.championId) ?? 0) + b.bans);

  const trends: ChampionTrend[] = [];
  for (const [championId, e] of cur) {
    const pickRate = totalGames > 0 ? e.games / totalGames : 0;
    const banRate = totalGames > 0 ? (curBans.get(championId) ?? 0) / totalGames : 0;
    const shrunk = shrinkRate({ wins: e.wins, games: e.games }, 0.5, 250);
    const p = prev.get(championId);
    const prevPresence = prevGames > 0 && p ? (p.games + (prevBans.get(championId) ?? 0)) / prevGames : null;
    const prevWr = p && p.games >= 100 ? p.wins / p.games : null;
    const mainRole = [...e.byRole.entries()].sort((a, b) => b[1].games - a[1].games)[0]?.[0] ?? null;
    trends.push({
      championId,
      role: mainRole,
      pickRate,
      banRate,
      presence: pickRate + banRate,
      winRate: shrunk.estimate,
      games: e.games,
      confidence: shrunk.confidence,
      presenceDelta: prevPresence === null ? null : pickRate + banRate - prevPresence,
      winRateDelta: prevWr === null || e.games < 100 ? null : e.wins / e.games - prevWr,
      proPresence: proGames > 0 ? (proPresence.get(championId) ?? 0) / proGames : 0,
    });
  }

  const contested = [...trends].sort((a, b) => b.presence - a.presence).slice(0, 30);
  const movers = trends.filter((t) => t.presenceDelta !== null && t.games >= 50);
  const rising = [...movers].sort((a, b) => (b.presenceDelta ?? 0) - (a.presenceDelta ?? 0)).filter((t) => (t.presenceDelta ?? 0) > 0.005).slice(0, 15);
  const falling = [...movers].sort((a, b) => (a.presenceDelta ?? 0) - (b.presenceDelta ?? 0)).filter((t) => (t.presenceDelta ?? 0) < -0.005).slice(0, 15);
  const byRole = { TOP: [], JUNGLE: [], MID: [], ADC: [], SUPPORT: [] } as Record<Role, ChampionTrend[]>;
  for (const role of ROLES) {
    const list: ChampionTrend[] = [];
    for (const r of roleRows) {
      if (r.patch !== patch || r.role !== role || r.games < 30) continue;
      const shrunk = shrinkRate({ wins: r.wins, games: r.games }, 0.5, 250);
      const base = trends.find((t) => t.championId === r.championId);
      list.push({ ...(base ?? { championId: r.championId, pickRate: 0, banRate: 0, presence: 0, presenceDelta: null, winRateDelta: null, proPresence: 0 }), role, winRate: shrunk.estimate, games: r.games, confidence: shrunk.confidence, pickRate: totalGames ? r.games / totalGames : 0 });
    }
    byRole[role] = list.sort((a, b) => b.pickRate - a.pickRate).slice(0, 20);
  }
  const pro = [...proPresence.entries()].map(([championId, n]) => ({ championId, presence: proGames > 0 ? n / proGames : 0, games: proGames })).sort((a, b) => b.presence - a.presence).slice(0, 30);

  const poolAlerts: PoolAlert[] = [];
  if (lineup) {
    const byId = new Map(trends.map((t) => [t.championId, t]));
    for (const player of lineup) {
      for (const role of legalRolesFor(player)) {
        const highBan = poolFor(player, role).filter((c) => (byId.get(c)?.banRate ?? 0) >= 0.15);
        if (highBan.length >= 2) {
          poolAlerts.push({ playerId: player.id, displayName: player.displayName, role, championId: highBan[0]!, severity: "warn", message: `${highBan.length} champions in ${player.displayName}'s ${role} pool are receiving high ban priority (${highBan.join(", ")})` });
        }
        for (const c of poolFor(player, role)) {
          const t = byId.get(c);
          if (!t) continue;
          if (t.winRateDelta !== null && t.winRateDelta <= -0.02) poolAlerts.push({ playerId: player.id, displayName: player.displayName, role, championId: c, severity: "warn", message: `${c} dropped ${(Math.abs(t.winRateDelta) * 100).toFixed(1)} points since last patch` });
          if (t.winRateDelta !== null && t.winRateDelta >= 0.02) poolAlerts.push({ playerId: player.id, displayName: player.displayName, role, championId: c, severity: "info", message: `${c} is up ${(t.winRateDelta * 100).toFixed(1)} points since last patch` });
        }
      }
    }
  }

  return { patch, previousPatch: previous, source, totalGames, contested, rising, falling, byRole, pro, poolAlerts: poolAlerts.slice(0, 12) };
}
