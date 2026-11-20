import { formatPerRank } from "@/lib/format";
import type { AbilityModifiers, CooldownDisplay, Slot } from "./types";

/*
  MATCHUP INTEL's cooldowns at a chosen ability haste (docs/MATCHUP_INTEL.md, "Cooldowns at a
  haste"). Each ability's base cooldown per rank stays as Riot's data or the checked notes give it;
  a hasted value is shown only where the haste rule is known to apply, and every case says which:

  - "static": the checked notes mark the cooldown static (ability haste does not shorten it): the
    base at every haste;
  - "unknown": the checked notes leave open whether haste shortens it (`hasteUnknown`): the base only;
  - "general": every other per-rank number, hasted by Riot's published rule (patch 10.23, 2020):
    cooldown = base × 100 / (100 + haste). Riot's data does not list the abilities the rule does not
    apply to, so the line says "Riot's general rule", never "checked";
  - "not-covered": charges' recharge, a passive's own cooldown: base only, "not in Riot's data";
  - "none": no number to start from.

  R is marked "ability haste only": ultimate haste from some runes and items is not counted. A
  summoner spell is never shortened by ability haste (summoner spell haste is a separate stat). The
  page never shows a timer or a "ready at" (game integrity): only the cooldown's length.
*/

/** The haste values offered as one press; any whole number from 0 to HASTE_MAX can be typed. */
export const HASTE_CHOICES = [0, 20, 40, 60] as const;
/** The highest haste the page accepts (a typed value above it is held to it). */
export const HASTE_MAX = 300;

export type HasteMark = "general" | "static" | "unknown" | "not-covered" | "none";

/** What the page needs to show an ability's cooldown at any haste, built on the server from its cooldown line. */
export interface HasteBasis {
  mark: HasteMark;
  /** One entry per line of the cooldown (one per form for a champion who transforms), each its base seconds per rank; [] when none. */
  lines: Array<{ form: string | null; seconds: number[] }>;
  /** The ultimate: ability haste only, ultimate haste not counted. */
  ultimate: boolean;
}

/** A haste value as the page takes it: a whole number from 0 to HASTE_MAX; anything else is 0. */
export function clampHaste(value: unknown): number {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(HASTE_MAX, Math.floor(n));
}

/** Riot's general rule: base × 100 / (100 + haste), to two decimals (never a timer). */
export function hastedSeconds(base: number, haste: number): number {
  const h = clampHaste(haste);
  return Math.round(((base * 100) / (100 + h)) * 100) / 100;
}

const validSeconds = (s: readonly number[]) => s.length > 0 && s.every((v) => typeof v === "number" && Number.isFinite(v) && v > 0);

/** How an ability's cooldown line behaves under ability haste (see the module's comment). */
export function hasteBasisOf(slot: Slot, cooldown: CooldownDisplay, modifiers: AbilityModifiers | null | undefined, options: { static?: boolean; ignoreStatic?: boolean } = {}): HasteBasis {
  const ultimate = slot === "R";
  // Once Riot's record moved after the check, the notes' static mark no longer describes the line.
  const isStatic = options.static === true || (options.ignoreStatic !== true && modifiers?.static === true);
  const unknown = modifiers?.hasteUnknown === true;
  const lines: HasteBasis["lines"] = [];
  let covered = true;
  if (cooldown.kind === "per-rank") {
    if (validSeconds(cooldown.seconds)) lines.push({ form: null, seconds: [...cooldown.seconds] });
  } else if (cooldown.kind === "forms") {
    for (const f of cooldown.forms) {
      if (f.cooldown.kind === "per-rank" && validSeconds(f.cooldown.seconds)) lines.push({ form: f.name, seconds: [...f.cooldown.seconds] });
      else if (f.cooldown.kind === "charges") covered = false;
    }
  } else if (cooldown.kind === "passive") {
    if (validSeconds(cooldown.seconds)) lines.push({ form: null, seconds: [...cooldown.seconds] });
    if (cooldown.static) return { mark: lines.length ? "static" : "none", lines, ultimate };
    covered = false;
  } else if (cooldown.kind === "charges") {
    if (validSeconds(cooldown.recharge)) lines.push({ form: null, seconds: [...cooldown.recharge] });
    covered = false;
  }
  if (!lines.length) return { mark: "none", lines, ultimate };
  if (isStatic) return { mark: "static", lines, ultimate };
  if (unknown) return { mark: "unknown", lines, ultimate };
  if (!covered) return { mark: "not-covered", lines, ultimate };
  return { mark: "general", lines, ultimate };
}

/** The seconds per rank of each line at `haste`: hasted only where the mark is "general". */
export function cooldownAtHaste(basis: HasteBasis, haste: number): Array<{ form: string | null; seconds: number[] }> {
  const h = clampHaste(haste);
  return basis.lines.map((l) => ({ form: l.form, seconds: basis.mark === "general" && h > 0 ? l.seconds.map((s) => hastedSeconds(s, h)) : [...l.seconds] }));
}

/** The words that say which case a line is (the mark), shown beside it at a haste above 0. */
export function hasteMarkWords(basis: HasteBasis): string {
  switch (basis.mark) {
    case "general":
      return basis.ultimate ? "Riot's general rule · ability haste only" : "Riot's general rule";
    case "static":
      return "Static: haste doesn't shorten it";
    case "unknown":
      return "Whether haste shortens it isn't known";
    case "not-covered":
      return "How haste applies is not in Riot's data";
    default:
      return "No cooldown number";
  }
}

/**
 * The tip of the general rule (the mark "Riot's general rule" on a hasted line opens it, HasteLine):
 * what it rests on, and what it does not know. At most about 25 words (tip-length.test.ts counts it).
 * On R the mark itself says "ability haste only" (ultimate haste from some runes and items is not
 * counted).
 */
export const GENERAL_RULE_TIP =
  "Riot's rule since patch 10.23: cooldown = base × 100 / (100 + haste). Riot's data doesn't list the abilities it doesn't apply to; checked notes cover 6 champions.";

/** A summoner spell's line: its base cooldown only, never shortened by ability haste. */
export const SUMMONER_SPELL_HASTE_WORDS = "Summoner spell haste is a separate stat";

/** A summoner spell's cooldown at any ability haste: its base, always (summoner spell haste is a separate stat, not counted). */
export function summonerSpellCooldown(base: readonly number[], _abilityHaste: number): number[] {
  return [...base];
}

/** What a "what it means" line needs of one ability: whose, which key, and its haste basis. */
export interface MeansAbility {
  champion: string;
  slot: Slot;
  basis: HasteBasis;
}

/** The words of the case a "what it means" line is, at a haste (hasteMarkWords' own, lower-cased, with the base said at 0). */
function meansMark(basis: HasteBasis, haste: number): string | null {
  switch (basis.mark) {
    case "static":
      return "static per the checked notes: haste doesn't shorten it";
    case "unknown":
      return "whether haste shortens it isn't known";
    case "general": {
      const how = haste > 0 ? "Riot's general rule" : "base";
      return basis.ultimate ? `${how}, ability haste only` : how;
    }
    default:
      return null;
  }
}

/**
 * A briefing row's "what it means" part for one enemy ability (docs/MATCHUP_INTEL.md, "What it
 * means"): a fact built only from numbers, never a verdict, a timer or a "ready at". Its cooldown
 * per rank at the chosen haste, by the same rule as the cooldown table (cooldownAtHaste), and which
 * case that is: "Renekton's W cooldown 13/12/11/10/9 s at 0 ability haste (base)". Null where the
 * numbers do not allow one: no number, charges or a passive's own (how haste applies is not in
 * Riot's data), or more than one line (a champion who transforms).
 */
export function meansPart(a: MeansAbility, haste: number): string | null {
  const mark = meansMark(a.basis, haste);
  if (!mark || a.basis.lines.length !== 1) return null;
  const h = clampHaste(haste);
  const [line] = cooldownAtHaste(a.basis, h);
  if (!line?.seconds.length) return null;
  return `${a.champion}'s ${a.slot} cooldown ${formatPerRank(line.seconds, "s")}, at ${h} ability haste (${mark})`;
}

/** A briefing row's whole "what it means" line: its enemy abilities' parts, joined; null when none has one. */
export function meansLine(abilities: readonly MeansAbility[], haste: number): string | null {
  const parts = abilities.map((a) => meansPart(a, haste)).filter((p): p is string => !!p);
  return parts.length ? parts.join("; ") : null;
}
