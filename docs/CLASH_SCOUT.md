# Clash Scout (retired)

**Status: permanently removed on 23 Oct 2026, at the owner's request.** There is no replacement,
placeholder or archive page. This page records what was removed, what is left on purpose and what
the held database clean-up still has to do. It is not a guide to the old implementation.

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

| What | Why | Until |
|---|---|---|
| `clash_scouts`, `clash_scout_accounts` (`src/server/db/schema/clash.ts`, marked retired) | The scouts saved before the retirement. Shown nowhere; nothing adds to them | The held drop below |
| Erasure of the saved scouts (`src/server/privacy/erasure.ts`) | Permanent removal still empties an erased person's slots in them and removes those slots' verified accounts (`tests/db/privacy-erasure.test.ts`) | The held drop |
| The full erasure reconciliation over them (`src/server/privacy/reconcile.ts`) | After a restore, an erased person must not come back in a saved scout. The daily check skips them, since nothing adds new ones | The held drop |
| The privacy notice's entries for them (`/privacy`) | The notice must say what is stored | The held drop |
| `src/components/legacy-storage.tsx` | Deletes what earlier versions left in members' browsers (an unsaved scout in `localStorage`, the text recogniser's IndexedDB cache) | Kept: it costs nothing once they are gone |
| The audit label `clash.scout-delete` (`src/domain/audit.ts`) | Older Audit Logs entries keep their name | Kept with the history |

## The held database clean-up (stage B)

Not run. It waits until the owner has independently verified the encrypted database backup and
secured an offline copy, and then needs the owner's explicit go-ahead. It is prepared as its own
draft pull request: a migration that drops `clash_scout_accounts` and then `clash_scouts` (their
indexes and foreign keys go with them), with the schema file, the erasure and reconciliation code
for them and the privacy notice's entries removed in the same change. Historical migrations are not
edited.

Before it merges:
1. Data jobs → `db-usage`, twice a day apart: `retired` shows both tables with no new writes, and
   no dependent outside them (the scout accounts' key to the scouts is internal to the two).
2. The owner confirms the backup and the offline copy.
3. The database tests pass with it: a fresh install, and an existing database (with saved scouts)
   upgraded by it.
4. Afterwards `db-usage` shows both tables as gone.

The held Draft and Meta & Trends drops (PR #86) are separate and are not changed by this.
