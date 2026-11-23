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
  timeline?: string | null;
  removed?: { parts: number; words: number };
  steps?: number;
}
export const REMOVED_WORDS: string[];
export function readPostGame(): PostGameRead;
export function postGameVerdicts(input: { kind: string; at: PostGameRead }): Array<{ name: string; status: "PASS" | "FAIL" | "WARN"; detail: unknown }>;
