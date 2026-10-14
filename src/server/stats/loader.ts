import { and, desc, eq, gte, inArray } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { appSettings, championBanStats, championChangePoints, championMatchups, championRoleStats, championSynergies, proPickSlotStats, statPeriods, statRankPeriods, statRegionPeriods } from "@/server/db/schema";
import type { DraftSlot, ProSlotRecord } from "@/domain/pro";
import { comparePatches } from "@/domain/patch";
import { blendPeriods, DEFAULT_BLEND, parseTierWeights, patchWeight, tierWeight, type BlendOptions, type PeriodSample } from "@/domain/stats";
import type { PatchEvidence } from "@/domain/engine/types";
import { MemoryStatsProvider, type MemoryStatsData } from "@/domain/engine/memory-stats";
import type { Role } from "@/domain/roles";
import { getCurrentPatch } from "@/server/repositories/champions";
import { invalidateCache } from "@/server/observability/cache";

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

/**
 * Matchup and synergy rows seen only once carry almost no weight after shrinkage (one game
 * against a prior of 60 pseudo-games moves an estimate by under 1%), yet at scale they are the
 * vast majority of rows (about 87% of matchups at 3,000 games). They are left in the database
 * and skipped when the provider is built, which is what makes a cold load cheap.
 */
export const MIN_PAIR_GAMES = 2;

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
  // Rank-aware evidence: a game from a lower ladder band counts as a fraction of a Challenger
  // game (never more than one), so Emerald volume adds evidence without outvoting apex quality.
  const tierWeights = parseTierWeights(process.env.RIOT_TIER_WEIGHTS);
  const bandWeight = (band: string | null | undefined, source: string) => (source === "ranked" ? tierWeight(band, tierWeights) : 1);

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

  // Every table is read in parallel; pair tables only above the minimum sample.
  const [roleRows, banRows, muRows, synRows, slotRows, rankRows] = await Promise.all([
    db.select({ patch: championRoleStats.patch, source: championRoleStats.source, tierBand: championRoleStats.tierBand, championId: championRoleStats.championId, role: championRoleStats.role, games: championRoleStats.games, wins: championRoleStats.wins }).from(championRoleStats).where(inArray(championRoleStats.patch, relevantPatches)),
    db.select({ patch: championBanStats.patch, source: championBanStats.source, tierBand: championBanStats.tierBand, championId: championBanStats.championId, bans: championBanStats.bans }).from(championBanStats).where(inArray(championBanStats.patch, relevantPatches)),
    db.select({ patch: championMatchups.patch, source: championMatchups.source, tierBand: championMatchups.tierBand, championId: championMatchups.championId, role: championMatchups.role, enemyChampionId: championMatchups.enemyChampionId, enemyRole: championMatchups.enemyRole, games: championMatchups.games, wins: championMatchups.wins }).from(championMatchups).where(and(inArray(championMatchups.patch, relevantPatches), gte(championMatchups.games, MIN_PAIR_GAMES))),
    db.select({ patch: championSynergies.patch, source: championSynergies.source, tierBand: championSynergies.tierBand, championAId: championSynergies.championAId, roleA: championSynergies.roleA, championBId: championSynergies.championBId, roleB: championSynergies.roleB, games: championSynergies.games, wins: championSynergies.wins }).from(championSynergies).where(and(inArray(championSynergies.patch, relevantPatches), gte(championSynergies.games, MIN_PAIR_GAMES))),
    sources.has("pro") ? db.select().from(proPickSlotStats).where(inArray(proPickSlotStats.patch, relevantPatches)) : Promise.resolve([] as Array<typeof proPickSlotStats.$inferSelect>),
    sources.has("ranked") ? db.select().from(statRankPeriods).where(inArray(statRankPeriods.patch, relevantPatches)) : Promise.resolve([] as Array<typeof statRankPeriods.$inferSelect>),
  ]);

  // Total games per source for rates. Ranked totals are band-weighted like the numerators so a
  // pick rate stays "share of games" whichever ladders the games came from.
  const totalsBySource = new Map<string, PeriodSample[]>();
  const rankedBandTotals = new Map<string, PeriodSample[]>();
  for (const r of rankRows) {
    if (r.source !== "ranked") continue;
    rankedBandTotals.set(r.source, [...(rankedBandTotals.get(r.source) ?? []), { patchDistance: distanceOf(r.patch), games: r.games, wins: 0, discount: bandWeight(r.tierBand, r.source) }]);
  }
  for (const p of periods) {
    if (!relevantPatches.includes(p.patch) || !sources.has(p.source)) continue;
    if (p.source === "ranked" && rankedBandTotals.has("ranked")) continue; // band rows carry the ranked total
    totalsBySource.set(p.source, [...(totalsBySource.get(p.source) ?? []), { patchDistance: distanceOf(p.patch), games: p.games, wins: 0 }]);
  }
  const totalGames = primarySources.reduce((s, src) => s + blendPeriods([...(totalsBySource.get(src) ?? []), ...(rankedBandTotals.get(src) ?? [])], blend).games, 0);
  const proGames = blendPeriods(totalsBySource.get("pro") ?? [], blend).games;

  // Role stats (strength + role share): primary sources only.
  const roleAgg = new Map<string, PeriodSample[]>();
  const proRoleAgg = new Map<string, { picks: number }>();
  for (const r of roleRows) {
    if (!sources.has(r.source)) continue;
    const sample: PeriodSample = { patchDistance: distanceOf(r.patch), games: r.games, wins: r.wins, discount: discountFor(r.championId, r.patch) * bandWeight(r.tierBand, r.source) };
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
  const banAgg = new Map<string, PeriodSample[]>();
  const proBanAgg = new Map<string, number>();
  for (const b of banRows) {
    if (!sources.has(b.source)) continue;
    if (b.source === "pro") {
      proBanAgg.set(b.championId, (proBanAgg.get(b.championId) ?? 0) + b.bans * Math.pow(blend.recencyDecay, distanceOf(b.patch)));
      continue;
    }
    banAgg.set(b.championId, [...(banAgg.get(b.championId) ?? []), { patchDistance: distanceOf(b.patch), games: b.bans, wins: 0, discount: bandWeight(b.tierBand, b.source) }]);
  }
  const bans = [...banAgg.entries()].map(([championId, samples]) => ({ championId, bans: blendPeriods(samples, blend).games }));

  // Matchups and synergies: all sources, pro weighted.
  const muAgg = new Map<string, PeriodSample[]>();
  for (const m of muRows) {
    if (!sources.has(m.source)) continue;
    const w = sourceWeight(m.source) * Math.min(discountFor(m.championId, m.patch), discountFor(m.enemyChampionId, m.patch)) * bandWeight(m.tierBand, m.source);
    const k = `${m.championId}|${m.role}|${m.enemyChampionId}|${m.enemyRole}`;
    muAgg.set(k, [...(muAgg.get(k) ?? []), { patchDistance: distanceOf(m.patch), games: m.games, wins: m.wins, discount: w }]);
  }
  const matchups = [...muAgg.entries()].map(([k, samples]) => {
    const [championId, role, enemyChampionId, enemyRole] = k.split("|") as [string, Role, string, Role];
    const b = blendPeriods(samples, blend);
    return { championId, role, enemyChampionId, enemyRole, games: b.games, wins: b.wins };
  });

  const synAgg = new Map<string, PeriodSample[]>();
  for (const s of synRows) {
    if (!sources.has(s.source)) continue;
    const w = sourceWeight(s.source) * Math.min(discountFor(s.championAId, s.patch), discountFor(s.championBId, s.patch)) * bandWeight(s.tierBand, s.source);
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

  // Professional draft slots (recency-weighted, no shrinkage: they are shares, not rates).
  const proSlots: ProSlotRecord[] = [];
  if (sources.has("pro")) {
    const slotAgg = new Map<string, ProSlotRecord>();
    for (const r of slotRows) {
      const w = Math.pow(blend.recencyDecay, distanceOf(r.patch));
      const key = `${r.championId}|${r.slot}`;
      const cur = slotAgg.get(key) ?? { championId: r.championId, slot: r.slot as DraftSlot, role: r.role as Role | null, games: 0, wins: 0 };
      cur.games += r.games * w;
      cur.wins += r.wins * w;
      if (!cur.role && r.role) cur.role = r.role as Role;
      slotAgg.set(key, cur);
    }
    proSlots.push(...slotAgg.values());
  }

  // Provenance: which servers stand behind the ranked sample, how many games each, and how fresh.
  const regionRows = sources.has("ranked") ? await db.select().from(statRegionPeriods).where(inArray(statRegionPeriods.patch, relevantPatches)) : [];
  const gamesByRegion: Record<string, number> = {};
  let lastGameAt: Date | null = null;
  let tierPopulation = "MASTER+";
  for (const r of regionRows) {
    if (r.source !== "ranked") continue;
    gamesByRegion[r.platform] = (gamesByRegion[r.platform] ?? 0) + r.games;
    if (r.lastGameAt && (!lastGameAt || r.lastGameAt > lastGameAt)) lastGameAt = r.lastGameAt;
    tierPopulation = r.tierPopulation;
  }
  const tierBands: Record<string, number> = {};
  for (const r of rankRows) if (r.source === "ranked") tierBands[r.tierBand] = (tierBands[r.tierBand] ?? 0) + r.games;
  const patches: PatchEvidence[] = relevantPatches.map((patch) => {
    const games = periods.filter((p) => p.source === "ranked" && p.patch === patch).reduce((s, p) => s + p.games, 0);
    const distance = distanceOf(patch);
    // Per-champion blending: show the ceiling (see describe.ts).
    const w = patchWeight(distance, 0, blend);
    return { patch, distance, games, weight: w.weight, label: w.label };
  });
  const provenance = { regions: Object.keys(gamesByRegion).sort((a, b) => (gamesByRegion[b] ?? 0) - (gamesByRegion[a] ?? 0)), gamesByRegion, tierPopulation, tierBands, tierWeights, patches, queue: "Ranked Solo/Duo", lastGameAt, proGames: Math.round(proGames) };
  const provider = new MemoryStatsProvider({ ...empty, totalGames, proGames, roleStats, bans, matchups, synergies, pro, proSlots, provenance }, options.shrinkage);
  globalThis.__uniiverseStatsCache = { key, provider, loadedAt: Date.now() };
  return provider;
}

/**
 * The provider this server instance already has in memory (fresh enough), without loading it.
 * For extras that must never make a page wait on a cold statistics load (about a second at
 * production scale), such as the measured role share in the champion selector's role filter.
 */
export function peekStatsProvider(): MemoryStatsProvider | null {
  const cached = globalThis.__uniiverseStatsCache;
  return cached && Date.now() - cached.loadedAt < CACHE_TTL_MS ? cached.provider : null;
}

export function invalidateStatsCache() {
  globalThis.__uniiverseStatsCache = undefined;
  invalidateCache("stats-description");
  invalidateCache("pro-patterns");
  invalidateCache("shell-facts");
}
