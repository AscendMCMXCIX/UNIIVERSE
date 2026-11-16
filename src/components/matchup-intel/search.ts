import { normalise } from "@/components/champions/types";
import type { ChampionChoice } from "@/domain/matchup-intel/types";

/*
  The pickers' search (docs/MATCHUP_INTEL.md, "Where it is"): it filters as you type, by name, with
  case, accents, spaces and punctuation ignored, so "kha" finds Kha'Zix, "wu" Wukong and "dr m"
  Dr. Mundo; and by what players type for a name of more than one part, its initials ("tf" Twisted
  Fate, "mf" Miss Fortune, "lb" LeBlanc), or a short reviewed list of nicknames ("j4" Jarvan IV).
  The best matches come first.
*/

/** The search key of a name or of what was typed: "Kha'Zix" and "kha zix" are both "khazix". */
export const searchKey = normalise;

/**
 * Nicknames players type that are neither a name's start nor its initials, by Data Dragon id. Each
 * reviewed: one champion per nickname, and only names in common use.
 */
export const NICKNAMES: Readonly<Record<string, string>> = {
  j4: "JarvanIV",
  asol: "AurelionSol",
  ww: "Warwick",
  gp: "Gangplank",
};

/** The parts of a name: its words, and the capitalised parts within one ("LeBlanc": Le, Blanc). */
const parts = (name: string) =>
  name
    .split(/[\s'&.\-]+/)
    .flatMap((word) => word.split(/(?=[A-Z])/))
    .filter(Boolean);

/** A name's initials ("Twisted Fate": tf; "K'Sante": ks), or "" for a name of one part. */
export function initialsOf(name: string): string {
  const p = parts(name);
  return p.length > 1 ? searchKey(p.map((w) => w[0]!).join("")) : "";
}

/**
 * The champions a search finds, best first: names that start with it, then names with a later word
 * that starts with it ("sol" for Aurelion Sol), then names or ids that contain it (Wukong's id is
 * MonkeyKing), then names whose initials start with it (two letters or more), then a nickname's
 * champion; each group in the roster's order. An empty search finds nothing: the picker shows its
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
    const initials = initialsOf(c.name);
    if (q.length >= 2 && initials.startsWith(q)) return 3;
    if (Object.hasOwn(NICKNAMES, q) && NICKNAMES[q] === c.id) return 4;
    return -1;
  };
  return champions
    .map((c, i) => ({ c, r: rank(c), i }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.c);
}
