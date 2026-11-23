/** Types for scripts/champion-preview-facts.mjs (the live check is plain JavaScript run by node). */
export interface ChampionRow { games: number; open: boolean; top?: number; screen?: number }
export interface ChampionPreviewRead {
  open: boolean;
  sameChampion?: boolean;
  rowGames?: number;
  portrait?: boolean;
  named?: boolean;
  role?: string;
  record?: string;
  winRate?: string;
  /** Where the panel is (desktop): docked, no window, within the screen, its body not scrolling. */
  docked?: { panel: boolean; window: boolean; within: boolean; fits: boolean };
  loading?: boolean;
  noOpponents?: boolean;
  answered?: boolean;
  opponents?: Array<{ games: number; says: boolean }>;
  intel?: number;
  intelChampion?: boolean;
  intelVs?: boolean;
  address?: { champion: boolean };
}
export interface Verdict { name: string; status: "PASS" | "FAIL" | "WARN"; detail: unknown }
export function readChampionRows(): ChampionRow[];
export function readChampionPreview(rowIndex: number): ChampionPreviewRead;
export function firstWithGames(rows: ChampionRow[], min?: number): number;
export function targetRow(rows: ChampionRow[], min?: number): number;
export function championPreviewVerdicts(input: { kind: string; at: ChampionPreviewRead; step: { next: boolean; address: boolean; replaced: boolean } | null; escaped: { closed: boolean; address: boolean }; kept?: { scrolled: number; open: number; closed: number } }): Verdict[];
