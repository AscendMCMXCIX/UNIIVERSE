import type { Db } from "@/server/db/types";
import { ROLES, type Role } from "@/domain/roles";
import { listChampions } from "@/server/repositories/champions";
import { getChampionMap } from "@/server/engine/service";
import { peekStatsProvider } from "@/server/stats/loader";
import type { PickerChampion } from "@/components/champion-picker";

/** A role counts for the filter when the champion is curated for it, or measurably played there. */
const PRIOR_MIN = 0.15;
const SHARE_MIN = 0.12;
const SHARE_GAMES_MIN = 80;

/**
 * Champions for every champion selector, with the roles they are commonly played in (curated
 * role profile plus measured ranked role share). Champions can sit in several roles; the filter
 * only orders what is shown first, it never makes a champion unselectable. No Riot calls, and
 * no waiting on a cold statistics load: the measured share is used when it is already in memory.
 */
export async function loadPickerChampions(db: Db): Promise<PickerChampion[]> {
  const [list, map] = await Promise.all([listChampions(db), getChampionMap(db)]);
  const stats = peekStatsProvider();
  return list.map((c) => {
    const prior = map.get(c.id)?.profile.rolePrior ?? {};
    const roles = ROLES.filter((r: Role) => {
      if ((prior[r] ?? 0) >= PRIOR_MIN) return true;
      const share = stats?.roleShare(c.id, r);
      return !!share && share.games >= SHARE_GAMES_MIN && share.share >= SHARE_MIN;
    });
    return { id: c.id, name: c.name, portraitUrl: c.portraitUrl, roles };
  });
}
