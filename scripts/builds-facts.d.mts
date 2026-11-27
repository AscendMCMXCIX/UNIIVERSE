/** Types for scripts/builds-facts.mjs (the live check is plain JavaScript run by node). */
export interface BuildsPartRead {
  part: string;
  state: string;
  choice: string | null;
  games: number | null;
  wins: number | null;
  total: number | null;
  key: string | null;
  commonGames: number | null;
  commonWins: number | null;
  commonKey: string | null;
  fourth: { games: number | null; total: number | null } | null;
  fifth: { games: number | null; total: number | null } | null;
  win: string;
  pick: string;
  tip: string;
  firm: boolean | null;
  greyed: boolean | null;
  pictures: number;
  top: number;
}

export interface BuildsColumnRead {
  n: number;
  status: string | null;
  queue: string | null;
  source: string | null;
  queueShown: string;
  role: string | null;
  roles: Array<{ role: string; games: number }>;
  mode: string | null;
  offersHighest: boolean;
  line: string;
  games: number | null;
  patches: string[];
  currentGames: number | null;
  timelineGames: number | null;
  few: string;
  offer: { queue: string | null; text: string } | null;
  top: number;
  parts: BuildsPartRead[];
  identity: boolean;
  scrollers: number;
}

export interface BuildsRead {
  url: string;
  queueInAddress: string | null;
  loads: number;
  mark: boolean;
  columns: BuildsColumnRead[];
}

export interface Verdict {
  name: string;
  status: "PASS" | "FAIL" | "WARN";
  detail: unknown;
}

export type ProbeQueue = "solo" | "flex" | "draft" | "clash";

export const BUILD_RULES: { section: number; part: number; choiceGames: number; choiceShare: number; performerGames: number; performerShare: number; performerZ: number; margin: number; firmGames: number };
export function wilson(wins: number, games: number, z?: number): { low: number; high: number } | null;
export function newcombe(a: { wins: number; games: number }, b: { wins: number; games: number }, z?: number): { low: number; high: number } | null;
export function probeFrom(value: string | undefined | null, local: boolean): Array<{ champion: string; queue: ProbeQueue }>;
export function probePath(probe: ReadonlyArray<{ champion: string; queue: ProbeQueue }>): string;
export function readBuildsColumns(): BuildsRead;
export function sectionProblems(col: BuildsColumnRead, rules?: typeof BUILD_RULES): string[];
export function highestProblems(col: BuildsColumnRead, rules?: typeof BUILD_RULES): string[];
export function buildsVerdicts(input: {
  kind: string;
  probe: ReadonlyArray<{ champion: string; queue: ProbeQueue }>;
  at?: BuildsRead;
  highest?: BuildsRead;
  roles?: BuildsRead[];
  flex?: BuildsRead;
  offered?: BuildsRead;
  back?: BuildsRead;
  swapped?: BuildsRead;
  healthPatch?: string | null;
}): Verdict[];
