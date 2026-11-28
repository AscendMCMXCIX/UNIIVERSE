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
  /** The page's own bottom padding (#content's), in px: the room under the sections is measured above it (Release 19). Absent in older readings. */
  pad?: number;
  boxes: OneScreenBox[];
  folds: OneScreenFold[];
  /** Leaderboards only: words drawn across two lines (tiles: none since 25 Nov 2026, the tiles having gone). */
  words?: { broken: number; tiles: number; oneLine: number } | null;
  /** Leaderboards only: each board's room under its last line (its foot's), in px. */
  spare?: OneScreenSpare[];
}
export interface OneScreenSpare {
  board: string;
  present: boolean;
  rows?: number;
  /** The room between the board's last line (its foot, where it has one) and its end, in px. */
  spare?: number;
  /** The gap between the last row and the foot, in px; null without a foot. */
  footGap?: number | null;
  /** The rows have grown as far as they may: their list at its cap (3.5rem a row on average), or held taller by its content. */
  grown?: boolean;
}
export interface OneScreenInput {
  sections: Array<[string, string]>;
  overviews: Array<[string, string, string]>;
  whole: { root: string; tiles: string | null } | null;
  fills: Array<[string, string, string | null]> | null;
}
export interface Verdict {
  name: string;
  status: "PASS" | "FAIL" | "WARN";
  detail: unknown;
}
export const ONE_SCREEN_SECTIONS: Record<OneScreenPage, Array<[string, string]>>;
export const FILL_ROW_MAX_REM: number;
export const FILL_SPARE_MAX: number;
/** The room the one-screen pages keep under their sections, above the page's bottom padding, in px (a warning under it). */
export const ROOM_MIN: number;
export function oneScreenInput(page: OneScreenPage): OneScreenInput;
export function readOneScreen(input: OneScreenInput): OneScreenRead;
export function showAllCounts(words: string | null | undefined): [number | null, number | null];
export function oneScreenVerdicts(input: { page: OneScreenPage; size: string; read: OneScreenRead }): Verdict[];

/** A workspace page's paged list as drawn: its `data-ws-region` name and figures (NaN where one is not drawn). */
export interface WorkspaceRegion {
  region: string;
  per: number;
  page: number;
  pages: number;
  total: number;
}
/** A workspace page's paged lists: each settled (drawn with its page size), and the settled ones' pages holding every row. */
export function workspaceRegionVerdicts(input: { kind: string; name: string; regions: WorkspaceRegion[] }): Verdict[];
