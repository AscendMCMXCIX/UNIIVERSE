import { and, asc, eq, ne } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { championSkins, champions } from "@/server/db/schema";
import { cachedFor } from "@/server/observability/cache";
import { listChampions } from "@/server/repositories/champions";

export interface SkinOption {
  num: number;
  name: string;
}

/**
 * A champion's skins as players may choose them for their card (active skins, default first).
 * When no skin has been collected yet (offline demo, or before the first sync), only the default
 * art is offered. Cached with the champion data and invalidated when a sync changes it.
 *
 * Only a champion in the game gets a cache entry. The id can come from the browser (Card Studio
 * asks for any id that passes listChampionSkinsAction's pattern), and an entry per made-up id
 * would let any signed-in session grow this instance's cache without limit. Any other id is
 * read as before, just not kept (it has no skins, so the default art only).
 */
export async function listSkins(db: Db, championId: string): Promise<SkinOption[]> {
  const load = async () => {
    const rows = await db
      .select({ num: championSkins.num, name: championSkins.name, signature: championSkins.splashSignature })
      .from(championSkins)
      .where(and(eq(championSkins.championId, championId), eq(championSkins.isActive, true), ne(championSkins.kind, "chroma"), ne(championSkins.splashStatus, "missing")))
      .orderBy(asc(championSkins.num));
    return uniqueArtwork(rows);
  };
  if (!(await listChampions(db)).some((c) => c.id === championId)) return load();
  return cachedFor(`champions:skins:${championId}`, 10 * 60_000, load, db);
}

/**
 * One entry per distinct illustration: the default art first, then each skin whose image has not
 * been seen earlier in the list (same ETag and size = same picture; the first, original release
 * is kept). Skins not checked yet are offered as they are.
 */
export function uniqueArtwork(rows: Array<{ num: number; name: string; signature: string | null }>): SkinOption[] {
  const seen = new Set<string>();
  const out: SkinOption[] = [];
  for (const r of rows) {
    if (r.signature) {
      if (seen.has(r.signature)) continue;
      seen.add(r.signature);
    }
    out.push({ num: r.num, name: r.num === 0 ? "Default" : r.name });
  }
  return out.length && out[0]!.num === 0 ? out : [{ num: 0, name: "Default" }, ...out.filter((r) => r.num !== 0)];
}

/** Whether a champion exists and is in the game (any active champion may be featured). */
export async function isActiveChampion(db: Db, championId: string): Promise<boolean> {
  const [row] = await db.select({ id: champions.id }).from(champions).where(and(eq(champions.id, championId), eq(champions.isActive, true))).limit(1);
  return !!row;
}
