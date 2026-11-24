import type { DdragonAbility } from "./types";

/*
  How an ability's base cooldown is shown, from Riot's Data Dragon record alone
  (docs/CHAMPION_LOOKUP.md, "Cooldowns"). Data Dragon's single array per slot is right for most
  abilities and misleading for some, so it is shown as the cooldown only when it passes the guard
  (ddragonCooldownDisplay); otherwise the page says why there is no number, and never applies ability
  haste to anything but a cooldown that passed:
  - a passive never has a cooldown field, so "no number" there means "not in Riot's data", not "none";
  - with charges (`maxammo` above 0) the array is the wait between casts, the recharge (what a
    player waits for) is not given at all, and the count itself is not reliable (Rengar's Q, W and
    E list 1), so neither a number nor a count is shown;
  - an empty or all-zero array is a placeholder, not "no cooldown" (Gangplank's E shows 0, the wiki
    17 → 13 s);
  - a slot whose name holds two abilities has one array for both: the two forms of a champion who
    transforms ("To the Skies! / Shock Blast"), or the two parts of an ability cast again
    ("Sonic Wave / Resonating Strike"), which Data Dragon does not tell apart. Riot's array is kept
    (`listed`) so the page can say what Riot lists for the slot, as Riot's, never as either ability's
    cooldown, and never with haste applied;
  - an array without one number per rank belongs to no rank;
  - a few arrays the evidence shows are not the cooldown a player waits for (NOT_THE_COOLDOWN, each
    with its evidence): known to be wrong, the wait between casts of an ability that holds charges,
    one slot for several abilities, or a slot that casts spells picked up in a game.
  A number is never estimated: what is not known is shown as not known. These rules were Matchup
  Intel's (docs/MATCHUP_INTEL.md, retired 23 Nov 2026) and carry over unchanged.
*/

/** Why no cooldown number is shown for an ability, so the page can say it plainly. */
export type UnknownCooldownReason =
  /** The passive: Data Dragon never gives a passive a cooldown, which is not "none". */
  | "passive-not-in-ddragon"
  /** Data Dragon lists charges (maxammo above 0), or the evidence shows the ability holds them: its array is then the wait between casts, and the recharge is not in Riot's data. */
  | "charges-in-ddragon"
  /** An empty or all-zero array: a placeholder, not "no cooldown". */
  | "no-number-in-ddragon"
  /** The slot's name holds two abilities, and one array stands for both, which Data Dragon does not tell apart. */
  | "two-abilities-in-ddragon"
  /** The array does not hold one number per rank. */
  | "ranks-mismatch-in-ddragon"
  /** The evidence shows Data Dragon's number is not this ability's cooldown (the exception list). */
  | "known-wrong-in-ddragon"
  /** One slot for several abilities, which Riot's own description lists (Aphelios's Q), so its one array is no single ability's. */
  | "several-abilities-in-ddragon"
  /** The slot casts spells picked up in a game (Zoe's W, by Riot's own tooltip), so its array is not their cooldown. */
  | "picked-up-spell-in-ddragon"
  /** A value that is not a number of seconds. */
  | "unreadable"
  /** No record of the ability is held. */
  | "no-data";

/** How one ability's cooldown is shown. */
export type CooldownDisplay =
  /** Riot's base cooldown per rank, without ability haste. */
  | { kind: "per-rank"; seconds: number[] }
  /**
   * No cooldown number from Riot's data, and why. `listed`: for two abilities in one slot only,
   * Riot's array for the slot as it is (one number per rank), said as Riot's and never hasted.
   */
  | { kind: "unknown"; reason: UnknownCooldownReason; listed?: number[] };

/** A number of seconds as the data may hold it: finite and not negative. */
const isSeconds = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x) && x >= 0;
const sameNumbers = (a: unknown, b: unknown) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]);
const unknown = (reason: UnknownCooldownReason): CooldownDisplay => ({ kind: "unknown", reason });

/**
 * Data Dragon arrays the saved evidence shows are not the cooldown a player waits for, by spell id,
 * with the array that was checked: a different array is new data, which the other rules judge.
 * Only cases shown wrong are listed, each with what the page says instead.
 */
export const NOT_THE_COOLDOWN: ReadonlyMap<string, { cooldown: readonly number[]; reason: UnknownCooldownReason }> = new Map([
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
 * What Riot's data alone supports for an ability: its array per rank, or why there is no number,
 * the rules in the order of the module's comment. Never throws.
 */
export function ddragonCooldownDisplay(ability: DdragonAbility | null | undefined): CooldownDisplay {
  if (!ability || typeof ability !== "object") return unknown("no-data");
  if (ability.slot === "P") return unknown("passive-not-in-ddragon");
  const current: unknown = ability.cooldown;
  const listed = typeof ability.id === "string" ? NOT_THE_COOLDOWN.get(ability.id) : undefined;
  if (listed && sameNumbers(current, listed.cooldown)) return unknown(listed.reason);
  if (typeof ability.charges === "number" && ability.charges > 0) return unknown("charges-in-ddragon");
  if (!Array.isArray(current) || !current.every(isSeconds)) return unknown("unreadable");
  const empty = current.length === 0 || current.every((x) => x === 0);
  const perRank = current.length === ability.maxRank;
  if (typeof ability.name === "string" && ability.name.includes(" / ")) return !empty && perRank ? { kind: "unknown", reason: "two-abilities-in-ddragon", listed: [...current] } : unknown("two-abilities-in-ddragon");
  if (empty) return unknown("no-number-in-ddragon");
  if (!perRank) return unknown("ranks-mismatch-in-ddragon");
  return { kind: "per-rank", seconds: [...current] };
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
