import { desc } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { statPeriods, statRegionPeriods } from "@/server/db/schema";
import { comparePatches } from "@/domain/patch";
import { DEFAULT_BLEND } from "@/domain/stats";
import type { StatsDescription } from "@/domain/engine";
import { getCurrentPatch } from "@/server/repositories/champions";
import { cachedFor } from "@/server/observability/cache";

/**
 * The same description the statistics provider gives (patch, sources, effective games, demo
 * flag, regions, freshness) computed from the two small period tables only: no champion rows
 * are read, so Settings, health and the shell can say what data exists in a few milliseconds.
 */
export async function describeStatsCheap(db: Db): Promise<StatsDescription> {
  return cachedFor("stats-description", 60_000, async () => {
    const [current, periods, regions] = await Promise.all([getCurrentPatch(db), db.select().from(statPeriods).orderBy(desc(statPeriods.updatedAt)), db.select().from(statRegionPeriods)]);
    const hasReal = periods.some((p) => (p.source === "ranked" || p.source === "pro") && p.games > 0);
    const sources = new Set<"ranked" | "pro" | "demo">();
    for (const p of periods) if (p.games > 0 && (hasReal ? p.source !== "demo" : true)) sources.add(p.source);
    const patchSet = new Set(periods.map((p) => p.patch));
    if (current) patchSet.add(current.patch);
    const patchesDesc = [...patchSet].sort((a, b) => comparePatches(b, a));
    const currentPatch = current?.patch ?? patchesDesc[0] ?? null;
    const ci = currentPatch ? patchesDesc.indexOf(currentPatch) : 0;
    const distance = (patch: string) => Math.max(0, patchesDesc.indexOf(patch) - ci);
    const relevant = new Set(patchesDesc.filter((p) => distance(p) <= DEFAULT_BLEND.maxPatchDistance));
    let totalGames = 0;
    let proGames = 0;
    for (const p of periods) {
      if (!relevant.has(p.patch) || !sources.has(p.source)) continue;
      const w = Math.pow(DEFAULT_BLEND.recencyDecay, distance(p.patch));
      if (p.source === "pro") proGames += p.games * w;
      else totalGames += p.games * w;
    }
    const gamesByRegion: Record<string, number> = {};
    let lastGameAt: Date | null = null;
    let tierPopulation = "MASTER+";
    for (const r of regions) {
      if (r.source !== "ranked" || !relevant.has(r.patch)) continue;
      gamesByRegion[r.platform] = (gamesByRegion[r.platform] ?? 0) + r.games;
      if (r.lastGameAt && (!lastGameAt || r.lastGameAt > lastGameAt)) lastGameAt = r.lastGameAt;
      tierPopulation = r.tierPopulation;
    }
    return {
      patch: currentPatch,
      sources: [...sources],
      totalGames,
      isDemo: !hasReal && sources.has("demo"),
      provenance: { regions: Object.keys(gamesByRegion).sort((a, b) => (gamesByRegion[b] ?? 0) - (gamesByRegion[a] ?? 0)), gamesByRegion, tierPopulation, queue: "Ranked Solo/Duo", lastGameAt, proGames: Math.round(proGames) },
    };
  }, db);
}
