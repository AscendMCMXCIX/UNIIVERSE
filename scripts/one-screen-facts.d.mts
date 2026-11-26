/** Types for scripts/one-screen-facts.mjs (the live check is plain JavaScript run by node). */
export type OneScreenPage = "leaderboards" | "profile";
export interface OneScreenBox {
  id: string;
  present: boolean;
  top?: number;
  bottom?: number;
}
export interface OneScreenFold {
  board: string;
  present: boolean;
  total?: number;
  shown?: number;
  button?: boolean;
  words?: string | null;
}
export interface OneScreenRead {
  window: number;
  width: number;
  height: number;
  boxes: OneScreenBox[];
  folds: OneScreenFold[];
  /** Leaderboards only: words drawn across two lines (tiles: none since 25 Nov 2026, the tiles having gone). */
  words?: { broken: number; tiles: number; oneLine: number } | null;
}
export interface OneScreenInput {
  sections: Array<[string, string]>;
  overviews: Array<[string, string, string]>;
  whole: { root: string; tiles: string | null } | null;
}
export interface Verdict {
  name: string;
  status: "PASS" | "FAIL" | "WARN";
  detail: unknown;
}
export const ONE_SCREEN_SECTIONS: Record<OneScreenPage, Array<[string, string]>>;
export function oneScreenInput(page: OneScreenPage): OneScreenInput;
export function readOneScreen(input: OneScreenInput): OneScreenRead;
export function showAllCounts(words: string | null | undefined): [number | null, number | null];
export function oneScreenVerdicts(input: { page: OneScreenPage; size: string; read: OneScreenRead }): Verdict[];
