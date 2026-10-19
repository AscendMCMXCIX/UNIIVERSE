import { asc, desc, eq } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { champions, patches } from "@/server/db/schema";
import { championPortraitUrl } from "@/server/riot/static/ddragon";
import { FIXTURE_VERSION } from "@/server/riot/static/fixture";
import { cachedFor, invalidateCache } from "@/server/observability/cache";

export interface ChampionSummary {
  id: string;
  key: number;
  name: string;
  title: string;
  tags: string[];
  attackRange: number;
  portraitUrl: string;
  source: string;
}

/** Current patch, cached per process for a minute (the version check invalidates it on a new patch). */
export async function getCurrentPatch(db: Db): Promise<{ patch: string; ddragonVersion: string; isFixture: boolean } | null> {
  return cachedFor("patch:current", 60_000, async () => {
    const [row] = await db.select({ id: patches.id, ddragonVersion: patches.ddragonVersion }).from(patches).where(eq(patches.isCurrent, true)).limit(1);
    if (!row) return null;
    return { patch: row.id, ddragonVersion: row.ddragonVersion, isFixture: row.ddragonVersion === FIXTURE_VERSION };
  }, db);
}

/** Call after a static sync changes patches or champions. */
export function invalidateChampionCaches(): void {
  invalidateCache("patch");
  invalidateCache("champions");
}

/** Known patches, newest first. */
export async function listPatchesDesc(db: Db): Promise<string[]> {
  const rows = await db.select({ id: patches.id }).from(patches).orderBy(desc(patches.sortKey));
  return rows.map((r) => r.id);
}

/** Active champions with portrait URLs; ~170 rows read once per process per patch (5 min TTL). */
export async function listChampions(db: Db): Promise<ChampionSummary[]> {
  const current = await getCurrentPatch(db);
  return cachedFor(`champions:list:${current?.ddragonVersion ?? "none"}`, 5 * 60_000, async () => {
    const rows = await db.select({ id: champions.id, key: champions.key, name: champions.name, title: champions.title, tags: champions.tags, attackRange: champions.attackRange, imageFull: champions.imageFull, source: champions.source }).from(champions).where(eq(champions.isActive, true)).orderBy(asc(champions.name));
    const version = current?.ddragonVersion ?? "";
    return rows.map((c) => ({
    id: c.id,
    key: c.key,
    name: c.name,
    title: c.title,
    tags: c.tags,
    attackRange: c.attackRange,
    portraitUrl: version && version !== FIXTURE_VERSION ? championPortraitUrl(version, c.imageFull) : "",
    source: c.source,
  }));
  }, db);
}
