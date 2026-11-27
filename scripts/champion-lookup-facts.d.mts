/** Types for scripts/champion-lookup-facts.mjs (the live check is plain JavaScript run by node). */
export interface ChampionLookupRead {
  size: string;
  innerHeight: number;
  scrollHeight: number;
  heading: string;
  champion: string | null;
  name: string;
  source: string;
  slots: string;
  complete: number;
  haste: number;
  qKind: string | null;
  qBase: number[];
  qHasted: number[];
  qOpen: boolean;
  qDescription: number;
  passiveKind: string | null;
  passiveDash: string;
  passive: string;
  passiveHasted: boolean;
  rule: string;
  limit: string;
  range: string;
  mechanics: number;
  slotKeys: string;
  namesCut: number;
  lastBottom: number;
  hasteBottom: number;
  panels: number;
  sideBySide: boolean;
  rowsLevel: boolean;
  scrollers: number;
  timerWords: boolean;
  url: string;
  secondChampion: string | null;
  /** The first champion's builds section: "shown", "few", "unavailable", or null (none). */
  buildsStatus: string | null;
  /** The queue the section counts ("solo", "flex", "draft", "clash"), its source ("team", "master"), the name its queue choice shows, and whether the address names a queue. */
  buildsQueue: string | null;
  buildsSource: string | null;
  buildsQueueShown: string;
  buildsAddressQueue: boolean;
  /** Whether the queue choice offers the Master+ source. */
  buildsMasterOffered: boolean;
  buildsLine: string;
  buildsFew: string;
  /** Each part's row; `trees`: the rune page's tree icons drawn (two where the runes are shown). */
  buildsParts: Array<{ part: string; state: string; win: string; pick: string; pictures: number; trees: number; text: string }>;
  /** Compare: the two builds slots level; null with fewer than two. */
  buildsLevel: boolean | null;
  buildsIdentity: boolean;
}

export interface ChampionWindowRead {
  open: boolean;
  shown: number;
  counted: number;
  first: string | null;
  found: string;
}

export interface Verdict {
  name: string;
  status: "PASS" | "FAIL" | "WARN";
  detail: unknown;
}

export const QUEUE_NAMES: Record<"solo" | "flex" | "draft" | "clash", string>;
export const BUILDS_LINE: RegExp;
export const FEW_LINE: RegExp;
export function readChampionLookup(): ChampionLookupRead;
export function readChampionWindow(): ChampionWindowRead;
export function hasted(base: number, haste: number): number;
export function championLookupVerdicts(input: {
  kind: string;
  champion: string;
  at: ChampionLookupRead;
  wide: ChampionLookupRead;
  hastedRead: ChampionLookupRead;
  all: ChampionWindowRead;
  search: ChampionWindowRead;
  dual?: ChampionLookupRead;
  swapped?: ChampionLookupRead;
  removed?: ChampionLookupRead;
  /** The step of Compare, Swap and ✕ that did not finish; undefined: all finished. */
  stopped?: "compare" | "swap" | "remove";
  legacy: Pick<ChampionLookupRead, "url" | "champion" | "heading">;
  healthPatch?: string | null;
  /** /api/health's highElo.collection ("on" or "off"); undefined or null: not said. */
  healthHighElo?: string | null;
}): Verdict[];
