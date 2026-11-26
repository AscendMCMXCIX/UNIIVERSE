/** Types for scripts/multikill-facts.mjs (the live check is plain JavaScript run by node). */
export interface MultikillRowRead {
  status: string | null;
  place: number | null;
  score: number | null;
  shown: string | null;
  /** Penta, quadra, triple, double. */
  counts: number[];
  /** The table's kind cells as drawn, penta to double (null where a cell is missing). */
  cells: Array<number | null>;
  counted: number | null;
  /** The games column as drawn. */
  games: number | null;
  /** Riot's counters: double, triple, quadra, penta. */
  riot?: number[];
  leader: boolean;
  crown: boolean;
  /** The role icon's accessible name says the most-played position, a split or an unknown role. */
  roleNamed: boolean;
  scoreButton: boolean;
  height: number;
}
export interface MultikillBoardRead {
  present: boolean;
  rows?: MultikillRowRead[];
  heads?: string[] | null;
  basis?: string;
  explained?: boolean;
  legend?: boolean;
  rule?: string | null;
  empty?: boolean;
  folds?: number;
  /** Elements in main that scroll inside themselves. */
  scrollers?: number;
}
export interface MultikillBreakdownRead {
  present: boolean;
  score?: number | null;
  calc?: { earned: number | null; expected: number | null; cushion: number | null; score: number | null } | null;
  kinds?: Array<{ made: number | null; weight: number | null; points: number | null }>;
  role?: boolean;
  comparison?: boolean;
  levels?: number;
  scrolls?: number;
}
export interface Verdict {
  name: string;
  status: "PASS" | "FAIL" | "WARN";
  detail: unknown;
}
export function readMultikillBoard(): MultikillBoardRead;
export function readMultikillBreakdown(): MultikillBreakdownRead;
export const MULTIKILL_BASES: { "same-games": string; team: string };
export const MULTIKILL_HEADS: string[][];
export function eventsOf(riot: number[], rule: "nested" | "separate"): number[];
export function scoreFrom(calc: { earned: number; expected: number; cushion: number }): number;
export function multikillVerdicts(input: { kind: string; read: MultikillBoardRead }): Verdict[];
export function breakdownVerdicts(input: { kind: string; read: MultikillBreakdownRead; rowScore: number | null | undefined }): Verdict[];
