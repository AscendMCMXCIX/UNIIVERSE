# Backups

A backup only counts once it has been restored and checked. This page says how to take one and how to prove it works. It costs nothing on the free plans.

**Status (19 Oct 2026):** no automatic backup runs.
- Supabase's free plan includes no automatic backups and no point-in-time recovery; both come with paid plans. The project's own Backups page was not checked for this note.
- Nothing outside Supabase holds a copy, and no restore has ever been tested against production data.
- A weekly encrypted backup with an automatic restore check is ready for approval (below, audit decision 5). Until it runs, take one by hand at least monthly, and before any migration that changes or removes data.

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
3. Only then switch `DATABASE_URL` in Vercel and redeploy.

Never restore over the live database in place.

## Automatic weekly backup (proposal, needs the owner's approval)

`.github/workflows/backup.yml` runs `scripts/backup-db.sh` every Monday at 02:43 UTC, and on demand from the Actions tab. No new service, and no cost beyond about 3 Actions minutes a week.

Each run:
1. dumps the `public` schema (all of UNIIVERSE's tables) in one consistent snapshot, reading only;
2. restores it into a throw-away Postgres on the runner and checks that the number of tables, teams, accounts, players, Riot accounts and stored games, and the newest migration, match production;
3. encrypts it with AES-256 and checks the encrypted file opens again;
4. keeps it for 28 days as a private artifact of the run: about four weekly copies. A manifest beside it lists sizes, row counts and checksums, with no data and no secrets.

A failed run is a failed workflow, so GitHub's usual email reports it.

### One-time setup (the owner)

1. **A read-only database role.** In Supabase → SQL Editor, choose a long random password in your password manager and run:

   ```sql
   CREATE ROLE uniiverse_backup LOGIN PASSWORD '<the password>' BYPASSRLS;
   GRANT pg_read_all_data TO uniiverse_backup;
   ALTER ROLE uniiverse_backup SET default_transaction_read_only = on;
   ```

   - It can read every table and change none.
   - `BYPASSRLS` is needed because Row Level Security hides every row from roles other than the owner. Without it, `pg_dump` stops instead of saving empty tables.
   - If Supabase refuses `BYPASSRLS`, ask before falling back to the `postgres` user: that one can also change and delete data.
2. **Two repository secrets** (GitHub → Settings → Secrets and variables → Actions):
   - `BACKUP_DATABASE_URL`: the **Session pooler** connection string (port 5432) with the user `uniiverse_backup.<project ref>` and that password.
   - `BACKUP_PASSPHRASE`: another long random passphrase. **Keep it in your password manager. Without it no backup can be opened, and GitHub cannot recover it.**
3. Run **Database backup** once from the Actions tab and check its summary.

Never paste either value into a chat, an issue or a pull request.

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

- **Retention.** 28 days of weekly copies, so it protects against a mistake noticed within about four weeks. Keep a copy offline by hand before risky changes, such as dropping the retired Meta & Trends tables.
- **Storage.** GitHub Free keeps 500 MB of artifacts per account in all, CI's included.
  - The script fails above 100 MB, so four weekly copies fit and a growing database is noticed rather than cut off.
  - Production was 300 MB on 19 Oct 2026 (`db-usage`), about 200 MB of it the retired Meta & Trends tables. Most of that is numbers that compress well, so a backup should be well under the limit. The first run shows the real size.
- **The window between backups.** Up to a week of changes can be lost. A paid Supabase plan (daily backups, optional point-in-time recovery) shortens that, at a monthly cost.
