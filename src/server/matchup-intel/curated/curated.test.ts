import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FACT_TAGS, SLOTS, type AbilityModifiers, type AbilityNotes, type AbilityRef, type BriefingPoint, type ChampionNotes, type CooldownSpec, type DdragonIdentity, type Fact, type MatchupNotes, type Slot, type Source, type Verification } from "@/domain/matchup-intel/types";
import { compareDdragonVersions, curatedCooldownDisplay, modifiersView } from "@/domain/matchup-intel/cooldown";
import { patchFromVersion, publicPatchName } from "@/domain/patch";
import abilityFixture from "@/server/riot/fixtures/champion-abilities.fixture.json";
import championList from "@/server/riot/fixtures/champions.fixture.json";
import { E2E_DDRAGON_VERSION } from "../../../../e2e/ddragon-version";
import { curatedEnemiesFor, getChampionNotes, getMatchupNotes } from "./index";

/*
  The curated notes keep the rules they are written under (docs/MATCHUP_INTEL.md, "Curated notes"):
  - every file in champions/ and matchups/ is in the registry (index.ts) under its own ids, and the
    registry holds nothing else;
  - every id is a champion in Riot's list (src/server/riot/fixtures/champions.fixture.json), and a
    champion's notes cover the slots P, Q, W, E and R, and no others;
  - each ability's ddragonCooldown is Data Dragon's array for the version the notes were checked
    against, and a per-rank cooldown repeats it; its ddragonIdentity, where given, is Data Dragon's
    id, name, ranks and charges for that version;
  - every cooldown spec and every modifier is one the page can show as written (cooldownDisplay's
    own rules): numbers of seconds, whole charge counts, one value or one per rank, levels paired
    with their values, two or more forms with names of their own, a refund's share at most 100%;
  - every fact says who has the effect (appliesTo), and its tags come from FACT_TAGS, each once;
  - every fact, level note and interaction cites one of its notes' sources, and every source is an
    https page on wiki.leagueoflegends.com (CC BY-SA 3.0, with the revision read and when it was
    saved, a time in UTC no later than the day the notes were checked), developer.riotgames.com or
    ddragon.leagueoflegends.com (Riot Games, with no revision); its kind fits its page, and a wiki
    page's title is in the house style ("League of Legends Wiki: Ruthless Predator (Renekton)");
  - a matchup's source is the champion notes' source of the same id, in every field;
  - every ability a briefing point or an interaction rests on belongs to one of the two champions
    and has notes of its own, checked against the same Data Dragon version as the matchup: the
    matchup holds no numbers of its own, so its freshness is those notes';
  - every text is plain and short: no wiki markup ("{{"), no "<" or ">", no control characters, at
    most 300 characters;
  - no briefing point or interaction uses a word that dictates play or claims too much (REFUSED_WORDS),
    and no text of the champion notes the page shows (a fact, a detail, a cooldown or recast note, a
    refund, a level note) a word that instructs the player or gives a verdict: Riot lets a product
    highlight decisions, never dictate them. Champion notes describe mechanics, so they may say what
    an ability always or never does;
  - no text the page shows, in champion notes or a matchup, gives a value as an estimate
    ("estimated", "approximately", "roughly"): a value the wiki marks as estimated is left out;
  - every level note names the abilities of its champion it rests on (basedOn), each with notes;
  - `verified` is a patch, a Data Dragon version and a day, in those shapes;
  - a matchup has a threat, an opportunity and one to four lane points;
  - the three validation matchups exist;
  - the Data Dragon version the browser tests pin (e2e/ddragon-version.ts, passed to their server
    by playwright.config.ts) is the newest version the notes are checked against, with both its
    files: re-checking the notes on a newer version moves the pin in the same pull request, so
    the browser tests read the data the notes were checked on.

  Data Dragon's arrays come from ddragon-<version>.cooldowns.json beside this file, and its ids,
  names, ranks and charges from ddragon-<version>.identity.json. The ones for 16.22.1 were generated
  on 16 Nov 2026 from Riot's champion files,
  https://ddragon.leagueoflegends.com/cdn/16.22.1/data/en_US/champion/<Champion>.json: each spell's
  "cooldown" array in Riot's order (Q, W, E, R), and [] for the passive, which has no cooldown in
  Data Dragon; each spell's id, name, maxrank and maxammo (as charges above 0, else null), and the
  passive's name. Notes checked against another version need that version's files. Where the
  committed offline fixture (src/server/riot/fixtures/champion-abilities.fixture.json) is of the
  same version, both files must agree with it.

  The types require ddragonIdentity, a fact's appliesTo and a source's kind; the checks below refuse
  notes without them as well, for notes that reach them some other way.
*/

const DIR = __dirname;
const MAX_TEXT = 300;
const MAX_LANE = 4;
const RIOT_IDS: ReadonlySet<string> = new Set(championList.champions.map((c) => c.id));
const VALIDATION_PAIRS = [
  ["Ambessa", "Renekton"],
  ["Gwen", "Ornn"],
  ["Riven", "Mordekaiser"],
] as const;

/** The hosts a source may be on, and the licence of their pages. */
const SOURCE_HOSTS = new Map<string, Source["licence"]>([
  ["wiki.leagueoflegends.com", "CC BY-SA 3.0"],
  ["developer.riotgames.com", "Riot Games"],
  ["ddragon.leagueoflegends.com", "Riot Games"],
]);

/** Control, zero-width and bidirectional characters (those plainText removes, src/domain/resources.ts), as code-point ranges. */
const CONTROL_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0000, 0x001f],
  [0x007f, 0x009f],
  [0x200b, 0x200f],
  [0x2028, 0x202e],
  [0x2066, 0x2069],
  [0xfeff, 0xfeff],
];

/** Data Dragon's cooldown arrays: version, then champion, then slot. */
type DdragonCooldowns = ReadonlyMap<string, Readonly<Record<string, Record<Slot, number[]>>>>;
/** Data Dragon's ids, names, ranks and charges: version, then champion, then slot. */
type DdragonIdentities = ReadonlyMap<string, Readonly<Record<string, Record<Slot, DdragonIdentity>>>>;

export interface Rules {
  /** Riot's champion ids. */
  champions: ReadonlySet<string>;
  ddragon: DdragonCooldowns;
  identity: DdragonIdentities;
}

const START_VALUES: ReadonlySet<string> = new Set(["on-cast", "after-first-cast", "after-last-recast", "after-effect-ends", "after-channel"]);
const PASSIVE_START_VALUES: ReadonlySet<string> = new Set(["on-trigger", "after-effect-ends"]);
const SUBJECTS: ReadonlySet<string> = new Set(["self", "target", "allies", "area"]);
const TAGS: ReadonlySet<string> = new Set(FACT_TAGS);
const REVISION_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
/** A wiki ability's data page, and a champion's own page (one title, no namespace). */
const WIKI_ABILITY_PATH = /^\/en-us\/Template:Data_[^/]+\/[^/]+$/;
const WIKI_CHAMPION_PATH = /^\/en-us\/[^/:]+$/;

/**
 * Words and phrases no briefing point or matchup interaction uses. Riot's League of Legends policies
 * (https://developer.riotgames.com/docs/lol) say products "may highlight decisions that are
 * important and give multiple choices", and list "Apps that dictate player decisions" among the
 * uses that will not be approved (docs/MATCHUP_INTEL.md, "Curated notes"). Each matches as a whole
 * word or phrase, in any case, with a straight or curly apostrophe: "win" does not match "Wind
 * Slash", nor "counter" "encounter".
 */
export const REFUSED_WORDS: ReadonlyArray<{ why: string; words: readonly string[] }> = [
  { why: "an absolute claim", words: ["always", "never", "every time", "guaranteed", "guarantee", "guarantees", "certainly", "definitely", "surely", "impossible"] },
  {
    why: "an instruction to the player",
    words: ["must", "should", "shouldn't", "ought", "need to", "have to", "make sure", "be sure", "avoid", "try to", "wait for", "remember to", "you", "your", "yours", "yourself", "you're", "you'll", "you'd", "you've"],
  },
  {
    why: "a verdict on the matchup",
    words: ["easy", "easier", "easiest", "easily", "free win", "free kill", "auto-win", "auto win", "autowin", "can't lose", "cannot lose", "can't win", "cannot win", "win", "wins", "winning", "winnable", "unwinnable", "best", "optimal", "counter", "counters", "countered", "counter-pick", "counterpick", "punish", "punishes", "punished", "punishing", "outplay", "outplays", "abuse", "exploit", "dominate", "dominates", "stomp", "all-in"],
  },
];

/** The groups of REFUSED_WORDS a champion's notes are held to: they describe mechanics, so an absolute claim ("never refunds the cooldown") is theirs to make. */
const CHAMPION_REFUSED: ReadonlySet<string> = new Set(["an instruction to the player", "a verdict on the matchup"]);

/**
 * A refused word that a factual sentence genuinely needs: the file ("matchups/Ambessa-vs-Renekton.ts"
 * or "champions/Riven.ts"), the text's place ("briefing.lane[1].text", "abilities.P.facts[1].detail"),
 * the word, and why the sentence needs it. None so far.
 */
const ALLOWED_WORDS: ReadonlyArray<{ file: string; at: string; word: string; reason: string }> = [];

/** What may stand next to a refused word inside a longer one: a letter, a digit, "_", an apostrophe or a hyphen. */
const WORD_CHAR = "[\\p{L}\\p{N}_'’-]";
const REFUSED: ReadonlyArray<{ word: string; why: string; pattern: RegExp }> = REFUSED_WORDS.flatMap(({ why, words }) =>
  words.map((word) => {
    const body = word
      .split(" ")
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/'/g, "['’]"))
      .join("\\s+");
    return { word, why, pattern: new RegExp(`(?<!${WORD_CHAR})${body}(?!${WORD_CHAR})`, "iu") };
  }),
);

/** The refused words a text uses (REFUSED_WORDS), each with why it is refused. */
export function refusedWords(text: string): Array<{ word: string; why: string }> {
  return REFUSED.filter((r) => r.pattern.test(text)).map(({ word, why }) => ({ word, why }));
}

/**
 * Words that give a value as an estimate, as whole words in any case. A value the wiki marks as
 * estimated is left out (docs/MATCHUP_INTEL.md, "Curated notes", Rules): Bellows Breath's page
 * gives the speed below which Ornn does not lunge as an estimate, and the notes once repeated it.
 */
const ESTIMATE_WORDS = ["estimated", "estimate", "estimates", "approximately", "approximate", "roughly"] as const;
const ESTIMATE = new RegExp(`(?<!${WORD_CHAR})(${ESTIMATE_WORDS.join("|")})(?!${WORD_CHAR})`, "iu");

/** The word a text gives a value as an estimate with, in lower case, or null. */
export function estimateWord(text: string): string | null {
  return ESTIMATE.exec(text)?.[1]?.toLowerCase() ?? null;
}

/**
 * The texts of a champion's notes the page shows in its own words, with where each is: each
 * ability's facts (label and detail), details, cooldown note, recast note and refund, and the level
 * notes. Not the sources, nor Data Dragon's names (an ability may be called "Counter Strike").
 */
function championTexts(notes: ChampionNotes): Array<[string, unknown]> {
  const out: Array<[string, unknown]> = [];
  for (const slot of SLOTS) {
    const a = notes.abilities?.[slot];
    if (!a) continue;
    const at = `abilities.${slot}`;
    (a.facts ?? []).forEach((f, i) => out.push([`${at}.facts[${i}].label`, f.label], [`${at}.facts[${i}].detail`, f.detail]));
    (a.details ?? []).forEach((d, i) => out.push([`${at}.details[${i}]`, d]));
    out.push([`${at}.cooldownNote`, a.cooldownNote], [`${at}.recast.note`, a.recast?.note], [`${at}.modifiers.refund.when`, a.modifiers?.refund?.when]);
  }
  (notes.levelNotes ?? []).forEach((n, i) => out.push([`levelNotes[${i}].text`, n.text]));
  return out;
}

const isSlot = (value: string): value is Slot => (SLOTS as readonly string[]).includes(value);
const sameNumbers = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const show = (xs: readonly number[]) => `[${xs.join(", ")}]`;

/** "Renekton.W" as its champion and slot, or null when it is not "<ChampionId>.<slot>". */
function parseRef(ref: string): { championId: string; slot: Slot } | null {
  const m = /^([^.]+)\.([^.]+)$/.exec(ref);
  return m && isSlot(m[2]!) ? { championId: m[1]!, slot: m[2] } : null;
}

/** Every string in a value, with where it is ("abilities.W.facts[1].detail"). */
function strings(value: unknown, at: string): Array<[string, string]> {
  if (typeof value === "string") return [[at, value]];
  if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, `${at}[${i}]`));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([key, v]) => strings(v, at ? `${at}.${key}` : key));
  return [];
}

/** Why a text breaks the text rules, or null when it keeps them. */
export function textProblem(text: string): string | null {
  if (text.trim() === "") return "is empty";
  if (text.includes("{{")) return 'contains wiki markup "{{"';
  if (text.includes("<") || text.includes(">")) return 'contains "<" or ">"';
  const control = [...text].map((ch) => ch.codePointAt(0)!).find((c) => CONTROL_RANGES.some(([lo, hi]) => c >= lo && c <= hi));
  if (control !== undefined) return `contains the control character U+${control.toString(16).toUpperCase().padStart(4, "0")}`;
  const length = [...text].length;
  if (length > MAX_TEXT) return `is ${length} characters long, more than ${MAX_TEXT}`;
  return null;
}

/** A real calendar day written as an ISO date ("2026-11-16"). */
function isIsoDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value;
}

export function verificationProblems(verified: Verification | undefined): string[] {
  if (!verified || typeof verified !== "object") return ["has no verified field"];
  const out: string[] = [];
  const fields = Object.keys(verified).sort().join(", ");
  if (fields !== "checkedOn, ddragonVersion, patch") out.push(`verified has ${fields || "no fields"}, not checkedOn, ddragonVersion and patch`);
  const { patch, ddragonVersion, checkedOn } = verified;
  const patchShaped = typeof patch === "string" && /^\d+\.\d+$/.test(patch);
  const versionShaped = typeof ddragonVersion === "string" && /^\d+\.\d+\.\d+$/.test(ddragonVersion);
  if (!patchShaped) out.push(`verified.patch ${JSON.stringify(patch)} is not a patch such as "26.22"`);
  if (!versionShaped) out.push(`verified.ddragonVersion ${JSON.stringify(ddragonVersion)} is not a Data Dragon version such as "16.22.1"`);
  if (patchShaped && versionShaped) {
    const itsPatch = publicPatchName(patchFromVersion(ddragonVersion)!);
    if (itsPatch !== patch) out.push(`verified.patch ${JSON.stringify(patch)} is not Data Dragon ${ddragonVersion}'s patch (${itsPatch})`);
  }
  if (typeof checkedOn !== "string" || !isIsoDay(checkedOn)) out.push(`verified.checkedOn ${JSON.stringify(checkedOn)} is not a day such as "2026-11-16"`);
  return out;
}

/**
 * The title a wiki page's source carries, from its address: "League of Legends Wiki: <Ability>
 * (<Champion>)" for an ability's data page, "League of Legends Wiki: <Page>" for any other (a
 * reference page may add a few words in brackets). Null for a page that is not the wiki's.
 */
export function wikiTitle(url: URL): string | null {
  if (url.hostname !== "wiki.leagueoflegends.com") return null;
  let path = url.pathname;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    // An address that does not decode is judged as written.
  }
  const page = path.replace(/^\/en-us\//, "").replace(/_/g, " ");
  const ability = /^Template:Data ([^/]+)\/(.+)$/.exec(page);
  return ability ? `League of Legends Wiki: ${ability[2]} (${ability[1]})` : `League of Legends Wiki: ${page}`;
}

/** Why a source's title is not the house style for its page, or null. */
function titleProblem(source: Source, url: URL): string | null {
  const expected = wikiTitle(url);
  if (expected === null) return null;
  const title = typeof source.title === "string" ? source.title : "";
  const fits = title === expected || (source.kind === "wiki-reference" && title.startsWith(`${expected} (`) && title.endsWith(")"));
  return fits ? null : `source "${source.id}" is titled ${JSON.stringify(title)}, not ${JSON.stringify(expected)}`;
}

/** Why a source's kind does not fit its page, or null. */
function kindProblem(source: Source, url: URL): string | null {
  let path = url.pathname;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    // An address that does not decode is judged as written.
  }
  const onWiki = url.hostname === "wiki.leagueoflegends.com";
  switch (source.kind) {
    case undefined:
      return null;
    case "wiki-ability":
      return onWiki && WIKI_ABILITY_PATH.test(path) ? null : "an ability data page (wiki.leagueoflegends.com/en-us/Template:Data_<Champion>/<Ability>)";
    case "wiki-champion":
      return onWiki && WIKI_CHAMPION_PATH.test(path) ? null : "a champion's page (wiki.leagueoflegends.com/en-us/<Champion>)";
    case "wiki-reference":
      return onWiki && !WIKI_ABILITY_PATH.test(path) && !WIKI_CHAMPION_PATH.test(path) ? null : "another wiki page (not an ability data page or a champion's page)";
    case "ddragon":
      return url.hostname === "ddragon.leagueoflegends.com" ? null : "a page on ddragon.leagueoflegends.com";
    case "riot-docs":
      return url.hostname === "developer.riotgames.com" ? null : "a page on developer.riotgames.com";
    default:
      return "one of the kinds a source can be";
  }
}

export function sourceProblems(sources: readonly Source[], checkedOn?: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const source of sources) {
    if (seen.has(source.id)) out.push(`source "${source.id}" is listed twice`);
    seen.add(source.id);
    let url: URL | null = null;
    try {
      url = new URL(source.url);
    } catch {
      url = null;
    }
    const licence = url?.protocol === "https:" ? SOURCE_HOSTS.get(url.hostname) : undefined;
    if (!url || !licence) {
      out.push(`source "${source.id}" is not an https page on ${[...SOURCE_HOSTS.keys()].join(", ")}: ${source.url}`);
      continue;
    }
    if (source.licence !== licence) out.push(`source "${source.id}" is on ${url.hostname}, whose licence is ${licence}, not ${source.licence}`);
    if (licence === "CC BY-SA 3.0") {
      if (!(Number.isInteger(source.revision) && source.revision! > 0)) out.push(`source "${source.id}" gives no revision of the wiki page`);
      if (source.revisionTime === undefined) out.push(`source "${source.id}" gives no revisionTime: when the revision read was saved, from the page's history`);
    } else if (source.revision !== undefined || source.revisionTime !== undefined) {
      out.push(`source "${source.id}" is one of Riot's pages, which have no wiki revision, but gives a revision or a revisionTime`);
    }
    if (source.kind === undefined) out.push(`source "${source.id}" gives no kind (wiki-ability, wiki-champion, wiki-reference, ddragon or riot-docs)`);
    const kind = kindProblem(source, url);
    if (kind) out.push(`source "${source.id}" is of kind "${source.kind}", which is ${kind}, but its address is ${source.url}`);
    const title = titleProblem(source, url);
    if (title) out.push(title);
    if (source.revisionTime !== undefined) {
      const time = typeof source.revisionTime === "string" && REVISION_TIME.test(source.revisionTime) ? Date.parse(source.revisionTime) : Number.NaN;
      if (Number.isNaN(time)) out.push(`source "${source.id}" revisionTime ${JSON.stringify(source.revisionTime)} is not a time in UTC such as "2026-09-23T19:37:45Z"`);
      else if (checkedOn && isIsoDay(checkedOn) && source.revisionTime.slice(0, 10) > checkedOn) out.push(`source "${source.id}" revisionTime ${source.revisionTime} is after the day the notes were checked (${checkedOn})`);
    }
  }
  return out;
}

/** The ranks an ability had at the version checked: Data Dragon's maxrank where the committed identity file has it, else its array's length (1 for the passive). */
function ranksOf(slot: Slot, ability: AbilityNotes, identity: Record<Slot, DdragonIdentity> | undefined): number | null {
  if (slot === "P") return 1;
  const fromFile = identity?.[slot]?.maxRank;
  if (Number.isInteger(fromFile)) return fromFile!;
  return Array.isArray(ability.ddragonCooldown) && ability.ddragonCooldown.length > 0 ? ability.ddragonCooldown.length : null;
}

/** Why a cooldown spec breaks a rule a test can check, beyond being readable (each per-rank start, a passive's start, the forms' names). */
function specProblems(spec: CooldownSpec): string[] {
  const out: string[] = [];
  const startOk = (s: unknown) => s === null || (typeof s === "string" && START_VALUES.has(s));
  if (spec.kind === "per-rank" && !startOk(spec.starts)) out.push(`its start ${JSON.stringify(spec.starts)} is not a start such as "on-cast", or null where the source states none`);
  if (spec.kind === "passive" && spec.starts !== undefined && !PASSIVE_START_VALUES.has(spec.starts)) out.push(`its start ${JSON.stringify(spec.starts)} is not "on-trigger" or "after-effect-ends"`);
  if (spec.kind === "forms" && Array.isArray(spec.forms)) {
    const names = spec.forms.map((f) => (typeof f?.name === "string" ? f.name.trim() : ""));
    if (new Set(names).size !== names.length) out.push("two of its forms have the same name");
    spec.forms.forEach((f, i) => {
      if (f?.spec?.kind === "per-rank" && !startOk(f.spec.starts)) out.push(`forms[${i}]'s start ${JSON.stringify(f.spec.starts)} is not a start such as "on-cast", or null`);
    });
  }
  return out;
}

/** What of the modifiers the page would leave out, as written. */
function modifierProblems(m: AbilityModifiers, ranks: number | null): string[] {
  const shown = modifiersView(m, ranks) ?? {};
  const out: string[] = [];
  if (m.refund && !shown.refund) out.push("modifiers.refund cannot be shown: its amount must be one value, or one per rank, of seconds or a share of at most 100%, and its `when` must say what gives it");
  if (m.lockout && !shown.lockout) out.push("modifiers.lockout cannot be shown: its seconds must be a number above 0");
  if (m.resetsAttack !== undefined && m.resetsAttack !== true) out.push("modifiers.resetsAttack is given but not true");
  if (m.static !== undefined && m.static !== true) out.push("modifiers.static is given but not true");
  return out;
}

export function championProblems(notes: ChampionNotes, rules: Rules): string[] {
  const out: string[] = [];
  const say = (what: string) => out.push(`${notes.championId}: ${what}`);
  if (!rules.champions.has(notes.championId)) say("is not a champion id in Riot's list (src/server/riot/fixtures/champions.fixture.json)");
  verificationProblems(notes.verified).forEach(say);
  sourceProblems(notes.sources, notes.verified?.checkedOn).forEach(say);
  const cited = new Set(notes.sources.map((s) => s.id));

  const version = notes.verified?.ddragonVersion;
  const riot = rules.ddragon.get(version);
  const arrays = riot?.[notes.championId];
  if (!riot) say(`no committed Data Dragon cooldowns for ${version} (ddragon-${version}.cooldowns.json)`);
  else if (!arrays) say(`is not in ddragon-${version}.cooldowns.json`);
  const identities = rules.identity.get(version);
  const identity = identities?.[notes.championId];
  if (!identities) say(`no committed Data Dragon identity for ${version} (ddragon-${version}.identity.json)`);
  else if (!identity) say(`is not in ddragon-${version}.identity.json`);

  for (const slot of Object.keys(notes.abilities)) if (!isSlot(slot)) say(`"${slot}" is not an ability slot (P, Q, W, E or R)`);
  for (const slot of SLOTS) {
    const ability = notes.abilities[slot];
    if (!ability) {
      say(`has no notes for ${slot}`);
      continue;
    }
    const expected = arrays?.[slot];
    if (expected && !sameNumbers(ability.ddragonCooldown, expected)) say(`${slot}.ddragonCooldown ${show(ability.ddragonCooldown)} is not Data Dragon ${version}'s ${show(expected)}`);
    const was: Partial<DdragonIdentity> | undefined = ability.ddragonIdentity;
    const riotsOwn = identity?.[slot];
    if (!was || typeof was !== "object") say(`${slot} has no ddragonIdentity: copy Data Dragon ${version}'s id, name, ranks and charges from ddragon-${version}.identity.json`);
    else if (riotsOwn) {
      for (const field of ["id", "name", "maxRank", "charges"] as const) {
        if (was[field] !== riotsOwn[field]) say(`${slot}.ddragonIdentity.${field} ${JSON.stringify(was[field])} is not Data Dragon ${version}'s ${JSON.stringify(riotsOwn[field])}`);
      }
    }
    const ranks = ranksOf(slot, ability, identity);
    const spec = ability.cooldown;
    if (spec?.kind === "per-rank" && !sameNumbers(spec.seconds, ability.ddragonCooldown)) say(`${slot}: the per-rank cooldown ${show(spec.seconds)} is not ddragonCooldown ${show(ability.ddragonCooldown)}`);
    if (spec && curatedCooldownDisplay(spec, ranks) === null) say(`${slot}.cooldown cannot be shown as written: it needs numbers of seconds, whole charge counts above 0, one value or one per rank (${ranks ?? "unknown"}), levels from 1 to 18 paired with its values, or two or more forms`);
    if (spec) specProblems(spec).forEach((p) => say(`${slot}.cooldown: ${p}`));
    if (ability.modifiers) modifierProblems(ability.modifiers, ranks).forEach((p) => say(`${slot}.${p}`));
    if (ability.recast && !(Number.isInteger(ability.recast.count) && ability.recast.count >= 1)) say(`${slot}.recast.count ${ability.recast.count} is not a number of casts`);
    ability.facts.forEach((fact, i) => {
      if (!cited.has(fact.source)) say(`${slot}.facts[${i}] cites "${fact.source}", which is not one of its sources`);
      if (fact.appliesTo === undefined) say(`${slot}.facts[${i}] gives no appliesTo: who has the effect (self, target, allies or area)`);
      else if (!SUBJECTS.has(fact.appliesTo)) say(`${slot}.facts[${i}].appliesTo ${JSON.stringify(fact.appliesTo)} is not self, target, allies or area`);
      if (fact.tags !== undefined) {
        const tags: unknown[] = Array.isArray(fact.tags) ? fact.tags : [];
        if (!Array.isArray(fact.tags)) say(`${slot}.facts[${i}].tags is not a list`);
        for (const tag of tags) if (typeof tag !== "string" || !TAGS.has(tag)) say(`${slot}.facts[${i}].tags has ${JSON.stringify(tag)}, which is not in FACT_TAGS`);
        if (new Set(tags).size !== tags.length) say(`${slot}.facts[${i}].tags names a tag twice`);
      }
    });
  }
  (notes.levelNotes ?? []).forEach((note, i) => {
    if (!cited.has(note.source)) say(`levelNotes[${i}] cites "${note.source}", which is not one of its sources`);
    if (!Number.isInteger(note.level) || note.level < 1 || note.level > 18) say(`levelNotes[${i}] is at level ${note.level}, not a level from 1 to 18`);
    // What it rests on, so it is flagged once Riot changes that ability (view.ts).
    const basedOn: unknown = note.basedOn;
    if (!Array.isArray(basedOn) || basedOn.length === 0) say(`levelNotes[${i}] names no ability it rests on (basedOn: the slots of ${notes.championId}'s abilities, such as ["Q"])`);
    else {
      for (const slot of basedOn) {
        if (typeof slot !== "string" || !isSlot(slot)) say(`levelNotes[${i}].basedOn has ${JSON.stringify(slot)}, which is not an ability slot (P, Q, W, E or R)`);
        else if (!notes.abilities[slot]) say(`levelNotes[${i}].basedOn names ${slot}, which has no notes here`);
      }
      if (new Set(basedOn).size !== basedOn.length) say(`levelNotes[${i}].basedOn names a slot twice`);
    }
  });
  // Mechanics in our own words: never an instruction to the player or a verdict (REFUSED_WORDS).
  const file = `champions/${notes.championId}.ts`;
  for (const [at, text] of championTexts(notes)) {
    if (typeof text !== "string") continue;
    for (const { word, why } of refusedWords(text)) {
      if (!CHAMPION_REFUSED.has(why) || ALLOWED_WORDS.some((a) => a.file === file && a.at === at && a.word === word)) continue;
      say(`${at} uses "${word}", ${why}: champion notes state what an ability does and leave the decision to the player`);
    }
    const estimate = estimateWord(text);
    if (estimate) say(`${at} uses "${estimate}": a value the wiki marks as estimated is left out`);
  }
  for (const [at, text] of strings(notes, "")) {
    const problem = textProblem(text);
    if (problem) say(`${at} ${problem}`);
  }
  return out;
}

export function matchupProblems(notes: MatchupNotes, rules: Rules, championNotes: (championId: string) => ChampionNotes | null): string[] {
  const out: string[] = [];
  const say = (what: string) => out.push(`${notes.championId} vs ${notes.vsId}: ${what}`);
  const pair = [notes.championId, notes.vsId];
  for (const id of new Set(pair)) {
    if (!rules.champions.has(id)) say(`${id} is not a champion id in Riot's list (src/server/riot/fixtures/champions.fixture.json)`);
    else if (!championNotes(id)) say(`${id} has no champion notes, so the abilities named here cannot be checked`);
  }
  verificationProblems(notes.verified).forEach(say);
  sourceProblems(notes.sources, notes.verified?.checkedOn).forEach(say);
  const SOURCE_FIELDS = ["title", "url", "kind", "revision", "revisionTime", "licence"] as const;
  for (const source of notes.sources) {
    for (const id of new Set(pair)) {
      const theirs = championNotes(id)?.sources.find((s) => s.id === source.id);
      const differ = theirs ? SOURCE_FIELDS.filter((field) => theirs[field] !== source[field]) : [];
      if (differ.length) say(`source "${source.id}" is not the source ${id}'s notes cite under that id: its ${differ.join(", ")} differ`);
    }
  }
  const cited = new Set(notes.sources.map((s) => s.id));

  const refProblem = (ref: string): string | null => {
    const parsed = parseRef(ref);
    if (!parsed) return `"${ref}" is not an ability such as "Renekton.W"`;
    if (!pair.includes(parsed.championId)) return `"${ref}" is not an ability of ${notes.championId} or ${notes.vsId}`;
    if (!championNotes(parsed.championId)?.abilities[parsed.slot]) return `"${ref}" has no notes in ${parsed.championId}'s champion notes`;
    return null;
  };
  const checkRefs = (at: string, refs: readonly string[] | undefined) => {
    if (!refs?.length) say(`${at} names no ability it rests on`);
    for (const ref of refs ?? []) {
      const problem = refProblem(ref);
      if (problem) say(`${at}: ${problem}`);
    }
  };

  const briefing: Partial<MatchupNotes["briefing"]> = notes.briefing ?? {};
  const lane = briefing.lane ?? [];
  if (!briefing.threat) say("has no threat");
  if (!briefing.opportunity) say("has no opportunity");
  if (lane.length === 0) say("has no lane point");
  if (lane.length > MAX_LANE) say(`has ${lane.length} lane points, more than ${MAX_LANE}`);
  const points: Array<[string, BriefingPoint | undefined]> = [
    ["briefing.threat", briefing.threat],
    ["briefing.opportunity", briefing.opportunity],
    ...lane.map((point, i): [string, BriefingPoint] => [`briefing.lane[${i}]`, point]),
  ];
  for (const [at, point] of points) if (point) checkRefs(`${at}.basedOn`, point.basedOn);
  (notes.interactions ?? []).forEach((interaction, i) => {
    checkRefs(`interactions[${i}].abilities`, interaction.abilities);
    if (!cited.has(interaction.source)) say(`interactions[${i}] cites "${interaction.source}", which is not one of its sources`);
  });

  // The matchup holds no numbers of its own: its freshness is the champion notes', so it is checked
  // against the version they were (view.ts, matchupAbilityFreshness).
  const restsOn = new Set(
    [...points.flatMap(([, point]) => point?.basedOn ?? []), ...(notes.interactions ?? []).flatMap((interaction) => interaction.abilities ?? [])]
      .map((ref) => parseRef(ref)?.championId)
      .filter((id): id is string => !!id && pair.includes(id)),
  );
  for (const id of [...restsOn].sort()) {
    const theirs = championNotes(id)?.verified?.ddragonVersion;
    if (theirs !== undefined && theirs !== notes.verified?.ddragonVersion) say(`is checked against Data Dragon ${notes.verified?.ddragonVersion}, but ${id}'s notes, which it rests on, against ${theirs}: check both against the same version`);
  }

  // Considerations, never instructions or verdicts (REFUSED_WORDS).
  const file = `matchups/${notes.championId}-vs-${notes.vsId}.ts`;
  const texts: Array<[string, unknown]> = [
    ...points.map(([at, point]): [string, unknown] => [`${at}.text`, point?.text]),
    ...(notes.interactions ?? []).map((interaction, i): [string, unknown] => [`interactions[${i}].text`, interaction.text]),
  ];
  for (const [at, text] of texts) {
    if (typeof text !== "string") continue;
    for (const { word, why } of refusedWords(text)) {
      if (ALLOWED_WORDS.some((a) => a.file === file && a.at === at && a.word === word)) continue;
      say(`${at} uses "${word}", ${why}: a point states what the two kits do and leaves the decision to the player`);
    }
    const estimate = estimateWord(text);
    if (estimate) say(`${at} uses "${estimate}": a value the wiki marks as estimated is left out`);
  }
  for (const [at, text] of strings(notes, "")) {
    const problem = textProblem(text);
    if (problem) say(`${at} ${problem}`);
  }
  return out;
}

/**
 * What is wrong with the browser tests' pinned Data Dragon version (e2e/ddragon-version.ts), given
 * the versions the curated notes are checked against: it must be the newest of them, and have its
 * committed cooldowns and identity, so the specs read the data the newest notes were checked on.
 */
export function pinProblems(pin: string, checked: readonly string[], rules: Pick<Rules, "ddragon" | "identity">): string[] {
  const out: string[] = [];
  const newest = [...checked].sort((a, b) => compareDdragonVersions(a, b) ?? 0).at(-1);
  if (pin !== newest) out.push(`the browser tests pin Data Dragon ${pin} (e2e/ddragon-version.ts), not ${newest ?? "a version"}, the newest version the curated notes are checked against: move the pin with the re-check`);
  if (!rules.ddragon.has(pin)) out.push(`no committed Data Dragon cooldowns for the pinned ${pin} (ddragon-${pin}.cooldowns.json)`);
  if (!rules.identity.has(pin)) out.push(`no committed Data Dragon identity for the pinned ${pin} (ddragon-${pin}.identity.json)`);
  return out;
}

/* ---------- The committed files ---------- */

async function load<T>(kind: "champions" | "matchups"): Promise<Array<{ file: string; notes: T }>> {
  const dir = join(DIR, kind);
  const names = readdirSync(dir)
    .filter((name) => name.endsWith(".ts") && !/\.(test|d)\.ts$/.test(name))
    .sort();
  return Promise.all(names.map(async (name) => ({ file: `${kind}/${name}`, notes: ((await import(join(dir, name))) as { default: T }).default })));
}

const championFiles = await load<ChampionNotes>("champions");
const matchupFiles = await load<MatchupNotes>("matchups");

/** The committed Data Dragon files beside this one, of one kind: "cooldowns" or "identity". */
function savedFiles(kind: "cooldowns" | "identity") {
  const name = new RegExp(`^ddragon-(\\d+\\.\\d+\\.\\d+)\\.${kind}\\.json$`);
  return readdirSync(DIR).flatMap((file) => {
    const m = name.exec(file);
    return m ? [{ file, version: m[1]!, json: JSON.parse(readFileSync(join(DIR, file), "utf8")) as { _note?: unknown; version?: unknown; champions?: Record<string, Record<string, unknown>> } }] : [];
  });
}
const fixtures = savedFiles("cooldowns");
const identityFiles = savedFiles("identity");

const RULES: Rules = {
  champions: RIOT_IDS,
  ddragon: new Map(fixtures.map(({ version, json }) => [version, (json.champions ?? {}) as Record<string, Record<Slot, number[]>>])),
  identity: new Map(identityFiles.map(({ version, json }) => [version, (json.champions ?? {}) as Record<string, Record<Slot, DdragonIdentity>>])),
};

/** The committed offline fixture's records, by champion: Data Dragon's own data for its version, as the index keeps it. */
const OFFLINE = abilityFixture as { version: string; champions: Record<string, { abilities: Array<{ slot: Slot; id: string | null; name: string; maxRank: number; cooldown: number[]; charges: number | null }> }> };

describe("the curated registry", () => {
  it("finds the curated files", () => {
    expect(championFiles.length).toBeGreaterThanOrEqual(6);
    expect(matchupFiles.length).toBeGreaterThanOrEqual(3);
  });

  it("serves every champion file under the id it is named after", () => {
    expect(championFiles.filter(({ file, notes }) => !notes || file !== `champions/${notes.championId}.ts` || getChampionNotes(notes.championId) !== notes).map(({ file }) => file)).toEqual([]);
  });

  it("serves every matchup file under the two ids it is named after, in that direction only", () => {
    expect(matchupFiles.filter(({ file, notes }) => !notes || file !== `matchups/${notes.championId}-vs-${notes.vsId}.ts` || getMatchupNotes(notes.championId, notes.vsId) !== notes).map(({ file }) => file)).toEqual([]);
  });

  it("holds nothing but those files, for every champion in Riot's list", () => {
    const withNotes = new Set(championFiles.map(({ notes }) => notes?.championId));
    const enemies = (id: string) => matchupFiles.filter(({ notes }) => notes?.championId === id).map(({ notes }) => notes.vsId).sort();
    const wrong = [...RIOT_IDS].filter((id) => (getChampionNotes(id) !== null) !== withNotes.has(id) || [...curatedEnemiesFor(id)].sort().join() !== enemies(id).join());
    expect(wrong).toEqual([]);
    expect(getChampionNotes("constructor")).toBeNull();
    expect(getMatchupNotes("Renekton", "Ambessa")).toBeNull();
  });

  it("holds the three validation matchups", () => {
    const missing = VALIDATION_PAIRS.filter(([you, enemy]) => !getMatchupNotes(you, enemy) || !curatedEnemiesFor(you).includes(enemy) || !getChampionNotes(you) || !getChampionNotes(enemy));
    expect(missing.map(([you, enemy]) => `${you} vs ${enemy}`)).toEqual([]);
  });
});

describe("Data Dragon's committed cooldown arrays", () => {
  it("are there for every version a champion's notes were checked against", () => {
    const versions = new Set(championFiles.map(({ notes }) => notes.verified.ddragonVersion));
    expect([...versions].filter((v) => !RULES.ddragon.has(v))).toEqual([]);
  });

  it("are well formed: one array per slot, the passive's empty, for champions in Riot's list", () => {
    const problems = fixtures.flatMap(({ file, version, json }) => {
      const out: string[] = [];
      if (json.version !== version) out.push(`${file}: "version" is not ${version}`);
      for (const [id, slots] of Object.entries(json.champions ?? {})) {
        if (!RIOT_IDS.has(id)) out.push(`${file}: ${id} is not a champion in Riot's list`);
        if (Object.keys(slots).join() !== SLOTS.join()) out.push(`${file}: ${id} has ${Object.keys(slots).join(", ")}, not P, Q, W, E, R`);
        for (const slot of SLOTS) {
          const seconds = slots[slot];
          if (!Array.isArray(seconds) || !seconds.every((x) => typeof x === "number" && x >= 0)) out.push(`${file}: ${id}.${slot} is not an array of seconds`);
          else if (slot === "P" ? seconds.length !== 0 : seconds.length === 0) out.push(`${file}: ${id}.${slot} has ${seconds.length} ranks`);
        }
      }
      return out;
    });
    expect(fixtures.map(({ file }) => file)).toContain("ddragon-16.22.1.cooldowns.json");
    expect(problems).toEqual([]);
  });

  it("and the identities are well formed: the passive with no id, one rank and no charges; each spell with its id, name, ranks and charges", () => {
    const problems = identityFiles.flatMap(({ file, version, json }) => {
      const out: string[] = [];
      if (json.version !== version) out.push(`${file}: "version" is not ${version}`);
      if (typeof json._note !== "string" || !json._note.includes(`cdn/${version}/`)) out.push(`${file}: its _note does not say which of Riot's files it came from`);
      for (const [id, slots] of Object.entries(json.champions ?? {})) {
        if (!RIOT_IDS.has(id)) out.push(`${file}: ${id} is not a champion in Riot's list`);
        if (Object.keys(slots).join() !== SLOTS.join()) out.push(`${file}: ${id} has ${Object.keys(slots).join(", ")}, not P, Q, W, E, R`);
        for (const slot of SLOTS) {
          const a = slots[slot] as Partial<DdragonIdentity> | undefined;
          const shaped = !!a && Object.keys(a).sort().join() === "charges,id,maxRank,name" && typeof a.name === "string" && a.name.trim() !== "" && Number.isInteger(a.maxRank) && a.maxRank! >= 1 && (a.charges === null || (Number.isInteger(a.charges) && a.charges! > 0));
          const passive = slot === "P" ? a?.id === null && a?.maxRank === 1 && a?.charges === null : typeof a?.id === "string" && a.id !== "";
          if (!shaped || !passive) out.push(`${file}: ${id}.${slot} is not an id, a name, ranks and charges as Data Dragon gives them`);
        }
      }
      return out;
    });
    expect(identityFiles.map(({ file }) => file)).toContain("ddragon-16.22.1.identity.json");
    expect(problems).toEqual([]);
  });

  it("agree with the committed offline fixture where it is of the same version", () => {
    const problems: string[] = [];
    for (const { file, version, json } of [...fixtures, ...identityFiles]) {
      if (version !== OFFLINE.version) continue;
      for (const [id, slots] of Object.entries(json.champions ?? {})) {
        const record = OFFLINE.champions[id];
        if (!record) {
          problems.push(`${file}: ${id} is not in the offline fixture`);
          continue;
        }
        for (const slot of SLOTS) {
          const own = record.abilities.find((a) => a.slot === slot);
          const saved = slots[slot];
          const same = file.endsWith(".cooldowns.json") ? Array.isArray(saved) && !!own && sameNumbers(saved as number[], own.cooldown) : JSON.stringify(saved) === JSON.stringify(own ? { id: own.id, name: own.name, maxRank: own.maxRank, charges: own.charges } : null);
          if (!same) problems.push(`${file}: ${id}.${slot} differs from the offline fixture's record`);
        }
      }
    }
    expect(OFFLINE.version).toBe("16.22.1");
    expect(problems).toEqual([]);
  });
});

describe("the Data Dragon version the browser tests pin", () => {
  it("is the newest version the notes are checked against, with its committed cooldowns and identity", () => {
    const checked = [...new Set([...championFiles, ...matchupFiles].map(({ notes }) => notes.verified.ddragonVersion))];
    expect(pinProblems(E2E_DDRAGON_VERSION, checked, RULES)).toEqual([]);
  });

  it("reaches their server: playwright.config.ts passes it as DDRAGON_VERSION", () => {
    const config = readFileSync(join(DIR, "../../../../playwright.config.ts"), "utf8");
    expect(config).toContain('import { E2E_DDRAGON_VERSION } from "./e2e/ddragon-version";');
    expect(config).toMatch(/^\s+DDRAGON_VERSION: E2E_DDRAGON_VERSION,$/m);
  });
});

describe("the curated notes keep the rules", () => {
  it.each(championFiles.map(({ file, notes }) => [file, notes] as const))("%s", (_file, notes) => {
    expect(championProblems(notes, RULES)).toEqual([]);
  });

  it.each(matchupFiles.map(({ file, notes }) => [file, notes] as const))("%s", (_file, notes) => {
    expect(matchupProblems(notes, RULES, getChampionNotes)).toEqual([]);
  });

  it("allows a refused word only where a factual sentence still uses it, with its reason", () => {
    const stale = ALLOWED_WORDS.filter((a) => {
      const notes: unknown = [...matchupFiles, ...championFiles].find(({ file }) => file === a.file)?.notes;
      const text = notes ? strings(notes, "").find(([at]) => at === a.at)?.[1] : undefined;
      return !text || !refusedWords(text).some((r) => r.word === a.word) || a.reason.trim() === "";
    });
    expect(stale).toEqual([]);
  });
});

describe("the checks fire", () => {
  const renekton = () => structuredClone(getChampionNotes("Renekton")!);
  const matchup = () => structuredClone(getMatchupNotes("Ambessa", "Renekton")!);
  const problem = (pattern: RegExp) => expect.stringMatching(pattern);

  it("on an id that is not a champion in Riot's list", () => {
    expect(championProblems({ ...renekton(), championId: "Renekon" }, RULES)).toContainEqual(problem(/^Renekon: is not a champion id in Riot's list/));
    expect(matchupProblems({ ...matchup(), vsId: "Renekon" }, RULES, getChampionNotes)).toContainEqual(problem(/Renekon is not a champion id in Riot's list/));
  });

  it("on a slot outside P, Q, W, E and R, or a missing one", () => {
    const extra = renekton();
    (extra.abilities as Record<string, AbilityNotes>).X = extra.abilities.Q!;
    expect(championProblems(extra, RULES)).toContainEqual(problem(/"X" is not an ability slot/));
    const missing = renekton();
    delete missing.abilities.R;
    expect(championProblems(missing, RULES)).toContainEqual(problem(/has no notes for R$/));
  });

  it("on a ddragonCooldown that is not Data Dragon's, and a per-rank cooldown that is not ddragonCooldown", () => {
    const moved = renekton();
    moved.abilities.Q!.ddragonCooldown = [7, 7, 7, 7, 6];
    moved.abilities.Q!.cooldown = { kind: "per-rank", seconds: [7, 7, 7, 7, 6], starts: "on-cast" };
    expect(championProblems(moved, RULES)).toEqual(["Renekton: Q.ddragonCooldown [7, 7, 7, 7, 6] is not Data Dragon 16.22.1's [7, 7, 7, 7, 7]"]);
    const differs = renekton();
    differs.abilities.W!.cooldown = { kind: "per-rank", seconds: [16, 14, 12, 10, 9], starts: "after-effect-ends" };
    expect(championProblems(differs, RULES)).toEqual(["Renekton: W: the per-rank cooldown [16, 14, 12, 10, 9] is not ddragonCooldown [16, 14, 12, 10, 8]"]);
    const passive = renekton();
    passive.abilities.P!.ddragonCooldown = [10];
    expect(championProblems(passive, RULES)).toContainEqual(problem(/P\.ddragonCooldown \[10\] is not Data Dragon 16\.22\.1's \[\]/));
  });

  it("on notes checked against a Data Dragon version with no committed arrays", () => {
    const earlier = renekton();
    earlier.verified = { patch: "26.21", ddragonVersion: "16.21.1", checkedOn: "2026-11-02" };
    expect(championProblems(earlier, RULES)).toEqual(["Renekton: no committed Data Dragon cooldowns for 16.21.1 (ddragon-16.21.1.cooldowns.json)", "Renekton: no committed Data Dragon identity for 16.21.1 (ddragon-16.21.1.identity.json)"]);
  });

  it("on a fact, a level note or an interaction citing a source the notes do not list", () => {
    const fact = renekton();
    fact.abilities.E!.facts[0]!.source = "renekton-e2";
    expect(championProblems(fact, RULES)).toEqual(['Renekton: E.facts[0] cites "renekton-e2", which is not one of its sources']);
    const level = renekton();
    level.levelNotes = [{ level: 6, text: "Something stated.", source: "nowhere", basedOn: ["R"] }];
    expect(championProblems(level, RULES)).toEqual(['Renekton: levelNotes[0] cites "nowhere", which is not one of its sources']);
    const interaction = matchup();
    interaction.interactions[0]!.source = "renekton-x";
    expect(matchupProblems(interaction, RULES, getChampionNotes)).toEqual(['Ambessa vs Renekton: interactions[0] cites "renekton-x", which is not one of its sources']);
  });

  it("on a source that is not an https page on the wiki, Riot's developer site or Data Dragon", () => {
    const withUrl = (url: string) => {
      const notes = renekton();
      notes.sources[0] = { ...notes.sources[0]!, url };
      return championProblems(notes, RULES);
    };
    for (const url of ["http://wiki.leagueoflegends.com/en-us/Renekton", "https://leagueoflegends.fandom.com/wiki/Renekton", "https://wiki.leagueoflegends.com.example.net/en-us/Renekton", "wiki.leagueoflegends.com/en-us/Renekton"]) {
      expect(withUrl(url)).toContainEqual(problem(/is not an https page on wiki\.leagueoflegends\.com, developer\.riotgames\.com, ddragon\.leagueoflegends\.com/));
    }
    expect(withUrl("https://developer.riotgames.com/docs/lol")).toContainEqual(problem(/whose licence is Riot Games, not CC BY-SA 3\.0/));
    const noRevision = renekton();
    noRevision.sources[0] = { ...noRevision.sources[0]!, revision: undefined };
    expect(championProblems(noRevision, RULES)).toEqual(['Renekton: source "renekton-p" gives no revision of the wiki page']);
    const twice = renekton();
    twice.sources.push(twice.sources[0]!);
    expect(championProblems(twice, RULES)).toEqual(['Renekton: source "renekton-p" is listed twice']);
    const otherRevision = matchup();
    otherRevision.sources.find((s) => s.id === "renekton-w")!.revision = 1;
    expect(matchupProblems(otherRevision, RULES, getChampionNotes)).toEqual(["Ambessa vs Renekton: source \"renekton-w\" is not the source Renekton's notes cite under that id: its revision differ"]);
    const otherTitle = matchup();
    const w = otherTitle.sources.find((s) => s.id === "renekton-w")!;
    Object.assign(w, { title: "League of Legends Wiki: W (Renekton)", revisionTime: "2026-09-24T00:00:00Z" });
    expect(matchupProblems(otherTitle, RULES, getChampionNotes)).toEqual([
      "Ambessa vs Renekton: source \"renekton-w\" is titled \"League of Legends Wiki: W (Renekton)\", not \"League of Legends Wiki: Ruthless Predator (Renekton)\"",
      "Ambessa vs Renekton: source \"renekton-w\" is not the source Renekton's notes cite under that id: its title, revisionTime differ",
    ]);
  });

  it("on an ability reference that is not one of the two champions' abilities with notes", () => {
    const other = matchup();
    other.briefing.lane[0]!.basedOn = ["Darius.W"];
    expect(matchupProblems(other, RULES, getChampionNotes)).toEqual(['Ambessa vs Renekton: briefing.lane[0].basedOn: "Darius.W" is not an ability of Ambessa or Renekton']);
    const badSlot = matchup();
    badSlot.briefing.threat.basedOn = ["Renekton.X" as string as AbilityRef];
    expect(matchupProblems(badSlot, RULES, getChampionNotes)).toEqual(['Ambessa vs Renekton: briefing.threat.basedOn: "Renekton.X" is not an ability such as "Renekton.W"']);
    const withoutE = renekton();
    delete withoutE.abilities.E;
    const lookup = (id: string) => (id === "Renekton" ? withoutE : getChampionNotes(id));
    const noNotes = matchup();
    noNotes.interactions[0]!.abilities = ["Renekton.E"];
    expect(matchupProblems(noNotes, RULES, lookup)).toContainEqual(problem(/interactions\[0\]\.abilities: "Renekton\.E" has no notes in Renekton's champion notes/));
    const none = matchup();
    none.briefing.opportunity.basedOn = [];
    expect(matchupProblems(none, RULES, getChampionNotes)).toEqual(["Ambessa vs Renekton: briefing.opportunity.basedOn names no ability it rests on"]);
  });

  it("on markup, angle brackets, control characters, empty or over-long text", () => {
    const withDetail = (detail: string) => {
      const notes = renekton();
      notes.abilities.W!.facts[0]!.detail = detail;
      return championProblems(notes, RULES);
    };
    expect(withDetail("{{fd|0.75}} seconds")).toEqual(['Renekton: abilities.W.facts[0].detail contains wiki markup "{{"']);
    expect(withDetail("0.75 seconds, <b>1.5</b> with 50 Fury")).toEqual(['Renekton: abilities.W.facts[0].detail contains "<" or ">"']);
    expect(withDetail("50 Fury > 0.75 seconds")).toEqual(['Renekton: abilities.W.facts[0].detail contains "<" or ">"']);
    expect(withDetail(`0.75${String.fromCodePoint(0x09)}seconds`)).toEqual(["Renekton: abilities.W.facts[0].detail contains the control character U+0009"]);
    expect(withDetail(`0.75 seconds${String.fromCodePoint(0x202e)}`)).toEqual(["Renekton: abilities.W.facts[0].detail contains the control character U+202E"]);
    expect(withDetail(" ")).toEqual(["Renekton: abilities.W.facts[0].detail is empty"]);
    expect(withDetail("x".repeat(MAX_TEXT + 1))).toEqual([`Renekton: abilities.W.facts[0].detail is ${MAX_TEXT + 1} characters long, more than ${MAX_TEXT}`]);
    expect(withDetail("x".repeat(MAX_TEXT))).toEqual([]);
    const lane = matchup();
    lane.briefing.lane[1]!.text = "Dice {{as|25 to 35%}} armour reduction.";
    expect(matchupProblems(lane, RULES, getChampionNotes)).toEqual(['Ambessa vs Renekton: briefing.lane[1].text contains wiki markup "{{"']);
  });

  it("on verification fields of the wrong shape", () => {
    const withVerified = (verified: Partial<Verification>) => {
      const notes = renekton();
      notes.verified = { ...notes.verified, ...verified };
      return championProblems(notes, RULES);
    };
    expect(withVerified({ patch: "26.22.1" })).toContainEqual(problem(/verified\.patch "26\.22\.1" is not a patch such as "26\.22"/));
    expect(withVerified({ patch: "26.21" })).toEqual(['Renekton: verified.patch "26.21" is not Data Dragon 16.22.1\'s patch (26.22)']);
    expect(withVerified({ ddragonVersion: "16.22" })).toContainEqual(problem(/verified\.ddragonVersion "16\.22" is not a Data Dragon version/));
    expect(withVerified({ checkedOn: "16 Nov 2026" })).toEqual(['Renekton: verified.checkedOn "16 Nov 2026" is not a day such as "2026-11-16"']);
    expect(withVerified({ checkedOn: "2026-02-30" })).toEqual(['Renekton: verified.checkedOn "2026-02-30" is not a day such as "2026-11-16"']);
    const extra = renekton();
    extra.verified = { ...extra.verified, by: "someone" } as Verification;
    expect(championProblems(extra, RULES)).toContainEqual(problem(/verified has by, checkedOn, ddragonVersion, patch, not checkedOn, ddragonVersion and patch/));
  });

  it("on a matchup without a threat, an opportunity or a lane point, or with more than four lane points", () => {
    const noThreat = matchup();
    delete (noThreat.briefing as Partial<MatchupNotes["briefing"]>).threat;
    expect(matchupProblems(noThreat, RULES, getChampionNotes)).toEqual(["Ambessa vs Renekton: has no threat"]);
    const noOpportunity = matchup();
    delete (noOpportunity.briefing as Partial<MatchupNotes["briefing"]>).opportunity;
    expect(matchupProblems(noOpportunity, RULES, getChampionNotes)).toEqual(["Ambessa vs Renekton: has no opportunity"]);
    const noLane = matchup();
    noLane.briefing.lane = [];
    expect(matchupProblems(noLane, RULES, getChampionNotes)).toEqual(["Ambessa vs Renekton: has no lane point"]);
    const fiveLanes = matchup();
    fiveLanes.briefing.lane = [...fiveLanes.briefing.lane, ...fiveLanes.briefing.lane].slice(0, 5);
    expect(matchupProblems(fiveLanes, RULES, getChampionNotes)).toEqual(["Ambessa vs Renekton: has 5 lane points, more than 4"]);
  });

  it("on a ddragonIdentity that is not Data Dragon's id, name, ranks and charges for the version checked", () => {
    const right = renekton();
    right.abilities.W!.ddragonIdentity = { id: "RenektonPreExecute", name: "Ruthless Predator", maxRank: 5, charges: null };
    right.abilities.P!.ddragonIdentity = { id: null, name: "Reign of Anger", maxRank: 1, charges: null };
    expect(championProblems(right, RULES)).toEqual([]);
    const wrong = renekton();
    wrong.abilities.W!.ddragonIdentity = { id: "RenektonW", name: "Ruthless Predator", maxRank: 5, charges: 2 };
    expect(championProblems(wrong, RULES)).toEqual(['Renekton: W.ddragonIdentity.id "RenektonW" is not Data Dragon 16.22.1\'s "RenektonPreExecute"', "Renekton: W.ddragonIdentity.charges 2 is not Data Dragon 16.22.1's null"]);
    const earlier = renekton();
    earlier.verified = { patch: "26.21", ddragonVersion: "16.21.1", checkedOn: "2026-11-02" };
    earlier.abilities.W!.ddragonIdentity = right.abilities.W!.ddragonIdentity;
    expect(championProblems(earlier, RULES)).toContainEqual("Renekton: no committed Data Dragon identity for 16.21.1 (ddragon-16.21.1.identity.json)");
  });

  it("on a cooldown spec or a modifier the page cannot show as written", () => {
    const withSpec = (slot: "W" | "R", spec: CooldownSpec) => {
      const notes = renekton();
      notes.abilities[slot]!.cooldown = spec;
      return championProblems(notes, RULES);
    };
    expect(withSpec("R", { kind: "charges", charges: [3, 4], recharge: [30] })).toContainEqual(problem(/R\.cooldown cannot be shown as written: .*one value or one per rank \(3\)/));
    expect(withSpec("R", { kind: "charges", charges: [3, 4, 5], recharge: [35, 30, 25] })).toEqual([]);
    expect(withSpec("W", { kind: "forms", forms: [{ name: "Only", spec: { kind: "none" } }] })).toContainEqual(problem(/W\.cooldown cannot be shown as written/));
    expect(withSpec("W", { kind: "forms", forms: [{ name: "Same", spec: { kind: "none" } }, { name: "Same", spec: { kind: "none" } }] })).toEqual(["Renekton: W.cooldown: two of its forms have the same name"]);
    expect(withSpec("W", { kind: "per-rank", seconds: [16, 14, 12, 10, 8], starts: "sometime" as "on-cast" })).toEqual(['Renekton: W.cooldown: its start "sometime" is not a start such as "on-cast", or null where the source states none']);
    expect(withSpec("W", { kind: "per-rank", seconds: [16, 14, 12, 10, 8], starts: null })).toEqual([]);
    const passive = renekton();
    passive.abilities.P!.cooldown = { kind: "passive", seconds: [12, 9], scalesWith: "level", levels: [1, 7], starts: "on-hit" as "on-trigger" };
    expect(championProblems(passive, RULES)).toEqual(['Renekton: P.cooldown: its start "on-hit" is not "on-trigger" or "after-effect-ends"']);

    const withModifiers = (modifiers: AbilityModifiers) => {
      const notes = renekton();
      notes.abilities.E!.modifiers = modifiers;
      return championProblems(notes, RULES);
    };
    expect(withModifiers({ refund: { unit: "percent", amount: [25, 35, 45, 55, 65], when: "his first attack within 4 seconds" }, resetsAttack: true, lockout: { seconds: 0.5, static: true }, static: true })).toEqual([]);
    expect(withModifiers({ refund: { unit: "percent", amount: [140], when: "a hit" } })).toEqual([problem(/^Renekton: E\.modifiers\.refund cannot be shown/)]);
    expect(withModifiers({ refund: { unit: "seconds", amount: [2, 3], when: "a hit" } })).toEqual([problem(/^Renekton: E\.modifiers\.refund cannot be shown/)]);
    expect(withModifiers({ lockout: { seconds: 0 } })).toEqual(["Renekton: E.modifiers.lockout cannot be shown: its seconds must be a number above 0"]);
  });

  it("on a fact's tag outside the vocabulary or named twice, or a subject that is not one", () => {
    const withFact = (over: Record<string, unknown>) => {
      const notes = renekton();
      notes.abilities.W!.facts[0] = { ...notes.abilities.W!.facts[0]!, ...over };
      return championProblems(notes, RULES);
    };
    expect(withFact({ appliesTo: "target", tags: ["stun", "shield-break"] })).toEqual([]);
    expect(withFact({ tags: ["stun", "teleport"] })).toEqual(['Renekton: W.facts[0].tags has "teleport", which is not in FACT_TAGS']);
    expect(withFact({ tags: ["stun", "stun"] })).toEqual(["Renekton: W.facts[0].tags names a tag twice"]);
    expect(withFact({ appliesTo: "enemy" })).toEqual(['Renekton: W.facts[0].appliesTo "enemy" is not self, target, allies or area']);
  });

  it("on a source whose kind does not fit its page, or whose revision time is not a time, has no revision, or comes after the check", () => {
    const withSource = (over: Partial<Source>, index = 2) => {
      const notes = renekton();
      notes.sources[index] = { ...notes.sources[index]!, ...over };
      return championProblems(notes, RULES);
    };
    expect(withSource({ kind: "wiki-ability", revisionTime: "2026-09-23T19:37:45Z" })).toEqual([]);
    expect(withSource({ kind: "wiki-champion" })).toEqual([problem(/source "renekton-w" is of kind "wiki-champion", which is a champion's page/)]);
    expect(withSource({ kind: "ddragon" })).toEqual([problem(/source "renekton-w" is of kind "ddragon", which is a page on ddragon\.leagueoflegends\.com/)]);
    expect(withSource({ revisionTime: "23 Sep 2026" })).toEqual(['Renekton: source "renekton-w" revisionTime "23 Sep 2026" is not a time in UTC such as "2026-09-23T19:37:45Z"']);
    // The day the notes were checked, whichever it is: a revision saved that day passes, one saved the
    // next day is flagged.
    const checked = renekton().verified.checkedOn;
    const nextDay = new Date(Date.parse(`${checked}T08:00:00Z`) + 86_400_000).toISOString().replace(".000Z", "Z");
    expect(withSource({ revisionTime: `${checked}T08:00:00Z` })).toEqual([]);
    expect(withSource({ revisionTime: nextDay })).toEqual([`Renekton: source "renekton-w" revisionTime ${nextDay} is after the day the notes were checked (${checked})`]);
    const ddragon = renekton().sources.findIndex((x) => x.id === "ddragon");
    expect(withSource({ kind: "ddragon" }, ddragon)).toEqual([]);
    expect(withSource({ kind: "riot-docs" }, ddragon)).toEqual([problem(/is of kind "riot-docs", which is a page on developer\.riotgames\.com/)]);
    expect(withSource({ revisionTime: "2026-11-03T22:24:22Z" }, ddragon)).toEqual(["Renekton: source \"ddragon\" is one of Riot's pages, which have no wiki revision, but gives a revision or a revisionTime"]);
    expect(withSource({ revision: 1 }, ddragon)).toEqual(["Renekton: source \"ddragon\" is one of Riot's pages, which have no wiki revision, but gives a revision or a revisionTime"]);
  });

  it("on a matchup whose champion has no notes, or a level note off the level range", () => {
    expect(matchupProblems(matchup(), RULES, (id) => (id === "Renekton" ? null : getChampionNotes(id)))).toContainEqual(problem(/Renekton has no champion notes/));
    const level = renekton();
    level.levelNotes = [{ level: 0, text: "Something stated.", source: "renekton-p", basedOn: ["P"] }];
    expect(championProblems(level, RULES)).toEqual(["Renekton: levelNotes[0] is at level 0, not a level from 1 to 18"]);
    const recast = renekton();
    recast.abilities.E!.recast = { ...recast.abilities.E!.recast!, count: 0 };
    expect(championProblems(recast, RULES)).toEqual(["Renekton: E.recast.count 0 is not a number of casts"]);
  });

  it("on an ability without its ddragonIdentity, a fact that does not say who has the effect, or a source without its kind or revision time", () => {
    const noIdentity = renekton();
    delete (noIdentity.abilities.W as Partial<AbilityNotes>).ddragonIdentity;
    expect(championProblems(noIdentity, RULES)).toEqual(["Renekton: W has no ddragonIdentity: copy Data Dragon 16.22.1's id, name, ranks and charges from ddragon-16.22.1.identity.json"]);
    const noSubject = renekton();
    delete (noSubject.abilities.W!.facts[0] as Partial<Fact>).appliesTo;
    expect(championProblems(noSubject, RULES)).toEqual(["Renekton: W.facts[0] gives no appliesTo: who has the effect (self, target, allies or area)"]);
    const noKind = renekton();
    delete (noKind.sources[2] as Partial<Source>).kind;
    expect(championProblems(noKind, RULES)).toEqual(['Renekton: source "renekton-w" gives no kind (wiki-ability, wiki-champion, wiki-reference, ddragon or riot-docs)']);
    const noTime = renekton();
    delete noTime.sources[2]!.revisionTime;
    expect(championProblems(noTime, RULES)).toEqual(["Renekton: source \"renekton-w\" gives no revisionTime: when the revision read was saved, from the page's history"]);
  });

  it("on a wiki source whose title is not the house style: \"League of Legends Wiki: <Ability> (<Champion>)\", or the page's own title", () => {
    const withTitle = (index: number, title: string) => {
      const notes = renekton();
      notes.sources[index] = { ...notes.sources[index]!, title };
      return championProblems(notes, RULES);
    };
    expect(withTitle(2, "League of Legends Wiki: Template:Data Renekton/Ruthless Predator")).toEqual(['Renekton: source "renekton-w" is titled "League of Legends Wiki: Template:Data Renekton/Ruthless Predator", not "League of Legends Wiki: Ruthless Predator (Renekton)"']);
    expect(withTitle(2, "Ruthless Predator (Renekton)")).toEqual([problem(/is titled "Ruthless Predator \(Renekton\)", not "League of Legends Wiki: Ruthless Predator \(Renekton\)"/)]);
    // A reference page may say in brackets what it is for; an ability's page may not.
    const reference = renekton().sources.findIndex((x) => x.id === "ability-data");
    expect(withTitle(reference, "League of Legends Wiki: Template:Ability data")).toEqual([]);
    expect(withTitle(reference, "League of Legends Wiki: Template:Ability data (field meanings)")).toEqual([]);
    expect(withTitle(2, "League of Legends Wiki: Ruthless Predator (Renekton) (W)")).toEqual([problem(/is titled/)]);
    expect(matchupProblems(matchup(), RULES, getChampionNotes)).toEqual([]);
    const page = matchup();
    page.sources.find((x) => x.id === "renekton-page")!.title = "Renekton (League of Legends Wiki)";
    expect(matchupProblems(page, RULES, getChampionNotes)).toEqual(['Ambessa vs Renekton: source "renekton-page" is titled "Renekton (League of Legends Wiki)", not "League of Legends Wiki: Renekton"']);
  });

  it("on a matchup checked against another Data Dragon version than the champion notes it rests on", () => {
    const later = (id: string) => (id === "Renekton" ? { ...renekton(), verified: { patch: "26.23", ddragonVersion: "16.23.1", checkedOn: "2026-11-30" } } : getChampionNotes(id));
    expect(matchupProblems(matchup(), RULES, later)).toEqual(["Ambessa vs Renekton: is checked against Data Dragon 16.22.1, but Renekton's notes, which it rests on, against 16.23.1: check both against the same version"]);
    const earlier = matchup();
    earlier.verified = { patch: "26.21", ddragonVersion: "16.21.1", checkedOn: "2026-11-02" };
    expect(matchupProblems(earlier, RULES, getChampionNotes)).toEqual([
      "Ambessa vs Renekton: is checked against Data Dragon 16.21.1, but Ambessa's notes, which it rests on, against 16.22.1: check both against the same version",
      "Ambessa vs Renekton: is checked against Data Dragon 16.21.1, but Renekton's notes, which it rests on, against 16.22.1: check both against the same version",
    ]);
    // Only the champions it rests on count: a matchup resting on Renekton alone is not held to Ambessa's version.
    const renektonOnly = matchup();
    renektonOnly.briefing.opportunity.basedOn = ["Renekton.W"];
    renektonOnly.briefing.lane = renektonOnly.briefing.lane.map((point) => ({ ...point, basedOn: ["Renekton.E"] }));
    renektonOnly.interactions = renektonOnly.interactions.map((interaction) => ({ ...interaction, abilities: ["Renekton.W"] }));
    const ambessaLater = (id: string) => (id === "Ambessa" ? { ...getChampionNotes("Ambessa")!, verified: { patch: "26.23", ddragonVersion: "16.23.1", checkedOn: "2026-11-30" } } : getChampionNotes(id));
    expect(matchupProblems(renektonOnly, RULES, ambessaLater)).toEqual([]);
  });

  it("on a word in a briefing point or an interaction that dictates play or claims too much", () => {
    const withLane = (text: string) => {
      const notes = matchup();
      notes.briefing.lane[0]!.text = text;
      return matchupProblems(notes, RULES, getChampionNotes);
    };
    const said = (text: string) => withLane(text).map((p) => /uses "([^"]+)"/.exec(p)?.[1]);
    expect(withLane("Ambessa should wait for Ruthless Predator.")).toEqual([
      'Ambessa vs Renekton: briefing.lane[0].text uses "should", an instruction to the player: a point states what the two kits do and leaves the decision to the player',
      'Ambessa vs Renekton: briefing.lane[0].text uses "wait for", an instruction to the player: a point states what the two kits do and leaves the decision to the player',
    ]);
    // Any case, straight or curly apostrophes, phrases across spaces.
    expect(said("This is ALWAYS a Free  Win.")).toEqual(["always", "free win", "win"]);
    expect(said("Renekton can’t lose this trade.")).toEqual(["can't lose"]);
    expect(said("You must never be stunned: an easy, guaranteed auto-win.")).toEqual(["never", "guaranteed", "must", "you", "easy", "auto-win"]);
    expect(said("Punish his cooldown: Ambessa counters Renekton, the best pick.")).toEqual(["best", "counters", "punish"]);
    // Whole words only: these use none.
    expect(withLane("Nevertheless, Wind Slash and the twin drakehounds never... encounter a mustard counterattack.")).toEqual([problem(/uses "never"/)]);
    expect(withLane("Wind Slash, twin drakehounds, an encounter, a counterattack and a young champion.")).toEqual([]);
    // The threat, the opportunity and the interactions are held to it too.
    const threat = matchup();
    threat.briefing.threat.text = "Ambessa must dodge Ruthless Predator.";
    expect(matchupProblems(threat, RULES, getChampionNotes)).toEqual([problem(/^Ambessa vs Renekton: briefing\.threat\.text uses "must", an instruction to the player/)]);
    const interaction = matchup();
    interaction.interactions[0]!.text = "Repudiation's shield is always removed.";
    expect(matchupProblems(interaction, RULES, getChampionNotes)).toEqual([problem(/^Ambessa vs Renekton: interactions\[0\]\.text uses "always", an absolute claim/)]);
    // Champion notes describe mechanics, and may say what an ability never does.
    const notes = renekton();
    notes.abilities.R!.details = ["Dying during the cast time never refunds the cooldown."];
    expect(championProblems(notes, RULES)).toEqual([]);
  });

  it("on a word in champion notes that instructs the player or gives a verdict, wherever the page shows it", () => {
    const said = (edit: (notes: ChampionNotes) => void) => {
      const notes = renekton();
      edit(notes);
      return championProblems(notes, RULES);
    };
    expect(
      said((n) => {
        n.levelNotes = [{ level: 6, text: "At level 6 Renekton should go all-in.", source: "renekton-r", basedOn: ["R"] }];
      }),
    ).toEqual([
      'Renekton: levelNotes[0].text uses "should", an instruction to the player: champion notes state what an ability does and leave the decision to the player',
      'Renekton: levelNotes[0].text uses "all-in", a verdict on the matchup: champion notes state what an ability does and leave the decision to the player',
    ]);
    expect(said((n) => (n.abilities.W!.details = ["Avoid trading while he has 50 Fury."]))).toEqual([problem(/^Renekton: abilities\.W\.details\[0\] uses "avoid", an instruction to the player/)]);
    expect(said((n) => (n.abilities.W!.facts[0] = { ...n.abilities.W!.facts[0]!, label: "You must dodge it", detail: "Punish him when it is down." }))).toEqual([
      problem(/abilities\.W\.facts\[0\]\.label uses "must"/),
      problem(/abilities\.W\.facts\[0\]\.label uses "you"/),
      problem(/abilities\.W\.facts\[0\]\.detail uses "punish"/),
    ]);
    expect(said((n) => (n.abilities.W!.cooldownNote = "Your window is 7 seconds."))).toEqual([problem(/abilities\.W\.cooldownNote uses "your"/)]);
    expect(said((n) => (n.abilities.E!.recast = { ...n.abilities.E!.recast!, note: "Dice: the best follow-up." }))).toEqual([problem(/abilities\.E\.recast\.note uses "best"/)]);
    expect(said((n) => (n.abilities.E!.modifiers = { refund: { unit: "seconds", amount: [2], when: "a hit you land" } }))).toEqual([problem(/abilities\.E\.modifiers\.refund\.when uses "you"/)]);
    // Data Dragon's names and the sources are Riot's and the wiki's words, not the notes': an ability may be called "Counter Strike".
    expect(said((n) => (n.abilities.W!.ddragonIdentity = { ...n.abilities.W!.ddragonIdentity, name: "Counter Strike" }))).toEqual([problem(/W\.ddragonIdentity\.name "Counter Strike" is not Data Dragon/)]);
  });

  it("on a level note that names no ability it rests on, or one that is not a slot with notes", () => {
    const withLevel = (basedOn: unknown) => {
      const notes = renekton();
      notes.levelNotes = [{ level: 6, text: "Something stated.", source: "renekton-r", basedOn: basedOn as Slot[] }];
      return championProblems(notes, RULES);
    };
    expect(withLevel(["R"])).toEqual([]);
    expect(withLevel([])).toEqual(['Renekton: levelNotes[0] names no ability it rests on (basedOn: the slots of Renekton\'s abilities, such as ["Q"])']);
    expect(withLevel(undefined)).toEqual(['Renekton: levelNotes[0] names no ability it rests on (basedOn: the slots of Renekton\'s abilities, such as ["Q"])']);
    expect(withLevel(["X"])).toEqual(['Renekton: levelNotes[0].basedOn has "X", which is not an ability slot (P, Q, W, E or R)']);
    expect(withLevel(["R", "R"])).toEqual(["Renekton: levelNotes[0].basedOn names a slot twice"]);
    const withoutR = renekton();
    delete withoutR.abilities.R;
    withoutR.levelNotes = [{ level: 6, text: "Something stated.", source: "renekton-r", basedOn: ["R"] }];
    expect(championProblems(withoutR, RULES)).toContainEqual("Renekton: levelNotes[0].basedOn names R, which has no notes here");
  });

  it("on a value given as an estimate, in champion notes or a matchup", () => {
    const ornn = structuredClone(getChampionNotes("Ornn")!);
    ornn.abilities.W!.details = ["At an estimated 190 movement speed or less he does not lunge at all."];
    expect(championProblems(ornn, RULES)).toEqual(['Ornn: abilities.W.details[0] uses "estimated": a value the wiki marks as estimated is left out']);
    const levels = renekton();
    levels.levelNotes = [{ level: 6, text: "Dominus lasts APPROXIMATELY 15 seconds.", source: "renekton-r", basedOn: ["R"] }];
    expect(championProblems(levels, RULES)).toEqual([problem(/^Renekton: levelNotes\[0\]\.text uses "approximately": a value the wiki marks as estimated is left out$/)]);
    const withLane = (text: string) => {
      const notes = matchup();
      notes.briefing.lane[0]!.text = text;
      return matchupProblems(notes, RULES, getChampionNotes);
    };
    expect(withLane("The knock-back lasts roughly 0.4 s.")).toEqual([problem(/^Ambessa vs Renekton: briefing\.lane\[0\]\.text uses "roughly": a value the wiki marks as estimated is left out$/)]);
    // Whole words only.
    expect(withLane("An underestimated range, and an estimation-free page.")).toEqual([]);
  });
});

describe("the pin check fires", () => {
  it("on a pin that is not the newest version the notes are checked against, or one without its committed files", () => {
    expect(pinProblems("16.22.1", ["16.22.1"], RULES)).toEqual([]);
    // The notes re-checked on a newer version, the pin left behind.
    expect(pinProblems("16.22.1", ["16.22.1", "16.24.1"], { ddragon: new Map([...RULES.ddragon, ["16.24.1", {}]]), identity: new Map([...RULES.identity, ["16.24.1", {}]]) })).toEqual([
      "the browser tests pin Data Dragon 16.22.1 (e2e/ddragon-version.ts), not 16.24.1, the newest version the curated notes are checked against: move the pin with the re-check",
    ]);
    // A pin on a version no notes are checked against, with no files of its own.
    expect(pinProblems("16.21.1", ["16.22.1"], RULES)).toEqual([
      "the browser tests pin Data Dragon 16.21.1 (e2e/ddragon-version.ts), not 16.22.1, the newest version the curated notes are checked against: move the pin with the re-check",
      "no committed Data Dragon cooldowns for the pinned 16.21.1 (ddragon-16.21.1.cooldowns.json)",
      "no committed Data Dragon identity for the pinned 16.21.1 (ddragon-16.21.1.identity.json)",
    ]);
    // Versions compared as numbers, not text: 16.9.1 is older than 16.10.1.
    expect(pinProblems("16.10.1", ["16.9.1", "16.10.1"], { ddragon: new Map([["16.10.1", {}]]), identity: new Map([["16.10.1", {}]]) })).toEqual([]);
  });
});

describe("the corrections of the review of 16 Nov 2026 hold", () => {
  it("Riven's Q gives no one window for both recasts: Broken Wings' page opens each for 4 seconds after the cast before it", () => {
    const recast = getChampionNotes("Riven")!.abilities.Q!.recast!;
    expect(recast.count).toBe(2);
    expect(recast.windowSeconds).toBeUndefined();
    expect(recast.note).toMatch(/^Each recast is open for 4 seconds after the cast before it/);
  });

  it("Ornn's W gives no speed below which he does not lunge: Bellows Breath's page marks it as estimated", () => {
    const texts = championTexts(getChampionNotes("Ornn")!).filter((entry): entry is [string, string] => entry[0].startsWith("abilities.W.") && typeof entry[1] === "string");
    expect(texts.filter(([, text]) => /\b190\b|movement speed or less/.test(text))).toEqual([]);
  });

  it("Gwen vs Ornn credits the Renekton page, whose definition of a stun as an immobilising effect its threat rests on, as Ambessa vs Renekton does", () => {
    const page = getMatchupNotes("Ambessa", "Renekton")!.sources.find((s) => s.id === "renekton-page");
    expect(page).toMatchObject({ url: "https://wiki.leagueoflegends.com/en-us/Renekton", revision: 4028014 });
    expect(getMatchupNotes("Gwen", "Ornn")!.sources.find((s) => s.id === "renekton-page")).toEqual(page);
  });
});
