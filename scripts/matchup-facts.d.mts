/** Types for scripts/matchup-facts.mjs (the live check is plain JavaScript run by node). */
export interface ShareRead { n: number; of: number; low: number; high: number; words: string }
export interface MatchupRead {
  size: string;
  innerHeight: number;
  url: string;
  band: boolean;
  bandLane: string | null;
  /** The band's two champions (ids): the one played and its lane opponent. */
  a: string | null;
  b: string | null;
  champion: string | null;
  secondChampion: string | null;
  /** Each column's side label ("Playing", "Against"). */
  sides: [string, string];
  /** The lane control's pressed value (TOP … SUPPORT, ALL for none). */
  lanePressed: string | null;
  /** The band's block headings, in order. */
  headings: string[];
  /** Each column's attack range as its facts show it. */
  ranges: [string, string];
  kit: Array<{ key: string | null; values: string | null; more: string | null; words: string }>;
  team: { state: string | null; games: number; queue: string | null; ahead: ShareRead | null; won: ShareRead | null; percents: number; line: string } | null;
  notes: { state: string | null; shown: Array<{ freshness: string | null; reviewed: string | null }>; hidden: Array<{ freshness: string | null; words: string }>; meta: string } | null;
  verdictWords: boolean;
  identity: boolean;
  bandBottom: number | null;
  lastBottom: number | null;
  scrollers: number;
}
export interface Verdict { name: string; status: "PASS" | "FAIL" | "WARN"; detail: unknown }
export function readMatchup(): MatchupRead;
export function matchupVerdicts(input: { at: MatchupRead; swapped?: MatchupRead; stopped?: string; healthPatch: string | null; mayStats?: boolean }): Verdict[];
