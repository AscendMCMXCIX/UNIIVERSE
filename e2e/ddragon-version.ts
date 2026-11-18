/*
  The Data Dragon version the browser tests' server reads (playwright.config.ts passes it as
  DDRAGON_VERSION; docs/MATCHUP_INTEL.md, "What the browser tests pin"): the version the curated
  Matchup Intel notes were checked on. The server's first static sync stores that version's
  champions, patch and abilities, which Data Dragon keeps for good, so the specs see the same data
  whatever Riot has shipped since: the briefings shown as checked, Riot's numbers as checked.

  Re-checking the notes on a newer version moves this in the same pull request:
  src/server/matchup-intel/curated/curated.test.ts refuses a pin other than the newest version the
  notes are checked against. A local server for the specs needs the same variable
  (DDRAGON_VERSION=16.22.1 pnpm start, docs/RESPONSIVE.md, "Tests").
*/
export const E2E_DDRAGON_VERSION = "16.22.1";
