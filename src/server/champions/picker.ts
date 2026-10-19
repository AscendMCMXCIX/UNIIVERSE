import type { Db } from "@/server/db/types";
import { ROLES, type Role } from "@/domain/roles";
import { listChampions } from "@/server/repositories/champions";
import { getChampionMap } from "@/server/champions/map";
import type { PickerChampion } from "@/components/champion-picker";

/** A role counts for the filter when the champion's curated role profile gives it this much weight. */
const PRIOR_MIN = 0.15;

/**
 * Champions for every champion selector, with the roles they are commonly played in (from the
 * curated role profile). Champions can sit in several roles; the filter only orders what is
 * shown first, it never makes a champion unselectable. No Riot calls.
 */
export async function loadPickerChampions(db: Db): Promise<PickerChampion[]> {
  const [list, map] = await Promise.all([listChampions(db), getChampionMap(db)]);
  return list.map((c) => {
    const prior = map.get(c.id)?.profile.rolePrior ?? {};
    const roles = ROLES.filter((r: Role) => (prior[r] ?? 0) >= PRIOR_MIN);
    return { id: c.id, name: c.name, portraitUrl: c.portraitUrl, roles };
  });
}
