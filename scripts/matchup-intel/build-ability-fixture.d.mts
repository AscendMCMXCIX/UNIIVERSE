/** Types for scripts/matchup-intel/build-ability-fixture.mjs (plain JavaScript run by node; abilities.test.ts imports it). */
import type { DdragonChampionAbilities } from "../../src/domain/matchup-intel/types";

export const ABILITY_RULES_FORMAT: number;
export const DESCRIPTION_MAX: number;
export function cleanDescription(raw: string): string;
export function riotTextHash(description: string, tooltip: string | null): string;
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
}
export function buildDigest(full: unknown): AbilityDigest;
export function serialiseDigest(digest: AbilityDigest): string;
