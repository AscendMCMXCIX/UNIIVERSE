import { LEADERBOARD_QUEUES, longestWinStreak, type LeaderboardGame, type LeaderboardMastery } from "./leaderboards";
import { seasonOfPatch } from "./season";
import type { GameRole } from "./season-stats";

/*
  Records & achievements (docs/LEADERBOARDS_MODEL.md §4): single games and milestones, kept apart
  from Recent form. More games give more chances here, which is expected of a record, and the page
  says so. Everything counts one season's supported Summoner's Rift games (one per match per
  player; remakes left out, as everywhere in UNIIVERSE), except Riot's champion mastery, which is
  all-time by Riot's definition and so has a heading of its own.

  A record's holder is the best value as the page shows it; when two read the same, whoever set it
  first keeps it. Nothing is weighted or combined.
*/

/** Per-minute records count games of 15 minutes or more, so a short stomp or an early surrender does not set them. */
export const RECORD_MIN_GAME_S = 15 * 60;
/** A KDA record needs a real game behind it: 10 or more takedowns (kills plus assists). */
export const KDA_RECORD_MIN_TAKEDOWNS = 10;
export const CHAMPION_GAME_MILESTONES = [25, 50, 100] as const;
export const MASTERY_MILESTONES = [100_000, 500_000, 1_000_000] as const;

const REMAKE_S = 300;
const MAX_GAME_S = 4 * 3600;
const SUPPORTED_QUEUES = new Set<number>(LEADERBOARD_QUEUES.all.queues);

export type SeasonRecordId = "kills" | "assists" | "damage-per-minute" | "cs-per-minute" | "vision-per-minute" | "kda" | "win-streak";

export interface SeasonRecordDef {
  id: SeasonRecordId;
  label: string;
  /** After the number: "kills", "CS/min". */
  unit: string;
  decimals: number;
  /** What counts, when the name does not say it all ("" when it does). */
  definition: string;
}

interface SingleGameDef extends SeasonRecordDef {
  value(g: LeaderboardGame): number | null;
}

const minutes = (g: LeaderboardGame) => (g.durationS ?? 0) / 60;
const longEnough = (g: LeaderboardGame) => g.durationS !== null && g.durationS >= RECORD_MIN_GAME_S && g.durationS <= MAX_GAME_S;
const hasKda = (g: LeaderboardGame) => g.kills !== null && g.kills >= 0 && g.deaths !== null && g.deaths >= 0 && g.assists !== null && g.assists >= 0;
const perMinute = (pick: (g: LeaderboardGame) => number | null) => (g: LeaderboardGame) => {
  const v = pick(g);
  return v !== null && v >= 0 && longEnough(g) ? v / minutes(g) : null;
};

const SINGLE_GAME: readonly SingleGameDef[] = [
  { id: "kills", label: "Most kills in a game", unit: "kills", decimals: 0, definition: "", value: (g) => (hasKda(g) ? g.kills : null) },
  { id: "assists", label: "Most assists in a game", unit: "assists", decimals: 0, definition: "", value: (g) => (hasKda(g) ? g.assists : null) },
  { id: "damage-per-minute", label: "Most damage per minute", unit: "damage/min", decimals: 0, definition: "Damage to champions, in a game of 15 minutes or more.", value: perMinute((g) => g.damage) },
  { id: "cs-per-minute", label: "Most CS per minute", unit: "CS/min", decimals: 1, definition: "Lane minions and monsters, in a game of 15 minutes or more.", value: perMinute((g) => g.cs) },
  { id: "vision-per-minute", label: "Most vision per minute", unit: "vision/min", decimals: 2, definition: "Vision score, in a game of 15 minutes or more.", value: perMinute((g) => g.vision) },
  {
    id: "kda",
    label: "Best KDA in a game",
    unit: "KDA",
    decimals: 1,
    definition: `(Kills + assists) ÷ deaths, in a game with ${KDA_RECORD_MIN_TAKEDOWNS} or more takedowns; no deaths counts as one.`,
    value: (g) => (hasKda(g) && g.kills! + g.assists! >= KDA_RECORD_MIN_TAKEDOWNS ? (g.kills! + g.assists!) / Math.max(1, g.deaths!) : null),
  },
];

const STREAK: SeasonRecordDef = { id: "win-streak", label: "Longest win streak", unit: "wins in a row", decimals: 0, definition: "In the order the games were played." };

/** The seven season records, in the order the page shows them. */
export const SEASON_RECORDS: readonly SeasonRecordDef[] = [...SINGLE_GAME.map(({ value: _value, ...def }) => def), STREAK];

/** The value as the page shows it (rounded to the record's decimals): holders and ties use this. */
export const shownRecordValue = (def: Pick<SeasonRecordDef, "decimals">, value: number) => Number(value.toFixed(def.decimals));

export interface RecordGame {
  matchId: string;
  championId: string;
  role: GameRole | null;
  gameCreation: number;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
}

export interface RecordMark {
  playerId: string;
  value: number;
  /** The game it was set in; null for the win streak, which spans several. */
  game: RecordGame | null;
  /** The win streak: when it ended (its last win). */
  endedAt: number | null;
}

export interface SeasonRecordResult {
  def: SeasonRecordDef;
  /** The team record; null when no game in the season carries the figure. */
  holder: RecordMark | null;
  /** Each player's own best, by player id. */
  bests: Record<string, RecordMark>;
}

export interface MultikillRow {
  playerId: string;
  penta: number;
  quadra: number;
  triple: number;
}

export interface ChampionMilestone {
  playerId: string;
  championId: string;
  /** Games this season, or mastery points (all-time, added up over the player's linked accounts). */
  value: number;
  /** The highest milestone reached (25 games, 500,000 points…). */
  milestone: number;
}

export interface RecordsResult {
  season: number;
  /** The season's supported games behind the records (one per match per player). */
  games: number;
  records: SeasonRecordResult[];
  /** Players with a multikill this season, rarest first (pentakills, then quadra, then triple kills). */
  multikills: MultikillRow[];
  /** How many of the season's games carry Riot's multikill figures (kept from Phase 14 on). */
  multikillGames: number;
  championGames: ChampionMilestone[];
  mastery: ChampionMilestone[];
}

/** One season's supported Summoner's Rift games, remakes left out: what every record and milestone here counts. */
export function seasonGames(games: readonly LeaderboardGame[], season: number): LeaderboardGame[] {
  return games.filter((g) => seasonOfPatch(g.patch) === season && g.queueId !== null && SUPPORTED_QUEUES.has(g.queueId) && (g.durationS === null || g.durationS >= REMAKE_S));
}

const gameOf = (g: LeaderboardGame): RecordGame => ({ matchId: g.matchId, championId: g.championId, role: g.role, gameCreation: g.gameCreation, kills: g.kills, deaths: g.deaths, assists: g.assists });

/** Earlier is better on a tie: whoever set it first keeps it. */
const beats = (def: SeasonRecordDef, a: { value: number; at: number }, b: { value: number; at: number } | undefined) => {
  if (!b) return true;
  const av = shownRecordValue(def, a.value);
  const bv = shownRecordValue(def, b.value);
  return av > bv || (av === bv && a.at < b.at);
};

const reached = (value: number, steps: readonly number[]) => steps.reduce((m, s) => (value >= s ? s : m), 0);

/**
 * The season's records, multikills and milestones for these players. Games of anyone not in
 * `playerIds` are ignored, so the boards never name someone who is not on them.
 */
export function buildRecords(input: { games: readonly LeaderboardGame[]; mastery: readonly LeaderboardMastery[]; playerIds: readonly string[]; season: number }): RecordsResult {
  const members = new Set(input.playerIds);
  const games = seasonGames(input.games, input.season).filter((g) => members.has(g.playerId));

  const records: SeasonRecordResult[] = SINGLE_GAME.map(({ value, ...def }) => {
    const bests: Record<string, RecordMark> = {};
    let holder: RecordMark | null = null;
    for (const g of games) {
      const v = value(g);
      if (v === null || !Number.isFinite(v) || v < 0) continue;
      const mark: RecordMark = { playerId: g.playerId, value: v, game: gameOf(g), endedAt: null };
      const mine = bests[g.playerId];
      if (beats(def, { value: v, at: g.gameCreation }, mine ? { value: mine.value, at: mine.game!.gameCreation } : undefined)) bests[g.playerId] = mark;
      if (beats(def, { value: v, at: g.gameCreation }, holder ? { value: holder.value, at: holder.game!.gameCreation } : undefined)) holder = mark;
    }
    return { def, holder, bests };
  });

  // The win streak: each player's longest run this season; the team record is the longest, the earlier run on a tie.
  const byPlayer = new Map<string, LeaderboardGame[]>();
  for (const g of games) {
    const list = byPlayer.get(g.playerId);
    if (list) list.push(g);
    else byPlayer.set(g.playerId, [g]);
  }
  const streakBests: Record<string, RecordMark> = {};
  let streakHolder: RecordMark | null = null;
  for (const [playerId, list] of byPlayer) {
    const s = longestWinStreak(list);
    if (s.length === 0 || s.endedAt === null) continue;
    const mark: RecordMark = { playerId, value: s.length, game: null, endedAt: s.endedAt };
    streakBests[playerId] = mark;
    if (beats(STREAK, { value: s.length, at: s.endedAt }, streakHolder ? { value: streakHolder.value, at: streakHolder.endedAt! } : undefined)) streakHolder = mark;
  }
  records.push({ def: STREAK, holder: streakHolder, bests: streakBests });

  // Multikills: Riot's own counts, from the games that carry them.
  const multi = new Map<string, MultikillRow>();
  let multikillGames = 0;
  for (const g of games) {
    // A game carries the counts when its record carries them (the rule of the profiles' multikill
    // coverage: extra figures without the counts, as a record Riot sent without them, are none).
    if (!g.extra || typeof g.extra.doubleKills !== "number") continue;
    multikillGames += 1;
    const { pentaKills = 0, quadraKills = 0, tripleKills = 0 } = g.extra;
    if (pentaKills + quadraKills + tripleKills === 0) continue;
    const row = multi.get(g.playerId) ?? { playerId: g.playerId, penta: 0, quadra: 0, triple: 0 };
    row.penta += pentaKills;
    row.quadra += quadraKills;
    row.triple += tripleKills;
    multi.set(g.playerId, row);
  }
  const multikills = [...multi.values()].sort((a, b) => b.penta - a.penta || b.quadra - a.quadra || b.triple - a.triple || a.playerId.localeCompare(b.playerId));

  // Champion milestones: games on one champion this season, and Riot's all-time mastery on one champion.
  const championGames: ChampionMilestone[] = [];
  for (const [playerId, list] of byPlayer) {
    const counts = new Map<string, number>();
    for (const g of list) counts.set(g.championId, (counts.get(g.championId) ?? 0) + 1);
    for (const [championId, n] of counts) {
      const milestone = reached(n, CHAMPION_GAME_MILESTONES);
      if (milestone) championGames.push({ playerId, championId, value: n, milestone });
    }
  }
  const points = new Map<string, number>();
  for (const m of input.mastery) {
    if (!members.has(m.playerId) || m.points <= 0) continue;
    const k = `${m.playerId}\u0000${m.championId}`;
    points.set(k, (points.get(k) ?? 0) + m.points);
  }
  const mastery: ChampionMilestone[] = [];
  for (const [k, value] of points) {
    const milestone = reached(value, MASTERY_MILESTONES);
    if (!milestone) continue;
    const [playerId, championId] = k.split("\u0000") as [string, string];
    mastery.push({ playerId, championId, value, milestone });
  }
  const byMilestone = (a: ChampionMilestone, b: ChampionMilestone) => b.milestone - a.milestone || b.value - a.value || a.playerId.localeCompare(b.playerId) || a.championId.localeCompare(b.championId);

  return { season: input.season, games: games.length, records, multikills, multikillGames, championGames: championGames.sort(byMilestone), mastery: mastery.sort(byMilestone) };
}
