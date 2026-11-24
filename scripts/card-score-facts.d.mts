/** Types for scripts/card-score-facts.mjs (the live check is plain JavaScript run by node). */
export interface CardScoreRead {
  index: number;
  state: string | null;
  score: number | null;
  rank: number | null;
  marks: number;
  markScore: number | null;
  markRank: number | null;
  spoken: boolean;
}
export interface OpenedScoreRead {
  open: boolean;
  timeline?: string | null;
  score?: number | null;
  rank?: number | null;
  loading?: boolean;
}
export interface Verdict {
  name: string;
  status: "PASS" | "FAIL" | "WARN";
  detail: unknown;
}
export function readCardScores(): CardScoreRead[];
export function readOpenedScore(): OpenedScoreRead;
export function firstScored(cards: CardScoreRead[]): number | null;
export function cardScoreVerdicts(input: { kind: string; cards: CardScoreRead[]; opened: OpenedScoreRead | null }): Verdict[];
