import { desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { appSettings, championBanStats, championChangePoints, championMatchups, championRoleStats, championSynergies, statPeriods } from "@/server/db/schema";
import { comparePatches } from "@/domain/patch";
import { blendPeriods, DEFAULT_BLEND, type BlendOptions, type PeriodSample } from "@/domain/stats";
import { MemoryStatsProvider, type MemoryStatsData } from "@/domain/engine/memory-stats";
import type { Role } from "@/domain/roles";
import { getCurrentPatch } from "@/server/repositories/champions";

export interface StatsLoadOptions {
  blend?: Partial<BlendOptions>;
  /** Weight applied to professional games when merged into matchup/synergy evidence. */
  proEvidenceWeight?: number;
  shrinkage?: { strength: number; matchup: number; synergy: number };
}

interface CacheEntry {
  key: string;
  provider: MemoryStatsProvider;
  loadedAt: number;
}

declare global {
  var __uniiverseStatsCache: CacheEntry | undefined;
}

const CACHE_TTL_MS = 10 * 60 * 1000;

/** Bumped by the aggregation job so cached providers are rebuilt only when statistics change. */
export async function getStatsVersion(db: Db): Promise<string> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, "stats_version"));
  return typeof row?.value === "string" ? row.value : "0";
}

export async function bumpStatsVersion(db: Db): Promise<void> {
  const value = new Date().toISOString();
  await db.insert(appSettings).values({ key: "stats_version", value, updatedAt: new Date() }).onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
}

/**
 * Builds the engine's statistics provider from the aggregate tables.
 *
 * Evidence is blended across recent patches with recency decay (older patches fade out as the
 * current patch accumulates games) and champion change points discount pre-rework periods.
 * Ranked data is the primary source; professional games add weighted evidence for pairings and
 * matchups and provide the pro-presence signal. Demo data is only used when no real data exists.
 */
export async function loadStatsProvider(db: Db, options: StatsLoadOptions = {}): Promise<MemoryStatsProvider> {
  const current = await getCurrentPatch(db);
  const version = await getStatsVersion(db);
  const key = `${current?.patch ?? "none"}|${version}|${JSON.stringify(options)}`;
  const cached = globalThis.__uniiverseStatsCache;
  if (cached && cached.key === key && Date.now() - cached.loadedAt < CACHE_TTL_MS) return cached.provider;

  const blend: BlendOptions = { ...DEFAULT_BLEND, ...(options.blend ?? {}) };
  const proWeight = options.proEvidenceWeight ?? 1.0;

  const periods = await db.select().from(statPeriods).orderBy(desc(statPeriods.updatedAt));
  const hasReal = periods.some((p) => (p.source === "ranked" || p.source === "pro") && p.games > 0);
  const sources = new Set<"ranked" | "pro" | "demo">();
  for (const p of periods) if (p.games > 0 && (hasReal ? p.source !== "demo" : true)) sources.add(p.source);

  // Patch ordering: everything seen in stats, newest first, with the current patch at distance 0.
  const patchSet = new Set<string>(periods.map((p) => p.patch));
  if (current) patchSet.add(current.patch);
  const patchesDesc = [...patchSet].sort((a, b) => comparePatches(b, a));
  const currentPatch = current?.patch ?? patchesDesc[0] ?? null;
  const distanceOf = (patch: string) => {
    if (!currentPatch) return 0;
    const ci = patchesDesc.indexOf(currentPatch);
    const pi = patchesDesc.indexOf(patch);
    // Patches newer than the "current" one (rare: data ahead of static sync) count as current.
    return Math.max(0, pi - ci);
  };
  const relevantPatches = patchesDesc.filter((p) => distanceOf(p) <= blend.maxPatchDistance);
  const sourceList = [...sources];

  const changePoints = await db.select().from(championChangePoints);
  const discountFor = (championId: string, patch: string): number => {
    let discount = 1;
    for (const cp of changePoints) {
      if (cp.championId !== championId) continue;
      if (comparePatches(patch, cp.patch) < 0) discount = Math.min(discount, cp.confirmed ? cp.discount : Math.max(cp.discount, 0.5));
    }
    return discount;
  };

  const empty: MemoryStatsData = { patch: currentPatch, sources: sourceList, totalGames: 0, proGames: 0, roleStats: [], bans: [], matchups: [], synergies: [], pro: [], isDemo: !hasReal && sources.has("demo") };
  if (relevantPatches.length === 0 || sourceList.length === 0) {
    const provider = new MemoryStatsProvider(empty, options.shrinkage);
    globalThis.__uniiverseStatsCache = { key, provider, loadedAt: Date.now() };
    return provider;
  }

  const sourceWeight = (source: string) => (source === "pro" ? proWeight : 1);
  const primarySources = sourceList.filter((s) => s !== "pro");

  // Total games per source for rates.
  const totalsBySource = new Map<string, PeriodSample[]>();
  for (const p of periods) {
    if (!relevantPatches.includes(p.patch) || !sources.has(p.source)) continue;
    totalsBySource.set(p.source, [...(totalsBySource.get(p.source) ?? []), { patchDistance: distanceOf(p.patch), games: p.games, wins: 0 }]);
  }
  const totalGames = primarySources.reduce((s, src) => s + blendPeriods(totalsBySource.get(src) ?? [], blend).games, 0);
  const proGames = blendPeriods(totalsBySource.get("pro") ?? [], blend).games;

  // Role stats (strength + role share): primary sources only.
  const roleRows = await db.select().from(championRoleStats).where(inArray(championRoleStats.patch, relevantPatches));
  const roleAgg = new Map<string, PeriodSample[]>();
  const proRoleAgg = new Map<string, { picks: number }>();
  for (const r of roleRows) {
    if (!sources.has(r.source)) continue;
    const sample: PeriodSample = { patchDistance: distanceOf(r.patch), games: r.games, wins: r.wins, discount: discountFor(r.championId, r.patch) };
    if (r.source === "pro") {
      const k = r.championId;
      const w = Math.pow(blend.recencyDecay, sample.patchDistance);
      proRoleAgg.set(k, { picks: (proRoleAgg.get(k)?.picks ?? 0) + r.games * w });
      continue;
    }
    const k = `${r.championId}|${r.role}`;
    roleAgg.set(k, [...(roleAgg.get(k) ?? []), sample]);
  }
  const roleStats = [...roleAgg.entries()].map(([k, samples]) => {
    const [championId, role] = k.split("|") as [string, Role];
    const b = blendPeriods(samples, blend);
    return { championId, role, games: b.games, wins: b.wins };
  });

  // Bans.
  const banRows = await db.select().from(championBanStats).where(inArray(championBanStats.patch, relevantPatches));
  const banAgg = new Map<string, PeriodSample[]>();
  const proBanAgg = new Map<string, number>();
  for (const b of banRows) {
    if (!sources.has(b.source)) continue;
    if (b.source === "pro") {
      proBanAgg.set(b.championId, (proBanAgg.get(b.championId) ?? 0) + b.bans * Math.pow(blend.recencyDecay, distanceOf(b.patch)));
      continue;
    }
    banAgg.set(b.championId, [...(banAgg.get(b.championId) ?? []), { patchDistance: distanceOf(b.patch), games: b.bans, wins: 0 }]);
  }
  const bans = [...banAgg.entries()].map(([championId, samples]) => ({ championId, bans: blendPeriods(samples, blend).games }));

  // Matchups and synergies: all sources, pro weighted.
  const muRows = await db.select().from(championMatchups).where(inArray(championMatchups.patch, relevantPatches));
  const muAgg = new Map<string, PeriodSample[]>();
  for (const m of muRows) {
    if (!sources.has(m.source)) continue;
    const w = sourceWeight(m.source) * Math.min(discountFor(m.championId, m.patch), discountFor(m.enemyChampionId, m.patch));
    const k = `${m.championId}|${m.role}|${m.enemyChampionId}|${m.enemyRole}`;
    muAgg.set(k, [...(muAgg.get(k) ?? []), { patchDistance: distanceOf(m.patch), games: m.games, wins: m.wins, discount: w }]);
  }
  const matchups = [...muAgg.entries()].map(([k, samples]) => {
    const [championId, role, enemyChampionId, enemyRole] = k.split("|") as [string, Role, string, Role];
    const b = blendPeriods(samples, blend);
    return { championId, role, enemyChampionId, enemyRole, games: b.games, wins: b.wins };
  });

  const synRows = await db.select().from(championSynergies).where(inArray(championSynergies.patch, relevantPatches));
  const synAgg = new Map<string, PeriodSample[]>();
  for (const s of synRows) {
    if (!sources.has(s.source)) continue;
    const w = sourceWeight(s.source) * Math.min(discountFor(s.championAId, s.patch), discountFor(s.championBId, s.patch));
    const k = `${s.championAId}|${s.roleA}|${s.championBId}|${s.roleB}`;
    synAgg.set(k, [...(synAgg.get(k) ?? []), { patchDistance: distanceOf(s.patch), games: s.games, wins: s.wins, discount: w }]);
  }
  const synergies = [...synAgg.entries()].map(([k, samples]) => {
    const [championAId, roleA, championBId, roleB] = k.split("|") as [string, Role, string, Role];
    const b = blendPeriods(samples, blend);
    return { championAId, roleA, championBId, roleB, games: b.games, wins: b.wins };
  });

  const proIds = new Set([...proRoleAgg.keys(), ...proBanAgg.keys()]);
  const pro = [...proIds].map((championId) => ({ championId, picks: proRoleAgg.get(championId)?.picks ?? 0, bans: proBanAgg.get(championId) ?? 0 }));

  const provider = new MemoryStatsProvider({ ...empty, totalGames, proGames, roleStats, bans, matchups, synergies, pro }, options.shrinkage);
  globalThis.__uniiverseStatsCache = { key, provider, loadedAt: Date.now() };
  return provider;
}

export function invalidateStatsCache() {
  globalThis.__uniiverseStatsCache = undefined;
}
