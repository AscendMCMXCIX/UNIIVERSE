import type { Db } from "@/server/db/types";
import type { DdragonChampionAbilities } from "@/domain/matchup-intel/types";

/*
  Layer 1's roster-wide source: each champion's abilities from Riot's Data Dragon, stored by the
  version-check job once per game version (app_settings "champion_abilities"), read per champion.
  SEAM: the data layer replaces this stub (docs/MATCHUP_INTEL.md, "Data").
*/

/** The stored abilities of the given champions; a champion with none stored yet maps to null. */
export async function loadChampionAbilities(db: Db, championIds: readonly string[]): Promise<{ version: string | null; champions: Record<string, DdragonChampionAbilities | null> }> {
  void db;
  return { version: null, champions: Object.fromEntries(championIds.map((id) => [id, null])) };
}
