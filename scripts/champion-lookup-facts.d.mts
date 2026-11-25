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
  passive: string;
  passiveHasted: boolean;
  rule: string;
  range: string;
  mechanics: number;
  lastBottom: number;
  hasteBottom: number;
  panels: number;
  sideBySide: boolean;
  scrollers: number;
  timerWords: boolean;
  url: string;
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
  legacy: Pick<ChampionLookupRead, "url" | "champion" | "heading">;
  healthPatch?: string | null;
}): Verdict[];
