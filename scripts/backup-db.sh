#!/usr/bin/env bash
# Encrypted backup of UNIIVERSE's database, proved by restoring it (docs/BACKUPS.md).
#
#   BACKUP_DATABASE_URL  the database to back up (Supabase: the session pooler, port 5432). Only read.
#   BACKUP_PASSPHRASE    encrypts the backup (AES-256, gpg). Without it the backup cannot be opened.
#   RESTORE_SERVER_URL   optional: a throw-away Postgres server, without a database name
#                        (postgres://user:password@host:port). The backup is restored into a new
#                        database there and its row counts compared with the source. Never production.
#   OUT_DIR              where the encrypted backup and its manifest go (default: backup)
#   MAX_MB               fail when the encrypted backup is larger (default: 100, so four weekly copies
#                        stay inside the 500 MB of artifacts GitHub Free keeps, with room for CI's)
#
# Writes OUT_DIR/uniiverse-<UTC time>.dump.gpg and a manifest (.json: sizes, row counts, checksums,
# the backup role's privileges; no data, no secrets). The unencrypted dump only ever exists in a
# private temporary directory.
#
# Before anything is read, the role is checked: it must be able to read every table (SELECT and
# BYPASSRLS, since Row Level Security hides every row from other roles) and unable to change any
# (not a superuser, owning nothing, no INSERT/UPDATE/DELETE/TRUNCATE, no CREATEROLE/CREATEDB/
# REPLICATION). A role that could change data fails the run: use uniiverse_backup (docs/BACKUPS.md).
set -euo pipefail

: "${BACKUP_DATABASE_URL:?BACKUP_DATABASE_URL is not set}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is not set}"
OUT_DIR="${OUT_DIR:-backup}"
MAX_MB="${MAX_MB:-100}"
RESTORE_DB=uniiverse_restore_check

umask 077
STAMP="$(date -u +%Y-%m-%dT%H%MZ)"
NAME="uniiverse-$STAMP"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
DUMP="$WORK/$NAME.dump"
mkdir -p "$OUT_DIR"

# Tables whose row counts must survive the round trip, and the newest migration.
CHECKS="SELECT 'tables', count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p');
SELECT 'teams', count(*) FROM public.teams;
SELECT 'users', count(*) FROM public.users;
SELECT 'players', count(*) FROM public.players;
SELECT 'riot_accounts', count(*) FROM public.riot_accounts;
SELECT 'match_details', count(*) FROM public.match_details;
SELECT 'migration', max(tag) FROM public.uniiverse_migrations;"

counts() { # $1 = connection string; prints "name|value" lines, in a read-only transaction
  psql "$1" --no-psqlrc --quiet --tuples-only --no-align -v ON_ERROR_STOP=1 \
    -c "START TRANSACTION READ ONLY" -c "$CHECKS" -c "COMMIT"
}
value() { printf '%s\n' "$1" | awk -F'|' -v k="$2" '$1 == k { print $2 }'; }

# A connection that fails stops here, with psql's message (it names the user and host, never the password).
SOURCE="$(psql "$BACKUP_DATABASE_URL" --no-psqlrc -At -v ON_ERROR_STOP=1 -c "SELECT current_user || ' on PostgreSQL ' || current_setting('server_version')")"
echo "Source: $SOURCE"

# Least privilege, checked rather than assumed. One JSON object, kept in the manifest.
ROLE_CHECK="SELECT json_build_object(
  'role', r.rolname,
  'superuser', r.rolsuper,
  'bypassRls', r.rolbypassrls,
  'createRole', r.rolcreaterole,
  'createDb', r.rolcreatedb,
  'replication', r.rolreplication,
  'memberOf', (SELECT coalesce(json_agg(b.rolname ORDER BY b.rolname), '[]'::json) FROM pg_auth_members m JOIN pg_roles b ON b.oid = m.roleid WHERE m.member = r.oid),
  'readOnlyByDefault', current_setting('default_transaction_read_only') = 'on',
  'tables', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')),
  'ownedObjects', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND pg_has_role(c.relowner, 'USAGE')),
  'unreadableTables', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT has_table_privilege(c.oid, 'SELECT')),
  'writableTables', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND (has_any_column_privilege(c.oid, 'INSERT') OR has_any_column_privilege(c.oid, 'UPDATE') OR has_table_privilege(c.oid, 'DELETE') OR has_table_privilege(c.oid, 'TRUNCATE')))
) FROM pg_roles r WHERE r.rolname = current_user"
ROLE="$(psql "$BACKUP_DATABASE_URL" --no-psqlrc -At -v ON_ERROR_STOP=1 -c "$ROLE_CHECK")"
echo "Backup role: $ROLE"
role() { printf '%s' "$ROLE" | jq -r ".$1"; }
problems=""
[ "$(role superuser)" = "false" ] || problems="$problems is a superuser;"
[ "$(role ownedObjects)" = "0" ] || problems="$problems owns $(role ownedObjects) tables, indexes or sequences (an owner can change them);"
[ "$(role writableTables)" = "0" ] || problems="$problems can change $(role writableTables) of the $(role tables) tables;"
[ "$(role createRole)" = "false" ] || problems="$problems can create roles;"
[ "$(role createDb)" = "false" ] || problems="$problems can create databases;"
[ "$(role replication)" = "false" ] || problems="$problems has REPLICATION;"
[ "$(role unreadableTables)" = "0" ] || problems="$problems cannot read $(role unreadableTables) of the $(role tables) tables (GRANT SELECT);"
[ "$(role bypassRls)" = "true" ] || problems="$problems lacks BYPASSRLS (Row Level Security would hide every row);"
if [ -n "$problems" ]; then
  echo "The backup role is not the read-only role the backup needs:$problems see docs/BACKUPS.md"
  exit 1
fi

BEFORE="$(counts "$BACKUP_DATABASE_URL")"

# One consistent snapshot of the public schema (UNIIVERSE's tables; Supabase's own schemas are not
# UNIIVERSE's data). pg_dump reads inside a read-only transaction. With Row Level Security on, the
# role must own the tables or have BYPASSRLS; otherwise pg_dump stops rather than dump empty tables.
pg_dump "$BACKUP_DATABASE_URL" --format=custom --compress=9 --schema=public --file "$DUMP"
AFTER="$(counts "$BACKUP_DATABASE_URL")"
DUMPED_TABLES="$(pg_restore --list "$DUMP" | grep -c ' TABLE DATA public ' || true)"
echo "Dumped $(du -h "$DUMP" | cut -f1) with $DUMPED_TABLES tables of data"
[ "$DUMPED_TABLES" = "$(value "$BEFORE" tables)" ] || { echo "Expected $(value "$BEFORE" tables) tables of data, found $DUMPED_TABLES"; exit 1; }

RESTORED=""
if [ -n "${RESTORE_SERVER_URL:-}" ]; then
  psql "$RESTORE_SERVER_URL/postgres" --no-psqlrc -q -v ON_ERROR_STOP=1 \
    -c "DROP DATABASE IF EXISTS $RESTORE_DB" -c "CREATE DATABASE $RESTORE_DB"
  # The dump creates the public schema itself, so the new, empty database starts without one.
  psql "$RESTORE_SERVER_URL/$RESTORE_DB" --no-psqlrc -q -v ON_ERROR_STOP=1 -c "DROP SCHEMA public"
  pg_restore --no-owner --no-privileges --exit-on-error --dbname "$RESTORE_SERVER_URL/$RESTORE_DB" "$DUMP"
  RESTORED="$(counts "$RESTORE_SERVER_URL/$RESTORE_DB")"
  psql "$RESTORE_SERVER_URL/postgres" --no-psqlrc -q -c "DROP DATABASE $RESTORE_DB"
  # Rows can change while the dump runs, so each restored count must lie between the counts read
  # just before and just after it.
  for key in tables teams users players riot_accounts match_details; do
    b="$(value "$BEFORE" "$key")" a="$(value "$AFTER" "$key")" r="$(value "$RESTORED" "$key")"
    lo=$(( b < a ? b : a )) hi=$(( b > a ? b : a ))
    if [ -z "$r" ] || [ "$r" -lt "$lo" ] || [ "$r" -gt "$hi" ]; then echo "Restore check failed: $key restored $r, source $b..$a"; exit 1; fi
    printf '   ok  %-14s %s\n' "$key" "$r"
  done
  [ "$(value "$RESTORED" migration)" = "$(value "$AFTER" migration)" ] || { echo "Restore check failed: newest migration differs"; exit 1; }
  echo "   ok  migration      $(value "$RESTORED" migration)"
else
  echo "RESTORE_SERVER_URL not set: the restore check was skipped."
fi

# Encrypt, then prove the encrypted file opens with the passphrase and matches the dump.
ENC="$OUT_DIR/$NAME.dump.gpg"
gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-fd 3 --symmetric --cipher-algo AES256 \
  --output "$ENC" "$DUMP" 3<<<"$BACKUP_PASSPHRASE"
DUMP_SHA="$(sha256sum "$DUMP" | cut -d' ' -f1)"
ROUND_SHA="$(gpg --batch --quiet --pinentry-mode loopback --passphrase-fd 3 --decrypt "$ENC" 3<<<"$BACKUP_PASSPHRASE" | sha256sum | cut -d' ' -f1)"
[ "$DUMP_SHA" = "$ROUND_SHA" ] || { echo "The encrypted backup does not decrypt to the dump"; exit 1; }
ENC_BYTES="$(stat -c %s "$ENC")"

cat > "$OUT_DIR/$NAME.json" <<JSON
{
  "name": "$NAME",
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "pgDump": "$(pg_dump --version)",
  "encryptedBytes": $ENC_BYTES,
  "encryptedSha256": "$(sha256sum "$ENC" | cut -d' ' -f1)",
  "dumpSha256": "$DUMP_SHA",
  "tablesWithData": $DUMPED_TABLES,
  "newestMigration": "$(value "$AFTER" migration)",
  "rows": { "teams": $(value "$AFTER" teams), "users": $(value "$AFTER" users), "players": $(value "$AFTER" players), "riotAccounts": $(value "$AFTER" riot_accounts), "matchDetails": $(value "$AFTER" match_details) },
  "restoreChecked": $([ -n "$RESTORED" ] && echo true || echo false),
  "backupRole": $ROLE
}
JSON
echo "Encrypted backup: $ENC ($(( ENC_BYTES / 1024 / 1024 )) MB)"
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  { echo "### Database backup $NAME"; echo; echo '```json'; cat "$OUT_DIR/$NAME.json"; echo '```'; } >> "$GITHUB_STEP_SUMMARY"
fi
[ $(( ENC_BYTES / 1024 / 1024 )) -le "$MAX_MB" ] || { echo "The backup is larger than MAX_MB ($MAX_MB MB)"; exit 1; }
