# Backups

A backup only counts once it has been restored and checked. This page says how to take one and how to prove it works. It costs nothing on the free plans.

**Status (21 Oct 2026):** the first production backup succeeded, and restoring it matched production.
- **The run:** Database backup run #3, 21 Oct 2026 at 22:25 UTC, on `main` at f15cd85 ([run 39686307330](https://github.com/AscendMCMXCIX/UNIIVERSE/actions/runs/39686307330)), after the owner created the read-only role and the two repository secrets (one-time setup, below).
- **Role check passed:** `uniiverse_backup` is not a superuser, bypasses Row Level Security, starts every session read-only, owns nothing, and could read all 69 tables and write none.
- **Restore check passed:** the dump (69 tables, 56 MB) was restored into a throw-away PostgreSQL 17 and matched production: 1 team, 16 users, 15 players, 18 Riot accounts, 7,208 match details, newest migration `0054_web_vitals`.
- **The copy:** encrypted with AES-256, 55 MB, kept as the run's artifact `database-backup-39686307330` until 18 Nov 2026. From now on it runs every Monday at 02:43 UTC, the first on 26 Oct.
- **Not yet done:** the owner's own check (one-time setup, step 4): download this backup, open it with the passphrase from the password manager, and keep that file offline. The retired tables are not dropped (#86) until the owner confirms both.
- Supabase's free plan includes no automatic backups and no point-in-time recovery; both come with paid plans. The project's own Backups page was not checked for this note, so these weekly copies are the ones to rely on.

## What is worth keeping

All of it lives in the one Postgres database:
- **Accounts:** usernames, password hashes, sessions, access levels, the admin activity record.
- **The team:** players, pools, lineups and substitutes, branding.
- **Game data:** linked Riot accounts, stored games and match details, Solo Queue Blocks.

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

`.github/workflows/backup.yml` runs `scripts/backup-db.sh` every Monday at 02:43 UTC, and on demand from the Actions tab. No new service, and no cost beyond about 3 Actions minutes a week.

Each run:
1. dumps the `public` schema (all of UNIIVERSE's tables) in one consistent snapshot, reading only;
2. restores it into a throw-away Postgres on the runner and checks that the number of tables, teams, accounts, players, Riot accounts and stored games, and the newest migration, match production;
3. encrypts it with AES-256 and checks the encrypted file opens again;
4. keeps it for 28 days as a private artifact of the run: about four weekly copies. A manifest beside it lists sizes, row counts and checksums, with no data and no secrets.

A failed run is a failed workflow, so GitHub's usual email reports it.

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
2. **Two repository secrets** (GitHub → Settings → Secrets and variables → Actions → New repository secret):
   - `BACKUP_DATABASE_URL`: the **Session pooler** connection string (Supabase → Connect, port 5432). Replace the user `postgres.<project ref>` with `uniiverse_backup.<project ref>`, and put that role's password in place of `[YOUR-PASSWORD]`.
   - `BACKUP_PASSPHRASE`: another long random passphrase. **Keep it in your password manager. Without it no backup can be opened, and GitHub cannot recover it.**
3. Run **Database backup** once from the Actions tab (Run workflow) and check its summary.
4. Once, download that run's backup and open it with the passphrase from your password manager (below). That proves your copy of the passphrase is the one the backups use.

Never paste either value into a chat, an issue or a pull request.

To remove the role later: `DROP OWNED BY uniiverse_backup; DROP ROLE uniiverse_backup;` (it owns nothing, so this only removes its grants), then delete the two secrets.

### Open and check a backup

1. Download the artifact `database-backup-<run>` from the run's page and unzip it.
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
- **Storage.** GitHub Free keeps 500 MB of artifacts per account in all, CI's included.
  - The script fails above 100 MB, so four weekly copies fit and a growing database is noticed rather than cut off. A run started by hand can allow more (`max_mb`), for example the last backup before the retired tables are dropped; the copies after the drop are much smaller.
  - Production was 300 MB on 19 Oct 2026 (`db-usage`), about 200 MB of it the retired Meta & Trends tables. Most of that is numbers that compress well: the first backup (21 Oct 2026) was a 56 MB dump and 55 MB encrypted, under the limit.
- **The window between backups.** Up to a week of changes can be lost. A paid Supabase plan (daily backups, optional point-in-time recovery) shortens that, at a monthly cost.
