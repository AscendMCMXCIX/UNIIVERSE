import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { matchFetchQueue, rankedMatches, regionStatus, trackedSummoners } from "@/server/db/schema";
import { parsePlatformSpec, platformLabel, platformName, RIOT_PLATFORM_IDS } from "@/domain/riot-platforms";
import { LEGACY_BAND, parseTiers, TIER_BAND_ORDER, tierBandLabel, tierWeight, parseTierWeights, tierPopulationLabel } from "@/domain/stats/tiers";

export type RegionCoverageStatus = "active" | "stale" | "no-data" | "error" | "not-configured" | "pending";

export interface RegionCoverage {
  platform: string;
  label: string;
  name: string;
  configured: boolean;
  status: RegionCoverageStatus;
  /** One sentence explaining the status. */
  detail: string;
  /** Patch with the most games from this region, or null. */
  patch: string | null;
  /** Games from this region on the current patch (0 when none). */
  currentPatchGames: number;
  totalGames: number;
  playersTracked: number;
  queuePending: number;
  lastSyncAt: Date | null;
  newestGameAt: Date | null;
  lastError: string | null;
}

export type RankCoverageStatus = "available" | "no-data" | "pending" | "not-configured";

/** Coverage per ladder band: is Emerald/Diamond/Master+ evidence actually present? */
export interface RankCoverage {
  band: string;
  label: string;
  configured: boolean;
  /** Evidence weight per game from this band. */
  weight: number;
  playersTracked: number;
  currentPatchGames: number;
  totalGames: number;
  status: RankCoverageStatus;
}

export interface GlobalCoverage {
  regions: RegionCoverage[];
  /** Ladder bands, highest skill first. */
  ranks: RankCoverage[];
  /** "EMERALD+" etc. from RIOT_TIERS. */
  tierPopulation: string;
  configured: string[];
  unknownConfigured: string[];
  usedFallback: boolean;
  /** Configured regions with at least one current-patch game. */
  withCurrentData: number;
  /** Configured regions with no games at all. */
  withoutData: number;
  currentPatch: string | null;
  totalGames: number;
  lastSyncAt: Date | null;
}

export const COVERAGE_STALE_HOURS = 12;

/**
 * Global Data Coverage: one row per Riot platform, whether configured or not, with honest
 * status wording. Counts come straight from the match tables, timestamps from region_status.
 */
export async function getGlobalCoverage(db: Db, options: { platformSpec?: string | undefined; tierSpec?: string | undefined; currentPatch: string | null; riotConfigured: boolean; now?: Date }): Promise<GlobalCoverage> {
  const now = options.now ?? new Date();
  const spec = parsePlatformSpec(options.platformSpec);
  const configured = new Set(spec.platforms);
  const [statuses, tracked, queued, totals, current, trackedByTier, byBand] = await Promise.all([
    db.select().from(regionStatus),
    db.select({ platform: trackedSummoners.platform, n: sql<number>`count(*)` }).from(trackedSummoners).groupBy(trackedSummoners.platform),
    db.select({ platform: matchFetchQueue.platform, n: sql<number>`count(*)` }).from(matchFetchQueue).where(eq(matchFetchQueue.status, "pending")).groupBy(matchFetchQueue.platform),
    db.select({ platform: rankedMatches.platform, patch: rankedMatches.patch, n: sql<number>`count(*)`, newest: sql<number>`max(${rankedMatches.gameCreation})` }).from(rankedMatches).groupBy(rankedMatches.platform, rankedMatches.patch),
    options.currentPatch ? db.select({ platform: rankedMatches.platform, n: sql<number>`count(*)` }).from(rankedMatches).where(eq(rankedMatches.patch, options.currentPatch)).groupBy(rankedMatches.platform) : Promise.resolve([] as Array<{ platform: string; n: number }>),
    db.select({ tier: trackedSummoners.tier, n: sql<number>`count(*)` }).from(trackedSummoners).groupBy(trackedSummoners.tier),
    db.select({ band: rankedMatches.tierBand, patch: rankedMatches.patch, n: sql<number>`count(*)` }).from(rankedMatches).groupBy(rankedMatches.tierBand, rankedMatches.patch),
  ]);
  const tiers = parseTiers(options.tierSpec);
  const weights = parseTierWeights(process.env.RIOT_TIER_WEIGHTS);
  const trackedTier = new Map(trackedByTier.map((t) => [t.tier.toUpperCase(), Number(t.n)]));
  const bandTotals = new Map<string, { current: number; total: number }>();
  for (const b of byBand) {
    const band = b.band ?? LEGACY_BAND;
    const e = bandTotals.get(band) ?? { current: 0, total: 0 };
    e.total += Number(b.n);
    if (options.currentPatch && b.patch === options.currentPatch) e.current += Number(b.n);
    bandTotals.set(band, e);
  }
  const ranks: RankCoverage[] = TIER_BAND_ORDER.filter((band) => band !== LEGACY_BAND || (bandTotals.get(band)?.total ?? 0) > 0).map((band) => {
    const isConfigured = band === LEGACY_BAND ? false : tiers.includes(band as (typeof tiers)[number]);
    const t = bandTotals.get(band) ?? { current: 0, total: 0 };
    const playersTracked = trackedTier.get(band) ?? 0;
    let status: RankCoverageStatus;
    if (!isConfigured && t.total === 0) status = "not-configured";
    else if (t.current > 0) status = "available";
    else if (t.total > 0 || playersTracked > 0) status = "no-data";
    else status = options.riotConfigured ? "pending" : "not-configured";
    return { band, label: tierBandLabel(band), configured: isConfigured, weight: tierWeight(band, weights), playersTracked, currentPatchGames: t.current, totalGames: t.total, status };
  });
  const statusBy = new Map(statuses.map((s) => [s.platform, s]));
  const trackedBy = new Map(tracked.map((t) => [t.platform, Number(t.n)]));
  const queuedBy = new Map(queued.map((q) => [q.platform, Number(q.n)]));
  const currentBy = new Map(current.map((c) => [c.platform, Number(c.n)]));
  const totalBy = new Map<string, { games: number; newest: number; patches: Map<string, number> }>();
  for (const t of totals) {
    const e = totalBy.get(t.platform) ?? { games: 0, newest: 0, patches: new Map() };
    e.games += Number(t.n);
    e.newest = Math.max(e.newest, Number(t.newest ?? 0));
    e.patches.set(t.patch, (e.patches.get(t.patch) ?? 0) + Number(t.n));
    totalBy.set(t.platform, e);
  }
  // Platforms with data but no longer configured still appear (their data is still used).
  const ids = [...new Set([...RIOT_PLATFORM_IDS, ...totalBy.keys(), ...configured])];
  const regions: RegionCoverage[] = ids.map((platform) => {
    const s = statusBy.get(platform);
    const t = totalBy.get(platform);
    const isConfigured = configured.has(platform);
    const totalGames = t?.games ?? 0;
    const currentPatchGames = currentBy.get(platform) ?? 0;
    const lastSyncAt = [s?.lastIngestAt, s?.lastDiscoverAt, s?.lastLeagueRefreshAt].filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    const topPatch = t ? [...t.patches.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null : null;
    const ageH = lastSyncAt ? (now.getTime() - lastSyncAt.getTime()) / 3_600_000 : Infinity;
    const recentError = s?.lastError && s.lastErrorAt && (!lastSyncAt || s.lastErrorAt.getTime() > lastSyncAt.getTime() - 60_000) && (s.consecutiveErrors ?? 0) > 0;
    let status: RegionCoverageStatus;
    let detail: string;
    if (!isConfigured) {
      status = "not-configured";
      detail = totalGames > 0 ? "Not in RIOT_PLATFORMS any more; existing games still count." : "Not in RIOT_PLATFORMS. Add it (or use \"all\") to collect games from this server.";
    } else if (!options.riotConfigured) {
      status = "pending";
      detail = "Configured, but no Riot API key is set, so nothing has been collected.";
    } else if (recentError && currentPatchGames === 0) {
      status = "error";
      detail = s!.lastError!;
    } else if (totalGames === 0) {
      status = lastSyncAt ? "no-data" : "pending";
      detail = lastSyncAt ? `Attempted ${timeWord(ageH)}; no games stored yet (players are being discovered, then their matches queued and fetched).` : "Configured; first collection run has not reached this server yet.";
    } else if (currentPatchGames === 0) {
      status = "no-data";
      detail = `No games on the current patch yet (${totalGames.toLocaleString()} from earlier patches).`;
    } else if (ageH > COVERAGE_STALE_HOURS) {
      status = "stale";
      detail = `Data present, but the last collection was ${timeWord(ageH)}.${recentError ? ` Last error: ${s!.lastError}` : ""}`;
    } else {
      status = "active";
      detail = `${currentPatchGames.toLocaleString()} current-patch games; collected ${timeWord(ageH)}.${recentError ? ` Recent error: ${s!.lastError}` : ""}`;
    }
    return {
      platform,
      label: platformLabel(platform),
      name: platformName(platform),
      configured: isConfigured,
      status,
      detail,
      patch: topPatch,
      currentPatchGames,
      totalGames,
      playersTracked: trackedBy.get(platform) ?? 0,
      queuePending: queuedBy.get(platform) ?? 0,
      lastSyncAt,
      newestGameAt: t?.newest ? new Date(t.newest) : null,
      lastError: s?.lastError ?? null,
    };
  });
  const order = (r: RegionCoverage) => (r.configured ? 0 : 1);
  regions.sort((a, b) => order(a) - order(b) || b.currentPatchGames - a.currentPatchGames || a.label.localeCompare(b.label));
  const configuredRows = regions.filter((r) => r.configured);
  return {
    regions,
    ranks,
    tierPopulation: tierPopulationLabel(tiers),
    configured: spec.platforms,
    unknownConfigured: spec.unknown,
    usedFallback: spec.usedFallback,
    withCurrentData: configuredRows.filter((r) => r.currentPatchGames > 0).length,
    withoutData: configuredRows.filter((r) => r.totalGames === 0).length,
    currentPatch: options.currentPatch,
    totalGames: regions.reduce((s, r) => s + r.totalGames, 0),
    lastSyncAt: regions.map((r) => r.lastSyncAt).filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null,
  };
}

function timeWord(hours: number): string {
  if (!Number.isFinite(hours)) return "never";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min ago`;
  if (hours < 48) return `${Math.round(hours)} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

/** Plain-language coverage warnings for the Data health panel (never silent about missing regions). */
export function coverageWarnings(c: GlobalCoverage, riotConfigured: boolean): string[] {
  const out: string[] = [];
  if (!riotConfigured) return out;
  if (c.unknownConfigured.length) out.push(`RIOT_PLATFORMS contains unknown entries: ${c.unknownConfigured.join(", ")} (ignored).`);
  const missing = c.regions.filter((r) => r.configured && r.currentPatchGames === 0);
  if (missing.length) out.push(`${missing.length} of ${c.configured.length} configured region${c.configured.length === 1 ? "" : "s"} ${missing.length === 1 ? "has" : "have"} no current-patch games yet: ${missing.map((r) => r.label).join(", ")}.`);
  const errored = c.regions.filter((r) => r.configured && r.status === "error");
  if (errored.length) out.push(`Collection errors on ${errored.map((r) => r.label).join(", ")}: ${errored[0]!.lastError}`);
  const bands = c.ranks.filter((r) => r.configured && r.status !== "available");
  if (bands.length && c.regions.some((r) => r.currentPatchGames > 0)) out.push(`No current-patch games yet from the ${bands.map((r) => r.label).join(", ")} ladder${bands.length === 1 ? "" : "s"}; evidence currently comes from ${c.ranks.filter((r) => r.status === "available").map((r) => r.label).join(", ") || "no ladder"}.`);
  return out;
}

/** Players tracked and queue size for the platforms given (job summaries). */
export async function regionCounts(db: Db, platforms: string[]): Promise<Record<string, { tracked: number; pending: number; unaggregated: number }>> {
  if (platforms.length === 0) return {};
  const [tracked, pending, unagg] = await Promise.all([
    db.select({ platform: trackedSummoners.platform, n: sql<number>`count(*)` }).from(trackedSummoners).where(inArray(trackedSummoners.platform, platforms)).groupBy(trackedSummoners.platform),
    db.select({ platform: matchFetchQueue.platform, n: sql<number>`count(*)` }).from(matchFetchQueue).where(and(eq(matchFetchQueue.status, "pending"), inArray(matchFetchQueue.platform, platforms))).groupBy(matchFetchQueue.platform),
    db.select({ platform: rankedMatches.platform, n: sql<number>`count(*)` }).from(rankedMatches).where(and(isNull(rankedMatches.aggregatedAt), inArray(rankedMatches.platform, platforms))).groupBy(rankedMatches.platform),
  ]);
  const out: Record<string, { tracked: number; pending: number; unaggregated: number }> = {};
  for (const p of platforms) out[p] = { tracked: 0, pending: 0, unaggregated: 0 };
  for (const t of tracked) out[t.platform] = { ...(out[t.platform] ?? { tracked: 0, pending: 0, unaggregated: 0 }), tracked: Number(t.n) };
  for (const q of pending) out[q.platform] = { ...(out[q.platform] ?? { tracked: 0, pending: 0, unaggregated: 0 }), pending: Number(q.n) };
  for (const u of unagg) out[u.platform] = { ...(out[u.platform] ?? { tracked: 0, pending: 0, unaggregated: 0 }), unaggregated: Number(u.n) };
  return out;
}
