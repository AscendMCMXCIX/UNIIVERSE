import type { DdragonChampionFacts } from "./types";

/*
  CHAMPION INTEL's base statistics (docs/CHAMPION_INTEL.md, "Base statistics"): the champion's
  numbers at level 1 and their growth per level, as Riot's Data Dragon gives them in each
  champion's `stats`, checked across the whole roster (Data Dragon 16.22.1, 173 champions;
  stats.test.ts holds the rules to every champion):

  - health, armour, magic resist, attack damage, attack speed, attack range and move speed have a
    number for every champion; health and its regeneration per 5 seconds, armour and magic resist
    grow per level by Riot's number. A growth of 0 is shown as no growth, never "+0" (Thresh's armour,
    whose game gives him armour by other means; an Energy pool, which does not grow);
  - attack damage growth (`attackdamageperlevel`) is 0 for every one of the 173 champions at 16.22.1,
    which no champion has in the game: a placeholder, so no growth is shown for attack damage while
    Riot's data gives 0 (never "+0 per level"), as the cooldown rules treat an all-zero array;
  - attack speed grows by a percentage of the base per level (`attackspeedperlevel`, 2.2 is 2.2%);
    Bel'Veth and Jhin have 0, which is theirs;
  - mana and its regeneration only for a champion whose resource is Mana, energy for Energy: other
    resources (Fury, Heat, Flow…) fill another way, and their numbers in `mp` are no pool (Viego's
    is 10000);
  - critical strike (`crit`, `critperlevel`) is 0 for every champion and never shown.
  Riot's own words for its resource and classes (`partype`, `tags`) are shown as given, except an
  empty resource (Bel'Veth's at 16.22.1), which names nothing and is left out. No value at a level
  is computed: the growth is Riot's number per level as given.
*/

export type StatKey = "hp" | "hpregen" | "mp" | "mpregen" | "armor" | "spellblock" | "attackdamage" | "attackspeed" | "attackrange" | "movespeed";

export interface StatRow {
  key: StatKey;
  label: string;
  /** Riot's base value (at level 1). */
  base: number;
  /** Riot's growth per level, or null where there is none to show (a growth of 0; attack damage's placeholder 0; a stat that does not grow). */
  growth: number | null;
  /** "%": the growth is a percentage of the base (attack speed). */
  growthUnit: "" | "%";
}

const num = (stats: Record<string, number>, key: string): number | null => {
  const v = stats[key];
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
};

/** The champion's resource as Riot names it, for a champion that has one: "Mana", "Energy", "Fury"…; null for none named. */
export function resourceName(partype: string | null | undefined): string | null {
  const p = typeof partype === "string" ? partype.trim() : "";
  if (!p || /^none$/i.test(p)) return null;
  return p.length <= 30 ? p : null;
}

/** The base statistics the page shows, in its order; a stat Riot's data lacks for this champion is left out. */
export function statRows(facts: DdragonChampionFacts | null | undefined): StatRow[] {
  const stats = facts?.stats;
  if (!stats || typeof stats !== "object") return [];
  const rows: StatRow[] = [];
  const add = (key: StatKey, label: string, growthKey: string | null, growthUnit: "" | "%" = "") => {
    const base = num(stats, key);
    if (base === null) return;
    const g = growthKey ? num(stats, growthKey) : null;
    rows.push({ key, label, base, growth: g !== null && g > 0 ? g : null, growthUnit });
  };
  add("hp", "Health", "hpperlevel");
  // "5 s" never parts at a line's end (a no-break space): a narrow column wraps before "per" instead.
  add("hpregen", "Health regen per 5\u00a0s", "hpregenperlevel");
  const resource = resourceName(facts?.partype);
  if (resource === "Mana" || resource === "Energy") {
    add("mp", resource, "mpperlevel");
    add("mpregen", `${resource} regen per 5\u00a0s`, "mpregenperlevel");
  }
  add("attackdamage", "Attack damage", "attackdamageperlevel");
  add("attackspeed", "Attack speed", "attackspeedperlevel", "%");
  add("armor", "Armor", "armorperlevel");
  add("spellblock", "Magic resist", "spellblockperlevel");
  add("attackrange", "Attack range", null);
  add("movespeed", "Move speed", null);
  return rows;
}
