import fixture from "@/server/riot/fixtures/champions.fixture.json";
import { getChampionProfile } from "@/domain/champion-model";
import type { ChampionInfo } from "@/domain/engine";

/** Champion map built from the offline fixture roster + curated profiles. */
export function buildChampionMap(): Map<string, ChampionInfo> {
  const map = new Map<string, ChampionInfo>();
  for (const c of fixture.champions) {
    map.set(c.id, { id: c.id, name: c.name, profile: getChampionProfile(c.id, { tags: c.tags, attackRange: c.attackRange }) });
  }
  return map;
}
