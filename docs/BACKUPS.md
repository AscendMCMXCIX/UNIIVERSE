# Backups

A backup only counts once it has been restored and checked. This page says how to take one and how to prove it works. It costs nothing on the free plans.

**Status (19 Oct 2026):** no automatic backup is known to run.
- `docs/DEPLOYMENT.md` notes that the Supabase free plan includes no daily backups. The project's Backups page was not checked for this note.
- Until the owner chooses an approach (audit decision 5), take one by hand at least monthly, and before any migration that changes or removes data.

## What is worth keeping

All of it lives in the one Postgres database:
- **Accounts:** usernames, password hashes, sessions, access levels.
- **The team:** players, pools, lineups and substitutes, branding.
- **Game data:** linked Riot accounts, stored games and match details, Solo Queue Blocks, Clash scouts.

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
