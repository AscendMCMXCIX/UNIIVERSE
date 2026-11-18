import fixture from "@/server/riot/fixtures/champion-abilities.fixture.json";
import type { DdragonChampionAbilities } from "@/domain/matchup-intel/types";

/*
  The committed offline copy of every champion's abilities (Data Dragon 16.22.1, built by
  scripts/matchup-intel/build-ability-fixture.mjs). Loaded with import() by
  seedChampionAbilitiesFromFixture only, so the pages and the jobs never carry it unless the
  offline fixture is being stored. abilities.test.ts checks its shape and that it is what the rules
  make of Data Dragon's files.
*/

export interface AbilityFixture {
  format: number;
  version: string;
  champions: Record<string, DdragonChampionAbilities>;
}

export function abilityFixture(): AbilityFixture {
  const { format, version, champions } = fixture as unknown as AbilityFixture;
  return { format, version, champions };
}
