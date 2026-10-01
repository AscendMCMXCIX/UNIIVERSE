import { asc, desc, eq } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { championChangePoints, champions, patches } from "@/server/db/schema";
import { championPortraitUrl } from "@/server/riot/static/ddragon";
import { FIXTURE_VERSION } from "@/server/riot/static/fixture";

export interface ChampionSummary {
  id: string;
  key: number;
  name: string;
  title: string;
  tags: string[];
  attackRange: number;
  portraitUrl: string;
  isNew: boolean;
  source: string;
}

export async function getCurrentPatch(db: Db): Promise<{ patch: string; ddragonVersion: string; isFixture: boolean } | null> {
  const [row] = await db.select().from(patches).where(eq(patches.isCurrent, true)).limit(1);
  if (!row) return null;
  return { patch: row.id, ddragonVersion: row.ddragonVersion, isFixture: row.ddragonVersion === FIXTURE_VERSION };
}

/** Known patches, newest first. */
export async function listPatchesDesc(db: Db): Promise<string[]> {
  const rows = await db.select({ id: patches.id }).from(patches).orderBy(desc(patches.sortKey));
  return rows.map((r) => r.id);
}

export async function listChampions(db: Db): Promise<ChampionSummary[]> {
  const current = await getCurrentPatch(db);
  const rows = await db.select().from(champions).where(eq(champions.isActive, true)).orderBy(asc(champions.name));
  const version = current?.ddragonVersion ?? "";
  return rows.map((c) => ({
    id: c.id,
    key: c.key,
    name: c.name,
    title: c.title,
    tags: c.tags,
    attackRange: c.attackRange,
    portraitUrl: version && version !== FIXTURE_VERSION ? championPortraitUrl(version, c.imageFull) : "",
    isNew: current ? c.firstSeenVersion === current.ddragonVersion && c.firstSeenVersion !== FIXTURE_VERSION : false,
    source: c.source,
  }));
}

export async function listChangePoints(db: Db) {
  return db.select().from(championChangePoints).orderBy(desc(championChangePoints.createdAt));
}

export async function setChangePointConfirmed(db: Db, id: number, confirmed: boolean, discount?: number) {
  await db
    .update(championChangePoints)
    .set({ confirmed, ...(discount !== undefined ? { discount } : {}) })
    .where(eq(championChangePoints.id, id));
}

export async function deleteChangePoint(db: Db, id: number) {
  await db.delete(championChangePoints).where(eq(championChangePoints.id, id));
}
