import { formatCooldowns, formatCooldownsTight, formatCount, formatIsoDay, formatPerRank, formatSeconds, keepUnitsWithNumbers } from "@/lib/format";
import { cooldownFrom } from "@/domain/matchup-intel/cooldown";
import type { AbilityChange, AbilityModifiers, CooldownDisplay, CooldownStart, FactKind, FactSubject, Freshness, KindGroup, MatchupPageView, PassiveStart, Recast, RiotTextKind, RiotTextReview, RiotTextSource, Slot, UnknownCooldownReason } from "@/domain/matchup-intel/types";

/*
  Matchup Intel's fixed words (docs/MATCHUP_INTEL.md, "Cooldowns"): how a cooldown, its modifiers,
  a recast, a fact's kind and subject, where a line comes from, a set of notes' freshness and a
  hidden briefing point are said on the page. A number is written only when the data holds it; what
  is not known is said as not known, never estimated.
*/

/** A slot as the page names it: the key, or "Passive". */
export const SLOT_NAMES: Record<Slot, string> = { P: "Passive", Q: "Q", W: "W", E: "E", R: "R" };

/** "Renekton W", "Riven passive": an ability named on a chip. */
export function abilityName(champion: string, slot: Slot): string {
  return `${champion} ${slot === "P" ? "passive" : slot}`;
}

/** The anchor of an ability's row ("ability-Renekton-W"), for the briefing's chips. */
export function abilityAnchor(championId: string, slot: Slot): string {
  return `ability-${championId}-${slot}`;
}

/** "A", "A and B", "A, B and C". */
export function listWords(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

const COUNTS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
/** A count at the start of a sentence: "One", "Two", … "Nine", then the number. */
const countWord = (n: number) => (Number.isInteger(n) && n >= 0 && n < COUNTS.length ? COUNTS[n]! : formatCount(n));

const STARTS: Record<Exclude<CooldownStart, "on-cast">, string> = {
  "after-first-cast": "starts after the first cast",
  "after-last-recast": "starts after the last recast",
  "after-effect-ends": "starts when the effect ends",
  "after-channel": "starts after the channel",
};

const PASSIVE_STARTS: Record<PassiveStart, string> = {
  "on-trigger": "starts when it takes effect",
  "after-effect-ends": "starts when the effect ends",
};

/** A static cooldown, said on its line. */
const STATIC = "unaffected by ability haste";

/** Why there is no number, as the cooldown line says it. */
export const UNKNOWN_WORDS: Record<UnknownCooldownReason, string> = {
  "passive-not-in-ddragon": "Cooldown not in Riot's data",
  "charges-in-ddragon": "Riot's data lists charges but not their recharge",
  "no-number-in-ddragon": "No cooldown number in Riot's data",
  "two-abilities-in-ddragon": "Two abilities share this slot in Riot's data",
  "ranks-mismatch-in-ddragon": "Riot's data doesn't give one number per rank",
  "known-wrong-in-ddragon": "Riot's number for this ability is known to be wrong",
  "several-abilities-in-ddragon": "Several abilities share this slot in Riot's data",
  "picked-up-spell-in-ddragon": "This slot casts spells picked up in a game",
  unreadable: "Riot's cooldown data can't be read",
  "no-data": "No cooldown data held yet",
};

/** One cooldown line's words: `value` (the numbers, or why there are none), `notes` (when it starts, the recharge, levels), and `known` (false when there is no number to show). */
export interface CooldownWords {
  value: string;
  notes: string[];
  known: boolean;
}

/** A line of the cooldown: one per form for a champion who transforms (`form` names it), else one. */
export interface CooldownLine extends CooldownWords {
  form: string | null;
}

function lineWords(d: Exclude<CooldownDisplay, { kind: "forms" }>, isStatic: boolean): CooldownWords {
  const haste = isStatic ? [STATIC] : [];
  switch (d.kind) {
    case "per-rank": {
      const value = formatCooldowns(d.seconds);
      // On cast is the ordinary start, so it goes without saying, as does a start no source states.
      return { value, notes: [...(d.starts && d.starts !== "on-cast" ? [STARTS[d.starts]] : []), ...haste], known: value !== "—" };
    }
    case "charges": {
      const counts = formatPerRank(d.charges, "", null);
      const recharge = formatPerRank(d.recharge, "s", null);
      const one = d.charges.length > 0 && d.charges.every((n) => n === 1);
      return { value: counts === "—" ? "—" : `${counts}\u00a0charge${one ? "" : "s"}`, notes: [...(recharge === "—" ? [] : [`one back every ${recharge}`]), ...haste], known: counts !== "—" };
    }
    case "passive": {
      const extra = [...(d.perTarget ? ["per target"] : []), ...(d.static || isStatic ? [STATIC] : []), ...(d.starts ? [PASSIVE_STARTS[d.starts]] : [])];
      const varies = d.seconds.length > 1 && !d.seconds.every((s) => s === d.seconds[0]);
      if (d.levels && d.levels.length === d.seconds.length && varies) {
        const value = formatPerRank(d.seconds, "s", null);
        return { value, notes: [`at levels ${d.levels.map(formatCount).join(" / ")}`, ...extra], known: value !== "—" };
      }
      if (d.scalesWith === "rank") {
        const value = formatCooldowns(d.seconds);
        return { value, notes: [...(d.seconds.length > 1 ? ["by its rank"] : []), ...extra], known: value !== "—" };
      }
      const value = formatCooldowns(d.seconds, "level");
      return { value, notes: [...(d.scalesWith === "level" && varies ? ["by level"] : []), ...extra], known: value !== "—" };
    }
    case "none":
      return { value: "No cooldown", notes: [], known: true };
    case "unknown":
      return { value: UNKNOWN_WORDS[d.reason] ?? UNKNOWN_WORDS.unreadable, notes: [], known: false };
  }
}

/**
 * The cooldown's lines (docs/MATCHUP_INTEL.md, "Cooldowns"): one per form for a champion who
 * transforms, else one. `static` adds that ability haste does not shorten it (the notes' modifier).
 */
export function cooldownLines(d: CooldownDisplay, options: { static?: boolean } = {}): CooldownLine[] {
  const isStatic = options.static === true;
  if (d.kind === "forms") return d.forms.map((f) => ({ form: f.name, ...lineWords(f.cooldown, isStatic) }));
  return [{ form: null, ...lineWords(d, isStatic) }];
}

/** Rank 1's and the last rank's values ("16–8\u00a0s"), one value once ("120\u00a0s"); null without a number. */
function glanceRange(values: readonly number[]): string | null {
  const ok = values.filter((v) => Number.isFinite(v));
  if (!ok.length || ok.length !== values.length) return null;
  const first = ok[0]!, last = ok[ok.length - 1]!;
  return `${first === last ? formatSeconds(first) : `${formatSeconds(first)}\u2013${formatSeconds(last)}`}\u00a0s`;
}

/**
 * A cooldown in a phone's glance tile (64px): the base cooldown at rank 1 and at the last rank, or a
 * word for what has no single number ("Forms", "None", "No data"); `full` is the whole line, which
 * the tile's name gives a screen reader and the full tile below shows. Never a hasted value.
 */
export function glanceCooldown(d: CooldownDisplay, options: { static?: boolean } = {}): { short: string; full: string; known: boolean } {
  const w = cooldownWords(d, options);
  const full = [w.value, ...w.notes].join(" · ");
  switch (d.kind) {
    case "per-rank":
    case "passive": {
      const r = glanceRange(d.seconds);
      return r ? { short: r, full, known: true } : { short: "No data", full, known: false };
    }
    // A recharge is not a cooldown: the word, and the whole line in the tile's name.
    case "charges":
      return { short: "Charges", full, known: w.known };
    case "forms":
      return { short: "Forms", full, known: w.known };
    case "none":
      return { short: "None", full, known: true };
    case "unknown":
      return { short: "No data", full, known: false };
  }
}

/** The cooldown in one line of words (the forms one after another): what cooldownLines says, joined. */
export function cooldownWords(d: CooldownDisplay, options: { static?: boolean } = {}): CooldownWords {
  const lines = cooldownLines(d, options);
  if (lines.length === 1 && lines[0]!.form === null) return { value: lines[0]!.value, notes: lines[0]!.notes, known: lines[0]!.known };
  return { value: lines.map((l) => `${l.form}: ${[l.value, ...l.notes].join(" · ")}`).join("; "), notes: [], known: lines.some((l) => l.known) };
}

/**
 * What the modifiers add beyond the cooldown line, each as one short line: the wait between casts,
 * a refund and what gives it, an attack reset. (A static cooldown is said on the line itself.)
 */
export function modifierWords(m: AbilityModifiers | null | undefined): string[] {
  if (!m) return [];
  const out: string[] = [];
  if (m.lockout) out.push(`${formatSeconds(m.lockout.seconds)}\u00a0s between casts${m.lockout.static ? `, ${STATIC}` : ""}`);
  // "65%" is held to "of", as a number is in every curated text; "2 s" already holds its "s".
  if (m.refund) out.push(`${keepUnitsWithNumbers(`Refunds ${formatPerRank(m.refund.amount, m.refund.unit === "percent" ? "%" : "s", null)} of the cooldown`)}: ${m.refund.when}`);
  if (m.resetsAttack) out.push("Resets the basic-attack timer");
  return out;
}

/**
 * Where a cooldown line comes from, said under it: notes a person checked (and, once a later patch
 * is out, that nobody has checked them again for it: `notRecheckedFor`, Recheck.patch), Riot's data
 * no person has reviewed, or Riot's newer data once it moved after the check. Null where nothing
 * needs saying (no data held, or a line without a number on an ability whose notes are current).
 */
export function cooldownSourceWords(d: CooldownDisplay, at: { freshness: Freshness | null; checkedPatch: string | null; dataPatch: string | null; notRecheckedFor?: string | null }): string | null {
  const from = cooldownFrom(d);
  if (from === "curated") return `${at.checkedPatch ? `Checked on patch ${at.checkedPatch}` : "Checked"}${at.notRecheckedFor ? ` · not re-checked for ${at.notRecheckedFor}` : ""}`;
  if (from === "ddragon") {
    if (at.freshness === "changed-since") return at.dataPatch ? `Riot's data for patch ${at.dataPatch}, not re-checked` : "Riot's data, not re-checked";
    return "Riot's data, not reviewed";
  }
  if (d.kind === "unknown" && d.reason === "no-data") return null;
  if (at.freshness === "changed-since") return "Not re-checked";
  return at.freshness === null ? "Not reviewed" : null;
}

const CHANGES: Record<AbilityChange, string> = { cooldown: "cooldown", id: "spell id", name: "name", ranks: "ranks", charges: "charges" };

/** The heading of an ability's notes once Riot's data moved after the check: "Notes from patch 26.22 · may be out of date: Riot changed its cooldown since". */
export function flaggedNotesWords(checkedPatch: string | null, changes: readonly AbilityChange[]): string {
  const what = changes.length ? `: Riot changed its ${listWords(changes.map((c) => CHANGES[c] ?? c))} since` : "";
  return `${checkedPatch ? `Notes from patch ${checkedPatch}` : "These notes"} · may be out of date${what}`;
}

/** "Can be cast 2 more times within 4 s" (the recast's own note follows it). */
export function recastWords(r: Recast): string {
  const more = r.count === 1 ? "again" : `${formatCount(r.count)}\u00a0more times`;
  return `Can be cast ${more}${r.windowSeconds !== undefined ? ` within ${formatSeconds(r.windowSeconds)}\u00a0s` : ""}`;
}

/** Each kind of fact as its badge names it for screen readers (the badge shows the fact's own word). */
export const FACT_KINDS: Record<FactKind, string> = {
  "crowd-control": "Crowd control",
  mobility: "Mobility",
  defence: "Defence",
  sustain: "Sustain",
  damage: "Damage",
  empowerment: "Empowerment",
  interaction: "Interaction",
  exception: "Exception",
};

/** Who a kind of fact falls on unless it says otherwise: crowd control and damage the target, the rest the champion. */
const DEFAULT_SUBJECT: Record<FactKind, FactSubject> = {
  "crowd-control": "target",
  damage: "target",
  mobility: "self",
  defence: "self",
  sustain: "self",
  empowerment: "self",
  interaction: "self",
  exception: "self",
};

/**
 * Who has a fact's effect, said only where its kind would not say it ("on the target" for an
 * interaction, "on Mordekaiser" for crowd control on himself); null where it goes without saying
 * or the notes do not say.
 */
export function subjectWords(kind: FactKind, appliesTo: FactSubject | null, champion: string): string | null {
  if (!appliesTo || appliesTo === DEFAULT_SUBJECT[kind]) return null;
  switch (appliesTo) {
    case "self":
      return `on ${champion}`;
    case "target":
      return "on the target";
    case "allies":
      return "on allies";
    case "area":
      return "in an area";
    default:
      return null;
  }
}

/** A wiki page's revision as a source line says it: "revision of 23 Sep 2026"; null without a readable time. */
export function revisionWords(revisionTime: string | null | undefined): string | null {
  const day = typeof revisionTime === "string" && /^\d{4}-\d{2}-\d{2}T/.test(revisionTime) ? formatIsoDay(revisionTime.slice(0, 10)) : "—";
  return day === "—" ? null : `revision of ${day}`;
}

/**
 * How fresh a set of curated notes is, in words: when it was checked, and, when Riot's data for
 * the abilities it rests on moved after the check, that it may be out of date. "Checked on" a
 * patch is all that is claimed otherwise: other changes (a duration, a range) never show in what is
 * compared.
 */
export function freshnessWords(f: Freshness, patch: string): { checked: string; warning: string | null } {
  return { checked: `Checked on patch ${patch}`, warning: f === "changed-since" ? "Riot changed abilities this rests on after the check: may be out of date" : null };
}

/** Notes checked on an earlier patch than the newest the page knows, which nobody has checked again: "Not re-checked for 26.23". */
export function notRecheckedWords(patch: string): string {
  return `Not re-checked for ${patch}`;
}

/**
 * The bar's warning once parts of the curated briefing or its interactions are hidden because Riot
 * changed an ability they rest on after the check (each said in full where it was): "Changed since
 * the check: two parts hidden", or, with nothing of the briefing left to show, "Changed since the
 * check: the briefing is hidden".
 */
export function hiddenPartsBarWords(count: number, whole: boolean): string {
  return `Changed since the check: ${whole ? "the briefing is hidden" : `${countWord(count).toLowerCase()} ${count === 1 ? "part" : "parts"} hidden`}`;
}

/** "three patches ago", "12 patches ago", "one patch ago". */
const patchesAgo = (n: number) => `${n === 1 ? "one" : countWord(n).toLowerCase()} ${n === 1 ? "patch" : "patches"} ago`;

/** Champion notes past MAX_PATCHES_UNCHECKED patches since their check: "Checked three patches ago: may be out of date". */
export function expiredNotesWords(patches: number): string {
  return `Checked ${patchesAgo(patches)}: may be out of date`;
}

/** In place of a briefing past MAX_PATCHES_UNCHECKED patches since its check: "This briefing is hidden: it was checked on patch 26.22, three patches ago, and not since." */
export function expiredBriefingWords(checkedPatch: string, patches: number): string {
  return `This briefing is hidden: it was checked on patch ${checkedPatch}, ${patchesAgo(patches)}, and not since. It shows again once a person checks it.`;
}

/** In place of a matchup's interactions past MAX_PATCHES_UNCHECKED patches since its check: "Two interactions are hidden: they were checked on patch 26.22, three patches ago." */
export function expiredInteractionsWords(count: number, checkedPatch: string, patches: number): string {
  return `${countWord(count)} ${count === 1 ? "interaction is" : "interactions are"} hidden: ${count === 1 ? "it was" : "they were"} checked on patch ${checkedPatch}, ${patchesAgo(patches)}, with the briefing.`;
}

/**
 * Ability data older than the game's current patch, said once above the abilities, naming whose it
 * is when only some of the champions shown are behind: "Riven's ability data is from patch 26.22;
 * the game is on patch 26.23." Every champion shown behind on one patch: "The ability data held
 * here is from patch 26.22; …".
 */
export function staleDataWords(behind: ReadonlyArray<{ name: string; patch: string }>, current: string, everyShown: boolean): string {
  const tail = `the game is on patch ${current}. The next game-data update reads it from Riot again.`;
  if (behind.length === 0) return "";
  if (everyShown && behind.every((b) => b.patch === behind[0]!.patch)) return `The ability data held here is from patch ${behind[0]!.patch}; ${tail}`;
  if (behind.length === 1) return `${behind[0]!.name}'s ability data is from patch ${behind[0]!.patch}; ${tail}`;
  const [first, ...rest] = behind;
  return `${first!.name}'s ability data is from patch ${first!.patch} and ${listWords(rest.map((b) => `${b.name}'s from ${b.patch}`))}; ${tail}`;
}

/**
 * Where a champion's abilities come from: "Riot Data Dragon 16.22.1", or the copy committed with the
 * app, "an offline copy of Riot Data Dragon 16.22.1" in a sentence (the footer), "Offline copy of
 * Riot Data Dragon 16.22.1" as a label after a "·" (`label`: a panel's or a section's line).
 */
export function dataSourceWords(version: string, offlineCopy: boolean, label = false): string {
  return offlineCopy ? `${label ? "Offline" : "an offline"} copy of Riot Data Dragon ${version}` : `Riot Data Dragon ${version}`;
}

/**
 * Where no curated briefing exists, what the enemy's general reference below it holds, and no more:
 * checked notes only for a champion that has them, abilities only where they are stored and can be
 * read ("What follows is the general reference for Darius: abilities and base cooldowns from Riot's
 * data.").
 */
export function generalReferenceWords(name: string, has: { abilities: boolean; notes: boolean }): string {
  const holds = !has.abilities ? null : has.notes ? "abilities, base cooldowns and checked notes" : "abilities and base cooldowns from Riot's data";
  return `What follows is the general reference for ${name}${holds ? `: ${holds}` : ""}.`;
}

/** No abilities to show for a champion: none stored yet, or a record stored that cannot be read. */
export function missingAbilitiesWords(name: string, unreadable: boolean): { title: string; body: string } {
  return unreadable
    ? { title: `Riot's ability data for ${name} could not be read`, body: `A copy is stored, but not in the shape this page reads. ${name}'s abilities are read from Riot's Data Dragon once per game version.` }
    : { title: "Ability details aren't stored yet", body: `${name}'s abilities are read from Riot's Data Dragon once per game version, and none are stored yet.` };
}

/** A champion's notes once Riot changed some of its abilities after the check: "Riot changed two abilities after the check: their notes are flagged". */
export function changedAbilitiesWords(count: number): string {
  return count === 1 ? "Riot changed one ability after the check: its notes are flagged" : `Riot changed ${countWord(count).toLowerCase()} abilities after the check: their notes are flagged`;
}

const changedNames = (names: readonly string[]) => (names.length ? listWords(names) : "an ability it rests on");

/** In place of a hidden threat or opportunity: "Hidden: Riot changed Renekton W after this briefing was checked." */
export function hiddenPartWords(changed: readonly string[]): string {
  return `Hidden: Riot changed ${changedNames(changed)} after this briefing was checked.`;
}

/** After the lane points shown: "One point is hidden: Riot changed Renekton W after this briefing was checked." */
export function hiddenPointsWords(count: number, changed: readonly string[]): string {
  return `${countWord(count)} ${count === 1 ? "point is" : "points are"} hidden: Riot changed ${changedNames(changed)} after this briefing was checked.`;
}

/** In place of a briefing with nothing left to show: "This briefing is hidden: Riot changed Renekton W after it was checked." */
export function hiddenBriefingWords(changed: readonly string[]): string {
  return `This briefing is hidden: Riot changed ${changedNames(changed)} after it was checked.`;
}

/** After the matchup's interactions shown: "One interaction is hidden: Riot changed Renekton W after it was checked." */
export function hiddenInteractionsWords(count: number, changed: readonly string[]): string {
  return `${countWord(count)} ${count === 1 ? "interaction is" : "interactions are"} hidden: Riot changed ${changedNames(changed)} after ${count === 1 ? "it was" : "they were"} checked.`;
}

/**
 * What a screen reader is told once the page for a choice made in the pickers has arrived (the
 * slot it is on names only its own champion): whether a curated briefing came, or none exists and
 * an assembled reference follows (never called a briefing), and what follows. `shows`: the briefing
 * shows a point of its own (not hidden whole).
 */
export function announcementWords(view: Pick<MatchupPageView, "you" | "enemy" | "matchup">, shows: boolean): string {
  const { you, enemy, matchup } = view;
  if (you && enemy) {
    const pair = `${you.name} vs ${enemy.name}`;
    if (matchup && shows) return `${pair}: curated briefing, checked on patch ${matchup.verified.patch}. ${enemy.name}'s abilities follow.`;
    if (matchup) return `${pair}: the curated briefing is hidden; an assembled reference from each champion's own facts follows. ${enemy.name}'s abilities follow.`;
    return `No curated briefing for ${pair} yet: an assembled reference from each champion's own facts, which no person has checked as a pair. ${enemy.name}'s abilities follow.`;
  }
  if (you) return `Playing ${you.name}: now choose the enemy.`;
  if (enemy) return `${enemy.name}'s abilities and base cooldowns.`;
  return "Choose your champion and the enemy.";
}

/* ---------- Facts from Riot's text (L3) and the assembled reference (L5) ---------- */

/** Each kind from Riot's text as its chip names it. */
export const RIOT_TEXT_KIND_WORDS: Record<RiotTextKind, string> = {
  stun: "Stun",
  knockup: "Knock-up",
  knockback: "Knock-back",
  pull: "Pull",
  root: "Root",
  slow: "Slow",
  silence: "Silence",
  fear: "Fear",
  flee: "Flee",
  charm: "Charm",
  taunt: "Taunt",
  suppression: "Suppression",
  ground: "Grounding",
  polymorph: "Polymorph",
  sleep: "Sleep",
  blind: "Blind",
  disarm: "Disarm",
  nearsight: "Nearsight",
  drowsy: "Drowsy",
  dash: "Dash",
  blink: "Blink",
  leap: "Leap",
  teleport: "Teleport",
  unstoppable: "Unstoppable",
  shield: "Shield",
  untargetable: "Untargetable",
  invulnerable: "Invulnerable",
  stasis: "Stasis",
  spellshield: "Spell shield",
  damagereduction: "Damage reduction",
  tenacity: "Tenacity",
  cleanse: "Cleanse",
  stealth: "Stealth",
  parry: "Parry",
  heal: "Heal",
  lifesteal: "Life steal",
  omnivamp: "Omnivamp",
  regeneration: "Regeneration",
  recast: "Recast",
  charges: "Charges",
  cooldownrefund: "Cooldown refund",
  reset: "Reset",
  toggle: "Toggle",
  empower: "Empowered",
  transform: "Transforms",
};

/** Each group of facts as the dashboard names it. */
export const KIND_GROUP_WORDS: Record<KindGroup, string> = {
  "crowd-control": "Crowd control",
  power: "Burst and power",
  mobility: "Mobility",
  defence: "Defence",
  sustain: "Sustain",
  cooldown: "Cooldown",
};

/** The label every fact from Riot's text carries, in the owner's words (18 Nov 2026). */
export const RIOT_TEXT_LABEL = "From Riot's ability text, reviewed automatically (not by a person)";

/**
 * Who checked the checked notes (L2), said where they are named ("Checked notes"), as the label of
 * the facts from Riot's text says who reviewed those: AI agents drafted and audited the six
 * champions' notes, and no person has checked them (docs/MATCHUP_INTEL.md, Coverage). Once a
 * person checks a champion's notes, this changes with them.
 */
export const CHECKED_NOTES_LABEL = "Checked notes (drafted and audited by AI agents, not by a person)";

/** Where a side's or a panel's cooldown numbers are Riot's, said once for them all: "Cooldowns: Riot's data, not reviewed". */
export function cooldownsFromWords(source: string): string {
  return `Cooldowns: ${source}`;
}

/** Which of Riot's texts a clause is quoted from: "Riot's tooltip for Ki Burst", "Riot's description of Ki Burst". */
export function riotTextSourceWords(source: RiotTextSource, ability: string): string {
  return source === "tooltip" ? `Riot's tooltip for ${ability}` : `Riot's description of ${ability}`;
}

/**
 * The marker on a fact from Riot's text that holds only under a condition no number-free words of
 * Riot's text name (the owner's words, 19 Nov 2026): on its chip, the quote one tap away. The page
 * never says the condition in its own words.
 */
export const CONDITIONAL_WORDS = "Conditional: see Riot's text";

/**
 * The marker's line under an ability's chips, on its tile and on its line in the assembled
 * reference, naming the kinds it marks: "Conditional: see Riot's text (Stun and Pull)". The owner's
 * fixed words, then the chips' own words; never the condition. Each chip's tip says it too, with the quote.
 */
export function conditionalNoteWords(kinds: readonly RiotTextKind[]): string {
  return `${CONDITIONAL_WORDS} (${listWords(kinds.map((k) => RIOT_TEXT_KIND_WORDS[k]))})`;
}

/** The chip, on a tile and in a group, where Riot's two texts for an ability state different effects. */
export const DIFFER_WORDS = "Riot's texts differ";

/** Under the two quotes of a disagreement: the page picks neither. */
export const DIFFER_NEITHER_WORDS = "Neither is shown as a fact.";

/** A tile whose ability has no reviewed fact: never "none" (the ability may well have effects that no fact passed the review for). */
export const NO_ABILITY_FACTS_WORDS = "No reviewed facts for this ability";

/**
 * What a qualifier adds to its fact's chip, after the kind's word, in Riot's words: " · “Mega Gnar”"
 * (the form, condition or recipient the fact holds only with); on a cooldown refund, the abilities
 * whose cooldown it cuts, " of “Mantra”".
 */
export function qualifierChipWords(kind: RiotTextKind, qualifier: string): string {
  return kind === "cooldownrefund" ? ` of “${qualifier}”` : ` · “${qualifier}”`;
}

/**
 * A qualifier's line, in a chip's tip and in the details window: "Riot adds “Mega Gnar”" (a form, a condition or who it reaches: one lead fits them all), or on a
 * cooldown refund "Cuts the cooldown of “Mantra”"; and, where it is quoted from the ability's other
 * text rather than the clause's, which ("(Riot's tooltip for Dragon Strike)").
 */
export function qualifierWords(kind: RiotTextKind, qualifier: string, otherSource: RiotTextSource | null | undefined, ability: string): string {
  const lead = kind === "cooldownrefund" ? "Cuts the cooldown of" : "Riot adds";
  return `${lead} “${qualifier}”${otherSource ? ` (${riotTextSourceWords(otherSource, ability)})` : ""}`;
}

/** Another kind Riot's other text words a fact as, in the details window: "Riot's description calls it leap" (its quote follows). */
export function alsoDescribedWords(kind: RiotTextKind, source: RiotTextSource): string {
  return `Riot's ${source} calls it ${RIOT_TEXT_KIND_WORDS[kind].toLowerCase()}`;
}

/** One side of a disagreement: "Pull, in Riot's description of Fate Sealed" (its quote follows). The two sides read alike. */
export function differSideWords(kind: RiotTextKind, source: RiotTextSource, ability: string): string {
  return `${RIOT_TEXT_KIND_WORDS[kind]}, in ${riotTextSourceWords(source, ability)}`;
}

/** "two" for 2, the number from ten up. */
const countLower = (n: number) => countWord(n).toLowerCase();

/**
 * How the facts from Riot's text were reviewed, for the sources and notices, from each file's review
 * record (reviewRecord: added for the import, from the review's own sentence, "two independent
 * automated reviews and an adjudicator, then a consistency pass checked by two more; not checked by
 * a person"): "Reviewed by two independent automated reviewers and an adjudicator, then a consistency
 * pass checked by two more independent automated checkers; no person has checked them." It says how
 * the facts as a whole were reviewed, never that each went through every step: some came in as a
 * reviewer's addition or with the consistency pass, not as a draft of the fixed rules.
 */
export function riotTextProcessWords(review: RiotTextReview): string {
  const reviewers = `Reviewed by ${countLower(review.automatedReviewers)} independent automated ${review.automatedReviewers === 1 ? "reviewer" : "reviewers"}${review.adjudicated ? " and an adjudicator" : ""}`;
  const checkers = review.consistencyCheckers > 0 ? `, then a consistency pass checked by ${countLower(review.consistencyCheckers)} more independent automated ${review.consistencyCheckers === 1 ? "checker" : "checkers"}` : "";
  return `${reviewers}${checkers}; ${review.checkedByPerson ? "a person has checked them" : "no person has checked them"}.`;
}

/** After the sentence on the facts from Riot's text, in the sources: the numbers in Riot's text (which the ability's details show with Riot's description) are no part of them. */
export const RIOT_TEXT_NO_NUMBERS_WORDS = "No number in that text is used for these facts.";

/** When a champion's facts from Riot's text were reviewed: "Reviewed against Riot's text of patch 26.22, on 18 Nov 2026". */
export function riotTextReviewedWords(patch: string | null, reviewedOn: string): string {
  const day = formatIsoDay(reviewedOn);
  return `Reviewed against Riot's text${patch ? ` of patch ${patch}` : ""}${day === "—" ? "" : `, on ${day}`}`;
}

/** The assembled reference's title: it is never called a briefing. */
export const ASSEMBLED_TITLE = "Assembled reference";

/** What the assembled reference is, said on it every time: "Put together from each champion's own facts. No person has checked Riven vs Darius as a pair." */
export function assembledWords(you: string, enemy: string): string {
  return `Put together from each champion's own facts. No person has checked ${you} vs ${enemy} as a pair.`;
}

/** Above the assembled reference where the pair has no curated briefing: "No curated briefing for Riven vs Darius yet." */
export function noBriefingWords(you: string, enemy: string): string {
  return `No curated briefing for ${you} vs ${enemy} yet.`;
}

/**
 * Above the assembled reference where the pair's curated briefing exists but shows nothing (its
 * check too old, or every part resting on an ability Riot changed since), drawn just above it:
 * "The curated briefing for Ambessa vs Renekton is hidden, above." Never "no curated briefing".
 */
export function briefingHiddenAboveWords(you: string, enemy: string): string {
  return `The curated briefing for ${you} vs ${enemy} is hidden, above.`;
}

/** What the assembled reference is when it stands in for a hidden briefing: the briefing was checked as a pair, what is put together in its place was not. */
export const ASSEMBLED_IN_PLACE_WORDS = "Put together from each champion's own facts in its place. No person has checked them as a pair.";

/** A champion with neither checked notes nor reviewed facts: "No reviewed facts for Darius yet: crowd control, mobility, defence and sustain are not recorded." */
export function noFactsWords(name: string): string {
  return `No reviewed facts for ${name} yet: crowd control, mobility, defence and sustain are not recorded.`;
}

/**
 * A group with nothing in it, said where its facts would be: never a bare "none", only what is
 * recorded. For facts from Riot's text, that none passed the review, not that Riot's text or the
 * ability has none.
 */
export function noneRecordedWords(from: "checked" | "riot-text"): string {
  return from === "checked" ? "None in the checked notes" : "No reviewed facts of this kind";
}

/**
 * The same, on a side where some abilities' facts from Riot's text are hidden (Riot changed or renamed
 * them after the review, said at the side's foot, right under the groups): what is hidden may be of
 * this kind, and its kinds are not shown, so the group says only what holds outside them: "No
 * reviewed facts of this kind outside R". Short enough to share its group's line at 1920 wide.
 */
export function noneOutsideHiddenWords(keys: readonly string[]): string {
  return `No reviewed facts of this kind outside ${listWords(keys)}`;
}

/**
 * In place of an ability's facts from Riot's text that are hidden, and of where its two texts
 * differ: "Riot's text for W changed after the review: its 2 facts are hidden.", "… its fact and the
 * note that Riot's texts differ are hidden." Never left out silently.
 */
export function hiddenRiotTextWords(count: number, because: "changed" | "renamed" | "unknown", key: string, disagreements = 0): string {
  const facts = count === 1 ? "its fact" : `its ${formatCount(count)} facts`;
  const differ = disagreements === 1 ? "the note that Riot's texts differ" : "the notes that Riot's texts differ";
  const what = count > 0 && disagreements > 0 ? `${facts} and ${differ} are hidden` : count > 0 ? `${facts} ${count === 1 ? "is" : "are"} hidden` : `${differ} ${disagreements === 1 ? "is" : "are"} hidden`;
  if (because === "renamed") return `Riot renamed ${key} after the review: ${what}.`;
  if (because === "unknown") return `Whether Riot's text for ${key} changed since the review is not known yet: ${what}.`;
  return `Riot's text for ${key} changed after the review: ${what}.`;
}

/** No level notes for the champions on the page: "No level changes recorded for Darius or Riven." */
export function noLevelNotesWords(names: readonly string[]): string {
  const list = names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
  return `No level changes recorded${list ? ` for ${list}` : ""}.`;
}

/** No interactions to show for the pair, and where they could come from. */
export const NO_INTERACTIONS_WORDS = "No interactions recorded for this pair: they come only from curated matchup notes and each champion's checked notes.";

/** The danger side of the dashboard: "Darius's kit, by kind". */
export function dangerSideWords(enemy: string): string {
  return `${enemy}'s kit, by kind`;
}

/** The opportunity side of the dashboard: "Riven's tools, by kind". */
export function toolsSideWords(you: string): string {
  return `${you}'s tools, by kind`;
}

/** The folded lane points: "2 more". */
export function moreWords(count: number): string {
  return `${formatCount(count)} more`;
}

/**
 * A cooldown as a grouped fact's line ends with it: the numbers per rank, tight ("14/12/10/8/6 s"),
 * where the line is one number per rank; null otherwise (charges, forms, a passive, no number: the
 * ability's tile says those in full).
 */
export function tightCooldownWords(d: CooldownDisplay): string | null {
  if (d.kind !== "per-rank") return null;
  const value = formatCooldownsTight(d.seconds);
  return value === "—" ? null : value;
}
