import { formatCooldowns, formatCount, formatIsoDay, formatPerRank, formatSeconds } from "@/lib/format";
import { cooldownFrom } from "@/domain/matchup-intel/cooldown";
import type { AbilityChange, AbilityModifiers, CooldownDisplay, CooldownStart, FactKind, FactSubject, Freshness, MatchupPageView, PassiveStart, Recast, Slot, UnknownCooldownReason } from "@/domain/matchup-intel/types";

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
      return { value: counts === "—" ? "—" : `${counts} charge${one ? "" : "s"}`, notes: [...(recharge === "—" ? [] : [`one back every ${recharge}`]), ...haste], known: counts !== "—" };
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
  if (m.lockout) out.push(`${formatSeconds(m.lockout.seconds)} s between casts${m.lockout.static ? `, ${STATIC}` : ""}`);
  if (m.refund) out.push(`Refunds ${formatPerRank(m.refund.amount, m.refund.unit === "percent" ? "%" : "s", null)} of the cooldown: ${m.refund.when}`);
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
  const more = r.count === 1 ? "again" : `${formatCount(r.count)} more times`;
  return `Can be cast ${more}${r.windowSeconds !== undefined ? ` within ${formatSeconds(r.windowSeconds)} s` : ""}`;
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
 * slot it is on names only its own champion): whether a curated briefing came, or none exists, and
 * what follows. `shows`: the briefing shows a point of its own (not hidden whole).
 */
export function announcementWords(view: Pick<MatchupPageView, "you" | "enemy" | "matchup">, shows: boolean): string {
  const { you, enemy, matchup } = view;
  if (you && enemy) {
    const pair = `${you.name} vs ${enemy.name}`;
    if (matchup && shows) return `${pair}: curated briefing, checked on patch ${matchup.verified.patch}. ${enemy.name}'s abilities follow.`;
    if (matchup) return `${pair}: the curated briefing is hidden. ${enemy.name}'s abilities follow.`;
    return `No curated briefing for ${pair} yet. ${enemy.name}'s abilities follow.`;
  }
  if (you) return `Playing ${you.name}: now choose the enemy.`;
  if (enemy) return `${enemy.name}'s abilities and base cooldowns.`;
  return "Choose your champion and the enemy.";
}
