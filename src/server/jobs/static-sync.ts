import { defineJob } from "./registry";
import { DataDragonProvider } from "@/server/riot/static/ddragon";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { invalidateChampionMap } from "@/server/engine/service";
import { invalidateChampionCaches } from "@/server/repositories/champions";
import { invalidateCache } from "@/server/observability/cache";
import { invalidateStatsCache } from "@/server/stats/loader";

/**
 * Version check + champion sync. Cheap when nothing changed (one request). When a new version
 * is detected it syncs champions, flags reworks, opens the new statistical period and clears the
 * relevant caches. Also registered as "version-check" for a clearer schedule entry.
 */
async function run(ctx: { db: Parameters<typeof syncStaticData>[0]; log: (m: string) => void }, force: boolean) {
  const provider = new DataDragonProvider();
  const result = await syncStaticData(ctx.db, provider, { force, fixture: new FixtureStaticProvider(), log: ctx.log });
  if (result.changed) {
    invalidateChampionMap();
    invalidateChampionCaches();
    invalidateCache("shell-facts");
    invalidateStatsCache();
  }
  const summary = {
    version: result.version,
    patch: result.patch,
    newPatch: result.newPatch,
    changed: result.changed,
    usedFixture: result.usedFixture,
    championsUpserted: result.championsUpserted,
    newChampions: result.newChampions,
    suspectedReworks: result.suspectedReworks,
  };
  if (!result.ok) return { ok: false, error: result.error, summary };
  return { ok: true, degraded: result.degraded, error: result.error, summary };
}

defineJob({
  key: "version-check",
  description: "Check Data Dragon for a new game version and sync champions when one appears.",
  defaultIntervalMinutes: 60,
  run: (ctx) => run(ctx, false),
});

defineJob({
  key: "static-sync",
  description: "Force a full champion/static data synchronisation from Data Dragon.",
  defaultIntervalMinutes: null,
  run: (ctx) => run(ctx, true),
});
