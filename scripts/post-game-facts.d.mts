/** Types for scripts/post-game-facts.mjs (the live check is plain JavaScript run by node). */
export interface PostGameRead {
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
  scores?: { rows: number; shown: number; inRange: boolean; mvp: number; ace: number; removed: number; panel: boolean };
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
type Verdict = { name: string; status: "PASS" | "FAIL" | "WARN"; detail: unknown };
export const REMOVED_WORDS: string[];
export const PANEL_WORDS: string[];
export function readPostGame(): PostGameRead;
export function readInspection(): InspectionRead;
export function postGameVerdicts(input: { kind: string; at: PostGameRead }): Verdict[];
export function switchVerdicts(input: { kind: string; before: InspectionRead; after: InspectionRead; back: InspectionRead }): Verdict[];
