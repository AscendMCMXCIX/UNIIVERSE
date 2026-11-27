# Privacy: requests, permanent removal and the notice

How UNIIVERSE handles a request about someone's personal information, what permanent removal (erasure) does, how it stays in force, and where the public notice comes from. The notice itself is `/privacy` (`src/app/privacy/page.tsx`), public, and linked from sign-in, the public team page's footer and Settings.

## The privacy contact

- **Discord only:** the team owner, **@ascend1999** (`PRIVACY_DISCORD` in `src/domain/privacy.ts`; change it there if the username changes).
- There is no email, form or ticket system, and none should be added for this.
- The notice shows the username in full with a Copy button. There is no link: Discord has no address that opens a private message, so none is invented.
- Someone without a usable Discord account cannot make a request this way, and the notice says so.
- Requesters don't need a UNIIVERSE account or a place in the team's Discord server: they send a friend request to the owner, then message privately.

## Handling a request

**1. Check who is asking.** A Discord username is not proof of identity. Before acting on anything that involves someone's personal information:
- prefer the Discord account the member linked on their own profile (Settings → social links), or one the team already knows as theirs;
- otherwise ask for details only the account holder would know: their username, their linked Riot accounts, their roles and champion pools;
- or ask them to set their League of Legends profile icon to one you name, for a few minutes, and check it on their Riot profile (OP.GG shows it);
- never ask for a password, temporary password, sign-in link, session or code: nobody here needs one, and the notice tells people never to send one;
- for a former member whose account is gone, the profile-icon check, or details only they would know, is the way.

Keep the conversation private, and reply when it is done. For an erasure, give the reference (`ER-…`), never a copy of the data.

**2. Act on it.**
- **Access:** tell them what is stored about them. The notice's "What is stored" lists every kind; their profile shows most of it. Don't send exports of other people's data: shared games hold other players.
- **Correction:** most details they change themselves in Settings (display name, username, password, picture, social links) or on their profile (roles, pools, card). An administrator fixes the rest in Admin Mode.
- **Permanent removal:** Admin Mode → Users & Permissions → their person view → Danger zone → **Erase personal data** (Accounts), or **Personal data → Erase a former member** when their account and profile are already gone. Details below.

Deactivating, deleting and archiving are different actions, and none of them is a removal:
- **Deactivate** stops sign-in and deletes nothing.
- **Delete** removes the account and keeps the profile archived, or deletes the profile with its own history; shared games, team records and logs stay.
- **Archive** hides a profile and keeps its history.
- Only **Erase** removes the person, and it cannot be undone.

## What erasure does

`src/server/privacy/erasure.ts`, in one database transaction: an interrupted erasure changes nothing, and running it again completes it.

| | What happens |
|---|---|
| Account | Deleted, with its sessions, invites and activation codes. Invites or codes they issued no longer point to them |
| Profile | Deleted: roles, champion pools, card design, banner, picture, social links, the records kept from the retired Ranked Development (sessions, reviews, objectives, plans), notes about them on their own profile |
| Riot accounts | Deleted, with their games, ranks, mastery, season figures, last-known ranks, tracked-summoner and sync state (the Draft feature's scouting rows went with its tables, migration `0063`) |
| Games only they used | Deleted: the match record, its timeline and any bookmark to it |
| Shared games | Kept for the others. Their place becomes **"Removed player"**: side and result only; no PUUID, name, Riot ID, champion, position (either of Riot's two), items, runes or shards, spells or figures (the challenge figures included). Team kills come from Riot's team total, so the others' figures stay right. Their timeline entries (level times, sales and items used up among them) and per-minute frames (their place on the map, haste and level among them) are deleted, and teammates' games no longer record them as the lane opponent. The summaries are rebuilt. |
| Legacy opponent accounts | None are left; one that holds their Riot identity is deleted. |
| Notes others wrote | Whole-word mentions of their names, Riot names and Riot IDs (3 characters or more) become "[removed]"; the rest of each note stays. This includes the private text other players kept in the retired Ranked Development: review learning points and adjustments, session focus and closing notes, objective titles and explanations, and If–Then plans. |
| Admin activity | Entries keep what happened. Their name becomes **"Erased member"** as actor or target, and matching details become "[removed]". Since 19 Nov 2026, every entry about them by id (done to their account, profile or Riot account, by anyone, themselves included) loses every text in its details, whatever it says (numbers and yes/no values stay), so a detail naming them as they were called before a rename cannot survive. An entry they only made, about another member or a setting, keeps its details apart from values that name them: what access they gave someone else stays that person's record. **Forward only:** entries left by erasures made before that keep what those erasures left. Their ids were removed then, so neither a later erasure nor re-applying the records (`erasure-reconcile`, Personal data → Re-apply records) finds them by id; clearing them would need a one-off over the entries named "Erased member", which waits for the owner (the overhaul plan's OD21, with a read-only count first). |
| Job logs | Their Riot IDs are taken out of `job_runs` and `data_refresh_status`. Newer sync lines name an account only as `account 1a2b3c4d`. Run records are deleted after 60 days (the daily `integrity` job, in bounded batches). |
| Caches | Team, public page, leaderboards, public pictures and banners, proficiency and lookup caches, and the lanes Matchups keeps, are cleared on this server instance (`src/server/privacy/after-erasure.ts`); other instances follow within their cache times. Champion Intel's build totals and Matchup Intel's lane games and curation queue, kept in Next's data cache that every instance shares, are dropped at once (`forgetChampionBuilds`, `forgetLaneMatchups`, `forgetMatchupQueue`), so the next page counts them again without the erased person's games. Matchup Intel's reviewed notes lose the links to an erased administrator's account (the notes stay: they name no player). |

It then records:
- **An erasure record** (`privacy_erasures`): a random reference and keyed tokens of the account, profile, Riot account ids, PUUIDs and Riot IDs. Never the identifiers themselves.
- **One audit entry** (`privacy.erase`): the reference and counts only.

**Safeguards** (`guardErasure`, every action in `src/server/actions/privacy.ts`):
- administrators only (`manage-users`, checked on the server first);
- never your own account, never the Owner, and never the Production check's account (`verify`: it holds no one's personal data and its job keeps it; deactivate or delete it instead);
- another administrator only when the Owner asks;
- never the last active administrator;
- nothing happens until the dialog's preview has been read, the username (or Riot ID) typed exactly, and the permanence acknowledged;
- importing and re-applying the records (the `erasure-reconcile` job's work): the Owner only, with REAPPLY typed, checked on the server too (19 Nov 2026).

## Keeping it in force

- **Tokens:** HMAC-SHA256 under a key derived from `UNIIVERSE_AUTH_SECRET` (`src/server/privacy/tokens.ts`). The key never enters the database. A token cannot be tested against a guessed Riot ID without the deployment's secret.
- **New data:** an erased person is checked for wherever the app stores Riot data:
  - match details: a game synced later shows them as "Removed player";
  - the figures and timeline backfills;
  - the account sync, which refuses their accounts;
  - linking a Riot account (Settings, signup, Admin Mode), which refuses it with an explanation;
  - the rank checks of a game's players (when a member opens it, and after a member's game is collected), which never ask Riot about them or store a rank for them (`src/server/players/participant-ranks.ts`).
- **API key changes:** Riot's PUUIDs change with the API key, so people are also matched by Riot ID. A PUUID first seen that way is added to their record.
- **Safety net:** the daily `integrity` job re-applies every record to anything stored in the last two days.
- **Full re-apply:** run the `erasure-reconcile` job (Data jobs, on demand), or, as the Owner, Personal data → **Re-apply records** with REAPPLY typed (19 Nov 2026: it is the job's work, a setup job, so other administrators no longer see Import or Re-apply). It goes through the whole database.
- **Release:** if the person asks to come back, Personal data → **Release** (type the reference). Their Riot accounts can then be linked again, and games synced from then on include them. Nothing erased comes back.
- **Backups:** see `docs/BACKUPS.md`, "Backups and permanent removal". In short:
  - export the records after each erasure and keep the file with the offline copy;
  - after any restore, import it before the app is used (`pnpm privacy:records import <file>`);
  - keep `UNIIVERSE_AUTH_SECRET` with the backup passphrase. If the secret changes, the records become unusable (shown as "Cannot be applied").

## What erasure cannot reach

The notice says each of these:
- **Riot's records.** Riot publishes every game it hosts. Anyone who looks up a shared game on Riot's services or sites such as OP.GG still sees everyone who played it. UNIIVERSE keeps the match id of a shared game, so a member could look it up there.
- **Figures that can be worked out.** In a shared game, the removed player's kills are the team's total minus everyone else's.
- **Other services' copies:** Vercel's and Supabase's request logs, GitHub's backup artifacts (28 days), any offline backup (until it is replaced), Discord messages, and members' browser caches of a picture they once loaded. Their deletion is not immediate and is not promised.
- **Other server instances** keep cached pages and lists until their cache times run out (at most 30 minutes). The lanes Matchups keeps have no cache time: there an erased player's frames (their own, or as someone's lane opponent) stay in memory until the instance stops, but are never shown: their accounts are gone, the erasure records stop them being linked again, and their games no longer name them as a lane opponent.
- **A replaced `UNIIVERSE_AUTH_SECRET`** makes the records unusable. Erase the person again by Riot ID.
- **A former member** erased by Riot ID is found by that Riot account and the names given. Very old games where they had both another name and another API key's PUUID can only be found through games of their own that are still stored.

## Clash Scout (retired 23 Oct 2026)

- Its pages, screenshot reading, Riot requests and Testing Lab are gone, and migration `0064` deleted the scouts saved before then with their tables (`docs/DATA_PIPELINES.md`). Encrypted backups made before that keep them until they expire, like any other deleted data.
- The draft key earlier versions kept in `localStorage`, and the text recogniser's old IndexedDB cache, are still deleted on the next visit (`src/components/legacy-storage.tsx`, tested in `e2e/privacy.spec.ts`).
- Screenshots were always read on the member's device and never uploaded, so none exist anywhere.
- Details: `docs/CLASH_SCOUT.md`.

## Changing the notice

- The contact, permanent-removal and backup paragraphs are wording the owner approved (22 October 2026). Change them only with the owner's approval.
- Update `PRIVACY_UPDATED` in `src/domain/privacy.ts` with any change to the text.
- `BACKUP_RETENTION_DAYS` must match `retention-days` in the private backup repository's `.github/workflows/backup.yml` (its source: `docs/backup-repository/`).
- The public Riot statistics sentence follows `UNIIVERSE_PUBLIC_RIOT_DATA` (`publicRiotDataAllowed`), so it is right for each deployment.
- `e2e/privacy.spec.ts` checks the approved wording, the contact and its copy button, the index, the phone layout in both orientations and the links to the page.

## Tests

- `tests/db/privacy-erasure.test.ts`, a realistic synthetic member, on PGlite and real Postgres:
  - identity discovery, the preview, the safeguards, an interrupted and a repeated run;
  - every removal and de-identification above;
  - a scan of every table for any trace of her;
  - later syncs, under the same and a new API key;
  - link refusal, release, and erasing a former member;
  - a restored backup reconciled from the exported records.
- `tests/db/privacy-actions.test.ts`: permissions, confirmations, the Owner and administrator safeguards, the audit entries, export and import.
- `src/server/privacy/privacy.test.ts`: tokens, matching, game redaction, names in notes, Riot IDs in old logs, and the records-file checks.
- `e2e/erasure.spec.ts`:
  - the Admin Mode flow on a throw-away account: preview, typed confirmation, the reference, the records and the admin log without the name;
  - the account can no longer sign in;
  - the Owner and the administrator's own account are protected;
  - members are kept out.
- `e2e/privacy.spec.ts`: the notice's wording, with nothing left about Clash scouts, and the old Clash Scout browser storage cleaned up on the next visit.

**Riot's error messages name nobody (4 Nov 2026).** A failed Riot request's message, which reaches job log lines, run summaries, the Data health page and the host's logs, is built from the request's route with the identifiers it names elided (`routeLabel` in `src/server/riot/api/client.ts`): `/lol/league/v4/entries/by-puuid/…`, never the PUUID or the Riot ID the request was about. The Personal-data actions log a failed statement's kind, code and text without its parameters, never the raw error.

## Sign-in sessions in Admin (overhaul S9, 19 Nov 2026)

The privacy notice says of sign-in sessions "Who sees it: nobody in the app". So Admin never shows how many sessions an account has or ended: **Sign out everywhere** (an administrator's, on another account; never the Owner's by another administrator) reports "Signed out everywhere", and its audit entry has no count. A member's own **Sign out of other devices** (Settings → Password) is not audited. Moderation (a picture replaced or removed, a public link hidden or removed) records the link's kind only (YouTube, Twitch, Discord), never its address; a link a member keeps to themselves is never shown in Admin. An administrator's change to someone else's Riot accounts in the person view (link, unlink, change Riot ID, make Main; S9c) is recorded as `riot.link`, `riot.unlink`, `riot.replace` or `riot.main`, naming the profile and the account by its label (Main or Alt), never its Riot ID or PUUID; a member's changes to their own Riot accounts are not recorded. Reactivate with a new temporary password records `account.activate` with "with a new temporary password", never the password (`tests/db/admin-riot-accounts.test.ts`). Withdrawing a temporary password records `account.password-withdrawn`, naming the account only, never the password; a withdrawal that changes nothing records nothing (`tests/db/withdraw-password.test.ts`).

## The account activity log (OD9, 23 Nov 2026)

The owner approved OD9 on 23 Nov 2026. The notice's "Account activity log" row says what is recorded, and the code records exactly that:

| Recorded | Action | Since |
|---|---|---|
| An administrator's change to an account or a setting | `account.*`, `branding.*`, `resources.*`, `jobs.*`, `privacy.*`, `preset.*` | before OD9 |
| The Owner's change to another member's username (OD8a) | `account.username` | 23 Nov 2026 |
| A member's own username, display name or profile picture | `self.username`, `self.display-name`, `self.picture`, `self.picture-remove` | 23 Nov 2026 |
| A member's own password change (that it changed, never the password) | `password.change` | before OD9 |
| A team manager's or an administrator's change to another member's roles or champion pools (`profile.edit`, the parts by name), archive or restore (`profile.archive`, `profile.restore`) and Riot accounts (`riot.*`) | as listed | `profile.edit` and a manager's archive since 23 Nov 2026 |

- Every entry names the account (or profile) and the kind of change, never the old or new value: no username, display name, picture, champion or Riot ID is stored in the details.
- A change that changes nothing records nothing.
- Permanent removal replaces the person's name in the log with "Erased member", as before.
- Tests: `tests/db/member-admin.test.ts` ("the permission hierarchy").

## Champion Intel's build totals (25 Nov 2026)

The owner's request of 25 Nov 2026 ("Recommended builds and runes") added a use of the stored match
records and timelines, said in the notice's match-records row (`PRIVACY_UPDATED` 26 November 2026):
Champion Intel counts what players chose on a champion (runes, stat shards, summoner spells,
starting items, boots, completed items, skill order) and how often those games were won, over every
player on that champion in the stored draft games a current team member played (both teams).
docs/CHAMPION_INTEL.md, "Builds and runes", has the rules.

- **Totals only.** One statement per champion counts inside the database; only counts leave it (a
  value, its games, its wins, how many were a team member's own). No PUUID, name, Riot ID or match
  id is read into the app or shown, and nothing about any one player is kept
  (`tests/db/champion-builds.test.ts` checks the answer).
- **Who sees it.** Members who may see teammates' statistics (`view-teammate-stats`, the default
  access): the team members' own games are among the counts, and a champion only one member plays
  would show that member's choices and results. A personal-use profile's own games are never
  counted (only matches a current team member played are), and the section is not shown to it.
- **Nothing new is stored.** The counts are kept up to six hours in Next's data cache (shared by the
  server's instances), dropped at once by an erasure; no table holds them.
- **Erased people** are already out of the records and timelines (`removed`, timeline entries
  deleted), and the counts skip a removed place.

## Matchup Intel's lane totals and reviewed notes (27 Nov 2026)

The owner's request of 26 Nov 2026 (item 4) brought Matchup Intel back as Champion Intel's Compare
with a lane (docs/MATCHUP_INTEL.md). Two uses, said in the notice (`PRIVACY_UPDATED` 27 November 2026):

- **Lane totals** (the match-records row): for a lane and two champions chosen by hand, how the two
  players of that lane compared at 10 minutes in the stored draft games a current team member played
  (every lane of them, both teams): gold, experience and CS differences, kills between the two, first
  blood, result. One statement per pair counts inside the database; per game only anonymous numbers
  leave it (no PUUID, name, Riot ID or match id: `tests/db/lane-matchups.test.ts` checks the answer's
  keys), and only totals are shown, from 10 games. For members who may see teammates' statistics (a
  pair only one member plays would show that member's lane results, as the builds would). Nothing new
  is stored: kept up to six hours in Next's data cache, dropped at once by an erasure
  (`forgetLaneMatchups`); an erased player's seat is never counted.
- **Reviewed notes** (a row of their own): short observations about two champions' kits that
  administrators write, in `matchup_notes` (migration 0071). The reviewing administrator's account is
  stored with each note (with who created and last changed it); members see "an administrator", Admin
  the display name. A note's text may never name a player (the save refuses a member's, player's or
  linked Riot name and a Riot ID's tag). Permanent removal sets the three account links to NULL and
  keeps the note (`src/server/privacy/erasure.ts`; the preview counts the notes). The curation queue in
  Admin shows champion names and counts only, never whose games.

## Prepared, not active: high-elo statistics (OD4)

Matchup Intel's anonymous high-elo statistics were built and switched off, and waited for the owner's Riot registration update before they joined `main` (commit 6dfccdd0, its docs/HIGH_ELO_EVIDENCE.md). Matchup Intel was retired on 23 Nov 2026 (docs/MATCHUP_INTEL.md), so nothing in `main` would show them now; this section stays for the record. The notice must not describe them as collected until the collection is switched on. When it is, the notice gains this row, and `PRIVACY_UPDATED` changes with it:

> **What:** Anonymous statistics from ranked games of high-elo players who are not members (Master, Grandmaster and Challenger, in every region Riot's API serves): counts per patch, region, role and champion of their champions, lane opponents, results, rune keystones, summoner spells, starting items, first items, skill order and when the lane ended. **Why:** To show, in Matchup Intel, what such players were observed to do, beside the curated notes. **Who sees it:** Signed-in members, as totals only. **How long:** The current and previous patch; older counts are deleted. No name, Riot ID, PUUID or match identifier is ever stored: the players' identifiers are used only in memory while a sample is taken.

That pull request (the one setting `HIGH_ELO_COLLECTION_ENABLED = true`) adds the row to `src/app/privacy/page.tsx` and its check to `e2e/privacy.spec.ts`.
