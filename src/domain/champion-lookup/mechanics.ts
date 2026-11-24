import type { Slot } from "./types";

/*
  CHAMPION INTEL's mechanics from Riot's own words (docs/CHAMPION_INTEL.md, "Key mechanics"): which
  kinds of mechanic (a stun, a dash, a shield, a heal, magic damage…) each ability's short
  description in Riot's Data Dragon names, found by fixed, reviewed word rules, each with the
  sentence of Riot's description that carries it and where in that text the words stand, so the
  page shows the claim with Riot's own words beside it and can mark them in the description.

  What it is not: a reading of the ability's numbers (none are taken from anywhere), a duration, a
  judgement of strength, or advice. A kind is named only where Riot's description uses its words;
  where the description does not, nothing is said, which the page words as "not in Riot's
  descriptions", never "none". Riot's tooltips are not read (their numbers are placeholders Data
  Dragon leaves unfilled), and nothing is inferred from an ability's name or from another champion.

  The rules are word patterns with the few exceptions the whole roster showed (Data Dragon 16.22.1,
  173 champions, 865 descriptions; mechanics.test.ts holds every one of them to the rules' counts
  and to a reviewed list of hard cases): a word that names an effect someone is freed from or immune
  to ("immune to slows", "removing all crowd control effects") is not that effect; "pulls back her
  orb" pulls no one; "charges" can be a run forward, so charges come from Riot's data
  (`maxammo`, the cooldown guard), never from the words; healing someone loses ("reduced healing",
  "Grievous Wounds") is not a heal.
*/

export type MechanicGroup = "crowd-control" | "mobility" | "defence" | "sustain" | "damage" | "casting";

export const MECHANIC_GROUPS: readonly MechanicGroup[] = ["crowd-control", "mobility", "damage", "sustain", "defence", "casting"];

/** Each group's heading as the page writes it. */
export const MECHANIC_GROUP_WORDS: Record<MechanicGroup, string> = {
  "crowd-control": "Crowd control",
  mobility: "Mobility",
  damage: "Damage",
  sustain: "Sustain",
  defence: "Defence",
  casting: "Casting",
};

interface Rule {
  kind: string;
  /** The kind's word on the page ("Knock up"). */
  word: string;
  group: MechanicGroup;
  /** Riot's words for it: matched case-insensitively at word boundaries. */
  pattern: RegExp;
  /** The sentence's text before the match: when it ends this way the words are not this effect. */
  notAfter?: RegExp;
  /** The sentence's text after the match: when it starts this way the words are not this effect. */
  notBefore?: RegExp;
  /**
   * Crowd control: not aimed at the champion itself ("roots herself", "knocks Caitlyn back"), and a
   * participle after an article or "enemy" ("a stunned enemy", "an enemy rooted") describes a state
   * another effect caused, not this ability's own.
   */
  cc?: boolean;
}

/** Freed from, immune to or the trigger of it: "immune to all slowing effects", "removing all crowd control effects", "charges his roar by stunning". */
const FREED = /(?:\b(?:immune to|immunity to|ignor\w*|remov\w*|cleans\w*|cur(?:e|es|ing)|break\w* free of|free\w* from|resists?|resisting|interrupt\w*|stop\w*|by)\s+(?:all\s+|any\s+|the\s+|its\s+|their\s+|first\s+)*(?:[\w-]+\s+){0,1}|\b(?:allies'|allied)\s+)$/i;
/** Only minions or monsters: "fearing nearby enemy minions" is not crowd control a champion meets. */
const ONLY_MINIONS = /^\s+(?:nearby\s+|enemy\s+|all\s+)*(?:minions|monsters)\b/i;
/** Damage someone takes less of ("reducing incoming physical and magical damage", "takes reduced physical damage") is not damage dealt. */
const DAMAGE_TAKEN = /\b(?:reduc\w*|incoming|lowers?|less)\s+(?:[\w-]+\s+){0,3}$/i;
/** Healing someone loses ("reduced healing", "Grievous Wounds") is not a heal. */
const HEAL_LOST = /\b(?:reduc\w*|less|grievous wounds?|cuts?|lowers?|lacks?|lacking)\s+(?:(?:their|the|its|his|her|self|innate|all)\s+)*$/i;
/** The words a description uses for a cleanse, which is never the crowd control it removes. */
const CC = { notAfter: FREED, notBefore: ONLY_MINIONS, cc: true } as const;

/**
 * The rules, in the order the page lists kinds within a group. Each pattern takes the words Riot's
 * descriptions use at Data Dragon 16.22.1 for that effect (mechanics.test.ts counts every match).
 */
export const MECHANIC_RULES: readonly Rule[] = [
  // Crowd control.
  { kind: "stun", word: "Stun", group: "crowd-control", pattern: /\bstun(?:s|ned|ning)?\b/gi, ...CC },
  { kind: "root", word: "Root", group: "crowd-control", pattern: /\b(?:root(?:s|ed|ing)?|snar(?:e|es|ed|ing))\b/gi, ...CC },
  { kind: "knockup", word: "Knock up", group: "crowd-control", pattern: /\b(?:knock(?:s|ed|ing)?\s+(?:[\w-]+\s+){0,3}?(?:up|airborne|into the air)|airborne|fling(?:s|ing)?\s+(?:[\w-]+\s+){0,3}?into the air)\b/gi, ...CC },
  { kind: "knockback", word: "Knock back", group: "crowd-control", pattern: /\b(?:knock(?:s|ed|ing)?\s+(?:[\w-]+\s+){0,3}?(?:back|aside|away)|knockback|push(?:es|ed|ing)?\s+(?:[\w-]+\s+){0,3}?(?:back|away))\b/gi, ...CC },
  { kind: "pull", word: "Pull", group: "crowd-control", pattern: /\b(?:pull(?:s|ed|ing)?|drag(?:s|ged|ging)?|yank(?:s|ed|ing)?|draw(?:s|ing)?)\s+(?:in\s+)?(?:(?:the|an?|their|all|nearby|first|any|rooted)\s+)*(?:enem\w+|target\w*|foes?|champions?|them|him|her|units?)\b/gi, ...CC },
  { kind: "slow", word: "Slow", group: "crowd-control", pattern: /\bslow(?:s|ed|ing)?\b/gi, ...CC },
  { kind: "silence", word: "Silence", group: "crowd-control", pattern: /\bsilenc(?:e|es|ed|ing)\b/gi, ...CC },
  { kind: "fear", word: "Fear", group: "crowd-control", pattern: /\b(?:fear(?:s|ed|ing)?|terrif(?:y|ies|ied|ying)|flee(?:s|ing)?)\b/gi, ...CC },
  { kind: "charm", word: "Charm", group: "crowd-control", pattern: /\bcharm(?:s|ed|ing)?\b/gi, ...CC },
  { kind: "taunt", word: "Taunt", group: "crowd-control", pattern: /\btaunt(?:s|ed|ing)?\b/gi, ...CC },
  { kind: "suppression", word: "Suppression", group: "crowd-control", pattern: /\bsuppress(?:es|ed|ing|ion)?\b/gi, ...CC },
  { kind: "ground", word: "Ground", group: "crowd-control", pattern: /\bground(?:s|ed|ing)\b/gi, ...CC },
  { kind: "polymorph", word: "Polymorph", group: "crowd-control", pattern: /\bpolymorph\w*\b/gi, ...CC },
  { kind: "sleep", word: "Sleep", group: "crowd-control", pattern: /\b(?:asleep|sleep|drows\w+)\b/gi, ...CC },
  { kind: "blind", word: "Blind", group: "crowd-control", pattern: /\bblind(?:s|ed|ing)?\b/gi, ...CC, notBefore: /^\s*speed\b/i },
  { kind: "disarm", word: "Disarm", group: "crowd-control", pattern: /\bdisarm(?:s|ed|ing)?\b/gi, ...CC },
  // Mobility.
  { kind: "dash", word: "Dash", group: "mobility", pattern: /\b(?:dash(?:es|ed|ing)?|lunge(?:s|d)?|lunging|tumbl(?:es|ed|ing)|charg(?:es|ing|ed)\s+(?:forward|toward\w*|in a direction|at|to (?:a|an|the) (?:location|position|target|enemy|ally))|slices toward|flies (?:a short distance|over)|pull(?:s|ing)? (?:himself|herself|itself)|hops?|hopping)\b/gi, notAfter: /\b(?:a|enem(?:y|ies)|interrupt\w*|stop\w*|block\w*)\s+$/i },
  { kind: "leap", word: "Leap", group: "mobility", pattern: /\b(?:leap(?:s|t|ed|ing)?|jump(?:s|ed|ing)?|vault(?:s|ed|ing)?|launch(?:es|ed|ing)? (?:himself|herself|itself|themselves))\b/gi, notAfter: /\b(?:enem(?:y|ies))\s+$/i },
  { kind: "blink", word: "Blink", group: "mobility", pattern: /\b(?:blink(?:s|ed|ing)?|teleport(?:s|ed|ing)?)\b/gi, notAfter: /\b(?:enem(?:y|ies))\s+$/i },
  { kind: "speed", word: "Move speed", group: "mobility", pattern: /\b(?:gain(?:s|ing)?|grant(?:s|ing)?|bonus|increas\w*|boost\w*|surge of|burst of)\s+(?:[\w-]+\s+){0,4}?(?:move(?:ment)?\s+speed)\b/gi, notAfter: /\b(?:of|with)\s+(?:(?:his|her|its|their)\s+)?$/i },
  // Damage, by the type Riot names.
  { kind: "physical", word: "Physical", group: "damage", pattern: /\bphysical damage\b/gi, notAfter: DAMAGE_TAKEN },
  { kind: "magic", word: "Magic", group: "damage", pattern: /\bmagic(?:al)? damage\b/gi, notAfter: DAMAGE_TAKEN },
  { kind: "true", word: "True", group: "damage", pattern: /\btrue damage\b/gi, notAfter: DAMAGE_TAKEN },
  // Sustain.
  { kind: "heal", word: "Heal", group: "sustain", pattern: /\b(?:heal(?:s|ed|ing)?|(?:restor|recover|regain|receiv)(?:e|es|ed|ing|s)?\s+(?:[\w-]+\s+){0,3}?health|regenerat\w+\s+(?:[\w-]+\s+){0,5}?health|health regeneration)\b/gi, notAfter: HEAL_LOST, notBefore: /^\s*(?:reduction|(?:&|and)\s+shield\s+power|power)\b/i },
  { kind: "lifesteal", word: "Life steal", group: "sustain", pattern: /\b(?:life ?steal|omnivamp|physical vamp\w*|spell vamp|drain(?:s|ed|ing)?\s+(?:[\w-]+\s+){0,2}?health)\b/gi },
  // Defence.
  { kind: "shield", word: "Shield", group: "defence", pattern: /\bshield(?:s|ed|ing)?\b/gi, notAfter: /\b(?:his|her|its|their|enem\w+'?|remov\w*|destroy\w*|destroying damage|break\w*|bonus damage to|spell|heal\s+&)\s+$/i, notBefore: /^\s*power\b/i },
  { kind: "spellshield", word: "Spell shield", group: "defence", pattern: /\bspell ?shield\w*\b/gi },
  { kind: "untargetable", word: "Untargetable", group: "defence", pattern: /\buntargetab\w+\b/gi },
  { kind: "invulnerable", word: "Invulnerable", group: "defence", pattern: /\b(?:invulnerab\w+|cannot (?:die|be killed)|stasis)\b/gi },
  { kind: "damagereduction", word: "Damage reduction", group: "defence", pattern: /\b(?:tak(?:e|es|ing)\s+(?:[\w-]+\s+){0,4}?reduced\s+(?:[\w-]+\s+){0,1}?damage|reduc\w*\s+(?:[\w-]+\s+){0,3}?damage\s+(?:taken|received|[\w.']+\s+would take)|reduc\w* the damage of|reducing incoming\s+(?:[\w-]+\s+){0,4}?damage|damage reduction)\b/gi },
  { kind: "unstoppable", word: "Crowd control immunity", group: "defence", pattern: /\b(?:unstoppable|immune to (?:all )?(?:crowd control|disables|slowing effects|slows))\b/gi },
  { kind: "cleanse", word: "Cleanse", group: "defence", pattern: /\b(?:cur(?:e|es|ing)\s+(?:all\s+)?crowd control|break(?:s|ing)? free of (?:all\s+)?\w+|remov(?:e|es|ing)\s+(?:all\s+)?crowd control|cleans\w+)\b/gi },
  { kind: "stealth", word: "Stealth", group: "defence", pattern: /\b(?:invisib\w+|camouflag\w*|stealth\w*)\b/gi, notAfter: /(?:\bnot|\bnon-|\breveal\w*\s+(?:[\w-]+\s+){0,2}|\bif they are not)\s*$/i },
  // How it is cast.
  { kind: "recast", word: "Recast", group: "casting", pattern: /\b(?:recast\w*|re-cast\w*|cast (?:it )?again|second cast|reactivat\w+)\b/gi, notAfter: /\bcannot be\s+$/i },
  { kind: "reset", word: "Cooldown reset", group: "casting", pattern: /\b(?:(?:reset|refund|refresh|reduc|lower)\w*\s+(?:[\w.']+\s+){0,8}?cooldowns?|cooldowns?\s+(?:on\s+[\w']+(?:\s+[\w']+)?\s+)?(?:is\s+|are\s+)?(?:\w+ly\s+)?(?:reset|refunded|refreshed|reduced|refreshes|resets)|shorter cooldown)\b/gi },
  { kind: "toggle", word: "Toggle", group: "casting", pattern: /\btoggl\w+\b/gi },
  { kind: "transform", word: "Form swap", group: "casting", pattern: /\b(?:transform\w*\s+(?:[\w-]+\s+){0,3}?into|transformed abilities|morph\w*\s+into|swap(?:s|ping)?\s+(?:weapons|between|his main-hand|her main-hand)|reverts? to|(?:unleash\w*|enter\w*|assum\w*)\s+(?:his|her|its|a|an)\s+[\w-]+\s+(?:form|state)|spirit form|dismount\w*|burrow(?:s|ed|ing)? into|replaces [\w']+ abilities)\b/gi },
];

/**
 * Matches the rules make that Riot's sentence shows are not the effect, by champion, slot and kind,
 * each pinned to the hash of Riot's text it was judged on (the stored textHash): once Riot's text
 * changes, the rules judge it again. Each with why.
 */
export const NOT_THE_MECHANIC: ReadonlyMap<string, { textHash: string; why: string }> = new Map([
  ["Khazix|Q|fear", { textHash: "4b84a03c00c33c76", why: "\"Taste Their Fear\" is the name of Kha'Zix's passive, not a fear." }],
  ["Zyra|P|root", { textHash: "c9428b8ea6d779b7", why: "\"Grasping Roots\" names Zyra's E; the passive does not root." }],
  ["Zyra|W|root", { textHash: "d285fad1ba2aef76", why: "\"Grasping Roots\" names Zyra's E; Rampant Growth does not root." }],
  ["Lucian|P|heal", { textHash: "6b435c7024d03b0c", why: "\"When Lucian is healed or shielded by an ally\" is the passive's trigger, not a heal." }],
  ["Lucian|P|shield", { textHash: "6b435c7024d03b0c", why: "\"When Lucian is healed or shielded by an ally\" is the passive's trigger, not a shield." }],
  ["Kalista|R|dash", { textHash: "e36b5c362ae9b3c8", why: "The dash is the Oathsworn ally's, not Kalista's." }],
  ["Kalista|R|blink", { textHash: "e36b5c362ae9b3c8", why: "\"Kalista teleports the Oathsworn ally to herself\": the ally moves, not Kalista." }],
  ["Zilean|R|blink", { textHash: "a3d2e4f44f14b71c", why: "\"teleporting the champion back in time\" revives the ally; it is no movement of Zilean's." }],
  ["Thresh|W|dash", { textHash: "7d48aa5fcfba4f06", why: "\"Allies can click the lantern to dash to Thresh\": the allies move, not Thresh." }],
  ["Naafiri|Q|leap", { textHash: "4538350c60459ba3", why: "\"Packmates leap\": Naafiri's packmates, not Naafiri." }],
  ["Lulu|E|leap", { textHash: "19db8608706a406b", why: "\"commands Pix to jump to an ally\": Pix moves, not Lulu." }],
  ["Rell|W|slow", { textHash: "5c913b7fc59ad409", why: "\"but is Slowed\": Rell slows herself while dismounted." }],
  ["Jhin|E|stealth", { textHash: "e2a2ac1aadf01cd3", why: "\"an invisible lotus trap\": the trap is unseen, not Jhin." }],
  ["Jhin|R|transform", { textHash: "6e51781f05ea786e", why: "\"transforming Whisper into a mega-cannon\": his gun, not a form of Jhin's." }],
  ["Ashe|Q|transform", { textHash: "1006b2c306c6e06f", why: "\"transforming her basic attack into a flurry\": an empowered attack, not a form." }],
  ["Blitzcrank|W|slow", { textHash: "c670f9eeb1c96cc9", why: "\"They are temporarily slowed after the effect ends\": Overdrive slows Blitzcrank himself." }],
  ["Zed|W|dash", { textHash: "2f9816f21f2ee7b9", why: "\"Zed's shadow dashes forward\": the shadow moves, not Zed." }],
  ["Graves|P|knockback", { textHash: "24cbc5c4987771d1", why: "\"Non-champions struck by multiple bullets are knocked back\": never a champion." }],
  ["Sion|E|knockback", { textHash: "745d18f6873668f7", why: "\"If the shockwave hits a minion or monster, it will be knocked back\": never a champion." }],
  ["Naafiri|E|heal", { textHash: "9112dfc07520d0c3", why: "\"fully healing them\": her packmates, not Naafiri or her allies." }],
  ["Nilah|P|heal", { textHash: "48631794adc797e8", why: "\"share nearby healing and shielding from her allies\": her allies' heals, not her own." }],
  ["Nilah|P|shield", { textHash: "48631794adc797e8", why: "\"share nearby healing and shielding from her allies\": her allies' shields, not her own." }],
  ["Darius|E|physical", { textHash: "657d8ee151edab75", why: "\"causing his physical damage to ignore a percentage of his target's Armor\": armour penetration; Apprehend's own damage type is not named." }],
]);

/** One kind an ability's description names, with Riot's sentence that carries it and the words matched. */
export interface MechanicFact {
  slot: Slot;
  kind: string;
  word: string;
  group: MechanicGroup;
  /** The sentence of Riot's description that names it, as Riot wrote it. */
  clause: string;
  /** Where the matched words stand in the whole description (start inclusive, end exclusive). */
  at: [number, number];
}

/** The sentences of a description, each with where it starts: a sentence ends at ".", "!" or "?" followed by a space or the end. */
function sentences(text: string): Array<{ text: string; start: number }> {
  const out: Array<{ text: string; start: number }> = [];
  const re = /[.!?]+(?:\s+|$)/g;
  let from = 0;
  let m: RegExpExecArray | null;
  const push = (to: number) => {
    const raw = text.slice(from, to);
    const lead = raw.length - raw.trimStart().length;
    const body = raw.trim();
    if (body) out.push({ text: body, start: from + lead });
  };
  while ((m = re.exec(text)) !== null) {
    if (m[0] === "") break;
    push(m.index + m[0].trimEnd().length);
    from = m.index + m[0].length;
  }
  if (from < text.length) push(text.length);
  return out;
}

/** The longest description read, in characters (the stored description is at most DESCRIPTION_MAX). */
const MAX_TEXT = 4_000;
const SELF = /^\s*(?:himself|herself|itself|themselves)\b/i;
const STATE = /(?:\b(?:a|an|the|enem(?:y|ies)|non-)\s*|\b(?:if|when|whenever)\s+(?:[\w-]+\s+){0,3})$/i;

/** One ability as the rules read it: its slot, Riot's cleaned description and the hash of Riot's text (what an exception is pinned to). */
export interface MechanicInput {
  slot: Slot;
  description: unknown;
  textHash?: string | null;
}

/**
 * The kinds Riot's description of one ability names, one fact per kind (its first mention), in the
 * rules' order, less the exceptions pinned to this text. `champion` is the champion's id (for the
 * exceptions) and name (its own name is the champion itself: "knocks Caitlyn back"). Never throws.
 */
export function mechanicsOf(ability: MechanicInput, champion: { id: string; name: string }): MechanicFact[] {
  const { slot, description } = ability;
  if (typeof description !== "string" || description.trim() === "" || description.length > MAX_TEXT) return [];
  const firstName = (champion.name.split(/[\s.'’-]+/)[0] ?? "").replace(/[^\p{L}\p{N}]/gu, "");
  const ownName = firstName.length >= 2 ? new RegExp(`^\\s*${firstName}\\b`, "i") : null;
  const facts: MechanicFact[] = [];
  for (const rule of MECHANIC_RULES) {
    const excepted = NOT_THE_MECHANIC.get(`${champion.id}|${slot}|${rule.kind}`);
    if (excepted && excepted.textHash === ability.textHash) continue;
    let found: MechanicFact | null = null;
    for (const s of sentences(description)) {
      const pattern = new RegExp(rule.pattern.source, rule.pattern.flags);
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(s.text)) !== null) {
        const before = s.text.slice(0, m.index);
        const after = s.text.slice(m.index + m[0].length);
        if ((rule.notAfter && rule.notAfter.test(before)) || (rule.notBefore && rule.notBefore.test(after))) continue;
        if (rule.cc) {
          const inside = m[0].slice(m[0].search(/\s/) + 1);
          if (SELF.test(after) || /\b(?:himself|herself|itself)\b/i.test(m[0]) || (ownName && (ownName.test(after) || (/\s/.test(m[0]) && ownName.test(inside))))) continue;
          if (/ed\b/i.test(m[0]) && STATE.test(before)) continue;
        }
        found = { slot, kind: rule.kind, word: rule.word, group: rule.group, clause: s.text, at: [s.start + m.index, s.start + m.index + m[0].length] };
        break;
      }
      if (found) break;
    }
    if (found) facts.push(found);
  }
  return facts;
}

/** A champion's key mechanics: each group with its kinds, each kind with the abilities whose description names it, in slot order. */
export interface KeyMechanics {
  groups: Array<{ group: MechanicGroup; kinds: Array<{ kind: string; word: string; slots: Slot[] }> }>;
}

export function keyMechanics(facts: readonly MechanicFact[]): KeyMechanics {
  const groups: KeyMechanics["groups"] = [];
  for (const group of MECHANIC_GROUPS) {
    const kinds: KeyMechanics["groups"][number]["kinds"] = [];
    for (const rule of MECHANIC_RULES) {
      if (rule.group !== group) continue;
      const slots = facts.filter((f) => f.kind === rule.kind).map((f) => f.slot);
      if (slots.length) kinds.push({ kind: rule.kind, word: rule.word, slots: [...new Set(slots)] });
    }
    if (kinds.length) groups.push({ group, kinds });
  }
  return { groups };
}
