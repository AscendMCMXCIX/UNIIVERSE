/** Types for scripts/card-score-facts.mjs (the live check is plain JavaScript run by node). */
export interface CardScoreRead {
  index: number;
  state: string | null;
  /** The card's result ("W" or "L"), from its button. */
  result?: string | null;
  score: number | null;
  rank: number | null;
  marks: number;
  markScore: number | null;
  markRank: number | null;
  mvp?: boolean;
  ace?: boolean;
  /** The place badge: "mvp", "ace" or "place", its rank, and its colour against the tokens. */
  place?: string | null;
  placeRank?: number | null;
  tone?: "gold" | "violet" | "neutral" | null;
  /** The score's place shown on the card (the mark or its quiet dash): 1 when exactly one. */
  slots?: number;
  /** A wide card's score column, its left edge in px; null on a narrow card. */
  column?: number | null;
  /** On a narrow card: whether the score sits directly under the K/D/A; null on a wide card. */
  underKda?: boolean | null;
  spoken: boolean;
}
export interface TogetherMemberScoreRead {
  slots: number;
  scored: boolean;
  markScore: number | null;
  markRank: number | null;
  mvp: boolean;
  ace: boolean;
  place: string | null;
  placeRank: number | null;
  tone: "gold" | "violet" | "neutral" | null;
}
export interface TogetherScoreRead {
  index: number;
  result: string | null;
  members: TogetherMemberScoreRead[];
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
export function readTogetherScores(): TogetherScoreRead[];
export function togetherScoreVerdicts(input: { kind: string; games: TogetherScoreRead[] }): Verdict[];
