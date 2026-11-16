import { normalise } from "@/components/champions/types";
import type { ChampionChoice } from "@/domain/matchup-intel/types";

/*
  The pickers' search (docs/MATCHUP_INTEL.md, "Where it is"): it filters as you type, by name, with
  case, accents, spaces and punctuation ignored, so "kha" finds Kha'Zix, "wu" Wukong and "dr m"
  Dr. Mundo. The best matches come first.
*/

/** The search key of a name or of what was typed: "Kha'Zix" and "kha zix" are both "khazix". */
export const searchKey = normalise;

/**
 * The champions a search finds, best first: names that start with it, then names with a later word
 * that starts with it ("sol" for Aurelion Sol), then names or ids that contain it (Wukong's id is
 * MonkeyKing); each group in the roster's order. An empty search finds nothing: the picker shows its
 * own lists then.
 */
export function searchChampions<T extends Pick<ChampionChoice, "id" | "name">>(champions: readonly T[], query: string): T[] {
  const q = searchKey(query);
  if (!q) return [];
  const rank = (c: T): number => {
    const name = searchKey(c.name);
    if (name.startsWith(q)) return 0;
    if (
      c.name
        .split(/[\s'&.\-]+/)
        .slice(1)
        .some((word) => searchKey(word).startsWith(q))
    )
      return 1;
    if (name.includes(q) || searchKey(c.id).includes(q)) return 2;
    return -1;
  };
  return champions
    .map((c, i) => ({ c, r: rank(c), i }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.c);
}
