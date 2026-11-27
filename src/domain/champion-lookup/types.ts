/*
  CHAMPION INTEL's data (docs/CHAMPION_INTEL.md): a champion's five abilities as Riot's Data
  Dragon gives them, stored once per game version by the version-check job (app_settings
  "champion_abilities", src/server/riot/static/abilities.ts) and read per champion by the page.
  Static data Riot publishes before any game; nothing about any player.
*/

export const SLOTS = ["P", "Q", "W", "E", "R"] as const;
export type Slot = (typeof SLOTS)[number];

export interface DdragonAbility {
  slot: Slot;
  /** Data Dragon's spell id (e.g. "RivenTriCleave"); the passive has none. */
  id: string | null;
  name: string;
  /** The icon's file name: /cdn/<version>/img/spell/<icon>, or img/passive/<icon> for the passive. */
  icon: string;
  /** Ranks the ability can take (5 for most basic abilities, 3 for most ultimates; 1 for the passive). */
  maxRank: number;
  /**
   * Base cooldown at each rank in seconds, without ability haste, exactly as Data Dragon gives it.
   * Empty for the passive (Data Dragon has no passive cooldown). Shown as a cooldown only when it
   * passes the guard (ddragonCooldownDisplay in ./cooldown.ts): not when it is all zeros, the
   * ability lists charges, its slot holds two abilities, it has not one number per rank, or the
   * evidence shows it is not the cooldown a player waits for.
   */
  cooldown: number[];
  /**
   * Data Dragon's `maxammo` above 0, else null. Above 0 Data Dragon says the ability holds charges,
   * and `cooldown` is then the wait between casts; the count itself is not reliable alone (Rengar's
   * Q, W and E have 1), so the page never shows it.
   */
  charges: number | null;
  /** Data Dragon's short description, its markup removed (Riot's words, never a source of numbers). */
  description: string;
  /**
   * A short hash of Riot's whole text for the ability as Data Dragon serves it (its description and,
   * for a spell, its tooltip: riotTextHash in src/server/riot/static/abilities.ts). Never the text
   * itself. The per-patch digests compare it (src/server/riot/static/digests.ts). Absent on a record
   * stored before the rules read it (ABILITY_RULES_FORMAT 1).
   */
  textHash?: string | null;
  /**
   * Data Dragon's `cost` per rank, as Riot gives it (rules format 4). Shown only under the cost rule
   * (costDisplay in ./cost.ts): where Riot's own resource line is "{{ cost }}" and the champion's
   * resource, so the number is the one Riot's own line names. Absent on the passive and on a record
   * stored before format 4.
   */
  cost?: number[];
  /** Riot's resource line as Data Dragon gives it ("{{ cost }} {{ abilityresourcename }}", "No Cost"); its placeholders are never shown. */
  resource?: string;
  /**
   * Data Dragon's `range` per rank, exactly as Riot gives it (rules format 5): the number the game's
   * range indicator draws, with no type (a cast range, a dash, a radius around the champion, or a
   * placeholder such as 0, 1, 20 or 25000). Shown only under the reviewed rule (./range.ts). Absent
   * on the passive and on a record stored before format 5.
   */
  range?: number[];
  /**
   * What changed in Riot's data for this ability since the champion's previous stored version (the
   * sync compares the two when it reads a new game version; rules format 4): Riot's text (its hash),
   * the base cooldowns, the cost and (rules format 5) the range. Never the numbers themselves. Null
   * or absent: nothing changed, or no earlier version was held to compare.
   */
  changed?: AbilityChange | null;
}

/** What changed in an ability's Riot data between two stored versions. */
export interface AbilityChange {
  /** The Data Dragon version compared against (the champion's previous stored one). */
  since: string;
  text: boolean;
  cooldown: boolean;
  cost: boolean;
  /** Riot's range array differs; absent when either record is from before rules format 5 (unknown, never a change). */
  range?: boolean;
}

/**
 * A champion's own Data Dragon facts (rules format 4): its resource (`partype`), Riot's classes
 * (`tags`) and its base stats with their growth per level (`stats`, the fields Data Dragon gives,
 * each a number). Which of them the page shows, and how, is ./stats.ts's rule.
 */
export interface DdragonChampionFacts {
  partype: string;
  tags: string[];
  stats: Record<string, number>;
  /** The previous stored version where Riot's base stats differed from these (the sync compares them); null or absent when they did not, or none was held. */
  statsChangedSince?: string | null;
}

export interface DdragonChampionAbilities {
  championId: string;
  /** The Data Dragon version these were read from (e.g. "16.22.1"). */
  version: string;
  abilities: DdragonAbility[];
  /**
   * Riot's own tips for the champion (Data Dragon `allytips` and `enemytips`), verbatim. Stored by
   * the sync since rules format 3; no page shows them since Matchup Intel was retired (23 Nov 2026,
   * docs/CHAMPION_INTEL.md, "What is stored and not shown"). Absent on a record stored under format 2.
   */
  tips?: { ally: string[]; enemy: string[] };
  /** The champion's resource, classes and base stats (rules format 4); absent on an older record. */
  facts?: DdragonChampionFacts | null;
}

/** A champion as the selector offers it: Data Dragon's id, its name and title, its portrait. */
export interface ChampionChoice {
  id: string;
  name: string;
  title: string;
  /** Portrait URL on ddragon.leagueoflegends.com; "" where none is known (the offline fixture). */
  portrait: string;
}
