import { unstable_cache, revalidateTag } from "next/cache";
import type { Db } from "@/server/db/types";
import { getDbHandle } from "@/server/db/client";
import { hasPermission, type Session } from "@/server/auth/permissions";
import { getCurrentPatch, listPatchesDesc } from "@/server/repositories/champions";
import { assetUrl, loadRiotAssets, loadRiotBuildData, type RiotAssets } from "@/server/riot/static/assets";
import { log } from "@/server/observability/log";
import { BUILDS_FORMAT, championBuildsView, itemClasses, previousPatch, type BuildCountRow, type BuildIcon, type ChampionBuildsView, type IconResolver, type SkillRanks } from "@/domain/champion-builds";
import type { Slot } from "@/domain/champion-lookup/types";
import { readBuildCounts } from "./query";

/*
  Champion Intel's builds for one champion (docs/CHAMPION_INTEL.md, "Builds and runes"), built on
  the server: who may see them, the patch window, the counts (one statement, query.ts, cached), and
  the view with every id made an icon with its name.

  - Only for accounts holding "view-teammate-stats": the team members' own games are among the
    counts, and a champion only one member plays would show that member's choices and results
    (the same right as a teammate's season figures; Leaderboards checks it the same way). Anyone
    else gets nothing: no section, no words.
  - Nothing without the game's current patch from Data Dragon (the offline fixture knows none).
  - The counts are cached for CACHE_SECONDS in Next's data cache, shared by every server instance
    (a per-instance cache would miss on every cold instance), keyed by the champion, the patch
    window, each ability's ranks, the item data's version and BUILDS_FORMAT: a new patch, new item
    data or new rules are new keys. The tag is dropped on an erasure (forgetChampionBuilds), so an
    erased person's games leave the totals at once rather than within six hours. Only the
    production database is cached so: the in-memory demo (seeded afresh at every start, and read
    by the browser tests) is counted each time.
  - A failure shows one honest line ("Builds can't be loaded right now") and is logged; it never
    fails the page.
*/

export const BUILDS_CACHE_TAG = "champion-builds";
const CACHE_SECONDS = 6 * 3600;

/** Riot's stat shard ids and their Data Dragon icons (cdn/img/perk-images/StatMods), the same table as Match History's (server/players/match-history.ts SHARD_ICONS): runesReforged.json has no shards. */
const SHARD_ICONS: Readonly<Record<number, string>> = {
  5001: "StatModsHealthScalingIcon.png",
  5002: "StatModsArmorIcon.png",
  5003: "StatModsMagicResIcon.png",
  5005: "StatModsAttackSpeedIcon.png",
  5007: "StatModsCDRScalingIcon.png",
  5008: "StatModsAdaptiveForceIcon.png",
  5010: "StatModsMovementSpeedIcon.png",
  5011: "StatModsHealthPlusIcon.png",
  5013: "StatModsTenacityIcon.png",
};
/** Data Dragon has icons for the shards but no names (OD7): each is named by its row. */
const SHARD_ROWS = ["Offense shard", "Flex shard", "Defense shard"];

/** Icons for the counted ids, from the stored names and Data Dragon's URLs at the current version; an id the data cannot name gets a plain name and no URL (the page draws a stand-in). */
export function iconResolver(assets: RiotAssets | null): IconResolver {
  const version = assets?.version ?? null;
  const plain = (name: string): BuildIcon => ({ url: "", name });
  return {
    item: (id) => {
      const name = assets?.items[String(id)];
      return name && version ? { url: assetUrl.item(version, id), name } : plain(name ?? `Item ${id}`);
    },
    rune: (id) => {
      const r = assets?.runes[String(id)];
      return r ? { url: assetUrl.rune(r.icon), name: r.name } : plain(`Rune ${id}`);
    },
    spell: (key) => {
      const s = assets?.spells[String(key)];
      return s && version ? { url: assetUrl.spell(version, s.id), name: s.name } : plain(s?.name ?? "Summoner spell");
    },
    shard: (id, row) => {
      const name = SHARD_ROWS[row] ?? "Stat shard";
      return Object.hasOwn(SHARD_ICONS, id) ? { url: assetUrl.rune(`perk-images/StatMods/${SHARD_ICONS[id]}`), name } : plain(name);
    },
  };
}

/** The ranks of a champion's Q, W, E and R as the page holds them (each ability's Data Dragon maxrank); null when one is missing. */
export function skillRanksOf(abilities: ReadonlyArray<{ slot: Slot; ranks: number }> | null | undefined): SkillRanks | null {
  const of = (slot: Slot) => abilities?.find((a) => a.slot === slot)?.ranks;
  const [q, w, e, r] = [of("Q"), of("W"), of("E"), of("R")];
  return q && w && e && r ? { 1: q, 2: w, 3: e, 4: r } : null;
}

/** Whether counts go through Next's data cache: inside the Next server, on the production database only. */
async function sharedCacheFor(db: Db): Promise<boolean> {
  if (!process.env.NEXT_RUNTIME) return false;
  try {
    const handle = await getDbHandle();
    return handle.db === db && handle.mode === "postgres";
  } catch {
    return false;
  }
}

export interface ChampionBuildsInput {
  championId: string;
  championName: string;
  /** Each ability's ranks (skillRanksOf); null counts no skill order. */
  ranks: SkillRanks | null;
}

/**
 * The builds view of one champion for this account, or null where nothing is shown at all (no
 * permission, no current patch). Never throws: a failure is the "unavailable" view.
 */
export async function loadChampionBuilds(db: Db, session: Session | null, input: ChampionBuildsInput): Promise<ChampionBuildsView | null> {
  if (!hasPermission(session, "view-teammate-stats")) return null;
  try {
    const current = await getCurrentPatch(db);
    if (!current || current.isFixture) return null;
    const [known, buildData, assets] = await Promise.all([listPatchesDesc(db), loadRiotBuildData(db), loadRiotAssets(db)]);
    const previous = previousPatch(current.patch, known);
    const patches = previous ? [current.patch, previous] : [current.patch];
    const items = itemClasses(buildData?.itemInfo ?? {});
    const count = () => readBuildCounts(db, { champion: input.championId, patches, items, ranks: input.ranks });
    const ranksKey = input.ranks ? [1, 2, 3, 4].map((s) => input.ranks![s as 1 | 2 | 3 | 4]).join(",") : "none";
    const rows: BuildCountRow[] = (await sharedCacheFor(db))
      ? await unstable_cache(count, ["champion-builds", String(BUILDS_FORMAT), input.championId, patches.join("+"), ranksKey, buildData?.version ?? "no-items"], { revalidate: CACHE_SECONDS, tags: [BUILDS_CACHE_TAG] })()
      : await count();
    return championBuildsView(input.championName, rows, { current: current.patch, previous }, iconResolver(assets));
  } catch (err) {
    log("error", "champion-builds.failed", { champion: input.championId, error: err });
    return { status: "unavailable", championName: input.championName };
  }
}

/**
 * Drops every cached count (an erasure: the erased person's games must leave the totals now). Only
 * inside a request of the Next server (a server action, a route); elsewhere (a script, a test) there
 * is no data cache to drop, and the cached counts expire within CACHE_SECONDS anyway.
 */
export function forgetChampionBuilds(): void {
  try {
    revalidateTag(BUILDS_CACHE_TAG, { expire: 0 });
  } catch {
    // Outside a request of the Next server: nothing cached here.
  }
}
