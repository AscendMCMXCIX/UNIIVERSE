import { WIN_RATE_MIN_GAMES } from "@/domain/stats/win-rate";
import { MIN_PATTERN_GAMES } from "@/domain/matchups";
import { viewerWords } from "@/domain/viewer-words";

/*
  All Champions' preview: one champion in one role, and the player's record against each lane
  opponent (the enemy Riot placed in the player's position, only when exactly one enemy held it:
  domain/match-analysis laneOpponentOf, stored with each game). The sample rules (CM §2.2):

    3+ games   an opponent is listed with a win rate, its games beside it
    5+ games   that win rate may be coloured, and Best and Worst rank it first
    1–2 games  folded into "N more opponents with 1–2 games", with W/L only

  With no opponent at 3 games, every opponent is listed with W/L only.
*/

/** Games before an opponent's win rate is shown. */
export const OPPONENT_MIN_GAMES = 3;
/** Opponents with 3+ games the preview's table shows before "N more" (the rest one click away), so the panel stays within the screen. */
export const OPPONENTS_SHOWN = 5;
/** Games before an opponent's win rate is coloured (the app's champion rule). */
export const OPPONENT_TONED_GAMES = WIN_RATE_MIN_GAMES.champion;

export type OpponentSort = "games" | "best" | "worst";
export const OPPONENT_SORTS: ReadonlyArray<{ key: OpponentSort; label: string }> = [
  { key: "games", label: "Most games" },
  { key: "best", label: "Best" },
  { key: "worst", label: "Worst" },
];
export const isOpponentSort = (v: unknown): v is OpponentSort => v === "games" || v === "best" || v === "worst";

export interface OpponentTally {
  championId: string;
  games: number;
  wins: number;
  lastPlayedAt: number;
}

export interface ArrangedOpponents {
  /** Listed with a win rate (3+ games), or every opponent (W/L only) when none has 3. */
  listed: OpponentTally[];
  /** 1–2 games, folded (W/L only); empty when `listed` already holds every opponent. */
  folded: OpponentTally[];
  /** No opponent met 3 times yet: `listed` shows W/L only. */
  noneEstablished: boolean;
}

const byGames = (a: OpponentTally, b: OpponentTally) => b.games - a.games || b.lastPlayedAt - a.lastPlayedAt || a.championId.localeCompare(b.championId);

/**
 * The opponents in the preview's order. Most games: the most games first, then the most recent.
 * Best and Worst: opponents at 5+ games first, then those at 3–4, each by win rate, ties to more
 * games, then the most recent.
 */
export function arrangeOpponents(all: readonly OpponentTally[], sort: OpponentSort): ArrangedOpponents {
  const established = all.filter((o) => o.games >= OPPONENT_MIN_GAMES);
  const small = all.filter((o) => o.games < OPPONENT_MIN_GAMES).sort(byGames);
  if (!established.length) return { listed: small, folded: [], noneEstablished: all.length > 0 };
  const rate = (o: OpponentTally) => o.wins / o.games;
  const tier = (o: OpponentTally) => (o.games >= OPPONENT_TONED_GAMES ? 0 : 1);
  const listed = [...established].sort((a, b) => {
    if (sort === "games") return byGames(a, b);
    const sign = sort === "best" ? -1 : 1;
    return tier(a) - tier(b) || sign * (rate(a) - rate(b)) || byGames(a, b);
  });
  return { listed, folded: small, noneEstablished: false };
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
