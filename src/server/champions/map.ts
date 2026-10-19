import type { Db } from "@/server/db/types";
import { getChampionProfile, type ChampionInfo } from "@/domain/champion-model";
import { listChampions } from "@/server/repositories/champions";

declare global {
  var __uniiverseChampionMap: { key: string; map: Map<string, ChampionInfo>; loadedAt: number } | undefined;
}

/** Champion map (id → name + profile) built from the synchronised roster; cached briefly. */
export async function getChampionMap(db: Db): Promise<Map<string, ChampionInfo>> {
  const cached = globalThis.__uniiverseChampionMap;
  if (cached && Date.now() - cached.loadedAt < 60_000) return cached.map;
  const list = await listChampions(db);
  const map = new Map<string, ChampionInfo>();
  for (const c of list) {
    map.set(c.id, { id: c.id, name: c.name, profile: getChampionProfile(c.id, { tags: c.tags, attackRange: c.attackRange }) });
  }
  globalThis.__uniiverseChampionMap = { key: String(list.length), map, loadedAt: Date.now() };
  return map;
}

export function invalidateChampionMap() {
  globalThis.__uniiverseChampionMap = undefined;
}
