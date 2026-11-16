import type { AbilityChange, AbilityModifiers, AbilityNotes, CooldownDisplay, CooldownSpec, CooldownStart, DdragonAbility, FormCooldownDisplay, FormCooldownSpec, Freshness, PassiveStart, UnknownCooldownReason } from "./types";

/*
  How an ability's cooldown is shown, from Data Dragon's record and any curated notes
  (docs/MATCHUP_INTEL.md, "Cooldowns"). Data Dragon's single array per slot is right for most
  abilities and misleading for some, so it is shown only when it passes the guard
  (ddragonCooldownDisplay):
  - a passive never has a cooldown field, so "no number" there means "not in Riot's data", not "none";
  - with charges (`maxammo` above 0) the array is the wait between casts, the recharge (what a
    player waits for) is not given at all, and the count itself is not reliable (Rengar's Q, W and
    E list 1), so neither a number nor a count is shown;
  - an empty or all-zero array is a placeholder, not "no cooldown" (Gangplank's E shows 0, the wiki
    17 → 13 s);
  - a slot whose name holds two abilities has one array for both: the two forms of a champion who
    transforms ("To the Skies! / Shock Blast"), or the two parts of an ability cast again
    ("Cunning Sweep / Sundering Slam"), which Data Dragon does not tell apart;
  - an array without one number per rank belongs to no rank;
  - a few arrays the evidence shows are not the cooldown a player waits for (NOT_THE_COOLDOWN, each
    with its evidence): known to be wrong, the wait between casts of an ability that holds charges,
    one slot for several abilities, or a slot that casts spells picked up in a game.
  Curated notes, checked by a person against the wiki, say what the array cannot, for as long as
  Riot's record still matches the one they were checked against. Once it moves, the line shows only
  what Riot's data supports, and the notes are shown as checked, flagged. A number is never
  estimated: what is not known is shown as not known.
*/

/** A number of seconds as the data may hold it: finite and not negative. */
const isSeconds = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x) && x >= 0;
const allSeconds = (xs: unknown): xs is number[] => Array.isArray(xs) && xs.length > 0 && xs.every(isSeconds);
const sameNumbers = (a: unknown, b: unknown) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]);
/** Values given per rank: one for every rank, or exactly one per rank (`ranks` null: not known, not checked). */
const fitsRanks = (xs: readonly unknown[], ranks: number | null) => ranks === null || xs.length === 1 || xs.length === ranks;
const unknown = (reason: UnknownCooldownReason): CooldownDisplay => ({ kind: "unknown", reason });

const STARTS: ReadonlySet<string> = new Set<CooldownStart>(["on-cast", "after-first-cast", "after-last-recast", "after-effect-ends", "after-channel"]);
const PASSIVE_STARTS: ReadonlySet<string> = new Set<PassiveStart>(["on-trigger", "after-effect-ends"]);
const SCALES: ReadonlySet<string> = new Set(["level", "rank", "none"]);

/**
 * Data Dragon arrays the saved evidence shows are not the cooldown a player waits for, by spell id,
 * with the array that was checked: a different array is new data, which the other rules judge.
 * Only cases shown wrong are listed, each with what the page says instead.
 */
const NOT_THE_COOLDOWN: ReadonlyMap<string, { cooldown: readonly number[]; reason: UnknownCooldownReason }> = new Map([
  // Rengar's Q, W and E: 0.25 s at every rank (with maxammo 1), reported to Riot as wrong
  // (RiotGames/developer-relations issue 787, "Data for Rengar's spells are wrong in his
  // champion.json", closed 26 Apr 2025) and still 0.25 in Data Dragon 16.22.1.
  ["RengarQ", { cooldown: [0.25, 0.25, 0.25, 0.25, 0.25], reason: "known-wrong-in-ddragon" }],
  ["RengarW", { cooldown: [0.25, 0.25, 0.25, 0.25, 0.25], reason: "known-wrong-in-ddragon" }],
  ["RengarE", { cooldown: [0.25, 0.25, 0.25, 0.25, 0.25], reason: "known-wrong-in-ddragon" }],
  // Corki's R (Missile Barrage): 2 s is the wait between missiles; it holds charges, one regained
  // every 20 s (League of Legends Wiki, Template:Data Corki/Missile Barrage, revision 4092076).
  ["MissileBarrage", { cooldown: [2, 2, 2], reason: "charges-in-ddragon" }],
  // Teemo's R (Noxious Trap): 0.25 s is the wait between mushrooms; it holds 3 to 5 charges by rank,
  // regained every 35 to 25 s (Template:Data Teemo/Noxious Trap, revision 4015245).
  ["TeemoR", { cooldown: [0.25, 0.25, 0.25], reason: "charges-in-ddragon" }],
  // Gangplank's E (Powder Keg): 0 at every rank; it holds charges, regained every 17 to 13 s, with
  // a static 0.5 s between kegs (Template:Data Gangplank/Powder Keg, revision 4091400).
  ["GangplankE", { cooldown: [0, 0, 0, 0, 0], reason: "charges-in-ddragon" }],
  // Taric's Q (Starlight's Touch): 3 s at every rank, with maxammo -1, yet it stores charges: Riot's
  // own tooltip in Data Dragon 16.22.1 says it gains a stack (up to {{ maxcharges }}) every
  // {{ stackcooldown }} seconds and its active consumes them all, and its leveltip's first label is
  // "Max Charges". The time to regain one is a placeholder, so it is not in Riot's data.
  ["TaricQ", { cooldown: [3, 3, 3, 3, 3], reason: "charges-in-ddragon" }],
  // Aphelios's Q ("Weapon Abilites", id ApheliosQ_ClientTooltipWrapper): 9 s at each of its 6 ranks
  // for one slot that holds five abilities. Riot's own description in Data Dragon 16.22.1: "Aphelios
  // has 5 different activated abilities, based on his main-hand weapon"; its tooltip holds only a
  // placeholder and its leveltip nothing. The 9 s is no one of them's.
  ["ApheliosQ_ClientTooltipWrapper", { cooldown: [9, 9, 9, 9, 9, 9], reason: "several-abilities-in-ddragon" }],
  // Zoe's W (Spell Thief): 0.25 s at every rank for a slot whose active casts what she picks up.
  // Riot's own tooltip in Data Dragon 16.22.1: enemies drop spell shards, and "Zoe can pick up this
  // shard to cast that ability once"; its description says she casts them "once herself". The 0.25 s
  // is not the cooldown of the spells it casts.
  ["ZoeW", { cooldown: [0.25, 0.25, 0.25, 0.25, 0.25], reason: "picked-up-spell-in-ddragon" }],
]);

/**
 * What Riot's data alone supports for an ability (docs/MATCHUP_INTEL.md, "Cooldowns"): its array
 * per rank, with no claim about when it starts, or why there is no number. `oneCooldown`: a person
 * checked that this ability's one array is its cooldown (curated notes with a per-rank spec), so a
 * name with two parts is read as one ability cast again, not two forms. Never throws.
 */
export function ddragonCooldownDisplay(ability: DdragonAbility | null | undefined, options: { oneCooldown?: boolean } = {}): CooldownDisplay {
  if (!ability || typeof ability !== "object") return unknown("no-data");
  if (ability.slot === "P") return unknown("passive-not-in-ddragon");
  const current: unknown = ability.cooldown;
  const listed = typeof ability.id === "string" ? NOT_THE_COOLDOWN.get(ability.id) : undefined;
  if (listed && sameNumbers(current, listed.cooldown)) return unknown(listed.reason);
  if (typeof ability.charges === "number" && ability.charges > 0) return unknown("charges-in-ddragon");
  if (!Array.isArray(current) || !current.every(isSeconds)) return unknown("unreadable");
  if (!options.oneCooldown && typeof ability.name === "string" && ability.name.includes(" / ")) return unknown("two-abilities-in-ddragon");
  if (current.length === 0 || current.every((x) => x === 0)) return unknown("no-number-in-ddragon");
  if (current.length !== ability.maxRank) return unknown("ranks-mismatch-in-ddragon");
  return { kind: "per-rank", seconds: [...current], starts: null, from: "ddragon" };
}

/** A form's spec as shown, or null when it cannot be read. */
function formDisplay(spec: FormCooldownSpec | undefined, ranks: number | null): FormCooldownDisplay | null {
  if (!spec || typeof spec !== "object") return null;
  switch (spec.kind) {
    case "per-rank":
      return allSeconds(spec.seconds) && fitsRanks(spec.seconds, ranks) ? { kind: "per-rank", seconds: [...spec.seconds], starts: typeof spec.starts === "string" && STARTS.has(spec.starts) ? spec.starts : null, from: "curated" } : null;
    case "charges": {
      const counts: unknown = typeof spec.charges === "number" ? [spec.charges] : spec.charges;
      const whole = Array.isArray(counts) && counts.length > 0 && counts.every((n) => typeof n === "number" && Number.isInteger(n) && n > 0) && fitsRanks(counts, ranks);
      const recharge = allSeconds(spec.recharge) && spec.recharge.every((s) => s > 0) && fitsRanks(spec.recharge, ranks);
      return whole && recharge ? { kind: "charges", charges: [...(counts as number[])], recharge: [...spec.recharge] } : null;
    }
    case "none":
      return { kind: "none" };
    default:
      return null;
  }
}

/**
 * A curated spec as the page shows it, as it was checked; null when it cannot be read: a value that
 * is not a number of seconds, a count that is not a whole number above 0, an empty list, values that
 * are neither one nor one per rank (`ranks`, when known), levels that do not pair with the values,
 * fewer than two forms. Never throws.
 */
export function curatedCooldownDisplay(spec: CooldownSpec | undefined, ranks: number | null = null): CooldownDisplay | null {
  if (!spec || typeof spec !== "object") return null;
  switch (spec.kind) {
    case "per-rank":
    case "charges":
    case "none":
      return formDisplay(spec, ranks);
    case "passive": {
      if (!allSeconds(spec.seconds)) return null;
      const levels: unknown = spec.levels;
      const pairedLevels = Array.isArray(levels) && levels.length === spec.seconds.length && levels.every((l, i) => typeof l === "number" && Number.isInteger(l) && l >= 1 && l <= 18 && (i === 0 || l > (levels[i - 1] as number)));
      if (levels !== undefined && !pairedLevels) return null;
      return {
        kind: "passive",
        seconds: [...spec.seconds],
        scalesWith: SCALES.has(spec.scalesWith) ? spec.scalesWith : "none",
        levels: pairedLevels ? [...(levels as number[])] : null,
        perTarget: spec.perTarget === true,
        static: spec.static === true,
        starts: typeof spec.starts === "string" && PASSIVE_STARTS.has(spec.starts) ? spec.starts : null,
      };
    }
    case "forms": {
      if (!Array.isArray(spec.forms) || spec.forms.length < 2) return null;
      const forms = spec.forms.map((f) => ({ name: typeof f?.name === "string" ? f.name.trim() : "", cooldown: formDisplay(f?.spec, ranks) }));
      if (!forms.every((f): f is { name: string; cooldown: FormCooldownDisplay } => f.name !== "" && f.cooldown !== null)) return null;
      return { kind: "forms", forms };
    }
    default:
      return null;
  }
}

/**
 * What moved in Riot's record of an ability since its notes were checked: the cooldown array
 * against `ddragonCooldown`, and the id, name, ranks and charges against `ddragonIdentity`, where
 * the notes hold it. Empty when nothing compared moved. Never throws.
 */
export function abilityChanges(ability: DdragonAbility, notes: AbilityNotes): AbilityChange[] {
  const out: AbilityChange[] = [];
  if (!sameNumbers(ability.cooldown, notes.ddragonCooldown)) out.push("cooldown");
  const was = notes.ddragonIdentity;
  if (was && typeof was === "object") {
    if (was.id !== ability.id) out.push("id");
    if (was.name !== ability.name) out.push("name");
    if (was.maxRank !== ability.maxRank) out.push("ranks");
    if (was.charges !== ability.charges) out.push("charges");
  }
  return out;
}

/**
 * The cooldown line for an ability (docs/MATCHUP_INTEL.md, "Cooldowns"): the curated spec while the
 * notes still describe Riot's record, otherwise what Riot's data alone supports. `freshness` is the
 * notes' (abilityFreshness, which also knows the versions); without it, any change in the record
 * counts. Never throws.
 */
export function cooldownDisplay(ability: DdragonAbility | null, notes: AbilityNotes | undefined, freshness?: Freshness | null): CooldownDisplay {
  if (notes?.cooldown) {
    const changed = freshness == null ? !!ability && abilityChanges(ability, notes).length > 0 : freshness === "changed-since";
    const curated = changed ? null : curatedCooldownDisplay(notes.cooldown, ability && Number.isInteger(ability.maxRank) ? ability.maxRank : null);
    if (curated) return curated;
  }
  // Notes that checked one array per rank for this slot (not forms) say how to read a later one,
  // while Riot still names the same ability, with the same ranks.
  const oneCooldown = notes?.cooldown?.kind === "per-rank" && !!ability && !abilityChanges(ability, notes).some((c) => c === "id" || c === "name" || c === "ranks");
  return ddragonCooldownDisplay(ability, { oneCooldown });
}

/** Where a cooldown line comes from: checked notes, Riot's data, or neither (no number). */
export function cooldownFrom(d: CooldownDisplay): "curated" | "ddragon" | null {
  if (d.kind === "unknown") return null;
  return d.kind === "per-rank" ? d.from : "curated";
}

/**
 * The modifiers the page can show as they are: a refund with readable amounts and words, a wait
 * between casts of a number of seconds; anything else is left out. Null when none remains.
 */
export function modifiersView(m: AbilityModifiers | undefined, ranks: number | null = null): AbilityModifiers | null {
  if (!m || typeof m !== "object") return null;
  const out: AbilityModifiers = {};
  const r = m.refund;
  if (r && (r.unit === "percent" || r.unit === "seconds") && allSeconds(r.amount) && fitsRanks(r.amount, ranks) && (r.unit === "seconds" || r.amount.every((x) => x <= 100)) && typeof r.when === "string" && r.when.trim() !== "") {
    out.refund = { unit: r.unit, amount: [...r.amount], when: r.when.trim() };
  }
  if (m.resetsAttack === true) out.resetsAttack = true;
  if (m.static === true) out.static = true;
  if (m.lockout && isSeconds(m.lockout.seconds) && m.lockout.seconds > 0) out.lockout = m.lockout.static === true ? { seconds: m.lockout.seconds, static: true } : { seconds: m.lockout.seconds };
  return Object.keys(out).length ? out : null;
}

/** A Data Dragon version as stored ("16.22.1"). */
const VERSION = /^\d{1,3}(\.\d{1,4}){1,3}$/;

/** Two Data Dragon versions in order, by number ("16.9.1" before "16.10.1"); null when either is not a version. */
export function compareDdragonVersions(a: string, b: string): number | null {
  if (typeof a !== "string" || typeof b !== "string" || !VERSION.test(a) || !VERSION.test(b)) return null;
  const x = a.split(".").map(Number);
  const y = b.split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * How fresh an ability's curated notes are: checked on the data's own version, with Riot's record
 * unchanged ("current"); checked on an earlier version, with nothing compared changed since
 * ("unchanged-since"); or Riot's record (its cooldown array, id, name, ranks or charges) moved
 * after the check ("changed-since"). Data older than the check says nothing about a change since
 * it: a difference there is the data's age, so it is "unchanged-since", said only as "checked on
 * patch N". Other changes (a crowd-control duration, a range) never show in what is compared,
 * which is why "unchanged-since" is never called current.
 */
export function abilityFreshness(ability: DdragonAbility | null, notes: AbilityNotes, verifiedVersion: string, dataVersion: string | null): Freshness {
  if (!ability || dataVersion === null) return "unchanged-since";
  const order = compareDdragonVersions(dataVersion, verifiedVersion);
  if (order !== null && order < 0) return "unchanged-since";
  if (abilityChanges(ability, notes).length > 0) return "changed-since";
  return order === 0 || dataVersion === verifiedVersion ? "current" : "unchanged-since";
}

/** The weakest freshness of several (a champion's or a matchup's, from its abilities'). */
export function weakestFreshness(values: readonly Freshness[]): Freshness {
  if (values.includes("changed-since")) return "changed-since";
  if (values.includes("unchanged-since")) return "unchanged-since";
  return "current";
}
