import { LEADERBOARD_QUEUES, LEADERBOARD_ROLES, type LeaderboardGame } from "./leaderboards";
import type { GameRole } from "./season-stats";

/*
  Recent performance: the proposed default of Team Leaderboards (docs/LEADERBOARDS_MODEL.md).

  Everyone is compared on the same number of recent games: a player's latest 20 eligible games
  from the last 60 days (on a role board, games played in that role). A full window is
  "established" and ranked; 10 to 19 games is "provisional", listed after every established
  player and never above one; fewer is "not enough recent games". Figures are formed from the
  window's totals; a game without a figure is left out of that figure only. Nothing is weighted,
  adjusted or combined into a score, and playing more games never raises a place by itself.
*/

export const RECENT_WINDOW_GAMES = 20;
export const RECENT_PROVISIONAL_GAMES = 10;
export const RECENT_WINDOW_DAYS = 60;
/** Remakes are left out, as everywhere else in UNIIVERSE. */
const MIN_GAME_S = 300;
const MAX_GAME_S = 4 * 3600;
const DAY_MS = 86_400_000;

export type RecentBoard = "overall" | GameRole;
export type RecentMode = "all" | "ranked";
export type RecentStatus = "established" | "provisional" | "insufficient";
export type RecentFigure = "winRate" | "kda" | "csPerMin" | "damagePerMin" | "killParticipation" | "visionPerMin" | "damageShare";

export const RECENT_BOARDS: readonly RecentBoard[] = ["overall", ...LEADERBOARD_ROLES];
export const isRecentBoard = (v: unknown): v is RecentBoard => typeof v === "string" && (RECENT_BOARDS as readonly string[]).includes(v);
export const isRecentMode = (v: unknown): v is RecentMode => v === "all" || v === "ranked";

/** The figures each board shows: ranked by the first unless another is chosen. Overall has only the figure that means the same in every role. */
export const BOARD_FIGURES: Record<RecentBoard, readonly RecentFigure[]> = {
  overall: ["winRate"],
  TOP: ["winRate", "kda", "csPerMin", "damagePerMin"],
  JUNGLE: ["winRate", "kda", "killParticipation", "visionPerMin"],
  MID: ["winRate", "kda", "csPerMin", "damagePerMin"],
  ADC: ["winRate", "kda", "csPerMin", "damageShare"],
  SUPPORT: ["winRate", "kda", "killParticipation", "visionPerMin"],
};

interface FigureDef {
  label: string;
  /** Short unit for gaps ("0.4 KDA behind"). */
  unit: string;
  decimals: number;
  percent?: boolean;
  /** Whether a game carries the figure. */
  carries(g: LeaderboardGame): boolean;
  /** The figure over a window of games that carry it. */
  value(games: readonly LeaderboardGame[]): number;
}

const minutes = (g: LeaderboardGame) => (g.durationS ?? 0) / 60;
const timed = (g: LeaderboardGame) => g.durationS !== null && g.durationS >= MIN_GAME_S && g.durationS <= MAX_GAME_S;
const sum = (games: readonly LeaderboardGame[], f: (g: LeaderboardGame) => number) => games.reduce((n, g) => n + f(g), 0);

export const FIGURES: Record<RecentFigure, FigureDef> = {
  winRate: { label: "Win rate", unit: "win", decimals: 0, percent: true, carries: (g) => g.win !== null, value: (gs) => sum(gs, (g) => (g.win ? 1 : 0)) / gs.length },
  kda: {
    label: "KDA",
    unit: "KDA",
    decimals: 2,
    carries: (g) => g.kills !== null && g.deaths !== null && g.assists !== null,
    // From the window's totals; no deaths counts as one, as Riot's own KDA does.
    value: (gs) => (sum(gs, (g) => g.kills! + g.assists!) / Math.max(1, sum(gs, (g) => g.deaths!))),
  },
  csPerMin: { label: "CS per minute", unit: "CS/min", decimals: 1, carries: (g) => g.cs !== null && timed(g), value: (gs) => sum(gs, (g) => g.cs!) / sum(gs, minutes) },
  damagePerMin: { label: "Damage per minute", unit: "damage/min", decimals: 0, carries: (g) => g.damage !== null && timed(g), value: (gs) => sum(gs, (g) => g.damage!) / sum(gs, minutes) },
  killParticipation: {
    label: "Kill participation",
    unit: "points",
    decimals: 0,
    percent: true,
    carries: (g) => g.kills !== null && g.assists !== null && g.teamKills !== null && g.teamKills > 0,
    value: (gs) => sum(gs, (g) => g.kills! + g.assists!) / sum(gs, (g) => g.teamKills!),
  },
  visionPerMin: { label: "Vision per minute", unit: "vision/min", decimals: 2, carries: (g) => g.vision !== null && timed(g), value: (gs) => sum(gs, (g) => g.vision!) / sum(gs, minutes) },
  damageShare: {
    label: "Damage share",
    unit: "points",
    decimals: 0,
    percent: true,
    carries: (g) => g.damage !== null && g.teamDamage !== null && g.teamDamage > 0,
    value: (gs) => sum(gs, (g) => g.damage!) / sum(gs, (g) => g.teamDamage!),
  },
};

export interface RecentScope {
  board: RecentBoard;
  mode: RecentMode;
  now: Date;
}

const RANKED_QUEUES = new Set<number>([...LEADERBOARD_QUEUES.solo.queues, ...LEADERBOARD_QUEUES.flex.queues]);
const ALL_QUEUES = new Set<number>(LEADERBOARD_QUEUES.all.queues);

/** A player's eligible games for the scope, newest first: the queues of the mode, the board's role, no remakes, the last 60 days. */
export function eligibleGames(games: readonly LeaderboardGame[], scope: RecentScope): LeaderboardGame[] {
  const queues = scope.mode === "ranked" ? RANKED_QUEUES : ALL_QUEUES;
  const since = scope.now.getTime() - RECENT_WINDOW_DAYS * DAY_MS;
  return games
    .filter((g) => g.queueId !== null && queues.has(g.queueId) && g.gameCreation >= since && g.gameCreation <= scope.now.getTime() && (g.durationS === null || g.durationS >= MIN_GAME_S) && (scope.board === "overall" || g.role === scope.board))
    .sort((a, b) => b.gameCreation - a.gameCreation);
}

export const statusOf = (games: number): RecentStatus => (games >= RECENT_WINDOW_GAMES ? "established" : games >= RECENT_PROVISIONAL_GAMES ? "provisional" : "insufficient");

export interface WindowFigure {
  value: number | null;
  /** Games the figure used (at most 20). */
  games: number;
}

export interface RecentEntry {
  playerId: string;
  status: RecentStatus;
  /** Games in the window (by the win-rate window: the decided games among the latest 20). */
  games: number;
  wins: number;
  losses: number;
  /** The window's oldest and newest game. */
  from: number | null;
  to: number | null;
  figures: Partial<Record<RecentFigure, WindowFigure>>;
  /** Whether the oldest game in the window was a win (the next game replaces it). */
  oldestWon: boolean | null;
}

/** One player's window and figures for a board. */
export function recentEntry(playerId: string, games: readonly LeaderboardGame[], scope: RecentScope): RecentEntry {
  const eligible = eligibleGames(games, scope);
  const figures: Partial<Record<RecentFigure, WindowFigure>> = {};
  for (const f of BOARD_FIGURES[scope.board]) {
    const window = eligible.filter(FIGURES[f].carries).slice(0, RECENT_WINDOW_GAMES);
    figures[f] = { value: window.length ? FIGURES[f].value(window) : null, games: window.length };
  }
  const decided = eligible.filter(FIGURES.winRate.carries).slice(0, RECENT_WINDOW_GAMES);
  const wins = decided.filter((g) => g.win).length;
  return {
    playerId,
    status: statusOf(decided.length),
    games: decided.length,
    wins,
    losses: decided.length - wins,
    from: decided.at(-1)?.gameCreation ?? null,
    to: decided[0]?.gameCreation ?? null,
    figures,
    oldestWon: decided.length >= RECENT_WINDOW_GAMES ? !!decided.at(-1)!.win : null,
  };
}

export interface RankedRecent {
  entry: RecentEntry;
  /** Place among established players ("2=" when tied); null for provisional players. */
  rank: number | null;
  tied: boolean;
  /** Plain words: the gap to the place above, or what the next game can do. */
  note: string | null;
}

export interface RecentBoardResult {
  board: RecentBoard;
  figure: RecentFigure;
  /** Established players by the figure, then provisional players by the figure (never above an established one). */
  rows: RankedRecent[];
  /** Fewer than 10 recent games: not ranked. */
  notEnough: Array<{ entry: RecentEntry; needed: number }>;
}

/** A figure as the page shows it (percentages in points, rounded to the figure's decimals): places, ties and gaps use this, so two equal figures on the page always share a place. */
export function shownValue(figure: RecentFigure, value: number): number {
  const f = FIGURES[figure];
  return Number((value * (f.percent ? 100 : 1)).toFixed(f.decimals));
}

/** Ranks a board by one of its figures. Ties share a place; provisional players follow established ones. */
export function rankRecentBoard(entries: readonly RecentEntry[], board: RecentBoard, figure: RecentFigure = BOARD_FIGURES[board][0]!, names: ReadonlyMap<string, string> = new Map()): RecentBoardResult {
  const shown = (e: RecentEntry) => {
    const v = e.figures[figure]?.value;
    return v === null || v === undefined ? null : shownValue(figure, v);
  };
  const byValue = (a: RecentEntry, b: RecentEntry) => shown(b)! - shown(a)! || (names.get(a.playerId) ?? "").localeCompare(names.get(b.playerId) ?? "");
  const scored = entries.filter((e) => shown(e) !== null);
  const established = scored.filter((e) => e.status === "established" && (e.figures[figure]?.games ?? 0) >= RECENT_WINDOW_GAMES).sort(byValue);
  const provisional = scored.filter((e) => !established.includes(e) && e.status !== "insufficient" && (e.figures[figure]?.games ?? 0) >= RECENT_PROVISIONAL_GAMES).sort(byValue);
  const rows: RankedRecent[] = [];
  established.forEach((e, i) => {
    const prev = rows[i - 1];
    const tiedWithPrev = !!prev && shown(prev.entry) === shown(e);
    const rank = tiedWithPrev ? prev!.rank! : i + 1;
    if (tiedWithPrev) prev!.tied = true;
    rows.push({ entry: e, rank, tied: tiedWithPrev, note: null });
  });
  for (const r of rows) r.note = noteFor(r, rows, figure, names);
  for (const e of provisional) rows.push({ entry: e, rank: null, tied: false, note: `Provisional · ${e.figures[figure]?.games ?? e.games} of ${RECENT_WINDOW_GAMES} games` });
  const placed = new Set(rows.map((r) => r.entry.playerId));
  const notEnough = entries.filter((e) => !placed.has(e.playerId)).map((e) => ({ entry: e, needed: Math.max(0, RECENT_PROVISIONAL_GAMES - (e.figures[figure]?.games ?? e.games)) }));
  return { board, figure, rows, notEnough };
}

/** The window's win rate after one more game (a full window drops its oldest game). */
export function winRateAfterNextGame(e: RecentEntry, won: boolean): number {
  const full = e.games >= RECENT_WINDOW_GAMES;
  const wins = e.wins + (won ? 1 : 0) - (full && e.oldestWon ? 1 : 0);
  const games = full ? e.games : e.games + 1;
  return wins / games;
}

/** "Ash", "Ash and Bo", "Ash, Bo and Cy"; more than three tied players are counted instead. */
const nameList = (list: readonly string[]) => (list.length > 3 ? `${list.length} players` : list.length <= 2 ? list.join(" and ") : `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`);

/**
 * The note on an established row below first place: what the next game can do, or the gap to the
 * place directly above (every player sharing that place is named). Win rate is exact about the
 * next game, because the next game replaces the window's oldest: with every established window at
 * 20 games, one win can at best draw level with the place above, and only when the oldest game in
 * the window was a loss. The note assumes the players above do not play in the meantime, which the
 * page says once, under the board.
 */
function noteFor(row: RankedRecent, rows: readonly RankedRecent[], figure: RecentFigure, names: ReadonlyMap<string, string>): string | null {
  if (row.rank === null || row.rank === 1) return null;
  const shown = (e: RecentEntry) => shownValue(figure, e.figures[figure]?.value ?? 0);
  const mine = shown(row.entry);
  const higher = rows.filter((r) => r.rank !== null && shown(r.entry) > mine);
  if (!higher.length) return null;
  const theirs = Math.min(...higher.map((r) => shown(r.entry)));
  const who = nameList(higher.filter((r) => shown(r.entry) === theirs).map((r) => names.get(r.entry.playerId) ?? "the player above"));
  if (figure === "winRate") {
    const afterWin = shownValue(figure, winRateAfterNextGame(row.entry, true));
    if (afterWin === theirs) return `Win your next game to draw level with ${who}`;
    const winsBehind = Math.round(((theirs - mine) / 100) * row.entry.games);
    return `${winsBehind} ${winsBehind === 1 ? "win" : "wins"} behind ${who}`;
  }
  const f = FIGURES[figure];
  return `${(theirs - mine).toFixed(f.decimals)} ${f.unit} behind ${who}`;
}

/** §6 of docs/LEADERBOARDS_MODEL.md: a board needs this many established members before the page switches to it. */
export const ACCEPT_OVERALL = 5;
export const ACCEPT_ROLE = 3;

export interface RecentSampleBoard {
  established: number;
  provisional: number;
  insufficient: number;
  /** Members with 10 or more games: those a 10-game window would rank (the documented fallback). */
  tenOrMore: number;
  /** Median days from the oldest to the newest game of an established member's window. */
  windowDaysMedian: number | null;
}

export interface RecentSamples {
  window: { games: number; provisionalFrom: number; days: number };
  members: number;
  modes: Record<RecentMode, {
    boards: Record<RecentBoard, RecentSampleBoard>;
    /** Each member's eligible decided games in the last 60 days, by board (not capped at 20). */
    byMember: Array<{ member: string } & Record<RecentBoard, number>>;
    /** Whether each board has enough established members (§6). */
    acceptable: Record<RecentBoard, boolean>;
  }>;
}

/**
 * What the team's own games would put on each Recent performance board: established, provisional
 * and not-enough members per board and mode, and each member's eligible games (members are given
 * as anonymous labels). For the data audit, before the page switches to the model.
 */
export function recentSamples(games: readonly LeaderboardGame[], members: ReadonlyArray<{ id: string; label: string }>, now: Date): RecentSamples {
  const byPlayer = new Map<string, LeaderboardGame[]>();
  for (const g of games) byPlayer.set(g.playerId, [...(byPlayer.get(g.playerId) ?? []), g]);
  const median = (xs: number[]) => {
    if (!xs.length) return null;
    const sorted = [...xs].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  };
  const mode = (m: RecentMode) => {
    const boards = {} as Record<RecentBoard, RecentSampleBoard>;
    const acceptable = {} as Record<RecentBoard, boolean>;
    const counts = new Map<string, Record<RecentBoard, number>>(members.map((p) => [p.id, {} as Record<RecentBoard, number>]));
    for (const board of RECENT_BOARDS) {
      const scope = { board, mode: m, now };
      const entries = members.map((p) => {
        const mine = byPlayer.get(p.id) ?? [];
        counts.get(p.id)![board] = eligibleGames(mine, scope).filter(FIGURES.winRate.carries).length;
        return recentEntry(p.id, mine, scope);
      });
      const established = entries.filter((e) => e.status === "established");
      boards[board] = {
        established: established.length,
        provisional: entries.filter((e) => e.status === "provisional").length,
        insufficient: entries.filter((e) => e.status === "insufficient").length,
        tenOrMore: entries.filter((e) => e.games >= RECENT_PROVISIONAL_GAMES).length,
        windowDaysMedian: median(established.map((e) => Math.round((e.to! - e.from!) / DAY_MS))),
      };
      acceptable[board] = established.length >= (board === "overall" ? ACCEPT_OVERALL : ACCEPT_ROLE);
    }
    return { boards, byMember: members.map((p) => ({ member: p.label, ...counts.get(p.id)! })), acceptable };
  };
  return { window: { games: RECENT_WINDOW_GAMES, provisionalFrom: RECENT_PROVISIONAL_GAMES, days: RECENT_WINDOW_DAYS }, members: members.length, modes: { all: mode("all"), ranked: mode("ranked") } };
}
