/** Types for scripts/static/build-ability-fixture.mjs (plain JavaScript run by node; abilities.test.ts imports it). */
import type { DdragonChampionAbilities } from "../../src/domain/champion-lookup/types";

export const ABILITY_RULES_FORMAT: number;
export const DESCRIPTION_MAX: number;
export function cleanDescription(raw: string): string;
export function riotTextHash(description: string, tooltip: string | null): string;
export const TIP_MAX: number;
export function riotTips(list: unknown): string[];
export function compactChampionAbilities(detail: unknown, version: string): DdragonChampionAbilities | null;
export interface AbilityFixture {
  format: number;
  version: string;
  source: "fixture";
  champions: Record<string, DdragonChampionAbilities>;
}
export function buildFixture(full: unknown): AbilityFixture;
export function serialiseFixture(fixture: AbilityFixture): string;
/** Each spell as Data Dragon gives it: [id, maxrank, cooldown, maxammo]. */
export type DigestSpell = [string | null, number | null, number[] | null, string | number | null];
export interface AbilityDigest {
  version: string;
  champions: Record<string, DigestSpell[]>;
  /** Riot's tips exactly as Data Dragon gives them (null when absent). */
  tips?: Record<string, { ally: unknown; enemy: unknown }>;
}
export function buildDigest(full: unknown): AbilityDigest;
export function serialiseDigest(digest: AbilityDigest): string;
