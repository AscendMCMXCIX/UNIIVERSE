import type { Db } from "@/server/db/types";
import { publicPatchName } from "@/domain/patch";
import type { ChampionChoice } from "@/domain/champion-lookup/types";
import { championResolver, lookupChampion, type LookupPage } from "@/domain/champion-lookup/view";
import { getCurrentPatch, listChampions, type ChampionSummary } from "@/server/repositories/champions";
import { loadChampionAbilities } from "@/server/riot/static/abilities";

/*
  CHAMPION INTEL's page, built on the server (docs/CHAMPION_INTEL.md): the cached roster and current
  patch, and the stored abilities of the one or two champions the address names, checked against
  the roster first and read in one statement. Nothing else is read: no player, no game, no Riot
  request.
*/

/** The roster as the selector offers it. */
export function championChoices(list: readonly ChampionSummary[]): ChampionChoice[] {
  return list.map((c) => ({ id: c.id, name: c.name, title: c.title, portrait: c.portraitUrl }));
}

const named = (v: string | null | undefined): v is string => typeof v === "string" && v.trim() !== "";

/**
 * The page for the champions the address names (`champion`, and `champion2` beside it; each an id
 * or a name), or for none. A second champion alone is the first. One the roster lacks is left out
 * (`dropped`).
 */
export async function loadLookupPage(db: Db, input: { champion?: string | null; champion2?: string | null }): Promise<LookupPage & { firstFrom: "champion" | "champion2" | null }> {
  const [list, current] = await Promise.all([listChampions(db), getCurrentPatch(db)]);
  const champions = championChoices(list);
  const resolve = championResolver(champions);
  const asked = (["champion", "champion2"] as const).filter((key) => named(input[key]));
  const found = asked.map((key) => ({ key, choice: resolve(input[key]) })).filter((x): x is { key: "champion" | "champion2"; choice: ChampionChoice } => x.choice !== null);
  const currentPatch = current && !current.isFixture ? publicPatchName(current.patch) : null;
  const dropped = found.length < asked.length;
  if (!found.length) return { champions, lookup: null, second: null, dropped, currentPatch, firstFrom: null };
  const loaded = await loadChampionAbilities(db, found.map((c) => c.choice.id));
  const view = (c: ChampionChoice) => lookupChampion(c, loaded.champions[c.id] ?? null, { offline: loaded.offline.includes(c.id), unreadable: loaded.unreadable.includes(c.id) });
  return { champions, lookup: view(found[0]!.choice), second: found[1] ? view(found[1].choice) : null, dropped, currentPatch, firstFrom: found[0]!.key };
}
