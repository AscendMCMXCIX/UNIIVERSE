/*
  The Data Dragon version the browser tests' server reads (playwright.config.ts passes it as
  DDRAGON_VERSION). The server's first static sync stores that version's champions, patch and
  abilities, which Data Dragon keeps for good, so the specs see the same data whatever Riot has
  shipped since: Champion Lookup's cooldowns, names and special cases as the specs expect them
  (docs/CHAMPION_LOOKUP.md). It is also the version of the committed offline copy of the abilities
  (ABILITY_FIXTURE_VERSION in src/server/riot/static/abilities.ts), so the demo's abilities and the
  pinned server's agree. Until 23 Nov 2026 it was the version the curated Matchup Intel notes were
  checked on. A local server for the specs needs the same variable (DDRAGON_VERSION=16.22.1 pnpm
  start, docs/RESPONSIVE.md, "Tests").
*/
export const E2E_DDRAGON_VERSION = "16.22.1";
