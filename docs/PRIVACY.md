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
- **Permanent removal:** Admin Mode → Users & Permissions → **Erase personal data** on their row (Accounts), or **Personal data → Erase a former member** when their account and profile are already gone. Details below.

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
| Shared games | Kept for the others. Their place becomes **"Removed player"**: side and result only; no PUUID, name, Riot ID, champion, position, items, runes, spells or figures. Team kills come from Riot's team total, so the others' figures stay right. Their timeline entries and per-minute frames are deleted, and teammates' games no longer record them as the lane opponent. The summaries are rebuilt. |
| Clash scouts (retired, kept until the held clean-up) | Their slots in the scouts saved before Clash Scout was retired are emptied, and the verified accounts of those slots removed from the scout index. Legacy opponent accounts (none are left) that hold their Riot identity are deleted. |
| Notes others wrote | Whole-word mentions of their names, Riot names and Riot IDs (3 characters or more) become "[removed]"; the rest of each note stays. This includes the private text other players kept in the retired Ranked Development: review learning points and adjustments, session focus and closing notes, objective titles and explanations, and If–Then plans. |
| Admin activity | Entries keep what happened. Their name becomes **"Erased member"** as actor or target, and matching details become "[removed]". |
| Job logs | Their Riot IDs are taken out of `job_runs` and `data_refresh_status`. Newer sync lines name an account only as `account 1a2b3c4d`. |
| Caches | Team, public page, leaderboards, proficiency and lookup caches are cleared on this server instance; other instances follow within their cache times. |

It then records:
- **An erasure record** (`privacy_erasures`): a random reference and keyed tokens of the account, profile, Riot account ids, PUUIDs and Riot IDs. Never the identifiers themselves.
- **One audit entry** (`privacy.erase`): the reference and counts only.

**Safeguards** (`guardErasure`, every action in `src/server/actions/privacy.ts`):
- administrators only (`manage-users`, checked on the server first);
- never your own account, and never the Owner;
- another administrator only when the Owner asks;
- never the last active administrator;
- nothing happens until the dialog's preview has been read, the username (or Riot ID) typed exactly, and the permanence acknowledged.

## Keeping it in force

- **Tokens:** HMAC-SHA256 under a key derived from `UNIIVERSE_AUTH_SECRET` (`src/server/privacy/tokens.ts`). The key never enters the database. A token cannot be tested against a guessed Riot ID without the deployment's secret.
- **New data:** an erased person is checked for wherever the app stores Riot data:
  - match details: a game synced later shows them as "Removed player";
  - the figures and timeline backfills;
  - the account sync, which refuses their accounts;
  - linking a Riot account (Settings, signup, Admin Mode), which refuses it with an explanation;
  - the rank checks of a game's players (when a member opens it, and after a member's game is collected), which never ask Riot about them or store a rank for them (`src/server/players/participant-ranks.ts`).
  (Clash Scout, retired, adds no new scouts: the full re-apply below still covers the saved ones.)
- **API key changes:** Riot's PUUIDs change with the API key, so people are also matched by Riot ID. A PUUID first seen that way is added to their record.
- **Safety net:** the daily `integrity` job re-applies every record to anything stored in the last two days.
- **Full re-apply:** run the `erasure-reconcile` job (Data jobs, on demand), or use Personal data → **Re-apply records**. It goes through the whole database.
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
- **Other server instances** keep cached pages and lists until their cache times run out (at most 30 minutes).
- **A replaced `UNIIVERSE_AUTH_SECRET`** makes the records unusable. Erase the person again by Riot ID.
- **A former member** erased by Riot ID is found by that Riot account and the names given. Very old games where they had both another name and another API key's PUUID can only be found through games of their own that are still stored.

## Clash Scout (retired 23 Oct 2026)

- Its pages, screenshot reading, Riot requests and Testing Lab are gone; nothing new is stored.
- The scouts saved before then stay in `clash_scouts` and `clash_scout_accounts`, shown nowhere, until a held migration drops both tables after the owner verifies a recent backup (`docs/DATA_PIPELINES.md`, "Retired tables"). Until then:
  - permanent erasure empties the person's slots in them (above);
  - the full re-apply (`erasure-reconcile`) checks them after a restore; the daily safety net skips them, since nothing adds new ones;
  - the privacy notice lists them under "What is stored" and in its Clash Scout section.
- The draft key earlier versions kept in `localStorage`, and the text recogniser's old IndexedDB cache, are still deleted on the next visit (`src/components/legacy-storage.tsx`, tested in `e2e/privacy.spec.ts`).
- Screenshots were always read on the member's device and never uploaded, so none exist anywhere.
- Details: `docs/CLASH_SCOUT.md`.

## Changing the notice

- The contact, permanent-removal and backup paragraphs are wording the owner approved (22 October 2026). Change them only with the owner's approval.
- Update `PRIVACY_UPDATED` in `src/domain/privacy.ts` with any change to the text.
- `BACKUP_RETENTION_DAYS` must match `retention-days` in `.github/workflows/backup.yml`.
- The public Riot statistics sentence follows `UNIIVERSE_PUBLIC_RIOT_DATA` (`publicRiotDataAllowed`), so it is right for each deployment.
- `e2e/privacy.spec.ts` checks the approved wording, the contact and its copy button, the index, the phone layout in both orientations and the links to the page.

## Tests

- `tests/db/privacy-erasure.test.ts`, a realistic synthetic member, on PGlite and real Postgres:
  - identity discovery, the preview, the safeguards, an interrupted and a repeated run;
  - every removal and de-identification above;
  - a scan of every table for any trace of her;
  - later syncs, under the same and a new API key;
  - link refusal, release, and erasing a former member;
  - a restored backup reconciled from the exported records;
  - the retired Clash scouts: her slots emptied, the opponent verified beside her kept, and the scout index cleared of her accounts only.
- `tests/db/privacy-actions.test.ts`: permissions, confirmations, the Owner and administrator safeguards, the audit entries, export and import.
- `src/server/privacy/privacy.test.ts`: tokens, matching, game redaction, names in notes, Riot IDs in old logs, and the records-file checks.
- `e2e/erasure.spec.ts`:
  - the Admin Mode flow on a throw-away account: preview, typed confirmation, the reference, the records and the admin log without the name;
  - the account can no longer sign in;
  - the Owner and the administrator's own account are protected;
  - members are kept out.
- `e2e/privacy.spec.ts`: the notice's wording, including the retired Clash scouts, and the old Clash Scout browser storage cleaned up on the next visit.
