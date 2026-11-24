import type { Db } from "@/server/db/types";
import { publicPatchName } from "@/domain/patch";
import type { ChampionChoice } from "@/domain/champion-lookup/types";
import { championResolver, lookupChampion, type LookupPage } from "@/domain/champion-lookup/view";
import { getCurrentPatch, listChampions, type ChampionSummary } from "@/server/repositories/champions";
import { loadChampionAbilities } from "@/server/riot/static/abilities";

/*
  CHAMPION LOOKUP's page, built on the server (docs/CHAMPION_LOOKUP.md): the cached roster and
  current patch, and the stored abilities of the one champion the address names, checked against
  the roster first. Nothing else is read: no player, no game, no Riot request.
*/

/** The roster as the selector offers it. */
export function championChoices(list: readonly ChampionSummary[]): ChampionChoice[] {
  return list.map((c) => ({ id: c.id, name: c.name, title: c.title, portrait: c.portraitUrl }));
}

/** The page for the champion the address names (`champion`, an id or a name), or for none. */
export async function loadLookupPage(db: Db, input: { champion?: string | null }): Promise<LookupPage> {
  const [list, current] = await Promise.all([listChampions(db), getCurrentPatch(db)]);
  const champions = championChoices(list);
  const named = typeof input.champion === "string" && input.champion.trim() !== "";
  const choice = named ? championResolver(champions)(input.champion) : null;
  const currentPatch = current && !current.isFixture ? publicPatchName(current.patch) : null;
  if (!choice) return { champions, lookup: null, dropped: named, currentPatch };
  const loaded = await loadChampionAbilities(db, [choice.id]);
  const record = loaded.champions[choice.id] ?? null;
  const lookup = lookupChampion(choice, record, { offline: loaded.offline.includes(choice.id), unreadable: loaded.unreadable.includes(choice.id) });
  return { champions, lookup, dropped: false, currentPatch };
}
