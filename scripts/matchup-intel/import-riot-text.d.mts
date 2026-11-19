/** Types for scripts/matchup-intel/import-riot-text.mjs (plain JavaScript run by node; riot-text.test.ts imports it). */
import type { RiotTextChampion, RiotTextReview } from "../../src/domain/matchup-intel/types";

export const SLOTS: string[];
export const KINDS: string[];
export function preparedText(raw: string | null | undefined): string;
export function spanInText(span: unknown, prepared: string | null): boolean;
export function shownClause(span: string): string;
export function reviewRecordOf(record: unknown): RiotTextReview;
export function importChampion(reviewed: unknown, full: unknown): { record: RiotTextChampion };
export function countsOf(records: readonly RiotTextChampion[]): { champions: number; facts: number; disagreements: number; qualifier: number; qualifierSource: number; conditional: number; alsoDescribedAs: number };
export function importTable(from: string, full: unknown): Promise<RiotTextChampion[]>;
export function serialise(record: RiotTextChampion): string;
export function serialiseIndex(ids: readonly string[]): string;
