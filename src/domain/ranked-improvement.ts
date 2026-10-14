/*
  Ranked Improvement: the rules of a deliberately simple, private Solo/Duo journal.

  A block holds as many games as the player chooses when starting it, and may be finished early;
  a game records a handful of facts and one main mistake. Nothing here feeds the draft engine or
  proficiency.
*/

/** The size of blocks started before players chose one. Never offered as a default. */
export const BLOCK_SIZE = 6;
export const MIN_BLOCK_SIZE = 1;
export const MAX_BLOCK_SIZE = 20;

export function isBlockSize(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= MIN_BLOCK_SIZE && n <= MAX_BLOCK_SIZE;
}

/** How a block stands: still being played, finished at its planned size, or finished early. */
export type BlockState = "active" | "completed" | "completed-early";
export function blockState(status: string, games: number, planned: number): BlockState {
  if (status !== "completed") return "active";
  return games < planned ? "completed-early" : "completed";
}
export function blockStateLabel(state: BlockState): string {
  return state === "active" ? "In progress" : state === "completed" ? "Completed" : "Completed early";
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
