/*
  MATCHUP INTEL: the types every part of the feature shares (docs/MATCHUP_INTEL.md).

  A player picks their own champion and an enemy, and reads in seconds what the enemy's abilities
  do, their base cooldowns, and, where a person has written and checked it, what matters in that
  lane. It is a static reference: base values per rank, no timers, nothing read from a game.

  Two layers, kept apart so each can improve without the other or the interface changing:
  - Champion intelligence: facts about one champion. Riot's Data Dragon gives every champion's
    ability names, icons, ranks and base cooldown arrays (stored by the version-check job, once per
    game version). Curated notes add what Data Dragon cannot say (when a cooldown starts, charges,
    recasts, crowd control, mobility, defences, interactions), each fact with its source and the
    patch it was checked on.
  - Matchup intelligence: what is specific to champion A against champion B, written and reviewed
    by people from those facts. Where none exists, the page says so and shows the enemy's champion
    intelligence instead. Nothing is generated.

  Only plain data crosses into the browser: these types, never the server modules behind them.
*/

/** The five ability slots, in the order the page shows them. */
export const SLOTS = ["P", "Q", "W", "E", "R"] as const;
export type Slot = (typeof SLOTS)[number];

/** One ability as Riot's Data Dragon describes it (src/server/matchup-intel/abilities.ts). */
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
   * Empty for the passive (Data Dragon has no passive cooldown). Not shown as a cooldown when it is
   * all zeros or the ability has charges: then Data Dragon's number is not the cooldown a player
   * waits for (see cooldownDisplay in src/domain/matchup-intel/cooldown.ts).
   */
  cooldown: number[];
  /** Data Dragon's `maxammo` above 0: the ability holds charges, and `cooldown` is the time between casts. */
  charges: number | null;
  /** Data Dragon's short description, its markup removed (Riot's words, never a source of numbers). */
  description: string;
}

/** One champion's abilities from Data Dragon, at one game version. */
export interface DdragonChampionAbilities {
  championId: string;
  /** The Data Dragon version these were read from (e.g. "16.22.1"). */
  version: string;
  abilities: DdragonAbility[];
}

/** Where a curated fact comes from. */
export interface Source {
  /** Short id the facts refer to, unique within one champion's or one matchup's notes. */
  id: string;
  title: string;
  /** An https URL on wiki.leagueoflegends.com or developer.riotgames.com / ddragon.leagueoflegends.com. */
  url: string;
  /** The wiki page's revision id when it was read, so a later change can be told apart. */
  revision?: number;
  /** "CC BY-SA 3.0" for the League of Legends Wiki; Riot's own terms for Data Dragon. */
  licence: "CC BY-SA 3.0" | "Riot Games";
}

/** When and against what a set of curated notes was checked. */
export interface Verification {
  /** The public patch (e.g. "26.22"). */
  patch: string;
  /** The Data Dragon version compared (e.g. "16.22.1"). */
  ddragonVersion: string;
  /** The day it was checked, ISO (e.g. "2026-11-16"). */
  checkedOn: string;
}

/**
 * When an ability's cooldown starts, as its source states it. "on-cast" is the ordinary case;
 * the others are why a bare number can mislead.
 */
export type CooldownStart = "on-cast" | "after-first-cast" | "after-last-recast" | "after-effect-ends" | "after-channel";

/** A curated description of an ability's cooldown, for what Data Dragon's array cannot say. */
export type CooldownSpec =
  /** A cooldown per rank. `seconds` must equal Data Dragon's array for the verified version. */
  | { kind: "per-rank"; seconds: number[]; starts: CooldownStart }
  /** Charges: up to `charges` stored, one regained every `recharge` seconds (per rank). */
  | { kind: "charges"; charges: number; recharge: number[]; betweenCasts?: number }
  /** A passive's own cooldown, which Data Dragon never carries: per level band or per rank. */
  | { kind: "passive"; seconds: number[]; scalesWith: "level" | "rank" | "none"; levels?: number[] }
  /** No cooldown at all (a toggle, a stance, a passive with none). */
  | { kind: "none" };

/** A recast or second cast: a window in which the ability can be cast again. */
export interface Recast {
  /** How many more casts after the first. */
  count: number;
  /** The window in seconds, when the source states one. */
  windowSeconds?: number;
  /** What the recast does or needs, in UNIIVERSE's own words. */
  note: string;
}

/** The kinds of fact a curated ability can carry; each shows as a labelled badge. */
export type FactKind = "crowd-control" | "mobility" | "defence" | "sustain" | "damage" | "interaction" | "exception";

/** One checked fact about an ability. */
export interface Fact {
  kind: FactKind;
  /** The badge: a few words ("Stun", "Dash", "Shield", "Unstoppable"). */
  label: string;
  /** One sentence, in UNIIVERSE's own words, when the badge needs it. */
  detail?: string;
  /** The Source.id this rests on. */
  source: string;
}

/** Curated notes for one ability. */
export interface AbilityNotes {
  /**
   * Data Dragon's cooldown array for this ability at the verified version, exactly ([] for the
   * passive). A later Data Dragon array that differs marks these notes "changed-since".
   */
  ddragonCooldown: number[];
  cooldown?: CooldownSpec;
  /** Extra words on the cooldown (a refund, a reset, a static cooldown between casts). */
  cooldownNote?: string;
  recast?: Recast;
  facts: Fact[];
  /** Longer notes for the expandable details, in UNIIVERSE's own words. */
  details?: string[];
}

/** A level at which something notable becomes possible (an ability unlocked, a rank, an ultimate). */
export interface LevelNote {
  level: number;
  text: string;
  source: string;
}

/** Curated champion intelligence: Layer 1's checked notes for one champion. */
export interface ChampionNotes {
  championId: string;
  verified: Verification;
  sources: Source[];
  abilities: Partial<Record<Slot, AbilityNotes>>;
  levelNotes?: LevelNote[];
}

/** A pointer to one ability: "<ChampionId>.<Slot>", e.g. "Renekton.W". */
export type AbilityRef = `${string}.${Slot}`;

/** A briefing line: what to know, and the abilities it rests on. */
export interface BriefingPoint {
  text: string;
  basedOn: AbilityRef[];
}

/** Curated matchup intelligence: Layer 2, for your champion against one enemy (one direction). */
export interface MatchupNotes {
  /** Your champion. */
  championId: string;
  /** The enemy. */
  vsId: string;
  verified: Verification;
  sources: Source[];
  briefing: {
    threat: BriefingPoint;
    opportunity: BriefingPoint;
    lane: BriefingPoint[];
  };
  interactions: Array<{ text: string; abilities: AbilityRef[]; source: string }>;
}

/** How fresh a piece of curated content is against the game's current data. */
export type Freshness =
  /** Checked on the current patch, and Data Dragon's numbers still match. */
  | "current"
  /** Checked on an earlier patch; Data Dragon's numbers for it have not changed since. */
  | "unchanged-since"
  /** Data Dragon's numbers for this ability changed after it was checked: the notes may be out of date. */
  | "changed-since";

/* ---------- What the page hands to the browser (built on the server: src/server/matchup-intel/view.ts) ---------- */

/** A champion in the pickers. */
export interface ChampionChoice {
  id: string;
  name: string;
  title: string;
  /** Portrait URL on ddragon.leagueoflegends.com. */
  portrait: string;
}

/** How one ability's cooldown is shown (src/domain/matchup-intel/cooldown.ts decides it). */
export type CooldownDisplay =
  /** A base cooldown per rank, without ability haste. `starts` is null when no source says. */
  | { kind: "per-rank"; seconds: number[]; starts: CooldownStart | null; from: "curated" | "ddragon" }
  /** Charges. `recharge` is null when only Data Dragon is known (it gives the time between casts, not the recharge). */
  | { kind: "charges"; charges: number; recharge: number[] | null; betweenCasts: number | null; from: "curated" | "ddragon" }
  /** A passive's own cooldown (curated only: Data Dragon has none). */
  | { kind: "passive"; seconds: number[]; scalesWith: "level" | "rank" | "none"; levels: number[] | null }
  /** No cooldown (curated). */
  | { kind: "none" }
  /** Not known from the data held: why, so the page can say it plainly. */
  | { kind: "unknown"; reason: "passive-not-in-ddragon" | "no-number-in-ddragon" | "no-data" };

/** One ability, ready to show. */
export interface AbilityView {
  slot: Slot;
  name: string;
  /** Icon URL on ddragon.leagueoflegends.com, or null when it is not known. */
  icon: string | null;
  maxRank: number;
  cooldown: CooldownDisplay;
  cooldownNote: string | null;
  recast: Recast | null;
  facts: Array<{ kind: FactKind; label: string; detail: string | null; source: { title: string; url: string } }>;
  /** Riot's short description (Data Dragon), markup removed. */
  description: string;
  details: string[];
  /** Null when no curated notes exist for this ability. */
  freshness: Freshness | null;
}

/** One champion's intelligence, ready to show. */
export interface ChampionIntelView {
  champion: ChampionChoice;
  /** The Data Dragon version the abilities come from; null when none are stored yet. */
  dataVersion: string | null;
  /** Null when no ability data is stored for this champion yet. */
  abilities: AbilityView[] | null;
  /** Null when this champion has no curated notes. */
  curated: { verified: Verification; freshness: Freshness } | null;
  levelNotes: Array<{ level: number; text: string; source: { title: string; url: string } }>;
  sources: Source[];
}

/** The matchup's curated layer, ready to show (one direction: your champion against the enemy). */
export interface MatchupIntelView {
  verified: Verification;
  freshness: Freshness;
  briefing: MatchupNotes["briefing"];
  interactions: MatchupNotes["interactions"];
  sources: Source[];
}

/** Everything the page shows for one choice of champions. */
export interface MatchupPageView {
  you: ChampionChoice | null;
  enemy: ChampionChoice | null;
  enemyIntel: ChampionIntelView | null;
  yourIntel: ChampionIntelView | null;
  /** Null when no curated matchup exists for this direction. */
  matchup: MatchupIntelView | null;
  /** The game's current public patch as the app knows it (e.g. "26.22"), and the data's. */
  patch: { current: string | null; data: string | null };
}
