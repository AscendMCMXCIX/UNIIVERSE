import type { HasteBasis } from "./haste";

/*
  MATCHUP INTEL: the types every part of the feature shares (docs/MATCHUP_INTEL.md).

  A player picks their own champion and an enemy, and reads in seconds what the enemy's abilities
  do, their base cooldowns, and what matters in that lane. It is a static reference: base values per
  rank, no timers, nothing read from a game.

  Layers, kept apart so each can improve without the others or the interface changing, each with
  its own label on the page:
  - L1, curated matchup notes: what is specific to champion A against champion B, written in our
    own words from the League of Legends Wiki and approved by the owner (MatchupNotes; the first
    three one-direction pairs were drafted and audited by AI agents).
  - L2, checked champion notes: facts about one champion's abilities from the League of Legends
    Wiki, each with its source and the patch it was checked on (ChampionNotes; the first six
    champions' drafted and audited by AI agents, not by a person).
  - L3, facts from Riot's ability text: the kinds of mechanic (a stun, a dash, a shield, a recast)
    Riot's own description or tooltip names, each with the clause it quotes, reviewed automatically
    (two independent automated reviewers and an adjudicator, then a consistency pass checked by two
    more; not by a person), pinned to the text it was reviewed against (RiotTextChampion). Kinds
    only, never a number.
  - L4, Riot's data: Data Dragon's names, icons, ranks and base cooldown arrays for every champion
    (stored by the version-check job, once per game version), "not reviewed" where nobody has.
  - L5, the assembled reference: for a pair with no curated notes, each champion's own facts from
    L2, else L3, grouped by kind on the page (kit.ts). Code groups and never judges: no threat or
    opportunity is chosen, nothing is ranked, no sentence joins the two kits.

  Only plain data crosses into the browser: these types, never the server modules behind them.
*/

/** The lanes Matchup Intel is set for, in the selector's order. */
export const ROLES = ["top", "jungle", "mid", "adc", "support"] as const;
export type Role = (typeof ROLES)[number];
/** The roles whose page sets two against two (the bot lane). */
export const DUO_ROLES: ReadonlySet<Role> = new Set<Role>(["adc", "support"]);
export const ROLE_NAMES: Record<Role, string> = { top: "Top", jungle: "Jungle", mid: "Mid", adc: "ADC", support: "Support" };

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
  /**
   * A short hash of Riot's whole text for the ability as Data Dragon serves it (its description and,
   * for a spell, its tooltip: riotTextHash in src/server/matchup-intel/abilities.ts), so facts
   * reviewed from that text can tell whether it has changed since. Never the text itself. Absent on
   * a record stored before the rules read it (ABILITY_RULES_FORMAT 1).
   */
  textHash?: string | null;
}

/** One champion's abilities from Data Dragon, at one game version. */
export interface DdragonChampionAbilities {
  championId: string;
  /** The Data Dragon version these were read from (e.g. "16.22.1"). */
  version: string;
  abilities: DdragonAbility[];
  /**
   * Riot's own tips for the champion (Data Dragon `allytips`, for playing it, and `enemytips`, for
   * playing against it), verbatim: [] where Riot publishes none. Absent on a record stored before
   * the rules read them (ABILITY_RULES_FORMAT 2), until the next sync re-reads it: then the page
   * says they are not stored yet, never that Riot publishes none.
   */
  tips?: { ally: string[]; enemy: string[] };
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
  /** What kind of page it is. */
  kind: SourceKind;
  /** The wiki page's revision id when it was read, so a later change can be told apart. Every wiki source gives it; a Riot page has none. */
  revision?: number;
  /**
   * When that revision was saved, as the page's history gives it: an ISO time in UTC
   * ("2026-09-23T19:37:45Z"). Every wiki source gives it (curated.test.ts); a Riot page has none.
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
 * When an ability's cooldown starts, as its source states it: "on-cast" where it says so (the page
 * says nothing more), the others because a bare number would mislead. "after-first-cast" only where
 * the source says so in words (Riven's Q: "Starts after first cast"): on an ability cast again,
 * on-cast alone does not say which cast, and nothing is read into it. Where the source states no
 * start, a per-rank cooldown's `starts` is null.
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
  /**
   * The checked notes leave open whether ability haste shortens it (a page they rest on does not
   * say): the page then shows its base only at any haste, "Whether haste shortens it isn't known"
   * (src/domain/matchup-intel/haste.ts). Set for each ability a note lists among what no saved page
   * states ("whether ability haste shortens …"); curated.test.ts checks every such line has its flag.
   */
  hasteUnknown?: true;
  /**
   * A cooldown between two casts (of a recast, or of another charge), in seconds, where the source
   * states one (Riven's Q: 0.3125 s); `static` when ability haste does not shorten it. A delay
   * before a recast opens ("can be recast after 0.5 seconds") is said in the recast's note instead.
   */
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
  /** Who has the effect: the champion, the target, allies, or everyone in an area. */
  appliesTo: FactSubject;
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
   * Data Dragon's id, name, ranks and charges for this ability at the verified version, exactly
   * (ddragon-<version>.identity.json beside the curated notes). A later record that differs marks
   * these notes "changed-since".
   */
  ddragonIdentity: DdragonIdentity;
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
  /**
   * The abilities of this champion the note rests on, by slot (Obliterate's damage from level 10:
   * ["Q"]). Once Riot changes one after the check, the note is flagged, as that ability's notes are.
   */
  basedOn: Slot[];
}

/** Curated champion intelligence: Layer 1's checked notes for one champion. */
export interface ChampionNotes {
  championId: string;
  verified: Verification;
  sources: Source[];
  abilities: Partial<Record<Slot, AbilityNotes>>;
  levelNotes?: LevelNote[];
}

/* ---------- L3: facts from Riot's ability text, reviewed automatically ---------- */

/**
 * The kinds of mechanic a fact from Riot's ability text may name (docs/MATCHUP_INTEL.md, "Facts from
 * Riot's text"). A kind only: Riot's text names the mechanic; how long, how far or how much is never
 * taken from it (its numbers are placeholders).
 */
export const RIOT_TEXT_KINDS = [
  // Crowd control.
  "stun",
  "knockup",
  "knockback",
  "pull",
  "root",
  "slow",
  "silence",
  "fear",
  "flee",
  "charm",
  "taunt",
  "suppression",
  "ground",
  "polymorph",
  "sleep",
  "blind",
  "disarm",
  "nearsight",
  "drowsy",
  // Mobility.
  "dash",
  "blink",
  "leap",
  "teleport",
  // Defence.
  "unstoppable",
  "shield",
  "untargetable",
  "invulnerable",
  "stasis",
  "spellshield",
  "damagereduction",
  "tenacity",
  "cleanse",
  "stealth",
  "parry",
  // Sustain.
  "heal",
  "lifesteal",
  "omnivamp",
  "regeneration",
  // How the cooldown behaves.
  "recast",
  "charges",
  "cooldownrefund",
  "reset",
  "toggle",
  // Power.
  "empower",
  "transform",
] as const;
export type RiotTextKind = (typeof RIOT_TEXT_KINDS)[number];

/**
 * The groups every fact is sorted into on the page, in the order they show: crowd control first,
 * then what strengthens the champion (burst), mobility, defence, sustain, and how a cooldown
 * behaves. The same order on both sides, so the two kits read alike.
 */
export const KIND_GROUPS = ["crowd-control", "power", "mobility", "defence", "sustain", "cooldown"] as const;
export type KindGroup = (typeof KIND_GROUPS)[number];

/** The group of each kind from Riot's text. */
export const RIOT_TEXT_KIND_GROUP: Record<RiotTextKind, KindGroup> = {
  stun: "crowd-control",
  knockup: "crowd-control",
  knockback: "crowd-control",
  pull: "crowd-control",
  root: "crowd-control",
  slow: "crowd-control",
  silence: "crowd-control",
  fear: "crowd-control",
  flee: "crowd-control",
  charm: "crowd-control",
  taunt: "crowd-control",
  suppression: "crowd-control",
  ground: "crowd-control",
  polymorph: "crowd-control",
  sleep: "crowd-control",
  blind: "crowd-control",
  disarm: "crowd-control",
  nearsight: "crowd-control",
  drowsy: "crowd-control",
  dash: "mobility",
  blink: "mobility",
  leap: "mobility",
  teleport: "mobility",
  unstoppable: "defence",
  shield: "defence",
  untargetable: "defence",
  invulnerable: "defence",
  stasis: "defence",
  spellshield: "defence",
  damagereduction: "defence",
  tenacity: "defence",
  cleanse: "defence",
  stealth: "defence",
  parry: "defence",
  heal: "sustain",
  lifesteal: "sustain",
  omnivamp: "sustain",
  regeneration: "sustain",
  recast: "cooldown",
  charges: "cooldown",
  cooldownrefund: "cooldown",
  reset: "cooldown",
  toggle: "cooldown",
  empower: "power",
  transform: "power",
};

/** The group of each kind of checked fact (L2); interactions and exceptions are no group's: they show as interactions. */
export const FACT_KIND_GROUP: Record<FactKind, KindGroup | null> = {
  "crowd-control": "crowd-control",
  damage: "power",
  empowerment: "power",
  mobility: "mobility",
  defence: "defence",
  sustain: "sustain",
  interaction: null,
  exception: null,
};

/** Which of Riot's two texts for an ability a fact quotes: the short description, or the tooltip. */
export type RiotTextSource = "description" | "tooltip";

/**
 * One fact from Riot's text: the kind it names and the clause of Riot's text it rests on, quoted,
 * with what the review recorded beside it. Every span is Riot's own words, verbatim; each of Riot's
 * placeholders appears as "[…]", never a number (the import script, shownClause).
 */
export interface RiotTextFact {
  slot: Slot;
  kind: RiotTextKind;
  /** The clause of Riot's text, as quoted ("Darius hooks with his axe, Pulling, and Knocking Up"). */
  clause: string;
  source: RiotTextSource;
  /**
   * Riot's words for what the clause leaves out and the fact holds only with: a form, an upgrade, a
   * condition or a recipient ("Mega Gnar", "Max Ferocity", "nearby ally champions"). On a cooldown
   * refund, the abilities whose cooldown it cuts ("Mantra", "his other basic abilities"); a cooldown
   * refund without one refunds the ability's own cooldown. Shown with the fact, never apart from it.
   */
  qualifier?: string;
  /** Present only when the qualifier is quoted from the ability's other text (otherwise it is the fact's own `source`). */
  qualifierSource?: RiotTextSource;
  /**
   * The fact holds only under a condition that no number-free words of Riot's text name: shown with
   * the fixed marker "Conditional: see Riot's text", the quote one tap away; never a condition in
   * the page's own words.
   */
  conditional?: true;
  /**
   * Riot's other text words the same effect as another kind of the same family (one movement, a fear
   * and a flee): said in the ability's details ("Riot's description calls it leap"), never a chip of
   * its own and never counted.
   */
  alsoDescribedAs?: { kind: RiotTextKind; source: RiotTextSource; clause: string };
}

/**
 * Riot's two texts for one ability state different effects (its description a knock-up, its tooltip
 * a knock-back): no fact of either kind exists there, and the page shows both quotes and picks
 * neither.
 */
export interface RiotTextDisagreement {
  slot: Slot;
  description: { kind: RiotTextKind; clause: string };
  tooltip: { kind: RiotTextKind; clause: string };
}

/**
 * How a champion's facts from Riot's text were reviewed: the reviewed table's reviewRecord, read by
 * the import script, never assumed. The review itself wrote one sentence ("two independent automated
 * reviews and an adjudicator, then a consistency pass checked by two more; not checked by a person");
 * the record was added to every file and to the index for the import, from that sentence, stating it
 * as data, and nothing else in the table changed with it. Today: the drafts (made by fixed rules from
 * Riot's text) read by two independent automated reviewers and settled by an adjudicator, with the
 * reviewers' own additions; then a consistency pass across the batches, which also added, removed and
 * changed facts, checked by two more independent automated checkers; no person has checked any of it
 * (`checkedByPerson` false). So not every fact was a draft of the fixed rules, and the page never says
 * each was. A person's check would change the label, which is the owner's decision
 * (docs/MATCHUP_INTEL.md, "Facts from Riot's text").
 */
export interface RiotTextReview {
  /** Independent automated reviewers that read every draft (and adjudicated each other's additions). */
  automatedReviewers: number;
  /** An automated adjudicator settled every batch, where the reviewers split. */
  adjudicated: boolean;
  /** Independent automated checkers that checked the consistency pass across the batches (0 when there was none). */
  consistencyCheckers: number;
  /** A person checked the facts. False in every committed file: the label says "not by a person". */
  checkedByPerson: boolean;
}

/**
 * One champion's reviewed facts from Riot's text (src/server/matchup-intel/riot-text/<Id>.json,
 * written by scripts/matchup-intel/import-riot-text.mjs). Each ability's facts are pinned to Riot's
 * text as it was reviewed (`abilities[slot].textHash`, riotTextHash): once Riot's text for it
 * changes, its facts are hidden and the page says so, as checked notes are flagged.
 */
export interface RiotTextChampion {
  championId: string;
  /** The Data Dragon version whose text was reviewed ("16.22.1"). */
  version: string;
  /** The day the review finished, ISO ("2026-11-18"). */
  reviewedOn: string;
  review: RiotTextReview;
  /** Each ability as reviewed: its name and the hash of its text. */
  abilities: Partial<Record<Slot, { name: string; textHash: string }>>;
  facts: RiotTextFact[];
  disagreements: RiotTextDisagreement[];
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
  /**
   * The slot's name holds two abilities ("To the Skies! / Shock Blast", "Cunning Sweep / Sundering
   * Slam"), and one array stands for both: two forms of a champion who transforms, or the two parts
   * of an ability cast again, which Data Dragon does not tell apart.
   */
  | "two-abilities-in-ddragon"
  /** The array does not hold one number per rank. */
  | "ranks-mismatch-in-ddragon"
  /** The evidence shows Data Dragon's number is not this ability's cooldown (the exception list in cooldown.ts). */
  | "known-wrong-in-ddragon"
  /**
   * One slot for several abilities, which Riot's own description lists (Aphelios's Q: one ability
   * for each of his five weapons), so its one array is no single ability's (the exception list).
   */
  | "several-abilities-in-ddragon"
  /** The slot casts spells picked up in a game (Zoe's W, by Riot's own tooltip), so its array is not their cooldown (the exception list). */
  | "picked-up-spell-in-ddragon"
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
  /** How the cooldown line behaves at a chosen ability haste (src/domain/matchup-intel/haste.ts). */
  haste: HasteBasis;
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
  /**
   * The facts from Riot's text for this ability (L3), shown only for a champion with no checked
   * notes; null when the champion has no reviewed facts, or has checked notes.
   */
  riotText: RiotTextAbilityView | null;
}

/** One fact from Riot's text, ready to show (RiotTextFact without its slot). */
export type RiotTextFactView = Omit<RiotTextFact, "slot">;

/** Where Riot's two texts for an ability differ, ready to show (RiotTextDisagreement without its slot). */
export type RiotTextDisagreementView = Omit<RiotTextDisagreement, "slot">;

/**
 * An ability's facts from Riot's text as the page shows them: those whose text still matches what
 * was reviewed, or, when it does not, how many are hidden and why (never left out silently).
 */
export interface RiotTextAbilityView {
  facts: RiotTextFactView[];
  /** Where Riot's two texts for it differ (shown as that, with both quotes, never as a fact). */
  disagreements: RiotTextDisagreementView[];
  /** How many reviewed facts are hidden (0 when none). */
  hidden: number;
  /** How many of its recorded disagreements are hidden with them (0 when none). */
  hiddenDisagreements: number;
  /**
   * Why they are hidden: Riot's text changed since the review ("changed"), the ability's name is no
   * longer the one reviewed ("renamed"), or the stored record cannot say whether its text changed
   * ("unknown": stored before the rules kept the text's hash, on another version than the review).
   * Null when nothing is hidden.
   */
  hiddenBecause: "changed" | "renamed" | "unknown" | null;
}

/**
 * How far the game has moved past a check, by patch (docs/MATCHUP_INTEL.md, "Freshness"): the
 * newest patch the page knows of (the data's, or the game's current one) is later than the patch
 * the notes were checked on, and nobody has checked them again since.
 */
export interface Recheck {
  /** That newest patch, by its public name ("26.23"). */
  patch: string;
  /** How many patches have come since the check: 1 or more. */
  patches: number;
  /**
   * More than MAX_PATCHES_UNCHECKED (src/server/matchup-intel/view.ts): a briefing is hidden, and
   * champion notes are flagged, until a person checks them again.
   */
  expired: boolean;
}

/** One champion's intelligence, ready to show. */
export interface ChampionIntelView {
  champion: ChampionChoice;
  /** The Data Dragon version the abilities come from; null when none are stored yet. */
  dataVersion: string | null;
  /**
   * The abilities are the committed offline copy of Riot's data (stored when Riot's servers could not
   * be reached on a first start), not a copy the game-data job read from Data Dragon.
   */
  offlineCopy: boolean;
  /** Null when no ability data is stored for this champion yet, or what is stored cannot be read (abilitiesUnreadable). */
  abilities: AbilityView[] | null;
  /** A record is stored for this champion but is not in the shape the page reads, so it is not shown. */
  abilitiesUnreadable: boolean;
  /** Null when this champion has no curated notes. */
  curated: { verified: Verification; freshness: Freshness; recheck: Recheck | null } | null;
  /** `changed`: Riot changed an ability the note rests on after the check, so it is flagged. */
  levelNotes: Array<{ level: number; text: string; source: SourceLinkView; changed: boolean }>;
  sources: Source[];
  /**
   * This champion's reviewed facts from Riot's text (L3): when and how they were reviewed. Null when
   * none are committed for it, or it has checked notes (which the page shows instead).
   */
  riotText: { version: string; patch: string | null; reviewedOn: string; review: RiotTextReview } | null;
  /**
   * Riot's own tips from Data Dragon, verbatim (`ally` for playing it, `enemy` for playing against
   * it; [] where Riot publishes none). Null when the stored record predates them (not read yet).
   */
  tips: { ally: string[]; enemy: string[] } | null;
}

/**
 * A briefing point as the page shows it: its text, or, when Riot changed an ability it rests on
 * after the briefing was checked, which abilities changed, in its place. Never left out silently.
 */
export type BriefingPointView = { kind: "point"; text: string; basedOn: AbilityRef[] } | { kind: "hidden"; changed: AbilityRef[] };

/** One of the matchup's interactions as the page shows it: hidden, as a briefing point is, once an ability it rests on changed. */
export type InteractionView = { kind: "interaction"; text: string; abilities: AbilityRef[]; source: string } | { kind: "hidden"; changed: AbilityRef[] };

/** The matchup's curated layer, ready to show (one direction: your champion against the enemy). */
export interface MatchupIntelView {
  verified: Verification;
  /** How fresh what it shows is: the hidden points and interactions are not counted. */
  freshness: Freshness;
  /** How far the game has moved past its check; null when it has not, or nothing newer is known. */
  recheck: Recheck | null;
  /**
   * Null once its check is more than MAX_PATCHES_UNCHECKED patches old (recheck.expired): the
   * briefing's words stay on the server, and the page says why it is hidden.
   */
  briefing: { threat: BriefingPointView; opportunity: BriefingPointView; lane: BriefingPointView[] } | null;
  /** [] once its check is too old (recheck.expired); `expiredInteractions` then says how many that hid. */
  interactions: InteractionView[];
  /** How many interactions are hidden because the check is too old (0 otherwise). */
  expiredInteractions: number;
  sources: Source[];
}

/** Everything the page shows for one choice of champions. */
export interface MatchupPageView {
  /** The lane the page is set for (the address's `role`), which decides its slots (ROLE_SLOTS). */
  role: Role;
  /** Yours: in the bot lane your own role's champion (the ADC as ADC, the support as Support). */
  you: ChampionChoice | null;
  /** The lane opponent: in the bot lane the enemy in your own role. */
  enemy: ChampionChoice | null;
  /** The bot lane only: your duo partner (the support as ADC, the ADC as Support); null otherwise. */
  ally: ChampionChoice | null;
  /** The bot lane only: the other enemy (their support as ADC, their ADC as Support); null otherwise. */
  enemy2: ChampionChoice | null;
  enemyIntel: ChampionIntelView | null;
  yourIntel: ChampionIntelView | null;
  allyIntel: ChampionIntelView | null;
  enemy2Intel: ChampionIntelView | null;
  /** Null when no curated matchup exists for this direction. */
  matchup: MatchupIntelView | null;
  /**
   * The game's current public patch as the app knows it (e.g. "26.22"; null while the game data is
   * the offline fixture), and the data's: the enemy's, else your champion's. Each champion's own is
   * its intel's `dataVersion`, which the page uses for that champion's labels and stale notice.
   */
  patch: { current: string | null; data: string | null };
}
