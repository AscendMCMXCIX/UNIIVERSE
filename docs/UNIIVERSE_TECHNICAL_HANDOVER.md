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
  3. If it creates a table, a view, a function or a serial column, add the grants block from `docs/DATABASE_PERMISSIONS.md` ("How a new table gets its grants") to the same file. Nothing may rely on Supabase's automatic grants, which stop on 30 October 2026; `pnpm verify` checks it.
  4. Run `pnpm exec tsx scripts/embed-migrations.ts`.
  5. Update the expected-migration lists in `tests/db/migrate.test.ts`, `branding.test.ts`, `auth-phase1.test.ts` and `main-accounts.test.ts`.
  6. Migrations must be additive or data-preserving. The project rule is "preserve existing data, use safe migrations".
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
| Riot accounts | `riot_accounts` | `puuid` unique; (platform, game name, tag) unique. `label` is `main` \| `alt`, and the partial unique index `riot_accounts_one_main_idx` allows **one Main per player** (migration 0018). Sync state: `sync_status`, `history_backfill`, back-off fields, `platform_source`. The `opponent` owner type is legacy (the removed Draft's scouting; none exist): migration `0063` dropped its `opponent_player_id` link. |
| Personal history | `account_matches` (per-match ledger: PK account + match; queue, champion, role, result, K/D/A, CS, damage, vision, patch, duration), `account_champion_history` (aggregates per account / champion / role / queue group / patch), `account_mastery` | The ledger guarantees each match is folded once. |
| Static data | `patches`, `champions` (unique `key`, `is_active`, first/last seen version), `champion_skins` (PK champion + num; migration 0017) | |
| Other players' ranks | `last_known_ranks` (PK `puuid`; Solo/Duo `tier`, `division`, `league_points`; Flex `flex_tier`, `flex_division`, `flex_league_points`; `observed_at`; `source`) | Migration 0048 (copied from the retired Draft scouting and ranked ladder), extended by 0057. Written by an opened game's rank checks (`source` "match lookup", partial index `last_known_ranks_lookups_idx` on `observed_at`), one row per player, replaced by the next check. `UNRANKED` marks a queue with no entry. Not deleted automatically; erasure deletes a person's row. See Ranks in a game's scoreboard (G3). |
| Removed Meta & Trends (dropped) | `match_fetch_queue`, `ranked_matches`, `ranked_participants`, `ranked_bans`, `champion_role_stats`, `champion_ban_stats`, `champion_matchups`, `champion_synergies`, `pro_pick_slot_stats`, `pro_games`, `pro_game_picks`, `pro_game_bans` (migration `0062_retire_meta_trends_tables`, decision 2); `tracked_summoners`, `region_status`, `stat_periods`, `stat_region_periods`, `stat_rank_periods`, `champion_change_points` and the `stat_source` type (migration `0066_retire_meta_trends_rest`) | Each dropped after a verified backup holding it. `0048` had copied the ladder ranks Match History shows into `last_known_ranks`; `0066` deleted those of players no stored game names, which no page could show (`docs/DATA_PIPELINES.md`, "Retired tables"). |
| Removed Draft feature (dropped) | `drafts`, `draft_actions`, `draft_role_swaps`, `draft_presence`, `draft_enemy_scouting`, `series`, `matches` (the drafted archive), `opponent_teams`, `opponent_players` | Dropped by migration `0063_retire_draft_tables` with `riot_accounts.opponent_player_id` and `teams.engine_config`, after a verified production backup (audit decision 3). Migration `0048` had copied the scouted ranks Match History shows into `last_known_ranks` first. `team_bookmarks` (Team Matches) stays in `schema/matches.ts`. |
| Ranked Development (retired 29 Oct 2026; formerly Solo Queue Blocks) | `ranked_profiles`, `ranked_blocks`, `ranked_games`, `development_objectives`, `development_plans` | Kept, unused: nothing reads or writes them except permanent erasure, which still deletes a removed person's rows and takes their name out of other players' retained notes. RLS on, no Data API grants, backup role `SELECT` (unchanged). Dropping them needs a verified backup and the data-retirement plan in `docs/RANKED_DEVELOPMENT.md`. |
| Removed Clash Scout (dropped) | `clash_scouts`, `clash_scout_accounts` | Retired 23 Oct 2026; dropped by migration `0064_retire_clash_scouts` (no CASCADE) after a verified production backup. Recovery: `pg_restore --table` from that backup. See `docs/CLASH_SCOUT.md`. |
| Branding / ops | `app_settings` (key/value: names, colours, stats version, leases, schedules, the Resources library under `resources`), `brand_assets` (`logo`, `background` = sign-in, `appBackground`, plus `-static` frames), `brand_upload_chunks`, `data_refresh_status` (per-job status), `job_runs` (history) | |
| Personal-data erasure | `privacy_erasures` (a random `reference`, `erased_at`, `tokens`: keyed HMAC tokens of the erased account, profile, Riot account ids, PUUIDs and Riot IDs, never the identifiers; `key_check`; `released_at`) | Migration 0056. RLS on, no policies; `SELECT` for the backup role. Written only by an erasure, a release or an import. `docs/PRIVACY.md`. |

### B2. Important relationships

- **User ↔ Player profile:**
  - `users.player_id → players.id`, unique and nullable.
  - An account without a profile is an admin-only account. The production Owner `ascend` has one (migration 0055): it is a player first, with Admin Mode a switch away.
  - A profile without an account can exist: a placeholder, or what is left after an account is deleted.
- **Player ↔ Riot accounts:**
  - One-to-many (`riot_accounts.player_id`, cascade on delete); exactly one `main`.
  - Removing the Main promotes the oldest remaining account.
  - `setMainAccount` swaps the Main in one transaction and updates `players.riot_id`.
- **Player ↔ Champion pools ↔ Roles:**
  - The primary and secondary role pools live in `player_champion_pools` (`slot` primary/secondary).
  - Additional roles live in `player_role_pools` (keyed by `role`).
  - "The pool for role R" is resolved through `poolFor(player, role)` in `src/domain/roster`.
- **Player ↔ retired Ranked Development records:** `ranked_blocks.player_id`, `ranked_games.player_id`, `development_objectives.player_id` and `development_plans.player_id`, cascade on delete. No page reads them.

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
  - The exceptions drop retired features' data the owner approved removing, and merge only after a production backup holding it has been restored and checked: `0062_retire_meta_trends_tables` (decision 2) and `0063_retire_draft_tables` (decision 3). They use no CASCADE, so an unexpected dependency fails the migration instead of being dropped too.
  - The migrator takes a transaction-scoped lock that is safe with the pooler.
- **History preservation:**
  - Account unlinking deletes that account's personal rows (by design).
- **Limitations:**
  - Two pool tables (historical): any pool logic must read both through the roster helpers.
  - `players.riot_id` duplicates the Main account's Riot ID; it is kept in sync by `setMainAccount` and `changeRiotId`.
  - Unused columns linger: pool limits, `draft_lead`, the legacy `invites` / `activation_codes`.

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
  - **There is no "Remember this device".**
  - Logout deletes the session; a password change or reset deletes all of the user's sessions.
  - The daily `integrity` job deletes sessions a week after they ended (`deleteEndedSessions`, at most 1,000 a run) and failed sign-ins older than the 15-minute throttling window (`pruneAuthFailures`); the privacy notice states both.
- **One account per browser** (`src/server/auth/account-jar.ts`, `browser-accounts.ts`, `session.ts`, `/api/auth/logout`):
  - The browser holds one session (`uniiverse_session`). Signing in ends any session it held before, on the server, then sets the new one. Signing in as someone else therefore means signing out first, or simply signing in again: there is no account switcher and no "Add another account".
  - **Signing out** (account menu, mobile drawer or Settings) ends the session on the server, clears the cookies and returns to the site's address (the public team page, where Sign in opens its window).
  - **The old switcher's cookie.** Until October 2026 the account menu could keep up to three other accounts signed in (`uniiverse_accounts`). Nothing writes that cookie any more: signing in or out ends every session it still names and clears it.
  - **Stale tabs.** `uniiverse_who` is a readable fingerprint of the active account (a hash, not a credential). `AccountGuard` compares it with the account a page was rendered for and reloads the tab before it sends a server action or page request, when it is shown or focused again, and when another tab announces a sign-out (BroadcastChannel). A tab rendered for one account therefore never acts as another, for example after signing out and in as someone else in another tab.
  - **Unchanged:** the server authorises every request from its own session cookie, and server actions keep Next.js's origin check. Tests: `tests/db/single-sign-in.test.ts`.
- **Throttling** (`src/server/auth/throttle.ts`, migration `0046_auth_failures`; audit decision 13):
  - Sign-in: 8 failures per 15 minutes per username + IP, and 8 per IP across usernames. The setup page and `/recover` have their own per-IP limit.
  - Failures are stored in `auth_failures`, so every server instance sees the same count. Each row holds only a SHA-256 hash of the key and a time; rows older than 15 minutes are deleted as new failures arrive.
- **Owner recovery:** `/recover` with the `UNIIVERSE_ACCESS_PASSWORD` setup key (`src/server/auth/recovery.ts`). The first-run `/setup` uses the same key.
- **Username changes:** players change their own username (unique, case-insensitive) in Settings.
- **Privacy notice** (`/privacy`, `src/app/privacy/page.tsx`; audit decision 14): public, linked from the sign-in page, the public team page's footer and Settings. It lists what is stored, why, who sees it and how long it stays, from the schema, and carries the owner-approved wording on the Discord privacy contact, permanent removal and backups (22 Oct 2026). Update it, and its date (`PRIVACY_UPDATED`, `src/domain/privacy.ts`), when a change stores something new or keeps it longer.
- **Privacy requests and permanent erasure** (`docs/PRIVACY.md`): requests come privately on Discord to the owner, who checks identity without any credential. Erasure (`src/server/privacy/*`) removes the person and de-identifies what others keep (shared games show a "Removed player"); a keyed-token record keeps them out of later syncs and links and is re-applied after a restore (`docs/BACKUPS.md`).
- **Database access from outside the app** (migration `0044_row_level_security`, `tests/db/row-level-security.test.ts`):
  - Row Level Security is on for every table in the `public` schema, with no policies. The app connects as the tables' owner, which Postgres exempts, so nothing changes for it.
  - Any other database role sees no rows and can change none. On Supabase this closes the Data API: its `anon` and `authenticated` roles (the public "anon" key) would otherwise read and write every table, sessions and password hashes included.
  - A table added later needs `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` in its migration; until it has it, the test fails and the read-only `auth-audit` job names it (`tablesWithoutRowLevelSecurity`).
  - **Grants** (`docs/DATABASE_PERMISSIONS.md`, migration `0052_data_api_grants`): the Data API's `anon` and `authenticated` roles hold no privilege on any table or sequence, and the backup role is granted `SELECT` on each one explicitly. A table added later gets the same in its own migration (the grants block in that document). `src/server/db/migration-grants.test.ts` checks every migration from 0052 on, and `tests/db/data-api-grants.test.ts` replays them all with and without Supabase's pre-30-October default grants.
  - `tests/db/rls-supabase-roles.test.ts` recreates Supabase's roles and default grants (`anon`, `authenticated`, `service_role`, `authenticator`) and checks every table. The read-only `access-audit` job reports the same things on production: who the app connects as, the table owners, and what `anon` and `authenticated` hold and could read, including views and SECURITY DEFINER functions. It also reports whether the backup role can read every table (`backupRole`) and what a new table would be granted automatically (`newTablesGrantedTo`).
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
- **Admin activity record** (migration `0043_audit_events`, `src/server/audit/log.ts`, `src/domain/audit.ts`; Admin Mode → Audit Logs, and the latest few on the Dashboard):
  - Recorded after the change succeeds: account creation, temporary passwords, activation and deactivation, deletion (accounts and profiles), role, access level, extra access and permissions, administrator access granted or removed, team membership, access-level presets, a user changing their own password, branding, job runs and schedules, demo data, first Owner setup and Owner recovery.
  - Each row keeps the actor, the action, the target and short details. Names are kept as they were, so a deleted account stays named.
  - It never holds a password, token or key: detail keys that look like secrets are dropped and values are cut to 80 characters.
  - Append-only: nothing in the app updates or deletes a row. A failed write is logged and never undoes the change.
  - Audit Logs shows the last 200, all of them or one category (Access & permissions, Accounts & passwords, Platform settings, Data & jobs: `AUDIT_CATEGORIES`). A refused attempt records nothing (the action's permission check runs first).
- **Setup key checks** compare in constant time, on first-run setup as on recovery (`verifySetupKey`).
- **Security headers** (`next.config.ts`, `e2e/security-headers.spec.ts`):
  - Every response: `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and a `Permissions-Policy` turning off camera, microphone, location, payment and USB.
  - Pages also get a Content Security Policy: framed only by UNIIVERSE itself (the admin preview studio frames its own pages), forms post only back to it, no plugins, and `<base>` only to itself. It has no `script-src`, so Next's inline scripts keep working.
  - API routes don't get that policy: Next keeps a header set in its config over the same header set by a route, and the routes serving stored images send their own stricter one (`default-src 'none'`, SVG logos sandboxed).
  - HSTS comes from Vercel.

### C2. Permission architecture (`src/server/auth/permissions.ts`)

- **Owner** (`users.role = 'owner'`; production: the single account `ascend`, identified by its account id and role, never by its username): every capability, and always an administrator. There is **one Owner**: no action promotes another account (`setAccessLevel` / `setAccountRole` refuse).
  - **History.** Migration 0009 split the owner's account in two: `ascend` (player profile) and an admin-only `adminascend` (the Owner). Migration 0055 (21 Oct 2026) joined them again: `ascend` is the Owner and the only administrator, what `adminascend` created is credited to `ascend`, and `adminascend` is deactivated with no password or sessions (the audit log keeps its entries). Deleting `adminascend` is a separate, later step, once production shows `ascend` signing in as the Owner (`auth-audit`: `owners`, `lastLoginAt`).
  - Nobody edits their own access.
  - The last active administrator can never lose administrator access (`guardLastAdmin`, `guardSelf`).
  - Only the Owner changes the Owner account: its access, password, activation or deletion (`guardOwnerAccount`).
  - Owner recovery (`/recover`, setup key) is unchanged.
- **Administrators** (`users.is_admin`, migration `0053_administrator_access`, default false; 21 Oct 2026): a permission on a normal account, not an account of its own. An administrator keeps their player profile, Riot accounts, statistics, customisation, level and groups, and also holds the administrator permissions (`manage-users`, `manage-branding`, `manage-data`) and Admin Mode (`isAdmin` in `permissions.ts`; `Session.admin`, read from the database on every request like the rest of the session).
  - Granted and removed by an administrator in Users & Permissions → Manage access → Administrator (`setAdministratorAction` → `setAdministrator` in `account-admin.ts`), recorded in the audit log (`account.admin-grant`, `account.admin-revoke`).
  - Never by oneself, never on a deactivated account, never removed from the last active administrator, and the Owner is always one whatever the column says.
  - What an administrator cannot do: change the Owner account (only the Owner does, `guardOwnerAccount`), or change their own level, groups, permissions or administrator access.
  - Several administrators are supported; nothing assumes the Owner is the only one. No username or email address grants it anywhere.
  - Removing it takes effect on the account's next request: its session is re-read from the database, so Admin Mode, its pages and actions close at once, and the saved mode preference is cleared (below).
- **Capabilities** (the delegable set):

  | Group | Capabilities |
  |---|---|
  | View | `view-team`, `view-players`, `view-teammate-stats`, `view-matches` (`view-trends` went with Meta & Trends; a stored one is ignored) |
  | Own profile | `edit-own-profile`, `manage-own-riot-accounts` |
  | Team management | `manage-lineup`, `manage-players`, `manage-matches` |
  | Site settings (administrators only) | `manage-branding`, `manage-data` |

- **Base access level per non-Owner account:**
  - **Standard Player** (default): the 7 view and own-profile capabilities.
  - **Team Manager** (level key `administrator`; renamed from Administrator by migration 0029): Standard Player plus `manage-lineup`, `manage-players`, `manage-matches`. No Admin Mode.
  - **Restricted Player**: a reduced set.
  - Levels made by administrators.
  - **Custom**: ticked one by one, stored in `users.custom_capabilities`, which replaces the level.
  - Built-in levels are rows in `permission_presets` with a `level_key`.
- **Additional access groups** (migration 0020, `users.access_groups`): added *on top of* the base level, and they only add capabilities:

  | Group | Grants |
  |---|---|
  | Team Lineup Manager | `manage-lineup` |
  | Match Manager | `manage-matches` |
  | Player Manager | `manage-players` |

  (Draft Settings Manager, Branding Manager and Data Manager were retired in Phase 10; migration 0029 removed them from stored lists. `create-draft` and `manage-competition` went with Draft in October 2026; stored copies of those keys are ignored when read.)

  - Groups can never grant `manage-users`, branding, data or Admin Mode.
  - Only administrators set them, never on their own account, and Owners hold no groups.
  - Write path: `setAccessGroups` in `src/server/repositories/permissions.ts`.
- **How access is distinguished:**
  - The privileged *account type* is only Owner vs non-Owner (`users.role`); administrator access is the `users.is_admin` flag on top. Everything else is capabilities from level + custom + groups, resolved into the session (`UserRecord.capabilities`).
  - `canUseAdminArea` = `isAdmin`: the Owner and accounts with administrator access. Delegated work (lineup, matches, other players' profiles) happens in place on Team, Matches and profiles.
  - **Team membership** (`players.team_member`, migration 0029, default true): a personal-use account (false) holds no team capability (`TEAM_CAPABILITIES` in `hasPermission`), is refused by `requireTeamMember` (team bookmark actions), and is left out of Players and lineup selection; it keeps its own profile and statistics.
  - **Membership and setup are separate** (`listPlayers` in `src/server/repositories/team.ts`): a member is a profile on the team that is not archived and not personal use. Unfinished first-time setup only marks it `setupPending` ("Setup incomplete" badge); such a member is listed in Players, Team pickers, Leaderboards and the teammate picker, and their profile opens with clear empty states. A profile without a chosen role has `primaryRole: null` (`RosterPlayer`): no legal role and no pool, so it is shown but never assigned or drafted (`hasPrimaryRole`, `listRolePlayers` for the engine). A member with a role is eligible for that role whether or not setup is finished. Statistics come only from stored games, so a member without data has none (never zeros).
- **Server-side authorisation:** every Server Action and admin page checks `hasPermission` / `requirePageAccess` (`src/server/auth/page-access.ts`). Navigation only mirrors this; hidden buttons are never the security.
- **Retired:** the coach / "Team Leader" / Draft Lead role (removed in Phase 1; must not return; migration 0031 converts any leftover `coach` account to a player and a check constraint refuses the value). The Other Players group is retired the same way (0031).

### C2a. Player Mode and Admin Mode (`src/app/(admin)`, `src/server/auth/view-mode.ts`, `src/app/api/mode/route.ts`)

- **The address decides the mode.** Every page under `/admin` is Admin Mode: its own layout (`src/app/(admin)/layout.tsx`), navigation and dashboard. Every other page is Player Mode (`src/app/(app)`). A refresh, a bookmark, Back and Forward, a new tab and the installed app all keep the mode, and nothing in the browser can change it.
- **Who may open it:** the `(admin)` layout lets administrators in and sends everyone else, including someone whose access was just removed or who typed an `/admin` address, to Player Mode through the switch route. Every admin page (`requirePageAccess`; `/admin/settings` checks `isAdmin` and sends anyone else to `/settings`), action (`requirePermission`) and API route checks its own permission again; the layout is not the only lock, and does not run again on every navigation.
- **The switch:** "Switch to Admin Mode" (Player Mode) and "Return to Player Mode" (Admin Mode) sit apart from the pages in the sidebar footer and the phone drawer, and in Settings. Administrators only: the server renders them for nobody else, so a player never sees Admin Mode named. They are plain links to `GET /api/mode?to=admin|player` (never prefetched), which re-checks the account and opens that mode's start page: Admin Mode's Dashboard, or Player Mode's Team (team members) or My Profile.
- **The preference** (`uniiverse_view` cookie, HTTP-only, one year): only which mode an administrator used last, so `/` (the installed app's start page) reopens it. With none, an Owner without a player profile opens Admin Mode and everyone else Player Mode. It is read only for administrators; for anyone else `/` and the switch route delete it, so a revoked administrator keeps no trace of Admin Mode.
- **Admin Mode's sections** (`ADMIN_ENTRIES` in `src/lib/nav.ts`): Dashboard (`/admin`), Users & Permissions (`/admin/people`: Accounts, Access levels), Platform Settings (`/admin/branding`, `/admin/previews`, `/admin/resources`, as tabs), Data & Integrations (`/admin/data`), System Health (`/admin/system`) and Audit Logs (`/admin/audit`, by category). Account settings stay inside Admin Mode at `/admin/settings`. The team's pages (lineup, Players, Leaderboards, Matches) are Player Mode's, where an administrator manages them like a lineup manager. Old addresses (`/admin/users`, `/admin/players`, `/admin/public-access`) still redirect.
- **Tests:** `tests/db/administrators.test.ts` (grant, revoke, guards, the switch route, the layout, `/`), `src/server/auth/view-mode.test.ts`, `src/lib/nav.test.ts`, `src/server/auth/permissions.test.ts`, and `e2e/admin.spec.ts` (both modes on desktop and on a phone, a player who never sees Admin Mode, a member granted and then refused administrator access).

### C3. Account management (Admin Mode → **Users & Permissions**, `/admin/people`; `src/components/admin/people-panel.tsx`, `access-dialog.tsx`)

| Operation | Function | Rule |
|---|---|---|
| Create | `createPlayerAccountAction` | Administrators (`manage-users`) |
| Deactivate / reactivate | `setAccountActiveAction` → `setAccountActive` | Administrators; ends sessions; never yourself, the Owner account (unless you are the Owner) or the last administrator |
| Delete account (optionally the profile) | `deleteAccountAction`, `deleteProfileAction` | Administrators; never the Owner account; confirmation in the UI. Keeps shared games, team records and logs |
| Erase personal data (permanent) | `previewErasureAction` → `eraseAction` (a member), `previewFormerErasureAction` → `eraseFormerAction` (a former member, by Riot ID); `src/server/privacy/erasure.ts` | Administrators (`manage-users`); never yourself or the Owner; another administrator only when the Owner asks; never the last administrator; a preview, then the username (or Riot ID) typed and the permanence ticked. One transaction; leaves an erasure record and a `privacy.erase` audit entry with counts only. `docs/PRIVACY.md` |
| Erasure records | `listErasuresAction`, `releaseErasureAction`, `exportErasuresAction`, `importErasuresAction`, `reconcileErasuresAction` (Users & Permissions → Personal data, `/admin/people/privacy`) | Administrators; release needs the reference typed; import checks the whole file, then re-applies every record |
| Reset password | `resetPasswordAction` | Administrators; the Owner's only by the Owner |
| Access level / Owner | `setAccessLevelAction` (single write path `setAccessLevel`) | Administrators; not self; the Owner account only by the Owner; last administrator protected |
| Administrator access | `setAdministratorAction` → `setAdministrator` | Administrators; not self; not the Owner (always one); not a deactivated account; last administrator protected |
| Access groups | `setAccessGroupsAction` | Administrators; not self; not for Owners |
| Permissions (preset or custom set) | `setUserPermissionsAction` (not used by the pages) | Administrators; not self; not for Owners |
| Main / Other, archive player | `setPlayerGroupAction`, `archivePlayerAction` | `manage-players` |
| Profile editing | `saveProfilePatchAction` (autosave, version-checked) | Own profile with `edit-own-profile`, or `manage-players` |

### C4. Public team page (Oct 2026; `src/server/public/*`, `src/app/public`, `src/components/public/sign-in.tsx`, `/api/public/*`)

- **Always on:** `/public` is open to everyone, without an account, and signed-in members see exactly the same page (no preview banner). There is no switch and no per-member opt-in any more.
  - The old Admin page `/admin/public-access` redirects to `/public`.
  - The old Settings → Public profile panel is gone.
  - The old data is left in place, unused: `app_settings` key `public_access`, and `players.public_profile` / `players.public_name` (migration `0040_public_profiles`). No destructive migration.
- **Who appears:** the players holding a lineup role and each role's designated substitute (`lineup_substitutes`), under their **display name**, while on the team, not archived and, with a sign-in account, active. Anyone else holding a role is a nameless placeholder. Nobody else on the team is named or sent.
- **Data boundary:** `loadPublicTeam` / `toPublicSlot` build each public card field by field, from an allowlist with no spreading: picture, card look, artwork, roles, the role's champion pool, and only the social links the player switched on (Show publicly) (G1).
  - Never computed: rank, statistics, Riot IDs, usernames, lineup-management lists or suggestions. `getTeamRoster` runs with `statsFor: () => false`.
  - A DB test pins the allowlist's keys.
- **Lightweight:** one instance reuses the public page's data for a minute (`cachedFor`, `PUBLIC_TEAM_TTL_MS`). A lineup or card change made through that instance drops it at once (`invalidatePublicTeam` in `touch()`). Turning a card over to its substitute is client state only.
- **Images:** `/api/public/avatars/[playerId]` and `/api/public/card-banners/[playerId]` serve only the players on the public page, to anyone; everything else is a 404.
  - Their cache header is `private, max-age=300`: no shared cache, so a player who leaves the lineup stops appearing within minutes.
  - The members' routes `/api/avatars/*` and `/api/card-banners/*` still require a session.
- **Routing:** the proxy lets `/public`, `/api/public`, `/api/branding` and exact `/` through.
  - `/` sends visitors to `/public`; the sign-in page links back.
  - **Sign in** opens a window over the page with the same `LoginForm` and `loginAction` (`src/components/public/sign-in.tsx`, laid out like the `/login` card); it is a link to `/login` underneath. `/login` stays for direct links, protected pages, expired sessions and adding an account. Signing out of the last account lands on `/`, so on the team page.
  - **Install App** sits beside Sign in (`InstallAppEntry variant="public"`: the icon alone on phones, hidden in the installed app).
  - Every link on the public page stays public (a browser test follows each one as a visitor). The player panel offers no profile or edit link to visitors.
  - Every members' page still redirects visitors to sign in.
  - The public layout never calls `runTickIfDue`, and nothing there calls Riot.
- **Riot data:** rank, statistics and Leaderboards stay off the public pages unless the deployment sets `UNIIVERSE_PUBLIC_RIOT_DATA=true` (`publicRiotDataAllowed`).
  - With it set, the public cards carry the figures members see on the Team page, through the same allowlist (`toPublicSlot(slot, members, riotData)`; the ladder change stays off, as it links to a members' profile), and `/public/leaderboards` ranks the players on the public page with the members' Leaderboards component (`src/server/public/leaderboards.ts`: their display names, public pictures and looks, and only their games; no profile links). The header gains a Leaderboards link and the privacy page says so.
  - Without it, `/public/leaderboards` is not found and nothing numerical is computed for the public page.
  - Riot's policies do not allow an app on a Personal/Development key to serve its data for public consumption.
  - Set the variable only with a Production key whose registration describes the public pages.
- **Local testing:** the cookie `uniiverse_guest=1` makes a local browser a visitor instead of the automatic local owner. It can only remove access.
- **A redesign that was removed:** on 20 Oct a public page redesign (#100: a hero, community and Playing With Us sections, motion, and Admin → Branding → Public page) was live for a few hours; only the sign-in window and Install App remain. Its migration `0051_public_site_copy` stays in the history (migrations are never rewritten), and the one `public_site` settings row it added on this install is left in place, read by nothing.
- **Tests:** `tests/db/public-access.test.ts`, `e2e/public-guest.spec.ts` and `e2e/public-sign-in.spec.ts`.

---

## SECTION D — RIOT INTEGRATION

### D1. Riot APIs used (`src/server/riot/api/client.ts`)

| Purpose | Endpoint | Routing |
|---|---|---|
| Riot ID → PUUID | `/riot/account/v1/accounts/by-riot-id/{name}/{tag}` | americas / asia / europe (`accountRegionFor`; never `sea`, which answers 403) |
| PUUID → Riot ID (rename tracking) | `/riot/account/v1/accounts/by-puuid/{puuid}` | same |
| Active server | `/riot/account/v1/region/by-game/lol/by-puuid/{puuid}` | same |
| Rank | `/lol/league/v4/entries/by-puuid/{puuid}` | platform (e.g. `oc1`). Account sync, and an opened game's players on demand (G3, Ranks in a game's scoreboard) |
| Match ids | `/lol/match/v5/matches/by-puuid/{puuid}/ids` | regional (americas, europe, asia, sea) |
| Match | `/lol/match/v5/matches/{id}` | regional |
| Mastery | `/lol/champion-mastery/v4/champion-masteries/by-puuid/{puuid}` | platform |
| Status | `/lol/status/v4/platform-data` | platform |
| Static data | Data Dragon `versions.json`, `champion.json`, per-champion detail files (kits, skins), images | CDN |

**Limits:**
- Development/personal key: 20 requests per second and 100 per 2 minutes, **per host**. The client keeps one limiter per host (`RateLimiterPool`).
- It honours `Retry-After`, backs off on 5xx and limits retries.
- **Deadlines** (4 Nov 2026): every caller with a time budget gives its client a `deadline` (the account-sync, timeline-backfill and figures-backfill jobs; the first sync after sign-up, 20 s; a profile view's refresh, 40 s; Refresh, 40 s, and its catch-up, 25 s; Retry pending, 40 s; the key check, riot-check and Admin's Check key now, 30 s with one retry and a 7 s timeout, `riotKeyCheckLimits`). No request starts after it, and one that would wait past it, for a full rate-limit window or a 429's `Retry-After`, is not sent (`RiotDeadlineError`): the caller stops as when its time runs out. The account is not marked Pending, nor marked synced when a due current-season list was left unread before any was read; nothing is recorded against the key; what was collected is kept; and the next run carries on. A request that met a network error or a 5xx and cannot be tried again in time throws that error instead: an outage near the end of a budget is still a failure (the account Pending with Riot's reason, the run degraded), not a stop for time. That includes a sync whose best-effort lookups (the Riot ID check, the active server, rank, mastery) met such a failure, with no later lookup succeeding, and which then ran out of time before it read any season list. On a client that retries, a 429 whose Retry-After leaves no time is a stop for time (a Refresh does not retry: a 429 on its list request is reported as Riot rate-limiting, as before); a failed match request inside the history stops its page, as before. Before, a sync waited out Riot's two-minute window whatever its budget (121 s of a 75 s budget, 14 Oct), enough to push a tick past the 300 s function limit, which leaves its job "running". A request already sent can still take its timeout (7–15 s) past the deadline, so a sync bound by one ends by the deadline plus one timeout.
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
    the previous season afterwards, when the current one is complete; a queue whose newest page
    was left unfinished is read again from the top; games Riot refuses for good are stored
    without a champion, games on a champion not known yet are left for a later run)
 → account_matches ledger (each match folded once; per-match K/D/A, CS, damage, vision, role, result)
 → account_champion_history aggregates (per champion / role / queue group / patch)
 → proficiency (computed on read by src/server/proficiency/service.ts from history + mastery)
```

- **Kick-off on link:** sign-up never waits for Riot. A best-effort verification runs right after linking (`kickoffAccountSync`); anything Riot could not answer is `pending` with a plain reason. It claims each account's sync lease first (below), so a profile view opened meanwhile does not verify the same account a second time.
- **Sync states shown to players:** Updating · Catching up on history · Up to date · Delayed · Needs attention. "Retry sync" appears only for Delayed and Needs attention.
- **How quickly a new game appears:** the scheduled sync reaches an active account at most every 45 minutes (others every 3 hours, 12 accounts per run) and only when a scheduler tick runs (a visit starts one every 30 minutes; the hourly GitHub run is best effort), so a game played just now usually takes 45–90 minutes. Rendering never waits for Riot; no page caches personal games.
- **Data status and Refresh** (`src/domain/data-status.ts`, `src/components/ui/data-status.tsx`, `src/components/ui/refresh-store.ts`; 22 Oct 2026, one design on every page):
  - **One status per page**, the only place the page says how current its Riot data is. No banner; figures and cards carry no status marks of their own.
    - A fixed word: Up to date, Syncing, Partial data, Delayed, Needs attention or No Riot account.
    - Its parts: the accounts, the season's collection, multikill counts ("Multikills counted in 277 of 1,104 games"), game details and positions.
    - Its times: **Last checked** (the latest attempt, successful or not: `last_sync_at`), **Last successful sync** (said only when an attempt has failed since: the oldest `sync_cursor` of the player's accounts) and **Newest game**. Demo accounts (seeded, never read) count in none of them.
  - **Where: two places, in one layout (`SectionHeader`; 2 Nov 2026).** The status in a few quiet words beside the line of scope under the title (`DataStatusNote`: "Synced 5 min ago", or Syncing, Partial data, Delayed, Needs attention), with one ⓘ holding the rest; and Refresh at the end of the section's toolbar, after the filters (`RefreshButton`), never on a row of its own. Phones: title, scope line and status, then one row with the folded Filters button and Refresh. Tablets: the same, the filters inline (game mode, Refine) and Refresh after them. Wide screens (`xl`): the toolbar beside the title at the right edge. Refresh is a 36px toolbar button (44px on touch screens and phones) with an icon and the word, styled like Refine (`toolbarButtonClass`).
    - Profile → Overview (Season performance), All Champions, Match History and its Encounters: the same Refresh, at the same distance from the right edge.
    - Profile → Riot accounts: the same Refresh in the panel header's actions, at the right of its title, without the status (each account's row says its own state). The account menu's "Sync now" is gone; Retry sync (Delayed and Needs attention only) stays.
    - Team → Leaderboards (members): the team's status in the same ⓘ, under the title (`teamDataStatus`, from `membersDataStatus`): member accounts counted by state ("2 member accounts still being read"), never named, and "The boards follow the account syncs". No Refresh: the boards follow each player's account syncs and their own Refresh. The public boards keep their one "Updated from the last account sync" line (no account states in public).
    - The ⓘ (hover, focus or tap) shows the word, the parts, the times and this visit's Refresh ("Refreshed 2m ago: 3 new games"); it carries a dot whenever the status is not Up to date, so figures from only some of the games are never presented as complete.
  - **Refresh is offered only where it can work** (`refreshFor` in `profile-sections.tsx`, checked on the server): to the player and to those who manage Riot accounts, for a player with an account Riot can be asked about (not demo), on a server with Riot (`refreshAvailable`). Otherwise the ⓘ stands alone.
  - **What a press does** (one run per player, shared by every Refresh on screen, in `refresh-store.ts`):
    1. `refreshMatchesAction` runs the same sync for the player's accounts now, limited to new games: 15 per account, no back-fills, about 40 s. It asks every queue, also those that had no games (`recheckEmptyQueues`; the scheduler asks those only twice a day), so a first Ranked Flex game is found at once.
    2. While some of the player's games lack multikill counts, `catchUpFiguresAction` fetches up to 40 of their records again, newest first (a 25-second budget, the `figures-backfill` job's rate limiter and rules).
    3. When either changed something, the page is read again in place (`router.refresh()`; the pages are dynamic, the proficiency cache is cleared after new games or counts, and the Leaderboards and Played Together caches rebuild when the stored games change), keeping its URL filters. Only then does the notification say what happened, so it never arrives before the figures.
    - The status beside the scope line names the step while it runs: "Checking Riot…" (and "Fetching multikills…") for the new sync, then "Updating the page…" for the re-read of what is stored, which asks Riot nothing.
  - **Leases and repeats.** Every sync first claims a per-account lease in `app_settings` (`account_sync:<id>`): Refresh and Retry sync refuse an account claimed in the last 2 min; the scheduler, a profile view's background refresh and the first sync after sign-up one claimed in the last 100 s (`SCHEDULED_SYNC_LEASE_MS`: longer than a tick's account sync can hold an account, its 75 s cap plus a request's 15 s timeout, as no request starts after the cap; the last two claim it since 4 Nov 2026: before, a view and the tick or a Refresh could sync one account at once, doubling the Riot requests, and the Refresh then found "No new games" the other had just stored). A catch-up claims one per player (`figures_catchup:<id>`, 2 min), and a view's slice one per player (`account_refresh:<id>`, 2 min, given back when every due account was held by another sync). A slice dates its account claims from its own start, so the next slice never finds them standing; the first sync after sign-up gives each account back as soon as it is done with it, so the profile the new member opens carries its history on at its next render. So no two of these syncs run on one account. (Not covered, as they can hold an account for more than 100 s, so a background sync may join them: a direct run of the account-sync job, Data jobs → `account-sync` or `pnpm job account-sync`, whose budget is `UNIIVERSE_JOB_BUDGET_MS`, 240 s by default; and Retry sync, which has no deadline.) The first sync's give-back means a Refresh or Retry sync right after it reaches Riot instead of answering "checked recently"; the cooldown runs from their own claim. (Two paths still sync without the lease: linking an account on the Riot accounts panel, whose first sync runs while the person waits, and the owner's Retry pending accounts.) A second press while one runs joins it; one within 2 minutes is answered in the browser ("Refreshed 1m ago · try again in 2 min") without a request, and from another browser or device the server answers "checked recently" from the lease, without asking Riot.
  - **Outcomes are stated as they happened** (`refreshNote`, `REFRESH_TOAST`): N new games; no new games (Riot can take a few minutes to list a finished game); multikills for N more games and how many follow automatically; checked recently (with when to try again); failed; or not available. Never "updated" or "Up to date" for a click alone: the word in the ⓘ comes from the accounts as the sync left them. The button reads "Refreshing…" until the figures are in, on whichever tab of the profile is open (a run carries on when the tab changes); screen readers hear the steps.
  - Played Together and Leaderboards read the same stored games, so a refresh updates them as well.

### D3. Background updating

- **Scheduler:**
  - Entry point: `runTick` in `src/server/jobs/scheduler.ts`. Order: version-check → account-sync → rank-checks → integrity → timeline-backfill → figures-backfill.
  - A tick has a 240 s budget (visit ticks 230 s). Jobs claim atomically, so concurrent ticks skip instead of duplicating work. Per-job caps inside a tick: account-sync 75 s, rank-checks 15 s, integrity 20 s, timeline-backfill 25 s, figures-backfill 25 s.
- **Job intervals** (`defaultIntervalMinutes`; can be changed in Admin):

  | Job | Interval |
  |---|---|
  | version-check | 60 min |
  | account-sync | 15 min |
  | rank-checks | 15 min |
  | timeline-backfill | 60 min |
  | figures-backfill | 60 min |
  | integrity | 24 h |

  - `static-sync` (forced) and the diagnostic jobs run on demand only. Diagnostic jobs: `auth-audit`, `data-audit`, `perf-probe`, `riot-check`, `skin-audit`, `proficiency-audit`.
- **Triggers:** GitHub hourly (best-effort; often skipped), Vercel daily 04:00 UTC, visits (every 30 min while people use the site), optional `pg_cron`.
- **Retry / back-off:**
  - Accounts: 5 min after the first failure, doubling up to 6 h.
  - Interrupted runs count as failed runs: the job's next start (after 15 min) or `integrity` records each one and closes its `job_runs` row.
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

**Used by** the Team Overview cards and the player details window (where its label still shows), and by lineup eligibility and team advice. It never changes the pools. Since 2 Nov 2026 the profile no longer shows it: All Champions has no Experience column, sort or badge, the champion window no Experience line, and the Overview's pools no label under each champion (`docs/CHAMPION_EXPERIENCE_LABELS.md`). The estimate itself is unchanged.

### E2. Global evidence (removed with Meta & Trends, 19 Oct 2026)

Meta & Trends (Solo Queue Meta, Duo Synergies, Pro Play) and the global evidence behind it are gone: the Emerald+ ladder sampling and ranked collection, rank and three-patch weighting, champion rework detection, Leaguepedia professional games and the aggregation jobs. Everything UNIIVERSE shows now comes from the linked players' own games. 12 of its tables (about 206 MB) were dropped on 4 Nov 2026 (migration `0062`, after a verified backup); the rest stay in the database, untouched, until the owner decides (`docs/DATA_PIPELINES.md`, "Retired tables"). `docs/ARCHITECTURE.md`, "Meta & Trends removed", lists what was kept.

### E3. Data limitations

- **Player history:** some accounts are thin; one player's season K/D/A is still back-filling (167 of 563 games).
- **Role inference:**
  - Riot's recorded position is trusted for own games; games without a position are excluded from role filters and counted in a note.

---

## SECTION F — TEAM MATCHES

The Draft feature (setup, Draft Room, live drafts, recommendation engine, scouting, series and
Fearless rules, Match Playbook, the drafted-match archive and its editor, opponents, competition
modes and Draft Settings) was **removed in October 2026**. Migration `0063` dropped its database
tables on 4 Nov 2026, after a verified backup (see `docs/ARCHITECTURE.md`, "Draft removed").

**Team → Matches** (`/matches`, `src/server/matches/*`) now holds only Riot games:
- **Played together:** games where two or more current members were on the same side, with
  filters, team bookmarks (`team_bookmarks`; removal by whoever added it or a Match Manager) and
  the full match details. Needs `view-matches` and `view-teammate-stats`; without the latter the
  page explains that it shows teammates' games.
- **Encounters** are in each profile's Match History (above); the old `?view=encounters` address opens your own.

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
  - **The Studio on phones and tablets** (`CardStudio` in `customise-card.tsx`; the window is a `DetailModal` with `innerScroll`):
    - One area scrolls: the section's controls. The header, preview, section bar and action bar stay put, so nothing sits under the action bar.
    - **Section bar** (`SectionBar`) instead of the desktop's step pills: where you are, previous and next, and a list of every section with the changed ones marked. Escape and a tap outside close the list only.
    - **Preview:** compact above the controls (one scale for every view; 0.72, or 0.6 on a short phone held upright). **Hide** puts it away to a live strip, remembered per device in `localStorage` (`uniiverse.studio.preview`). **Full card** draws the whole card in any view over the controls. A phone held sideways (480px tall at most) keeps the preview beside the controls.
    - **Keyboard** (`useKeyboardFit`): on touch screens, while the visual viewport is more than 120px shorter than the window, the window fits above the keyboard, the preview moves to the strip and the focused field scrolls into view.
    - **Leaving:** Cancel, Escape, the close button, Android's back gesture (the dialog's close request) and the browser's Back (`useBackGuard`: one extra history entry for the same address while there are unsaved changes, removed again when they are saved or discarded) ask "Discard your changes?" in the action bar. Reset look asks too. A reload or closing the tab asks the browser's own question (`beforeunload`).
    - Tests: `e2e/studio-mobile.spec.ts` (section bar, preview, full card, confirmations, keyboard emulated through the visual viewport, held sideways and turning) and `e2e/studio-touch.spec.ts` (every control of every section by touch on an iPhone SE, an iPhone 15 held either way, a Pixel 7 and an iPad Mini; Chromium emulation, not real devices).
  - Art falls back: skin splash → default splash → loading art → accent gradient (`card-art.tsx`).
- **Profile pictures:** cropped in the browser, validated by bytes on the server, served members-only from `/api/avatars/[userId]`.
- **Social links** (Oct 2026; `src/domain/social-links.ts`, `players.social_links`, migration `0049_social_links`): optional YouTube, Twitch and Discord, set by the member in the Player Card Studio's **Links** step (their own card only; saved with the card), Settings → Profile or the optional welcome step (`saveSocialLinksAction`, always the session's own profile). All three use the same fields and checks (`SocialLinksFields` in `social-links-editor.tsx`); the Studio loads the stored links when it opens (`ownSocialLinksAction`).
  - **One switch per link, "Show publicly"** (Nov 2026, migration `0061_social_links_public`): stored as `{ value, public }`. Off, the default, nobody but its owner sees it (in Settings, the welcome step and the Studio); on, team members see it and so does the public team page. A link shows only through `visibleSocialLinks`, only when switched on (`public === true`) and only while its value still passes the checks: a stored value alone never shows anything.
  - **The earlier three audiences** (`show`: Only me, Team members, also the public page) were converted by 0061: only the public audience was switched on; team-only and owner-only links were switched off, so nothing became visible to anyone new. Their values are kept. `readSocialLinks` (in `loadSocialLinks`) applies the same rule to a row in the old shape, which an instance of the previous version could still write during a deployment. On a rollback, the previous version reads the new rows as hidden (it knows only `show`), so it shows less, never more. Pinned by `tests/db/social-links-migration.test.ts` and `tests/db/public-access.test.ts`.
  - Only youtube.com channel addresses or @handles, and twitch.tv channel names, are accepted (normalised; other sites, schemes and disguised hosts are refused). Discord is a username to copy: Discord has no public address for one. No OAuth, nothing fetched or embedded; links open in a new tab with `noopener noreferrer nofollow`.
  - The stored value is never part of `PlayerRecord` (which the Players directory sends to the browser): `loadSocialLinks` reads it for the server to filter. Team cards, the profile header and the public card carry the same list, the links switched on; the public card copies only their display fields (pinned by `tests/db/public-access.test.ts`).
  - Deleting an account clears its links, even when the profile is kept archived.
  - **Where they show:** round icons on Team Overview cards (a substitute's own on the back of the card), the Players directory and the public page (`CardSocialIcons`); labelled chips in the profile header and the Team window (`SocialLinks`); the same icons without actions in the Card Studio preview; Settings shows, in one line under the fields, what teammates and the public page will see before saving. Each icon is its own link or button, so using one never opens, turns or selects the card, and never changes the lineup. In a narrow Team card the icons share the avatar's row, so every card keeps the same height. On the Players directory the card is one link to the profile, so the icons are drawn over the space the card reserves for them.
  - **Policy review:** `docs/RIOT_COMPLIANCE.md` → Social links.
- **Riot accounts:** Main + Alts, all counted (Section B2).
- **Visibility:**
  - Every member sees team members' profiles, pools, Riot IDs and statistics. Teammates' statistics need `view-teammate-stats`.
  - Who sees a profile, a teammate's rank and the players of a game (owner decisions of 4 Nov 2026: a teammate's rank is one of their statistics; a personal-use profile opens only for its player and administrators): `docs/PROFILE_VISIBILITY.md`.
  - Team Overview follows the same rule on the server (`getTeamRosterForViewer`): without `view-teammate-stats` a teammate's card carries name, roles, lineup place and pool champions only (no rank, season figures, champion figures, proficiency or rank change, and vacant-role suggestions do not cite games). Your own card always shows your figures.
  - Never shown: passwords, sessions, infrastructure.

### G2. Player statistics (`src/domain/season-stats.ts`, `src/server/players/overview.ts`, `src/components/players/player-overview.tsx`)

| Figure | Definition |
|---|---|
| Games, W–L, win rate | Counts of stored games after filtering and de-duplication (a rate) |
| KDA ratio | (Kills + assists) ÷ deaths **summed over games** (so one deathless game cannot make it infinite) |
| Total kills | Every kill in the filtered, de-duplicated games, **each game's own kill count** (`account_matches.kills`) added up; never worked out from the multikills (`performanceOfGames` → `totalKills`, 22 Oct 2026). On the Overview it is the first of the kill cards, before the four multikill kinds (`KillCards` in `player-overview.tsx`), with the kills per game under it; per champion it is All Champions' sortable **Kills** column (the row's summary line on phones). The same filters as every other figure: season, game mode, role played, champions and account; a game seen from two linked accounts counts once. Games stored without Riot's full record (no kill count yet, or `kills = -1` where Riot no longer provides it) are left out, never counted as zero: the page's status says "Kills, KDA, CS, damage and vision from N of M games" while that is so, and a champion's total from only some of its games is marked \* in All Champions. No Riot request: the counts are already stored with every game |
| CS, damage, vision | **Per-game averages** over the games that have those details (the sample size is shown, e.g. "167 of 563 games") |
| Mastery points | Summed across linked accounts, with a per-account breakdown |
| Proficiency | Tier badge per (role, champion), with an ⓘ explanation (E2) |
| Multikills | Riot's double, triple, quadra and pentakill counts (`doubleKills` … `pentaKills` on each game's record), **added up over the same filtered, de-duplicated games**, on the Overview as four cards of their own under Season performance's figures, after Total kills: Double kills, Triple kills, Quadra kills and Pentakills (`KillCards` in `player-overview.tsx`; phones: Total kills across the top, then two by two; Total kills on a row of its own above the four from 39rem; one row of five from 49rem, where every card keeps room for its longest line). Each card says how often that kind came ("1 every 8 games", over the games with counts). The cards have no heading of their own (each names its kind; screen readers get one) and every count is in the same colour, size and weight as the season's other figures: no kind is highlighted, the pentakill included (the same in the champion window and All Champions). How many games have counts is said once, in the page's status, the ⓘ beside Refresh ("Multikills counted in N of M games", under Partial data; `multikillCoverage`), never on the cards. While no game has counts, the cards show a dash and "Not counted yet". The Overview's Refine filters (role played, champions, account) narrow them like every other figure; there is no per-champion or per-account list there. **Per champion** they are in All Champions: each row's own games (`topChampions[].multikills`, the same season, mode, role and account), as Double / Triple / Quadra / Penta columns when the list is at least 76rem wide, one Multikills column (the rarest kind) narrower, and in the row's summary line on phones; sortable from the headings or Sort by (each kind breaks ties by the rarer kinds; "Multikills" sorts pentakills first). A champion whose games have no counts shows a dash, never 0; one with counts from only some games is marked \* (a legend under the list says so). The champion window shows the same four totals for its champion. Overview's "By champion", a quiet link under the four cards, opens All Champions sorted by multikills, keeping the season, mode, role and account (`src/domain/multikills.ts`). Records stored since Team Leaderboards (Phase 14) carry the counts; for older Season 2026 games the `figures-backfill` job fetches the record again, once each, newest first, a few per run (60 from 22 Oct; `src/server/accounts/figures-backfill.ts`), and a profile's Refresh fetches up to 40 of that player's own at once. The totals grow as they arrive, with no other change. Games without counts are left out, never counted as zero, so this is **not a career total**; a game whose record Riot no longer provides is marked (`extra_stats = {}`, shown as "-" in the account rows) and not asked for again. Production, 20 Oct 2026, before the backfill: 871 of 4,779 stored games of linked players had them (156 of the 3,540 games in Leaderboards' scope). Match History and Team → Matches mark each game's largest multikill (`MultikillTag`: Riot's `largestMultiKill`, else the largest kind with a count; Team → Matches reads it from `account_matches.extra_stats` in its one cached query). Whether Riot also counts a larger multikill in the smaller ones is read from production data by the `data-audit` job (`multikills.riotCounting`); the page shows Riot's counts as they are either way |

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
  - **One filter bar per page.** On the profile Overview, Season and Game mode sit up front and Refine holds the role played, the champions and the account; its panel says what they narrow ("Applies to Season performance, its multikills and Recent form"). Recent form counts the same games and says "Filtered: …" when Refine narrows it. Ranked progress keeps its own queue and account switch, and Roles & champion pools only the season and mode (their scope line says so). No section has filters of its own.
- **Rendering never calls Riot synchronously.**
- **Where the defaults apply** (current season + All supported games, real filters, Reset restores them): Profile Overview, All Champions, Match History, the champion window (via Refine), Leaderboards, Team Overview, Played Together (plus "All seasons"; its "Played together most" pairs follow the season and mode). Exceptions: Drafted Matches is an archive of team drafts filtered by competition and patch, not by Riot game mode, and lists every season. A game's season is read from its patch (`seasonOfGame`).
- **Mode counts and empty seasons** (`modeBreakdown`): the Game mode filter of Overview, All Champions and Match History names each mode's games in the chosen season ("Ranked Flex (14)"), and a list that a mode leaves empty links to the seasons holding that mode's games. Played Together does the same for its filters. Production (2026-10-17): 83 Ranked Flex games stored (199 account rows across 10 linked accounts), 54 of them with two or more team players on one side; `data-audit` → `queueClassification.flexVisibility` gives them per player and season as the views count them.
- **Encounters** (a profile's Match History → Encounters, `?view=encounters` on `/overview/matches` and `/players/[id]/matches`; `src/domain/encounters.ts`, `src/server/players/encounters.ts`, `src/components/match-history/encounters-view.tsx`, `encounter-games.tsx`, `loadEncounterFocus`). Until 21 Oct 2026 this was a team list under Team → Matches; that address now opens your own profile's Encounters (`encountersRedirect`, `src/lib/nav.ts`).
  - **What:** the other players this profile's player met in their recorded games, across all their linked Riot accounts, seen three ways: **All** (everyone met, both records side by side; the default since 3 Nov 2026), **Against** (on the other team) and **Alongside** (on the player's team), each with the player's own record. Someone met both ways is listed under Against and under Alongside, each time with that side's record; there is no third "Mixed" kind.
  - **Which games:** exactly the games Match History lists for the same season, game mode and account: stored games with a champion, one per match however many of the player's accounts stored it, the season read from the patch (`seasonOfPatch`, "26.x" included). `tests/db/profile-encounters.test.ts` checks the count against `getMatchHistory`.
  - **Counting:** the result is the player's own. A game in which duplicated records put the other player on both sides counts once in each relation. A record without a side counts as an opponent.
  - **Who is listed:** anyone with a recorded PUUID and Riot ID in those games' stored details who is not linked to any UNIIVERSE profile (teammates are in Team → Matches). Recognised by PUUID, so renames merge; the latest recorded Riot ID is shown. The page gets an opaque key computed in the database, never the PUUID.
  - **Filters (URL):** the games list's `season`, `mode` and `account` (one choice for both views; the role and champion filters do not apply and are not offered), then the list's own `rel` (`against` or `alongside`; All when absent), `min` (1, 2, 3, 5, 10; twice by default, once while searching; it counts the games of the chosen side, or all games on All), `sort` (`games`, `recent`, and on Against and Alongside `best` or `worst` win rate; a sort a view does not offer falls back to games), `q` (name or Riot ID search) and `limit` (25 more per "Show more"). Old addresses keep working: `rel=opponents|allies|everyone` read as against, alongside and all, and Team → Matches' `rel=shared` opens All. The Against, Alongside and All switches show how many players each would list with the same minimum, search and sort. Highlights ("Most games against", "Most games alongside", "Best record alongside", "Toughest record against") need 3 games (5 decided for records) and describe the whole season and mode; Against and Alongside show their own two, All shows the four. Each is the first player of the list it sums up (the toughest record against: the lowest win rate against one opponent), ties going to more games in that relation, then the most recent; a toughest record must be a losing one and a best record a winning one, or there is no such highlight. The list's (i) says so. A win rate from fewer than 5 decided games is grey with a "small sample" mark (spoken too), and the win-rate sorts put established records first.
  - **Rows** (2 Nov 2026, replacing the Opponent / Ally / Mixed badges of 26 Oct): on Against and Alongside, the name and Riot ID, that side's games, its record (W–L), its win rate and when they last met on that side (each relation keeps its own last game, `alast`/`olast` in the query); a player also met the other way says so in a quiet line ("Also 2 games alongside"). On All, the two records side by side, each with its word (`RelationTag`: Against in red, Alongside in blue, never colour alone), then the total games and the last time met. Column headings sort (the win-rate heading switches between best and worst); where the headings are hidden (phones, and the All table below 56rem) a Sort menu does it.
  - **A player's games** (3 Nov 2026, replacing the player window of 2 Nov): a row, a highlight or a scoreboard's "Met N×" opens the player's games in Match History itself (`?view=encounters&met=<key>`, `&side=against|alongside`; the list's own choices ride along for the way back), so every game has the same card, breakdown, match window and links as anywhere in Match History. Above the games, `EncounterGamesPanel` (`encounter-games.tsx`): All encounters (back to the list as it was), who it is with the OP.GG link (the Riot ID of the newest stored game anyone played with that account, so a rename is followed), the games with them and when they last met, the Against and Alongside records (never added together), and All, Against and Alongside with their counts when they were met both ways. The games come from `loadEncounterFocus` (`loadEncounterSides`: every game with them and the sides they were on, a game with duplicated records counting on both), passed to `getMatchHistory` as `onlyMatchIds`; the season, game mode and account filters still apply, and the page size, paging and `?match=` work as on the games list.
  - **Data and cost:** counted in the database for this player only, and only the page shown is sent: the season and queue counts (a few rows) and one page of players with the highlights (about 3 KB), or one player's records and game ids (a few KB), then the games list's own page. Nothing is cached. Local PostgreSQL 16 at production volume (`docs/HOSTING_USAGE.md`, 21 Oct 2026): 85–150 ms a page and 55–65 ms a window for a player with 1,100 stored games. JIT is off for these statements. No Riot request. `perf-probe` step `profile.encounters` (counts only, never names).
  - **Permissions:** the profile's Match History right: your own profile, or a teammate's with `view-teammate-stats`. A player's games are read only behind that check, by the list's key shape only (`readEncounterFocus`), in offered seasons and the player's own accounts (`tests/db/encounter-permissions.test.ts`).
  - **Limits:** only games UNIIVERSE recorded for the player (each account's synced history), so a missing game is not proof two players never met; games without stored match details have no other players (the list says how many of the games have them).
  - **Tests:** `src/domain/encounters.test.ts` (the counting rules), `tests/db/profile-encounters.test.ts` (the query against those rules on every season, mode, account and list choice, and against Match History's count), `tests/db/encounter-permissions.test.ts`, `e2e/encounters.spec.ts`. The demo places synthetic recurring players in the demo games (`server/demo/encounters-fixture.ts`, DEMO_ games only), one of them met once on each side by every member, so every demo profile has a player listed under both Against and Alongside.
- **Match History 2.0** (29 Oct 2026; `src/components/match-history/match-breakdown.tsx`, `match-analysis-panel.tsx`, `match-timeline-panel.tsx`, `build-panel.tsx`, `history-summary.tsx`; rules in `src/domain/match-analysis.ts` and `src/domain/history-summary.ts`; `docs/ARCHITECTURE.md` → Match History 2.0):
  - **Opening a game:** under its card, one at a time, with Scoreboard, Analysis, Timeline and Build. `?match=<id>` is kept in the address (replaced, not pushed); a link to a game not on the page shown opens the match window. Team → Matches opens its games the same way, under their cards (`TogetherList` and `TogetherCardFrame` in `matches/together-details.tsx`, with the shared `MatchExpansion` in `match-history/inline-match.tsx`; Nov 2026), with `?match=` in its address too. Matchups, Encounters and the champion window open the same breakdown in the match window, as they are windows themselves.
  - **Analysis:** comparisons, never a score: the player's shares of their team's kills, damage and gold; their place in the game per figure; the lane opponent only when exactly one enemy has the same recorded position, at 10:00 and 15:00 (from the match timeline) and at the end; and the game beside the player's own earlier games of the same role and queue group (ranked, normal, Swiftplay/Quickplay and Clash never mixed; the newest 50 at most, none below 10; "best of the last N" only from 20). The (i) gives the method.
  - **Timeline:** the gold difference between the teams per minute, only when the timeline holds all ten players; the largest lead and deficit, the end, and when a lead of 1,000 gold or more changed sides, described without causes. Fetched from Riot once per game when Timeline, Build or (with a lane opponent) Analysis is first opened, and stored; Riot's 429 is reported as such.
  - **Kills and objectives** (migration `0060`): each team's kills as ticks on the chart (only when all ten players' kills are kept), the objectives each team took under it, the player's own kills and deaths, and the three largest swings of about three minutes with the kills and objectives of the same minutes (side by side, never as a cause). Kill times live in each player's timeline entry (erasure drops the whole entry); objectives are team facts in `match_timelines.events`. Timelines stored before are fetched once more when opened (`events` null), and a 404 is recorded (`events.missing`). A refetch completes the stored row and never replaces it (`completedTimeline`: stored purchases, skills and frames stay).
  - **Cards:** the champion's level, stored ranks for everyone but the player, the damage share, and at most one "Best <figure> in N" (higher than each of at least 20 earlier comparable games).
  - **Summary above the list:** the newest 20 games the filters list (the Overview's Recent form rules): results, record, KDA, CS/min (vision for supports), kill participation, the streak, the champions played most, a trend when Recent form names one, and the ladder change over 30 days from stored rank readings (current season, Solo/Duo or Flex as the list, the filtered or Main account).
  - **Riot use:** no new endpoint: Match-V5's timeline was already used (Build, Matchups' backfill). Opening a game asks for it only when its sections need it and it is not stored, or was stored before the kills and objectives were (then once more).
  - **Refine** (`src/domain/history-refine.ts`, `history-refine-fields.tsx`, `src/server/players/history-members.ts`): Match History adds its own fields to the profile's Refine panel: wins or losses, a patch (with counts), the days played (calendar days in the installation's time zone), a team member played with or against (or any member), and highlights (a multikill of at least a size, from the stored counts, or a personal best). Each is an address parameter (`result`, `patch`, `from`, `to`, `with`/`against`, `hl`); unreadable ones are ignored. They narrow the games before paging, so the summary and the pages follow. Members are matched as Team → Matches → Played together matches them: a current member was in a game when one of their verified linked accounts stored it, on the player's side when that stored game's side (`account_matches.team_id`) is the player's; never by name, and an unknown member id narrows nothing. The counts beside each member are one aggregated query over `account_matches` (no record JSON read; about 6 ms locally at production volume); a member's games are read only while one is chosen. `perf-probe` step `profile.historyMembers` times it in production (counts only). No Riot request.
  - **Playing sessions** (Refine → Show the games → By playing session, `?group=sessions`): games less than 45 minutes apart (one's end to the next one's start) are one sitting, found from every stored game whatever the filters; each sitting's header gives the start and end times, record, KDA, CS/min and time played over the games the filters list.
  - **Players met in other games** (`loadMatchMeetings`, `getMatchMeetingsAction`): under a card, the scoreboard marks a player met in another game of the list's season, game mode and account with "Met N×" (their games together as Encounters counts them, this one included; the hover text splits them into against and alongside). The mark opens their games in Match History (Encounters → the player), with the same N. Only players Encounters lists (a recorded Riot ID, no UNIIVERSE profile). Loaded after the scoreboard, in one statement that opens only the records holding the game's players (participants' index); 2–4 ms in the database locally at production volume. The action has the Match History right and Encounters' checks (offered seasons, the player's own accounts, the player's own game). `perf-probe` step `profile.matchMeetings` (counts only). No Riot request. The match window marks no one.
  - **Tests:** `src/domain/match-analysis.test.ts`, `src/domain/match-events.test.ts`, `src/domain/history-summary.test.ts`, `src/domain/history-refine.test.ts`, `tests/db/match-timeline.test.ts`, `tests/db/privacy-erasure.test.ts`, `tests/db/match-history.test.ts`, `tests/db/participant-ranks.test.ts`, `tests/db/profile-encounters.test.ts` and `tests/db/encounter-permissions.test.ts` (players met in other games); browser tests through `e2e/match-history.ts`, and `e2e/encounters.spec.ts` for the marks.
- **Both teams on match cards** (`TeamComposition`, `src/components/match-history/team-composition.tsx`; data from `src/server/matches/compositions.ts`):
  - **Where:** a player's Match History and Team → Matches show the same preview, blue then red, each in lane order with the name Riot gave for every player.
  - **Marking:** the player the list is about is in bold. UNIIVERSE team members (found by their linked Riot accounts, `teamMembersByPuuid`, one query) are in the accent colour under their profile name. That side is tinted.
  - **Missing data:** a name Riot did not provide falls back to the champion's name, in a quieter colour. Nothing is guessed, and the cards say nothing about who queued together (only a game's scoreboard shows possible groups, below).
  - **Data:** stored match details only, never a Riot request. Match History builds it from the details it already loads for the page. Team → Matches reduces the shown games' participants to five fields inside the database (`loadCompositionParticipants`, one query).
  - **Layouts:** Match History cards use the list's own width (container `mh`): wide cards from 50rem, with the compact build from 56rem. Below 50rem the card stacks, and on phones the teams are one line of icons (names read by screen readers).
  - **Team → Matches** uses the one-line "strip" variant under each game.
  - **Without the full record,** the card says so instead of showing empty slots.
  - **Tests:** `e2e/match-teams.spec.ts`; `tests/db/match-history.test.ts`.
- **Player links in completed matches** (`PlayerLink`, `src/components/match-history/player-link.tsx`; rules in `src/domain/opgg.ts`):
  - **Where:** the team previews in Match History and Team → Matches, and a game's scoreboard (under its Match History card, or in the match window).
  - **Link targets:**
    - An active UNIIVERSE profile opens that profile. Beside the name, a small separate arrow (`data-testid="player-opgg"`) opens the member's OP.GG profile (26 Oct 2026): for a mouse and the keyboard only (`pointer-coarse:hidden`, as a touch target it would be too small beside the name; the profile's Riot Accounts tab and the window's "View Match History on OP.GG" have it on touch screens). In previews it is `tabIndex=-1` like the other preview links; in a scoreboard it follows the name in the tab order.
    - A non-member opens their OP.GG profile in a new tab (`noopener noreferrer`, a small arrow icon). The link is built from the Riot ID recorded in the match and the server in the match id (`OC1_…` → `oce`).
    - **The newest known Riot ID wins** (`knownRiotIds`, `src/server/players/riot-names.ts`; `opggLinkFor`): a linked account's Riot ID (on its server when `platform_source = 'riot'`, else the match's server), otherwise the newest full `Name#TAG` from a later stored game (found through the players' index, `playedIn`), only from real Riot match ids (a demo game's made-up name, or a record where Riot left the tag out, hides no older full one). Demo accounts (`label` or `sync_status` "demo") never count. Encounters lists only players without a linked account, so its window uses the newer-game rule alone.
    - Otherwise the name is plain text: no well-formed `Name#TAG`, an unknown server, or a demo `DEMO_` match. A well-formed Riot ID (`riotIdProblem`, 26 Oct 2026): exactly one "#"; a game name of 1–16 characters as Riot counts them (graphemes: Thai vowel signs and decomposed accents count with their letter), no control or invisible formatting characters except the zero-width joiner and non-joiner that Arabic, Persian and Indic names need; a tag of 2–5 letters or digits in any script, each with its marks (Riot's support pages give 3–5 for a tag people choose, but Riot's own account records hold 2-character tags: in `data-audit` on 26 Oct 2026, 8 of 18 linked accounts had one as Riot's account record gives it, and 1,779 players recorded the same 2-letter tag in every game, none cut from a longer one; links accept them since then). `riotIdProblem` names the reason a name makes no link (`no-name`, `no-tag`, `tag-length`, `tag-characters`, `name-length`, `name-characters`).
  - **Coverage:** `data-audit` → `opggLinks` (counts only): of the places in the last 30 days' stored Riot games, how many have a link by linked account, newer Riot ID or recorded Riot ID, how many have none and why (with `tagLengths`: the tags outside 2–5 characters by server, length and kind, e.g. `na1 1 digits`), what those short tags are (`shortTags`: the linked accounts' tags as Riot's account record confirms them; the players seen with a short tag, whether each recorded that tag in every game, also a longer tag starting with it, or another tag, and whether a linked account's confirmed tag is the short one; how many different short tags there are and how many players hold the most common one; no tag is shown), how many names the 26 Oct rule newly accepts, and how many players renamed since a game. A link only says the address is well formed: OP.GG can still show "not found" for an account it has not indexed.
  - **A player's own history on OP.GG** (`OpggHistoryLink`): "View Match History on OP.GG · <account>" in a game's breakdown (the account that played the game; under the card in Match History, in the match window from Team → Matches and Matchups). Match History's header has no such button since 23 October 2026: the filters end it, and the games follow. OP.GG has no address for one game that can be built from Riot's match id, so no link claims to open the game.
  - **Data:** stored data only. No Riot or OP.GG request.
  - **Policy:** see `docs/RIOT_COMPLIANCE.md` → Player links.
  - **Match History card:** a box rather than a `<button>`, because links cannot sit inside a button. A click anywhere but on a link opens the game under the card, and another closes it (29 Oct 2026; until then a window). The button behind the content is the card for the keyboard and screen readers: one tab stop, Enter or Space opens and closes it (`aria-expanded`), and its outline marks the card. Item and spell tooltips keep working.
  - **Keyboard:** preview links are `tabIndex=-1`, so the keyboard still moves card by card. The scoreboard's links are in the tab order.
  - **Tests:** `src/domain/opgg.test.ts` (real-world IDs: Hangul, kana, Cyrillic tags, symbols, reserved URL characters, Thai and Persian names, decomposed accents, the 16-character limit); `tests/db/match-history.test.ts` (renames, tag-less and demo records, an unconfirmed server, demo accounts); `tests/db/opgg-coverage.test.ts`; `e2e/match-teams.spec.ts`; `e2e/match-card-ranks.spec.ts` (a member's OP.GG link opens a new tab and never the match; hidden on touch).
- **Possible groups in completed matches** (rules `src/domain/possible-groups.ts`, loader `src/server/matches/possible-groups.ts`, action `getMatchGroupsAction`):
  - **What:** in a game's scoreboard, players **outside UNIIVERSE** on one team who were all on one team in at least 3 stored games of the 180 days before the match (never the match itself or later games), and at least three times as often as teammates as opponents. Anyone whose Riot account is linked to a profile (`riot_accounts.owner_type = 'player'`) is never assessed or labelled (October 2026; read on every request, and part of the cache key, so a newly linked account is excluded at once). Labelled "Possible duo/trio/four-player/five-player group" with "These three players appeared on the same team in four previous recorded games." (`groupEvidenceText`); the line opens the evidence games (date, queue, result; ten at most). The rows get a thin coloured marker. A note under the scoreboard gives the number of stored games searched and says it is an inference; a side without a group reads "not enough recorded history to assess", a side of members "no other players to assess".
  - **Queues:** Solo/Duo duos only; Flex 2, 3 or 5; normals, ARAM, Quickplay and Swiftplay up to 5; Clash stated as registered teams; other queues not assessed. One group per player; equally supported overlapping groups are both left out.
  - **Data:** one query over `match_details` (participants of the stored games in the window, filtered to the PUUIDs of this match's players outside UNIIVERSE), no Riot request. The players' index (`match_details_puuids_idx`, migration 0058: a GIN index on `jsonb_path_query_array(participants, '$[*].puuid')`, matched by `playedIn` in `src/server/accounts/match-details.ts`) finds the records those players appear in, so only their games are opened; before it, every record in the window was unpacked. PUUIDs stay server-side; the page gets `DetailParticipant.slot` (position in the stored record). Names come from the analysed match only (no historic Riot IDs).
  - **Performance:** a separate request after the scoreboard renders, never during the Match History list. Server cache 30 minutes per match (300 matches); the list's browser cache keeps it with the match details, so reopening makes no request. `perf-probe` → `matches.possibleGroups` measures the uncached query on the newest stored game. Before the players' index it unpacked every record in the window: 1,917 ms cold in production (26 Oct 2026); locally, 54 ms before and 0.2 ms after for 7,300 synthetic records (docs/PERFORMANCE.md → "Stored game records: the players' index").
  - **Policy and the Match-V5 option:** `docs/RIOT_COMPLIANCE.md` → Possible groups. Fetching participants' own histories was evaluated and not built: it needs a product-registration update by the owner and would compete with ingestion for the rate budget.
  - **Demo:** a pair of rivals ("Demo Duo 1/2") meets each demo player in every third personal game; other demo players are new in every game.
  - **Tests:** `src/domain/possible-groups.test.ts`; `tests/db/possible-groups.test.ts`; `e2e/possible-groups.spec.ts`.
- **Ranks in a game's scoreboard** (24 Oct 2026; under its Match History card since 29 Oct, or in the match window; `src/server/players/participant-ranks.ts`, `src/domain/known-rank.ts`, `getMatchRanksAction`):
  - **What:** one compact badge per player in the scoreboard, under the name: "Gold 2", "GM", "Plat 4 · Aug" (over 30 days old), with "Flex" or "Solo" in front when the rank is from the other ranked queue than the game's; "Unranked" when a check found no Solo/Duo or Flex entry; "—" when no rank was ever read. Hover (and screen readers) give the queue, the rank in full with LP, the date and "checked" or "last seen". A ranked crest precedes the tier. The note under the scoreboard: "Current Ranked Solo/Duo ranks (Flex where marked), checked …: not the ranks players had in this game, which Riot's match records do not include." ("Last-known" instead of "Current" while any rank shown is over 3 days old.)
  - **Data:** stored readings first (members' last sync, `last_known_ranks`). When a player has no check in the last 3 days, the breakdown asks the server once it opens; the server checks only those players of that one match with LEAGUE-V4 and keeps the answer. While the check runs, a player with no stored rank shows a dashed placeholder and an older stored rank stays shown until it is replaced; the note says when checks were skipped (daily limit used up, Riot busy) or failed. Phones show no hover text, so the note's check dates and the month on ranks over 30 days old carry the age there.
  - **Limits:** 1,000 checks in any 24 hours across the site, half of each rate-limit window (an opened match never waits; the `rank-checks` job waits only for the one-second window to turn over, within its 15 s), no retries, a 4 s timeout, a 30-minute pause per failed player (a day when Riot cannot read the PUUID with the current key) and 10 minutes for all after a rejected key (`docs/RIOT_COMPLIANCE.md` → Ranks in completed matches). Nothing on the Match History list asks Riot.
  - **Permissions:** the same as the match details (your own history, or a teammate's with `view-teammate-stats`); PUUIDs stay on the server; never on the public pages. Erased people are never asked about, and erasure deletes their row.
  - **Coverage and usage:** `data-audit` → `participantRanks` (counts only).
  - **Tests:** `src/domain/known-rank.test.ts`; `tests/db/participant-ranks.test.ts`; `e2e/match-ranks.spec.ts`.
- **Players' ranks on the collapsed Match History cards** (26 Oct 2026, teammates since 29 Oct; `RankShort` in `src/components/match-history/rank-short.tsx`, `rankShortLabel` in `src/domain/known-rank.ts`):
  - **What:** each opponent's current or last-checked rank in a few letters: the tier's letter and division ("E2", "P1", "I3"), "M", "GM" or "C" for the apex tiers, a small grey "f" or "s" after it when the rank is from the other ranked queue than the game's (Flex or Solo/Duo), and "Unr" when a check found no ranked entry. Nothing when no rank was read. Colour: the tier's (`--color-tier-*` in `globals.css`, each at least 5.3:1 on the card surfaces); "Unr" and ranks read over 30 days ago in the caption colour. Hover: the scoreboard's full statement ("Ranked Solo/Duo: Emerald II, 50 LP, checked 26 Oct 2026. Their rank then, not at the time of this match"); screen readers hear "Emerald 2" (or "Emerald 2 in Flex", "unranked") in the card's description. Everyone but the player the list is about (opponents only until 29 Oct 2026; the player's own rank is in the profile header); removed players never carry a rank. Team → Matches shows none.
  - **Data:** stored readings only, the same as the scoreboard's (`storedRankReadings` for the page's other players: three indexed queries for the page). Listing, paging and scrolling never call Riot, and no rank check runs until a game is opened (hovering a card only fetches that match's details ahead). An opened game's check shows on its card as soon as it arrives (`MatchHistoryView` merges it by `CompSlot.slot`) and from storage on the next load.
  - **Layout:** with the names shown, the rank closes the name's line (after the name where a side is one line of five, at the end of the line where each player has a line), so the card's height does not change. On phones, and in a list too narrow for names, it sits in a 10 px line under each opponent's icon (an empty line where nothing is known, so the icons stay level), and both sides' icons stay on one line: such a card is 11 px taller (measured: 162.5 → 173.5 px at 375 and 390 px), and only once a rank is known.
  - **Tests:** `src/domain/known-rank.test.ts` → "an opponent's rank in a collapsed match card"; `tests/db/participant-ranks.test.ts` → "opponents' ranks on the collapsed match cards" (storage only, opponents only, a check shows on the next load, the Flex game's queue, unranked versus never read); `e2e/match-card-ranks.spec.ts` (the window's check on its card, the same statement as the window, tier colours, screen-reader text, phone and wide layouts without overlap or sideways scroll, the card's height, a reload from storage with no action called).
- **Ranked Flex:** Riot queue 440 is Ranked Flex everywhere (ingestion, `queueGroupFor`, `QUEUE_LABELS`, season modes, leaderboards, Played Together, Matchups); 420 is Solo/Duo. No game is called a premade five. `data-audit` → `queueClassification` reports the stored counts per queue and any game whose queue differs from its match details. ("Ranked 5s" was a draft category of the removed Draft feature, never a Riot queue.)

### G3a. Account order (migration `0037_account_order`, `src/domain/account-order.ts`)

- One order for a player's linked accounts: the Main first, then the alternatives in the order the player set (Riot Accounts → Move up/down buttons, `reorderAccountsAction`, same permission as making an account Main). Accounts never reordered fall back to the order they were linked.
- `listAccountsForPlayer(s)` return that order, so every account list follows it: Riot Accounts, Match History, All Champions, Overview, the champion window (Refine and per-account breakdown), Ranked progression, recent performance. "All accounts" aggregates are unchanged.
- `riot_accounts.sort_order` is nullable and presentation only: no game, statistic, label or owner changes. Making an alternative Main swaps it with the former Main; removing the Main promotes the first alternative; replacing a Riot ID keeps the account's place.

### G4. Team screen (`src/components/team/team-roster.tsx`, `src/server/team/roster.ts`)

- **Main lineup:** five role cards (only Main-group players), lineup changed via a menu by `manage-lineup` holders (e.g. the Team Lineup Manager group).
- **Header (October 2026):** the team logo, name and the lineup's state, with Edit lineup beside them.
  - The logo is drawn whole at its own proportions in a square (`BrandMark`, `object-contain`): 48px on phones, 44px held sideways, 64px on tablets, 80px on desktops. `BrandImage`'s `<picture>` takes no part in the layout (`display: contents`), so a crowded header can no longer squeeze it. That squeeze was the cause of the logo drawn taller than wide.
  - Its `<source>` (the still frame) takes no part either: it is not displayed (`hidden`). The browser picks a source by its `media` attribute, never its style. Until 26 Oct 2026 the source was an empty box of its own in the parent's layout. In a flex row it took the row's gap before the logo: the sidebar's logo sat 0.75rem off the icons' line, and the logo was pushed along in the phone and tablet top bar, the public header, the sign-in window and the Team tabs. On the sign-in page it put the logo and name 6px off centre. In this header's grid it added an empty row: 4px more height on desktops, 10px on phones.
  - It animates on every screen, phones included. Only reduced motion gets the still frame (`STILL_MEDIA`). Phones held either way used to get the still frame too, chosen while browsers were sent the 7.4 MB GIF itself; they now get the animated web copy (about 0.5 MB).
  - The line under the name wraps between whole items ("Main lineup · season", then the state as a small pill), so no separator is left at the end of a line.
- **Phones:** a bar of the five roles (48px tall, the current one marked) above one swipe track. Each card snaps to the centre with an equal glimpse of its neighbours, the bar follows the swipe and a tap on it moves to that player. Tests: `e2e/team-layout.spec.ts` (track, snap and centring, glimpse, role bar, no sideways page scroll) and `e2e/team-logo.spec.ts` (a two-frame GIF twice as wide as tall: square, whole and animated on phone, phone sideways, tablet and desktop; the still frame with reduced motion).
- **Cards:** the artwork with role, picture, name and rank, then one body that continues the art (the card accent fades down from it): the season in the **assigned lineup role** as one row (win rate with record, KDA with kills / deaths / assists per game, CS per minute or average vision for Support) with a win/loss bar and the number of games (`CardPerformance`), then the **pool for that role** with the first choice featured (portrait, name and its games and win rate in the role) and the rest as portraits that fit (`CardPool`). The Card Studio preview uses the same pieces. Every filled card has the same parts, so cards in a row line up; no game in the role this season and no champion chosen are said plainly instead of dashes. Empty roles list their suggestions one line each (reasons on hover and for screen readers), so a vacancy no longer stretches its row (production's empty Support slot made the other cards of its row taller, which was the empty space under their figures).
- **Player window (an expanded player identity, October 2026):** one identity block, the player's card opened up: their saved artwork and colours (static crop, no card effects or blur) behind the role, avatar, name, rank and status, Full profile as the main action, the lineup position and the last ranked change, and this season's figures in the same block (three headline figures, the win/loss bar, a quiet line: games, damage, the other of vision and CS). Below it the pool as tiles (`PoolChampionTile`): the first choice a wide tile in the card's colour, the rest two to a row, each with its place, experience label and figures. Previous / next (buttons and arrow keys), keyboard, focus return and reduced motion are those of the shared DetailModal; the window is as tall as its content on desktop (the whole screen on phones).
- **Strength tags were removed in Phase 9** (by the user's choice), with their code (`player-tags.ts`, `team/tags.ts`); the unused `player_tags` table is kept.
- **Empty roles:** advisory suggestions of registered players who could fill them (`src/domain/team-advice.ts`); never auto-assigned. Production: the Support slot is empty.

### G5. Ranked Development: removed (October 2026)

- **Removed on 29 Oct 2026,** with Solo Queue Blocks and the Ranked Improvement journal before it:
  the My Profile section (Overview, Sessions, Development), objectives, If–Then plans, reviews,
  session tracking, Match History's add-to-session button, the association of synced games with
  sessions after each sync, the private `development` freshness scope and its session polling,
  and the death times kept from match timelines for it. Its addresses redirect to `/overview`
  (`next.config.ts`).
- **Data kept:** `ranked_profiles`, `ranked_blocks`, `ranked_games`, `development_objectives` and
  `development_plans` stay, with their migrations; only permanent erasure still reads and writes
  them. `db-usage` lists them among `retired`. Deleting them is a separate step after a verified
  backup (`docs/RANKED_DEVELOPMENT.md`).
- **Patterns & Notes: removed (October 2026).** The `ranked_profiles.notes` column from migration
  `0039_patterns_notes` is retired, not dropped: nothing reads or writes it, and it stays so no
  player text is deleted unverified. Drop it in a later migration only after confirming production
  holds no notes.

### G6. Champion window and Matchups (All Champions → a champion; `src/components/players/champion-detail.tsx`, `lane-parts.tsx`, `opponent-picker.tsx`; `src/domain/matchups.ts`, `src/server/players/matchups.ts`; `docs/MATCHUPS.md`)

- **Where:** a row of All Champions opens the champion window (the shared `DetailModal`) in the list's scope and the row's role. The URL holds it (`champion`, `crole`, `tab`, `vs`); the old `/overview/matchups` and `/players/[id]/matchups` redirect into it (`matchupsRedirect` in `src/lib/nav.ts`), keeping champion, opponent and filters. Matchups is no longer a profile section.
- **Roles & champion pools open the same window.** A pool card on a profile Overview (`ProfilePools` in `src/components/players/profile-pools.tsx`) opens it in that pool's role, through the same hook and component as All Champions (`useChampionWindow` / `ChampionWindow` in `src/components/players/champion-window.tsx`), with the same server data (`getPlayerMatchups`, loaded by `profile-sections.tsx` only when the address names a champion). On the Overview the champion's key is `champ` (`champion` is already the Overview's stats filter); `crole`, `tab` and `vs` are shared. There is one window and one data path, never a second champion popup.
- **Pool rows (cards in the setup forms): inspect, drag, remove, add** (`SortablePool` with `onInspect`):
  - **Inspect:** the whole row (or card) is a link to the champion's window address (`pool-inspect`, `aria-haspopup="dialog"`, reached with Tab, opened with Enter or a tap). Once the page is interactive the window opens in place; a click that lands before that still works, because it loads the address and the server opens the window. The name underlines on hover.
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
  - Frames are stored compactly in `match_timelines.frames` (migration `0036`); kill times in each participant entry and the teams' objectives in `match_timelines.events` (migration `0060`, Match History 2.0).
  - Coverage by game age is in `data-audit` → `matchups`.
- **Alignment:** at exact timestamps, never by frame index. Pattern sentences need at least 5 games, and there are no grades or advice.

---

## SECTION H — UI AND DESIGN SYSTEM

### H1. Visual identity (`src/app/globals.css`, Tailwind v4 `@theme`)

- **Aesthetic:** a premium dark "esports client" look on a deep ink with a faint indigo undertone (2 Nov 2026, after a brief neutral charcoal; navy before that). The identity is a pair: the brand blue (accent) for what is selected or can be acted on, violet (accent-2) for the light: the page's ambient glow, the brand gradient (accent to accent-2) on selected tabs, the sorted column and the headline card's top edge, the rank chart's line. Each surface is one visible step lighter than the one below it, and panels have depth (`panel-depth`: a faint top sheen, a hairline of light on the top edge, a soft shadow). Colour carries meaning (the brand, the sides and results of a match, states); the light stays at the edges (ambient glow, the banner's own colours spilling onto the top of a profile, player cards' art), and dense data sits on opaque panels. Motion is short and purposeful (hover lifts and tints, the tab indicator), instant with reduced motion.
- **Colour tokens:**

  | Group | Tokens |
  |---|---|
  | Backgrounds | `bg #0a0b12`, `surface #12131c`, `bg-elevated #181a25` (fields, menus, popovers: a step above the panels), `surface-2 #1b1d29`, `surface-3 #252837` |
  | Borders | `border #262939` (structure), `border-strong #3a3e53` (emphasis), `border-control #646a8c` (fields and toolbar controls, 3:1 on the page, panels and popovers) |
  | Text | `fg #eef0f6`, `fg-muted #b4b8c9`, `fg-subtle #8f95aa` (4.5:1 or more on every surface; 4.9:1 on `surface-3`) |
  | Accent | `accent #1fc3ff` (brand blue), `accent-strong #7fdcff`, `accent-2 #9a7dff` (violet), `highlight #7fdcff` |
  | Sides and results | `blue #6e9dff` (Victory), `red #f26b7e` (Defeat), always with the word |
  | Status | `good #45cf8f`, `warn #ebba4f`, `bad #f26b7e`, `info #5eaef5` |

  Branding can override the primary/secondary accent, background, surface and highlight. Overrides go through contrast checks (`brandThemeCss` in `src/domain/branding.ts`); a custom surface derives the other shades, and a custom background or surface derives `border-control` to keep 3:1 (`controlEdge`). An install that saved the old navy as its own colours keeps it until Admin → Branding → Reset.
- **Typography:** Inter Variable; system monospace for numbers and IDs. The smallest text is `text-2xs` (11px: chips, badges, captions, column headings); `text-4xs` (10px) is only for letters inside small tiles. A scoreboard's figures are 12px or larger.
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
| InfoTip (ⓘ, hover/focus/tap), Metric, SaveStatus (autosave state), Skeleton, FreshnessWatcher (pages that update themselves) | `src/components/ui/*` | profiles, team pages, admin |
| Champion grid / selector (search, Riot role filter), SortablePool | `src/components/champions/*` | profile editing, Welcome, Card Studio |
| ChampionPortrait, RoleIcon | `src/components/champion-portrait.tsx`, `role-icon.tsx` | everywhere |
| CardArtLayer, CustomiseCardButton, ProfileHeader, PlayerSummaryCard | `src/components/players/*` | Team, Players, profiles |
| Navigation: CollapsibleSidebar, NavGroupSection, AccountMenu, MobileNav | `src/components/*` | app shell |
| Class helpers `cn` / `withDefaults` (caller classes replace defaults; no class-merge library) | `src/lib/cn.ts` | components |
| **FilterBar / FilterField**, **SearchInput** | `src/components/ui/filter-bar.tsx`, `search-input.tsx` | Players, profile Overview / All Champions / Match History, Leaderboards, Matches (both tabs); SearchInput also on Admin → People and the skin search |
| Segmented (`segmentedGroupClass`, `segmentClass`, `RoleSegmented`), filter chips (`chipClass`), TabLinks | `src/components/ui/segmented.tsx`, `tab-links.tsx` | every filter and section switch |
| **DetailModal** (the one detail window), `AfterOpen` | `src/components/ui/detail-modal.tsx` | Team player window, Match History / Team Matches / champion window match details, Card Studio |

**Detail windows (one behaviour everywhere).** `DetailModal` is the site's only detail window: centred over the dimmed page on wider screens, the whole screen on phones (`compact` stays a card). Sizes by content: `compact`, `standard` (a player), `wide` (a match or a champion: a fixed height, so tabs never make it jump), `full`. Native modal `<dialog>`: focus trapped, Escape, the close button and the backdrop close it (with `canClose` for unsaved edits), focus returns to the element that opened it, the page behind does not scroll or shift. Motion: `modal-in` (180 ms fade and slight rise/scale) and `modal-out` (140 ms), none under reduced motion.
- *The close button's corner* (October 2026): the close button is always the top-right control, 36px (44px on touch screens), and nothing else comes within 12px of the corner's controls. The window's own navigation (`headerExtra`: Back, previous / next) sits left of it past a thin divider; links and actions about the content (OP.GG, Full profile) belong in the header's content, never in the corner. DetailModal measures the controls before the window is first drawn (their size differs on touch screens, and a Back label varies) into `--modal-clear-right` and `--modal-clear-top`; a custom header uses `CLEAR_OF_CONTROLS` for content beside them, `BELOW_CONTROLS` for content that starts under them (the Team player window's picture header), `BELOW_CONTROLS_ON_PHONES` for a header that does so on phones only (the match window with Back). The plain `Dialog` keeps 12px between its title and its close button. Checked by the e2e spec `modal-close-area` on every window (phone, phone held sideways, tablet, desktop).
- *Focus across windows that replace each other:* a window that opens in the same render as another one closes (a game opened from a player's Encounters, and Back to them) finds focus on the page itself, so it takes over the closed window's opener (`handedOver`); Escape on the last of them returns focus to the row that opened the first.
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
| Players | `/players` | Directory cards (1 to 4 columns from the directory's own width; each card's regions level with its neighbours'), search, role chips, Main lineup filter, show archived | `manage-players` for archive/group | |
| Player profile | `/players/[id]` (+ `/champions`, `/accounts`) | Hero header + tabs Overview / Champions & Roles / Riot Accounts | own or `manage-players` | Opening your own id redirects to `/overview` |
| My Profile | `/overview` (+ `/champions`, `/accounts`) | Same as above for yourself; statistics with filters | self | Accounts without a profile see "complete your profile" |
| Matches | `/matches` | Played together (with bookmarks); `?view=encounters` opens your profile's Encounters | `view-matches` (+ `view-teammate-stats` for Played together); bookmark removal by its creator or `manage-matches` | |
| Resources | `/resources` | The team's library of League of Legends sites in five sections (League of Legends, Summoner's Rift, ARAM, Arena, Esports): a panel per section of rows opening in a new tab, search, a section filter, favourites kept in the browser; no management controls on the page | every signed-in account; managed in Admin Mode → Platform Settings → Resources (`manage-branding`) | `docs/ARCHITECTURE.md` (Resources) |
| Settings | `/settings` | Username, password, profile picture, sign out | self | Riot accounts moved to the profile |
| Admin Mode | `/admin`, `/admin/people` (+ `/access`), `/admin/branding`, `/admin/previews`, `/admin/data`, `/admin/system`, `/admin/audit`, `/admin/settings` | Dashboard, Users & Permissions, Platform Settings, Data & Integrations, System Health, Audit Logs | administrators | "Switch to Admin Mode" in the sidebar, the tablet menu, the phone's account sheet or Settings (C2a) |
| Auth | `/login`, `/setup`, `/recover`, `/welcome` | Sign-in, first-run Owner setup, Owner recovery, onboarding | — | |

**Redirects kept for old links:**
- `/overview/development/*`, `/overview/blocks/*`, `/blocks/*`, `/ranked/*` → `/overview` (Ranked Development is retired; `next.config.ts`)
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
  - < 640 phone: top bar (the menu button at its left end) + a drawer from the left + a 3-tab bottom bar.
    - The tabs are Team, Players, Leaderboards, Matches and Profile (`PHONE_TABS`); Resources, Settings, Install App, the mode switch and Sign out are in the account sheet behind the avatar (docs/MOBILE.md, November 2026).
    - Team stays marked on its own tabs: Players, Leaderboards and Matches.
  - 640–767 large phone.
  - 768–1023 tablet: top bar + drawer, no tab bar.
  - ≥ 1024: collapsible sidebar (groups remembered in a cookie; Ctrl+\\ toggles).
- **Sidebar collapse and expand** (`src/components/collapsible-sidebar.tsx`):
  - **Control:** under the logo, in the icon column, so it is in the same place open or collapsed (test id `sidebar-toggle`; label "Collapse sidebar", "Open sidebar" or, while peeking, "Keep sidebar open"; Ctrl+\\ or ⌘\\ shown beside it).
  - **Motion:** a window with `overflow: clip` (`sidebar-window`) slides to move the visible edge, and the content inside it slides back by the same amount on the same curve, so it stays still while the edge passes. Both are transforms, so the compositor runs them. The edge clips the labels and the current page's highlight in every frame. The page takes its new width at once, under the opaque panel.
  - **Why `clip`, not `hidden`:** focus or `scrollIntoView` can scroll an `overflow: hidden` box, which would shift the content sideways under the edge.
  - **The bug this replaced:** the old clip switched 220 ms after the slide began. While collapsing, the current entry's highlight and the fading labels stood out over the page in that time; on Team it showed as a band across the page.
  - **Tests:** `e2e/sidebar-motion.spec.ts` freezes the transitions frame by frame on five pages. It also checks the control's position, keyboard use, rapid toggles and reduced motion.
  - **Logo (26 Oct 2026):** centred in a column as wide as the rail, from the sidebar's left edge (`SIDEBAR_RAIL_COLUMN` in `src/lib/sidebar.ts`; the slot's collapsed width is the same `SIDEBAR_RAIL`). Collapsed, it sits on the rail's centre line, which is the icons' line, whatever the logo's size and the browser's text size. It is in the same place open, collapsed and in every frame of the slide or the hover preview; open, the team's name follows the column. The brand link starts at the sidebar's edge, so it draws its focus ring inside itself (`-outline-offset-2`), where the window's edge cannot clip it.
    - **The bug this replaced:** with an uploaded logo, the logo sat 0.75rem right of the icons, open and collapsed (12px at 1440px, 15.4px at 2560px). The letter mark was centred. The cause was `BrandImage`'s still-frame `<source>` (G4): it took the brand row's gap before the logo.
    - **Tests:** `e2e/team-logo.spec.ts` uploads an animated logo and checks it against the rail and the icons at 1024, 1440, 1920 and 2560px, collapsed and open, and frame by frame through a collapse and an expand. `e2e/sidebar-motion.spec.ts` checks the letter mark, and `e2e/webkit.spec.ts` the uploaded logo in Safari's engine.
- **Leaderboards Highlights tiles** (`HighlightsGrid` in `src/components/leaderboards/leaderboards.tsx`):
  - **Order:** every tile reads the same way, in rows of its own: (1) the statistic, in full; (2) the leader's identity section, like the top of their player card (their artwork as a restrained static crop opening up to the right, the avatar ringed in their colour, crown, name, role and rank; the tile's top edge in their colour); (3) the winning value in their colour and its sample; (4) your place ("You · 3rd of 7", or "You: not ranked") and the runner-up.
  - **Board rows** (from tablets up) carry a faded crop of the player's own artwork behind the value end, never a full card per row; the podium keeps the top three on their artwork.
  - **Alignment:** the rows line up across tiles side by side (CSS subgrid), so a statistic name that wraps moves that line's leaders down together instead of overlapping them.
  - **Grid:** as many 16.5rem tiles as fit (`repeat(auto-fill, minmax(min(100%, 16.5rem), 1fr))`): five at 1920, four at 1440, three at 1366, one on phones.
  - **Category rail:** the statistic gets the full width; the leader and a compact "You · 2nd" share the line below it.
- **Team navigation:** the sidebar has one Team entry (`NavHub` in `src/lib/nav.ts`): it opens Team Overview and stays marked on every Team section and on pages inside them (a teammate's profile). Below it, **Resources** is an entry of its own (Clash Scout, which sat between them, was removed on 23 Oct 2026; its addresses are not found). The sections are tabs at the top of each Team page, in this order: Overview, Players, Leaderboards, Matches (`SectionTabs` in `src/components/section-tabs.tsx`, rendered by the app shell on those four addresses only, filtered by the same permissions as before; the team's pages are Player Mode's only). Every section keeps its own address, so direct links, Back and Forward work. Team Overview stays the team's home page (its header with the logo and the five lineup cards); the other sections name the team at the right end of the bar instead of repeating the header. Phones scroll the bar sideways with a fading edge. Pages inside a section (a profile, a match) have no tabs.
- **Team Overview as the team's home** (`TeamRoster`, `src/components/team/team-roster.tsx`):
  - **Five across, centred** (content ≥ 64rem, which covers 1366 and 1440 laptops with the sidebar open): one row of equal portrait cards, capped at 84rem and centred, with the header sharing that width (`LINEUP_WIDTH`). The rem scales with very large screens (`html` font-size clamp), so the whole lineup scales with them rather than stretching. Artwork height `clamp(13rem, 29vh, 20rem)`, queried on the named `lineup` container.
  - **Vertical centring (desktop, October 2026):** the header and the cards are one composition, centred in the window: the frame (`lineup-frame`) takes the height left under the section tabs (on this page only, `main` and the page wrapper are flex columns: `lg:has-[[data-testid=lineup-frame]]:flex`) and centres its content (flex, no absolute positioning), so there is as much room above the header as below the cards and the header stays right above them (checked at 1440 × 900 and 1920 × 1080). On a shorter window the content is taller than that minimum, starts at the top and scrolls. The floor's light is clipped at the frame (`overflow-y-clip`) so it never adds a scroll.
  - **The player's identity on every card** (`CardIdentity` in `src/components/players/player-card.tsx`, 22 Oct 2026): one block, in one order, on Team (both sides of a card), the public page, Players and the Studio and setup previews:
    1. the picture ("You" as a tag on it) with the player's social links on the same row at its far end, never on a row with the name;
    2. the name across the card's whole width, never cut or ellipsised (`CardName`: as many lines as it needs, balanced, a long gamer tag breaking where its parts meet, `nameParts`);
    3. the rank, the role status and the back's "Sub", wrapping as a group, so no label is cut or drawn over another;
    4. the tagline, wrapping (`CardTagline`: 40 characters, two lines on the narrowest card).

    Sizes follow the card's own width (each card is a `card` container): from 17rem the name, tagline, labels and link icons take a step up (icons 1.75rem → 2rem, a step more on touch screens, where each also has a 44px target). Nothing is shrunk to fit; a longer name or tagline takes another line and the artwork grows. The Team player window's header uses the same block with the picture beside it (`layout="side"`). Narrow-card rules elsewhere (`@max-[15rem]/card:`) stay in `CardPerformance` and the pool row (tighter labels, the pool count without the word "champions").
  - **Level rows:** where cards stand side by side (the lineup from `@xl`), each card's name and tagline take as much height as the tallest among everyone the lineup can show, starters and substitutes (`CardIdentity align`: their names and taglines drawn invisibly behind its own, up to two lines each). So a name that wraps, or a tagline only one player has, never lifts that card's picture, name and labels above the others', and their artwork and the figures under it stay level; nothing is kept when nobody needs it. The tagline comes last, so room kept for one sits at the identity's foot. A name of three lines (very long, five across) moves its own card's parts by that third line only: its picture and name up while the artwork keeps its height, or its labels down once the artwork grows. Five across, a card with both Customise and the turn control (your own, with a substitute) keeps more room at the top of its artwork, where the two controls stand one above the other.
  - **The floor** (`lineup-stage-floor`, `aria-hidden`, absolutely placed under the cards): lit from just under them in the team's colour and carrying the team's name faintly (or the logo when one is set). It is decoration only and never sizes a card or the page.
  - **Unchanged:** 2 + 2 + 1 and 3 + 2 between 36 and 64rem (tablets) and the phone track.
  - **Background visibility** (team branding: `Branding.backdropLevel`, 0–100, default 50; `src/lib/backdrop.ts`): how much of the app background shows behind **every page** (October 2026; before, only Team Overview), the same for every member.
    - **Where it is set:** Admin → Branding → "Background visibility" (`BackdropSetting` in `src/components/settings/branding-panel.tsx`), shown once an app background is uploaded. The slider is part of the branding form: Save branding applies it for everyone, Cancel changes discards it, "Reset to default" sets 50% (saved with the next Save), and "Reset to UNIIVERSE defaults" resets it with the names and colours.
    - **Live preview:** while the slider moves, the branding page's own backdrop shows the level (a `<style>` only that page renders, after the shell's, so it wins). Nobody else sees an unsaved value.
    - **Storage and permissions:** saved with the rest of the branding in `app_settings` (key `branding`, JSON; no migration) by `saveBrandingAction`, which requires `manage-branding` (administrators only) on the server. `parseBranding` keeps it a whole number from 0 to 100 and falls back to 50.
    - **Rendering:** the app shell renders `backdropCss(level)` with every page (no flash) inside the backdrop: `--backdrop-art` (artwork opacity 0.5–1), `--backdrop-veil` (a flat veil in the page colour, 0.88–0.36) and `--backdrop-vignette` (0.6–0.25), plus a light fixed gradient at the bottom. What reaches the eye is about art × (1 − veil): 6% at 0, 29% at 50, 64% at 100 (`backdropVisibility`; the top keeps a veil so text sitting directly on bright artwork stays readable). Why it was too dark before: the level reached only Team Overview; every other page used 0.3 art under a 70–90% gradient veil (about 6%), and even 100% kept half of that veil plus an 85% vignette (about 35% at best, darker at the edges). Cards, panels and player-card art keep their own surfaces and images. Branding is cached per server instance for up to a minute, so another instance can show the previous value for that long.
    - **Earlier per-browser preference removed:** the Appearance popover and its cookie `uniiverse_team_backdrop` are gone; the cookie is no longer read, so an old value changes nothing.
    - Demo: the screenshot fixture draws an artwork (`src/server/demo/backdrop-art.ts`).
  - **Tests:** `e2e/home-layout.spec.ts` (1366 × 768 with the sidebar open, 1920, 2560), `e2e/team-layout.spec.ts`, `e2e/team-backdrop.spec.ts` (admin preview, Cancel, Save, a second team-member account before and after signing in again, an old cookie ignored, no access for a member, Reset to default, every page at the same level), `tests/db/branding-backdrop.test.ts` (stored server-side, the same for every viewer, refused without `manage-branding`, range, reset), `src/lib/backdrop.test.ts`.
- **Profile Overview, a dashboard** (`ProfileOverviewTab`, `SeasonSummary` and `OverviewDashboard` in `src/components/players/player-overview.tsx`; 2 Nov 2026):
  - **Heading:** Season performance with its scope line and data status, and the toolbar (game mode, Refine, Refresh), which govern the whole dashboard.
  - **Season card** (`PerformanceCard`, test id `season-figures`): one card in three bands. Headline: win rate (with a wins/losses bar), KDA and games, the page's largest figures. Supporting: CS/min, damage/min and vision, a size smaller. Kills: Total kills and the four multikill kinds in one row, all alike, with "By champion" at its end (on its own short line under 48rem). A faint brand line and wash in its top corner.
  - **Arrangement** (a container query on the dashboard, so the sidebar is allowed for): from 58rem two columns, the season card then the pools on the left, Recent form then Ranked progress in a 18–21rem column on the right, the first row level; narrower, one column in that order, each card in its own wider layout. A card without data is left out and the rest close up.
  - **Recent form:** the bars share the card's width; a win rises above a centre line and a loss hangs below it.
  - **Ranked progress** (`@container/rank`): the crest, rank and record, the rank changes, and the chart beside them from 34rem or under them in the narrow column. Without two readings there is no chart, one quiet line instead (in the chart's column when side by side), so the card never grows to keep a shape.
  - **Pools:** one row per champion (`SortablePool variant="rows"`): position, portrait, name, the champion's splash art fading along the row's left, and games, win rate, KDA and CS/min (vision for Support) under one row of column names (`<pool>-columns`; three columns in a narrow list). No Experience label. Edit, dragging, the keyboard, Add and the role menus are unchanged.
  - **Off roles:** one-line summaries (`PoolSection collapsible`, test ids `<pool>-preview`, `<pool>-expand`) whose portraits still open the champion window. "Show and edit" opens the full pool with adding, removing and reordering.
  - **Tests:** `e2e/home-layout.spec.ts`, `e2e/multikills.spec.ts`, `e2e/progress.spec.ts`.
- **Team navigation:** the sidebar has one Team entry; its sections (`TEAM_SECTIONS`) are tabs at the top of each of its pages. One component draws the tab bars: `SECTION_HUBS` in `src/lib/nav.ts` lists each entry that stands for several pages (key, accessible label, sections: Team, and Admin Mode's Platform Settings), and `currentTab` uses it so a section without its own phone tab marks its entry's first tabbed section. Neither mode has collapsible groups (Admin Mode's People and Site groups, and their `uniiverse_nav_closed` cookie, went with the six Admin Mode sections on 21 Oct 2026).
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
  - Per-instance TTL cache (`src/server/observability/cache.ts`) for champions, patch, branding, team, formats, pro patterns, shell facts and skins (10 min; kept only for champions in the game, as Card Studio asks for any id), invalidated by writers. A load that an invalidation or a newer load overtook still answers the requests waiting on it but is not kept, so a value read before a change never outlives the change on the instance that made it.
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
- erasure of the retired Ranked Development records;
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
| 10 | Unused schema leftovers (`primary_pool_limit`, `secondary_pool_limit`, `users.draft_lead`, `invites`, `activation_codes`) | Database | Low | None | schema | History | Leave, or drop in a careful later migration (the Draft tables and `teams.engine_config` went in migration `0063`, after a verified backup) | Accepted debt |
| 11 | Two pool tables (`player_champion_pools` + `player_role_pools`) | Database | Low | None (helpers hide it) | schema | Additional roles added later | Always use the roster helpers | Accepted debt |
| 12 | Cold statistics load ≈ 1.1 s (the Draft engine's provider) | Performance | — | Gone with Draft | perf-probe | — | — | Closed (Oct 2026) |

---

## SECTION L — DEVELOPMENT HISTORY

**Before the phases (1–13 Oct):**
- **Initial build:** engine, data pipelines, draft room, playbook, matches, branding.
- **Production-readiness, performance and responsive audits.**
- **Account changes:** email removed in favour of usernames; an Owner lockout was fixed, with a recovery path added.
- **Riot data:** global regions added.
- **Ranked Improvement journal** (later Solo Queue Blocks, then Ranked Development; removed 29 Oct 2026).

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
| Solo Queue Blocks redesign | **Removed** (29 Oct 2026, at the user's request, with Ranked Development, which it had become) |
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
| Team Matches | `src/server/matches/*`, `src/app/(app)/matches`, `src/components/matches/*` | account history, match details | `tests/db/played-together.test.ts`, `match-links.test.ts` |
| Encounters (profiles) | `src/server/players/encounters.ts`, `src/server/actions/encounters.ts`, `src/components/match-history/encounters-view.tsx` | account history, match details | `tests/db/profile-encounters.test.ts`, `encounter-permissions.test.ts` |
| Data pipelines and jobs | `src/server/jobs/*`, `src/server/accounts/*`, `src/server/riot/static/*` | Riot, Data Dragon | `tests/db/jobs.test.ts`, `automation.test.ts`, `static-sync.test.ts` |
| Branding | `src/domain/branding.ts`, `src/server/repositories/branding.ts`, `src/components/settings/branding-panel.tsx`, `src/app/api/branding/*` | — | `tests/db/branding.test.ts`, `src/domain/branding.test.ts` |
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
   - **Matches:** Played together (with bookmarks). Encounters are in each profile's Match History.
   - **Settings.**
   - **Admin Mode** (administrators): Dashboard, Users & Permissions, Platform Settings, Data & Integrations, System Health, Audit Logs.

5. **Removed: Draft.** The draft setup, Draft Room, engine, scouting, series, Playbook and drafted-match archive are gone. Migration `0063` dropped their tables on 4 Nov 2026, after a verified backup.
   **Removed: Meta & Trends** (19 Oct 2026). Solo Queue Meta, Duo Synergies, Pro Play and the global ranked, professional and aggregation jobs are gone; migration `0062` dropped 12 of their tables on 4 Nov 2026; the rest stay until the owner decides.
   **Removed: Clash Scout** (23 Oct 2026). Screenshot reading, opponent identification, saved scouts, the Testing Lab and the `lab-benchmark` job are gone; migration `0064` dropped their two tables, saved scouts and all, after a verified backup (`docs/CLASH_SCOUT.md`).

6. **Current Riot data status** (14 Oct):
   - **Player accounts:** 13 linked and fully synced.
   - **Open issues:** dead PH2/TH2 platforms waste time each run; the hourly GitHub schedule is unreliable (Supabase `pg_cron` recommended).

7. **Account / permission model.**
   - **Owner (one account):** everything, including accounts, passwords, permissions and site settings; always an administrator, and the only account that can change the Owner account.
   - **Administrators** (`users.is_admin`, since 21 Oct 2026): a permission on a normal player account, granted and removed by another administrator. Everything a player can do, plus Admin Mode; their profile and data stay theirs. Several are supported.
   - **Player Mode and Admin Mode:** the address decides (`/admin/*` is Admin Mode); administrators switch with "Switch to Admin Mode" / "Return to Player Mode"; nobody else sees Admin Mode named. See C2a.
   - **Everyone else:** team membership (team member or personal use), one base level (Standard Player / Team Manager / Restricted Player / custom levels / Custom ticks) plus optional additional groups (Team Lineup Manager, Match Manager, Player Manager). None opens Admin Mode. All enforced on the server.
   - **Accounts:** created only by administrators with a Riot-verified Riot ID and a 7-day temporary password; mandatory first-login setup.
   - **Never:** email, invitations, self sign-up.

8. **UI architecture.**
   - **Server components** with client islands (editors, menus, dialogs).
   - **Shell:** deep ink theme with a blue and violet identity; Inter; tokens in `src/app/globals.css`.
   - **Navigation:** collapsible sidebar (My Profile, one Team entry, Resources); the sections of Team as tabs at the top of its pages (`SectionTabs`, `SECTION_HUBS`, `TEAM_SECTIONS`); account menu; phone tab bar (Team, Players, Leaderboards, Matches, Profile) and account sheet (docs/MOBILE.md).
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
