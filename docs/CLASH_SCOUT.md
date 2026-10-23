# Clash Scout (retired)

**Status: permanently removed on 23 Oct 2026, at the owner's request,** and its saved scouts
deleted with their tables by migration `0057`. There is no replacement, placeholder or archive page.
This page records what was removed and what is left on purpose. It is not a guide to the old
implementation.

Clash Scout was a team-only workspace (`/clash`) that read the opposing team's Clash scouting
screenshots in the browser and helped members say which Riot account each opponent was. It was
released on 20 Oct 2026 (PR #70) and grew through #98, #103, #108, #121, #126, #128 and #129.

## What was removed

- **Pages and navigation:** `/clash`, saved scouts at `/clash/<id>`, the Testing Lab at
  `/clash/lab`, and the Clash Scout entry in the sidebar (expanded and collapsed), the phone and
  tablet menu and the phone tab bar. The tab bar is now Profile, Team and Resources in three equal
  columns. The old addresses answer the app's own "not found" (signed out, sign-in comes first, as
  for every members' page).
- **Code:** `src/components/clash/`, `src/domain/clash-scout/`, `src/server/clash/`,
  `src/server/actions/clash.ts` and `clash-lab.ts`, `src/app/api/clash/` (champion prints) and the
  PNG decoder only it used (`src/server/images/png.ts`).
- **Behaviour:** screenshot reading (text recognition and portrait matching), identity matching,
  candidate discovery and mastery fingerprinting, scouting-only Riot verification, saved scouts and
  their history, OP.GG links for scouted players, and the manual, blind and outdated-data tests.
- **Riot requests:** every request made for Clash Scout (ACCOUNT-V1 by Riot ID and by PUUID for
  opponents, CHAMPION-MASTERY-V4 for accounts that are not members' own). The identity client's
  `accountByPuuid`, used only here, is gone; account linking and the account sync are unchanged.
- **Job:** `lab-benchmark` (on demand only; never scheduled). Its old status rows are hidden with
  the other retired jobs (`RETIRED_JOB_KEYS`).
- **Settings:** `UNIIVERSE_CLASH_SCOUT` (the off switch), `UNIIVERSE_CLASH_LIVE_MASTERY` and the
  browser tests' `UNIIVERSE_FAKE_SCOUT_OCR` are no longer read. If any of them is set in Vercel or
  GitHub, it can be deleted; no other feature uses them.
- **Packages:** `tesseract.js` and its five language packs (`@tesseract.js-data/*`), with their
  dependencies in the lockfile. Nothing else used them.
- **Tests:** the Clash Scout unit, database and browser tests, their fixtures (synthetic
  screenshots and readings) and `scripts/clash-scout-fixtures.mjs`. The browser tests now check
  that it is gone (`e2e/team-nav.spec.ts`).

Kept because other features use them: champion portraits, the OP.GG link builder
(`src/domain/opgg.ts`; only its Clash-only helpers went), Riot account linking and syncing,
champion mastery, Match History, player profiles, the Clash queue (700) in game-mode filters and
possible groups, and every other OP.GG link.

## What is left on purpose

| What | Why |
|---|---|
| `src/components/legacy-storage.tsx` | Deletes what earlier versions left in members' browsers (an unsaved scout in `localStorage`, the text recogniser's IndexedDB cache). It costs nothing once they are gone |
| The audit label `clash.scout-delete` (`src/domain/audit.ts`) | Older Audit Logs entries keep their name |
| `clash_scouts` and `clash_scout_accounts` in `db-usage`'s retired list | The report confirms that both tables are gone |
| Migrations `0050` and `0055`, which created and updated the tables | Applied migrations are never edited; a fresh install creates the tables and `0057` drops them |

## The database clean-up (migration 0057)

`0057_retire_clash_scouts` dropped `clash_scout_accounts` and then `clash_scouts` (their indexes and
foreign keys went with them; no `CASCADE`, so an unexpected dependency would have stopped it). It
ran only after the owner had independently verified an encrypted backup holding both tables, kept an
offline copy and gave the go-ahead. The same change removed their schema, the erasure and
reconciliation code for them and the privacy notice's entries for the saved scouts.

Checks: `db-usage` reports both tables as gone; `tests/db/migrate.test.ts` covers the drop on a
database with saved scouts, and every fresh install runs `0050` to `0057` in order. Recovery, if
ever needed: `pg_restore --table` from that backup, then revert the change. The Draft and
Meta & Trends drops (PR #86) are separate.
