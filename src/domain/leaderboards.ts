import { seasonOfPatch } from "./season";
import { SEASON_MODES, type GameRole } from "./season-stats";

/*
  Team Leaderboards: friendly competition between team members on their own Riot games.

  Everything here is computed from the games UNIIVERSE has stored (one row per game per player:
  a match seen from two linked accounts counts once). Each metric says exactly what it measures:
  - "total"   adds up over the games in scope (more games, more chances);
  - "average" divides by the games that carry the figure (per game, or per minute over valid
              game minutes: total ÷ total minutes, never an average of per-game rates);
  - "rate"    is a share of decided games (win rate);
  - "record"  is one game (a single-game best) or one run (a streak), with the game it came from.
  A game without the figure is left out of that metric (and the games used are shown); it never
  counts as zero. Averages and rates need a minimum number of games before a player is ranked.
*/

/**
 * Game scopes, from the queues UNIIVERSE collects and uses for its season statistics (all are
 * 5v5 Summoner's Rift games, so the figures are comparable). "All supported games" is the default,
 * as everywhere else in UNIIVERSE; the ranked queues and normal games can be singled out.
 */
const seasonMode = (key: "all" | "solo" | "flex" | "normal") => SEASON_MODES.find((m) => m.key === key)!;
export const LEADERBOARD_QUEUES = {
  all: { label: seasonMode("all").label, queues: seasonMode("all").queues, description: seasonMode("all").description },
  ranked: { label: "All ranked", queues: [...seasonMode("solo").queues, ...seasonMode("flex").queues], description: "Ranked Solo/Duo and Ranked Flex" },
  solo: { label: seasonMode("solo").label, queues: seasonMode("solo").queues, description: seasonMode("solo").description },
  flex: { label: seasonMode("flex").label, queues: seasonMode("flex").queues, description: seasonMode("flex").description },
  normal: { label: seasonMode("normal").label, queues: seasonMode("normal").queues, description: seasonMode("normal").description },
} as const satisfies Record<string, { label: string; queues: readonly number[]; description: string }>;
export const DEFAULT_LEADERBOARD_QUEUE = "all" satisfies keyof typeof LEADERBOARD_QUEUES;
export type LeaderboardQueue = keyof typeof LEADERBOARD_QUEUES;
export const isLeaderboardQueue = (v: unknown): v is LeaderboardQueue => typeof v === "string" && v in LEADERBOARD_QUEUES;

export const LEADERBOARD_ROLES = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"] as const satisfies readonly GameRole[];
export const isLeaderboardRole = (v: unknown): v is GameRole => typeof v === "string" && (LEADERBOARD_ROLES as readonly string[]).includes(v);

/** Games needed before a player is ranked on an average or a rate (whole scope / one role). */
export const MIN_GAMES = 10;
export const MIN_ROLE_GAMES = 5;
/** Games on one champion before its win rate competes, and before it counts as "experienced". */
export const MIN_CHAMPION_GAMES = 10;
const MIN_MINUTES_S = 300;
const MAX_MINUTES_S = 4 * 3600;

/** One game of one player, as stored (null = Riot did not provide the figure for this game). */
export interface LeaderboardGame {
  matchId: string;
  playerId: string;
  championId: string;
  role: GameRole | null;
  queueId: number | null;
  patch: string | null;
  win: boolean | null;
  gameCreation: number;
  durationS: number | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  cs: number | null;
  damage: number | null;
  vision: number | null;
  /** From the stored match details (null when that game has none). */
  gold: number | null;
  wardsPlaced: number | null;
  teamKills: number | null;
  teamDamage: number | null;
  /** Kept on games stored from Phase 14 on; null on older games. */
  extra: LeaderboardExtra | null;
}

export interface LeaderboardExtra {
  doubleKills?: number;
  tripleKills?: number;
  quadraKills?: number;
  pentaKills?: number;
  firstBloodKill?: boolean;
  wardsKilled?: number;
  controlWardsBought?: number;
  objectiveDamage?: number;
  buildingDamage?: number;
  turretTakedowns?: number;
  ccSeconds?: number;
  soloKills?: number;
}

export interface LeaderboardMastery {
  playerId: string;
  championId: string;
  points: number;
}

export interface LeaderboardScope {
  season: number;
  queue: LeaderboardQueue;
  role: GameRole | null;
}

export function gamesInScope(games: readonly LeaderboardGame[], scope: LeaderboardScope): LeaderboardGame[] {
  const queues = new Set<number>(LEADERBOARD_QUEUES[scope.queue].queues);
  return games.filter((g) => seasonOfPatch(g.patch) === scope.season && g.queueId !== null && queues.has(g.queueId) && (!scope.role || g.role === scope.role));
}

const validMinutes = (g: LeaderboardGame): number | null => (g.durationS !== null && g.durationS >= MIN_MINUTES_S && g.durationS <= MAX_MINUTES_S ? g.durationS / 60 : null);
const hasKda = (g: LeaderboardGame) => g.kills !== null && g.kills >= 0 && g.deaths !== null && g.assists !== null;

// ── Metrics ─────────────────────────────────────────────────────────────────────────────────────

export const LEADERBOARD_CATEGORIES = [
  { key: "overview", label: "Highlights" },
  { key: "combat", label: "Combat" },
  { key: "multikills", label: "Multikills" },
  { key: "farming", label: "Farming" },
  { key: "vision", label: "Vision" },
  { key: "objectives", label: "Objectives" },
  { key: "champions", label: "Champions" },
  { key: "records", label: "Records" },
] as const;
export type LeaderboardCategory = (typeof LEADERBOARD_CATEGORIES)[number]["key"];
export const isLeaderboardCategory = (v: unknown): v is LeaderboardCategory => LEADERBOARD_CATEGORIES.some((c) => c.key === v);

export type MetricKind = "total" | "average" | "rate" | "record";
/** Where a metric's figure comes from: every stored game, the stored match details, the extra figures kept from Phase 14 on, or Riot mastery. */
export type MetricSource = "games" | "details" | "extra" | "mastery";

/** What a player scored on one metric. */
export interface MetricValue {
  value: number | null;
  /** Games behind the value (for records: the games searched). */
  sample: number;
  /** Ranked only with enough evidence (averages and rates); totals and records need one game. */
  eligible: boolean;
  /** The game or champion behind a record or champion metric. */
  context?: { championId?: string; matchId?: string; gameCreation?: number; note?: string };
}

export interface MetricDef {
  id: string;
  category: LeaderboardCategory;
  label: string;
  kind: MetricKind;
  source: MetricSource;
  /** Lower is better (deaths per game). */
  lowerIsBetter?: boolean;
  /** Precise definition shown with the board. */
  definition: string;
  /** How the value reads: unit after the number ("kills", "CS/min", "%"). */
  unit: string;
  decimals: number;
  /** Values stored as a 0–1 share, shown as a percentage. */
  percent?: boolean;
  /** Roles where this metric is a natural strength (shown first when that role is selected). */
  roles?: readonly GameRole[];
  compute: (p: PlayerData, ctx: ComputeContext) => MetricValue;
}

export interface PlayerData {
  playerId: string;
  games: LeaderboardGame[];
  mastery: LeaderboardMastery[];
}

interface ComputeContext {
  minGames: number;
}

// Helpers that build a MetricValue from the games carrying a figure.
function avgPerGame(p: PlayerData, ctx: ComputeContext, pick: (g: LeaderboardGame) => number | null | undefined): MetricValue {
  let sum = 0;
  let n = 0;
  for (const g of p.games) {
    const v = pick(g);
    if (typeof v === "number" && v >= 0) {
      sum += v;
      n += 1;
    }
  }
  return { value: n ? sum / n : null, sample: n, eligible: n >= ctx.minGames };
}

function perMinute(p: PlayerData, ctx: ComputeContext, pick: (g: LeaderboardGame) => number | null | undefined): MetricValue {
  let sum = 0;
  let minutes = 0;
  let n = 0;
  for (const g of p.games) {
    const v = pick(g);
    const m = validMinutes(g);
    if (typeof v === "number" && v >= 0 && m !== null) {
      sum += v;
      minutes += m;
      n += 1;
    }
  }
  return { value: minutes > 0 ? sum / minutes : null, sample: n, eligible: n >= ctx.minGames };
}

function total(p: PlayerData, pick: (g: LeaderboardGame) => number | null | undefined): MetricValue {
  let sum = 0;
  let n = 0;
  for (const g of p.games) {
    const v = pick(g);
    if (typeof v === "number" && v >= 0) {
      sum += v;
      n += 1;
    }
  }
  return { value: n ? sum : null, sample: n, eligible: n > 0 };
}

function best(p: PlayerData, pick: (g: LeaderboardGame) => number | null | undefined, note?: (g: LeaderboardGame) => string): MetricValue {
  let top: LeaderboardGame | null = null;
  let topValue = -Infinity;
  let n = 0;
  for (const g of p.games) {
    const v = pick(g);
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) continue;
    n += 1;
    // Ties go to the earlier game: whoever set the record first keeps it.
    if (v > topValue || (v === topValue && top && g.gameCreation < top.gameCreation)) {
      top = g;
      topValue = v;
    }
  }
  return top ? { value: topValue, sample: n, eligible: true, context: { championId: top.championId, matchId: top.matchId, gameCreation: top.gameCreation, note: note?.(top) } } : { value: null, sample: n, eligible: false };
}

const ex = (k: keyof LeaderboardExtra) => (g: LeaderboardGame) => {
  const v = g.extra?.[k];
  return typeof v === "number" ? v : null;
};
const kdaOf = (g: LeaderboardGame) => (hasKda(g) ? (g.kills! + g.assists!) / Math.max(1, g.deaths!) : null);

/** Longest run of consecutive wins, in the order the games were played (games without a result are skipped). */
export function longestWinStreak(games: readonly LeaderboardGame[]): { length: number; endedAt: number | null; games: number } {
  const decided = games.filter((g) => g.win !== null).sort((a, b) => a.gameCreation - b.gameCreation || a.matchId.localeCompare(b.matchId));
  let bestLen = 0;
  let bestEnd: number | null = null;
  let run = 0;
  for (const g of decided) {
    run = g.win ? run + 1 : 0;
    if (run > bestLen) {
      bestLen = run;
      bestEnd = g.gameCreation;
    }
  }
  return { length: bestLen, endedAt: bestEnd, games: decided.length };
}

function championTable(games: readonly LeaderboardGame[]) {
  const by = new Map<string, { games: number; wins: number; decided: number }>();
  for (const g of games) {
    const c = by.get(g.championId) ?? { games: 0, wins: 0, decided: 0 };
    c.games += 1;
    if (g.win !== null) {
      c.decided += 1;
      if (g.win) c.wins += 1;
    }
    by.set(g.championId, c);
  }
  return by;
}

export const METRICS: MetricDef[] = [
  // Overview
  {
    id: "win-rate",
    category: "overview",
    label: "Highest win rate",
    kind: "rate",
    source: "games",
    unit: "%",
    decimals: 1,
    percent: true,
    definition: "Wins ÷ games with a result, in the selected season, queues and role.",
    roles: ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"],
    compute: (p, ctx) => {
      const decided = p.games.filter((g) => g.win !== null);
      const wins = decided.filter((g) => g.win).length;
      return { value: decided.length ? wins / decided.length : null, sample: decided.length, eligible: decided.length >= ctx.minGames };
    },
  },
  { id: "wins", category: "overview", label: "Most wins", kind: "total", source: "games", unit: "wins", decimals: 0, definition: "Games won in scope (a total: more games, more chances).", compute: (p) => total(p, (g) => (g.win === null ? null : g.win ? 1 : 0)) },
  { id: "games", category: "overview", label: "Most games played", kind: "total", source: "games", unit: "games", decimals: 0, definition: "Games played in scope, each match once even when several linked accounts were in it.", compute: (p) => ({ value: p.games.length || null, sample: p.games.length, eligible: p.games.length > 0 }) },
  {
    id: "kda",
    category: "overview",
    label: "Best KDA",
    kind: "average",
    source: "games",
    unit: "KDA",
    decimals: 2,
    definition: "(Total kills + total assists) ÷ total deaths over the games with K/D/A; with no deaths at all, kills + assists per game.",
    roles: ["ADC", "MID"],
    compute: (p, ctx) => {
      let k = 0;
      let d = 0;
      let a = 0;
      let n = 0;
      for (const g of p.games)
        if (hasKda(g)) {
          k += g.kills!;
          d += g.deaths!;
          a += g.assists!;
          n += 1;
        }
      return { value: n ? (d > 0 ? (k + a) / d : (k + a) / n) : null, sample: n, eligible: n >= ctx.minGames };
    },
  },
  {
    id: "kill-participation",
    category: "overview",
    label: "Highest kill participation",
    kind: "average",
    source: "details",
    unit: "%",
    decimals: 1,
    percent: true,
    definition: "(Kills + assists) ÷ the team's kills, summed over the games with full match details.",
    roles: ["JUNGLE", "SUPPORT", "MID"],
    compute: (p, ctx) => {
      let mine = 0;
      let team = 0;
      let n = 0;
      for (const g of p.games)
        if (hasKda(g) && g.teamKills !== null && g.teamKills > 0) {
          mine += g.kills! + g.assists!;
          team += g.teamKills;
          n += 1;
        }
      return { value: team > 0 ? Math.min(1, mine / team) : null, sample: n, eligible: n >= ctx.minGames };
    },
  },
  { id: "deaths-per-game", category: "overview", label: "Fewest deaths per game", kind: "average", source: "games", lowerIsBetter: true, unit: "deaths/game", decimals: 2, definition: "Average deaths per game over the games with K/D/A (lower is better).", compute: (p, ctx) => avgPerGame(p, ctx, (g) => (hasKda(g) ? g.deaths : null)) },
  { id: "assists-per-game", category: "overview", label: "Most assists per game", kind: "average", source: "games", unit: "assists/game", decimals: 1, definition: "Average assists per game over the games with K/D/A.", roles: ["SUPPORT", "JUNGLE"], compute: (p, ctx) => avgPerGame(p, ctx, (g) => (hasKda(g) ? g.assists : null)) },
  { id: "distinct-champions", category: "overview", label: "Most champions played", kind: "total", source: "games", unit: "champions", decimals: 0, definition: "Different champions played in scope.", compute: (p) => ({ value: p.games.length ? new Set(p.games.map((g) => g.championId)).size : null, sample: p.games.length, eligible: p.games.length > 0 }) },
  {
    id: "win-streak",
    category: "overview",
    label: "Longest win streak",
    kind: "record",
    source: "games",
    unit: "wins in a row",
    decimals: 0,
    definition: "Most consecutive wins in scope, in the order the games were played.",
    compute: (p) => {
      const s = longestWinStreak(p.games);
      return s.length > 0 ? { value: s.length, sample: s.games, eligible: true, context: { gameCreation: s.endedAt ?? undefined } } : { value: s.games ? 0 : null, sample: s.games, eligible: s.games > 0 };
    },
  },
  {
    id: "mastery-total",
    category: "overview",
    label: "Highest total mastery",
    kind: "total",
    source: "mastery",
    unit: "mastery points",
    decimals: 0,
    definition: "Champion mastery points on every linked account, all champions (Riot's all-time figure: not limited to the season, queue or role).",
    compute: (p) => {
      const sum = p.mastery.reduce((s, m) => s + m.points, 0);
      return { value: sum || null, sample: p.mastery.length, eligible: sum > 0 };
    },
  },
  // Combat
  { id: "kills", category: "combat", label: "Most kills", kind: "total", source: "games", unit: "kills", decimals: 0, definition: "Kills in scope (a total).", compute: (p) => total(p, (g) => (hasKda(g) ? g.kills : null)) },
  { id: "kills-per-game", category: "combat", label: "Most kills per game", kind: "average", source: "games", unit: "kills/game", decimals: 1, definition: "Average kills per game over the games with K/D/A.", roles: ["MID", "ADC", "TOP"], compute: (p, ctx) => avgPerGame(p, ctx, (g) => (hasKda(g) ? g.kills : null)) },
  { id: "damage-per-minute", category: "combat", label: "Highest damage per minute", kind: "average", source: "games", unit: "damage/min", decimals: 0, definition: "Total damage to champions ÷ total minutes of the games that have both (remakes left out).", roles: ["MID", "ADC", "TOP"], compute: (p, ctx) => perMinute(p, ctx, (g) => g.damage) },
  { id: "damage-per-game", category: "combat", label: "Highest average champion damage", kind: "average", source: "games", unit: "damage/game", decimals: 0, definition: "Average damage dealt to champions per game.", compute: (p, ctx) => avgPerGame(p, ctx, (g) => g.damage) },
  {
    id: "damage-share",
    category: "combat",
    label: "Highest team damage share",
    kind: "average",
    source: "details",
    unit: "%",
    decimals: 1,
    percent: true,
    definition: "Your damage to champions ÷ your team's, summed over the games with full match details.",
    roles: ["MID", "ADC", "TOP"],
    compute: (p, ctx) => {
      let mine = 0;
      let team = 0;
      let n = 0;
      for (const g of p.games)
        if (g.damage !== null && g.teamDamage !== null && g.teamDamage > 0) {
          mine += g.damage;
          team += g.teamDamage;
          n += 1;
        }
      return { value: team > 0 ? mine / team : null, sample: n, eligible: n >= ctx.minGames };
    },
  },
  { id: "double-kills", category: "multikills", label: "Most double kills", kind: "total", source: "extra", unit: "double kills", decimals: 0, definition: "Double kills in the games with multikill data (kept from new games onwards).", compute: (p) => total(p, ex("doubleKills")) },
  { id: "triple-kills", category: "multikills", label: "Most triple kills", kind: "total", source: "extra", unit: "triple kills", decimals: 0, definition: "Triple kills in the games with multikill data.", compute: (p) => total(p, ex("tripleKills")) },
  { id: "quadra-kills", category: "multikills", label: "Most quadra kills", kind: "total", source: "extra", unit: "quadra kills", decimals: 0, definition: "Quadra kills in the games with multikill data.", compute: (p) => total(p, ex("quadraKills")) },
  { id: "penta-kills", category: "multikills", label: "Most pentakills", kind: "total", source: "extra", unit: "pentakills", decimals: 0, definition: "Pentakills in the games with multikill data.", roles: ["ADC", "MID"], compute: (p) => total(p, ex("pentaKills")) },
  { id: "solo-kills", category: "combat", label: "Most solo kills", kind: "total", source: "extra", unit: "solo kills", decimals: 0, definition: "Kills with no allied help, as Riot's match statistics count them, in the games with that data.", roles: ["TOP", "MID"], compute: (p) => total(p, ex("soloKills")) },
  { id: "first-bloods", category: "combat", label: "Most first bloods", kind: "total", source: "extra", unit: "first bloods", decimals: 0, definition: "Games where you got the first kill, in the games with that data.", roles: ["JUNGLE", "TOP"], compute: (p) => total(p, (g) => (typeof g.extra?.firstBloodKill === "boolean" ? (g.extra.firstBloodKill ? 1 : 0) : null)) },
  // Farming
  { id: "cs-per-minute", category: "farming", label: "Highest CS per minute", kind: "average", source: "games", unit: "CS/min", decimals: 2, definition: "Lane minions + monsters ÷ total minutes of the games that have both (remakes left out).", roles: ["TOP", "MID", "ADC", "JUNGLE"], compute: (p, ctx) => perMinute(p, ctx, (g) => g.cs) },
  { id: "cs-per-game", category: "farming", label: "Most CS per game", kind: "average", source: "games", unit: "CS/game", decimals: 0, definition: "Average lane minions + monsters per game.", compute: (p, ctx) => avgPerGame(p, ctx, (g) => g.cs) },
  { id: "gold-per-minute", category: "farming", label: "Highest gold per minute", kind: "average", source: "details", unit: "gold/min", decimals: 0, definition: "Gold earned ÷ total minutes, over the games with full match details.", roles: ["ADC", "MID", "TOP"], compute: (p, ctx) => perMinute(p, ctx, (g) => g.gold) },
  { id: "cs-total", category: "farming", label: "Most total CS", kind: "total", source: "games", unit: "CS", decimals: 0, definition: "Lane minions + monsters in scope (a total).", compute: (p) => total(p, (g) => g.cs) },
  // Vision
  { id: "vision-per-game", category: "vision", label: "Highest vision score per game", kind: "average", source: "games", unit: "vision/game", decimals: 1, definition: "Average vision score per game.", roles: ["SUPPORT", "JUNGLE"], compute: (p, ctx) => avgPerGame(p, ctx, (g) => g.vision) },
  { id: "vision-per-minute", category: "vision", label: "Highest vision score per minute", kind: "average", source: "games", unit: "vision/min", decimals: 2, definition: "Vision score ÷ total minutes of the games that have both.", roles: ["SUPPORT", "JUNGLE"], compute: (p, ctx) => perMinute(p, ctx, (g) => g.vision) },
  { id: "wards-placed", category: "vision", label: "Most wards placed per game", kind: "average", source: "details", unit: "wards/game", decimals: 1, definition: "Average wards placed per game, over the games with full match details.", roles: ["SUPPORT"], compute: (p, ctx) => avgPerGame(p, ctx, (g) => g.wardsPlaced) },
  { id: "wards-cleared", category: "vision", label: "Most wards cleared per game", kind: "average", source: "extra", unit: "wards/game", decimals: 1, definition: "Average enemy wards destroyed per game, over the games with that data.", roles: ["SUPPORT", "JUNGLE"], compute: (p, ctx) => avgPerGame(p, ctx, ex("wardsKilled")) },
  { id: "control-wards", category: "vision", label: "Most control wards bought per game", kind: "average", source: "extra", unit: "control wards/game", decimals: 1, definition: "Average control wards bought per game, over the games with that data.", roles: ["SUPPORT"], compute: (p, ctx) => avgPerGame(p, ctx, ex("controlWardsBought")) },
  { id: "assists", category: "combat", label: "Most assists", kind: "total", source: "games", unit: "assists", decimals: 0, definition: "Assists in scope (a total).", roles: ["SUPPORT"], compute: (p) => total(p, (g) => (hasKda(g) ? g.assists : null)) },
  { id: "cc-per-game", category: "vision", label: "Most crowd control per game", kind: "average", source: "extra", unit: "seconds/game", decimals: 1, definition: "Average seconds of crowd control applied to enemy champions per game (Riot's own measure), over the games with that data.", roles: ["SUPPORT", "TOP", "JUNGLE"], compute: (p, ctx) => avgPerGame(p, ctx, ex("ccSeconds")) },
  // Objectives
  { id: "objective-damage", category: "objectives", label: "Highest objective damage per game", kind: "average", source: "extra", unit: "damage/game", decimals: 0, definition: "Average damage to objectives (towers, dragons, Baron and other epic monsters, inhibitors) per game, over the games with that data.", roles: ["JUNGLE", "TOP", "ADC"], compute: (p, ctx) => avgPerGame(p, ctx, ex("objectiveDamage")) },
  { id: "building-damage", category: "objectives", label: "Highest tower damage per game", kind: "average", source: "extra", unit: "damage/game", decimals: 0, definition: "Average damage to buildings (towers and inhibitors) per game, over the games with that data.", roles: ["TOP", "ADC"], compute: (p, ctx) => avgPerGame(p, ctx, ex("buildingDamage")) },
  { id: "turret-takedowns", category: "objectives", label: "Most turret takedowns", kind: "total", source: "extra", unit: "turrets", decimals: 0, definition: "Turrets you destroyed or helped destroy, in the games with that data (a total).", roles: ["TOP", "ADC"], compute: (p) => total(p, ex("turretTakedowns")) },
  // Champions
  {
    id: "mastery-one-champion",
    category: "champions",
    label: "Highest mastery on one champion",
    kind: "record",
    source: "mastery",
    unit: "mastery points",
    decimals: 0,
    definition: "Mastery points on a single champion, added up over the linked accounts (Riot's all-time figure).",
    compute: (p) => {
      const by = new Map<string, number>();
      for (const m of p.mastery) by.set(m.championId, (by.get(m.championId) ?? 0) + m.points);
      let topId: string | null = null;
      let top = 0;
      for (const [id, pts] of by) if (pts > top) [topId, top] = [id, pts];
      return topId ? { value: top, sample: by.size, eligible: true, context: { championId: topId } } : { value: null, sample: 0, eligible: false };
    },
  },
  {
    id: "games-one-champion",
    category: "champions",
    label: "Most games on one champion",
    kind: "record",
    source: "games",
    unit: "games",
    decimals: 0,
    definition: "Games on the player's most played champion in scope.",
    compute: (p) => {
      let topId: string | null = null;
      let top = 0;
      for (const [id, c] of championTable(p.games)) if (c.games > top) [topId, top] = [id, c.games];
      return topId ? { value: top, sample: p.games.length, eligible: true, context: { championId: topId } } : { value: null, sample: 0, eligible: false };
    },
  },
  {
    id: "best-champion-win-rate",
    category: "champions",
    label: "Best champion win rate",
    kind: "rate",
    source: "games",
    unit: "%",
    decimals: 1,
    percent: true,
    definition: `The player's best win rate on one champion with at least ${MIN_CHAMPION_GAMES} games in scope (ties go to the champion with more games).`,
    compute: (p) => {
      let bestId: string | null = null;
      let bestRate = -1;
      let bestGames = 0;
      for (const [id, c] of championTable(p.games)) {
        if (c.decided < MIN_CHAMPION_GAMES) continue;
        const rate = c.wins / c.decided;
        if (rate > bestRate || (rate === bestRate && c.decided > bestGames)) [bestId, bestRate, bestGames] = [id, rate, c.decided];
      }
      return bestId ? { value: bestRate, sample: bestGames, eligible: true, context: { championId: bestId, note: `${bestGames} games` } } : { value: null, sample: 0, eligible: false };
    },
  },
  {
    id: "experienced-champions",
    category: "champions",
    label: "Most champions with real experience",
    kind: "total",
    source: "games",
    unit: "champions",
    decimals: 0,
    definition: `Champions with at least ${MIN_CHAMPION_GAMES} games in scope.`,
    compute: (p) => {
      let n = 0;
      for (const c of championTable(p.games).values()) if (c.games >= MIN_CHAMPION_GAMES) n += 1;
      return { value: p.games.length ? n : null, sample: p.games.length, eligible: p.games.length > 0 };
    },
  },
  {
    id: "specialist-share",
    category: "champions",
    label: "Biggest specialist",
    kind: "average",
    source: "games",
    unit: "% of games",
    decimals: 0,
    percent: true,
    definition: "Share of the player's games on their most played champion: high for one-trick specialists.",
    compute: (p, ctx) => {
      let topId: string | null = null;
      let top = 0;
      for (const [id, c] of championTable(p.games)) if (c.games > top) [topId, top] = [id, c.games];
      return topId ? { value: top / p.games.length, sample: p.games.length, eligible: p.games.length >= ctx.minGames, context: { championId: topId } } : { value: null, sample: 0, eligible: false };
    },
  },
  // Records: single games (and the streak above)
  { id: "max-kills", category: "records", label: "Most kills in one game", kind: "record", source: "games", unit: "kills", decimals: 0, definition: "The highest kill count in a single game in scope.", compute: (p) => best(p, (g) => (hasKda(g) ? g.kills : null), (g) => `${g.kills}/${g.deaths}/${g.assists}`) },
  { id: "max-assists", category: "records", label: "Most assists in one game", kind: "record", source: "games", unit: "assists", decimals: 0, definition: "The highest assist count in a single game in scope.", roles: ["SUPPORT", "JUNGLE"], compute: (p) => best(p, (g) => (hasKda(g) ? g.assists : null), (g) => `${g.kills}/${g.deaths}/${g.assists}`) },
  { id: "max-kda", category: "records", label: "Highest KDA in one game", kind: "record", source: "games", unit: "KDA", decimals: 1, definition: "(Kills + assists) ÷ deaths in one game (a deathless game counts as dying once).", compute: (p) => best(p, kdaOf, (g) => `${g.kills}/${g.deaths}/${g.assists}`) },
  { id: "max-damage", category: "records", label: "Most damage in one game", kind: "record", source: "games", unit: "damage", decimals: 0, definition: "The highest damage to champions in a single game in scope.", compute: (p) => best(p, (g) => g.damage) },
  { id: "max-vision", category: "records", label: "Highest vision score in one game", kind: "record", source: "games", unit: "vision score", decimals: 0, definition: "The highest vision score in a single game in scope.", roles: ["SUPPORT"], compute: (p) => best(p, (g) => g.vision) },
  { id: "max-cs-per-minute", category: "records", label: "Best CS per minute in one game", kind: "record", source: "games", unit: "CS/min", decimals: 1, definition: "The best CS per minute in a single game of normal length (remakes left out).", compute: (p) => best(p, (g) => (g.cs !== null && validMinutes(g) !== null ? g.cs / validMinutes(g)! : null), (g) => `${g.cs} CS`) },
  { id: "max-cs", category: "records", label: "Most CS in one game", kind: "record", source: "games", unit: "CS", decimals: 0, definition: "The most lane minions + monsters in a single game in scope.", compute: (p) => best(p, (g) => g.cs) },
  { id: "max-gold", category: "records", label: "Most gold in one game", kind: "record", source: "details", unit: "gold", decimals: 0, definition: "The most gold earned in a single game with full match details.", compute: (p) => best(p, (g) => g.gold) },
];

export const METRIC_BY_ID = new Map(METRICS.map((m) => [m.id, m]));

// ── Ranking ─────────────────────────────────────────────────────────────────────────────────────

export interface RankedEntry {
  playerId: string;
  rank: number;
  value: number;
  sample: number;
  context?: MetricValue["context"];
  /** Distance to first place in the metric's unit (0 for the leader). */
  gap: number;
}

export interface Board {
  metric: MetricDef;
  ranked: RankedEntry[];
  /** Players with some data but not enough to be ranked yet (averages and rates). */
  unranked: Array<{ playerId: string; sample: number; needed: number; value: number | null }>;
  /** Players with no usable games for this metric. */
  noData: string[];
  minGames: number;
}

/**
 * One metric's board: eligible players ranked (standard competition ranking: equal values share
 * a rank, 1, 1, 3), then the ones still short of the minimum, then those without data.
 */
export function buildBoard(metric: MetricDef, players: readonly PlayerData[], scope: Pick<LeaderboardScope, "role">, names: Map<string, string> = new Map()): Board {
  const minGames = scope.role ? MIN_ROLE_GAMES : MIN_GAMES;
  const ctx: ComputeContext = { minGames };
  const scored = players.map((p) => ({ p, v: metric.compute(p, ctx) }));
  const better = (a: number, b: number) => (metric.lowerIsBetter ? a - b : b - a);
  const eligible = scored.filter((s) => s.v.eligible && s.v.value !== null).sort((a, b) => better(a.v.value!, b.v.value!) || b.v.sample - a.v.sample || (names.get(a.p.playerId) ?? "").localeCompare(names.get(b.p.playerId) ?? ""));
  const leader = eligible[0]?.v.value ?? null;
  const ranked: RankedEntry[] = [];
  eligible.forEach((s, i) => {
    const prev = ranked[i - 1];
    const rank = prev && prev.value === s.v.value ? prev.rank : i + 1;
    ranked.push({ playerId: s.p.playerId, rank, value: s.v.value!, sample: s.v.sample, context: s.v.context, gap: leader === null ? 0 : Math.abs(leader - s.v.value!) });
  });
  const unranked = scored.filter((s) => !s.v.eligible && s.v.sample > 0 && (metric.kind === "average" || metric.kind === "rate")).map((s) => ({ playerId: s.p.playerId, sample: s.v.sample, needed: minGames, value: s.v.value })).sort((a, b) => b.sample - a.sample);
  const placed = new Set([...ranked.map((r) => r.playerId), ...unranked.map((u) => u.playerId)]);
  const noData = scored.filter((s) => !placed.has(s.p.playerId)).map((s) => s.p.playerId);
  return { metric, ranked, unranked, noData, minGames };
}

/** Metrics in a category, the role's natural strengths first when a role is chosen. */
export function metricsFor(category: LeaderboardCategory, role: GameRole | null): MetricDef[] {
  const list = METRICS.filter((m) => m.category === category);
  if (!role) return list;
  return [...list.filter((m) => m.roles?.includes(role)), ...list.filter((m) => !m.roles?.includes(role))];
}

/** "8.4", "52.3%", "12,340": a value as the board shows it. */
export function formatMetric(metric: Pick<MetricDef, "decimals" | "percent">, value: number): string {
  const v = metric.percent ? value * 100 : value;
  const s = v.toLocaleString("en", { minimumFractionDigits: metric.decimals, maximumFractionDigits: metric.decimals });
  return metric.percent ? `${s}%` : s;
}

/** How far a player is from first place, in words ("0.3 CS/min behind first"; averages say it is the current average gap). */
export function chaseText(metric: MetricDef, entry: RankedEntry): string | null {
  if (entry.rank === 1) return null;
  if (entry.gap === 0) return "Level with first place";
  const amount = metric.percent ? `${formatMetric({ ...metric, decimals: 1 }, entry.gap).replace("%", "")} percentage points` : `${formatMetric(metric, entry.gap)} ${unitFor(metric.unit, entry.gap)}`;
  if (metric.kind === "total") return `${amount} behind first place`;
  if (metric.kind === "record") return `${amount} short of the record`;
  return metric.lowerIsBetter ? `${amount} more than the leader's average` : `${amount} behind the leader's current average`;
}

/** "1 kill", "2 kills": the unit in the singular for exactly one. */
export function unitFor(unit: string, value: number): string {
  return value === 1 ? unit.replace(/\b(kills|wins|games|assists|champions|pentakills|bloods|turrets|points)\b/, (w) => w.slice(0, -1)) : unit;
}
