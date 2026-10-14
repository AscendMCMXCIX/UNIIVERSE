import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { championBanStats, championRoleStats, statPeriods } from "@/server/db/schema";
import { comparePatches } from "@/domain/patch";
import { ROLE_LABELS, ROLES, type Role } from "@/domain/roles";
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

/** Patch-to-patch changes are shown only when both patches have at least this many games. */
export const MIN_COMPARISON_GAMES = 500;
/** "Strong performing" needs this many games in the champion's main role. */
export const MIN_STRONG_GAMES = 150;

export interface TrendsReport {
  patch: string | null;
  previousPatch: string | null;
  source: "ranked" | "demo" | "none";
  totalGames: number;
  /** Games on the previous patch (for the comparison note). */
  previousGames: number;
  /** Rising / falling are meaningful only with enough games on both patches. */
  comparison: { supported: boolean; reason: string | null };
  /** Highest presence (pick + ban). */
  contested: ChampionTrend[];
  mostPicked: ChampionTrend[];
  mostBanned: ChampionTrend[];
  /** Highest adjusted win rate in their main role, with enough games. */
  strong: ChampionTrend[];
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
export async function buildTrendsReport(db: Db, currentPatch: string | null, lineup: PlayerProfile[] | null, nameOf: (championId: string) => string = (id) => id): Promise<TrendsReport> {
  const periods = await db.select().from(statPeriods);
  const real = periods.filter((p) => p.source === "ranked" && p.games > 0);
  const source: TrendsReport["source"] = real.length > 0 ? "ranked" : periods.some((p) => p.source === "demo" && p.games > 0) ? "demo" : "none";
  const empty: TrendsReport = { patch: currentPatch, previousPatch: null, source, totalGames: 0, previousGames: 0, comparison: { supported: false, reason: null }, contested: [], mostPicked: [], mostBanned: [], strong: [], rising: [], falling: [], byRole: { TOP: [], JUNGLE: [], MID: [], ADC: [], SUPPORT: [] }, pro: [], poolAlerts: [] };
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
  // Champions banned but never picked this patch still belong in "Most banned" and presence.
  for (const championId of curBans.keys()) if (!cur.has(championId)) cur.set(championId, { games: 0, wins: 0, byRole: new Map() });
  for (const [championId, e] of cur) {
    const pickRate = totalGames > 0 ? e.games / totalGames : 0;
    const banRate = totalGames > 0 ? (curBans.get(championId) ?? 0) / totalGames : 0;
    const main = [...e.byRole.entries()].sort((a, b) => b[1].games - a[1].games)[0];
    // Win rate in the main role (a champion's off-role games would blur it), shrunk towards 50%.
    const shrunk = shrinkRate({ wins: main?.[1].wins ?? 0, games: main?.[1].games ?? 0 }, 0.5, 250);
    const p = prev.get(championId);
    const prevPresence = prevGames > 0 && p ? (p.games + (prevBans.get(championId) ?? 0)) / prevGames : null;
    const prevWr = p && p.games >= 100 ? p.wins / p.games : null;
    const mainRole = main?.[0] ?? null;
    trends.push({
      championId,
      role: mainRole,
      pickRate,
      banRate,
      presence: pickRate + banRate,
      winRate: shrunk.estimate,
      games: main?.[1].games ?? 0,
      confidence: shrunk.confidence,
      presenceDelta: prevPresence === null ? null : pickRate + banRate - prevPresence,
      winRateDelta: prevWr === null || e.games < 100 ? null : e.wins / e.games - prevWr,
      proPresence: proGames > 0 ? (proPresence.get(championId) ?? 0) / proGames : 0,
    });
  }

  const contested = [...trends].sort((a, b) => b.presence - a.presence || a.championId.localeCompare(b.championId)).slice(0, 30);
  const mostPicked = trends.filter((t) => t.pickRate > 0).sort((a, b) => b.pickRate - a.pickRate || a.championId.localeCompare(b.championId)).slice(0, 30);
  const mostBanned = trends.filter((t) => t.banRate > 0).sort((a, b) => b.banRate - a.banRate || a.championId.localeCompare(b.championId)).slice(0, 30);
  const strong = trends.filter((t) => t.games >= MIN_STRONG_GAMES && t.winRate > 0.5).sort((a, b) => b.winRate - a.winRate).slice(0, 20);
  const comparisonSupported = !!previous && totalGames >= MIN_COMPARISON_GAMES && prevGames >= MIN_COMPARISON_GAMES;
  const comparison = { supported: comparisonSupported, reason: comparisonSupported ? null : !previous ? "Changes since the last patch appear once a previous patch has been collected." : `Changes since ${previous} appear once both patches have ${MIN_COMPARISON_GAMES.toLocaleString()}+ games (${previous}: ${prevGames.toLocaleString()}, ${patch}: ${totalGames.toLocaleString()}).` };
  const movers = comparisonSupported ? trends.filter((t) => t.presenceDelta !== null && t.games >= 50) : [];
  const rising = [...movers].sort((a, b) => (b.presenceDelta ?? 0) - (a.presenceDelta ?? 0)).filter((t) => (t.presenceDelta ?? 0) > 0.005).slice(0, 15);
  const falling = [...movers].sort((a, b) => (a.presenceDelta ?? 0) - (b.presenceDelta ?? 0)).filter((t) => (t.presenceDelta ?? 0) < -0.005).slice(0, 15);
  const byRole = { TOP: [], JUNGLE: [], MID: [], ADC: [], SUPPORT: [] } as Record<Role, ChampionTrend[]>;
  for (const role of ROLES) {
    const list: ChampionTrend[] = [];
    for (const r of roleRows) {
      if (r.patch !== patch || r.role !== role || r.games < 30) continue;
      const shrunk = shrinkRate({ wins: r.wins, games: r.games }, 0.5, 250);
      const base = trends.find((t) => t.championId === r.championId);
      // Role figures only: games, pick rate and win rate in this role (the ban rate is the champion's).
      const pickRate = totalGames ? r.games / totalGames : 0;
      const banRate = base?.banRate ?? 0;
      list.push({ championId: r.championId, role, pickRate, banRate, presence: pickRate + banRate, winRate: shrunk.estimate, games: r.games, confidence: shrunk.confidence, presenceDelta: null, winRateDelta: null, proPresence: base?.proPresence ?? 0 });
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
          poolAlerts.push({ playerId: player.id, displayName: player.displayName, role, championId: highBan[0]!, severity: "warn", message: `${highBan.length} champions in ${player.displayName}'s ${ROLE_LABELS[role]} pool are banned in 15%+ of games (${highBan.map(nameOf).join(", ")})` });
        }
        for (const c of poolFor(player, role)) {
          const t = byId.get(c);
          if (!t) continue;
          if (!comparisonSupported) continue;
          if (t.winRateDelta !== null && t.winRateDelta <= -0.02) poolAlerts.push({ playerId: player.id, displayName: player.displayName, role, championId: c, severity: "warn", message: `${nameOf(c)} win rate dropped ${(Math.abs(t.winRateDelta) * 100).toFixed(1)} points since ${previous}` });
          if (t.winRateDelta !== null && t.winRateDelta >= 0.02) poolAlerts.push({ playerId: player.id, displayName: player.displayName, role, championId: c, severity: "info", message: `${nameOf(c)} win rate is up ${(t.winRateDelta * 100).toFixed(1)} points since ${previous}` });
        }
      }
    }
  }

  return { patch, previousPatch: previous, source, totalGames, previousGames: prevGames, comparison, contested, mostPicked, mostBanned, strong, rising, falling, byRole, pro, poolAlerts: poolAlerts.slice(0, 12) };
}
