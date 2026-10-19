/*
  Ranked Improvement: the rules of a deliberately simple, private Solo/Duo journal.

  A block starts at 0 games and simply counts up with every game logged, until the player finishes
  it (after any number of games). A target (a number of games) is optional and can be set or
  changed at any time; it is a plan, not a limit: the block goes on past it.
  a game records a handful of facts and one main mistake. Nothing here feeds team statistics or
  proficiency.
*/

/** The size of blocks started before players chose one (set on those rows by migration 0023). */
export const BLOCK_SIZE = 6;
export const MIN_BLOCK_SIZE = 1;
/** A sanity bound for a typed target, not a rule: a block can also have no target at all. */
export const MAX_BLOCK_SIZE = 100;

export function isBlockSize(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= MIN_BLOCK_SIZE && n <= MAX_BLOCK_SIZE;
}

/** A block's target: a number of games, or "open" (no target; finished whenever the player chooses). */
export type BlockTarget = number | "open";
export function isBlockTarget(t: unknown): t is BlockTarget {
  return t === "open" || isBlockSize(t);
}

/**
 * How a block stands: still being played, finished, or finished before its target. A target is a
 * plan, never a limit: reaching it does not close the block, and games past it stay in it.
 */
export type BlockState = "active" | "completed" | "completed-early";
export function blockState(status: string, games: number, planned: number | null): BlockState {
  if (status !== "completed") return "active";
  return planned !== null && games < planned ? "completed-early" : "completed";
}

/** The block in progress has reached (or passed) its target. */
export function targetReached(games: number, planned: number | null): boolean {
  return planned !== null && games >= planned;
}

/**
 * "0 Games" for a new block, then "1 Game", "7 Games": an open-ended count with no implied limit;
 * with a target the player chose: "4 of 5 games", "7 games · 2 past the target of 5".
 */
export function blockProgressText(games: number, planned: number | null): string {
  const g = `${games} game${games === 1 ? "" : "s"}`;
  if (planned === null) return `${games} Game${games === 1 ? "" : "s"}`;
  if (games > planned) return `${g} · ${games - planned} past the target of ${planned}`;
  return `${games} of ${planned} game${planned === 1 ? "" : "s"}`;
}
export function blockStateLabel(state: BlockState): string {
  return state === "active" ? "In progress" : state === "completed" ? "Completed" : "Completed early";
}

/**
 * How a block ends.
 * - "target": the player finishes it; a game target is optional and is a plan, not a limit.
 * - "two-losses": it completes by itself on its 2nd loss (losses count over the whole block, not
 *   in a row). The player can still finish it earlier.
 */
export type CompletionRule = "target" | "two-losses";
export const COMPLETION_RULES: readonly CompletionRule[] = ["target", "two-losses"];
export const LOSS_LIMIT = 2;
export function isCompletionRule(v: unknown): v is CompletionRule {
  return v === "target" || v === "two-losses";
}
export function completionRuleLabel(rule: CompletionRule): string {
  return rule === "two-losses" ? "Two-loss limit" : "Game target";
}

/** A block under the two-loss limit has reached it. */
export function lossLimitReached(rule: CompletionRule, losses: number): boolean {
  return rule === "two-losses" && losses >= LOSS_LIMIT;
}

/**
 * What a correction (an edited result or a deleted game) means for a block under the two-loss
 * limit, given its games now:
 * - an active block that now has two losses completes ("complete");
 * - a block the limit completed that no longer has two losses reopens ("reopen"), but only while
 *   it is the latest block and no other block is in progress; otherwise it stays completed;
 * - anything else stays as it is ("keep"). A block the player finished themselves never reopens.
 */
export function correctionOutcome(b: { rule: CompletionRule; status: "active" | "completed"; reason: string | null; losses: number; isLatest: boolean; otherActive: boolean }): "complete" | "reopen" | "keep" {
  if (b.rule !== "two-losses") return "keep";
  if (b.status === "active") return b.losses >= LOSS_LIMIT ? "complete" : "keep";
  if (b.reason === "two-losses" && b.losses < LOSS_LIMIT && b.isLatest && !b.otherActive) return "reopen";
  return "keep";
}

/** "Completed · 2-loss limit reached", "Completed early", "Completed", "In progress". */
export function blockStatusText(b: { state: BlockState; completedReason: string | null; losses: number }): string {
  if (b.state !== "active" && b.completedReason === "two-losses" && b.losses >= LOSS_LIMIT) return "Completed · 2-loss limit reached";
  return blockStateLabel(b.state);
}

export const MAIN_MISTAKES = [
  { key: "mechanics", label: "Mechanics" },
  { key: "trading-laning", label: "Trading / Laning" },
  { key: "wave-tempo", label: "Wave / Tempo" },
  { key: "vision-awareness", label: "Vision / Awareness" },
  { key: "macro-objectives", label: "Macro / Objectives" },
  { key: "positioning-teamfight", label: "Positioning / Teamfight" },
  { key: "decision-making", label: "Decision Making" },
  { key: "mental", label: "Mental" },
  { key: "other", label: "Other" },
] as const;

export type MainMistake = (typeof MAIN_MISTAKES)[number]["key"];

export function isMainMistake(value: unknown): value is MainMistake {
  return typeof value === "string" && MAIN_MISTAKES.some((m) => m.key === value);
}

export function mistakeLabel(key: string | null | undefined): string {
  return MAIN_MISTAKES.find((m) => m.key === key)?.label ?? "—";
}

export type GameResult = "win" | "loss";

export function isGameResult(value: unknown): value is GameResult {
  return value === "win" || value === "loss";
}

export interface JournalGameFacts {
  championId: string;
  enemyChampionId: string | null;
  result: GameResult;
  mainMistake: MainMistake | null;
  teammatePlayerId: string | null;
}

export interface JournalDashboard {
  totalGames: number;
  wins: number;
  losses: number;
  /** 0..1, null with no games. */
  winRate: number | null;
  mostCommonMistake: { key: MainMistake; label: string; count: number } | null;
}

/** Dashboard numbers from the games that actually exist (partial blocks count only their games). */
export function summariseGames(games: Array<Pick<JournalGameFacts, "result" | "mainMistake">>): JournalDashboard {
  const wins = games.filter((g) => g.result === "win").length;
  const counts = new Map<MainMistake, number>();
  for (const g of games) if (g.mainMistake) counts.set(g.mainMistake, (counts.get(g.mainMistake) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return {
    totalGames: games.length,
    wins,
    losses: games.length - wins,
    winRate: games.length ? wins / games.length : null,
    mostCommonMistake: top ? { key: top[0], label: mistakeLabel(top[0]), count: top[1] } : null,
  };
}

export interface ChampionPerformance {
  championId: string;
  games: number;
  wins: number;
  losses: number;
  winRate: number;
}

export function championPerformance(games: Array<Pick<JournalGameFacts, "championId" | "result">>): ChampionPerformance[] {
  const by = new Map<string, { games: number; wins: number }>();
  for (const g of games) {
    const e = by.get(g.championId) ?? { games: 0, wins: 0 };
    e.games += 1;
    if (g.result === "win") e.wins += 1;
    by.set(g.championId, e);
  }
  return [...by.entries()].map(([championId, e]) => ({ championId, games: e.games, wins: e.wins, losses: e.games - e.wins, winRate: e.wins / e.games })).sort((a, b) => b.games - a.games || a.championId.localeCompare(b.championId));
}

export function mistakeCounts(games: Array<Pick<JournalGameFacts, "mainMistake">>): Array<{ key: MainMistake; label: string; count: number }> {
  const counts = new Map<MainMistake, number>();
  for (const g of games) if (g.mainMistake) counts.set(g.mainMistake, (counts.get(g.mainMistake) ?? 0) + 1);
  return [...counts.entries()].map(([key, count]) => ({ key, label: mistakeLabel(key), count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export interface MatchupRecord {
  championId: string;
  enemyChampionId: string;
  games: number;
  wins: number;
  losses: number;
}

export function matchupRecords(games: Array<Pick<JournalGameFacts, "championId" | "enemyChampionId" | "result">>): MatchupRecord[] {
  const by = new Map<string, MatchupRecord>();
  for (const g of games) {
    if (!g.enemyChampionId) continue;
    const key = `${g.championId}|${g.enemyChampionId}`;
    const e = by.get(key) ?? { championId: g.championId, enemyChampionId: g.enemyChampionId, games: 0, wins: 0, losses: 0 };
    e.games += 1;
    if (g.result === "win") e.wins += 1;
    else e.losses += 1;
    by.set(key, e);
  }
  return [...by.values()].sort((a, b) => b.games - a.games || a.championId.localeCompare(b.championId));
}

/** "BLOCK 004" */
export function blockLabel(number: number): string {
  return `BLOCK ${String(number).padStart(3, "0")}`;
}

/** Accepts an OP.GG / match link and nothing else that could be abused (http(s) only, short). */
export function cleanLink(value: string | null | undefined): string {
  const v = (value ?? "").trim();
  if (!v) return "";
  if (!/^https?:\/\/[^\s]{1,300}$/i.test(v)) throw new Error("Links must start with http:// or https://.");
  return v;
}
