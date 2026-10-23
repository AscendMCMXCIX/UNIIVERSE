# Database permissions

Who can reach UNIIVERSE's tables, what each database role gets, and how a migration that adds a table keeps it that way. Row Level Security is described in `docs/UNIIVERSE_TECHNICAL_HANDOVER.md` ("Database access from outside the app"), the backup role in `docs/BACKUPS.md`.

## In short

- **Only UNIIVERSE's own server uses the tables.** It connects with `DATABASE_URL` as `postgres`, the role that owns every table and sequence, so it needs no grant.
- **Supabase's Data API is not used.** That is the REST (`/rest/v1`) and GraphQL (`/graphql/v1`) endpoints. UNIIVERSE has no Supabase client library and no anon or service key. Its roles `anon` and `authenticated` get nothing on UNIIVERSE's tables (migration `0052_data_api_grants`).
- **Row Level Security is on for every table, with no policies.** Any role other than the owner sees no rows, even with a grant.
- **The backup role reads.** `uniiverse_backup`, once the owner has created it, gets `SELECT` on every table and sequence, and nothing else.
- **A migration that adds a table says all this itself** (template below). Nothing depends on Supabase's automatic grants.

## Why Supabase changed (30 October 2026)

**Before 30 October 2026:**
- Supabase's default privileges gave `anon`, `authenticated` and `service_role` every privilege on each table, sequence and function created in `public`.
- That made a new table reachable through the Data API at once. Row Level Security alone decided which rows.

**From 30 October:**
- New tables in `public` get no Data API grants. This holds in existing projects and in new projects, preview branches, a recreated schema and `supabase db reset`.
- Tables that already exist keep the grants they have.
- A table without grants answers `permission denied` through supabase-js, PostgREST and GraphQL.

**What it means for UNIIVERSE:**
- **Nothing breaks.** The app never goes through the Data API, and as the owner it needs no grant on a new table.
- **Measured on production** (`access-audit`, 21 Oct 00:56 UTC; Postgres' statement statistics since 13 Oct 00:26):

  | Role | Statements | Calls |
  |---|---|---|
  | `anon` | 0 | 0 |
  | `authenticated` | 0 | 0 |
  | `service_role` | 3 | 6 |
  | `authenticator` | 18 | 151,847 |

  `authenticator` is PostgREST reading the schema for itself.
- **One role needs a grant on a new table: the backup role.** Before this it relied on default privileges.

## Roles

| Role | What it is | What it gets on UNIIVERSE's tables |
|---|---|---|
| `postgres` | The app's database user (`DATABASE_URL`, through the pooler). It runs the migrations and owns every table and sequence. Not a superuser; `BYPASSRLS`. | Everything, as the owner. No grant is needed. |
| `anon` | Data API requests made with the project's public anon key. | Nothing (0052). |
| `authenticated` | Data API requests from a signed-in Supabase Auth user. UNIIVERSE does not use Supabase Auth. | Nothing (0052). |
| `service_role` | Data API requests made with the secret service key; `BYPASSRLS`. | Existing tables: left as Supabase set them. New tables: nothing, from 30 October. UNIIVERSE has no service key, so the 6 calls since 13 Oct did not come from the app; their source is unknown (Supabase's dashboard is one possibility). Its grants were left alone for that reason. |
| `authenticator` | The login PostgREST connects as; it then switches to one of the three above. | Nothing. |
| `uniiverse_backup` | The weekly backup's login (`docs/BACKUPS.md`): `BYPASSRLS`, and every session read-only. It exists only once the owner has created it. | `SELECT` on every table and sequence; nothing else. |
| `PUBLIC` | Every role. | Nothing on tables or sequences. |

## Grants and Row Level Security

These are two separate locks:
- **Grants** decide whether a role may use a table at all (`SELECT`, `INSERT`, …). Without one, Postgres answers `permission denied`.
- **Row Level Security** decides which rows a role that has a grant may see or change. With RLS on and no policies, that is none.
  - The owner is exempt (UNIIVERSE never forces RLS on it), and so is a `BYPASSRLS` role.

UNIIVERSE keeps both shut for everyone but the owner. Either one alone would keep the rows private, so a single mistake exposes nothing.

**Never fix a `permission denied` by turning RLS off or adding a permissive policy.**

## Permissions matrix

All 68 tables are **private**. No table is meant to be read through the Data API, by anyone, so every table gets the same database access:

| Role | Access to every table |
|---|---|
| RLS | On, with no policies |
| `postgres` (the app) | Owner |
| `anon`, `authenticated` | None |
| `service_role` | Unchanged on existing tables; none on new ones |
| `uniiverse_backup` | `SELECT` |

What differs is who sees the data **through the app**. The server decides that (`src/server/auth/permissions.ts` and each page's checks):

| Category | Tables | Through the app |
|---|---|---|
| Accounts and sign-in | `users`, `sessions`, `permission_presets`, `user_avatars`, `auth_failures`, `invites` and `activation_codes` (legacy) | Each account sees its own; admins manage accounts. Password hashes, session tokens and throttle keys are stored only as hashes and never leave the server. |
| Team and players | `teams`, `players`, `player_champion_pools`, `player_role_pools`, `lineups`, `lineup_slots`, `lineup_substitutes`, `player_card_banners`, `player_tags` (retired) | Signed-in members. |
| Riot accounts and games | `riot_accounts`, `account_matches`, `account_champion_history`, `account_mastery`, `rank_snapshots`, `last_known_ranks`, `match_details`, `match_timelines`, `team_bookmarks` | Signed-in members. |
| Solo Queue Blocks | `ranked_profiles`, `ranked_blocks`, `ranked_games` | The player's private journal. |
| Static game data | `patches`, `champions`, `champion_skins` | Signed-in members. Nothing personal. |
| Branding and settings | `app_settings`, `brand_assets`, `brand_upload_chunks` | Everyone sees the published branding. Changing it is for admins. |
| Operations | `data_refresh_status`, `job_runs`, `audit_events`, `db_egress_daily`, `uniiverse_migrations` | Admins (System Health, Admin activity). |
| Retired, data kept | Meta & Trends: `tracked_summoners`, `match_fetch_queue`, `ranked_matches`, `ranked_participants`, `ranked_bans`, `region_status`, `stat_periods`, `stat_region_periods`, `stat_rank_periods`, `champion_role_stats`, `champion_ban_stats`, `champion_matchups`, `champion_synergies`, `pro_pick_slot_stats`, `pro_games`, `pro_game_picks`, `pro_game_bans`, `champion_change_points`. Draft: `drafts`, `draft_actions`, `draft_role_swaps`, `draft_presence`, `draft_enemy_scouting`, `series`, `matches`, `opponent_teams`, `opponent_players`. | Nobody: nothing reads them. They are dropped only by the approval-gated cleanup (PR #86). |

- **The public team page is the only anonymous view.** Its server builds it field by field from a fixed allowlist (`src/server/public/team.ts`), reading as the owner like every other page. It never goes through the Data API.
- **Read-only data stays read-only.** Only the app's own server writes. The backup role can only `SELECT`, and its sessions are read-only.
- **Sequences.** Six tables use one, for a `serial` id: `champion_change_points`, `draft_actions`, `draft_role_swaps`, `audit_events`, `job_runs` and `auth_failures`. The backup role needs `SELECT` on them so `pg_dump` can save their current values. Nobody else needs anything on them.
- **Views and functions.** There are none in `public`.

## How a new table gets its grants

1. Change `src/server/db/schema/*.ts`, and generate the migration as in the handover's migration process (`docs/UNIIVERSE_TECHNICAL_HANDOVER.md`, A3).
2. At the end of the generated `drizzle/NNNN_<name>.sql`, add the block below. Replace `example_items` with the table's name.
   - Keep one pair of sequence lines for each `serial` or identity column. Drizzle names the sequence `<table>_<column>_seq`.
   - Leave the sequence lines out when the table has no such column.
3. Run `pnpm exec tsx scripts/embed-migrations.ts` again, so the embedded copy matches the file.
4. Run `pnpm verify`; it includes the check described under "Automatic checks". Then run the database tests (below).

<!-- template: new table -->
```sql
ALTER TABLE "example_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Closed to Supabase's Data API whatever the project's default privileges, and readable by the
-- backup role where it exists (docs/DATABASE_PERMISSIONS.md).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.example_items FROM anon;
    REVOKE ALL ON SEQUENCE public.example_items_id_seq FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.example_items FROM authenticated;
    REVOKE ALL ON SEQUENCE public.example_items_id_seq FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'uniiverse_backup') THEN
    GRANT SELECT ON TABLE public.example_items TO uniiverse_backup;
    GRANT SELECT ON SEQUENCE public.example_items_id_seq TO uniiverse_backup;
  END IF;
END $$;
```

Why it looks like this:
- **The `IF EXISTS` checks.** The roles exist on Supabase but not on plain PostgreSQL (CI, local tests) or PGlite (the demo and browser tests), and a `GRANT` or `REVOKE` that names a missing role fails the migration.
- **`REVOKE ALL` for `anon` and `authenticated`.** It makes the table the same everywhere:
  - after 30 October it does nothing;
  - with the old defaults (an older project, or a local Supabase that still has them) it takes back what they handed out.
- **`SELECT` for the backup role.** Without it, a backup would fail on the new table wherever no default privilege covers it.
- **The same migration as the table.** The table is never open, or missing from a backup, between two deploys.

Never, in any migration:
- grant anything to `anon`, `authenticated`, `service_role` or `PUBLIC`;
- use `ON ALL TABLES IN SCHEMA` (or sequences or functions) or `ALTER DEFAULT PRIVILEGES`; name each object instead;
- `DISABLE ROW LEVEL SECURITY`, `CREATE POLICY` or `SECURITY DEFINER`;
- give the backup role more than `SELECT`.

**A new view** needs `WITH (security_invoker = true)`, so it reads as the caller and not round RLS as its owner. It also needs the same two `REVOKE ALL ON TABLE` lines; the backup role needs nothing on it.

**A new function** in `public` needs:
- `REVOKE ALL ON FUNCTION public.<name>(<argument types>) FROM PUBLIC;`, because Postgres lets every role execute a new function;
- the same revoke from `anon` and `authenticated` inside the `IF EXISTS` checks.

A trigger function (`RETURNS trigger`) cannot be called on its own and needs neither.

## If a table ever has to be readable through the Data API

None is today, and accounts, sessions and Riot data never should be. If a future feature really needs one:
1. Decide it deliberately and record why here.
2. Grant only the privileges it needs, to the one role that needs them. For example, `GRANT SELECT ON TABLE public.<table> TO anon;` in the table's migration.
3. Add a policy that allows exactly the rows meant to be seen.
4. Add `tests/db` cases that use the table as that role.
5. Then allow that one grant in `src/server/db/migration-grants.ts` and `access-audit`, which refuse it until then.

## New environments and database resets

The app runs every migration when it starts on an empty database (`src/server/db/migrator.ts`). That covers a new Supabase project, a preview branch, `supabase db reset`, a recreated schema or plain PostgreSQL. It needs no automatic grant:
- the app creates the tables, so it owns them;
- `anon` and `authenticated` end with nothing, whatever the defaults were;
- RLS is on for every table, the migration ledger included.

**The backup role:**
- Create it as in `docs/BACKUPS.md` after the first deploy. Its `GRANT SELECT ON ALL TABLES` and `ON ALL SEQUENCES` lines cover what exists then.
- Each later migration grants it what it adds. The role's own `ALTER DEFAULT PRIVILEGES` lines are a second guard.

**Don't change Supabase's default privileges to imitate the new behaviour.** `tests/db/data-api-grants.test.ts` does that on a throw-away database instead.

## Validating locally

- **Without a database:** `pnpm verify` runs the static check of every migration from 0052 on (`src/server/db/migration-grants.test.ts`).
- **On PostgreSQL** (`service postgresql start` if needed; the test needs a superuser, which the local and CI databases are):

  ```sh
  TEST_DATABASE_URL=postgres://uniiverse:uniiverse@127.0.0.1:5432/uniiverse pnpm vitest run tests/db/data-api-grants.test.ts tests/db/rls-supabase-roles.test.ts tests/db/row-level-security.test.ts tests/db/access-audit.test.ts
  ```

  `data-api-grants` creates a new, empty database. In a transaction that is rolled back, it replays every migration as a non-superuser that owns what it creates, as Supabase's `postgres` does, with Supabase's roles and the backup role present. It does this three times:
  1. **After 30 October**, with no default privileges at all:
     - every migration applies;
     - an account is created, signs in and reads itself back;
     - every table has RLS;
     - `anon`, `authenticated` and `service_role` hold nothing;
     - `anon` and `authenticated` are refused when they query;
     - the backup role reads every table and sequence and is refused a write;
     - `access-audit` finds no problem.
  2. **Before 30 October**, with Supabase's old defaults:
     - `anon` and `authenticated` still end with nothing;
     - the backup role still reads everything.
  3. **A future table**, added on top of both regimes:
     - with the template above it is closed and backed up in both;
     - without the template it is open to `anon` under the old defaults and missing from the backup under the new ones;
     - the audit names it in each case.

## Automatic checks

| Where | What | Catches |
|---|---|---|
| CI unit job, `pnpm verify` | `src/server/db/migration-grants.test.ts` | Each migration from 0052 on that creates a table without the RLS line, the two revokes and the backup grant (sequences included). Also a grant to the Data API roles or `PUBLIC`, a schema-wide grant, default privileges, a policy, `SECURITY DEFINER`, RLS turned off, a view without `security_invoker` or a function `PUBLIC` can run. It names the migration and the object. |
| CI database job (PostgreSQL 16) | `tests/db/data-api-grants.test.ts`, `rls-supabase-roles.test.ts`, `row-level-security.test.ts`, `access-audit.test.ts` | The same outcome on a real database, under both default regimes, with real queries as each role. |
| Production, by hand: Data jobs `access-audit` | `src/server/jobs/access-audit.ts` (read-only) | Any of the following. Each one makes the run degraded and is named in its error. |

What `access-audit` reports:
- a table the app does not own;
- a table without RLS that a Data API role can read;
- any privilege `anon` or `authenticated` hold on a table or sequence;
- a function they can run;
- a table or sequence the backup role cannot read (`backupRole.unreadable`).

It also shows `defaultPrivileges` and `newTablesGrantedTo`. That is what the project's defaults would still hand a new table: `[]` from 30 October, and `["anon", "authenticated", "service_role"]` before.

These add no workflow and no run: the two tests ride the existing CI jobs and take a few seconds together.

## Troubleshooting

- **`permission denied for table …` in the app.** The app is not connecting as the tables' owner.
  - Check `access-audit` → `connection.user` and `tables.notOwnedByApp`.
  - A table created by hand in the SQL Editor as another role belongs to that role. Give it back with `ALTER TABLE public.<table> OWNER TO postgres;`.
  - Do not grant the app's user privileges instead.
- **`permission denied` in a backup run.** The backup role cannot read a table or sequence.
  - `access-audit` lists them in `backupRole.unreadable`.
  - Grant each one: `GRANT SELECT ON TABLE public.<table> TO uniiverse_backup;` (`ON SEQUENCE` for a sequence).
  - Then check the migration that added it followed the template.
- **`role "anon" does not exist` when a migration runs.** A `GRANT` or `REVOKE` sits outside the `IF EXISTS` checks.
- **The static check fails on your migration.** Add the lines it names. It quotes the statement it expected.
- **`access-audit`: "anon holds privileges on N table(s)".** Something granted them outside the migrations, for example the dashboard, or a table was created with the old defaults and no template.
  - Run the template's `REVOKE` lines for those tables in the SQL Editor, as `postgres`.
  - Find where they came from.
- **Someone wants to use supabase-js or the REST API.** Read "If a table ever has to be readable through the Data API" first.

## Migration 0052 (applied once)

`0052_data_api_grants` changes grants only:
- **Taken back:** every privilege `anon` and `authenticated` held on the tables and sequences the app owns.
- **Given:** `SELECT` on each of them to `uniiverse_backup`, where that role exists.
- **Left alone:** `service_role`'s grants and objects owned by other roles (Supabase's own).
- **Nothing read, written or deleted.** It is safe to apply more than once.

Rollback, if ever needed: in Supabase → SQL Editor, as `postgres`:

```sql
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
```

This returns them to what Supabase's old defaults gave. Row Level Security still shows them no rows.
