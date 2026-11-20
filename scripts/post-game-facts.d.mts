/** Types for scripts/post-game-facts.mjs (the live check is plain JavaScript run by node). */
export interface PostGameRead {
  open: boolean;
  result?: string;
  itemSlots?: number;
  itemsNotRecorded?: boolean;
  trinketRound?: boolean;
  spellRuneSlots?: number;
  runePage?: boolean;
  tiles?: number;
  kda?: number;
  csPerMin?: number;
  damageShare?: number;
  lane?: string | null;
  laneWords?: string;
  notesShown?: boolean;
  notesFallback?: boolean;
  sections?: { well: number; wrong: number; focus: number } | null;
  notes?: string[];
  steps?: number;
}
export interface NoteRules { refused: string[]; maxWords: number }
export function noteRules(source?: string): NoteRules;
export function wordCount(text: string): number;
export function refusedIn(text: string, refused: readonly string[]): string[];
export function readPostGame(): PostGameRead;
export function postGameVerdicts(input: { kind: string; at: PostGameRead; rules: NoteRules }): Array<{ name: string; status: "PASS" | "FAIL" | "WARN"; detail: unknown }>;
