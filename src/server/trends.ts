import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { championBanStats, championChangePoints, championRoleStats, statPeriods } from "@/server/db/schema";
import { patchInsightText, statisticalShift } from "@/domain/patch-insight";
import { comparePatches } from "@/domain/patch";
import { ROLE_LABELS, ROLES, type Role } from "@/domain/roles";
import { shrinkRate } from "@/domain/stats";
import type { PlayerProfile } from "@/domain/roster";
import { poolFor, legalRolesFor } from "@/domain/roster";

/** Overall (every role) or one role. */
export type TrendView = "ALL" | Role;
export const TREND_VIEWS: readonly TrendView[] = ["ALL", ...ROLES];
/** What a top-10 list is ranked by. */
export type TrendSort = "presence" | "pick" | "ban" | "win";
export const TREND_SORTS: readonly TrendSort[] = ["presence", "pick", "ban", "win"];

export interface ChampionTrend {
  championId: string;
  /** The role of this view, or the champion's main role in the overall view. */
  role: Role | null;
  /** Share of the patch's games in which the champion was picked (in this role, for a role view). */
  pickRate: number;
  /** Share of games banned. In a role view the bans are shared across roles by where it is played. */
  banRate: number;
  presence: number;
  /** Win rate adjusted towards 50% for small samples (main role in the overall view). */
  winRate: number;
  /** Games behind the win rate. */
  games: number;
  confidence: number;
  /** Change in presence since the previous patch, when that comparison is supported. */
  presenceDelta: number | null;
}

export interface TrendTop {
  /** The top ten for each sort (or fewer, never padded). */
  bySort: Record<TrendSort, ChampionTrend[]>;
  /** Champions with any evidence in this view. */
  eligible: number;
  /** Champions with enough games for the win-rate ranking. */
  winEligible: number;
}

export interface PoolAlert {
  playerId: string;
  displayName: string;
  role: Role;
  championId: string;
  message: string;
  severity: "info" | "warn";
  /** What kind of evidence: a recorded balance change, a statistical shift in games, or ban pressure. */
  kind?: "verified" | "statistical" | "bans";
  /** The games behind it, for the explanation. */
  detail?: string;
}

/** Patch-to-patch changes are shown only when both patches have at least this many games. */
export const MIN_COMPARISON_GAMES = 500;
/** The win-rate ranking needs this many games (in the role, or the main role overall). */
export const MIN_WIN_RATE_GAMES = 100;
/** A role view lists a champion with at least this many games in the role… */
export const MIN_ROLE_GAMES = 10;
/** …and at least this share of the champion's games (keeps rare off-role picks out). */
export const MIN_ROLE_SHARE = 0.05;
/** The newest patch is shown by default once it has this many games; before, the previous one. */
export const MIN_DEFAULT_PATCH_GAMES = 300;
export const TOP_N = 10;

/**
 * Evidence rules per source. Professional play has far fewer games per patch (hundreds, not tens
 * of thousands), so its thresholds are lower and its win rates are adjusted with a smaller prior;
 * the two sources are never mixed.
 */
export interface TrendRules {
  minWinGames: number;
  minRoleGames: number;
  minRoleShare: number;
  minComparisonGames: number;
  minDefaultPatchGames: number;
  /** Pseudo-games pulling a win rate towards 50%. */
  winPrior: number;
}
export const RANKED_RULES: TrendRules = { minWinGames: MIN_WIN_RATE_GAMES, minRoleGames: MIN_ROLE_GAMES, minRoleShare: MIN_ROLE_SHARE, minComparisonGames: MIN_COMPARISON_GAMES, minDefaultPatchGames: MIN_DEFAULT_PATCH_GAMES, winPrior: 250 };
export const PRO_RULES: TrendRules = { minWinGames: 8, minRoleGames: 2, minRoleShare: 0.05, minComparisonGames: 40, minDefaultPatchGames: 20, winPrior: 10 };

export interface TrendsReport {
  patch: string | null;
  previousPatch: string | null;
  /** Patches with games, newest first (at most three), for the patch switch. */
  patches: Array<{ patch: string; games: number }>;
  /** Set when the newest patch was passed over for having too few games yet. */
  newestPatchNote: string | null;
  source: "ranked" | "demo" | "pro" | "none";
  rules: TrendRules;
  totalGames: number;
  previousGames: number;
  comparison: { supported: boolean; reason: string | null };
  views: Record<TrendView, TrendTop>;
  pro: { games: number; top: Array<{ championId: string; presence: number }> };
  poolAlerts: PoolAlert[];
}

const emptyTop = (): TrendTop => ({ bySort: { presence: [], pick: [], ban: [], win: [] }, eligible: 0, winEligible: 0 });
const emptyViews = () => Object.fromEntries(TREND_VIEWS.map((v) => [v, emptyTop()])) as Record<TrendView, TrendTop>;

const SORT_VALUE: Record<TrendSort, (t: ChampionTrend) => number> = { presence: (t) => t.presence, pick: (t) => t.pickRate, ban: (t) => t.banRate, win: (t) => t.winRate };

/** The top ten of one view for every sort. Ties break on the champion id so the order is stable. */
export function topOf(rows: ChampionTrend[], minWinGames = MIN_WIN_RATE_GAMES): TrendTop {
  const ranked = (sort: TrendSort, pool: ChampionTrend[]) =>
    pool
      .filter((t) => SORT_VALUE[sort](t) > 0)
      .sort((a, b) => SORT_VALUE[sort](b) - SORT_VALUE[sort](a) || a.championId.localeCompare(b.championId))
      .slice(0, TOP_N);
  const winPool = rows.filter((t) => t.games >= minWinGames);
  return { bySort: { presence: ranked("presence", rows), pick: ranked("pick", rows), ban: ranked("ban", rows), win: ranked("win", winPool) }, eligible: rows.length, winEligible: winPool.length };
}

type Agg = { games: number; wins: number; byRole: Map<Role, { games: number; wins: number }> };

/** Role rows summed over every ladder band (rows are stored per band). */
function aggregatePicks(rows: Array<{ patch: string; championId: string; role: Role; games: number; wins: number }>, patch: string): Map<string, Agg> {
  const map = new Map<string, Agg>();
  for (const r of rows) {
    if (r.patch !== patch) continue;
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
}

/** Bans summed over every ladder band. */
function aggregateBans(rows: Array<{ patch: string; championId: string; bans: number }>, patch: string | null): Map<string, number> {
  const map = new Map<string, number>();
  for (const b of rows) if (b.patch === patch) map.set(b.championId, (map.get(b.championId) ?? 0) + b.bans);
  return map;
}

/**
 * Trends for one patch from the aggregate tables (never raw matches), so the page is cheap to
 * render. Rates are per game of that patch only: earlier patches are never mixed in.
 */
export async function buildTrendsReport(db: Db, currentPatch: string | null, lineup: PlayerProfile[] | null, nameOf: (championId: string) => string = (id) => id, requestedPatch: string | null = null, options: { source?: "pro" } = {}): Promise<TrendsReport> {
  const periods = await db.select().from(statPeriods);
  const source: TrendsReport["source"] =
    options.source === "pro" ? (periods.some((p) => p.source === "pro" && p.games > 0) ? "pro" : "none") : periods.some((p) => p.source === "ranked" && p.games > 0) ? "ranked" : periods.some((p) => p.source === "demo" && p.games > 0) ? "demo" : "none";
  const rules = options.source === "pro" ? PRO_RULES : RANKED_RULES;
  const { minWinGames, minRoleGames, minRoleShare, minComparisonGames, minDefaultPatchGames, winPrior } = rules;
  const empty: TrendsReport = { patch: currentPatch, previousPatch: null, patches: [], newestPatchNote: null, source, rules, totalGames: 0, previousGames: 0, comparison: { supported: false, reason: null }, views: emptyViews(), pro: { games: 0, top: [] }, poolAlerts: [] };
  if (source === "none") return empty;

  const sourcePeriods = periods.filter((p) => p.source === source && p.games > 0).sort((a, b) => comparePatches(b.patch, a.patch));
  const patches = sourcePeriods.slice(0, 3).map((p) => ({ patch: p.patch, games: p.games }));
  const newest = sourcePeriods[0];
  if (!newest) return empty;
  let patch: string;
  let newestPatchNote: string | null = null;
  if (requestedPatch && sourcePeriods.some((p) => p.patch === requestedPatch)) patch = requestedPatch;
  else if (newest.games < minDefaultPatchGames && sourcePeriods[1] && sourcePeriods[1].games >= minDefaultPatchGames) {
    patch = sourcePeriods[1].patch;
    newestPatchNote = `Patch ${newest.patch} has ${newest.games.toLocaleString()} games so far, so ${patch} is shown until it reaches ${minDefaultPatchGames.toLocaleString()}.`;
  } else patch = currentPatch && sourcePeriods.some((p) => p.patch === currentPatch) && comparePatches(currentPatch, newest.patch) >= 0 ? currentPatch : newest.patch;
  const previous = sourcePeriods.find((p) => comparePatches(p.patch, patch) < 0)?.patch ?? null;
  const totalGames = sourcePeriods.find((p) => p.patch === patch)?.games ?? 0;
  const prevGames = previous ? (sourcePeriods.find((p) => p.patch === previous)?.games ?? 0) : 0;

  const wanted = previous ? [patch, previous] : [patch];
  const [roleRows, banRows] = await Promise.all([
    db.select({ patch: championRoleStats.patch, championId: championRoleStats.championId, role: championRoleStats.role, games: championRoleStats.games, wins: championRoleStats.wins }).from(championRoleStats).where(and(eq(championRoleStats.source, source), inArray(championRoleStats.patch, wanted))),
    db.select({ patch: championBanStats.patch, championId: championBanStats.championId, bans: championBanStats.bans }).from(championBanStats).where(and(eq(championBanStats.source, source), inArray(championBanStats.patch, wanted))),
  ]);
  // Balance changes recorded for this patch by a person (entered or confirmed in Admin → Riot data).
  const changeRows = lineup && source !== "pro" ? await db.select({ championId: championChangePoints.championId, reason: championChangePoints.reason }).from(championChangePoints).where(and(eq(championChangePoints.patch, patch), eq(championChangePoints.confirmed, true))) : [];
  const verifiedChanges = new Map(changeRows.map((r) => [r.championId, r.reason]));
  const proGames = periods.find((p) => p.source === "pro" && p.patch === patch)?.games ?? 0;
  const [proRows, proBans] =
    proGames > 0
      ? await Promise.all([
          db.select({ championId: championRoleStats.championId, games: championRoleStats.games }).from(championRoleStats).where(and(eq(championRoleStats.source, "pro"), eq(championRoleStats.patch, patch))),
          db.select({ championId: championBanStats.championId, bans: championBanStats.bans }).from(championBanStats).where(and(eq(championBanStats.source, "pro"), eq(championBanStats.patch, patch))),
        ])
      : [[], []];

  const cur = aggregatePicks(roleRows, patch);
  const prev = previous ? aggregatePicks(roleRows, previous) : new Map<string, Agg>();
  const curBans = aggregateBans(banRows, patch);
  const prevBans = aggregateBans(banRows, previous);
  const comparisonSupported = !!previous && totalGames >= minComparisonGames && prevGames >= minComparisonGames;
  const comparison = {
    supported: comparisonSupported,
    reason: comparisonSupported ? null : !previous ? "Changes since the last patch appear once a previous patch has been collected." : `Changes since ${previous} appear once both patches have ${minComparisonGames.toLocaleString()}+ games (${previous}: ${prevGames.toLocaleString()}, ${patch}: ${totalGames.toLocaleString()}).`,
  };
  const rate = (n: number, of: number) => (of > 0 ? n / of : 0);

  // Champions banned but never picked this patch still count for presence and bans.
  for (const championId of curBans.keys()) if (!cur.has(championId)) cur.set(championId, { games: 0, wins: 0, byRole: new Map() });
  const overall: ChampionTrend[] = [];
  const perRole = Object.fromEntries(ROLES.map((r) => [r, [] as ChampionTrend[]])) as Record<Role, ChampionTrend[]>;
  for (const [championId, e] of cur) {
    const pickRate = rate(e.games, totalGames);
    const banRate = rate(curBans.get(championId) ?? 0, totalGames);
    const main = [...e.byRole.entries()].sort((a, b) => b[1].games - a[1].games || a[0].localeCompare(b[0]))[0];
    // Overall win rate is the main role's (off-role games would blur it), shrunk towards 50%.
    const shrunk = shrinkRate({ wins: main?.[1].wins ?? 0, games: main?.[1].games ?? 0 }, 0.5, winPrior);
    const p = prev.get(championId);
    const prevPresence = comparisonSupported ? rate((p?.games ?? 0) + (prevBans.get(championId) ?? 0), prevGames) : null;
    overall.push({ championId, role: main?.[0] ?? null, pickRate, banRate, presence: pickRate + banRate, winRate: shrunk.estimate, games: main?.[1].games ?? 0, confidence: shrunk.confidence, presenceDelta: prevPresence === null ? null : pickRate + banRate - prevPresence });
    for (const [role, r] of e.byRole) {
      const share = rate(r.games, e.games);
      if (r.games < minRoleGames || share < minRoleShare) continue;
      const rolePick = rate(r.games, totalGames);
      const roleBan = banRate * share;
      const rs = shrinkRate({ wins: r.wins, games: r.games }, 0.5, winPrior);
      const prevRoleGames = p?.byRole.get(role)?.games ?? 0;
      const prevRolePresence = comparisonSupported ? rate(prevRoleGames + (prevBans.get(championId) ?? 0) * rate(prevRoleGames, p?.games ?? 0), prevGames) : null;
      perRole[role].push({ championId, role, pickRate: rolePick, banRate: roleBan, presence: rolePick + roleBan, winRate: rs.estimate, games: r.games, confidence: rs.confidence, presenceDelta: prevRolePresence === null ? null : rolePick + roleBan - prevRolePresence });
    }
  }
  const views = { ALL: topOf(overall, minWinGames), ...Object.fromEntries(ROLES.map((r) => [r, topOf(perRole[r], minWinGames)])) } as Record<TrendView, TrendTop>;

  const proPresence = new Map<string, number>();
  for (const r of proRows) proPresence.set(r.championId, (proPresence.get(r.championId) ?? 0) + r.games);
  for (const b of proBans) proPresence.set(b.championId, (proPresence.get(b.championId) ?? 0) + b.bans);
  const pro = {
    games: proGames,
    top: [...proPresence.entries()]
      .map(([championId, n]) => ({ championId, presence: rate(n, proGames) }))
      .sort((a, b) => b.presence - a.presence || a.championId.localeCompare(b.championId))
      .slice(0, TOP_N),
  };

  const poolAlerts: PoolAlert[] = [];
  if (lineup && source !== "pro") {
    const byId = new Map(overall.map((t) => [t.championId, t]));
    for (const player of lineup) {
      for (const role of legalRolesFor(player)) {
        const highBan = poolFor(player, role).filter((c) => (byId.get(c)?.banRate ?? 0) >= 0.15);
        if (highBan.length >= 2) {
          poolAlerts.push({ playerId: player.id, displayName: player.displayName, role, championId: highBan[0]!, severity: "warn", kind: "bans", message: `${highBan.length} champions in their ${ROLE_LABELS[role]} pool are banned in 15%+ of games (${highBan.map(nameOf).join(", ")})` });
        }
        // Patch changes on pool champions: a recorded balance change, and/or a statistical shift
        // in this role that passes the evidence bar (both patches 1,000+ games, 2+ points, unlikely
        // to be chance). Weaker evidence says nothing (see domain/patch-insight).
        for (const c of poolFor(player, role)) {
          const now = cur.get(c)?.byRole.get(role);
          const before = prev.get(c)?.byRole.get(role);
          const shift = source !== "demo" && now && before ? statisticalShift(now, before) : null;
          const verifiedPoint = verifiedChanges.has(c) ? (verifiedChanges.get(c) ?? "") : null;
          const text = patchInsightText({ verified: verifiedPoint !== null ? { kind: "verified", patch, reason: verifiedPoint } : null, shift }, previous);
          if (!text) continue;
          poolAlerts.push({
            playerId: player.id,
            displayName: player.displayName,
            role,
            championId: c,
            severity: shift && shift.points < 0 ? "warn" : "info",
            kind: shift ? "statistical" : "verified",
            message: shift ? `${nameOf(c)} ${ROLE_LABELS[role]} win rate ${shift.points > 0 ? "up" : "down"} ${Math.abs(shift.points).toFixed(1)} points since ${previous}${verifiedPoint !== null ? " (and changed this patch)" : ""}` : `${nameOf(c)} was changed in patch ${patch}`,
            detail: text.detail,
          });
        }
      }
    }
  }

  return { patch, previousPatch: previous, patches, newestPatchNote, source, rules, totalGames, previousGames: prevGames, comparison, views, pro, poolAlerts: poolAlerts.slice(0, 12) };
}
