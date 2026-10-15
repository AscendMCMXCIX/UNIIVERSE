import { defineJob } from "./registry";
import { DataDragonProvider } from "@/server/riot/static/ddragon";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { checkSkinSplashes, remapSkinSelections } from "@/server/riot/static/skin-art";
import { syncRiotAssets } from "@/server/riot/static/assets";
import { invalidateChampionMap } from "@/server/engine/service";
import { invalidateChampionCaches } from "@/server/repositories/champions";
import { invalidateCache } from "@/server/observability/cache";
import { bumpStatsVersion, invalidateStatsCache } from "@/server/stats/loader";

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
    // A sync can add rework change points: every instance rebuilds its statistics.
    await bumpStatsVersion(ctx.db);
    invalidateStatsCache();
  }
  // Card artwork: check splash images of real skins (bounded per run) and move saved choices off
  // chromas, duplicate images and missing art. Skipped offline (fixture data has no skins).
  let skinArt: { checked: number; ok: number; missing: number; cardsMoved: number } | null = null;
  if (!result.usedFixture) {
    try {
      const checked = await checkSkinSplashes(ctx.db, { budget: 300 });
      const cardsMoved = await remapSkinSelections(ctx.db);
      skinArt = { ...checked, cardsMoved };
      if (checked.checked || cardsMoved) invalidateCache("champions:skins");
    } catch (err) {
      ctx.log(`Skin art check failed: ${(err as Error).message}`);
    }
  }
  if (result.skinsUpserted) invalidateCache("champions:skins");
  // Item, summoner spell and rune names for the match history (once per game version).
  let assetsUpdated = false;
  if (!result.usedFixture && result.version) {
    try {
      assetsUpdated = await syncRiotAssets(ctx.db, result.version);
    } catch (err) {
      ctx.log(`Item/rune data not refreshed: ${(err as Error).message}`);
    }
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
    skinsUpserted: result.skinsUpserted ?? 0,
    skinArt,
    assetsUpdated,
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
