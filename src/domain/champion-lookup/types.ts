/*
  CHAMPION LOOKUP's data (docs/CHAMPION_LOOKUP.md): a champion's five abilities as Riot's Data
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
}

export interface DdragonChampionAbilities {
  championId: string;
  /** The Data Dragon version these were read from (e.g. "16.22.1"). */
  version: string;
  abilities: DdragonAbility[];
  /**
   * Riot's own tips for the champion (Data Dragon `allytips` and `enemytips`), verbatim. Stored by
   * the sync since rules format 3; no page shows them since Matchup Intel was retired (23 Nov 2026,
   * docs/CHAMPION_LOOKUP.md, "What is stored and not shown"). Absent on a record stored under format 2.
   */
  tips?: { ally: string[]; enemy: string[] };
}

/** A champion as the selector offers it: Data Dragon's id, its name and title, its portrait. */
export interface ChampionChoice {
  id: string;
  name: string;
  title: string;
  /** Portrait URL on ddragon.leagueoflegends.com; "" where none is known (the offline fixture). */
  portrait: string;
}
