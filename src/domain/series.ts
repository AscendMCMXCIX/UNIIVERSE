/**
 * Best-of series rules. A series is a container for games against the same opponent in one
 * session; it ends as soon as one side has won enough games (2-0 or 2-1 in a best of three,
 * 3-0 to 3-2 in a best of five) or when someone ends it early. Pure functions only.
 */
export const SERIES_LENGTHS = [1, 3, 5] as const;
export type SeriesLength = (typeof SERIES_LENGTHS)[number];

export type SeriesStatus = "in_progress" | "completed" | "cancelled";
export type SeriesWinner = "us" | "them";
export type GameResult = "win" | "loss" | "cancelled" | null;

export function isSeriesLength(value: unknown): value is SeriesLength {
  return value === 1 || value === 3 || value === 5;
}

/** Wins needed to take the series. */
export function winsNeeded(bestOf: number): number {
  return Math.ceil(Math.max(1, bestOf) / 2);
}

export function seriesLabel(bestOf: number): string {
  return bestOf <= 1 ? "Single game" : `Best of ${bestOf}`;
}

export interface SeriesScore {
  ourWins: number;
  theirWins: number;
  /** Games with a recorded win or loss. */
  decided: number;
  winner: SeriesWinner | null;
  /** True once a side has reached the required number of wins. */
  decidedByScore: boolean;
}

/** Tallies the recorded results of a series' games and decides whether it is over. */
export function scoreSeries(bestOf: number, results: GameResult[]): SeriesScore {
  const ourWins = results.filter((r) => r === "win").length;
  const theirWins = results.filter((r) => r === "loss").length;
  const needed = winsNeeded(bestOf);
  const winner: SeriesWinner | null = ourWins >= needed ? "us" : theirWins >= needed ? "them" : null;
  return { ourWins, theirWins, decided: ourWins + theirWins, winner, decidedByScore: winner !== null };
}

/** Whether another game can be started: the series is open and nobody has won yet. */
export function canStartNextGame(input: { status: SeriesStatus; bestOf: number; ourWins: number; theirWins: number; gamesStarted: number }): boolean {
  if (input.status !== "in_progress") return false;
  if (scoreSeries(input.bestOf, [...Array(input.ourWins).fill("win"), ...Array(input.theirWins).fill("loss")]).winner) return false;
  return input.gamesStarted < input.bestOf;
}

/** "UNIIVERSE wins 2-1", "Team X wins 2-0", "1-1, in progress", "cancelled at 1-0". */
export function describeSeries(input: { status: SeriesStatus; ourWins: number; theirWins: number; winner: SeriesWinner | null; ourName: string; theirName: string }): string {
  const score = `${input.ourWins}-${input.theirWins}`;
  if (input.status === "cancelled") return `cancelled at ${score}`;
  if (input.winner === "us") return `${input.ourName} wins ${score}`;
  if (input.winner === "them") return `${input.theirName || "Opponent"} wins ${score}`;
  if (input.status === "completed") return `ended ${score}`;
  return `${score}, in progress`;
}
