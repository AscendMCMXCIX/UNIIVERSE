/** Types for scripts/static/review-ability-ranges.mjs (plain JavaScript run by node; ability-ranges.test.ts imports it). */
export const RANGE_TABLE_FORMAT: number;
export const SPELL_SLOTS: readonly ["Q", "W", "E", "R"];
export const RANGE_KINDS: readonly ["reach", "global", "self", "none"];
export const RANGE_REVIEWERS: readonly ["automated draft", "automated review", "owner"];
export const NONE_REASONS: readonly string[];
export const TWO_FORMS: RegExp;
export function plainText(raw: unknown): string;
export interface RangeDraft {
  kind: "reach" | "global" | "self" | "none" | null;
  confidence: "high" | "medium" | "low";
  rule: string;
  why?: string;
  cues?: Record<string, boolean>;
}
export function draftRange(spell: unknown, champion: unknown): RangeDraft;
export interface RangeTableRow {
  champion: string;
  slot: "Q" | "W" | "E" | "R";
  spell: string;
  kind: "reach" | "global" | "self" | "none";
  why?: string;
  range: number[];
  textHash: string;
  version: string;
  reviewed: string;
  reviewer: "automated draft" | "automated review" | "owner";
  rule?: string;
}
export interface RangeTable {
  format: number;
  rows: RangeTableRow[];
}
export interface TableSpell {
  champion: string;
  slot: "Q" | "W" | "E" | "R";
  spell: string | null;
  name: string;
  range: number[] | null;
  textHash: string;
  detail: unknown;
  championDetail: unknown;
}
export function spellsOf(full: unknown): { version: string; spells: TableSpell[] };
export function rowMatches(row: RangeTableRow | null | undefined, spell: TableSpell | null | undefined): boolean;
export function checkTable(table: { rows: RangeTableRow[] }, full: unknown): { version: string; spells: number; rows: number; matching: Record<string, number>; changed: Array<{ key: string; reviewer: string; kind: string; moved: string[] }>; unreviewed: string[]; gone: string[] };
export function draftAll(full: unknown, table: { rows: RangeTableRow[] }): { version: string; drafts: Array<Record<string, unknown> & { champion: string; slot: string; draft: RangeDraft }> };
export function writeTable(
  table: { rows: RangeTableRow[] },
  full: unknown,
  date: string,
): {
  table: RangeTable;
  done: { kept: number; keptStale: number; keptGone: number; replaced: number; dropped: number; droppedGone: number; added: number; leftForReview: number };
  /** Rows whose spell is not in the file: reviewed ones kept, automated drafts dropped ("Champion:Q" keys). */
  gone: { kept: string[]; dropped: string[] };
};
export function serialiseTable(table: RangeTable): string;
