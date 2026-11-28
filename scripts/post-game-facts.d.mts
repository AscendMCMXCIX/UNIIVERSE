/** Types for scripts/post-game-facts.mjs (the live check is plain JavaScript run by node). */
export interface PostGameRead {
  /** Under its card (the flow), or in the one-screen workspace's game window. */
  where?: "card" | "window";
  open: boolean;
  result?: string;
  itemSlots?: number;
  itemsNotRecorded?: boolean;
  trinketRound?: boolean;
  spellRuneSlots?: number;
  tiles?: number;
  kda?: number;
  csPerMin?: number;
  damageShare?: number;
  lane?: string | null;
  laneWords?: string;
  timeline?: string | null;
  panels?: { words: string[]; above: boolean; path: number; missing: boolean } | null;
  scores?: { rows: number; shown: number; inRange: boolean; mvp: number; ace: number; removed: number; panel: boolean; mvpOnWin?: boolean; aceOnLoss?: boolean };
  /** Where the parts sit, in px from the view's top: two columns (the lane right of the build column), the build column's and its area's ends, the lane's top and end, the scoreboard's and its notes' ends; null where a part was not found. */
  layout?: { columns: boolean; sideBottom: number; bodyBottom: number; laneTop: number; laneBottom: number; boardBottom: number; notesBottom?: number } | null;
  /** The open card's header's score and place, and the inspected player's row's; null where the card had no score. */
  header?: { score: number; rank: number; rowScore: number | null; rowRank: number | null } | null;
  removed?: { parts: number; words: number };
  steps?: number;
}
export interface InspectionRead {
  open: boolean;
  selected?: number;
  current?: number | null;
  currents?: number;
  headerMatchesRow?: boolean;
  own?: boolean;
  panels?: boolean;
  lane?: boolean;
  back?: boolean;
}
export interface FitRead {
  where?: "card" | "window";
  open: boolean;
  size?: string;
  height?: number;
  room?: number;
  scrollers?: number;
  clipped?: number;
  parts?: Record<string, unknown> | null;
}
type Verdict = { name: string; status: "PASS" | "FAIL" | "WARN"; detail: unknown };
export const REMOVED_WORDS: string[];
export const PANEL_WORDS: string[];
export const REMOVED_PARTS: string;
export function readPostGame(): PostGameRead;
export function readInspection(): InspectionRead;
export function postGameVerdicts(input: { kind: string; at: PostGameRead }): Verdict[];
export function switchVerdicts(input: { kind: string; before: InspectionRead; after: InspectionRead; back: InspectionRead }): Verdict[];
export function readFit(): FitRead;
export function fitVerdicts(input: { kind: string; at: FitRead }): Verdict[];
