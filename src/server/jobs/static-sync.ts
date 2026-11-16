import { defineJob, type JobContext } from "./registry";
import { DataDragonProvider } from "@/server/riot/static/ddragon";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { checkSkinSplashes, remapSkinSelections } from "@/server/riot/static/skin-art";
import { syncRiotAssets } from "@/server/riot/static/assets";
import { invalidateChampionMap } from "@/server/champions/map";
import { invalidateChampionCaches } from "@/server/repositories/champions";
import { invalidateCache } from "@/server/observability/cache";
import { seedChampionAbilitiesFromFixture, syncChampionAbilities, type AbilitySyncResult } from "@/server/matchup-intel/abilities";

/** The longest the champion abilities may take inside a run (their files are requested only on a new version or a first fill). */
const ABILITY_SYNC_MS = 30_000;

/**
 * Version check + champion sync. Cheap when nothing changed (one request). When a new version
 * is detected it syncs champions and skins, records the new patch and clears the relevant
 * caches. Also registered as "version-check" for a clearer schedule entry.
 */
async function run(ctx: Pick<JobContext, "db" | "log" | "startedAt" | "budgetMs">, force: boolean) {
  const provider = new DataDragonProvider();
  const result = await syncStaticData(ctx.db, provider, { force, fixture: new FixtureStaticProvider(), log: ctx.log });
  if (result.changed) {
    invalidateChampionMap();
    invalidateChampionCaches();
    invalidateCache("shell-facts");
  }
  // Matchup Intel: each champion's abilities from Data Dragon, once per game version, from the
  // detail files the champion sync just read (the missing ones are requested); the committed
  // offline copy when the champions came from the offline fixture. When nothing changed it is one
  // statement, which reads the stored abilities once. Its own failure never stops the rest of the run.
  let abilities: AbilitySyncResult | null = null;
  try {
    if (result.usedFixture) abilities = await seedChampionAbilitiesFromFixture(ctx.db, { log: ctx.log });
    else if (result.ok && !result.degraded && result.version) {
      const deadline = Math.min(ctx.startedAt + ctx.budgetMs, Date.now() + ABILITY_SYNC_MS);
      abilities = await syncChampionAbilities(ctx.db, result.version, { provider, details: result.championDetails, force, deadline, log: ctx.log });
    }
  } catch (err) {
    ctx.log(`Champion abilities not refreshed: ${(err as Error).message}`);
  }
  // Card artwork: check splash images of real skins (bounded per run, and none started after the
  // job's budget) and move saved choices off chromas, duplicate images and missing art. Skipped
  // offline (fixture data has no skins).
  let skinArt: { checked: number; ok: number; missing: number; cardsMoved: number } | null = null;
  if (!result.usedFixture) {
    try {
      const checked = await checkSkinSplashes(ctx.db, { budget: 300, deadline: ctx.startedAt + ctx.budgetMs });
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
    skinsUpserted: result.skinsUpserted ?? 0,
    skinArt,
    assetsUpdated,
    // Counts only: no champion is named in a job's output.
    abilities: abilities && {
      version: abilities.version,
      source: abilities.source,
      stored: abilities.stored,
      refreshed: abilities.refreshed,
      kept: abilities.kept,
      failed: abilities.failed,
      deferred: abilities.deferred,
      fetched: abilities.fetched,
      degraded: abilities.degraded,
    },
  };
  if (!result.ok) return { ok: false, error: result.error, summary };
  const error = [result.error, abilities?.error].filter(Boolean).join(" ") || undefined;
  return { ok: true, degraded: result.degraded || Boolean(abilities?.degraded), error, summary };
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
