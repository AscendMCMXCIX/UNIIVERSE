import { LANE_ORDER } from "@/domain/match-analysis";
import { comparePatches, publicPatchName } from "@/domain/patch";
import { RIOT_POSITION_TO_ROLE, type Role } from "@/domain/roles";

/*
  CHAMPION INTEL's builds and runes (docs/CHAMPION_INTEL.md, "Builds and runes"; the owner's
  requests of 25 and 26 Nov 2026): what the players of the team's stored matches chose on one
  champion in one role and one queue, as totals counted in the database (server/champion-builds),
  and which choice of each part is the most common and which, if any, won clearly more. Pure, so
  every rule is tested without a database (champion-builds.test.ts).

  - The games: every player on the champion (both teams, all ten seats) in stored Summoner's Rift
    draft games that a current team member played, remakes left out, by Riot's position. Not a
    sample of all League players.
  - The queue (D5, 26 Nov 2026): Ranked Solo/Duo by default; Ranked Flex, Normal Draft and Clash
    each on its own. Every count carries its queue and every view reads one queue's counts only:
    never pooled, never a fallback to another queue on its own (the page offers one, said so).
  - The patch: the game's current patch; where the champion has fewer than MIN_SECTION_GAMES games
    in a role and queue on it, the previous patch is added and the words say so. Never an older
    patch as the current one: where the current patch has no game yet, the words name the previous
    patch alone ("patch 26.21, none yet on 26.22"), never a range.
  - Each part counts its own games: runes and spells every record, stat shards only records kept
    from 20 Nov 2026, items and the skill order only games with the player's timeline.
  - Near-identical choices count as one (a family): the same core items in another order, the same
    keystone and secondary tree with other minor runes, the same skill order with other first points.
  - "Most common" (Standard): the family with the most games among the reliable ones (at least
    MIN_CHOICE_GAMES games and MIN_CHOICE_SHARE of the part's games): a fact about the sample.
  - "Highest win rate" (D6, 26 Nov 2026): a statement that one choice won more, so it must hold up
    against chance. Among the other reliable families of at least MIN_PERFORMER_GAMES games and
    MIN_PERFORMER_SHARE of the part, the one with the best 95% Wilson lower bound, shown only where
    the 99% interval of its win rate's difference from the most common's (Newcombe's method 10,
    from the two Wilson intervals) lies wholly above 0, it won PERFORMER_MARGIN or more above it,
    and no one player holds more than PERFORMER_MAX_ONE_PLAYER of its games (a main's skill is not
    a build's). A simulation of the team's sample sizes (docs/CHAMPION_INTEL.md, "The choices")
    found the old rule (two lower bounds compared) offering the view in 93% of sections where no
    choice was better; this one in at most about 4%, and never from fewer than 30 games.
  - Every win rate carries its likely range (Wilson 95%) for its ⓘ; one from fewer than
    FIRM_WIN_RATE_GAMES games is drawn quieter.
  - Weighted counts (the high-elo source, docs/HIGH_ELO_EVIDENCE.md): each game weighs one over its
    chance of being sampled; shares and win rates are weighted, and every threshold and interval
    reads the effective number of games (Σw)²/Σw², never more than the games observed. The team's
    counts weigh each game 1, so every figure is the plain count.
  Factual statistics only: no advice and no verdict (docs/RIOT_COMPLIANCE.md, the game-integrity row).
*/

/** The rules' revision: part of the cache key, so a change of rules recomputes every count (2: counts by queue, the D6 rule). */
export const BUILDS_FORMAT = 2;
/** Summoner's Rift's draft queues: Normal Draft, Ranked Solo/Duo, Ranked Flex, Clash. Swiftplay and Quickplay run a faster economy; Blind Pick is not drafted. What the statement reads; each is a view of its own. */
export const BUILD_QUEUES = [400, 420, 440, 700] as const;
export type BuildQueueId = (typeof BUILD_QUEUES)[number];
/** The queues as the page names them (the address's `queue`): each its own counts, never mixed. */
export const BUILD_QUEUE_IDS = { solo: 420, flex: 440, draft: 400, clash: 700 } as const satisfies Record<string, BuildQueueId>;
export type BuildQueueKey = keyof typeof BUILD_QUEUE_IDS;
/** The page's order: Ranked Solo/Duo first (the default), then Ranked Flex, Normal Draft and Clash. */
export const BUILD_QUEUE_KEYS: readonly BuildQueueKey[] = ["solo", "flex", "draft", "clash"];
/** The competitive build source by default (the owner's D5): Ranked Solo/Duo. */
export const DEFAULT_BUILD_QUEUE: BuildQueueKey = "solo";
/** Where a view's counts come from: the team's stored matches, or anonymous Master+ ranked games (docs/HIGH_ELO_EVIDENCE.md). */
export type BuildSource = "team" | "master";

/** The queue's key for its id, or null for a queue the builds do not count. */
export function buildQueueKey(id: number): BuildQueueKey | null {
  return BUILD_QUEUE_KEYS.find((k) => BUILD_QUEUE_IDS[k] === id) ?? null;
}

/** Below this many games of a champion in a role and queue (on the patch window) the section shows nothing but the honest empty line: a pick share of 20 games is already ±22 points at 95%. */
export const MIN_SECTION_GAMES = 20;
/** Each part needs this many games that record it (items and skills need a timeline; shards a record from 20 Nov 2026). */
export const MIN_PART_GAMES = 20;
/** A choice seen fewer times, or in a smaller share of the part's games, is not one anyone can rely on ("Most common" is a fact about the sample). */
export const MIN_CHOICE_GAMES = 10;
export const MIN_CHOICE_SHARE = 0.1;
/** "Highest win rate" is read only among choices this common: a 30-game win rate is still ±17 points wide (D6). */
export const MIN_PERFORMER_GAMES = 30;
export const MIN_PERFORMER_SHARE = 0.15;
/** "Effectively the same": the highest win rate is shown only this many points above the most common's. */
export const PERFORMER_MARGIN = 0.02;
/** The two-sided 99% normal quantile: the difference's interval must lie wholly above 0 at this level. */
export const PERFORMER_Z = 2.5758293035489004;
/** No one player holds more than this share of a highest-win-rate choice's games (a main's skill is not a build's). */
export const PERFORMER_MAX_ONE_PLAYER = 1 / 3;
/** A win rate from fewer games is drawn quieter: its likely range is ±17 points or wider. */
export const FIRM_WIN_RATE_GAMES = 30;
/** What is bought in the first minute, less what is sold in it, is the starting set. */
export const START_MS = 60_000;
/** The two-sided 95% normal quantile. */
export const Z_95 = 1.959963984540054;

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

/**
 * The interval of a win rate's difference, a − b, from the two Wilson intervals: Newcombe (1998),
 * method 10 (its Table II: 56/70 − 48/80 gives 0.0524 to 0.3339). Null without games on either side.
 */
export function differenceInterval(a: { wins: number; games: number }, b: { wins: number; games: number }, z = Z_95): { low: number; high: number } | null {
  const ia = wilsonInterval(a.wins, a.games, z);
  const ib = wilsonInterval(b.wins, b.games, z);
  if (!ia || !ib) return null;
  const pa = Math.min(Math.max(a.wins / a.games, 0), 1);
  const pb = Math.min(Math.max(b.wins / b.games, 0), 1);
  const d = pa - pb;
  return { low: d - Math.hypot(pa - ia.low, ib.high - pb), high: d + Math.hypot(ia.high - pa, pb - ib.low) };
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

export type BuildDim = "games" | "timeline" | "runes" | "shards" | "spells" | "skills" | "start" | "boots" | "core" | "fourth" | "fifth";
export const BUILD_DIMS: readonly BuildDim[] = ["games", "timeline", "runes", "shards", "spells", "skills", "start", "boots", "core", "fourth", "fifth"];

/** The high-elo counts' weights for one counted value: Σ weight, Σ weight² and Σ weight of the games won. */
export interface BuildWeights {
  w: number;
  w2: number;
  ww: number;
}

/**
 * One counted value, as the statement answers: in one patch, lane and queue, how many games (`n`)
 * had this value of `dim`, how many of them were won (`w`), how many were a team member's own
 * (`nm`), and the most games any one player had with it (`top`: the spread guard's, a count of the
 * server's only, never sent to a page; 0 where no player is known, the high-elo counts). Values:
 * games and timeline "", runes "8000:8010,9111,9104,8299|8400:8444,8451", shards "5008,5008,5001",
 * spells "4,14", skills "QEW|QWE" (max order | first points), start "1055,2003", boots an id or
 * "none", core "3078>3053>3071" (purchase order), fourth and fifth "3053,3071,3078|6333" (the
 * core's items ascending | the item). `weight`: the high-elo counts' weights; without it each game
 * weighs 1.
 */
export interface BuildCountRow {
  dim: BuildDim;
  patch: string;
  lane: BuildLane;
  queue: BuildQueueId;
  value: string;
  n: number;
  w: number;
  nm: number;
  top: number;
  weight?: BuildWeights;
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
  /** Its games: the effective number for weighted counts (every threshold reads it), the plain count for the team's. */
  games: number;
  /** Its games won (weighted: its win rate times `games`). */
  wins: number;
  winRate: number;
  /** The 95% Wilson lower bound of the win rate. */
  low: number;
  /** The win rate's likely range: its 95% Wilson interval (the ⓘ says it). */
  range: { low: number; high: number };
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

/** One role's builds in one queue on its patch window. */
export interface RoleBuilds {
  role: Role;
  /** The queue its games came from (one, never several). */
  queue: BuildQueueKey;
  /** Games of the champion in this role and queue on the window (the section's sample; effective for weighted counts). */
  games: number;
  /** The games observed: `games` for the team's counts; more than it for weighted ones. */
  observed: number;
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

/** One champion's builds in one queue from one source. */
export type ChampionBuildsView =
  | {
      status: "shown";
      source: BuildSource;
      queue: BuildQueueKey;
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
      source: BuildSource;
      queue: BuildQueueKey;
      championName: string;
      currentPatch: string;
      /** The most games in one role on the current patch and the previous one together. */
      games: number;
      role: Role | null;
    };

/** One champion's builds: every queue on its own (never pooled), and `master`, the high-elo source, null where it is not shown. */
export type ChampionBuildsViews =
  | { status: "counted"; championName: string; currentPatch: string; queues: Record<BuildQueueKey, ChampionBuildsView>; master: ChampionBuildsView | null }
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

/**
 * Totals of a value: games (`n`), wins (`w`), members' own (`nm`), the spread guard's upper bound
 * (`top`: the sum of its rows' most games by one player), and the weights (`sw` Σ weight, `sw2`
 * Σ weight², `sww` Σ weight of the wins: n, n and w for the team's counts).
 */
export interface Tally {
  n: number;
  w: number;
  nm: number;
  top: number;
  sw: number;
  sw2: number;
  sww: number;
}
const tally = (): Tally => ({ n: 0, w: 0, nm: 0, top: 0, sw: 0, sw2: 0, sww: 0 });

/** A row's totals as a tally: a team row's games each weigh 1. */
export function tallyOf(r: Pick<BuildCountRow, "n" | "w" | "nm" | "top" | "weight">): Tally {
  return { n: r.n, w: r.w, nm: r.nm, top: r.top, sw: r.weight?.w ?? r.n, sw2: r.weight?.w2 ?? r.n, sww: r.weight?.ww ?? r.w };
}

function add(t: Tally, x: Tally): Tally {
  t.n += x.n;
  t.w += x.w;
  t.nm += x.nm;
  t.top += x.top;
  t.sw += x.sw;
  t.sw2 += x.sw2;
  t.sww += x.sww;
  return t;
}

/** The effective number of games, (Σw)² / Σw², never more than the games observed: the plain count where every game weighs 1. */
export function effectiveGames(t: Pick<Tally, "n" | "sw" | "sw2">): number {
  if (!(t.n > 0) || !(t.sw2 > 0)) return 0;
  if (t.sw === t.n && t.sw2 === t.n) return t.n;
  return Math.min(t.n, (t.sw * t.sw) / t.sw2);
}

/** The weighted share of games won: the plain win rate where every game weighs 1. */
export function wonShare(t: Pick<Tally, "sw" | "sww">): number {
  return t.sw > 0 ? Math.min(Math.max(t.sww / t.sw, 0), 1) : 0;
}

/** The rows of one lane over the window's patches, value → totals, per dim. */
function laneTotals(rows: readonly BuildCountRow[], lane: BuildLane, patches: readonly string[]): Map<BuildDim, Map<string, Tally>> {
  const out = new Map<BuildDim, Map<string, Tally>>();
  for (const r of rows) {
    if (r.lane !== lane || !patches.includes(r.patch)) continue;
    let dim = out.get(r.dim);
    if (!dim) out.set(r.dim, (dim = new Map()));
    dim.set(r.value, add(dim.get(r.value) ?? tally(), tallyOf(r)));
  }
  return out;
}

/** The games of a lane on a patch: their tally. */
const gamesTally = (rows: readonly BuildCountRow[], lane: BuildLane, patch: string | null): Tally => {
  const t = tally();
  if (patch !== null) for (const r of rows) if (r.dim === "games" && r.lane === lane && r.patch === patch) add(t, tallyOf(r));
  return t;
};

/** A family: near-identical values counted as one, shown as its most common exact value. */
export interface Family {
  key: string;
  shown: string;
  /** The shown value's weight (its games for the team's counts). */
  shownGames: number;
  t: Tally;
}

/** The families of a part's values, and the part's totals. */
export function families(values: ReadonlyMap<string, Tally> | undefined, keyOf: (value: string) => string | null): { list: Family[]; total: Tally } {
  const byKey = new Map<string, Family>();
  const total = tally();
  for (const [value, t] of values ?? []) {
    const key = keyOf(value);
    if (key === null) continue;
    add(total, t);
    const f = byKey.get(key) ?? { key, shown: value, shownGames: 0, t: tally() };
    add(f.t, t);
    // The family shows its most common exact value (ties: the first in the value's own order).
    if (t.sw > f.shownGames || (t.sw === f.shownGames && value < f.shown)) {
      f.shown = value;
      f.shownGames = t.sw;
    }
    byKey.set(key, f);
  }
  return { list: [...byKey.values()], total };
}

/** Whether `best` won clearly more than `standard`: the D6 rule (the module's header), on effective games. */
export function clearlyAbove(best: Pick<BuildChoice<unknown>, "games" | "wins" | "winRate" | "share">, standard: Pick<BuildChoice<unknown>, "games" | "wins" | "winRate">, top: number): boolean {
  if (best.games < MIN_PERFORMER_GAMES || best.share < MIN_PERFORMER_SHARE) return false;
  if (best.winRate - standard.winRate < PERFORMER_MARGIN) return false;
  if (top > best.games * PERFORMER_MAX_ONE_PLAYER) return false;
  const d = differenceInterval(best, standard, PERFORMER_Z);
  return !!d && d.low > 0;
}

/**
 * One part's choices: "few" under MIN_PART_GAMES; else the most common reliable family (Standard)
 * and, where one qualifies, the family with the highest win rate (Highest-performing), as the
 * module's header says; "varied" when no family is reliable. `keyOf` gives a value's family (null:
 * not a value of this part, left out of its games too); `valueOf` turns a family's shown value into
 * what the page draws. The spread guard's counts (`top`) stay here: no choice carries them.
 */
export function choosePart<V>(values: ReadonlyMap<string, Tally> | undefined, keyOf: (value: string) => string | null, valueOf: (shown: string) => V): BuildPart<V> {
  const { list, total } = families(values, keyOf);
  const totalGames = effectiveGames(total);
  if (totalGames < MIN_PART_GAMES) return { state: "few", total: totalGames };
  const scored = list.map((f) => {
    const games = effectiveGames(f.t);
    const winRate = wonShare(f.t);
    const wins = f.t.sw === f.t.n && f.t.sw2 === f.t.n ? f.t.w : winRate * games;
    const range = wilsonInterval(wins, games) ?? { low: 0, high: 1 };
    return { f, weight: f.t.sw, games, wins, winRate, range, share: total.sw > 0 ? f.t.sw / total.sw : 0 };
  });
  const choice = (s: (typeof scored)[number]): BuildChoice<V> => ({ key: s.f.key, value: valueOf(s.f.shown), games: s.games, wins: s.wins, winRate: s.winRate, low: s.range.low, range: s.range, share: s.share, total: totalGames });
  const reliable = scored.filter((s) => s.games >= MIN_CHOICE_GAMES && s.share >= MIN_CHOICE_SHARE).sort((a, b) => b.weight - a.weight || b.range.low - a.range.low || (a.f.key < b.f.key ? -1 : a.f.key > b.f.key ? 1 : 0));
  const standard = reliable[0];
  if (!standard) return { state: "varied", total: totalGames };
  const best = reliable
    .filter((s) => s !== standard && s.games >= MIN_PERFORMER_GAMES && s.share >= MIN_PERFORMER_SHARE)
    .sort((a, b) => b.range.low - a.range.low || b.games - a.games || (a.f.key < b.f.key ? -1 : 1))[0];
  const performer = best && clearlyAbove(best, standard, best.f.t.top) ? choice(best) : null;
  return { state: "shown", total: totalGames, standard: choice(standard), performer };
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

/** Each value kind's family, as the parts read them (null: not a value of that part). The builds audit re-derives the choices with these. */
export const PART_FAMILY: Readonly<Record<"runes" | "shards" | "spells" | "skills" | "start" | "boots" | "core", (value: string) => string | null>> = {
  runes: runeFamily,
  shards: (v) => (/^\d+,\d+,\d+$/.test(v) ? v : null),
  spells: (v) => (/^\d+,\d+$/.test(v) ? v : null),
  skills: skillFamily,
  start: (v) => (/^\d+(,\d+)*$/.test(v) ? v : null),
  boots: (v) => (v === "none" || /^\d+$/.test(v) ? v : null),
  core: coreFamily,
};

/** Whether a counted value has its kind's form (so no identifier can stand in one), and is under 60 characters. */
export function validBuildValue(dim: BuildDim, value: string): boolean {
  if (value.length >= 60) return false;
  if (dim === "games" || dim === "timeline") return value === "";
  if (dim === "fourth" || dim === "fifth") return /^\d+,\d+,\d+\|\d+$/.test(value);
  return PART_FAMILY[dim](value) !== null;
}

/**
 * One role's builds from its lane's counts on its window (one queue's rows), the ids made icons by
 * `icons`. `window`: the patches counted (internal names), newest first.
 */
export function roleBuilds(rows: readonly BuildCountRow[], lane: BuildLane, window: readonly string[], current: string, icons: IconResolver, queue: BuildQueueKey = DEFAULT_BUILD_QUEUE): RoleBuilds {
  const t = laneTotals(rows, lane, window);
  const sum = (dim: BuildDim) => [...(t.get(dim)?.values() ?? [])].reduce((s, x) => add(s, x), tally());
  const runes = choosePart<RunePageValue>(t.get("runes"), runeFamily, (shown) => {
    // runeFamily took only pages parseRunePage reads.
    const p = parseRunePage(shown)!;
    return { primaryTree: icons.rune(p.primary), keystone: icons.rune(p.perks[0]!), primary: p.perks.slice(1).map((id) => icons.rune(id)), secondaryTree: icons.rune(p.secondary), secondary: p.secondaryPerks.map((id) => icons.rune(id)) };
  });
  const shards = choosePart<BuildIcon[]>(t.get("shards"), PART_FAMILY.shards, (shown) => ids(shown).map((id, row) => icons.shard(id, row)));
  const spells = choosePart<BuildIcon[]>(t.get("spells"), PART_FAMILY.spells, (shown) => ids(shown).map((k) => icons.spell(k)));
  const skills = choosePart<SkillOrderValue>(t.get("skills"), skillFamily, (shown) => {
    const [order, first] = shown.split("|");
    return { order: [...order!] as SkillKey[], first: [...first!] as SkillKey[] };
  });
  const start = choosePart<StartValue>(t.get("start"), PART_FAMILY.start, (shown) => {
    const counted = new Map<number, number>();
    for (const id of ids(shown)) counted.set(id, (counted.get(id) ?? 0) + 1);
    return [...counted.entries()].map(([id, count]) => ({ icon: icons.item(id), count }));
  });
  const boots = choosePart<BuildIcon | "none">(t.get("boots"), PART_FAMILY.boots, (shown) => (shown === "none" ? "none" : icons.item(Number(shown))));
  const core = choosePart<BuildIcon[]>(t.get("core"), coreFamily, (shown) => shown.split(">").map((id) => icons.item(Number(id))));
  const games = sum("games");
  return {
    role: RIOT_POSITION_TO_ROLE[lane]!,
    queue,
    games: effectiveGames(games),
    observed: games.n,
    teamGames: games.nm,
    timelineGames: effectiveGames(sum("timeline")),
    patches: window.map(publicPatchName),
    widened: window.length > 1,
    currentGames: effectiveGames(gamesTally(rows, lane, current)),
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
    const total = tally();
    let best: { id: string; t: Tally } | null = null;
    for (const [value, x] of t.get(dim) ?? []) {
      const [set, id] = value.split("|");
      if (set !== core.key || !id) continue;
      add(total, x);
      if (without.includes(id)) continue;
      if (!best || x.sw > best.t.sw || (x.sw === best.t.sw && Number(id) < Number(best.id))) best = { id, t: x };
    }
    if (!best || !(total.sw > 0)) return null;
    const games = effectiveGames(best.t);
    return games >= MIN_CHOICE_GAMES && best.t.sw / total.sw >= MIN_CHOICE_SHARE ? { id: best.id, games, total: effectiveGames(total) } : null;
  };
  const fourth = after("fourth", []);
  if (!fourth) return null;
  const fifth = after("fifth", [fourth.id]);
  return { items: [...core.value, icons.item(Number(fourth.id)), ...(fifth ? [icons.item(Number(fifth.id))] : [])], fourth: { games: fourth.games, total: fourth.total }, fifth: fifth ? { games: fifth.games, total: fifth.total } : null };
}

/**
 * A lane's patch window: the current patch alone where it has MIN_SECTION_GAMES games, else the
 * previous one added where the two together have them, else none (the section's honest line). The
 * builds audit re-checks the page's windows with it.
 */
export function laneWindow(currentGames: number, previousGames: number, window: PatchWindow): string[] | null {
  if (currentGames >= MIN_SECTION_GAMES) return [window.current];
  return window.previous && currentGames + previousGames >= MIN_SECTION_GAMES ? [window.current, window.previous] : null;
}

/**
 * The view of one champion's builds in one queue from its counts (only that queue's rows are read:
 * never another's): each lane's window (laneWindow), the roles with enough games (most played on the
 * current patch first), and each role's builds; "few" when no role has enough. `window.current` and
 * `window.previous` are internal patch names ("16.22").
 */
export function championBuildsView(championName: string, rows: readonly BuildCountRow[], window: PatchWindow, icons: IconResolver, queue: BuildQueueKey = DEFAULT_BUILD_QUEUE, source: BuildSource = "team"): ChampionBuildsView {
  const id = BUILD_QUEUE_IDS[queue];
  const own = rows.filter((r) => r.queue === id);
  const currentPatch = publicPatchName(window.current);
  const lanes = LANE_ORDER.map((lane) => {
    const current = effectiveGames(gamesTally(own, lane, window.current));
    const previous = effectiveGames(gamesTally(own, lane, window.previous));
    return { lane, current, both: current + previous, patches: laneWindow(current, previous, window) };
  });
  const shown = lanes.filter((l): l is typeof l & { patches: string[] } => l.patches !== null).sort((a, b) => b.current - a.current || b.both - a.both || LANE_ORDER.indexOf(a.lane) - LANE_ORDER.indexOf(b.lane));
  if (!shown.length) {
    const most = [...lanes].sort((a, b) => b.both - a.both || LANE_ORDER.indexOf(a.lane) - LANE_ORDER.indexOf(b.lane))[0]!;
    return { status: "few", source, queue, championName, currentPatch, games: most.both, role: most.both > 0 ? RIOT_POSITION_TO_ROLE[most.lane]! : null };
  }
  const builds: Partial<Record<Role, RoleBuilds>> = {};
  for (const l of shown) builds[RIOT_POSITION_TO_ROLE[l.lane]!] = roleBuilds(own, l.lane, l.patches, window.current, icons, queue);
  const roles = shown.map((l) => ({ role: RIOT_POSITION_TO_ROLE[l.lane]!, games: builds[RIOT_POSITION_TO_ROLE[l.lane]!]!.games }));
  return { status: "shown", source, queue, championName, currentPatch, roles, defaultRole: roles[0]!.role, builds };
}

/**
 * Every queue's view of one champion from one set of counts, each from its own queue's rows only
 * (never pooled), and the high-elo view from its own counts where they are given (null: not shown).
 */
export function championBuildsViews(championName: string, rows: readonly BuildCountRow[], window: PatchWindow, icons: IconResolver, master: readonly BuildCountRow[] | null = null): Extract<ChampionBuildsViews, { status: "counted" }> {
  const queues = Object.fromEntries(BUILD_QUEUE_KEYS.map((q) => [q, championBuildsView(championName, rows, window, icons, q)])) as Record<BuildQueueKey, ChampionBuildsView>;
  return { status: "counted", championName, currentPatch: publicPatchName(window.current), queues, master: master ? championBuildsView(championName, master, window, icons, "solo", "master") : null };
}

/** The games a view has in a role: that role's where it has builds, else its most played (or none). */
function gamesIn(view: ChampionBuildsView, role: Role | null): { role: Role; games: number } | null {
  if (view.status !== "shown") return null;
  const asked = role ? view.roles.find((r) => r.role === role) : undefined;
  return asked ?? view.roles[0] ?? null;
}

/**
 * In a queue that shows nothing, the other queue to offer: among the team's other queues whose view
 * is shown, the one with the most games in `role` (where it has builds in it), else in its own most
 * played role; ties in the page's order. Null when no other queue shows builds. It is an offer: the
 * page never switches on its own.
 */
export function otherQueueOffer(views: Record<BuildQueueKey, ChampionBuildsView>, chosen: BuildQueueKey, role: Role | null): { queue: BuildQueueKey; role: Role; games: number } | null {
  let best: { queue: BuildQueueKey; role: Role; games: number } | null = null;
  for (const queue of BUILD_QUEUE_KEYS) {
    if (queue === chosen) continue;
    const g = gamesIn(views[queue], role);
    if (g && (!best || g.games > best.games)) best = { queue, role: g.role, games: g.games };
  }
  return best;
}

/**
 * The role a view opens on: the one asked for (the address's `role`) when it has builds in this view;
 * else Matchup Intel's lane (`lane`, Compare with a lane) when it has builds in it; else the most
 * played. A role chosen in one queue that has no builds in another falls to the lane's role there,
 * as no role was chosen (the section's default with a lane is the lane's role).
 */
export function shownRole(view: Extract<ChampionBuildsView, { status: "shown" }>, asked: Role | null | undefined, lane: Role | null = null): Role {
  if (asked && view.builds[asked]) return asked;
  return lane && view.builds[lane] ? lane : view.defaultRole;
}

/** Whether any part of a role's builds has a highest-win-rate choice of its own (the page then offers the "Highest win rate" view). */
export function hasPerformer(b: RoleBuilds): boolean {
  return [b.runes, b.shards, b.spells, b.skills, b.start, b.boots, b.core].some((p) => p.state === "shown" && p.performer !== null);
}
