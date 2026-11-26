import { WIN_RATE_MIN_GAMES } from "@/domain/stats/win-rate";
import { MIN_PATTERN_GAMES } from "@/domain/matchups";
import { viewerWords } from "@/domain/viewer-words";

/*
  All Champions' preview: one champion in one position, and the player's record against each lane
  opponent (the enemy Riot placed in the player's position, only when exactly one enemy held it:
  domain/match-analysis laneOpponentOf, stored with each game). One table holds every opponent,
  however few the games (the owner's request of 25 Nov 2026: no folds, no Best/Worst tabs). The
  sample rules:

    every opponent   listed with its games, its W/L and its win rate
    1–2 games        a small sample: its win rate in the quiet colour, and never ranked by win rate
    3+ games         ranked by "Highest win rate" and "Lowest win rate"
    5+ games         the win rate may be coloured (the app's champion rule)

  Sorted by win rate, the opponents with 3+ games come first, ranked; those with 1–2 follow, after a
  quiet divider, in the same direction, so a 1–0 never tops the list as "100%".
*/

/** Games before an opponent's win rate is ranked by the win-rate sorts (fewer: a small sample, listed after the ranked ones). */
export const OPPONENT_MIN_GAMES = 3;
/** Games before an opponent's win rate is coloured (the app's champion rule). */
export const OPPONENT_TONED_GAMES = WIN_RATE_MIN_GAMES.champion;

export type OpponentSort = "games" | "high" | "low";
export const OPPONENT_SORTS: ReadonlyArray<{ key: OpponentSort; label: string; short: string }> = [
  { key: "games", label: "Most games", short: "Games" },
  { key: "high", label: "Highest win rate", short: "Highest" },
  { key: "low", label: "Lowest win rate", short: "Lowest" },
];

export interface OpponentTally {
  championId: string;
  games: number;
  wins: number;
  lastPlayedAt: number;
}

/** A small sample: too few games for its win rate to be ranked or read as a strength. */
export const smallSample = (o: Pick<OpponentTally, "games">) => o.games < OPPONENT_MIN_GAMES;

export interface ArrangedOpponents {
  /** Every opponent given, in the chosen order. */
  rows: OpponentTally[];
  /**
   * Sorted by win rate, the index of the first small sample after the ranked ones (the quiet divider
   * goes before it); null sorted by games, or where every row is on one side of the line.
   */
  divider: number | null;
}

const byGames = (a: OpponentTally, b: OpponentTally) => b.games - a.games || b.lastPlayedAt - a.lastPlayedAt || a.championId.localeCompare(b.championId);

/**
 * The opponents in the table's order. Most games: the most games first, then the most recent. Highest
 * and Lowest win rate: opponents with 3+ games by win rate (ties to more games, then the most
 * recent), then those with 1–2 games by win rate in the same direction (ties the same way).
 */
export function arrangeOpponents(all: readonly OpponentTally[], sort: OpponentSort): ArrangedOpponents {
  if (sort === "games") return { rows: [...all].sort(byGames), divider: null };
  const sign = sort === "high" ? -1 : 1;
  const rate = (o: OpponentTally) => o.wins / o.games;
  const byRate = (a: OpponentTally, b: OpponentTally) => sign * (rate(a) - rate(b)) || byGames(a, b);
  const ranked = all.filter((o) => !smallSample(o)).sort(byRate);
  const small = all.filter(smallSample).sort(byRate);
  return { rows: [...ranked, ...small], divider: ranked.length && small.length ? ranked.length : null };
}

/** What the pairing's games say at 10:00, from those with a timeline. */
export interface TenMinutes {
  /** Games that reached 10:00 with a usable timeline. */
  games: number;
  /** Of those, games in which the player had more gold than the lane opponent. */
  ahead: number;
  /** The average gold difference at 10:00 (+ ahead). */
  goldMean: number;
}

const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(Math.round(n)).toLocaleString("en")}`;

/**
 * The one sentence under an opponent, only with at least MIN_PATTERN_GAMES games with a timeline:
 * "in these games", never a cause. Worded for the viewer: "you" on one's own profile, the
 * champion's name on a teammate's.
 */
export function opponentSentence(ten: TenMinutes | null, o: { isOwn: boolean; champion: string; opponent: string }): string | null {
  if (!ten || ten.games < MIN_PATTERN_GAMES) return null;
  const who = viewerWords(o.isOwn, o.champion).subject;
  const games = ten.games === 1 ? "game" : "games";
  return `At 10:00 ${who} had more gold than ${o.opponent} in ${ten.ahead} of ${ten.games} ${games} with a timeline (${signed(ten.goldMean)} on average).`;
}

/** The preview's foot line: what a lane opponent is, and how many of the champion's games name one. */
export function opponentFootLine(o: { isOwn: boolean; known: number; games: number }): string {
  const position = viewerWords(o.isOwn).possessive;
  const known = o.known < o.games ? ` Known in ${o.known.toLocaleString("en")} of ${o.games.toLocaleString("en")} games.` : "";
  return `Lane opponent: the enemy Riot placed in ${position} position.${known}`;
}

/** An opponent's games' KDA, from the games that carry kills, deaths and assists (season-stats' rule). */
export interface PairingKda {
  /** Games with K/D/A. */
  games: number;
  kills: number;
  deaths: number;
  assists: number;
  /** (kills + assists) / deaths; without a death, the kills and assists a game (then `perfect`). */
  ratio: number;
  perfect: boolean;
}

/**
 * The KDA over one opponent's games as the preview opens them (each game's own K/D/A added up, as
 * the champion's KDA is: domain/season-stats), averages a game beside it; null when none of the
 * games has its figures (never a zero for unknown).
 */
export function pairingKda(games: ReadonlyArray<{ kills: number | null; deaths: number | null; assists: number | null }>): PairingKda | null {
  let n = 0;
  let k = 0;
  let d = 0;
  let a = 0;
  for (const g of games) {
    if (g.kills === null || g.deaths === null || g.assists === null) continue;
    n += 1;
    k += g.kills;
    d += g.deaths;
    a += g.assists;
  }
  if (!n) return null;
  return { games: n, kills: k / n, deaths: d / n, assists: a / n, ratio: d > 0 ? (k + a) / d : (k + a) / n, perfect: d === 0 };
}
