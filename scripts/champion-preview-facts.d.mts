/** Types for scripts/champion-preview-facts.mjs (the live check is plain JavaScript run by node). */
export interface ChampionRow { games: number; open: boolean; top?: number; screen?: number }
export interface ChampionPreviewRead {
  open: boolean;
  sameChampion?: boolean;
  rowGames?: number;
  portrait?: boolean;
  named?: boolean;
  /** The position the preview shows (its key: TOP … SUPPORT), as its role selector has it chosen. */
  role?: string;
  /** That position against the row's position icons: chosen in the preview, one of the icons, the first (most played). */
  position?: { chosen: boolean; icon: boolean; first: boolean; icons: number };
  /** The games the row's icon gives for that position (-1 without one). */
  roleGames?: number;
  record?: string;
  winRate?: string;
  /** Where it is (desktop): a pane beside the list, no window, within the screen's width, the list's card and the row's name clear of it. */
  pane?: { pane: boolean; window: boolean; within: boolean; besideList: boolean; nameClear: boolean };
  /** One scrolling surface (desktop, the pane): the pane is a scroll box, the scroll boxes in main whose content overflows, and the pane's header (with Close) on screen. */
  scrolling?: { scrollBox: boolean; scrollers: number; head: boolean } | null;
  loading?: boolean;
  noOpponents?: boolean;
  answered?: boolean;
  opponents?: Array<{ games: number; says: boolean; rate: boolean; small: boolean }>;
  /** Opponents folded behind a toggle (none since 25 Nov 2026). */
  folded?: number;
  lookup?: number;
  lookupPage?: boolean;
  lookupChampion?: boolean;
  address?: { champion: boolean; role?: boolean };
}
export interface Verdict { name: string; status: "PASS" | "FAIL" | "WARN"; detail: unknown }
export function readChampionRows(): ChampionRow[];
export function readChampionPreview(rowIndex: number): ChampionPreviewRead;
export function firstWithGames(rows: ChampionRow[], min?: number): number;
export function targetRow(rows: ChampionRow[], min?: number): number;
export function championPreviewVerdicts(input: { kind: string; at: ChampionPreviewRead; step: { next: boolean; address: boolean; replaced: boolean } | null; escaped: { closed: boolean; address: boolean }; kept?: { scrolled: number; open: number; closed: number } }): Verdict[];
