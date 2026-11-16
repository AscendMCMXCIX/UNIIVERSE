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
   * Empty for the passive (Data Dragon has no passive cooldown). Shown as a cooldown only when it
   * passes the guard (ddragonCooldownDisplay in src/domain/matchup-intel/cooldown.ts): not when it
   * is all zeros, the ability lists charges, its slot holds two forms, it has not one number per
   * rank, or the evidence shows it is not the cooldown a player waits for.
   */
  cooldown: number[];
  /**
   * Data Dragon's `maxammo` above 0, else null. Above 0 Data Dragon says the ability holds charges,
   * and `cooldown` is then the wait between casts; the count itself is not reliable alone (Rengar's
   * Q, W and E have 1), so the page never shows it without checked notes.
   */
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

/** What kind of page a source is. */
export type SourceKind =
  /** A League of Legends Wiki ability data page (Template:Data_<Champion>/<Ability>). */
  | "wiki-ability"
  /** A champion's own page on the League of Legends Wiki. */
  | "wiki-champion"
  /** Another League of Legends Wiki page that defines a term or a field (Template:Ability_data, a glossary page). */
  | "wiki-reference"
  /** Riot's Data Dragon files (ddragon.leagueoflegends.com). */
  | "ddragon"
  /** Riot's developer documentation (developer.riotgames.com). */
  | "riot-docs";

/** Where a curated fact comes from. */
export interface Source {
  /** Short id the facts refer to, unique within one champion's or one matchup's notes. */
  id: string;
  title: string;
  /** An https URL on wiki.leagueoflegends.com or developer.riotgames.com / ddragon.leagueoflegends.com. */
  url: string;
  /** What kind of page it is. Optional while the curated files are filled in; then every source gives it. */
  kind?: SourceKind;
  /** The wiki page's revision id when it was read, so a later change can be told apart. */
  revision?: number;
  /**
   * When that revision was saved, as the page's history gives it: an ISO time in UTC
   * ("2026-09-23T19:37:45Z"). Wiki sources only. Optional while the curated files are filled in;
   * then every wiki source gives it.
   */
  revisionTime?: string;
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

/** When a passive's own cooldown starts, as its source states it. */
export type PassiveStart =
  /** When the passive takes effect (Shen's: when he gains the shield). */
  | "on-trigger"
  /** When its effect ends. */
  | "after-effect-ends";

/** A cooldown per rank, in seconds, without ability haste. */
export interface PerRankCooldown {
  kind: "per-rank";
  /**
   * One value per rank. At the top level it repeats Data Dragon's array for the verified version
   * (`ddragonCooldown`); in a form, it is that form's own, as the source gives it.
   */
  seconds: number[];
  /** When it starts, as the source states it; null when the source states none (nothing is assumed). */
  starts: CooldownStart | null;
}

/**
 * Charges: up to `charges` stored, one regained every `recharge` seconds. The wait between two
 * casts is a modifier (`AbilityModifiers.lockout`), as it is for a recast.
 */
export interface ChargesCooldown {
  kind: "charges";
  /** How many can be stored: one number when it is the same at every rank, else one per rank (Teemo's R: 3, 4, 5). */
  charges: number | number[];
  /** Seconds to regain one, without ability haste: one value for every rank, or one per rank. */
  recharge: number[];
}

/** A passive's own cooldown, which Data Dragon never carries: per level band or per rank. */
export interface PassiveCooldown {
  kind: "passive";
  seconds: number[];
  scalesWith: "level" | "rank" | "none";
  /** The levels each value starts at, when it scales with level (one per value). */
  levels?: number[];
  /** Counted for each target separately (Zed's: 10 seconds per champion). */
  perTarget?: true;
  /** Static: ability haste does not shorten it. */
  static?: true;
  /** When it starts, as the source states it. */
  starts?: PassiveStart;
}

/** No cooldown at all (a toggle, a stance, a passive with none). */
export interface NoCooldown {
  kind: "none";
}

/** One form's cooldown, for a champion who transforms. */
export type FormCooldownSpec = PerRankCooldown | ChargesCooldown | NoCooldown;

/**
 * Two or more forms in one slot (Jayce, Nidalee, Elise), each with its own cooldown: Data Dragon
 * gives one array for the slot, which is no form's alone.
 */
export interface FormsCooldown {
  kind: "forms";
  forms: Array<{ name: string; spec: FormCooldownSpec }>;
}

/** A curated description of an ability's cooldown, for what Data Dragon's array cannot say. */
export type CooldownSpec = PerRankCooldown | ChargesCooldown | PassiveCooldown | FormsCooldown | NoCooldown;

/** Part of a cooldown given back, and what gives it back. */
export interface CooldownRefund {
  /** "percent": a share of the cooldown; "seconds": seconds taken off what is left of it. */
  unit: "percent" | "seconds";
  /** How much: one value when it is the same at every rank, else one per rank. */
  amount: number[];
  /** What gives it back, in UNIIVERSE's own words ("her first attack within 4 seconds"). */
  when: string;
}

/**
 * How an ability's cooldown behaves beyond its numbers, each only as its source states it. What
 * does not fit stays in `cooldownNote`, in words.
 */
export interface AbilityModifiers {
  refund?: CooldownRefund;
  /** It resets the basic-attack timer. */
  resetsAttack?: true;
  /** The cooldown itself is static: ability haste does not shorten it (for charges, the recharge). */
  static?: true;
  /** The shortest wait between two casts (a recast, or another charge), in seconds; `static` when ability haste does not shorten it. */
  lockout?: { seconds: number; static?: true };
}

/**
 * Riot's Data Dragon record of an ability as it stood when its notes were checked, beyond the
 * cooldown array (`ddragonCooldown`): the fields DdragonAbility holds that name the ability and its
 * shape. Written out, not hashed, so a reviewer can read it against Riot's file. A later record
 * that differs in any of them marks the notes "changed-since", as a moved array does: a rework that
 * keeps its cooldowns does not read as unchanged.
 */
export interface DdragonIdentity {
  /** The spell id ("RivenTriCleave"); null for the passive, which has none. */
  id: string | null;
  name: string;
  maxRank: number;
  /** Data Dragon's maxammo as the index keeps it: the number of charges above 0, else null. */
  charges: number | null;
}

/** What may have moved in Riot's data for an ability since its notes were checked. */
export type AbilityChange = "cooldown" | "id" | "name" | "ranks" | "charges";

/** A recast or second cast: a window in which the ability can be cast again. */
export interface Recast {
  /** How many more casts after the first. */
  count: number;
  /** The window in seconds, when the source states one. */
  windowSeconds?: number;
  /** What the recast does or needs, in UNIIVERSE's own words. */
  note: string;
}

/**
 * The kinds of fact a curated ability can carry; each shows as a labelled badge. "empowerment" is a
 * strengthening of the champion itself (bonus attack damage, an empowered next attack), which
 * "damage" would misname as damage dealt.
 */
export type FactKind = "crowd-control" | "mobility" | "defence" | "sustain" | "damage" | "empowerment" | "interaction" | "exception";

/** Who has a fact's effect. */
export type FactSubject =
  /** The champion whose ability it is. */
  | "self"
  /** The enemy it hits or targets. */
  | "target"
  /** The champion's allies. */
  | "allies"
  /** Everyone in an area (the enemies an area effect hits, a zone). */
  | "area";

/**
 * The mechanics a fact can be about: a small, fixed vocabulary covering the crowd control,
 * mobility, defences and interactions a lane turns on. A tag names the mechanic involved; who has
 * it is `appliesTo`, and how (it stuns, it is blocked by a spell shield) the fact's own words.
 */
export const FACT_TAGS = [
  // Crowd control.
  "stun",
  "knock-up",
  "knock-back",
  "pull",
  "slow",
  "root",
  "fear",
  "taunt",
  "charm",
  "suppression",
  "silence",
  "ground",
  // Mobility.
  "dash",
  "blink",
  // Defences and sustain.
  "shield",
  "damage-reduction",
  "heal",
  "untargetable",
  "unstoppable",
  "spell-shield",
  "displacement-immune",
  "cc-immune",
  // Interactions.
  "shield-break",
  "interrupt",
  "attack-reset",
  // Damage that matters in a lane.
  "true-damage",
  "max-health-damage",
] as const;
export type FactTag = (typeof FACT_TAGS)[number];

/** One checked fact about an ability. */
export interface Fact {
  kind: FactKind;
  /** The badge: a few words ("Stun", "Dash", "Shield", "Unstoppable"). */
  label: string;
  /** One sentence, in UNIIVERSE's own words, when the badge needs it. */
  detail?: string;
  /**
   * Who has the effect: the champion, the target, allies, or everyone in an area. Optional while
   * the curated files are filled in; then every fact gives it.
   */
  appliesTo?: FactSubject;
  /** The mechanics it is about, from FACT_TAGS (none where no tag fits). */
  tags?: FactTag[];
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
  /**
   * Data Dragon's id, name, ranks and charges for this ability at the verified version, exactly.
   * A later record that differs marks these notes "changed-since". Optional while the curated
   * files are filled in; then every ability gives it.
   */
  ddragonIdentity?: DdragonIdentity;
  cooldown?: CooldownSpec;
  /** Refunds, attack resets, static cooldowns and waits between casts, as the source states them. */
  modifiers?: AbilityModifiers;
  /** Words on the cooldown that the spec and the modifiers cannot hold. */
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
  /** Checked against the data's own version, and Data Dragon's record still matches. */
  | "current"
  /**
   * Checked on another version, and nothing compared has changed since (or the data is older than
   * the check, so a difference is the data's age, not Riot's change): said only as "Checked on patch N".
   */
  | "unchanged-since"
  /** Data Dragon's record for this ability (its cooldown array, id, name, ranks or charges) changed after it was checked: the notes may be out of date. */
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

/** Why no cooldown number is shown for an ability, so the page can say it plainly. */
export type UnknownCooldownReason =
  /** The passive: Data Dragon never gives a passive a cooldown, which is not "none". */
  | "passive-not-in-ddragon"
  /** Data Dragon lists charges (maxammo above 0): its array is then the wait between casts, and neither the recharge nor the count is reliable from it alone. */
  | "charges-in-ddragon"
  /** An empty or all-zero array: a placeholder, not "no cooldown". */
  | "no-number-in-ddragon"
  /** The slot's name holds two forms ("To the Skies! / Shock Blast"), and one array stands for both. */
  | "two-forms-in-ddragon"
  /** The array does not hold one number per rank. */
  | "ranks-mismatch-in-ddragon"
  /** The evidence shows Data Dragon's number is not this ability's cooldown (the exception list in cooldown.ts). */
  | "known-wrong-in-ddragon"
  /** A value that is not a number of seconds. */
  | "unreadable"
  /** No record of the ability is held. */
  | "no-data";

/** How one ability's cooldown is shown (src/domain/matchup-intel/cooldown.ts decides it). */
export type CooldownDisplay =
  /** A base cooldown per rank, without ability haste: checked notes', or Riot's own. `starts` is null when no source says. */
  | { kind: "per-rank"; seconds: number[]; starts: CooldownStart | null; from: "curated" | "ddragon" }
  /** Charges, from checked notes only: the count and the recharge, each one value or one per rank. */
  | { kind: "charges"; charges: number[]; recharge: number[] }
  /** A passive's own cooldown, from checked notes only (Data Dragon has none). */
  | { kind: "passive"; seconds: number[]; scalesWith: "level" | "rank" | "none"; levels: number[] | null; perTarget: boolean; static: boolean; starts: PassiveStart | null }
  /** One cooldown per form, from checked notes only. */
  | { kind: "forms"; forms: Array<{ name: string; cooldown: FormCooldownDisplay }> }
  /** No cooldown, from checked notes. */
  | { kind: "none" }
  /** No number from the data held, and why. */
  | { kind: "unknown"; reason: UnknownCooldownReason };

/** One form's cooldown, as shown. */
export type FormCooldownDisplay = Extract<CooldownDisplay, { kind: "per-rank" | "charges" | "none" }>;

/** A source as a fact or a note links it: its title, its address when it is an allowed one ("" otherwise), and when the page read was saved. */
export interface SourceLinkView {
  title: string;
  url: string;
  revisionTime: string | null;
}

/** One checked fact, ready to show. */
export interface FactView {
  kind: FactKind;
  label: string;
  detail: string | null;
  /** Who has the effect, when the notes say. */
  appliesTo: FactSubject | null;
  tags: FactTag[];
  source: SourceLinkView;
}

/** One ability, ready to show. */
export interface AbilityView {
  slot: Slot;
  name: string;
  /** Icon URL on ddragon.leagueoflegends.com, or null when it is not known. */
  icon: string | null;
  maxRank: number;
  /**
   * The cooldown line as it stands: the checked notes' spec while they still describe Riot's data,
   * otherwise only what Riot's data supports (src/domain/matchup-intel/cooldown.ts).
   */
  cooldown: CooldownDisplay;
  /**
   * The checked notes' cooldown as it was checked, once Riot's data changed after the check: shown
   * with those notes, flagged, never as the current line. Null otherwise.
   */
  checkedCooldown: CooldownDisplay | null;
  /** What moved in Riot's data since the check; empty unless `freshness` is "changed-since". */
  changes: AbilityChange[];
  cooldownNote: string | null;
  modifiers: AbilityModifiers | null;
  recast: Recast | null;
  facts: FactView[];
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
  levelNotes: Array<{ level: number; text: string; source: SourceLinkView }>;
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
