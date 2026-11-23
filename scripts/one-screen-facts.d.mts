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
}
export interface Verdict {
  name: string;
  status: "PASS" | "FAIL" | "WARN";
  detail: unknown;
}
export const ONE_SCREEN_SECTIONS: Record<OneScreenPage, Array<[string, string]>>;
export function oneScreenInput(page: OneScreenPage): { sections: Array<[string, string]>; overviews: Array<[string, string, string]> };
export function readOneScreen(input: { sections: Array<[string, string]>; overviews: Array<[string, string, string]> }): OneScreenRead;
export function showAllCounts(words: string | null | undefined): [number | null, number | null];
export function oneScreenVerdicts(input: { page: OneScreenPage; size: string; read: OneScreenRead }): Verdict[];
