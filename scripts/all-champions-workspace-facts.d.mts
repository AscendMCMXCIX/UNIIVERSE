/** Types for scripts/all-champions-workspace-facts.mjs (the live check is plain JavaScript run by node). */
export const WORKSPACE_MARGIN: number;
export interface WorkspaceRegion {
  per: number;
  page: number;
  pages: number;
  total: number;
}
export interface WorkspaceRead {
  window: number;
  height: number;
  /** #content's bottom padding, in px. */
  pad: number;
  /** The section carries [data-workspace] (the workspace applied). */
  workspace: boolean;
  /** Each card drawn: the list's and the preview's, its bottom, and the room between its last row and its footer (null without rows). */
  cards: Array<{ card: "list" | "preview"; bottom: number; margin: number | null }>;
  /** Elements in #content that scroll on their own. */
  scrollers: number;
  regions: Partial<Record<"list" | "opponents" | "games", WorkspaceRegion>>;
  /** The scope line's champion count (its digits). */
  scope: number | null;
}
export interface WorkspacePage {
  page: number;
  pages: number;
  per: number;
  total: number;
  /** Each row: its champion id hashed in the page (never the id), its games, its small-sample mark. */
  rows: Array<{ id: string; games: number; small: boolean }>;
  /** The small-sample divider's slots on the page. */
  dividers: number[];
  slots: number;
}
export interface WalkSummary {
  rows: number;
  distinct: number;
  repeats: number;
  pages: number;
  games: number[];
  small: boolean[];
}
export interface Verdict {
  name: string;
  status: "PASS" | "FAIL" | "WARN";
  detail: unknown;
}
export function readWorkspace(): WorkspaceRead;
export function readPage(region: "list" | "opponents" | "games"): WorkspacePage | null;
export function walkSummary(pages: Array<WorkspacePage | null>): WalkSummary;
export function workspaceVerdicts(input: {
  size: string;
  read: WorkspaceRead | null;
  list?: (WalkSummary & { total: number; per: number }) | null;
  opponents?: (WalkSummary & { total: number; count: number }) | null;
  games?: (WalkSummary & { record: number }) | null;
  steps?: {
    opened?: { heightBefore: number; heightAfter: number; beside: boolean; rowsKept: boolean } | null;
    detail?: { heightBefore: number; heightAfter: number; steps: boolean } | null;
    escaped?: { opponentsPageBefore: number; opponentsPage: number; /** An opponent opened from the second page (2+ pages): the page before and after Escape; null with one page. */ laterPageBefore?: number | null; laterPage?: number | null; closed: boolean; listPageBefore: number; listPage: number } | null;
  } | null;
}): Verdict[];
