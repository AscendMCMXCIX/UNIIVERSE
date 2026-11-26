import { LANE_ORDER } from "@/domain/match-analysis";
import { comparePatches, publicPatchName } from "@/domain/patch";
import { RIOT_POSITION_TO_ROLE, type Role } from "@/domain/roles";

/*
  CHAMPION INTEL's builds and runes (docs/CHAMPION_INTEL.md, "Builds and runes"; the owner's
  request of 25 Nov 2026): what the players of the team's stored matches chose on one champion in
  one role, as totals counted in the database (server/champion-builds), and which choice of each
  part is the most common and which, if any, has a clearly higher win rate. Pure, so every rule is
  tested without a database (champion-builds.test.ts).

  - The games: every player on the champion (both teams, all ten seats) in stored Summoner's Rift
    draft games (Normal Draft, Ranked Solo/Duo, Ranked Flex, Clash) that a current team member
    played, remakes left out, by Riot's position. Not a sample of all League players.
  - The patch: the game's current patch; where the champion has fewer than MIN_SECTION_GAMES games
    in a role on it, the previous patch is added and the words say so. Never an older patch as the
    current one: where the current patch has no game yet, the words name the previous patch alone
    ("patch 26.21, none yet on 26.22"), never a range.
  - Each part counts its own games: runes and spells every record, stat shards only records kept
    from 20 Nov 2026, items and the skill order only games with the player's timeline.
  - Near-identical choices count as one (a family): the same core items in another order, the same
    keystone and secondary tree with other minor runes, the same skill order with other first points.
  - "Most common" (Standard): the family with the most games among the reliable ones (at least
    MIN_CHOICE_GAMES games and MIN_CHOICE_SHARE of the part's games). "Highest win rate"
    (Highest-performing): among families of at least MIN_PERFORMER_GAMES games and
    MIN_PERFORMER_SHARE, the best 95% Wilson lower bound of the win rate (a rate that a few lucky games
    cannot lift), shown only where it is another family whose win rate is PERFORMER_MARGIN or more
    above the most common's. Never the highest raw win rate of a small sample.
  Factual statistics only: no advice and no verdict (docs/RIOT_COMPLIANCE.md, the game-integrity row).
*/

/** The rules' revision: part of the cache key, so a change of rules recomputes every count. */
export const BUILDS_FORMAT = 1;
/** Summoner's Rift's draft queues: Normal Draft, Ranked Solo/Duo, Ranked Flex, Clash. Swiftplay and Quickplay run a faster economy; Blind Pick is not drafted. */
export const BUILD_QUEUES = [400, 420, 440, 700] as const;
/** Below this many games of a champion in a role (on the patch window) the section shows nothing but the honest empty line: a pick share of 20 games is already ±22 points at 95%. */
export const MIN_SECTION_GAMES = 20;
/** Each part needs this many games that record it (items and skills need a timeline; shards a record from 20 Nov 2026). */
export const MIN_PART_GAMES = 20;
/** A choice seen fewer times, or in a smaller share of the part's games, is not one anyone can rely on. */
export const MIN_CHOICE_GAMES = 10;
export const MIN_CHOICE_SHARE = 0.1;
/** The highest win rate is read only among choices this common: at 10 games 9 wins would beat everything (its lower bound 0.60). */
export const MIN_PERFORMER_GAMES = 20;
export const MIN_PERFORMER_SHARE = 0.15;
/** "Effectively the same": the highest win rate is shown only this many points above the most common's. */
export const PERFORMER_MARGIN = 0.02;
/** What is bought in the first minute, less what is sold in it, is the starting set. */
export const START_MS = 60_000;
/** The two-sided 95% normal quantile. */
const Z_95 = 1.959963984540054;

export type BuildLane = (typeof LANE_ORDER)[number];
export type SkillKey = "Q" | "W" | "E" | "R";

/** Wilson score interval of a win rate (wins of games), 95% by default; null without games. */
export function wilsonInterval(wins: number, games: number, z = Z_95): { low: number; high: number } | null {
  if (!(games > 0)) return null;
  const p = Math.min(Math.max(wins / games, 0), 1);
  const z2 = z * z;
  const centre = (p + z2 / (2 * games)) / (1 + z2 / games);
  const half = (z / (1 + z2 / games)) * Math.sqrt((p * (1 - p)) / games + z2 / (4 * games * games));
  return { low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
}

/* ---------------------------------------------------------------------------------------------
   Items: which purchases are a starting item, boots, or a completed item.
--------------------------------------------------------------------------------------------- */

/** What the rules read of an item: Data Dragon's shop facts (RiotBuildData.itemInfo, current version). */
export interface BuildItemInfo {
  gold: { total: number; purchasable: boolean };
  tags: readonly string[];
  from: readonly string[];
  into: readonly string[];
  depth: number;
}

export interface ItemClasses {
  /** Completed items (the core and full build). */
  completed: string[];
  /** Boots of the second tier or later (the first one bought is the boots choice). */
  boots: string[];
  /** Every item the data knows: a game with a purchase outside it is left out of the item parts, never skipped over. */
  known: string[];
}

/**
 * Sorts Summoner's Rift's items for the item parts (ids as strings):
 * - boots: an item tagged Boots, or built from one (Gunmetal Greaves carries no Boots tag), of depth 2
 *   or more (Boots, depth 1, is a component);
 * - completed: purchasable, neither boots nor a consumable nor a trinket, worth 1,000 gold or more,
 *   and building into nothing a player can buy: an item that only turns into another (Manamune into
 *   Muramana, Archangel's Staff into Seraph's Embrace, Winter's Approach into Fimbulwinter, Whispering
 *   Circlet into Diadem of Songs) is completed when bought, and the copies Data Dragon lists for other
 *   modes (ids it does not hold as Summoner's Rift's) do not count as something to build into.
 */
export function itemClasses(items: Readonly<Record<string, BuildItemInfo>>): ItemClasses {
  const memo = new Map<string, boolean>();
  const bootsFamily = (id: string, seen: Set<string> = new Set()): boolean => {
    const known = memo.get(id);
    if (known !== undefined) return known;
    const info = items[id];
    if (!info || seen.has(id)) return false;
    seen.add(id);
    const yes = info.tags.includes("Boots") || info.from.some((f) => bootsFamily(f, seen));
    memo.set(id, yes);
    return yes;
  };
  const completed: string[] = [];
  const boots: string[] = [];
  const ids = Object.keys(items).sort((a, b) => Number(a) - Number(b));
  for (const id of ids) {
    const info = items[id]!;
    if (bootsFamily(id)) {
      if (info.depth >= 2) boots.push(id);
      continue;
    }
    if (!info.gold.purchasable || info.gold.total < 1000) continue;
    if (info.tags.includes("Consumable") || info.tags.includes("Trinket")) continue;
    if (info.into.some((t) => items[t]?.gold.purchasable === true)) continue;
    completed.push(id);
  }
  return { completed, boots, known: ids };
}

/**
 * The starting set: items bought before START_MS, less one of the same item for each sale before it
 * (undone purchases are already gone from a stored timeline), ascending, repeats kept. The statement
 * counts it the same way (server/champion-builds/query.ts).
 */
export function startingSet(purchases: ReadonlyArray<readonly [number, number]>, sold: ReadonlyArray<readonly [number, number]> = []): number[] {
  const left = new Map<number, number>();
  for (const [t, id] of purchases) if (t < START_MS) left.set(id, (left.get(id) ?? 0) + 1);
  for (const [t, id] of sold) if (t < START_MS && (left.get(id) ?? 0) > 0) left.set(id, left.get(id)! - 1);
  return [...left.entries()].flatMap(([id, n]) => Array.from({ length: n }, () => id)).sort((a, b) => a - b);
}

/* ---------------------------------------------------------------------------------------------
   Skills: the order the skills were maxed in.
--------------------------------------------------------------------------------------------- */

/** Each ability's ranks (Data Dragon's maxrank) by slot: 1 Q, 2 W, 3 E, 4 R. */
export type SkillRanks = Readonly<Record<1 | 2 | 3 | 4, number>>;
const SKILL_OF: Record<number, SkillKey> = { 1: "Q", 2: "W", 3: "E", 4: "R" };
/** Skill points read: one per level. */
export const SKILL_POINTS_READ = 18;

/** Whether R is levelled like the basic abilities (Udyr's four forms take six ranks each); an ultimate takes three or four. */
export const rIsBasic = (ranks: SkillRanks) => ranks[4] >= 5;

/**
 * The order a player maxed their skills in, from the slots levelled in order (1 Q … 4 R): the skills
 * that reached their last rank (each ability's own, never a fixed 5), in the order they did, then the
 * others by points; and the first three points. Null when no skill was maxed, or when two unmaxed
 * skills have as many points (their order is not known yet), or with fewer than three points. R joins
 * only for a champion whose R is levelled like the others (rIsBasic).
 */
export function skillMaxOrder(skills: readonly number[], ranks: SkillRanks): { order: SkillKey[]; first: SkillKey[] } | null {
  const taken = skills.filter((s) => Number.isInteger(s) && s >= 1 && s <= 4).slice(0, SKILL_POINTS_READ);
  if (taken.length < 3) return null;
  const slots = rIsBasic(ranks) ? [1, 2, 3, 4] : [1, 2, 3];
  const points = new Map<number, number>(slots.map((s) => [s, 0]));
  const maxedAt = new Map<number, number>();
  taken.forEach((s, i) => {
    if (!points.has(s)) return;
    const p = points.get(s)! + 1;
    points.set(s, p);
    if (p === ranks[s as 1 | 2 | 3 | 4] && !maxedAt.has(s)) maxedAt.set(s, i);
  });
  if (!maxedAt.size) return null;
  const rest = slots.filter((s) => !maxedAt.has(s));
  const restPoints = rest.map((s) => points.get(s)!);
  if (new Set(restPoints).size !== restPoints.length) return null;
  const order = [...[...maxedAt.entries()].sort((a, b) => a[1] - b[1]).map(([s]) => s), ...rest.sort((a, b) => points.get(b)! - points.get(a)!)];
  return { order: order.map((s) => SKILL_OF[s]!), first: taken.slice(0, 3).map((s) => SKILL_OF[s]!) };
}

/* ---------------------------------------------------------------------------------------------
   The counts, and the choices made of them.
--------------------------------------------------------------------------------------------- */

export type BuildDim = "games" | "queue" | "timeline" | "runes" | "shards" | "spells" | "skills" | "start" | "boots" | "core" | "fourth" | "fifth";
export const BUILD_DIMS: readonly BuildDim[] = ["games", "queue", "timeline", "runes", "shards", "spells", "skills", "start", "boots", "core", "fourth", "fifth"];

/**
 * One counted value, as the statement answers: in one patch and lane, how many games (`n`) had this
 * value of `dim`, how many of them were won (`w`), and how many were a team member's own (`nm`).
 * Values: games and timeline "", queue its id, runes "8000:8010,9111,9104,8299|8400:8444,8451",
 * shards "5008,5008,5001", spells "4,14", skills "QEW|QWE" (max order | first points), start
 * "1055,2003", boots an id or "none", core "3078>3053>3071" (purchase order), fourth and fifth
 * "3053,3071,3078|6333" (the core's items ascending | the item).
 */
export interface BuildCountRow {
  dim: BuildDim;
  patch: string;
  lane: BuildLane;
  value: string;
  n: number;
  w: number;
  nm: number;
}

/** A Riot image with its name, as the page draws it (the same shape as Match History's icons). */
export interface BuildIcon {
  url: string;
  name: string;
}

/**
 * Turns the counted ids into icons with names (the server's static data: names and Data Dragon's
 * URLs). One the static data cannot name still gets an icon, with an empty URL and a plain name
 * ("Item 3078"): the page draws a stand-in, and a choice is never dropped or replaced for it.
 */
export interface IconResolver {
  item(id: number): BuildIcon;
  rune(id: number): BuildIcon;
  spell(key: number): BuildIcon;
  /** A stat shard in its row (0 offense, 1 flex, 2 defense). */
  shard(id: number, row: number): BuildIcon;
}

/** One choice of a part, with its own record. */
export interface BuildChoice<V> {
  /** The family's key (near-identical choices share it). */
  key: string;
  value: V;
  games: number;
  wins: number;
  winRate: number;
  /** The 95% Wilson lower bound of the win rate. */
  low: number;
  /** Of the part's games (its pick rate). */
  share: number;
  /** The part's games. */
  total: number;
}

/**
 * A part as the page shows it: its most common choice and, where one qualifies, the one with the
 * highest win rate; "few": fewer than MIN_PART_GAMES games record it; "varied": none of its
 * choices is common enough to name.
 */
export type BuildPart<V> = { state: "shown"; total: number; standard: BuildChoice<V>; performer: BuildChoice<V> | null } | { state: "few"; total: number } | { state: "varied"; total: number };

export interface RunePageValue {
  primaryTree: BuildIcon | null;
  keystone: BuildIcon | null;
  /** The primary tree's other three runes. */
  primary: BuildIcon[];
  secondaryTree: BuildIcon | null;
  secondary: BuildIcon[];
}
export interface SkillOrderValue {
  /** Maxed first to last ("Q", "E", "W"). */
  order: SkillKey[];
  /** The first three points, as most of the family took them. */
  first: SkillKey[];
}
export type StartValue = Array<{ icon: BuildIcon; count: number }>;

/** The most common core with the items most often bought fourth and fifth after it: a composition, so each later item says its own share. */
export interface FullBuildValue {
  items: BuildIcon[];
  fourth: { games: number; total: number };
  fifth: { games: number; total: number } | null;
}

/** One role's builds on its patch window. */
export interface RoleBuilds {
  role: Role;
  /** Games of the champion in this role on the window (the section's sample). */
  games: number;
  /** Of them, a team member's own. */
  teamGames: number;
  /** Of them, with the player's timeline (items and skills). */
  timelineGames: number;
  /** The window's patches, public names, newest first ("26.22", or "26.22" and "26.21"). */
  patches: string[];
  /** The previous patch was added: the current one has fewer than MIN_SECTION_GAMES games. */
  widened: boolean;
  /** Games on the current patch (of `games`). */
  currentGames: number;
  /** The draft queues the games came from. */
  queues: number[];
  runes: BuildPart<RunePageValue>;
  shards: BuildPart<BuildIcon[]>;
  spells: BuildPart<BuildIcon[]>;
  skills: BuildPart<SkillOrderValue>;
  start: BuildPart<StartValue>;
  /** "none": the player completed three items without buying boots. */
  boots: BuildPart<BuildIcon | "none">;
  core: BuildPart<BuildIcon[]>;
  /** Null when the core shows nothing (its "few"/"varied" says why) or no fourth item is common enough. */
  full: FullBuildValue | null;
  /** The same after the core with the highest win rate, where the core part has one. */
  fullHighest: FullBuildValue | null;
}

export type ChampionBuildsView =
  | {
      status: "shown";
      championName: string;
      /** The current patch, public name. */
      currentPatch: string;
      /** The roles with enough games, most played on the current patch first. */
      roles: Array<{ role: Role; games: number }>;
      defaultRole: Role;
      builds: Partial<Record<Role, RoleBuilds>>;
    }
  | {
      status: "few";
      championName: string;
      currentPatch: string;
      /** The most games in one role on the current patch and the previous one together. */
      games: number;
      role: Role | null;
    }
  | { status: "unavailable"; championName: string };

/** The patch window asked for: the current patch (internal, "16.22") and the one before it, if known. */
export interface PatchWindow {
  current: string;
  previous: string | null;
}

/**
 * The patch before `current` among the known patches (newest first), else the number before it in
 * the same season; never across a season (a new season changes items and runes), never one that
 * is not older.
 */
export function previousPatch(current: string, knownDesc: readonly string[]): string | null {
  const m = /^(\d+)\.(\d+)$/.exec(current);
  if (!m) return null;
  const season = m[1];
  const older = knownDesc.filter((p) => /^\d+\.\d+$/.test(p) && comparePatches(p, current) < 0).sort((a, b) => comparePatches(b, a));
  const prev = older[0] ?? (Number(m[2]) > 1 ? `${season}.${Number(m[2]) - 1}` : null);
  return prev && prev.split(".")[0] === season ? prev : null;
}

export interface Tally {
  n: number;
  w: number;
  nm: number;
}
const tally = (): Tally => ({ n: 0, w: 0, nm: 0 });

/** The rows of one lane over the window's patches, value → totals, per dim. */
function laneTotals(rows: readonly BuildCountRow[], lane: BuildLane, patches: readonly string[]): Map<BuildDim, Map<string, Tally>> {
  const out = new Map<BuildDim, Map<string, Tally>>();
  for (const r of rows) {
    if (r.lane !== lane || !patches.includes(r.patch)) continue;
    let dim = out.get(r.dim);
    if (!dim) out.set(r.dim, (dim = new Map()));
    const t = dim.get(r.value) ?? tally();
    t.n += r.n;
    t.w += r.w;
    t.nm += r.nm;
    dim.set(r.value, t);
  }
  return out;
}

const gamesOf = (rows: readonly BuildCountRow[], lane: BuildLane, patch: string | null) => (patch === null ? 0 : rows.reduce((s, r) => s + (r.dim === "games" && r.lane === lane && r.patch === patch ? r.n : 0), 0));

/** A family: near-identical values counted as one, shown as its most common exact value. */
export interface Family {
  key: string;
  shown: string;
  shownGames: number;
  n: number;
  w: number;
}

function families(values: ReadonlyMap<string, Tally> | undefined, keyOf: (value: string) => string | null): { list: Family[]; total: number } {
  const byKey = new Map<string, Family>();
  let total = 0;
  for (const [value, t] of values ?? []) {
    const key = keyOf(value);
    if (key === null) continue;
    total += t.n;
    const f = byKey.get(key) ?? { key, shown: value, shownGames: 0, n: 0, w: 0 };
    f.n += t.n;
    f.w += t.w;
    // The family shows its most common exact value (ties: the first in the value's own order).
    if (t.n > f.shownGames || (t.n === f.shownGames && value < f.shown)) {
      f.shown = value;
      f.shownGames = t.n;
    }
    byKey.set(key, f);
  }
  return { list: [...byKey.values()], total };
}

/**
 * One part's choices: "few" under MIN_PART_GAMES; else the most common reliable family (Standard)
 * and, where one qualifies, the family with the highest win rate (Highest-performing), as the
 * module's header says; "varied" when no family is reliable. `keyOf` gives a value's family (null:
 * not a value of this part, left out of its games too); `valueOf` turns a family's shown value into
 * what the page draws.
 */
export function choosePart<V>(values: ReadonlyMap<string, Tally> | undefined, keyOf: (value: string) => string | null, valueOf: (shown: string) => V): BuildPart<V> {
  const { list, total } = families(values, keyOf);
  if (total < MIN_PART_GAMES) return { state: "few", total };
  const choice = (f: Family): BuildChoice<V> => ({ key: f.key, value: valueOf(f.shown), games: f.n, wins: f.w, winRate: f.w / f.n, low: wilsonInterval(f.w, f.n)!.low, share: f.n / total, total });
  const byGames = (a: BuildChoice<V>, b: BuildChoice<V>) => b.games - a.games || b.low - a.low || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  const reliable = list
    .filter((f) => f.n >= MIN_CHOICE_GAMES && f.n / total >= MIN_CHOICE_SHARE)
    .map(choice)
    .sort(byGames);
  const standard = reliable[0];
  if (!standard) return { state: "varied", total };
  const candidates = reliable.filter((c) => c.games >= MIN_PERFORMER_GAMES && c.share >= MIN_PERFORMER_SHARE).sort((a, b) => b.low - a.low || b.games - a.games || (a.key < b.key ? -1 : 1));
  const best = candidates[0];
  const performer = best && best.key !== standard.key && best.low > standard.low && best.winRate - standard.winRate >= PERFORMER_MARGIN ? best : null;
  return { state: "shown", total, standard, performer };
}

const ids = (s: string) => (s ? s.split(",").map(Number) : []);

/** "8000:8010,9111,9104,8299|8400:8444,8451" → the trees and runes, keystone first; null for anything else. */
export function parseRunePage(key: string): { primary: number; perks: number[]; secondary: number; secondaryPerks: number[] } | null {
  const m = /^(\d+):(\d+(?:,\d+){3})\|(\d+):(\d+,\d+)$/.exec(key);
  if (!m) return null;
  return { primary: Number(m[1]), perks: ids(m[2]!), secondary: Number(m[3]), secondaryPerks: ids(m[4]!) };
}

/** A rune page's family: its keystone and secondary tree (the minor runes vary within it). */
export function runeFamily(key: string): string | null {
  const p = parseRunePage(key);
  return p ? `${p.perks[0]}|${p.secondary}` : null;
}

/** Core items' family: the three items as a set (the order varies within it). */
export function coreFamily(value: string): string | null {
  const parts = value.split(">");
  if (parts.length !== 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
  return [...parts].sort((a, b) => Number(a) - Number(b)).join(",");
}

/** The skill order's family: the max order alone (the first points vary within it). */
export function skillFamily(value: string): string | null {
  const m = /^([QWER]{2,4})\|([QWER]{3})$/.exec(value);
  return m ? m[1]! : null;
}

/**
 * One role's builds from its lane's counts on its window, the ids made icons by `icons`. `window`:
 * the patches counted (internal names), newest first.
 */
export function roleBuilds(rows: readonly BuildCountRow[], lane: BuildLane, window: readonly string[], current: string, icons: IconResolver): RoleBuilds {
  const t = laneTotals(rows, lane, window);
  const sum = (dim: BuildDim, pick: (x: Tally) => number = (x) => x.n) => [...(t.get(dim)?.values() ?? [])].reduce((s, x) => s + pick(x), 0);
  const runes = choosePart<RunePageValue>(t.get("runes"), runeFamily, (shown) => {
    // runeFamily took only pages parseRunePage reads.
    const p = parseRunePage(shown)!;
    return { primaryTree: icons.rune(p.primary), keystone: icons.rune(p.perks[0]!), primary: p.perks.slice(1).map((id) => icons.rune(id)), secondaryTree: icons.rune(p.secondary), secondary: p.secondaryPerks.map((id) => icons.rune(id)) };
  });
  const shards = choosePart<BuildIcon[]>(t.get("shards"), (v) => (/^\d+,\d+,\d+$/.test(v) ? v : null), (shown) => ids(shown).map((id, row) => icons.shard(id, row)));
  const spells = choosePart<BuildIcon[]>(t.get("spells"), (v) => (/^\d+,\d+$/.test(v) ? v : null), (shown) => ids(shown).map((k) => icons.spell(k)));
  const skills = choosePart<SkillOrderValue>(t.get("skills"), skillFamily, (shown) => {
    const [order, first] = shown.split("|");
    return { order: [...order!] as SkillKey[], first: [...first!] as SkillKey[] };
  });
  const start = choosePart<StartValue>(t.get("start"), (v) => (/^\d+(,\d+)*$/.test(v) ? v : null), (shown) => {
    const counted = new Map<number, number>();
    for (const id of ids(shown)) counted.set(id, (counted.get(id) ?? 0) + 1);
    return [...counted.entries()].map(([id, count]) => ({ icon: icons.item(id), count }));
  });
  const boots = choosePart<BuildIcon | "none">(t.get("boots"), (v) => (v === "none" || /^\d+$/.test(v) ? v : null), (shown) => (shown === "none" ? "none" : icons.item(Number(shown))));
  const core = choosePart<BuildIcon[]>(t.get("core"), coreFamily, (shown) => shown.split(">").map((id) => icons.item(Number(id))));
  return {
    role: RIOT_POSITION_TO_ROLE[lane]!,
    games: sum("games"),
    teamGames: sum("games", (x) => x.nm),
    timelineGames: sum("timeline"),
    patches: window.map(publicPatchName),
    widened: window.length > 1,
    currentGames: gamesOf(rows, lane, current),
    queues: [...(t.get("queue")?.keys() ?? [])].map(Number).filter((q) => Number.isInteger(q)).sort((a, b) => a - b),
    runes,
    shards,
    spells,
    skills,
    start,
    boots,
    core,
    full: core.state === "shown" ? fullBuild(t, core.standard, icons) : null,
    fullHighest: core.state === "shown" && core.performer ? fullBuild(t, core.performer, icons) : null,
  };
}

/** A core's family with the items most often bought fourth and fifth after it, each reliable on its own (MIN_CHOICE_GAMES, MIN_CHOICE_SHARE). */
function fullBuild(t: Map<BuildDim, Map<string, Tally>>, core: BuildChoice<BuildIcon[]>, icons: IconResolver): FullBuildValue | null {
  const after = (dim: "fourth" | "fifth", without: readonly string[]): { id: string; games: number; total: number } | null => {
    let total = 0;
    let best: { id: string; games: number } | null = null;
    for (const [value, x] of t.get(dim) ?? []) {
      const [set, id] = value.split("|");
      if (set !== core.key || !id) continue;
      total += x.n;
      if (without.includes(id)) continue;
      if (!best || x.n > best.games || (x.n === best.games && Number(id) < Number(best.id))) best = { id, games: x.n };
    }
    return best && best.games >= MIN_CHOICE_GAMES && best.games / total >= MIN_CHOICE_SHARE ? { ...best, total } : null;
  };
  const fourth = after("fourth", []);
  if (!fourth) return null;
  const fifth = after("fifth", [fourth.id]);
  return { items: [...core.value, icons.item(Number(fourth.id)), ...(fifth ? [icons.item(Number(fifth.id))] : [])], fourth: { games: fourth.games, total: fourth.total }, fifth: fifth ? { games: fifth.games, total: fifth.total } : null };
}

/**
 * The view of one champion's builds from its counts: each lane's window (the current patch, or with
 * the previous one added where the current has fewer than MIN_SECTION_GAMES games in it), the roles
 * with enough games (most played on the current patch first), and each role's builds; "few" when no
 * role has enough. `window.current` and `window.previous` are internal patch names ("16.22").
 */
export function championBuildsView(championName: string, rows: readonly BuildCountRow[], window: PatchWindow, icons: IconResolver): ChampionBuildsView {
  const currentPatch = publicPatchName(window.current);
  const lanes = LANE_ORDER.map((lane) => {
    const current = gamesOf(rows, lane, window.current);
    const previous = gamesOf(rows, lane, window.previous);
    const patches = current >= MIN_SECTION_GAMES ? [window.current] : window.previous && current + previous >= MIN_SECTION_GAMES ? [window.current, window.previous] : null;
    return { lane, current, both: current + previous, patches };
  });
  const shown = lanes.filter((l): l is typeof l & { patches: string[] } => l.patches !== null).sort((a, b) => b.current - a.current || b.both - a.both || LANE_ORDER.indexOf(a.lane) - LANE_ORDER.indexOf(b.lane));
  if (!shown.length) {
    const most = [...lanes].sort((a, b) => b.both - a.both || LANE_ORDER.indexOf(a.lane) - LANE_ORDER.indexOf(b.lane))[0]!;
    return { status: "few", championName, currentPatch, games: most.both, role: most.both > 0 ? RIOT_POSITION_TO_ROLE[most.lane]! : null };
  }
  const builds: Partial<Record<Role, RoleBuilds>> = {};
  for (const l of shown) builds[RIOT_POSITION_TO_ROLE[l.lane]!] = roleBuilds(rows, l.lane, l.patches, window.current, icons);
  const roles = shown.map((l) => ({ role: RIOT_POSITION_TO_ROLE[l.lane]!, games: builds[RIOT_POSITION_TO_ROLE[l.lane]!]!.games }));
  return { status: "shown", championName, currentPatch, roles, defaultRole: roles[0]!.role, builds };
}

/** The role a view opens on: the one asked for (the address's `role`) when it has builds, else the most played. */
export function shownRole(view: Extract<ChampionBuildsView, { status: "shown" }>, asked: Role | null | undefined): Role {
  return asked && view.builds[asked] ? asked : view.defaultRole;
}

/** Whether any part of a role's builds has a highest-win-rate choice of its own (the page then offers the "Highest win rate" view). */
export function hasPerformer(b: RoleBuilds): boolean {
  return [b.runes, b.shards, b.spells, b.skills, b.start, b.boots, b.core].some((p) => p.state === "shown" && p.performer !== null);
}
