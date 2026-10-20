# UNIIVERSE — Technical & Design Handover

> **Audience:** an AI assistant (ChatGPT) helping plan UNIIVERSE and write prompts for Claude Code, which does the actual development. ChatGPT cannot see the repository; this document is meant to be self-contained.
> **Short version first:** jump to **Section P — READ THIS FIRST** (1–2 pages) at the end, then come back here for detail.
> **Companion:** `docs/UNIIVERSE_PROJECT_OVERVIEW.md` (the product in brief).
>
> | | |
> |---|---|
> | Date | 14 October 2026 |
> | Repository | `AscendMCMXCIX/UNIIVERSE`, branch `main` (the only long-lived branch) |
> | Code described | commit `562fe24`, plus the documentation-only commit that adds this file |
> | Production | https://team-uniiverse.vercel.app, Vercel region `syd1`, Supabase Postgres |
> | Production version observed | 14 Oct 2026: `/api/health` reported `f373ba0` at 11:07 UTC; the data jobs reported `7f98d47` at 11:11 UTC and `562fe24` from 11:16 UTC. Later commits deploy automatically from `main`. |
> | Migrations | `0000_init` … `0020_phase6_access_groups`; all 21 applied in production (auth-audit job, 14 Oct 11:07 UTC) |
>
> **Status labels:**
> - **IMPLEMENTED** — in the code.
> - **TESTED** — automated tests pass.
> - **PRODUCTION VERIFIED** — confirmed on the live deployment, through read-only diagnostic jobs or public endpoints only.
> - **PARTIAL** — exists with a stated limitation.
> - **PLANNED** — requested, not built.
> - **UNKNOWN** — could not be verified.
>
> No signed-in production page was clicked through by the developer. Every "PRODUCTION VERIFIED" in this file comes from a diagnostic job or a public endpoint.
>
> **Secrets:** this document names environment variables but never contains their values.
>
> **Removed since this was written:** Draft (Oct 2026, Section F) and **Meta & Trends** (19 Oct 2026: Solo Queue Meta, Duo Synergies, Pro Play, and the global ranked, professional and aggregation pipelines behind them; Section E2). Dated measurements below keep those pipelines as they ran then.

---

## SECTION A — ARCHITECTURE

### A1. Technology stack

| Concern | Technology (version from `package.json`) |
|---|---|
| Framework | **Next.js 16.3** (App Router, React Server Components, Server Actions), **React 19.3** |
| Language | **TypeScript 5.9** (strict) |
| Styling | **Tailwind CSS v4** (CSS-first `@theme` tokens in `src/app/globals.css`), `clsx` via `src/lib/cn.ts` |
| Icons / font | `lucide-react`; Inter Variable via `@fontsource-variable/inter` |
| Validation | `zod` 4 (server action inputs, Riot API responses) |
| Database | **PostgreSQL** (Supabase in production, PostgreSQL 16 in CI). **PGlite** (in-process Postgres) for local demo and most tests. |
| Data access | **Drizzle ORM 0.45** with the `postgres` (postgres.js) driver. Migrations are SQL files in `drizzle/`, embedded into the build by `scripts/embed-migrations.ts` and applied at start-up by `src/server/db/migrator.ts`. |
| Authentication | Custom: scrypt password hashes (`node:crypto`), opaque session tokens stored as SHA-256 hashes in `sessions`, HTTP-only cookie. `jose` remains a dependency; legacy JWT cookies are no longer accepted. |
| Hosting | **Vercel** (Fluid compute, region `syd1`), production branch `main` |
| Background jobs | An in-app scheduler (`src/server/jobs`), triggered by `GET /api/jobs/<job>` with `Authorization: Bearer CRON_SECRET`. Callers: the GitHub Actions hourly workflow, a daily Vercel cron, site visits, and optionally Supabase `pg_cron`. |
| External data | Riot API (Account-V1, Summoner-V4, League-V4, Match-V5, Champion-Mastery-V4, Status-V4); Riot Data Dragon (champions, skins, images) |
| Image storage | Postgres `bytea` columns: profile pictures in `user_avatars`, branding in `brand_assets`, upload chunks in `brand_upload_chunks`. Champion art is hot-linked from Data Dragon. No object storage, no paid services. |
| UI components | In-house (`src/components/ui/*`); no component library |
| Tests | **Vitest 4** (unit + database), **Playwright 1.63** + `@axe-core/playwright` (browser, accessibility) |
| Build / tooling | pnpm 10.28, ESLint 9 (`eslint-config-next`), `tsx` for scripts, `drizzle-kit` for generating migrations |
| Runtime | Node ≥ 20.9 (production reports Node 24.21) |

### A2. Repository structure (the paths prompts most often need)

```
src/app/                    Next.js routes
  (app)/                    signed-in area, sharing one layout (sidebar/mobile nav)
    team/ players/ overview/ blocks/ matches/ leaderboards/ settings/ admin/
  login/ setup/ recover/ welcome/ invite/      public or pre-auth pages
  api/health  api/jobs/[job]  api/branding/*  api/avatars/[userId]  api/auth/logout
src/proxy.ts                sends anonymous visitors to /login (Next 16 "proxy" = middleware)
src/domain/                 PURE logic, no database (most of the unit tests live here)
  proficiency/              player champion proficiency model
  champion-model/           curated champion traits and the team composition model
  roster/                   roles and eligibility
  season-stats.ts           statistics filtering (season/mode/role/scope/champion/account)
  team-advice.ts            empty-role suggestions (strength tags were removed in Phase 9)
  player-card.ts            card art, skins, accents
  branding.ts               branding model and contrast checks; password-policy.ts
src/server/                 everything that touches the database or the network
  db/schema/*.ts            Drizzle schema (one file per area); db/migrator.ts; db/migrations.generated.ts
  auth/                     sessions, passwords, permissions.ts, account-admin.ts, onboarding, throttle, recovery
  actions/*.ts              Server Actions (every mutation; each checks permissions on the server)
  repositories/*.ts         database reads and writes per area (users, permissions, team, skins…)
  accounts/                 linked Riot accounts: repository.ts, sync.ts, change-riot-id.ts, kickoff.ts
  riot/api/client.ts        Riot HTTP client + per-host rate limiter; riot/static/ = Data Dragon sync
  jobs/                     scheduler.ts, registry.ts and one file per job; background.ts = visit ticks
  champions/                champion map and picker data
  players/ team/ matches/ proficiency/ public/ ops/ observability/
src/components/             React components by area (ui/, team/, players/, matches/, admin/, champions/, …)
src/lib/                    nav.ts (navigation model), sidebar.ts, cn.ts (class helpers), format.ts
drizzle/                    SQL migrations 0000–0020 + meta snapshots
tests/db/                   database tests (PGlite by default, real Postgres with TEST_DATABASE_URL)
e2e/                        Playwright: responsive.spec.ts, quality.spec.ts (accessibility, layout)
scripts/                    migrate, seed-demo, run-job, embed-migrations, reset-password, perf tools
docs/                       ARCHITECTURE, DATA_PIPELINES, DATA_AUDIT, PERFORMANCE, RESPONSIVE, DEPLOYMENT,
                            LIVE_VALIDATION, RIOT_COMPLIANCE, feature notes + these two files
```

Key single files:
- `src/server/auth/permissions.ts`: capabilities, access groups, permission checks.
- `src/lib/nav.ts`: navigation entries and admin links.
- `src/domain/proficiency/index.ts`: the proficiency model.
- `src/app/globals.css`: design tokens.

### A3. Deployment

- **Production branch:** `main`. Changes arrive through pull requests; `.githooks/pre-push` blocks direct pushes, because no branch protection is configured on `main` (GitHub Pro allows it; turning it on is the owner's decision). Every push to `main` triggers a Vercel production build and deploy, except docs- and tooling-only changes (`scripts/vercel-ignore-build.sh`). Other branches get a preview deployment only when asked for (a `preview/...` branch or `[preview]` in the commit message; docs/HOSTING_USAGE.md). No manual deploy step exists.
- **CI** (`.github/workflows/ci.yml`, on ready pull requests, pushes to `main` and by hand; documentation-only changes and draft PRs skip it; a newer push cancels the running check; a merge of an up-to-date PR reuses the PR's result), three jobs (`docs/CI_USAGE.md` explains the Actions-minute budget):
  1. Typecheck, lint, unit tests.
  2. Database tests on a PostgreSQL 16 service (after job 1).
  3. Production build, then Playwright browser tests (phone, tablet and desktop projects) against it on an in-memory database (after job 1).
  - CI does **not** gate the Vercel deploy: Vercel deploys whatever reaches `main`.
- **Database:** Supabase Postgres through the transaction pooler (`DATABASE_URL`). Migrations run automatically when an instance starts. If the ledger already lists every migration, no lock is taken.
- **Migration process:**
  1. Change `src/server/db/schema/*.ts`.
  2. Run `pnpm exec drizzle-kit generate --name <name>` (add `--custom` for a hand-written SQL migration).
  3. Run `pnpm exec tsx scripts/embed-migrations.ts`.
  4. Update the expected-migration lists in `tests/db/migrate.test.ts`, `branding.test.ts`, `auth-phase1.test.ts` and `main-accounts.test.ts`.
  5. Migrations must be additive or data-preserving. The project rule is "preserve existing data, use safe migrations".
- **Scheduled jobs** (see D3):
  - `.github/workflows/data-jobs.yml`: hourly at minute 17, best-effort; also runs one job or several (space-separated, in one run) by hand.
  - `vercel.json`: a daily cron at 04:00 UTC to `/api/jobs/tick`.
  - Site visits: a background tick when none ran for 30 minutes.
  - Optional Supabase `pg_cron` every 10 minutes (`docs/DEPLOYMENT.md` §4c). Whether it is configured is **UNKNOWN**; the evidence suggests not, because there were no `http`-triggered ticks between 07:15 and 11:00 UTC on 14 Oct.
- **Other workflows:**
  - `smoke.yml`: public pages, sign-in redirects and `/api/health` with the deployed commit.
  - `probe.yml`: HTTP timing of public paths.
- **Environment variable names** (values live only in Vercel and GitHub secrets):
  - **Required:** `DATABASE_URL`, `UNIIVERSE_AUTH_SECRET`, `UNIIVERSE_ACCESS_PASSWORD` (setup and owner-recovery key), `CRON_SECRET`.
  - **Data:** `RIOT_API_KEY`, `RIOT_PLATFORMS` (the server the key check asks; default `oc1`). `LEAGUEPEDIA_*`, `PRO_DATA_*`, `RIOT_TIERS`, `RIOT_TIER_WEIGHTS`, `RIOT_MAX_PLAYERS_*`, `RIOT_LOOKBACK_DAYS`, `RIOT_LEAGUE_*` and `RIOT_INGEST_*` belonged to Meta & Trends and are no longer read; they can be deleted from Vercel.
  - **Tuning:**
    - Riot requests: `RIOT_RATE_LIMITS`.
    - Account sync: `ACCOUNT_SYNC_*`.
    - Backfills: `TIMELINE_BACKFILL_PER_RUN` and `FIGURES_BACKFILL_PER_RUN` (30 records a run each).
    - Visit ticks: `UNIIVERSE_VISIT_TICK_MINUTES` (30), `UNIIVERSE_VISIT_TICK_BUDGET_MS` (230000).
    - Database: `DATABASE_POOL_MAX`, `DATABASE_SSL`.
  - **GitHub Actions secrets:** `APP_URL`, `CRON_SECRET`; repository variable `DATA_JOBS_ENABLED`.
  - **Local / demo only:** `UNIIVERSE_DB_MODE=memory`, `UNIIVERSE_SEED_DEMO`, `UNIIVERSE_REQUIRE_AUTH`.

---

## SECTION B — DATABASE

### B1. Important tables (all exist; Drizzle schema in `src/server/db/schema/`)

| Area | Tables | Notes |
|---|---|---|
| Team | `teams` | One team row. `engine_config` (Draft engine overrides) is no longer read. `primary_pool_limit` / `secondary_pool_limit` are **unused leftovers**: pools are uncapped. |
| Users | `users` | `username` (unique, case-insensitive), `password_hash`, `role` (`owner` \| `player`; `coach` is retired and refused by the `users_role_retired_coach` check since migration 0031), `player_id` (unique, nullable), `is_active`, `must_change_password`, `temporary_password_expires_at`, `setup_completed_at`, `setup_progress`, `permission_preset_id`, `custom_capabilities`, `access_groups` (jsonb, migration 0020), `avatar_version`. `draft_lead` is retired and always false. |
| Auth | `sessions` (token hash, user, expiry), `permission_presets` (access levels; `level_key` for built-ins: administrator / standard / restricted), `user_avatars`, `activation_codes` and `invites` (legacy; no longer used for sign-in) | |
| Player profiles | `players` | `display_name`, `riot_id` (mirrors the Main account), `primary_role`, `secondary_role`, `additional_roles` (jsonb, up to 3), `featured_champion_id`, `featured_skin_num`, `card_accent`, `group` (`main` \| `other`), `archived_at`, `sort_order`. |
| Champion pools | `player_champion_pools` (primary and secondary pools: `slot`, `champion_id`, `position`) and `player_role_pools` (additional-role pools: `role`, `champion_id`, `position`) | Unique per (player, slot\|role, champion). The **same champion may appear in several roles.** |
| Lineup | `lineups`, `lineup_slots` | Unique role per lineup and player per lineup. Plus saved lineup presets. |
| Strength tags (retired) | `player_tags` | No longer read or written since Phase 9 (the tags were removed); the table is kept so no data is dropped. |
| Riot accounts | `riot_accounts` | `puuid` unique; (platform, game name, tag) unique. `label` is `main` \| `alt`, and the partial unique index `riot_accounts_one_main_idx` allows **one Main per player** (migration 0018). Sync state: `sync_status`, `history_backfill`, back-off fields, `platform_source`. Rows for opponent accounts (`opponent_player_id`, from the removed Draft scouting) are no longer synced. |
| Personal history | `account_matches` (per-match ledger: PK account + match; queue, champion, role, result, K/D/A, CS, damage, vision, patch, duration), `account_champion_history` (aggregates per account / champion / role / queue group / patch), `account_mastery` | The ledger guarantees each match is folded once. |
| Static data | `patches`, `champions` (unique `key`, `is_active`, first/last seen version), `champion_skins` (PK champion + num; migration 0017) | |
| Removed Meta & Trends (data kept) | `tracked_summoners`, `match_fetch_queue`, `ranked_matches`, `ranked_participants`, `ranked_bans`, `region_status`, `stat_periods`, `stat_region_periods`, `stat_rank_periods`, `champion_role_stats`, `champion_ban_stats`, `champion_matchups`, `champion_synergies`, `pro_pick_slot_stats`, `pro_games`, `pro_game_picks`, `pro_game_bans`, `champion_change_points` | No longer written or read: migration `0048` copied the ladder ranks Match History shows into `last_known_ranks`. Dropping them is approval-gated (`docs/DATA_PIPELINES.md`, "Retired tables"). |
| Removed Draft feature (data kept) | `drafts`, `draft_actions`, `draft_role_swaps`, `draft_presence`, `draft_enemy_scouting`, `series`, `matches` (the drafted archive), `opponent_teams`, `opponent_players` | No longer read or written: migration `0048` copied the scouted ranks Match History shows into `last_known_ranks`. Kept until a cleanup migration that runs only after a verified production backup. `team_bookmarks` (Team Matches) is defined in the same schema file but belongs to Team Matches. |
| Solo Queue Blocks | `ranked_profiles` (focus), `ranked_blocks` (unique player + number), `ranked_games` (unique player + Riot match id; optional `teammate_player_id`) | Private journal |
| Clash Scout | `clash_scouts` (one saved scout per row: team, opponent, server, tournament, a bounded JSON snapshot, captured/verified counts, `search_text`, creator, `archived_at`, `scouted_at`), `clash_scout_accounts` (scout, slot, verified PUUID) | Migration 0042. RLS on, no policies. Screenshots and unsaved drafts are never stored. See `docs/CLASH_SCOUT.md`. |
| Branding / ops | `app_settings` (key/value: names, colours, stats version, leases, schedules), `brand_assets` (`logo`, `background` = sign-in, `appBackground`, plus `-static` frames), `brand_upload_chunks`, `data_refresh_status` (per-job status), `job_runs` (history) | |

### B2. Important relationships

- **User ↔ Player profile:**
  - `users.player_id → players.id`, unique and nullable.
  - An account without a profile is an admin-only account; the production Owner `adminascend` has none.
  - A profile without an account can exist: a placeholder, or what is left after an account is deleted.
- **Player ↔ Riot accounts:**
  - One-to-many (`riot_accounts.player_id`, cascade on delete); exactly one `main`.
  - Removing the Main promotes the oldest remaining account.
  - `setMainAccount` swaps the Main in one transaction and updates `players.riot_id`.
- **Player ↔ Champion pools ↔ Roles:**
  - The primary and secondary role pools live in `player_champion_pools` (`slot` primary/secondary).
  - Additional roles live in `player_role_pools` (keyed by `role`).
  - "The pool for role R" is resolved through `poolFor(player, role)` in `src/domain/roster`.
- **Player ↔ Solo Queue Blocks:** `ranked_blocks.player_id` and `ranked_games.player_id`, cascade on delete. Visible to the owning player only.

### B3. Data integrity

- **Deduplication:**
  - Riot match ids are primary keys (`match_details`); `account_matches` has PK (account, match).
  - A game seen from two linked accounts of the same player is counted once in statistics (`dedupeGames`, after account filtering).
  - A Riot ID resolving to an already-linked PUUID is flagged as a duplicate.
- **Ownership validation:**
  - Every server action checks the capability and, where relevant, ownership: `canEditPlayer`, `canManageRiotAccounts`, and the bookmark owner check.
  - Removing a Riot account verifies it belongs to the player being edited (fixed 14 Oct).
- **Transactions:** used for account creation, the Main/Alt swap and Riot ID change.
- **Idempotence:** account sync never double counts (each match is folded once through the `account_matches` ledger).
- **Migration safety:**
  - Migrations are additive, or normalise data without deleting it. Example: 0018 relabels duplicate Mains to Alts before adding the unique index; 0019 copies the old background into both background slots.
  - The migrator takes a transaction-scoped lock that is safe with the pooler.
- **History preservation:**
  - Account unlinking deletes that account's personal rows (by design).
- **Limitations:**
  - Two pool tables (historical): any pool logic must read both through the roster helpers.
  - `players.riot_id` duplicates the Main account's Riot ID; it is kept in sync by `setMainAccount` and `changeRiotId`.
  - Unused columns linger: pool limits, `draft_lead`, `teams.engine_config`, the legacy `invites` / `activation_codes`.

---

## SECTION C — ACCOUNTS AND PERMISSIONS

### C1. Authentication (IMPLEMENTED · TESTED · PRODUCTION VERIFIED via auth-audit)

- **Account creation:**
  - Admin only: `createPlayerAccountAction` → `createVerifiedPlayerAccount` (`src/server/auth/account-admin.ts`).
  - Input is a username and Riot ID; Riot must resolve the ID to a PUUID first (`verifyRiotIdAction`).
  - One transaction creates the user, the player profile and the Main Riot account.
  - No email, no self sign-up, no invitation links.
- **Temporary passwords:**
  - Generated randomly and shown to the admin once.
  - Stored only as a hash, valid **7 days** (`TEMPORARY_PASSWORD_DAYS`, `src/server/repositories/users.ts`).
  - The account is flagged `must_change_password`.
- **Password policy** (`src/domain/password-policy.ts`, `src/server/auth/password.ts`; audit decision 4):
  - New or changed passwords need 12–256 characters of any kind (no composition rules), and must not be on the bundled list of common passwords (`src/server/auth/common-passwords.json`: the 12+ character entries of the UK NCSC's 100,000 most common passwords, via SecLists, MIT).
  - The form shows the length rule live; the common-password check runs on the server.
  - Existing passwords keep working, whatever rules they were chosen under.
  - Hashing uses scrypt (`src/server/auth/password.ts`).
- **First sign-in:** the player must choose a permanent password (typed twice), then completes the mandatory **Welcome** setup (`src/server/auth/onboarding.ts`).
  - Required: a primary role and at least one champion. A secondary role and pool are optional.
  - Progress is saved in `users.setup_progress`; `/welcome` keeps them there until finished.
- **Password resets:** an admin issues a new temporary password (`resetPasswordToTemporary`), which ends the user's sessions. There are no reset links.
- **Sessions** (`src/server/auth/sessions.ts`, `config.ts`):
  - An opaque token sits in an HTTP-only cookie; its SHA-256 hash is stored in the database.
  - Each session lasts **24 hours from sign-in**, and activity does not extend it.
  - **There is no "Remember this device".** Every remembered account (see below) keeps its own 24 hours.
  - Logout deletes the session; a password change or reset deletes all of the user's sessions.
  - The daily `integrity` job deletes sessions a week after they ended (`deleteEndedSessions`, at most 1,000 a run) and failed sign-ins older than the 15-minute throttling window (`pruneAuthFailures`); the privacy notice states both.
- **Several accounts in one browser** (`src/server/auth/account-jar.ts`, `browser-accounts.ts`, `src/server/actions/account-switch.ts`, `/api/auth/logout`):
  - **How it works.** The browser has one active session (`uniiverse_session`) and may remember up to three others in a second HTTP-only cookie (`uniiverse_accounts`, same attributes: HttpOnly, Secure in production, SameSite=Lax, 24 hours).
    - Each remembered account is a full session of the `sessions` table, created by signing in to that account with its own password ("Add another account", `/login?add=1`). Nothing is ever merged or shared between accounts.
    - Nothing session-related is readable by page scripts or kept in browser storage.
  - **Switching** (account menu, one click; also Settings → Accounts on this browser) swaps the two cookies' tokens.
    - It only goes to a remembered session the server still recognises: checked in one query against expiry, the 24-hour sign-in limit, sign-outs and password changes elsewhere, and deactivation.
    - The page then loads in full, so no page, router cache or client state of the previous account survives.
  - **Removing** a remembered account ends its session on the server.
  - **Signing out**: "Sign out of {name}" ends the active session, and the next remembered account still signed in becomes active. "Sign out of all accounts" ends every session of the browser.
  - **Stale tabs.** `uniiverse_who` is a readable fingerprint of the active account (a hash, not a credential). `AccountGuard` compares it with the account a page was rendered for and reloads the tab before it sends a server action or page request, when it is shown or focused again, and when another tab announces a switch (BroadcastChannel). A tab rendered for one account therefore never acts as another.
  - **Unchanged:** the server authorises every request from its own session cookie, server actions keep Next.js's origin check, and permissions, profile ownership, team membership and linked Riot accounts belong to each account as before.
- **Throttling** (`src/server/auth/throttle.ts`, migration `0046_auth_failures`; audit decision 13):
  - Sign-in: 8 failures per 15 minutes per username + IP, and 8 per IP across usernames. The setup page and `/recover` have their own per-IP limit.
  - Failures are stored in `auth_failures`, so every server instance sees the same count. Each row holds only a SHA-256 hash of the key and a time; rows older than 15 minutes are deleted as new failures arrive.
- **Owner recovery:** `/recover` with the `UNIIVERSE_ACCESS_PASSWORD` setup key (`src/server/auth/recovery.ts`). The first-run `/setup` uses the same key.
- **Username changes:** players change their own username (unique, case-insensitive) in Settings.
- **Privacy notice** (`/privacy`, `src/app/privacy/page.tsx`; audit decision 14): public, linked from the sign-in page and Settings. It lists what is stored, why, who sees it and how long it stays, from the schema. Update it, and its date, when a change stores something new or keeps it longer.
- **Database access from outside the app** (migration `0044_row_level_security`, `tests/db/row-level-security.test.ts`):
  - Row Level Security is on for every table in the `public` schema, with no policies. The app connects as the tables' owner, which Postgres exempts, so nothing changes for it.
  - Any other database role sees no rows and can change none. On Supabase this closes the Data API: its `anon` and `authenticated` roles (the public "anon" key) would otherwise read and write every table, sessions and password hashes included.
  - A table added later needs `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` in its migration; until it has it, the test fails and the read-only `auth-audit` job names it (`tablesWithoutRowLevelSecurity`).
  - `tests/db/rls-supabase-roles.test.ts` recreates Supabase's roles and default grants (`anon`, `authenticated`, `service_role`, `authenticator`) and checks every table. The read-only `access-audit` job reports the same things on production: who the app connects as, the table owners, and what `anon` and `authenticated` could read, including views and SECURITY DEFINER functions.
  - `service_role` (BYPASSRLS) and the database password get round it by design. UNIIVERSE uses neither key in the browser: it has no Supabase client, and its only database credential is the server's `DATABASE_URL`.
  - **Supabase's Data API is unused, so it can be switched off.** UNIIVERSE has no Supabase client library, no anon or service key, and no request to `/rest/v1` or `/graphql/v1`. Its server talks to Postgres directly.
    - `access-audit` → `dataApiUse` counts the statements the Data API's roles ran since Postgres' statement statistics were last reset. `requests` is what `anon`, `authenticated` and `service_role` ran; `authenticator` also reads the schema on its own. Check `requests` is 0 before switching it off.
    - **Switch it off (owner, Supabase dashboard):** Integrations → Data API → turn off "Enable Data API". Older dashboards have it under Project Settings → API.
    - Switching it off removes the public REST and GraphQL endpoints. It does not replace Row Level Security or the database privileges: both stay as they are.
    - **Rollback:** turn "Enable Data API" back on. Nothing in the database changes either way.
    - The backup role (`docs/BACKUPS.md`) is unaffected: it connects to Postgres through the pooler, not through the Data API.
  - **Rollback.** Reverting the code does not undo an applied migration. If the app ever lost access, turn RLS off in Supabase → SQL Editor:

    ```sql
    DO $$ DECLARE t record; BEGIN
      FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relrowsecurity
      LOOP EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t.relname); END LOOP;
    END $$;
    ```

    - Or turn it off for one table: `ALTER TABLE public.<table> DISABLE ROW LEVEL SECURITY;`.
    - It takes effect at once, with no redeploy and no data to restore, since the migration changed no rows.
    - It reopens the Data API to the anon key, so turn RLS back on once the cause is fixed: re-run the migration's own block, as the app's database user.
- **Admin activity record** (migration `0043_audit_events`, `src/server/audit/log.ts`, `src/domain/audit.ts`; Admin → System Health → Admin activity):
  - Recorded after the change succeeds: account creation, temporary passwords, activation and deactivation, deletion (accounts and profiles), role, access level, extra access and permissions, team membership, access-level presets, a user changing their own password, branding, job runs and schedules, demo data, first Owner setup and Owner recovery.
  - Each row keeps the actor, the action, the target and short details. Names are kept as they were, so a deleted account stays named.
  - It never holds a password, token or key: detail keys that look like secrets are dropped and values are cut to 80 characters.
  - Append-only: nothing in the app updates or deletes a row. A failed write is logged and never undoes the change.
  - The page shows the last 100. A refused attempt records nothing (the action's permission check runs first).
- **Setup key checks** compare in constant time, on first-run setup as on recovery (`verifySetupKey`).
- **Security headers** (`next.config.ts`, `e2e/security-headers.spec.ts`):
  - Every response: `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and a `Permissions-Policy` turning off camera, microphone, location, payment and USB.
  - Pages also get a Content Security Policy: framed only by UNIIVERSE itself (the admin preview studio frames its own pages), forms post only back to it, no plugins, and `<base>` only to itself. It has no `script-src`, so Next's inline scripts keep working.
  - API routes don't get that policy: Next keeps a header set in its config over the same header set by a route, and the routes serving stored images send their own stricter one (`default-src 'none'`, SVG logos sandboxed).
  - HSTS comes from Vercel.

### C2. Permission architecture (`src/server/auth/permissions.ts`)

- **Owner** (`users.role = 'owner'`; production: the single account `adminascend`, identified by its account id and role, never by its username): every capability, plus the Owner-only permissions (`manage-users`, `manage-branding`, `manage-data`), which can never be delegated. Since Phase 10 the Owner works **only in Admin Mode** (no Player View switch) and there is **one Owner**: no action promotes another account (`setAccessLevel` / `setAccountRole` refuse).
  - Nobody edits their own access.
  - The last active Owner can never lose Owner access (`guardLastAdmin`, `guardSelf`).
  - Owner recovery (`/recover`, setup key) is unchanged.
- **Capabilities** (the delegable set):

  | Group | Capabilities |
  |---|---|
  | View | `view-team`, `view-players`, `view-teammate-stats`, `view-matches` (`view-trends` went with Meta & Trends; a stored one is ignored) |
  | Own profile | `edit-own-profile`, `manage-own-riot-accounts` |
  | Team management | `manage-lineup`, `manage-players`, `manage-matches` |
  | Site settings (Owner only since Phase 10) | `manage-branding`, `manage-data` |

- **Base access level per non-Owner account:**
  - **Standard Player** (default): the 7 view and own-profile capabilities.
  - **Team Manager** (level key `administrator`; renamed from Administrator by migration 0029): Standard Player plus `manage-lineup`, `manage-players`, `manage-matches`. No Admin Mode.
  - **Restricted Player**: a reduced set.
  - Owner-made levels.
  - **Custom**: ticked one by one, stored in `users.custom_capabilities`, which replaces the level.
  - Built-in levels are rows in `permission_presets` with a `level_key`.
- **Additional access groups** (migration 0020, `users.access_groups`): added *on top of* the base level, and they only add capabilities:

  | Group | Grants |
  |---|---|
  | Team Lineup Manager | `manage-lineup` |
  | Match Manager | `manage-matches` |
  | Player Manager | `manage-players` |

  (Draft Settings Manager, Branding Manager and Data Manager were retired in Phase 10; migration 0029 removed them from stored lists. `create-draft` and `manage-competition` went with Draft in October 2026; stored copies of those keys are ignored when read.)

  - Groups can never grant `manage-users`.
  - Only Owners set them, never on their own account, and Owners hold no groups.
  - Write path: `setAccessGroups` in `src/server/repositories/permissions.ts`.
- **How access is distinguished:**
  - The privileged *account type* is only Owner vs non-Owner (`users.role`). Everything else is capabilities from level + custom + groups, resolved into the session (`UserRecord.capabilities`).
  - `canUseAdminArea` = the Owner only (Phase 10). Delegated work (lineup, matches, other players' profiles) happens in place on Team, Matches and profiles.
  - **Team membership** (`players.team_member`, migration 0029, default true): a personal-use account (false) holds no team capability (`TEAM_CAPABILITIES` in `hasPermission`), is refused by `requireTeamMember` (team bookmark actions), and is left out of Players and lineup selection; it keeps its own profile, statistics and Solo Queue Blocks.
  - **Membership and setup are separate** (`listPlayers` in `src/server/repositories/team.ts`): a member is a profile on the team that is not archived and not personal use. Unfinished first-time setup only marks it `setupPending` ("Setup incomplete" badge); such a member is listed in Players, Team pickers, Leaderboards and the teammate picker, and their profile opens with clear empty states. A profile without a chosen role has `primaryRole: null` (`RosterPlayer`): no legal role and no pool, so it is shown but never assigned or drafted (`hasPrimaryRole`, `listRolePlayers` for the engine). A member with a role is eligible for that role whether or not setup is finished. Statistics come only from stored games, so a member without data has none (never zeros).
- **Server-side authorisation:** every Server Action and admin page checks `hasPermission` / `requirePageAccess` (`src/server/auth/page-access.ts`). Navigation only mirrors this; hidden buttons are never the security.
- **Retired:** the coach / "Team Leader" / Draft Lead role (removed in Phase 1; must not return; migration 0031 converts any leftover `coach` account to a player and a check constraint refuses the value). The Other Players group is retired the same way (0031).

### C3. Account management (Admin → **People & Access**, `/admin/people`; `src/components/admin/people-panel.tsx`, `access-dialog.tsx`)

| Operation | Function | Rule |
|---|---|---|
| Create | `createPlayerAccountAction` | Owner (`manage-users`) |
| Deactivate / reactivate | `setAccountActiveAction` → `setAccountActive` | Owner; ends sessions; never yourself or the last Owner |
| Delete account (optionally the profile) | `deleteAccountAction`, `deleteProfileAction` | Owner; confirmation in the UI |
| Reset password | `resetPasswordAction` | Owner |
| Access level / Owner | `setAccessLevelAction` (single write path `setAccessLevel`) | Owner; not self; last Owner protected |
| Access groups | `setAccessGroupsAction` | Owner; not self; not for Owners |
| Main / Other, archive player | `setPlayerGroupAction`, `archivePlayerAction` | `manage-players` |
| Profile editing | `saveProfilePatchAction` (autosave, version-checked) | Own profile with `edit-own-profile`, or `manage-players` |

### C4. Public team page (Oct 2026; `src/server/public/*`, `src/app/public`, `/api/public/*`)

- **Always on:** `/public` is open to everyone, without an account, and signed-in members see exactly the same page (no preview banner). There is no switch and no per-member opt-in any more.
  - The old Admin page `/admin/public-access` redirects to `/public`.
  - The old Settings → Public profile panel is gone.
  - The old data is left in place, unused: `app_settings` key `public_access`, and `players.public_profile` / `players.public_name` (migration `0040_public_profiles`). No destructive migration.
- **Who appears:** the players holding a lineup role and each role's designated substitute (`lineup_substitutes`), under their **display name**, while on the team, not archived and, with a sign-in account, active. Anyone else holding a role is a nameless placeholder. Nobody else on the team is named or sent.
- **Data boundary:** `loadPublicTeam` / `toPublicSlot` build each public card field by field, from an allowlist with no spreading: picture, card look, artwork, roles, the role's champion pool, and only the social links the player chose for the public page (G1).
  - Never computed: rank, statistics, Riot IDs, usernames, lineup-management lists or suggestions. `getTeamRoster` runs with `statsFor: () => false`.
  - A DB test pins the allowlist's keys.
- **Lightweight:** one instance reuses the public page's data for a minute (`cachedFor`, `PUBLIC_TEAM_TTL_MS`). A lineup or card change made through that instance drops it at once (`invalidatePublicTeam` in `touch()`). Turning a card over to its substitute is client state only.
- **Images:** `/api/public/avatars/[playerId]` and `/api/public/card-banners/[playerId]` serve only the players on the public page, to anyone; everything else is a 404.
  - Their cache header is `private, max-age=300`: no shared cache, so a player who leaves the lineup stops appearing within minutes.
  - The members' routes `/api/avatars/*` and `/api/card-banners/*` still require a session.
- **Routing:** the proxy lets `/public`, `/api/public`, `/api/branding` and exact `/` through.
  - `/` sends visitors to `/public`, which links to sign in; the sign-in page links back.
  - Every link on the public page stays public (a browser test follows each one as a visitor). The player panel offers no profile or edit link to visitors.
  - Every members' page still redirects visitors to sign in.
  - The public layout never calls `runTickIfDue`, and nothing there calls Riot.
- **Riot data:** rank, statistics and Leaderboards stay off the public pages unless the deployment sets `UNIIVERSE_PUBLIC_RIOT_DATA=true` (`publicRiotDataAllowed`).
  - Riot's policies do not allow an app on a Personal/Development key to serve its data for public consumption.
  - Set the variable only with a Production key whose registration describes the public pages.
- **Local testing:** the cookie `uniiverse_guest=1` makes a local browser a visitor instead of the automatic local owner. It can only remove access.
- **Tests:** `tests/db/public-access.test.ts` and `e2e/public-guest.spec.ts`.

---

## SECTION D — RIOT INTEGRATION

### D1. Riot APIs used (`src/server/riot/api/client.ts`)

| Purpose | Endpoint | Routing |
|---|---|---|
| Riot ID → PUUID | `/riot/account/v1/accounts/by-riot-id/{name}/{tag}` | americas / asia / europe (`accountRegionFor`; never `sea`, which answers 403) |
| PUUID → Riot ID (rename tracking) | `/riot/account/v1/accounts/by-puuid/{puuid}` | same |
| Active server | `/riot/account/v1/region/by-game/lol/by-puuid/{puuid}` | same |
| Rank | `/lol/league/v4/entries/by-puuid/{puuid}` | platform (e.g. `oc1`) |
| Match ids | `/lol/match/v5/matches/by-puuid/{puuid}/ids` | regional (americas, europe, asia, sea) |
| Match | `/lol/match/v5/matches/{id}` | regional |
| Mastery | `/lol/champion-mastery/v4/champion-masteries/by-puuid/{puuid}` | platform |
| Status | `/lol/status/v4/platform-data` | platform |
| Static data | Data Dragon `versions.json`, `champion.json`, per-champion detail files (kits, skins), images | CDN |

**Limits:**
- Development/personal key: 20 requests per second and 100 per 2 minutes, **per host**. The client keeps one limiter per host (`RateLimiterPool`).
- It honours `Retry-After`, backs off on 5xx and limits retries.
- PUUIDs are encrypted per API key; linked accounts re-resolve from their Riot ID after a key change.
- The registry lists 17 public platforms (PH2 and TH2 were merged into SG2 by Riot).

### D2. Account synchronisation pipeline (`src/server/accounts/sync.ts`, job `account-sync`)

```
Riot ID typed (account creation, or an Alt added on the profile)
 → ACCOUNT-V1 by-riot-id → PUUID (canonical identity; Riot's spelling adopted)
 → ACCOUNT-V1 active region → platform (platform_source = riot; else the selected/default server)
 → rank (League-V4) + champion mastery (Mastery-V4)
 → current-season match history for queues 420, 440, 400, 430, 480, 490, 700
   (newest page first, then older pages resumed from history_backfill until the season start;
    the previous season afterwards, when the current one is complete)
 → account_matches ledger (each match folded once; per-match K/D/A, CS, damage, vision, role, result)
 → account_champion_history aggregates (per champion / role / queue group / patch)
 → proficiency (computed on read by src/server/proficiency/service.ts from history + mastery)
```

- **Kick-off on link:** sign-up never waits for Riot. A best-effort verification runs right after linking (`kickoffAccountSync`); anything Riot could not answer is `pending` with a plain reason.
- **Sync states shown to players:** Updating · Catching up on history · Up to date · Delayed · Needs attention. "Retry sync" appears only for Delayed and Needs attention.
- **How quickly a new game appears:** the scheduled sync reaches an active account at most every 45 minutes (others every 3 hours, 12 accounts per run) and only when a scheduler tick runs (a visit starts one every 30 minutes; the hourly GitHub run is best effort), so a game played just now usually takes 45–90 minutes. Rendering never waits for Riot; no page caches personal games.
- **Refresh matches** (`src/server/accounts/refresh.ts`, `refreshMatchesAction`): Match History shows when the linked accounts were last read successfully (`sync_cursor`, the oldest of the player's accounts) and when the newest stored game was played, and offers Refresh to the player and to those who manage Riot accounts (checked on the server). A refresh runs the same sync for that player's accounts now, limited to new games (15 per account, no back-fills, about 40 s), then the list reloads in place with its URL filters. Every sync, scheduled or manual, first claims a per-account lease in `app_settings` (`account_sync:<id>`; 2 min for a refresh, 1 min for the scheduler), so two syncs never run on one account and repeated clicks cost Riot nothing. Outcomes are stated as they happened: N new games, no new games (Riot can take a few minutes to list a finished game), already checked (with when it may be tried again), failed, or not available (no Riot key). The control (October 2026) is one line: a **Refresh** button (secondary, with its icon) and "Checked 4m ago · Newest game 2h ago"; the outcome shows as a short note beside it that fades after 8 s (failures stay), and a refresh inside the server's cooldown disables the button with a countdown (a local clock, no polling). Played Together reads the same stored games, so a refresh updates it as well.

### D3. Background updating

- **Scheduler:**
  - Entry point: `runTick` in `src/server/jobs/scheduler.ts`. Order: version-check → account-sync → integrity → timeline-backfill → figures-backfill.
  - A tick has a 240 s budget (visit ticks 230 s). Jobs claim atomically, so concurrent ticks skip instead of duplicating work. Per-job caps inside a tick: account-sync 75 s, integrity 20 s, timeline-backfill 25 s, figures-backfill 25 s.
- **Job intervals** (`defaultIntervalMinutes`; can be changed in Admin):

  | Job | Interval |
  |---|---|
  | version-check | 60 min |
  | account-sync | 15 min |
  | timeline-backfill | 60 min |
  | figures-backfill | 60 min |
  | integrity | 24 h |

  - `static-sync` (forced) and the diagnostic jobs run on demand only. Diagnostic jobs: `auth-audit`, `data-audit`, `perf-probe`, `riot-check`, `skin-audit`, `proficiency-audit`.
- **Triggers:** GitHub hourly (best-effort; often skipped), Vercel daily 04:00 UTC, visits (every 30 min while people use the site), optional `pg_cron`.
- **Retry / back-off:**
  - Accounts: 5 min after the first failure, doubling up to 6 h.
  - `integrity` unsticks interrupted runs, deletes sessions a week after they ended and prunes failed sign-ins past the throttling window (bounded batches).
- **Sync priorities (accounts):**
  1. New or failing links.
  2. Accounts still collecting this season.
  3. Active players (Main group, or signed in within 7 days) not refreshed for 45 min.
  4. Everyone else after 3 h.
  - Opening a profile also refreshes that player's due accounts in the background, about 40 s per visit.
- **Patch detection:**
  - `version-check` compares Data Dragon's newest version with the stored patch.
  - A new version upserts champions and skins, opens the new patch and clears caches.
  - On the same version it back-fills champion skins, 60 champions per run.
- **Season transitions:** the season number is derived from the game version (16.x = "Season 2026"). Year-style patches like 26.20 are mapped to 16.20. History is collected per season automatically.

### D4. Current data health (production, read-only jobs, **14 Oct 2026, 11:07–11:16 UTC**)

A dated snapshot. The global ranked, professional and statistics rows describe Meta & Trends, removed on 19 Oct 2026.

| Measure | Value |
|---|---|
| Linked player accounts | **13** (10 players; one player has 4 accounts); all resolved, all `ok`, last synced 10:45–11:00 UTC |
| Personal match ledgers | 40 to 872 matches per account (e.g. 164, 399, 367, 40, 124, 872, 91, 43, 79, 746, 140, 586, 122) |
| Users | 11 accounts: 1 Owner (admin-only, no profile), 10 player accounts; 6 with a permanent password, 4 still on a temporary password; 4 with first-login setup pending |
| Global ranked games | **2,321** at 11:10 UTC (2,229 on 16.20, 92 on 16.19; fetch queue empty; newest game created 14 Oct 00:57 UTC). After the discovery fix, **2,940** stored at 11:25 UTC, with 209 queued; the new games are folded into statistics by the next `aggregate` run. |
| Effective games (statistics description) | 1,604 (rank- and patch-weighted; patch weights 1 / 0.6 / 0.36) |
| Region share (16.20, before the 11:25 ingest) | OCE 66.2 %, EUNE 8.2 %, EUW 7.1 %, RU 3.3 %, KR 2.9 %, ME 2.6 %, NA 2.6 %, BR 1.7 %, SG 1.7 %, JP 1.4 %, LAN 1.2 %, LAS 0.9 %, TR 0.2 % |
| Rank bands (16.20) | Challenger 417, Grandmaster 40, Master 349, legacy Master+ 631, Diamond 659, Emerald 133 |
| Tracked ladder players | 20,423, of which about 253 have ever been scanned for match ids |
| Professional games | 311 (Leaguepedia): 178 on 16.20, newest 13 Oct 20:47 UTC |
| Bans (current patch) | 21,423 |
| Job health | `/api/health`: ok, no failing jobs; no job failures in 7 days. **Note: "ok" did not reveal the discovery stall.** |
| Champion skins | 3,198 stored (version-check, 11:22 UTC) |
| Drafts / matches | 5 drafts (none with enemy Riot IDs); 0 match records |

---

## SECTION E — PLAYER PROFICIENCY

### E1. Player proficiency (IMPLEMENTED · TESTED; `src/domain/proficiency/index.ts`, `DEFAULT_PROFICIENCY_CONFIG`)

Per (player, champion, role), from the combined history of all linked accounts plus combined mastery.

**Inputs**
- games and wins per champion / role / queue group / patch;
- last played;
- mastery points;
- the player's baseline win rate.

**Queue weights** (`QUEUE_WEIGHTS`): Solo/Duo 1.0, Flex 0.9, other (Clash, Swiftplay…) 0.85, Normal 0.6.

**Role-specific experience** (revision 2, October 2026; full write-up with old vs new in `docs/CHAMPION_EXPERIENCE_LABELS.md`): once ≥ 5 of the player's games on the champion have a known role, games in *other* roles count `offRoleWeight` 0.25, capped at `offRoleCap` 8 games' worth; mastery counts towards a role in proportion to the games on the champion in that role; the Main / Comfortable minimums count games in the role only; recency comes from stored games. Results (win rate) still use every game.

**Components**
- **Familiarity** = log(1 + volume) / log(1 + 60), where volume = role-weighted games + mastery points / 6,000 × 0.5 × (share of the champion's games in this role, at least 0.25).
- **Recency:** 1.0 within 30 days, then declining to 0.75 at 90 days, then a floor of 0.55. Practice comes from recent and medium-window games.
- **Role fit:** 1 with fewer than 5 known-role games; otherwise 0.6 + 0.4 × min(1, roleShare / 0.6).
- **Performance:** win rate shrunk towards the player's baseline with 25 pseudo-games.
- **Confidence** = weighted games / (weighted games + 15) × 0.7, + 0.15 if mastery exists, + 0.15 if a last-played date exists.
- **Score** = 0.5 + (raw − 0.5) × (0.4 + 0.6 × confidence), where raw = familiarity × 0.5 + recency factor × 0.25 + role fit × 0.1 + performance × 0.15.

**Tiers and labels**

| Tier | Label | Rule |
|---|---|---|
| `core` | **Main** | familiarity ≥ 0.85 and recency ≥ 0.8, and ≥ 15 queue-weighted games in the role |
| `strong` | **Comfortable** | familiarity ≥ 0.65 and recency ≥ 0.6, and ≥ 6 games in the role |
| `comfortable` | **Familiar** | familiarity ≥ 0.45 |
| `moderate` | **Few games** | ≥ 1 game, or mastery ≥ 5 games' worth |
| `rusty` | **Out of practice** | not played for > 90 days with familiarity ≥ 0.5 |
| `unknown` | **Not played** | none of the above |

Labels before October 2026: Very strong / Strong / Comfortable / Limited data / Rusty / No data. Evidence (confidence) is shown beside the label as one to three bars.

Mastery alone (no games in supported queues) caps the tier at Familiar.

**Used by** profiles (All Champions, Roles & champion pools, player details) and the Team Overview cards. It never changes the pools.

### E2. Global evidence (removed with Meta & Trends, 19 Oct 2026)

Meta & Trends (Solo Queue Meta, Duo Synergies, Pro Play) and the global evidence behind it are gone: the Emerald+ ladder sampling and ranked collection, rank and three-patch weighting, champion rework detection, Leaguepedia professional games and the aggregation jobs. Everything UNIIVERSE shows now comes from the linked players' own games. The tables stay in the database untouched until an approval-gated cleanup (`docs/DATA_PIPELINES.md`, "Retired tables"); `docs/ARCHITECTURE.md`, "Meta & Trends removed", lists what was kept.

### E3. Data limitations

- **Player history:** some accounts are thin; one player's season K/D/A is still back-filling (167 of 563 games).
- **Role inference:**
  - Riot's recorded position is trusted for own games; games without a position are excluded from role filters and counted in a note.

---

## SECTION F — TEAM MATCHES

The Draft feature (setup, Draft Room, live drafts, recommendation engine, scouting, series and
Fearless rules, Match Playbook, the drafted-match archive and its editor, opponents, competition
modes and Draft Settings) was **removed in October 2026**. Its database tables are still present
and untouched until a separate, approval-gated cleanup migration drops them (see
`docs/ARCHITECTURE.md`, "Draft removed").

**Team → Matches** (`/matches`, `src/server/matches/*`) now holds only Riot games:
- **Played together:** games where two or more current members were on the same side, with
  filters, team bookmarks (`team_bookmarks`; removal by whoever added it or a Match Manager) and
  the full match details. Needs `view-matches` and `view-teammate-stats`; without the latter the
  page explains that it shows teammates' games.
- **Encounters:** players members met repeatedly, as allies or opponents.

---

## SECTION G — PLAYER PROFILES

### G1. Profile model

- **Roles:** primary (required), secondary (optional), up to three additional roles, in preference order.
- **Pools:**
  - One per role, uncapped (≤ 250), drag-ordered; pool order is the player's comfort statement.
  - The same champion may sit in several roles.
  - Editing autosaves (`use-profile-autosave.ts` → `saveProfilePatchAction`), sending one request at a time and refusing stale versions (`players.updated_at`).
- **Card identity:**
  - Featured champion (any active champion), skin (`featured_skin_num`) and accent colour, set via **Customise** on your own card/profile (`customise-card.tsx`, `setCardStyleAction`, validated server-side).
  - **The Studio on phones and tablets:** each step takes its own height and the window scrolls (on desktop a step fits beside the preview and long lists scroll inside it). The pinned preview is drawn smaller (72%, 62% held sideways), can be put away with Hide, and its height is kept clear at the top of the scrolling area (`scroll-padding-top`), so a field or slider the browser scrolls to is never under it. `e2e/studio-touch.spec.ts` taps every control of every step on an iPhone SE, an iPhone 15 held either way, a Pixel 7 and an iPad Mini (Chromium emulation).
  - Art falls back: skin splash → default splash → loading art → accent gradient (`card-art.tsx`).
- **Profile pictures:** cropped in the browser, validated by bytes on the server, served members-only from `/api/avatars/[userId]`.
- **Social links** (Oct 2026; `src/domain/social-links.ts`, `players.social_links`, migration `0049_social_links`): optional YouTube, Twitch and Discord, set by the member in the Player Card Studio's **Links** step (their own card only; saved with the card), Settings → Profile or the optional welcome step (`saveSocialLinksAction`, always the session's own profile). All three use the same fields and checks (`SocialLinksFields` in `social-links-editor.tsx`); the Studio loads the stored links when it opens (`ownSocialLinksAction`).
  - Each has its own audience: Only me (default), Team members, or also the public team page. A link shows only through `visibleSocialLinks` for an audience its owner chose, and only while its value still passes the checks: a stored value alone never shows anything.
  - Only youtube.com channel addresses or @handles, and twitch.tv channel names, are accepted (normalised; other sites, schemes and disguised hosts are refused). Discord is a username to copy: Discord has no public address for one. No OAuth, nothing fetched or embedded; links open in a new tab with `noopener noreferrer nofollow`.
  - The stored value is never part of `PlayerRecord` (which the Players directory sends to the browser): `loadSocialLinks` reads it for the server to filter. Team cards and the profile header carry the team-visible list; the public card keeps only `public` ones (pinned by `tests/db/public-access.test.ts`).
  - Deleting an account clears its links, even when the profile is kept archived.
  - **Where they show:** round icons on Team Overview cards (a substitute's own on the back of the card), the Players directory and the public page (`CardSocialIcons`); labelled chips in the profile header and the Team window (`SocialLinks`); the same icons without actions in the Card Studio preview; Settings shows what teammates and the public page will see before saving. Each icon is its own link or button, so using one never opens, turns or selects the card, and never changes the lineup. In a narrow Team card the icons share the avatar's row, so every card keeps the same height. On the Players directory the card is one link to the profile, so the icons are drawn over the space the card reserves for them.
  - **Policy review:** `docs/RIOT_COMPLIANCE.md` → Social links.
- **Riot accounts:** Main + Alts, all counted (Section B2).
- **Visibility:**
  - Every member sees profiles, pools, Riot IDs and statistics. Teammates' statistics need `view-teammate-stats`.
  - Team Overview follows the same rule on the server (`getTeamRosterForViewer`): without `view-teammate-stats` a teammate's card carries name, roles, lineup place and pool champions only (no rank, season figures, champion figures, proficiency or rank change, and vacant-role suggestions do not cite games). Your own card always shows your figures.
  - Never shown: passwords, sessions, infrastructure.
  - Solo Queue Blocks are private to the owner.

### G2. Player statistics (`src/domain/season-stats.ts`, `src/server/players/overview.ts`, `src/components/players/player-overview.tsx`)

| Figure | Definition |
|---|---|
| Games, W–L, win rate | Counts of stored games after filtering and de-duplication (a rate) |
| KDA ratio | (Kills + assists) ÷ deaths **summed over games** (so one deathless game cannot make it infinite) |
| CS, damage, vision | **Per-game averages** over the games that have those details (the sample size is shown, e.g. "167 of 563 games") |
| Mastery points | Summed across linked accounts, with a per-account breakdown |
| Proficiency | Tier badge per (role, champion), with an ⓘ explanation (E2) |
| Multikills | Riot's double, triple, quadra and pentakill counts (`doubleKills` … `pentaKills` on each game's record), **added up over the same filtered, de-duplicated games**, shown as four totals with "From all M games" or, while some games have no counts, "From N of M games", a **Partial** marker, a coverage bar and a note saying how many are still being fetched and how many Riot no longer provides (`multikillCoverage`); By champion (portraits) and By account (several accounts) open as disclosures (`src/domain/multikills.ts`, `Multikills` in `player-overview.tsx`). Records stored since Team Leaderboards (Phase 14) carry the counts; for older Season 2026 games the `figures-backfill` job fetches the record again, once each, newest first, a few per run (`src/server/accounts/figures-backfill.ts`), and the totals grow as they arrive with no other change. Games without counts are left out, never counted as zero, so this is **not a career total**; a game whose record Riot no longer provides is marked (`extra_stats = {}`, shown as "-" in the account rows) and not asked for again. Production, 20 Oct 2026, before the backfill: 871 of 4,779 stored games of linked players had them (156 of the 3,540 games in Leaderboards' scope). Match History and Team → Matches mark each game's largest multikill (`MultikillTag`: Riot's `largestMultiKill`, else the largest kind with a count; Team → Matches reads it from `account_matches.extra_stats` in its one cached query). Whether Riot also counts a larger multikill in the smaller ones is read from production data by the `data-audit` job (`multikills.riotCounting`); the page shows Riot's counts as they are either way |

Nothing is modelled or estimated in these figures; they are plain counts of stored games.

### G3. Season and game-mode filtering

- **Seasons:**
  - The current season by default. Earlier seasons are offered only when their games are stored; the previous season is back-filled after the current one completes.
  - A season is labelled **Partial** until every linked account has been read back to the season start.
- **Modes:**
  - All supported games (default): Solo/Duo 420, Flex 440, Normal Draft 400 / Blind 430, Swiftplay 480 / Quickplay 490, Clash 700.
  - Also: Ranked Solo/Duo, Ranked Flex, Normal games.
- **Filters** (URL parameters `season, mode, role, scope, champion, account`):
  - Order: account → de-duplicate → season/mode → role (Riot's recorded position; unknown-position games excluded and counted in a note) → scope (all champions / configured pool for the role / one champion).
  - A scope label always states what is counted.
- **Rendering never calls Riot synchronously.**
- **Where the defaults apply** (current season + All supported games, real filters, Reset restores them): Profile Overview, All Champions, Match History, the champion window (via Refine), Leaderboards, Team Overview, Played Together (plus "All seasons"; its "Played together most" pairs follow the season and mode). Exceptions: Solo Queue Blocks are Solo/Duo only; Drafted Matches is an archive of team drafts filtered by competition and patch, not by Riot game mode, and lists every season. A game's season is read from its patch (`seasonOfGame`).
- **Mode counts and empty seasons** (`modeBreakdown`): the Game mode filter of Overview, All Champions and Match History names each mode's games in the chosen season ("Ranked Flex (14)"), and a list that a mode leaves empty links to the seasons holding that mode's games. Played Together does the same for its filters. Production (2026-10-17): 83 Ranked Flex games stored (199 account rows across 10 linked accounts), 54 of them with two or more team players on one side; `data-audit` → `queueClassification.flexVisibility` gives them per player and season as the views count them.
- **Encounters** (Team → Matches → Encounters, `?view=encounters`; `src/domain/encounters.ts`, `src/server/matches/encounters.ts`, `src/components/matches/encounters-view.tsx` and `encounter-browser.tsx`, `getEncounterDetailAction`):
  - **What:** other players met two or more times in team members' recorded games. Three lists: Frequent allies, Frequent opponents, and players met by several members (who may have been both).
  - **Counting:** one member's game counts once however many of their linked accounts stored it. Team totals count a game once however many members were in it, per relation, with the result of the members' side in that relation (members on both sides of one game make one ally game and one opponent game, never a blended win rate). Members' own figures are listed per member.
  - **Who is listed:** anyone with a recorded PUUID and Riot ID who is not linked to any UNIIVERSE profile (current, personal-use or archived). Recognised by PUUID, so renames merge; the latest recorded Riot ID is shown. The page gets an opaque key (`encounterKey`), never the PUUID.
  - **Filters (URL):** `rel`, `member`, `account` (for one member with several accounts), `season` (current by default, or `all`), `queue` (the Played together modes), `min` 2/3/5, `sort` (most games, best or weakest record), `q` (Riot ID search), `limit` (30 more per "Show more"). Insights (most faced, most frequent ally, best and toughest records) appear only with at least 3 games (5 for records); records under 5 games carry a "small sample" mark.
  - **Data and cost:** one SQL pass over the members' stored games and participants (`jsonb_array_elements`), players met only once dropped in the database, then cached per team for 15 minutes under the same history fingerprint as Played together (a sync, new game or membership change invalidates it). Season, mode, member and account filter the cached rows; the resulting player summaries are kept with them (`encounterSummaries`, up to 12 filter sets), so list, minimum, order, search and Show more only re-list. No Riot request. `perf-probe` step `matches.encounters` (counts only, never names). Local Postgres benchmark at production volume (12 members, 5,028 member games, 20,063 repeated-player rows): cold load 0.74 s once per 15 minutes, warm 18 ms, first view of a filter set 46 ms, then 2 ms.
  - **Limits:** only games UNIIVERSE recorded for members (each account's synced history), so a missing game is not proof two players never met; games without stored match details have no other players.
  - **Tests:** `src/domain/encounters.test.ts`, `tests/db/encounters.test.ts`, `e2e/encounters.spec.ts`. The demo places synthetic recurring players in the demo games (`server/demo/encounters-fixture.ts`, DEMO_ games only).
- **Both teams on match cards** (`TeamComposition`, `src/components/match-history/team-composition.tsx`; data from `src/server/matches/compositions.ts`):
  - **Where:** a player's Match History and Team → Matches show the same preview, blue then red, each in lane order with the name Riot gave for every player.
  - **Marking:** the player the list is about is in bold. UNIIVERSE team members (found by their linked Riot accounts, `teamMembersByPuuid`, one query) are in the accent colour under their profile name. That side is tinted.
  - **Missing data:** a name Riot did not provide falls back to the champion's name, in a quieter colour. Nothing is guessed, and the cards say nothing about who queued together (only the match window shows possible groups, below).
  - **Data:** stored match details only, never a Riot request. Match History builds it from the details it already loads for the page. Team → Matches reduces the shown games' participants to five fields inside the database (`loadCompositionParticipants`, one query).
  - **Layouts:** Match History cards use the list's own width (container `mh`): wide cards from 50rem, with the compact build from 56rem. Below 50rem the card stacks, and on phones the teams are one line of icons (names read by screen readers).
  - **Team → Matches** uses the one-line "strip" variant under each game.
  - **Without the full record,** the card says so instead of showing empty slots.
  - **Tests:** `e2e/match-teams.spec.ts`; `tests/db/match-history.test.ts`.
- **Player links in completed matches** (`PlayerLink`, `src/components/match-history/player-link.tsx`; rules in `src/domain/opgg.ts`):
  - **Where:** the team previews in Match History and Team → Matches, and the match window's scoreboard.
  - **Link targets:**
    - An active UNIIVERSE profile opens that profile.
    - A non-member opens their OP.GG profile in a new tab (`noopener noreferrer`, a small arrow icon). The link is built from the Riot ID recorded in the match and the server in the match id (`OC1_…` → `oce`).
    - Otherwise the name is plain text: no well-formed `Name#TAG` (3–5 letter or digit tag, any script), an unknown server, or a demo `DEMO_` match.
  - **A player's own history on OP.GG** (`OpggHistoryLink`): "View Match History on OP.GG · <account>" in the Match History header (the chosen account, or the first when all are shown; never another account in place of a chosen one) and in the match window (the account that played the game, also in Team → Matches and Matchups). OP.GG has no address for one game that can be built from Riot's match id, so no link claims to open the game.
  - **Data:** stored data only. No Riot or OP.GG request.
  - **Policy:** see `docs/RIOT_COMPLIANCE.md` → Player links.
  - **Match History card:** a box rather than a `<button>`, because links cannot sit inside a button. A click anywhere but on a link opens the match. The button behind the content is the card for the keyboard and screen readers: one tab stop, Enter or Space opens it, and its outline marks the card. Item and spell tooltips keep working.
  - **Keyboard:** preview links are `tabIndex=-1`, so the keyboard still moves card by card. The scoreboard's links are in the tab order.
  - **Tests:** `src/domain/opgg.test.ts` (real-world IDs: Hangul, kana, Cyrillic tags, symbols, reserved URL characters); `tests/db/match-history.test.ts`; `e2e/match-teams.spec.ts`.
- **Possible groups in completed matches** (rules `src/domain/possible-groups.ts`, loader `src/server/matches/possible-groups.ts`, action `getMatchGroupsAction`):
  - **What:** in the match window's scoreboard, players **outside UNIIVERSE** on one team who were all on one team in at least 3 stored games of the 180 days before the match (never the match itself or later games), and at least three times as often as teammates as opponents. Anyone whose Riot account is linked to a profile (`riot_accounts.owner_type = 'player'`) is never assessed or labelled (October 2026; read on every request, and part of the cache key, so a newly linked account is excluded at once). Labelled "Possible duo/trio/four-player/five-player group" with "These three players appeared on the same team in four previous recorded games." (`groupEvidenceText`); the line opens the evidence games (date, queue, result; ten at most). The rows get a thin coloured marker. A note under the scoreboard gives the number of stored games searched and says it is an inference; a side without a group reads "not enough recorded history to assess", a side of members "no other players to assess".
  - **Queues:** Solo/Duo duos only; Flex 2, 3 or 5; normals, ARAM, Quickplay and Swiftplay up to 5; Clash stated as registered teams; other queues not assessed. One group per player; equally supported overlapping groups are both left out.
  - **Data:** one query over `match_details` (participants of the stored games in the window, filtered to this match's ten PUUIDs), no Riot request, no migration. PUUIDs stay server-side; the page gets `DetailParticipant.slot` (position in the stored record). Names come from the analysed match only (no historic Riot IDs).
  - **Performance:** a separate request after the scoreboard renders, never during the Match History list. Server cache 30 minutes per match (300 matches); the list's browser cache keeps it with the match details, so reopening makes no request. `perf-probe` → `matches.possibleGroups` measures the uncached query on the newest stored game. Local benchmark: about 130 ms for 4,300 stored games in the window.
  - **Policy and the Match-V5 option:** `docs/RIOT_COMPLIANCE.md` → Possible groups. Fetching participants' own histories was evaluated and not built: it needs a product-registration update by the owner and would compete with ingestion for the rate budget.
  - **Demo:** a pair of rivals ("Demo Duo 1/2") meets each demo player in every third personal game; other demo players are new in every game.
  - **Tests:** `src/domain/possible-groups.test.ts`; `tests/db/possible-groups.test.ts`; `e2e/possible-groups.spec.ts`.
- **Ranked Flex:** Riot queue 440 is Ranked Flex everywhere (ingestion, `queueGroupFor`, `QUEUE_LABELS`, season modes, leaderboards, Played Together, Matchups); 420 is Solo/Duo. No game is called a premade five. `data-audit` → `queueClassification` reports the stored counts per queue and any game whose queue differs from its match details. ("Ranked 5s" was a draft category of the removed Draft feature, never a Riot queue.)

### G3a. Account order (migration `0037_account_order`, `src/domain/account-order.ts`)

- One order for a player's linked accounts: the Main first, then the alternatives in the order the player set (Riot Accounts → Move up/down buttons, `reorderAccountsAction`, same permission as making an account Main). Accounts never reordered fall back to the order they were linked.
- `listAccountsForPlayer(s)` return that order, so every account list follows it: Riot Accounts, Match History, All Champions, Overview, the champion window (Refine and per-account breakdown), Ranked progression, recent performance. "All accounts" aggregates are unchanged.
- `riot_accounts.sort_order` is nullable and presentation only: no game, statistic, label or owner changes. Making an alternative Main swaps it with the former Main; removing the Main promotes the first alternative; replacing a Riot ID keeps the account's place.

### G4. Team screen (`src/components/team/team-roster.tsx`, `src/server/team/roster.ts`)

- **Main lineup:** five role cards (only Main-group players), lineup changed via a menu by `manage-lineup` holders (e.g. the Team Lineup Manager group).
- **Cards:** the artwork with role, picture, name and rank, then one body that continues the art (the card accent fades down from it): the season in the **assigned lineup role** as one row (win rate with record, KDA with kills / deaths / assists per game, CS per minute or average vision for Support) with a win/loss bar and the number of games (`CardPerformance`), then the **pool for that role** with the first choice featured (portrait, name and its games and win rate in the role) and the rest as portraits that fit (`CardPool`). The Card Studio preview uses the same pieces. Every filled card has the same parts, so cards in a row line up; no game in the role this season and no champion chosen are said plainly instead of dashes. Empty roles list their suggestions one line each (reasons on hover and for screen readers), so a vacancy no longer stretches its row (production's empty Support slot made the other cards of its row taller, which was the empty space under their figures).
- **Player window (an expanded player identity, October 2026):** one identity block, the player's card opened up: their saved artwork and colours (static crop, no card effects or blur) behind the role, avatar, name, rank and status, Full profile as the main action, the lineup position and the last ranked change, and this season's figures in the same block (three headline figures, the win/loss bar, a quiet line: games, damage, the other of vision and CS). Below it the pool as tiles (`PoolChampionTile`): the first choice a wide tile in the card's colour, the rest two to a row, each with its place, experience label and figures. Previous / next (buttons and arrow keys), keyboard, focus return and reduced motion are those of the shared DetailModal; the window is as tall as its content on desktop (the whole screen on phones).
- **Strength tags were removed in Phase 9** (by the user's choice), with their code (`player-tags.ts`, `team/tags.ts`); the unused `player_tags` table is kept.
- **Empty roles:** advisory suggestions of registered players who could fill them (`src/domain/team-advice.ts`); never auto-assigned. Production: the Support slot is empty.

### G5. Solo Queue Blocks (`/blocks`; `src/domain/ranked-improvement.ts`, `src/components/ranked/*`)

- **Blocks (Phase 9):** a block starts at **0 / 1** with one click (or by logging a game when none is running) and gains a slot with every game; no maximum. A target (1–100) is optional and can be set, changed or cleared at any time; reaching it does not close the block (Finish block or "+3 more"); finished early is recorded as such.
- **Ranked Focus:** one card with a featured champion (`ranked_profiles.champion1`), the improvement sentence and two more champions plus a counter pick. The block in progress follows it; finished blocks keep the focus and featured champion they were played with (`ranked_blocks.focus`, `featured_champion_id`, migration 0027).
  - **Champions follow the Primary Role pool** (`src/domain/ranked-focus.ts`, October 2026): a slot the player never set (`null`) shows the next champion of their Primary Role pool in their order, read fresh each visit, so a changed or reordered pool shows at once (the cause of the old mismatch: the focus kept copies of champions chosen long before). A champion the player picks is theirs and stays; clearing a slot stores `''` (stays empty); "Use my pool order" sets the three back to `null`. No schema change. The block in progress shows the pool's first champion while it follows the pool; finishing it (by hand or by the two-loss limit) stores that champion, so completed blocks never change.
  - **Autosave:** champions save on change; the sentence after a 0.7 s pause in typing, on leaving the field, on Enter and when the page is hidden or left (a "leave page?" prompt only while a save is pending). One save at a time, in order; "Saved" only after the server confirmed it; a failure keeps the text and offers Retry (`SaveStatusIndicator`). There is no Save button.
- **Layout (October 2026, the same order on every screen):** Focus (featured champion, objective, the other champions; across the page on wide screens); Current Block or starting the next (label, rule, focus, wins/losses, the games as a strip, the next action, Finish and Delete); Quick Add (recent Riot games and manual entry, beside the block on wide screens); Logged Games (five per page); Previous Blocks (latest five, full history paginated). `e2e/blocks-focus.spec.ts` checks the order at 1440 and 390.
- **Patterns & Notes: removed (October 2026).** A short-lived private trends panel and free-text notes were taken out at the owner's request (simplicity: no separate gameplay-pattern analysis or notes system). Recent Form, Ranked Progress and the Blocks focus and journal are unchanged. The `ranked_profiles.notes` column from migration `0039_patterns_notes` is retired, not dropped: nothing reads or writes it, and it stays so no player text is deleted unverified. Drop it in a later migration only after confirming production holds no notes.
- **Completion rules (migration 0038: `ranked_blocks.completion_rule`, `completed_reason`):** chosen when a block starts (a game logged with no block running reuses the previous block's rule).
  - *Game target* (`target`, the default and every block before 0038): the player finishes it; a target is an optional plan.
  - *Two-loss limit* (`two-losses`): the block completes by itself on its 2nd loss in total ("Completed · 2-loss limit reached"); no game target. Applied after every add, import, result edit and game deletion (`applyCompletionRule`).
  - *Manual*: Finish block, any time (`completed_reason = manual`).
  - Corrections: an active two-loss block that reaches two losses completes; a block the limit completed that drops below two losses (an edited result or a deleted loss) reopens only while it is the latest block and nothing else is in progress; otherwise it stays completed and its label shows only "Completed". A block the player finished never reopens. Duplicate imports are refused as before.
- **Deleting a block** (`deleteBlock`, `deleteRankedBlockAction`): the player's own block, in progress or finished, after a confirmation that names what goes. One transaction removes the block and its journal entries (`ranked_games` rows); `account_matches` and every Riot record are untouched, so imported games can be imported again. Other blocks keep their labels; the next block is numbered after the highest remaining one. The owner comes from the session; another player's block is "not found".
- **Game entry:** champion, enemy laner, result, **one main mistake** (Mechanics, Trading/Laning, Wave/Tempo, Vision, Macro, Positioning, Decision Making, Mental, Other), optional note, optional teammate tag.
- **Riot import:** one tap adds a recent synced Solo/Duo game from `account_matches`; no extra Riot call.
- **Privacy:** only the owner sees their blocks; nothing feeds team statistics. Editing and deleting games is allowed.
- **Dashboard:** win rate and most common mistake.

### G6. Champion window and Matchups (All Champions → a champion; `src/components/players/champion-detail.tsx`, `lane-parts.tsx`, `opponent-picker.tsx`; `src/domain/matchups.ts`, `src/server/players/matchups.ts`; `docs/MATCHUPS.md`)

- **Where:** a row of All Champions opens the champion window (the shared `DetailModal`) in the list's scope and the row's role. The URL holds it (`champion`, `crole`, `tab`, `vs`); the old `/overview/matchups` and `/players/[id]/matchups` redirect into it (`matchupsRedirect` in `src/lib/nav.ts`), keeping champion, opponent and filters. Matchups is no longer a profile section.
- **Roles & champion pools open the same window.** A pool card on a profile Overview (`ProfilePools` in `src/components/players/profile-pools.tsx`) opens it in that pool's role, through the same hook and component as All Champions (`useChampionWindow` / `ChampionWindow` in `src/components/players/champion-window.tsx`), with the same server data (`getPlayerMatchups`, loaded by `profile-sections.tsx` only when the address names a champion). On the Overview the champion's key is `champ` (`champion` is already the Overview's stats filter); `crole`, `tab` and `vs` are shared. There is one window and one data path, never a second champion popup.
- **Pool cards: inspect, drag, remove, add** (`SortablePool` with `onInspect`):
  - **Inspect:** the whole card is a link to the champion's window address (`pool-inspect`, `aria-haspopup="dialog"`, reached with Tab, opened with Enter or a tap). Once the page is interactive the window opens in place; a click that lands before that still works, because it loads the address and the server opens the window. The name underlines on hover.
  - **Drag:** a mouse drags from anywhere on the card, but only after it moves past the drag threshold. The click that ends a drag opens nothing. On touch screens only the grip drags, so a tap always inspects. The grip has its own keys: Space picks the card up, the arrows move it, Escape cancels.
  - **Remove** (×) and **Add** (the dashed slot) are separate buttons above the card's button.
  - **Art:** cards with figures show the champion's default splash behind them: a static, lazily loaded image at 55 % opacity (70 % on hover) under two dark gradients, so the labels stay readable. If the image fails it is hidden, and the card stays as it was.
- **Overview view:** the champion's figures (games, win rate, KDA, CS and damage per minute, mastery, proficiency), the lane against every opponent at 5, 10, 15 and 20 minutes, the opponents faced most, the latest games.
- **Matchups view:** one lane opponent at a time (searchable picker plus up to three shortcuts). It gives:
  - the record and win rate, with the sample size;
  - which account and which queue the games came from;
  - a gold, experience or CS chart per minute (average only where 3+ games reached the minute; hover, touch or arrow keys read one minute with its games), and the checkpoint table, each column with its number of games;
  - every game as the shared match card; a game replaces the window with the match window, whose Back returns to it.
- **Data:** `getPlayerMatchups(…, { exact: true, role })` reads the details and timelines of every lane game on the champion once, and returns the champion-wide lane (`lane`) and the chosen pairing (`detail`).
- **Defaults and access:**
  - All linked accounts by default (like All Champions); Refine chooses an account, the season and the game mode.
  - Same access as Match History, checked on the server.
- **Comparison with other players:** not built (no peer gold/XP/CS, band = sampling band, samples too small); see `docs/MATCHUPS.md`.
- **Timelines:**
  - The `timeline-backfill` job fetches them a few per tick, before ranked ingestion, capped at 25 s, newest first, stopping at the first refusal.
  - Frames are stored compactly in `match_timelines.frames` (migration `0036`).
  - Coverage by game age is in `data-audit` → `matchups`.
- **Alignment:** at exact timestamps, never by frame index. Pattern sentences need at least 5 games, and there are no grades or advice.

---

## SECTION H — UI AND DESIGN SYSTEM

### H1. Visual identity (`src/app/globals.css`, Tailwind v4 `@theme`)

- **Aesthetic:** dark navy "esports client" look. Restrained, card-based, cyan accent, no decorative animation.
- **Colour tokens:**

  | Group | Tokens |
  |---|---|
  | Backgrounds | `bg #080c24`, `bg-elevated #0c1130`, `surface #10163a`, `surface-2 #161e4a`, `surface-3 #1e295f` |
  | Borders | `border #222c5f`, `border-strong #34428c` |
  | Text | `fg #e8edfb`, `fg-muted #9aa8d4`, `fg-subtle #7b89b9` (4.5:1 on cards) |
  | Accent | `accent #1fc3ff`, `accent-strong #7fdcff`, `accent-2 #58a8f2`, `highlight #7fdcff` |
  | Sides | `blue #5f8ff5`, `red #e0566b` |
  | Status | `good #3fc98a`, `warn #e8b64a`, `bad #e0566b`, `info #58a8f2` |

  Branding can override the primary/secondary accent, background, surface and highlight. Overrides go through contrast checks (`brandThemeCss` in `src/domain/branding.ts`).
- **Typography:** Inter Variable; system monospace for numbers and IDs. Minimum readable sizes are enforced (10–11 px text was removed in Phase 4).
- **Radii:** `sm 4px`, `md 6px`, `lg 10px`; cards mostly use `rounded-2xl`.
- **Backgrounds:** the sign-in page uses `background`; the signed-in app uses `appBackground` at about 30 % opacity under a dark veil. Reduced-motion users get static frames.
- **Animation:** short transitions only (collapsible nav groups, dialogs), respecting `prefers-reduced-motion`.

### H2. Shared UI components

| Component | Path | Used on |
|---|---|---|
| Button, Input/Select/Textarea, Switch, Toggle chips, Badge, Avatar | `src/components/ui/*` | everywhere |
| Panel / PanelHeader / PanelBody, PageHeader, SubNav (tabs), Disclosure, MobileSection | `src/components/ui/*` | all pages |
| Dialog (`dialog.tsx`), ConfirmDialog, Toast notifications (`toast.tsx`) | `src/components/ui/*` | admin, profile, Team |
| **Menu** (portal-rendered, flips, keyboard; never clipped) | `src/components/ui/menu.tsx` | account menu, Riot account ⋯, Team lineup menu |
| InfoTip (ⓘ, hover/focus/tap), Metric, SaveStatus (autosave state), Skeleton, AutoRefresh | `src/components/ui/*` | profiles, admin |
| Champion grid / selector (search, Riot role filter), SortablePool | `src/components/champions/*` | profile editing, Welcome, Card Studio |
| ChampionPortrait, RoleIcon | `src/components/champion-portrait.tsx`, `role-icon.tsx` | everywhere |
| CardArtLayer, CustomiseCardButton, ProfileHeader, PlayerSummaryCard | `src/components/players/*` | Team, Players, profiles |
| Navigation: CollapsibleSidebar, NavGroupSection, AccountMenu, MobileNav | `src/components/*` | app shell |
| Class helpers `cn` / `withDefaults` (caller classes replace defaults; no class-merge library) | `src/lib/cn.ts` | components |
| **FilterBar / FilterField**, **SearchInput** | `src/components/ui/filter-bar.tsx`, `search-input.tsx` | Players, profile Overview / All Champions / Match History, Leaderboards, Matches (both tabs); SearchInput also on Admin → People and the skin search |
| Segmented (`segmentedGroupClass`, `segmentClass`, `RoleSegmented`), filter chips (`chipClass`), TabLinks | `src/components/ui/segmented.tsx`, `tab-links.tsx` | every filter and section switch |
| **DetailModal** (the one detail window), `AfterOpen` | `src/components/ui/detail-modal.tsx` | Team player window, Match History / Team Matches / champion window match details, Card Studio |

**Detail windows (one behaviour everywhere).** `DetailModal` is the site's only detail window: centred over the dimmed page on wider screens, the whole screen on phones (`compact` stays a card). Sizes by content: `compact`, `standard` (a player), `wide` (a match or a champion: a fixed height, so tabs never make it jump), `full`. Native modal `<dialog>`: focus trapped, Escape, the close button and the backdrop close it (with `canClose` for unsaved edits), focus returns to the element that opened it, the page behind does not scroll or shift. Motion: `modal-in` (180 ms fade and slight rise/scale) and `modal-out` (140 ms), none under reduced motion.
- *Performance rules* (measured in `docs/PERFORMANCE.md`, "Detail windows"): the backdrop dims and never blurs (a full-screen `backdrop-filter` was redrawn on every frame of the motion); heavy content waits for the window to be in place (`AfterOpen`, or `onSettled` for content the caller holds, about 120 ms after opening, at once under reduced motion) and renders as a transition; a list memoises its rows so opening one re-renders only the row it marks; Match History keeps the details it has loaded for the page it shows (`MatchDetailCache`, in memory, replaced with every new page of data, never stored in the browser) and starts loading on a mouse press.

**Filters, search, sort and tabs (one behaviour everywhere).**
- *Tabs* (TabLinks, underlined) switch between sections of a page: Matches, a profile, Leaderboard categories. They never filter.
- *Filters* live in a FilterBar. Search comes first and is never folded. From `md` up (Leaderboards: `lg`) the filters sit inline on one row; below it they fold behind one "Filters · what is chosen" button with a count of narrowed filters. Opened, each filter has a visible label; inline, the label is for screen readers and the control says what it holds ("All roles", "Any patch").
- One choice out of a few is a segmented group (role, game mode on Played together, member count); an on/off filter is a chip ("Main lineup only", "Bookmarked", "Archived and deactivated"); long lists are dropdowns. Role filters are always `RoleSegmented` (icon and name; inactive names hidden on phones).
- Choices apply at once and keep the other filters (no Apply button). "Reset" appears only when something is narrowed and restores every default.
- Heights: 36px with a mouse, 44px on touch screens, for fields, segmented groups and chips alike (the e2e spec `filter-consistency` checks this on every bar).
- Sort: column headings where there is a table (All Champions); a segmented "Rank by"/"Sort" group otherwise; phones get a Sort by dropdown when the headings are hidden.

### H3. Page-by-page overview

| Page | Route | Purpose and layout | Who can edit | Notes |
|---|---|---|---|---|
| Team | `/team` | 5 role cards (grid: 1 col phone → 5 cols at ≥ 1536 px), lineup menu, Customise on own card, empty-role suggestions | lineup: `manage-lineup`; pools: own or `manage-players` | Support empty in production |
| Players | `/players` | Directory cards (2/3/4 cols), search, role chips, Main lineup filter, show archived | `manage-players` for archive/group | |
| Player profile | `/players/[id]` (+ `/champions`, `/accounts`) | Hero header + tabs Overview / Champions & Roles / Riot Accounts | own or `manage-players` | Opening your own id redirects to `/overview` |
| My Profile | `/overview` (+ `/champions`, `/accounts`) | Same as above for yourself; statistics with filters | self | Accounts without a profile see "complete your profile" |
| Matches | `/matches` (`?view=encounters`) | Played together (with bookmarks) and Encounters | `view-matches` (+ `view-teammate-stats` for Played together); bookmark removal by its creator or `manage-matches` | |
| Clash Scout | `/clash`, `/clash/[id]` | Paste the two Clash scouting screenshots; five opponent cards (desktop: one row of five; phones: a swipe track), a detail window per player, Save scout, and the team's saved scouts (search, active/archived) | save: members; edit: creator or `manage-lineup`; archive: `manage-lineup`; delete: Owner | `docs/CLASH_SCOUT.md` |
| Solo Queue Blocks | `/blocks`, `/blocks/[id]`, `/blocks/history` | Current block, quick add, dashboard | owner only | |
| Settings | `/settings` | Username, password, profile picture, sign out | self | Riot accounts moved to the profile |
| Admin | `/admin/people` (+ `/access`), `/admin/data`, `/admin/branding`, `/admin/system` | People & Access, Riot Data, Branding, System Health | per capability | Owner switches via the account menu |
| Auth | `/login`, `/setup`, `/recover`, `/welcome` | Sign-in, first-run Owner setup, Owner recovery, onboarding | — | |

**Redirects kept for old links:**
- `/overview/blocks/*`, `/ranked/*` → `/blocks`
- `/settings/riot` → `/overview/accounts`
- `/admin/players`, `/admin/users` → `/admin/people`
- `/players/[id]/stats` → profile
- `/opponents` → `/matches`
- `/me` → own profile

**Known visual issues:**
- None open from the 14 Oct responsive pass (320–1920 px, short 1366×600).
- Champion art could not be checked against real Data Dragon images from the development container.

### H4. Responsive design (`docs/RESPONSIVE.md`)

- **Breakpoints** (Tailwind defaults):
  - < 640 phone: top bar + drawer + 3-tab bottom bar (Profile, Team, Matches; Team is marked on Players and Leaderboards too).
  - 640–767 large phone.
  - 768–1023 tablet: top bar + drawer, no tab bar.
  - ≥ 1024: collapsible sidebar (groups remembered in a cookie; Ctrl+\\ toggles).
- **Sidebar collapse and expand** (`src/components/collapsible-sidebar.tsx`):
  - **Control:** under the logo, in the icon column, so it is in the same place open or collapsed (test id `sidebar-toggle`; label "Collapse sidebar", "Open sidebar" or, while peeking, "Keep sidebar open"; Ctrl+\\ or ⌘\\ shown beside it).
  - **Motion:** a window with `overflow: clip` (`sidebar-window`) slides to move the visible edge, and the content inside it slides back by the same amount on the same curve, so it stays still while the edge passes. Both are transforms, so the compositor runs them. The edge clips the labels and the current page's highlight in every frame. The page takes its new width at once, under the opaque panel.
  - **Why `clip`, not `hidden`:** focus or `scrollIntoView` can scroll an `overflow: hidden` box, which would shift the content sideways under the edge.
  - **The bug this replaced:** the old clip switched 220 ms after the slide began. While collapsing, the current entry's highlight and the fading labels stood out over the page in that time; on Team it showed as a band across the page.
  - **Tests:** `e2e/sidebar-motion.spec.ts` freezes the transitions frame by frame on five pages. It also checks the control's position, keyboard use, rapid toggles and reduced motion.
- **Leaderboards Highlights tiles** (`HighlightsGrid` in `src/components/leaderboards/leaderboards.tsx`):
  - **Order:** every tile reads the same way, in rows of its own: (1) the statistic, in full; (2) the leader's identity section, like the top of their player card (their artwork as a restrained static crop opening up to the right, the avatar ringed in their colour, crown, name, role and rank; the tile's top edge in their colour); (3) the winning value in their colour and its sample; (4) your place ("You · 3rd of 7", or "You: not ranked") and the runner-up.
  - **Board rows** (from tablets up) carry a faded crop of the player's own artwork behind the value end, never a full card per row; the podium keeps the top three on their artwork.
  - **Alignment:** the rows line up across tiles side by side (CSS subgrid), so a statistic name that wraps moves that line's leaders down together instead of overlapping them.
  - **Grid:** as many 16.5rem tiles as fit (`repeat(auto-fill, minmax(min(100%, 16.5rem), 1fr))`): five at 1920, four at 1440, three at 1366, one on phones.
  - **Category rail:** the statistic gets the full width; the leader and a compact "You · 2nd" share the line below it.
- **Team navigation:** the sidebar has one Team entry (`NavHub` in `src/lib/nav.ts`): it opens Team Overview and stays marked on every Team section and on pages inside them (a teammate's profile). **Clash Scout** is not one of them: it is its own entry right below Team (`CLASH_SCOUT`, in Player View and Admin Mode, the phone menu, and the phone tab bar as Clash), a separate workspace for scouting opponents, with its own page header and no Team tabs. The sections are tabs at the top of each Team page, in this order: Overview, Players, Leaderboards, Matches (`SectionTabs` in `src/components/section-tabs.tsx`, rendered by the app shell on those four addresses only, filtered by the same permissions as before; Admin Mode uses `ADMIN_TEAM_SECTIONS`). Every section keeps its own address, so direct links, Back and Forward work. Team Overview stays the team's home page (its header with the logo and the five lineup cards); the other sections name the team at the right end of the bar instead of repeating the header. Phones scroll the bar sideways with a fading edge. Pages inside a section (a profile, a match) have no tabs.
- **Team Overview as the team's home** (`TeamRoster`, `src/components/team/team-roster.tsx`):
  - **Five across, centred** (content ≥ 64rem, which covers 1366 and 1440 laptops with the sidebar open): one row of equal portrait cards, capped at 84rem and centred, with the header sharing that width (`LINEUP_WIDTH`). The rem scales with very large screens (`html` font-size clamp), so the whole lineup scales with them rather than stretching. Artwork height `clamp(13rem, 29vh, 20rem)`, queried on the named `lineup` container.
  - **Vertical centring (desktop, October 2026):** the header and the cards are one composition, centred in the window: the frame (`lineup-frame`) takes the height left under the section tabs (on this page only, `main` and the page wrapper are flex columns: `lg:has-[[data-testid=lineup-frame]]:flex`) and centres its content (flex, no absolute positioning), so there is as much room above the header as below the cards and the header stays right above them (checked at 1440 × 900 and 1920 × 1080). On a shorter window the content is taller than that minimum, starts at the top and scrolls. The floor's light is clipped at the frame (`overflow-y-clip`) so it never adds a scroll.
  - **Narrow cards** (under 15rem, e.g. 1366 with the sidebar open): each card is a `card` container, and `CardIdentity` / `CardPerformance` switch on `@max-[15rem]/card:` only there (the avatar above the name, rank and role chip wrapping, tighter labels, the pool count without the word "champions"). Other places that use these components have no `card` container and are unaffected.
  - **The floor** (`lineup-stage-floor`, `aria-hidden`, absolutely placed under the cards): lit from just under them in the team's colour and carrying the team's name faintly (or the logo when one is set). It is decoration only and never sizes a card or the page.
  - **Long names** take a second line on the cards (`CardIdentity wrapName`) instead of being cut.
  - **Unchanged:** 2 + 2 + 1 and 3 + 2 between 36 and 64rem (tablets) and the phone track.
  - **Background visibility** (team branding: `Branding.backdropLevel`, 0–100, default 50; `src/lib/backdrop.ts`): how much of the app background shows behind **every page** (October 2026; before, only Team Overview), the same for every member.
    - **Where it is set:** Admin → Branding → "Background visibility" (`BackdropSetting` in `src/components/settings/branding-panel.tsx`), shown once an app background is uploaded. The slider is part of the branding form: Save branding applies it for everyone, Cancel changes discards it, "Reset to default" sets 50% (saved with the next Save), and "Reset to UNIIVERSE defaults" resets it with the names and colours.
    - **Live preview:** while the slider moves, the branding page's own backdrop shows the level (a `<style>` only that page renders, after the shell's, so it wins). Nobody else sees an unsaved value.
    - **Storage and permissions:** saved with the rest of the branding in `app_settings` (key `branding`, JSON; no migration) by `saveBrandingAction`, which requires `manage-branding` (owner only) on the server. `parseBranding` keeps it a whole number from 0 to 100 and falls back to 50.
    - **Rendering:** the app shell renders `backdropCss(level)` with every page (no flash) inside the backdrop: `--backdrop-art` (artwork opacity 0.5–1), `--backdrop-veil` (a flat veil in the page colour, 0.88–0.36) and `--backdrop-vignette` (0.6–0.25), plus a light fixed gradient at the bottom. What reaches the eye is about art × (1 − veil): 6% at 0, 29% at 50, 64% at 100 (`backdropVisibility`; the top keeps a veil so text sitting directly on bright artwork stays readable). Why it was too dark before: the level reached only Team Overview; every other page used 0.3 art under a 70–90% gradient veil (about 6%), and even 100% kept half of that veil plus an 85% vignette (about 35% at best, darker at the edges). Cards, panels and player-card art keep their own surfaces and images. Branding is cached per server instance for up to a minute, so another instance can show the previous value for that long.
    - **Earlier per-browser preference removed:** the Appearance popover and its cookie `uniiverse_team_backdrop` are gone; the cookie is no longer read, so an old value changes nothing.
    - Demo: the screenshot fixture draws an artwork (`src/server/demo/backdrop-art.ts`).
  - **Tests:** `e2e/home-layout.spec.ts` (1366 × 768 with the sidebar open, 1920, 2560), `e2e/team-layout.spec.ts`, `e2e/team-backdrop.spec.ts` (admin preview, Cancel, Save, a second team-member account before and after signing in again, an old cookie ignored, no access for a member, Reset to default, every page at the same level), `tests/db/branding-backdrop.test.ts` (stored server-side, the same for every viewer, refused without `manage-branding`, range, reset), `src/lib/backdrop.test.ts`.
- **Profile Overview, compact** (`ProfileOverviewTab`):
  - **Order:** season figures, rank and form, then the primary pool, which starts within the first screen at 1440 × 900.
  - **Season summary:** the season's completeness and last update sit on the scope line.
  - **Ranked progress:** one short row, with the current rank and rank changes beside a chart drawn at its own proportions.
  - **Pools heading:** one line, with how editing works and the save state beside Add champion.
  - **Pool cards:** even rows (`poolColumns`: six as 3 + 3, or 6 across on wide screens).
  - **Off roles:** one-line summaries (`PoolSection collapsible`, test ids `<pool>-preview`, `<pool>-expand`) whose portraits still open the champion window. "Show and edit" opens the full pool with adding, removing and reordering.
  - **Tests:** `e2e/home-layout.spec.ts`.
- **Team navigation:** the sidebar has one Team entry; its sections (`TEAM_SECTIONS`) are tabs at the top of each of its pages. One component draws the tab bars: `SECTION_HUBS` in `src/lib/nav.ts` lists each entry that stands for several pages (key, accessible label, sections, optional Admin Mode sections), and `currentTab` uses it so a section without its own phone tab marks its entry's first tabbed section. Player View has no collapsible groups; the closable groups are Admin Mode's People and Site.
- **Touch and inputs:** 44 px touch targets on phones and coarse pointers; 16 px inputs on phones (no iOS zoom).
- **Constraints:** no horizontal page scroll at any width (checked by Playwright on phone/tablet/desktop and a 9-width manual pass on 14 Oct). Wide tables become cards on phones.
- **Known limitations:**
  - Some admin tables scroll horizontally inside their panel.

### H5. Branding (Admin → Branding; `src/domain/branding.ts`, `src/server/repositories/branding.ts`, `/api/branding/*`)

- **Text:** team name, short name, optional tagline (hidden when empty).
- **Images:** logo, **Sign-in background** and **App background** (separate since migration 0019).
  - PNG/JPEG/WebP/GIF up to **20 MB**, uploaded in 3.5 MB pieces (`/api/branding/upload`, Vercel's 4.5 MB request limit) and stored in Postgres.
  - GIFs keep their animation; a still frame (`<kind>-static`) is generated for favicons, reduced motion and the backdrop.
  - Served with versioned immutable URLs and a sandboxing CSP.
- **Colours:** five colours, each checked for WCAG contrast before it is applied.

---

## SECTION I — PERFORMANCE

### I1. Architecture

- **Caching:**
  - Per-instance TTL cache (`src/server/observability/cache.ts`) for champions, patch, branding, team, formats, pro patterns, shell facts and skins (10 min), invalidated by writers.
  - React `cache()` for the session and user per request.
  - The statistics description is cached per instance for a minute and dropped when the stats version changes.
- **Database:** single-digit-millisecond queries Sydney→Sydney. No pipelining through the pooler. Parallel reads only where measured safe; pool max 5.
- **Background work:** all Riot calls run in jobs or in background refreshes after visits; page rendering never waits on Riot.
- **Client:** server components by default; client components for editors, menus and dialogs.
- **Images:** champion art via Data Dragon CDN with width/height, lazy loading and async decoding. Branding images come from versioned URLs with CDN caching.

### I2. Measurements

`perf-probe` job inside the production function, **14 Oct 2026 11:07 UTC, commit `f373ba0`, syd1** (cold → warm):

| Step | ms |
|---|---|
| database ping | 2.9 → 1.5 |
| session lookup / user | 6 → 3.4 / 14 → 9.4 |
| champions list (173) | 10 → 0.1 |
| players / lineup | 18 / 14 |
| **statistics provider** (removed with Draft and Meta & Trends) | **1,143 cold → 10.5 warm** (1,604 effective games) |
| Data health | 87 → 74 |
| **Team roster (cards + tags)** | **322 → 163** |
| player overview | 41 → 50 |
| `/api/health` (server) | ~263 total incl. job status |
| Public `/login` TTFB from GitHub (US) | 1.04 s (incl. ~0.3 s network); private routes redirect in 0.05–0.17 s |

**Data-sufficiency scenarios** (in memory): 2–234 ms per recommendation.

**Locally with five 30-champion pools:** about 1 s.

### I3. Known bottlenecks

- **Measured:**
  - The cold statistics provider load (≈ 1.1 s on the first request after a deploy or cold start, rising with data volume).
  - The cold Team roster (322 ms).
- The statistics provider and the global collection behind it were removed (Draft, then Meta & Trends), so the first bottleneck no longer exists.

---

## SECTION J — TESTING AND QUALITY ASSURANCE

### J1. Existing tests (all passing on 14 Oct 2026, local runs)

| Suite | Command | Count |
|---|---|---|
| Unit + database on PGlite (Vitest) | `pnpm test` | 88 files, **484 tests** |
| Database on real PostgreSQL | `TEST_DATABASE_URL=postgres://… pnpm vitest run tests/db` | 31 files, **218 tests** |
| Browser (Playwright + axe) | `pnpm build && pnpm test:e2e` | **58 passed, 20 skipped** (the skipped ones are phone/tablet-only cases in other projects) |
| Typecheck / lint | `pnpm typecheck`, `pnpm lint` | clean |

- **CI:** `.github/workflows/ci.yml` runs all of the above on pull requests and pushes to `main` (the database suite on PostgreSQL only).
- **Recent CI history:**
  - Runs 94, 97 and 98 failed on an accessibility assertion (low-contrast text on Team cards), fixed in `f373ba0`.
  - Run 102 (`562fe24`) failed on a second one (the Team-card pool list scrolls without keyboard access on CI's fonts), fixed in `0f48361`.
  - Both pass locally. The CI result for the newest commit is reported in the session summary.

### J2. Coverage

**Well covered:**
- proficiency (including role-specific);
- statistics filtering;
- permissions and access groups;
- authentication (sessions, temporary passwords, recovery, throttle);
- migrations (applied in order, data-preserving checks);
- Main/Alt accounts;
- jobs and scheduler;
- branding uploads;
- team tags and roster;
- Solo Queue Blocks privacy;
- responsive layout (no horizontal overflow on phone/tablet/desktop);
- accessibility (axe: no critical/serious violations on player and admin pages).

**Important untested workflows:**
- Signed-in production use: no automated or manual signed-in run against the live site.
- Real Riot responses: tests use fakes, so live behaviour is only seen through jobs.
- Real Data Dragon images: the container cannot reach them.

### J3. Production verification (what was actually checked, 14 Oct 2026)

| Check | Result | Method |
|---|---|---|
| Build and deploy | ✅ Vercel deployed each commit; `/api/health` reported the commit | smoke workflow, job responses |
| Public pages | ✅ `/login` 200; private routes 307 to `/login`; `/api/jobs/tick` 401 without the secret | smoke workflow |
| Migrations 0000–0020 applied; Owner intact | ✅ | `auth-audit` job |
| Data jobs healthy | ✅ no failures in 7 days (but see the discovery stall) | `/api/health`, job history |
| Linked accounts synced | ✅ 13/13 resolved and synced within the hour | `data-audit` |
| Performance | ✅ see I2 | `perf-probe` |
| Ranked discovery fix | ✅ first run after `562fe24`: 40 players scanned, 840 match ids queued; the next ingest stored 619 new games | `ranked-discover`, `ranked-ingest` jobs |
| Authenticated UI | ❌ **not tested** in production | — |
| Skins collected in production | ✅ 3,198 champion skins stored (11:22 UTC) | `version-check` job (`skinsUpserted`) |

---

## SECTION K — KNOWN ISSUES AND TECHNICAL DEBT

| # | Issue | Area | Severity | User impact | Evidence | Likely cause | Recommended approach | Status |
|---|---|---|---|---|---|---|---|---|
| 1 | Global ranked collection stalled for ~4 h | Data pipeline | **High** | Statistics stop growing; Trends go stale | 2,321 games at 08:00 and 11:11 UTC; discovery visit runs averaged 39.3 s against a 40 s cap; ~253 players ever scanned | Ladder refreshes used the whole discovery budget | Fixed in `562fe24` (refresh share capped at 50 %) | Closed (Oct 2026): the global collection was removed with Meta & Trends |
| 2 | Dead platforms PH2 / TH2 are retried first every run | Data pipeline | Medium | Wasted time each discovery run | `ph2`/`th2` "fetch failed" in every run; never refreshed, so always "stalest" | Riot merged them into SG2; the registry still lists them under `RIOT_PLATFORMS=all` | Remove `ph2`/`th2` from the platform registry, or back off platforms that keep failing | Closed (Oct 2026): only the removed ladder discovery visited every platform |
| 3 | GitHub hourly schedule unreliable | Automation | Medium | Data refreshes depend on visits | No `http` ticks 07:15–11:00 UTC on 14 Oct; earlier audit showed irregular delivery | GitHub cron is best-effort | Set up Supabase `pg_cron` every 10 min (`docs/DEPLOYMENT.md` §4c; one secret typed into Supabase's SQL editor) | **Open (user action)**; whether done: UNKNOWN |
| 5 | Region skew (OCE 66 %), Emerald under-sampled | Data | Low–Medium | Mostly OCE-flavoured meta | data-audit | Early OCE-only collection; SEA host carries only OCE | Fair-share rules exist; volume will dilute | Closed (Oct 2026): removed with Meta & Trends |
| 6 | No Support player in the lineup | Team setup | Medium | The Support card is empty | Team card empty | Roster | Owner assigns a Support player on Team | **Open (user action)** |
| 7 | 4 accounts with setup pending | Accounts | Low | Those players have no full profile yet | auth-audit | Players have not signed in | Remind players | Open (user action) |
| 8 | `/api/health` "ok" did not reveal the stall | Monitoring | Medium | Silent data staleness | Issue 1 | Health checks job success, not data growth | Add a "no new ranked games in N hours" warning | Closed (Oct 2026): the global collection it concerned was removed |
| 9 | Authenticated production UI never walked through | QA | Medium | Unknown live-only issues | — | No test account for the developer | Owner runs `docs/LIVE_VALIDATION.md` §15 | Open |
| 10 | Unused schema leftovers (`primary_pool_limit`, `secondary_pool_limit`, `users.draft_lead`, `invites`, `activation_codes`) and the removed Draft feature's tables and `teams.engine_config` | Database | Low | None | schema | History | Draft tables: approval-gated cleanup migration (backup first); the rest: leave, or drop in a careful later migration | Accepted debt |
| 11 | Two pool tables (`player_champion_pools` + `player_role_pools`) | Database | Low | None (helpers hide it) | schema | Additional roles added later | Always use the roster helpers | Accepted debt |
| 12 | Cold statistics load ≈ 1.1 s (the Draft engine's provider) | Performance | — | Gone with Draft | perf-probe | — | — | Closed (Oct 2026) |

---

## SECTION L — DEVELOPMENT HISTORY

**Before the phases (1–13 Oct):**
- **Initial build:** engine, data pipelines, draft room, playbook, matches, branding.
- **Production-readiness, performance and responsive audits.**
- **Account changes:** email removed in favour of usernames; an Owner lockout was fixed, with a recovery path added.
- **Riot data:** global regions added.
- **Ranked Improvement journal** (now Solo Queue Blocks).

**Phases** (each with a brief from the user and a final report; claims re-checked on 14 Oct):

| Phase | Requested | Implemented | Verified | Remaining |
|---|---|---|---|---|
| **1** (13 Oct) Accounts, security, onboarding | Admin-created accounts, simple permissions, mandatory onboarding, draft ownership; follow-up: replace passwordless sign-in | Admin accounts with Riot verification; temporary passwords (activation codes retired); Welcome setup; Owner vs player permissions; the creator controls a draft; Team Leader role removed | Tests; production auth-audit | — |
| **2** (14 Oct) Riot data & draft intelligence | All queues, mastery, multi-account, season stats, game-mode filters, engine audit, modes, scouting, emergency picks, match edit/delete, one-screen playbook | All of it; Ranked 5s vs Flex separated; data-audit and engine-probe jobs | Tests; production data jobs | — |
| **3** UI modernisation & QoL | New shell, configurable permissions, account self-service, Riot ID changes, inline editing with autosave, admin organisation, branding uploads, draft setup and room | All of it | Tests; local screenshots | — |
| **4** Data sufficiency, autonomous updates, seasons, QA, UX | Data audit, no manual data runs, patch/season automation, account sync priorities, previous-season viewing, simplified access levels, password capital-letter rule, Team suggestions, Players filters, Solo Queue Blocks access, Trends integrity, 20 MB GIFs | All implemented; prior weights tuned from the leave-one-out test | Production audits; tests | **Autonomous collection proved unreliable** (issues 1–3, 8): the visit fallback starved discovery until 14 Oct, and the GitHub schedule is best-effort. Emerald share is still below the 15–20 % target. |
| **5** Profiles, statistics, advanced drafting | Unified profiles, extra roles, uncapped pools, per-game stats, strength tags, splash art, Solo Queue Blocks refresh, unfinished drafts, Fearless, enemy rosters per game, collapsible sidebar | All of it | Tests; production probe | Older-game K/D/A back-fill still in progress |
| **9** (14 Oct) UX, navigation and player experience | Grouped sidebar (Team, Meta & Trends, My Profile), profile sub-navigation, pools on Overview, All Champions, Team cards without tags, Solo Queue Blocks 0 / 1 model and unified focus, Match History lineups with names and Build tab, shared tooltip, "Bottom" / "Off Roles" wording | All of it (migrations 0027–0028, both additive) | Unit, Postgres and Playwright tests; local screenshots; production checks listed in the Phase 9 report | Build order needs a Riot key in production and appears per match the first time it is opened; full rune pages only for games stored from Phase 9 on |
| **6** (14 Oct) Navigation, identity, UI refinement | Grouped nav and account menu, NEW badges removed, Team tags and full pools, shared card identity, skins, profile tabs, statistics scope, multi-role champions, Main/Alt accounts, Trends top 10, separate backgrounds, People & Access with access groups, clearer admin names, responsive QA | All of it (migrations 0017–0020) | Tests; production auth-audit, perf-probe | Authenticated production walk-through; skins fill in over the next hourly version checks |

**October 2026:** the Draft feature (engine, Draft Room, scouting, series, Playbook, drafted-match archive, opponents) was removed at the user's request; see Section F.

**Important architectural decisions:**
- Proficiency describes experience; it never changes the pools.
- Background work runs through one scheduler with atomic job claims.
- Images are stored in Postgres (no paid storage).
- Every permission is checked on the server.
- Migrations are embedded and applied at start-up.

---

## SECTION M — FUTURE DEVELOPMENT

| Item | State |
|---|---|
| Unified player profiles | **Implemented** (Phase 5, refined in Phase 6) |
| Additional player roles (up to 3) | **Implemented** |
| Unlimited champion pools | **Implemented** (≤ 250 per role technical cap) |
| Player strength tags | **Removed** in Phase 9 at the user's request |
| Featured champion splash backgrounds and skins | **Implemented**; 3,198 skins collected in production (14 Oct) |
| Expanded performance statistics (KDA, CS, damage, vision) | **Implemented**; K/D/A back-fill for older games is **partial** |
| Solo Queue Blocks redesign | **Implemented** (own page since Phase 6) |
| Sidebar collapsing | **Implemented** |
| Draft (and with it unfinished drafts, Fearless, opponent rosters) | **Removed** (Oct 2026, at the user's request) |
| Reliable 10-minute scheduling (`pg_cron`) | **Requested / recommended; not confirmed set up** (user action) |
| Remove dead platforms PH2/TH2 from collection | **Not started** (recommended) |
| Data-staleness warning in health | **Not started** (recommended) |
| Higher Emerald share (15–20 %) | **Dropped** (Meta & Trends removed, Oct 2026) |
| Live validation of Phase 6 by a signed-in user | **Not started** (user action, checklist ready) |
| **Abandoned / rejected — do not propose again** | Activation-code sign-in as the normal method; Team Leader / Draft Lead role; invitation links; email-based login; "Remember this device"; an opponent database or opponent-editing UI in the Draft Room; true realtime collaboration with controller hand-off or presence; "NEW" champion badges; Draft History as a separate list; pool size limits; showing mastery level next to mastery points; a win-probability figure (not supported by the data) |

---

## SECTION N — PRODUCT DECISIONS AND PREFERENCES (from the user's own briefs)

- **Simplicity first:**
  - "Do not add complexity merely because it is technically possible."
  - Keep interfaces simple, understandable and fast.
  - Give the user one simple manual instruction at a time; the user is not a developer.
- **Player-defined pools are law:** nothing worked out from games changes them.
- **Draft is gone for good:** it was removed in October 2026. Do not reintroduce it, hide it behind a flag, archive it in the codebase or replace it with a placeholder or "Coming soon" page.
- **Admin is separate:** players never see Admin; Owners switch into it. Accounts, passwords and permissions stay with Owners.
- **Visual quality:** polished but not flashy. No decorative animation, no tiny text, no layout shifts, menus must never clip.
- **Easy statistics:** labelled, with sample sizes shown, nothing fabricated; partial data is marked as partial.
- **Data refreshes automatically,** with no routine manual runs.
- **Normal users need no technical knowledge,** and routine account changes need no admin.
- **Solo Queue Blocks stay lightweight and private.**
- **Security and safety rules:**
  - Never expose or log secrets.
  - Never ask the user to paste secrets into chat (tell them where to enter them).
  - Never reset Supabase or recreate the project.
  - Never lock the Owner out.
  - Never let players escalate privileges.
  - Use only safe, data-preserving migrations.
  - Never claim production verification that was not performed.
  - Do not introduce paid infrastructure without approval.

---

## SECTION O — GUIDANCE FOR FUTURE AI PROMPTS

### Areas that should not be rebuilt
These are stable and working; extend them instead:
- the proficiency model;
- the scheduler and job registry;
- the Riot client and rate limiter;
- account sync;
- authentication and sessions;
- permissions and access groups;
- the migration system;
- the shared UI primitives (`src/components/ui`), including `Menu` and `Dialog`.

### Areas requiring caution

| Area | Why |
|---|---|
| Authentication / Owner | A past change locked the Owner out (email → username). Always keep `guardLastAdmin`, recovery via `UNIIVERSE_ACCESS_PASSWORD`, and the auth-audit job. |
| Permissions | Server checks in every action; groups must never grant `manage-users`; nobody edits their own access. |
| Migrations | Additive or data-preserving only; update the four expected-migration lists in tests; run the DB tests on real Postgres. |
| Riot API quotas | Per-host limits; never add synchronous Riot calls to page rendering; respect PUUID-per-key encryption. |
| Lineup eligibility | Pools per role and role eligibility decide who is offered for each lineup role. |
| Profile relationships | One profile per user (unique `users.player_id`); one Main Riot account per player (unique index); dedupe across accounts. |

### Recommended workflow
1. **Inspect** the current code and production (read-only jobs: `auth-audit`, `data-audit`, `perf-probe`).
2. **Plan** in stages and **implement** small, tested checkpoints.
3. **Test:** `pnpm typecheck && pnpm lint && pnpm test`, the DB tests on Postgres, `pnpm build && pnpm test:e2e`.
4. **Commit and push** to `main`; Vercel deploys automatically.
5. **Verify:** check `/api/health` (via the smoke workflow) for the commit, run the relevant data jobs, and report honestly what was and was not verified.

### Common mistakes to avoid
- Saying data is "synced" when only the Riot ID was verified.
- Treating job "ok" as proof that data is flowing (issue 8).
- Showing confident numbers from tiny samples. Always shrink and show the sample size.
- Counting a game twice across a player's accounts, or counting jungle games as top games because the champion sits in the top pool.
- Duplicating player profiles or Riot accounts.
- Breaking the one-Main rule.
- Building a second version of an existing component (selector, menu, dialog, card) instead of reusing it.
- Overloading pages with options.
- Calling Riot synchronously while rendering.
- Changing one system without updating its tests, and the expected-migration lists.
- Reintroducing retired ideas (Section M).

### Key source files

| Feature | Important files | Depends on | Tests |
|---|---|---|---|
| Navigation | `src/lib/nav.ts`, `src/components/nav-links.tsx`, `collapsible-sidebar.tsx`, `account-menu.tsx`, `mobile-nav.tsx`, `app-shell.tsx` | permissions | `e2e/responsive.spec.ts` |
| Team page | `src/components/team/team-roster.tsx`, `src/server/team/roster.ts`, `team-advice.ts` | proficiency, overview | `tests/db/team-cards.test.ts`, `team-overview.test.ts` |
| Profiles and statistics | `src/components/players/profile-sections.tsx`, `player-overview.tsx`, `overview-filters.tsx`, `src/server/players/overview.ts`, `season-games.ts`, `src/domain/season-stats.ts` | account_matches | `tests/db/player-overview.test.ts`, `profile-performance.test.ts`, `src/domain/stats-filter.test.ts` |
| Champion pools | `src/components/profile/profile-editor.tsx`, `use-profile-autosave.ts`, `src/components/champions/*`, `src/server/actions/players.ts`, `src/domain/roster/*` | champions | `tests/db/players.test.ts`, `src/domain/roster/*.test.ts` |
| Card identity and skins | `src/domain/player-card.ts`, `src/components/players/card-art.tsx`, `customise-card.tsx`, `src/server/repositories/skins.ts`, `src/server/riot/static/sync.ts` | Data Dragon | `src/domain/player-card.test.ts`, `tests/db/static-sync.test.ts` |
| Riot accounts | `src/server/accounts/*`, `src/components/team/riot-accounts-panel.tsx`, `src/server/actions/accounts.ts` | Riot client | `tests/db/accounts.test.ts`, `main-accounts.test.ts`, `riot-credential.test.ts` |
| Auth and permissions | `src/server/auth/*`, `src/server/repositories/users.ts`, `permissions.ts`, `src/server/actions/users.ts`, `src/components/admin/people-panel.tsx`, `access-dialog.tsx` | — | `src/server/auth/*.test.ts`, `tests/db/auth-*.test.ts`, `phase3-accounts.test.ts`, `users.test.ts`, `recovery.test.ts` |
| Team Matches | `src/server/matches/*`, `src/app/(app)/matches`, `src/components/matches/*` | account history, match details | `tests/db/played-together.test.ts`, `match-links.test.ts`, `encounters.test.ts` |
| Data pipelines and jobs | `src/server/jobs/*`, `src/server/accounts/*`, `src/server/riot/static/*` | Riot, Data Dragon | `tests/db/jobs.test.ts`, `automation.test.ts`, `static-sync.test.ts` |
| Branding | `src/domain/branding.ts`, `src/server/repositories/branding.ts`, `src/components/settings/branding-panel.tsx`, `src/app/api/branding/*` | — | `tests/db/branding.test.ts`, `src/domain/branding.test.ts` |
| Solo Queue Blocks | `src/domain/ranked-improvement.ts`, `src/server/actions/ranked.ts`, `src/components/ranked/*`, `src/app/(app)/blocks` | account_matches | `tests/db/ranked-improvement.test.ts` |
| Health and diagnostics | `src/app/api/health/route.ts`, `src/domain/data-health.ts`, `system-health.ts`, `src/server/ops/*`, `src/server/jobs/*-probe.ts`, `*-audit.ts` | — | `src/domain/*health*.test.ts` |

---

## SECTION P — READ THIS FIRST — CONTEXT FOR CHATGPT

1. **What UNIIVERSE is.** A private web app for one amateur League of Legends team (~10 players + an Owner). It brings together *this team's* players, their self-chosen champion pools per role and their own Riot history: a Team page with the lineup, player profiles with statistics, Leaderboards, Team Matches (games played together), and a private Solo Queue improvement journal. (The Draft feature, with its recommendation engine, was removed in October 2026.)

2. **Current production version.** https://team-uniiverse.vercel.app, deployed automatically from `main` (Vercel `syd1`, Supabase Postgres). On 14 Oct 2026 production ran commit `562fe24` (the jobs reported it from 11:16 UTC), with migrations 0000–0020 applied. Commit `0f48361` (a Team-card accessibility fix) and this documentation commit followed and deploy automatically.

3. **Technology stack.**
   - Next.js 16 App Router + React 19 + TypeScript, Tailwind v4.
   - Drizzle ORM on Postgres (PGlite for demo and tests).
   - Custom username/password auth (scrypt, 24-hour database sessions).
   - Vitest + Playwright.
   - Background jobs through an in-app scheduler hit by GitHub Actions (hourly), Vercel cron (daily) and site visits.

4. **Main functional areas.**
   - **Team:** five lineup cards with full pools and per-champion statistics for the assigned role.
   - **Players** and **profiles** (Overview / Champions & Roles / Riot Accounts).
   - **Matches:** Played together (with bookmarks) and Encounters.
   - **Solo Queue Blocks:** private journal.
   - **Settings.**
   - **Admin:** People & Access, Riot Data, Branding, System Health.

5. **Removed: Draft.** The draft setup, Draft Room, engine, scouting, series, Playbook and drafted-match archive are gone. Their tables stay in the database until an approval-gated cleanup migration.
   **Removed: Meta & Trends** (19 Oct 2026). Solo Queue Meta, Duo Synergies, Pro Play and the global ranked, professional and aggregation jobs are gone; their tables also stay until an approval-gated cleanup.

6. **Current Riot data status** (14 Oct):
   - **Player accounts:** 13 linked and fully synced.
   - **Open issues:** dead PH2/TH2 platforms waste time each run; the hourly GitHub schedule is unreliable (Supabase `pg_cron` recommended).

7. **Account / permission model.**
   - **Owner (one account, Admin Mode only):** everything, including accounts, passwords, permissions and site settings (never delegable).
   - **Everyone else:** team membership (team member or personal use), one base level (Standard Player / Team Manager / Restricted Player / custom levels / Custom ticks) plus optional additional groups (Team Lineup Manager, Match Manager, Player Manager). None opens Admin Mode. All enforced on the server.
   - **Accounts:** created only by the Owner with a Riot-verified Riot ID and a 7-day temporary password; mandatory first-login setup.
   - **Never:** email, invitations, self sign-up.

8. **UI architecture.**
   - **Server components** with client islands (editors, menus, dialogs).
   - **Shell:** dark navy theme with a cyan accent; Inter; tokens in `src/app/globals.css`.
   - **Navigation:** collapsible sidebar (My Profile, one Team entry, Clash Scout); the sections of Team as tabs at the top of its pages (`SectionTabs`, `SECTION_HUBS`, `TEAM_SECTIONS`); account menu; phone tab bar (Profile, Team, Matches, Clash).
   - **Shared primitives** in `src/components/ui` (Menu never clips, Dialog, Toast, InfoTip).
   - **One card identity** (featured champion art + skin + accent) across Team, Players and profiles.

9. **Known problems.**
   - Region skew.
   - Support slot empty.
   - 4 accounts with setup pending.
   - Health "ok" can hide data staleness.
   - Signed-in production pages never walked through by the developer.
   - Dead platforms PH2/TH2.
   - The GitHub schedule is unreliable.

10. **Planned next work** (recommended):
    1. Confirm collection keeps flowing for a day.
    2. Drop PH2/TH2.
    3. Add a data-staleness warning.
    4. Set up `pg_cron` (user action).
    5. Owner: assign a Support player and run the live checklist (`docs/LIVE_VALIDATION.md` §15).
    6. Then continue UX work as the user requests.

11. **Critical constraints.**
    - Preserve data; use safe migrations; never reset Supabase or recreate the project.
    - Never lock out the Owner.
    - Never expose secrets or ask for them in chat.
    - Permission changes must hit real server checks.
    - No privilege escalation.
    - No synchronous Riot calls while rendering.
    - Do not reintroduce retired ideas (activation codes, Team Leader, invitations, NEW badges, realtime hand-off…).
    - Do not claim production verification that was not done.
    - No paid infrastructure without approval.
    - The user is not a developer: one plain instruction at a time.

12. **Recommended workflow for Claude Code prompts.**
    - Inspect (code plus read-only production jobs) → plan stages → implement small tested checkpoints → `pnpm typecheck && pnpm lint && pnpm test`, the DB tests on Postgres, `pnpm build && pnpm test:e2e` → push to `main` (auto-deploy) → verify with the smoke workflow and data jobs → report honestly.
    - Point Claude to the files in Section O's lookup table, and ask it to update the matching tests and docs (`README.md`, `docs/ARCHITECTURE.md`, `docs/LIVE_VALIDATION.md`).
