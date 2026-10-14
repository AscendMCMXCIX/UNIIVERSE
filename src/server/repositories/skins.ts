import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { championSkins, champions } from "@/server/db/schema";
import { cachedFor } from "@/server/observability/cache";

export interface SkinOption {
  num: number;
  name: string;
}

/**
 * A champion's skins as players may choose them for their card (active skins, default first).
 * When no skin has been collected yet (offline demo, or before the first sync), only the default
 * art is offered. Cached with the champion data and invalidated when a sync changes it.
 */
export async function listSkins(db: Db, championId: string): Promise<SkinOption[]> {
  return cachedFor(`champions:skins:${championId}`, 10 * 60_000, async () => {
    const rows = await db.select({ num: championSkins.num, name: championSkins.name }).from(championSkins).where(and(eq(championSkins.championId, championId), eq(championSkins.isActive, true))).orderBy(asc(championSkins.num));
    return rows.length && rows[0]!.num === 0 ? rows : [{ num: 0, name: "Default" }, ...rows.filter((r) => r.num !== 0)];
  }, db);
}

/** Whether a champion exists and is in the game (any active champion may be featured). */
export async function isActiveChampion(db: Db, championId: string): Promise<boolean> {
  const [row] = await db.select({ id: champions.id }).from(champions).where(and(eq(champions.id, championId), eq(champions.isActive, true))).limit(1);
  return !!row;
}
