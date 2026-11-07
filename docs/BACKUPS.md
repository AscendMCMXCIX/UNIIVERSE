# Backups

A backup only counts once it has been restored and checked. This page says how to take one and how to prove it works. It costs nothing on the free plans.

**Status (21 Oct 2026):** the first production backup succeeded, and restoring it matched production.
- **The run:** Database backup run #3, 21 Oct 2026 at 22:25 UTC, on `main` at f15cd85 ([run 39686307330](https://github.com/AscendMCMXCIX/UNIIVERSE/actions/runs/39686307330)), after the owner created the read-only role and the two repository secrets (one-time setup, below).
- **Role check passed:** `uniiverse_backup` is not a superuser, bypasses Row Level Security, starts every session read-only, owns nothing, and could read all 69 tables and write none.
- **Restore check passed:** the dump (69 tables, 56 MB) was restored into a throw-away PostgreSQL 17 and matched production: 1 team, 16 users, 15 players, 18 Riot accounts, 7,208 match details, newest migration `0054_web_vitals`.
- **The copy:** encrypted with AES-256, 55 MB, kept as the run's artifact `database-backup-39686307330` until 18 Nov 2026. From now on it runs every Monday at 02:43 UTC, the first on 26 Oct.
- **Weekly runs since then:** 26 Oct and 2 Nov 2026 both passed every check. The 2 Nov copy ([run 41424554552](https://github.com/AscendMCMXCIX/UNIIVERSE/actions/runs/41424554552)) is 67 MB encrypted and kept until 30 Nov 2026.
- **Growth:** the encrypted copy grew from 55 MB (21 Oct) to 67 MB (2 Nov), about 1 MB a day. At that pace the run's 100 MB limit (Limits, below) would have been reached in early December. The drops of 4 Nov 2026 (below) took the database from 378 MB to 161 MB; the next weekly copy (9 Nov) shows the backup's new size. Raising `max_mb` is the other way, if it ever grows back.
- **The owner's own check, done (4 Nov 2026):** the owner decrypted a backup themselves and keeps an offline copy (one-time setup, step 4). The retired tables were dropped the same day (#86, #138). The 2 Nov copy, kept until 30 Nov 2026, is the last weekly copy that holds them.
- Supabase's free plan includes no automatic backups and no point-in-time recovery; both come with paid plans. The project's own Backups page was not checked for this note, so these weekly copies are the ones to rely on.

## What is worth keeping

All of it lives in the one Postgres database:
- **Accounts:** usernames, password hashes, sessions, access levels, the admin activity record.
- **The team:** players, pools, lineups and substitutes, branding.
- **Game data:** linked Riot accounts, stored games and match details, and the records kept from the retired Ranked Development (sessions, reviews, objectives and plans) until their clean-up.

Riot's static data (champions, patches, skins) can be fetched again, but restoring it with the rest is simpler.

**A backup holds password hashes, sessions and personal data, so treat it as a secret:**
- keep it encrypted, for example in an encrypted disk image or a password manager's file vault;
- never put it in the repository or a shared folder;
- delete old copies you no longer need.

## Take a backup (about 2 minutes)

You need the PostgreSQL client tools: `pg_dump`, `pg_restore`, `psql`. Their version must be at least the server's; Supabase shows the server version under Project Settings → Infrastructure.

1. In Supabase, open **Connect** and copy the **Session pooler** connection string (port 5432). The transaction pooler (port 6543) does not work for `pg_dump`. Fill in the database password yourself; never paste it into a chat or a ticket.
2. Export to a compressed file:

   ```sh
   pg_dump "<session pooler connection string>" --format=custom --no-owner --no-privileges --file "uniiverse-$(date +%F).dump"
   ```

   Row Level Security does not hide anything from this export: the `postgres` user owns the tables, and owners are exempt.
3. Check that the file lists the tables you expect, for example `users`, `players` and `match_details`:

   ```sh
   pg_restore --list "uniiverse-YYYY-MM-DD.dump" | grep "TABLE DATA" | wc -l
   ```

## Prove it restores (about 5 minutes, on your own computer)

Restore into a throw-away local database, never into production:

```sh
createdb uniiverse_restore_test
pg_restore --no-owner --no-privileges --dbname uniiverse_restore_test "uniiverse-YYYY-MM-DD.dump"
psql uniiverse_restore_test -c "select count(*) as users from users" \
                            -c "select count(*) as players from players" \
                            -c "select count(*) as games from match_details" \
                            -c "select tag from uniiverse_migrations order by tag desc limit 1"
dropdb uniiverse_restore_test
```

Compare these against production:
- **Users and players:** the Data jobs `auth-audit` run reports the number of accounts.
- **Stored games:** `db-usage` reports the number of rows per table.
- **Latest migration:** the newest tag must match the last entry of `auth-audit`'s `migrationsApplied`.

Supabase-only roles and extensions may print warnings during the restore. They don't matter for UNIIVERSE's own tables.

## Restoring production (only in an emergency)

This replaces live data, so do it only with the owner's explicit decision. Have a fresh backup of the current state first, even a damaged one.
1. Restore into a new Supabase project, or into an empty schema, and point a test deployment at it.
2. Check it with the steps above and by signing in.
3. Apply the newest erasure records ("Restoring after an erasure" below).
4. Only then switch `DATABASE_URL` in Vercel and redeploy.

Never restore over the live database in place.

## Backups and permanent removal

Erasing someone's personal data (Admin Mode → Users & Permissions → Personal data; `docs/PRIVACY.md`) removes it from the live database at once. Copies made before the erasure still hold it:
- **GitHub's copies** expire on their own: each weekly artifact is deleted 28 days after its run. Nothing to do.
- **An offline copy** (one the owner downloaded and keeps) is never deleted by GitHub. Keep one offline copy at a time: replace it with a newer one every few weeks and before risky changes, and delete the one it replaces. Until it is replaced, an offline copy made before an erasure keeps that person's data.
- **The erasure records** are what keep a restore from bringing anyone back. Each erasure leaves a record of keyed codes, never a name or Riot ID, in the database itself (`privacy_erasures`, backed up like every table). A backup made *before* an erasure cannot contain that erasure's record. So after each erasure:
  1. export the records: Personal data → **Export records**, or `pnpm privacy:records export > erasures-YYYY-MM-DD.json` with `DATABASE_URL` pointing at production;
  2. keep the file with the offline copy.

  The file names no one, and it is useless without `UNIIVERSE_AUTH_SECRET`.
- **`UNIIVERSE_AUTH_SECRET` belongs with the backups.** The records are keyed with it, so keep it in the password manager next to `BACKUP_PASSPHRASE`. If it is ever replaced, the older records show "Cannot be applied". Everyone they covered must then be erased again by Riot ID (Personal data → **Erase a former member**).

### Restoring after an erasure (tested)

Whenever any backup is restored, into production or a copy, apply the newest erasure records before anyone uses the restored database:
1. Restore into a new database, as in "Restoring production" above.
2. Set `DATABASE_URL` to the restored database and `UNIIVERSE_AUTH_SECRET` to production's, then run:

   ```sh
   pnpm privacy:records import erasures-YYYY-MM-DD.json
   ```

   - It adds the records the backup lacks (a release made since is kept).
   - It then re-applies every record to the whole database: accounts, profiles, games, scouts, notes and logs that name an erased person are erased or de-identified again.
   - It prints what it found, and fails if a record cannot be applied.

   Instead, once a deployment points at the restored database and an administrator can sign in: Personal data → **Import records**, which also re-applies them.
3. Check before going further:
   - Personal data lists every record as "In force" or "Released", none as "Cannot be applied";
   - a Data jobs `erasure-reconcile` run against that deployment reports nothing found again.
4. Only then switch production to it.

The daily `integrity` job also re-applies the records to anything stored in the last two days, as a safety net. It is not a substitute for step 2.

`tests/db/privacy-erasure.test.ts` ("re-applies the erasure to a restored backup taken before it, from the exported records") runs this procedure: a database put back to its state before an erasure is reconciled from the exported file, and afterwards no table names the person.

## Automatic weekly backup

**Since 6 Nov 2026 the backups run in the private repository [`AscendMCMXCIX/uniiverse-backups`](https://github.com/AscendMCMXCIX/uniiverse-backups)** ("Where backups are kept" below). Its `.github/workflows/backup.yml` checks out this repository's `main` and runs `scripts/backup-db.sh` every Monday at 02:43 UTC, and on demand from that repository's Actions tab. Its `backup-age.yml` checks daily that one passed within 8 days. Their source is `docs/backup-repository/` here. Change them here first, then copy them across. It costs about 3 private Actions minutes a week, plus 1 a day for the age check, within GitHub Pro's allowance.

Each run:
1. dumps the `public` schema (all of UNIIVERSE's tables) in one consistent snapshot, reading only;
2. restores it into a throw-away Postgres on the runner and checks that the number of tables, teams, accounts, players, Riot accounts, stored games and other players' last known ranks (`last_known_ranks`), and the newest migration, match production. It also checks the retired tables while they exist, what Meta & Trends left after #86 and #138 dropped the rest (`tracked_summoners`, `region_status`, the three `stat_*_periods` tables and `champion_change_points`, which migration `0066` drops): each must restore with all its rows, so the backup kept before the drop is known to hold them. The manifest lists them under `retiredTableRows` (empty once they are gone), and `last_known_ranks` under `rows`;
3. encrypts it with AES-256 and checks the encrypted file opens again;
4. keeps it for 28 days as an artifact of the run in the private repository, so only people with access to it can download it: about four weekly copies. Each is encrypted (AES-256, gpg, the strongest key derivation OpenPGP allows) and can't be opened without `BACKUP_PASSPHRASE`, and `scripts/backup-db.sh` refuses a passphrase shorter than 32 characters. A manifest beside it lists sizes, row counts and checksums, with no data and no secrets.

A failed run is a failed workflow, so GitHub's usual email reports it, and it opens a `database-backup` issue in the private repository.

### One-time setup (the owner)

1. **A read-only database role.**
   1. In your password manager, generate a password of at least 32 characters, **letters and digits only** (other characters would have to be encoded in the connection string).
   2. In Supabase → SQL Editor, open a new query, paste this with the password in place of `<the password>`, and run it:

      ```sql
      CREATE ROLE uniiverse_backup LOGIN PASSWORD '<the password>' BYPASSRLS;
      GRANT USAGE ON SCHEMA public TO uniiverse_backup;
      GRANT SELECT ON ALL TABLES IN SCHEMA public TO uniiverse_backup;
      GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO uniiverse_backup;
      ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT ON TABLES TO uniiverse_backup;
      ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT ON SEQUENCES TO uniiverse_backup;
      ALTER ROLE uniiverse_backup SET default_transaction_read_only = on;
      ```

   3. Delete that query from the SQL Editor afterwards: the editor keeps the queries you run, and this one holds the password.

   What it gives:
   - It can read UNIIVERSE's tables (the `public` schema), and only those. The `ALTER DEFAULT PRIVILEGES` lines cover tables added by later migrations, which run as `postgres`. Each migration also grants the role `SELECT` on what it adds (`docs/DATABASE_PERMISSIONS.md`), so a new table is backed up even where those lines are missing.
   - It cannot change anything: no write privilege, no ownership, and every session starts read-only.
   - `BYPASSRLS` is needed because Row Level Security hides every row from roles other than the owner. Without it, `pg_dump` stops instead of saving empty tables.
   - Every run checks this before reading anything (`scripts/backup-db.sh`) and fails if the role could change data, create roles, or not read a table. The result is in the run's log and the backup's manifest (`backupRole`).
   - If Supabase refuses `BYPASSRLS`, don't fall back to the `postgres` user: that one can change and delete data, and the check refuses it.
2. **Two repository secrets in the private backup repository** (`uniiverse-backups` → Settings → Secrets and variables → Actions → New repository secret):
   - `BACKUP_DATABASE_URL`: the **Session pooler** connection string (Supabase → Connect, port 5432). Replace the user `postgres.<project ref>` with `uniiverse_backup.<project ref>`, and put that role's password in place of `[YOUR-PASSWORD]`.
   - `BACKUP_PASSPHRASE`: another long random passphrase. **Keep it in your password manager. Without it no backup can be opened, and GitHub cannot recover it.**
3. Run **Database backup** once from the private repository's Actions tab (Run workflow) and check its summary.
4. Once, download that run's backup and open it with the passphrase from your password manager (below). That proves your copy of the passphrase is the one the backups use.

Never paste either value into a chat, an issue or a pull request.

To remove the role later: `DROP OWNED BY uniiverse_backup; DROP ROLE uniiverse_backup;` (it owns nothing, so this only removes its grants), then delete the two secrets.

### Where backups are kept: moving to a private repository

**Decided 6 Nov 2026:** future backups move to a private repository, `AscendMCMXCIX/uniiverse-backups`, so the encrypted files can no longer be downloaded by anyone signed in to GitHub. Why this destination:
- **Free:** the owner's GitHub Pro plan covers it, at about 3 private Actions minutes a week for the backup and 1 a day for the age check.
- **Away from the database:** a backup kept in Supabase Storage would be lost with the project it protects.
- **Little to maintain:** the private repository holds only two workflow files and two secrets, and its backup checks out this repository's `scripts/backup-db.sh` on every run. The files are in `docs/backup-repository/`.
- **No 60-day rule:** a private repository's schedules are not switched off after 60 days without activity.

**Done on 6 Nov 2026, in this order, so backups never lapsed:**
1. **The owner** (account-level steps that sessions cannot take):
   - create the private repository `uniiverse-backups` (GitHub → New repository → Private, with a README);
   - add the two secrets `BACKUP_DATABASE_URL` and `BACKUP_PASSPHRASE` there (Settings → Secrets and variables → Actions). Use the same database URL as this repository. A new passphrase of 32+ random characters, from the password manager, is better than reusing the old one.
   - give the coordinating session access to the repository.
2. **The session:** pushed `docs/backup-repository/.github/` to it (650f49f), ran Database backup there by hand and read the run (role check, restore check, encryption, artifact uploaded). It then runs Backup age by hand. **Result:** run 42307672549 passed (22:50 UTC): the role is read-only (0 writable tables), all 49 tables were restored and their counts matched, the retired tables were restored with all their rows, the file is AES-256 with SHA-512 iterated key derivation, and its checksum matches the manifest. Backup age run 42307998044 passed.
3. **After that run passed:** a PR here removed `.github/workflows/backup.yml` and the backup-age half of the Production check, and changed the privacy notice to say "a separate, private GitHub repository". No backup is published here any more.
4. **The copies already published here are not deleted.** They expire on their own 28 days after their run: run 7 (`database-backup-42136432466`) on 4 Dec, and run 42192124079's on 4 Dec. Older runs stay listed under Actions, but their workflow file is gone. #212 can rely on the first private backup, run 42307672549, which holds the retired tables with all their rows, or on run 7 until it expires.

### Rotating the passphrase

The backups are private now, but the passphrase is still what protects a copy that leaves the repository (an offline copy, or one of the earlier public copies someone may have downloaded). Rotate it whenever you are not sure it is long, random and used nowhere else.

On 6 Nov 2026 the owner wasn't sure about the passphrase in use, so the workflow was disabled for a few hours. A run by hand then showed that the passphrase is at least 32 characters (run 42192124079; the script refuses a shorter one before reading anything), and the weekly schedule resumed. Rotate anyway if it was ever reused or isn't random. While the workflow is disabled nothing is backed up, and the daily Production check fails once the last good backup is more than 8 days old.

1. **Keep the old passphrase.** Backups taken before the rotation open only with the old passphrase. Keep it in your password manager, labelled as old, until the last of those backups and every offline copy of them is gone. The backup that #212 relies on (run 7, `database-backup-42136432466`, 6 Nov) is one of them.
2. **Generate a new one.** In your password manager, generate at least 32 random characters, used nowhere else. Save it as the new `BACKUP_PASSPHRASE`.
3. **Replace the secret.** `uniiverse-backups` → Settings → Secrets and variables → Actions → `BACKUP_PASSPHRASE` → Update. Never paste it into a chat, an issue or a pull request.
4. **Run it once.** `uniiverse-backups` → Actions → Database backup → Run workflow. The run fails before reading anything if the passphrase is shorter than 32 characters.
5. **Prove the new passphrase opens it.** Download that run's backup and decrypt it with the new passphrase ("Open and check a backup" below). Then delete the decrypted file.
6. **The older public copies.** Copies that someone downloaded before the rotation stay protected by the old passphrase only, and deleting the artifacts cannot recall them. Delete them anyway once you hold an offline copy of the ones you still need: open each Database backup run → Artifacts → delete `database-backup-<run>`. Deleting cannot be undone. If the old passphrase was weak, also treat the members' password hashes in those copies as exposed, and ask members with weak passwords to change them.

### Open and check a backup

1. Download the artifact `database-backup-<run>` from the run's page in the private repository and unzip it.
2. Decrypt it: `gpg --decrypt --output uniiverse.dump uniiverse-<time>.dump.gpg`. It asks for `BACKUP_PASSPHRASE`.
3. Restore it into a throw-away local database. The backup creates its own `public` schema, so drop the empty one first:

   ```sh
   createdb uniiverse_restore_test
   psql uniiverse_restore_test -c "DROP SCHEMA public"
   pg_restore --no-owner --no-privileges --exit-on-error --dbname uniiverse_restore_test uniiverse.dump
   ```

4. Compare it with the manifest's `rows`, then `dropdb uniiverse_restore_test` and delete the decrypted file.

### Limits

- **Retention.** 28 days of weekly copies, so it protects against a mistake noticed within about four weeks. Keep a copy offline by hand before risky changes, such as dropping the retired Meta & Trends tables (one offline copy at a time; see "Backups and permanent removal").
- **Storage.** GitHub Pro includes 1 GB of artifact storage per account, shared with GitHub Packages and CI's own artifacts (GitHub Free: 500 MB).
  - The script fails above 100 MB, so four weekly copies fit with room to spare and a growing database is noticed rather than cut off. A run started by hand can allow more (`max_mb`), for example the last backup before the retired tables are dropped; the copies after the drop are smaller.
  - Production was 300 MB on 19 Oct 2026 (`db-usage`), about 200 MB of it the retired Meta & Trends tables. Most of that is numbers that compress well: the first backup (21 Oct 2026) was a 56 MB dump and 55 MB encrypted, under the limit. The last copy before the drops of 4 Nov 2026 was 67 MB encrypted (3 Nov); the copy of 6 Nov, after them, was 48 MB.
- **The window between backups.** Up to a week of changes can be lost. A paid Supabase plan (daily backups, optional point-in-time recovery) shortens that, at a monthly cost.

## Monitoring (3 Nov 2026)

- **Each run** writes the encrypted size against `MAX_MB` and the rows it proved to its summary, and keeps its manifest (sizes, counts and checksums: no data, no secret) for 90 days as `database-backup-manifest-<run>`, so growth can be followed.
- **A failed run, or a copy over 80% of `MAX_MB`,** opens one issue labelled `database-backup` (later runs comment on it); the next healthy run closes it.
- **The daily Production check** fails when no backup has passed for 8 days (`docs/MONITORING.md`).
