/** Types for scripts/matchup-intel/import-riot-text.mjs (plain JavaScript run by node; riot-text.test.ts imports it). */
import type { RiotTextChampion, RiotTextReview } from "../../src/domain/matchup-intel/types";

export const SLOTS: string[];
export const KINDS: string[];
export function plainText(raw: string): string;
export function clauseInText(clause: string, raw: string): boolean;
export function reviewOf(review: unknown): RiotTextReview;
export function importChampion(reviewed: unknown, full: unknown): { record: RiotTextChampion; notes: string[]; left: string[] };
export function serialise(record: RiotTextChampion): string;
export function serialiseIndex(ids: readonly string[]): string;
