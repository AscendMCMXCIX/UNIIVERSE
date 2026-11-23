/** Types for scripts/multikill-facts.mjs (the live check is plain JavaScript run by node). */
export interface MultikillRowRead {
  status: string | null;
  place: number | null;
  score: number | null;
  shown: string | null;
  /** Penta, quadra, triple, double. */
  counts: number[];
  /** Riot's counters: double, triple, quadra, penta. */
  riot?: number[];
  kinds: string[];
  crown: boolean;
  height: number;
}
export interface MultikillBoardRead {
  present: boolean;
  rows?: MultikillRowRead[];
  tiles?: Array<{ kind: string | null; count: number | null }>;
  basis?: string;
  explained?: boolean;
  rule?: "nested" | "separate" | null;
  empty?: boolean;
}
export interface Verdict {
  name: string;
  status: "PASS" | "FAIL" | "WARN";
  detail: unknown;
}
export function readMultikillBoard(): MultikillBoardRead;
export const MULTIKILL_BASES: { "same-games": string; team: string };
export function kindsInWords(counts: number[]): string[];
export function eventsOf(riot: number[], rule: "nested" | "separate"): number[];
export function multikillVerdicts(input: { kind: string; read: MultikillBoardRead }): Verdict[];
