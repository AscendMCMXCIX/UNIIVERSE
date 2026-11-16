import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SLOTS, type AbilityNotes, type AbilityRef, type BriefingPoint, type ChampionNotes, type MatchupNotes, type Slot, type Source, type Verification } from "@/domain/matchup-intel/types";
import { patchFromVersion, publicPatchName } from "@/domain/patch";
import championList from "@/server/riot/fixtures/champions.fixture.json";
import { curatedEnemiesFor, getChampionNotes, getMatchupNotes } from "./index";

/*
  The curated notes keep the rules they are written under (docs/MATCHUP_INTEL.md, "Curated notes"):
  - every file in champions/ and matchups/ is in the registry (index.ts) under its own ids, and the
    registry holds nothing else;
  - every id is a champion in Riot's list (src/server/riot/fixtures/champions.fixture.json), and a
    champion's notes cover the slots P, Q, W, E and R, and no others;
  - each ability's ddragonCooldown is Data Dragon's array for the version the notes were checked
    against, and a per-rank cooldown repeats it;
  - every fact, level note and interaction cites one of its notes' sources, and every source is an
    https page on wiki.leagueoflegends.com (with its revision, CC BY-SA 3.0), developer.riotgames.com
    or ddragon.leagueoflegends.com (Riot Games);
  - every ability a briefing point or an interaction rests on belongs to one of the two champions
    and has notes of its own;
  - every text is plain and short: no wiki markup ("{{"), no "<" or ">", no control characters, at
    most 300 characters;
  - `verified` is a patch, a Data Dragon version and a day, in those shapes;
  - a matchup has a threat, an opportunity and one to four lane points;
  - the three validation matchups exist.

  Data Dragon's arrays come from ddragon-<version>.cooldowns.json beside this file. The one for
  16.22.1 was generated on 16 Nov 2026 from Riot's champion files,
  https://ddragon.leagueoflegends.com/cdn/16.22.1/data/en_US/champion/<Champion>.json: each spell's
  "cooldown" array in Riot's order (Q, W, E, R), and [] for the passive, which has no cooldown in
  Data Dragon. Notes checked against another version need that version's file.
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

export interface Rules {
  /** Riot's champion ids. */
  champions: ReadonlySet<string>;
  ddragon: DdragonCooldowns;
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

export function sourceProblems(sources: readonly Source[]): string[] {
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
    if (licence === "CC BY-SA 3.0" && !(Number.isInteger(source.revision) && source.revision! > 0)) out.push(`source "${source.id}" gives no revision of the wiki page`);
  }
  return out;
}

export function championProblems(notes: ChampionNotes, rules: Rules): string[] {
  const out: string[] = [];
  const say = (what: string) => out.push(`${notes.championId}: ${what}`);
  if (!rules.champions.has(notes.championId)) say("is not a champion id in Riot's list (src/server/riot/fixtures/champions.fixture.json)");
  verificationProblems(notes.verified).forEach(say);
  sourceProblems(notes.sources).forEach(say);
  const cited = new Set(notes.sources.map((s) => s.id));

  const version = notes.verified?.ddragonVersion;
  const riot = rules.ddragon.get(version);
  const arrays = riot?.[notes.championId];
  if (!riot) say(`no committed Data Dragon cooldowns for ${version} (ddragon-${version}.cooldowns.json)`);
  else if (!arrays) say(`is not in ddragon-${version}.cooldowns.json`);

  for (const slot of Object.keys(notes.abilities)) if (!isSlot(slot)) say(`"${slot}" is not an ability slot (P, Q, W, E or R)`);
  for (const slot of SLOTS) {
    const ability = notes.abilities[slot];
    if (!ability) {
      say(`has no notes for ${slot}`);
      continue;
    }
    const expected = arrays?.[slot];
    if (expected && !sameNumbers(ability.ddragonCooldown, expected)) say(`${slot}.ddragonCooldown ${show(ability.ddragonCooldown)} is not Data Dragon ${version}'s ${show(expected)}`);
    const spec = ability.cooldown;
    if (spec?.kind === "per-rank" && !sameNumbers(spec.seconds, ability.ddragonCooldown)) say(`${slot}: the per-rank cooldown ${show(spec.seconds)} is not ddragonCooldown ${show(ability.ddragonCooldown)}`);
    if (ability.recast && !(Number.isInteger(ability.recast.count) && ability.recast.count >= 1)) say(`${slot}.recast.count ${ability.recast.count} is not a number of casts`);
    ability.facts.forEach((fact, i) => {
      if (!cited.has(fact.source)) say(`${slot}.facts[${i}] cites "${fact.source}", which is not one of its sources`);
    });
  }
  (notes.levelNotes ?? []).forEach((note, i) => {
    if (!cited.has(note.source)) say(`levelNotes[${i}] cites "${note.source}", which is not one of its sources`);
    if (!Number.isInteger(note.level) || note.level < 1 || note.level > 18) say(`levelNotes[${i}] is at level ${note.level}, not a level from 1 to 18`);
  });
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
  sourceProblems(notes.sources).forEach(say);
  for (const source of notes.sources) {
    for (const id of new Set(pair)) {
      const theirs = championNotes(id)?.sources.find((s) => s.id === source.id);
      if (theirs && (theirs.url !== source.url || theirs.revision !== source.revision || theirs.licence !== source.licence)) say(`source "${source.id}" is not the page and revision ${id}'s notes cite under that id`);
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
  for (const [at, text] of strings(notes, "")) {
    const problem = textProblem(text);
    if (problem) say(`${at} ${problem}`);
  }
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

const FIXTURE_NAME = /^ddragon-(\d+\.\d+\.\d+)\.cooldowns\.json$/;
const fixtures = readdirSync(DIR).flatMap((file) => {
  const m = FIXTURE_NAME.exec(file);
  return m ? [{ file, version: m[1]!, json: JSON.parse(readFileSync(join(DIR, file), "utf8")) as { version?: unknown; champions?: Record<string, Record<string, unknown>> } }] : [];
});

const RULES: Rules = {
  champions: RIOT_IDS,
  ddragon: new Map(fixtures.map(({ version, json }) => [version, (json.champions ?? {}) as Record<string, Record<Slot, number[]>>])),
};

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
});

describe("the curated notes keep the rules", () => {
  it.each(championFiles.map(({ file, notes }) => [file, notes] as const))("%s", (_file, notes) => {
    expect(championProblems(notes, RULES)).toEqual([]);
  });

  it.each(matchupFiles.map(({ file, notes }) => [file, notes] as const))("%s", (_file, notes) => {
    expect(matchupProblems(notes, RULES, getChampionNotes)).toEqual([]);
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
    expect(championProblems(earlier, RULES)).toEqual(["Renekton: no committed Data Dragon cooldowns for 16.21.1 (ddragon-16.21.1.cooldowns.json)"]);
  });

  it("on a fact, a level note or an interaction citing a source the notes do not list", () => {
    const fact = renekton();
    fact.abilities.E!.facts[0]!.source = "renekton-e2";
    expect(championProblems(fact, RULES)).toEqual(['Renekton: E.facts[0] cites "renekton-e2", which is not one of its sources']);
    const level = renekton();
    level.levelNotes = [{ level: 6, text: "Something stated.", source: "nowhere" }];
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
    expect(matchupProblems(otherRevision, RULES, getChampionNotes)).toEqual(["Ambessa vs Renekton: source \"renekton-w\" is not the page and revision Renekton's notes cite under that id"]);
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

  it("on a matchup whose champion has no notes, or a level note off the level range", () => {
    expect(matchupProblems(matchup(), RULES, (id) => (id === "Renekton" ? null : getChampionNotes(id)))).toContainEqual(problem(/Renekton has no champion notes/));
    const level = renekton();
    level.levelNotes = [{ level: 0, text: "Something stated.", source: "renekton-p" }];
    expect(championProblems(level, RULES)).toEqual(["Renekton: levelNotes[0] is at level 0, not a level from 1 to 18"]);
    const recast = renekton();
    recast.abilities.E!.recast = { ...recast.abilities.E!.recast!, count: 0 };
    expect(championProblems(recast, RULES)).toEqual(["Renekton: E.recast.count 0 is not a number of casts"]);
  });
});
