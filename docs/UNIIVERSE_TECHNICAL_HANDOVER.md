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
| External data | Riot API (Account-V1, Summoner-V4, League-V4, Match-V5, Champion-Mastery-V4, Status-V4); Riot Data Dragon (champions, skins, images); Leaguepedia Cargo API (pro games) or Oracle's Elixir CSV |
| Image storage | Postgres `bytea` columns: profile pictures in `user_avatars`, branding in `brand_assets`, upload chunks in `brand_upload_chunks`. Champion art is hot-linked from Data Dragon. No object storage, no paid services. |
| UI components | In-house (`src/components/ui/*`); no component library |
| Tests | **Vitest 4** (unit + database), **Playwright 1.63** + `@axe-core/playwright` (browser, accessibility) |
| Build / tooling | pnpm 10.28, ESLint 9 (`eslint-config-next`), `tsx` for scripts, `drizzle-kit` for generating migrations |
| Runtime | Node ≥ 20.9 (production reports Node 24.21) |

### A2. Repository structure (the paths prompts most often need)

```
src/app/                    Next.js routes
  (app)/                    signed-in area, sharing one layout (sidebar/mobile nav)
    team/ players/ overview/ blocks/ trends/ draft/ matches/ settings/ admin/
  login/ setup/ recover/ welcome/ invite/      public or pre-auth pages
  api/health  api/jobs/[job]  api/drafts/[id]/stream  api/branding/*  api/avatars/[userId]  api/auth/logout
src/proxy.ts                sends anonymous visitors to /login (Next 16 "proxy" = middleware)
src/domain/                 PURE logic, no database (most of the unit tests live here)
  engine/                   recommendation engine (recommend, whyNot, bans, picks, search, timing, emergency…)
  proficiency/              player champion proficiency model
  champion-model/           curated champion traits; composition/ = team composition model
  draft/                    draft formats and sequences; roster/ = roles, eligibility, assignments
  scouting/                 enemy scouting assessments; playbook/ gameplan/ = Match Playbook
  season-stats.ts           statistics filtering (season/mode/role/scope/champion/account)
  team-advice.ts            empty-role suggestions (strength tags were removed in Phase 9)
  player-card.ts            card art, skins, accents; fearless.ts; series.ts; competition.ts
  branding.ts               branding model and contrast checks; password-policy.ts
src/server/                 everything that touches the database or the network
  db/schema/*.ts            Drizzle schema (one file per area); db/migrator.ts; db/migrations.generated.ts
  auth/                     sessions, passwords, permissions.ts, account-admin.ts, onboarding, throttle, recovery
  actions/*.ts              Server Actions (every mutation; each checks permissions on the server)
  repositories/*.ts         database reads and writes per area (users, permissions, team, drafts, skins…)
  accounts/                 linked Riot accounts: repository.ts, sync.ts, change-riot-id.ts, kickoff.ts
  riot/api/client.ts        Riot HTTP client + per-host rate limiter; riot/static/ = Data Dragon sync
  ingestion/                ranked.ts (discover + ingest), aggregate.ts, normalise.ts
  jobs/                     scheduler.ts, registry.ts and one file per job; background.ts = visit ticks
  stats/loader.ts           builds the in-memory statistics provider for the engine
  engine/service.ts         runs the engine for a stored draft (memoised)
  live/                     draft actions (apply/undo), control rules, live stream
  players/ team/ matches/ series/ scouting/ predraft/ pro/ proficiency/ ops/ observability/
src/components/             React components by area (ui/, team/, players/, draft/, admin/, champions/, …)
src/lib/                    nav.ts (navigation model), sidebar.ts, cn.ts (class helpers), format.ts
drizzle/                    SQL migrations 0000–0020 + meta snapshots
tests/db/                   database tests (PGlite by default, real Postgres with TEST_DATABASE_URL)
e2e/                        Playwright: responsive.spec.ts, quality.spec.ts (accessibility, layout)
scripts/                    migrate, seed-demo, run-job, embed-migrations, reset-password, perf tools
docs/                       ARCHITECTURE, DRAFT_ENGINE, DATA_PIPELINES, DATA_AUDIT, PERFORMANCE, RESPONSIVE,
                            PLAYBOOK_AND_MATCHES, DEPLOYMENT, LIVE_VALIDATION, RIOT_COMPLIANCE + these two files
```

Key single files:
- `src/server/auth/permissions.ts`: capabilities, access groups, permission checks.
- `src/lib/nav.ts`: navigation entries and admin links.
- `src/domain/engine/config.ts`: every engine weight.
- `src/domain/proficiency/index.ts`: the proficiency model.
- `src/app/globals.css`: design tokens.

### A3. Deployment

- **Production branch:** `main`. Changes arrive through pull requests; `.githooks/pre-push` blocks direct pushes, because no branch protection is configured on `main` (GitHub Pro allows it; turning it on is the owner's decision). Every push to `main` triggers a Vercel production build and deploy, except docs- and tooling-only changes (`scripts/vercel-ignore-build.sh`). Other branches get preview deployments. No manual deploy step exists.
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
  - **Data:** `RIOT_API_KEY`, `RIOT_PLATFORMS` (production: all 17), `LEAGUEPEDIA_USERNAME`, `LEAGUEPEDIA_PASSWORD`, optional `PRO_DATA_PROVIDER` / `PRO_DATA_CSV_URL`.
  - **Tuning:**
    - Riot collection: `RIOT_RATE_LIMITS`, `RIOT_MAX_PLAYERS_PER_RUN` (default 40), `RIOT_LOOKBACK_DAYS` (7), `RIOT_LEAGUE_REFRESHES_PER_RUN` (6), `RIOT_LEAGUE_REFRESH_MINUTES` (360), `RIOT_TIERS`, `RIOT_TIER_WEIGHTS`, `RIOT_INGEST_CONCURRENCY` (3).
    - Account sync: `ACCOUNT_SYNC_*`.
    - Visit ticks: `UNIIVERSE_VISIT_TICK_MINUTES` (30), `UNIIVERSE_VISIT_TICK_BUDGET_MS` (230000).
    - Live draft stream: `UNIIVERSE_LIVE_POLL_MS` (2000).
    - Database: `DATABASE_POOL_MAX`, `DATABASE_SSL`.
  - **GitHub Actions secrets:** `APP_URL`, `CRON_SECRET`; repository variable `DATA_JOBS_ENABLED`.
  - **Local / demo only:** `UNIIVERSE_DB_MODE=memory`, `UNIIVERSE_SEED_DEMO`, `UNIIVERSE_REQUIRE_AUTH`.

---

## SECTION B — DATABASE

### B1. Important tables (all exist; Drizzle schema in `src/server/db/schema/`)

| Area | Tables | Notes |
|---|---|---|
| Team | `teams` | One team row. Holds `engine_config` overrides. `primary_pool_limit` / `secondary_pool_limit` are **unused leftovers**: pools are uncapped. |
| Users | `users` | `username` (unique, case-insensitive), `password_hash`, `role` (`owner` \| `player`; `coach` is retired and refused by the `users_role_retired_coach` check since migration 0031), `player_id` (unique, nullable), `is_active`, `must_change_password`, `temporary_password_expires_at`, `setup_completed_at`, `setup_progress`, `permission_preset_id`, `custom_capabilities`, `access_groups` (jsonb, migration 0020), `avatar_version`. `draft_lead` is retired and always false. |
| Auth | `sessions` (token hash, user, expiry), `permission_presets` (access levels; `level_key` for built-ins: administrator / standard / restricted), `user_avatars`, `activation_codes` and `invites` (legacy; no longer used for sign-in) | |
| Player profiles | `players` | `display_name`, `riot_id` (mirrors the Main account), `primary_role`, `secondary_role`, `additional_roles` (jsonb, up to 3), `featured_champion_id`, `featured_skin_num`, `card_accent`, `group` (`main` \| `other`), `archived_at`, `sort_order`. |
| Champion pools | `player_champion_pools` (primary and secondary pools: `slot`, `champion_id`, `position`) and `player_role_pools` (additional-role pools: `role`, `champion_id`, `position`) | Unique per (player, slot\|role, champion). The **same champion may appear in several roles.** |
| Lineup | `lineups`, `lineup_slots` | Unique role per lineup and player per lineup. Plus saved lineup presets. |
| Strength tags (retired) | `player_tags` | No longer read or written since Phase 9 (the tags were removed); the table is kept so no data is dropped. |
| Riot accounts | `riot_accounts` | `puuid` unique; (platform, game name, tag) unique. `label` is `main` \| `alt`, and the partial unique index `riot_accounts_one_main_idx` allows **one Main per player** (migration 0018). Sync state: `sync_status`, `history_backfill`, back-off fields, `platform_source`. Also used for opponent accounts (`opponent_player_id`). |
| Personal history | `account_matches` (per-match ledger: PK account + match; queue, champion, role, result, K/D/A, CS, damage, vision, patch, duration), `account_champion_history` (aggregates per account / champion / role / queue group / patch), `account_mastery` | The ledger guarantees each match is folded once. |
| Static data | `patches`, `champions` (unique `key`, `is_active`, first/last seen version), `champion_change_points` (reworks), `champion_skins` (PK champion + num; migration 0017) | |
| Global ranked | `tracked_summoners` (ladder sample, cursors), `match_fetch_queue` (PK match id), `ranked_matches`, `ranked_participants`, `ranked_bans`, `region_status` | |
| Aggregates | `stat_periods`, `stat_region_periods`, `stat_rank_periods`, `champion_role_stats`, `champion_ban_stats`, `champion_matchups`, `champion_synergies`, `pro_pick_slot_stats` | Keyed by patch, source (`ranked` \| `pro` \| `demo`), tier band… |
| Professional | `pro_games`, `pro_game_picks`, `pro_game_bans` | Provider-scoped ids |
| Drafts | `drafts` (team, mode, format, side, lineup snapshot, `series_id`, `created_by_user_id`, status `in_progress` \| `completed` \| `abandoned`, theorycraft flag, version), `draft_actions` (unique sequence per draft), `draft_role_swaps`, `draft_presence`, `draft_enemy_scouting` (PK draft + slot) | |
| Series / matches | `series` (best-of, rules incl. Fearless, status), `matches` (archive record, `draft_id` set-null, `series_id`, result, notes, soft-delete) | |
| Opponents (legacy) | `opponent_teams`, `opponent_players` | Retired UI (`/opponents` redirects to `/matches`) |
| Solo Queue Blocks | `ranked_profiles` (focus), `ranked_blocks` (unique player + number), `ranked_games` (unique player + Riot match id; optional `teammate_player_id`) | Private journal |
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
  - The engine resolves "the pool for role R" through `poolFor(player, role)` in `src/domain/roster`.
- **Draft ↔ Players:** drafts store a lineup snapshot plus assignments, so later roster changes do not rewrite history.
- **Draft ↔ Match:**
  - A completed non-theorycraft draft creates one `matches` row (idempotent).
  - `matches.draft_id` is set to null if the draft is deleted; the record survives.
- **Match ↔ Series:** `drafts.series_id` and `matches.series_id`. Each game of a Bo3/Bo5 is its own draft and match. Fearless locks are computed from earlier games' picks.
- **Player ↔ Solo Queue Blocks:** `ranked_blocks.player_id` and `ranked_games.player_id`, cascade on delete. Visible to the owning player only.

### B3. Data integrity

- **Deduplication:**
  - Riot match ids are primary keys (`match_fetch_queue`, `ranked_matches`); `account_matches` has PK (account, match).
  - A game seen from two linked accounts of the same player is counted once in statistics (`dedupeGames`, after account filtering).
  - A Riot ID resolving to an already-linked PUUID is flagged as a duplicate.
- **Ownership validation:**
  - Every server action checks the capability and, where relevant, ownership: `canEditPlayer`, `canManageRiotAccounts`, `canControlDraft`.
  - Removing a Riot account verifies it belongs to the player being edited (fixed 14 Oct).
- **Transactions:** used for account creation, the Main/Alt swap, Riot ID change, draft actions (with optimistic `version` checks), aggregation (counters plus "aggregated" markers in one transaction) and ingestion batches.
- **Idempotence:** aggregation and ingestion never double count (`ON CONFLICT` counters with source rows marked in the same transaction).
- **Migration safety:**
  - Migrations are additive, or normalise data without deleting it. Example: 0018 relabels duplicate Mains to Alts before adding the unique index; 0019 copies the old background into both background slots.
  - The migrator takes a transaction-scoped lock that is safe with the pooler.
- **History preservation:**
  - Deleting a match soft-deletes it, and it can be restored by saving the draft again.
  - Deleting a draft keeps its match record.
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
- **Password policy** (`src/domain/password-policy.ts`):
  - New or changed passwords need 6–256 characters, an uppercase letter, a number and a symbol.
  - Existing passwords keep working.
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
- **Throttling:** 8 failures per 15 minutes per username + IP, held in memory (best-effort on serverless) (`src/server/auth/throttle.ts`).
- **Owner recovery:** `/recover` with the `UNIIVERSE_ACCESS_PASSWORD` setup key (`src/server/auth/recovery.ts`). The first-run `/setup` uses the same key.
- **Username changes:** players change their own username (unique, case-insensitive) in Settings.

### C2. Permission architecture (`src/server/auth/permissions.ts`)

- **Owner** (`users.role = 'owner'`; production: the single account `adminascend`, identified by its account id and role, never by its username): every capability, plus the Owner-only permissions (`manage-users`, `manage-competition`, `manage-branding`, `manage-data`), which can never be delegated. Since Phase 10 the Owner works **only in Admin Mode** (no Player View switch) and there is **one Owner**: no action promotes another account (`setAccessLevel` / `setAccountRole` refuse).
  - Nobody edits their own access.
  - The last active Owner can never lose Owner access (`guardLastAdmin`, `guardSelf`).
  - Owner recovery (`/recover`, setup key) is unchanged.
- **Capabilities** (the delegable set):

  | Group | Capabilities |
  |---|---|
  | View | `view-team`, `view-players`, `view-teammate-stats`, `view-trends`, `view-matches` |
  | Draft | `create-draft` |
  | Own profile | `edit-own-profile`, `manage-own-riot-accounts` |
  | Team management | `manage-lineup`, `manage-players`, `manage-matches` |
  | Site settings (Owner only since Phase 10) | `manage-competition`, `manage-branding`, `manage-data` |

- **Base access level per non-Owner account:**
  - **Standard Player** (default): the 8 view, draft and own-profile capabilities.
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

  (Draft Settings Manager, Branding Manager and Data Manager were retired in Phase 10; migration 0029 removed them from stored lists.)

  - Groups can never grant `manage-users`.
  - Only Owners set them, never on their own account, and Owners hold no groups.
  - Write path: `setAccessGroups` in `src/server/repositories/permissions.ts`.
- **How access is distinguished:**
  - The privileged *account type* is only Owner vs non-Owner (`users.role`). Everything else is capabilities from level + custom + groups, resolved into the session (`UserRecord.capabilities`).
  - `canUseAdminArea` = the Owner only (Phase 10). Delegated work (lineup, matches, other players' profiles) happens in place on Team, Draft, Matches and profiles.
  - **Team membership** (`players.team_member`, migration 0029, default true): a personal-use account (false) holds no team capability (`TEAM_CAPABILITIES` in `hasPermission`), is refused by `requireTeamMember` (draft, match and series actions), the draft pages and the live stream, and is left out of Players and lineup selection; it keeps its own profile, statistics, Solo Queue Blocks and Meta & Trends.
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

---

## SECTION D — RIOT INTEGRATION

### D1. Riot APIs used (`src/server/riot/api/client.ts`)

| Purpose | Endpoint | Routing |
|---|---|---|
| Riot ID → PUUID | `/riot/account/v1/accounts/by-riot-id/{name}/{tag}` | americas / asia / europe (`accountRegionFor`; never `sea`, which answers 403) |
| PUUID → Riot ID (rename tracking) | `/riot/account/v1/accounts/by-puuid/{puuid}` | same |
| Active server | `/riot/account/v1/region/by-game/lol/by-puuid/{puuid}` | same |
| Rank | `/lol/league/v4/entries/by-puuid/{puuid}` | platform (e.g. `oc1`) |
| Ladders | `/lol/league/v4/{challenger,grandmaster,master}leagues/by-queue/…`, `/lol/league/v4/entries/{queue}/{tier}/{division}?page=` | platform |
| Match ids | `/lol/match/v5/matches/by-puuid/{puuid}/ids` | regional (americas, europe, asia, sea) |
| Match | `/lol/match/v5/matches/{id}` | regional |
| Mastery | `/lol/champion-mastery/v4/champion-masteries/by-puuid/{puuid}` | platform |
| Status | `/lol/status/v4/platform-data` | platform |
| Static data | Data Dragon `versions.json`, `champion.json`, per-champion detail files (kits, skins), images | CDN |

**Limits:**
- Development/personal key: 20 requests per second and 100 per 2 minutes, **per host**. The client keeps one limiter per host (`RateLimiterPool`).
- It honours `Retry-After`, backs off on 5xx and limits retries.
- PUUIDs are encrypted per API key; ladder ids that the current key cannot decode are dropped and re-added.
- 17 public platforms are configured. PH2 and TH2 always error (merged into SG2 by Riot). TW2 and VN2 returned no data until 14 Oct, when the first games arrived.

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
- **Refresh matches** (`src/server/accounts/refresh.ts`, `refreshMatchesAction`): Match History shows when the linked accounts were last read successfully (`sync_cursor`, the oldest of the player's accounts) and when the newest stored game was played, and offers Refresh to the player and to those who manage Riot accounts (checked on the server). A refresh runs the same sync for that player's accounts now, limited to new games (15 per account, no back-fills, about 40 s), then the list reloads in place with its URL filters. Every sync, scheduled or manual, first claims a per-account lease in `app_settings` (`account_sync:<id>`; 2 min for a refresh, 1 min for the scheduler), so two syncs never run on one account and repeated clicks cost Riot nothing. Outcomes are stated as they happened: N new games, no new games (Riot can take a few minutes to list a finished game), already checked (with when it may be tried again), failed, or not available (no Riot key). Played Together reads the same stored games, so a refresh updates it as well.

### D3. Background updating

- **Scheduler:**
  - Entry point: `runTick` in `src/server/jobs/scheduler.ts`. Order: version-check → account-sync → ranked-discover → pro-sync → aggregate → integrity → ranked-ingest, then aggregate again after ingestion.
  - A tick has a 240 s budget (visit ticks 230 s). Jobs claim atomically, so concurrent ticks skip instead of duplicating work. Per-job caps inside a tick: account-sync 75 s, ranked-discover 40 s, pro-sync 40 s, aggregate 60 s, integrity 20 s.
- **Job intervals** (`defaultIntervalMinutes`; can be changed in Admin):

  | Job | Interval |
  |---|---|
  | version-check | 60 min |
  | account-sync | 15 min |
  | ranked-discover | 60 min |
  | ranked-ingest | 10 min |
  | aggregate | 30 min |
  | pro-sync | 24 h |
  | integrity | 24 h |

  - `static-sync` (forced) and the diagnostic jobs run on demand only. Diagnostic jobs: `auth-audit`, `data-audit`, `data-sufficiency`, `engine-probe`, `perf-probe`, `riot-check`.
- **Triggers:** GitHub hourly (best-effort; often skipped), Vercel daily 04:00 UTC, visits (every 30 min while people use the site), optional `pg_cron`.
- **Retry / back-off:**
  - Accounts: 5 min after the first failure, doubling up to 6 h.
  - Ingestion: transient failures retry with attempt counts; 404s are marked failed.
  - `integrity` unsticks interrupted runs and retries old failures.
- **Sync priorities (accounts):**
  1. New or failing links.
  2. Accounts still collecting this season.
  3. Active players (Main group, or signed in within 7 days) not refreshed for 45 min.
  4. Everyone else after 3 h.
  - Opening a profile also refreshes that player's due accounts in the background, about 40 s per visit.
- **Patch detection:**
  - `version-check` compares Data Dragon's newest version with the stored patch.
  - A new version upserts champions, flags suspected reworks (kit fingerprints → `champion_change_points`, unconfirmed), opens the new patch and clears caches.
  - On the same version it back-fills champion skins, 60 champions per run.
- **Season transitions:** the season number is derived from the game version (16.x = "Season 2026"). Year-style patches like 26.20 are mapped to 16.20. History is collected per season automatically.
- **Aggregation:** folds ranked matches and pro games into the aggregate tables, then bumps `stats_version` so the cached statistics provider rebuilds.
- **Global ranked collection (`ranked-discover` → `ranked-ingest`):**
  - Discover refreshes the stalest ladders (up to 6 per run, each platform every 6 h) and samples Emerald/Diamond pages.
  - It then scans the match lists of the least-recently-scanned players (40 per run, split fairly across platforms) and queues new match ids.
  - Ingest fetches queued matches with one worker per regional host.
- **Confirmed issue, 14 Oct:**
  - Ranked collection stalled from about 07:15 to at least 11:11 UTC.
  - Visit-started ticks gave discovery its 40 s cap, and ladder refreshes used all of it (visit discovery runs averaged 39.3 s). No player was scanned (the "ever scanned" count stayed at about 253), so nothing was queued and ingestion had nothing to fetch.
  - Fix `562fe24`: ladder refreshes stop at half of the discovery budget.
  - **Production verified, 11:16–11:25 UTC:** the first discovery run scanned 40 players and queued 840 match ids. The next ingest run fetched 631 matches and stored **619 new games** across 13 regions, including TW and VN for the first time; 209 were still queued.

### D4. Current data health (production, read-only jobs, **14 Oct 2026, 11:07–11:16 UTC**)

| Measure | Value |
|---|---|
| Linked player accounts | **13** (10 players; one player has 4 accounts); all resolved, all `ok`, last synced 10:45–11:00 UTC |
| Personal match ledgers | 40 to 872 matches per account (e.g. 164, 399, 367, 40, 124, 872, 91, 43, 79, 746, 140, 586, 122) |
| Users | 11 accounts: 1 Owner (admin-only, no profile), 10 player accounts; 6 with a permanent password, 4 still on a temporary password; 4 with first-login setup pending |
| Global ranked games | **2,321** at 11:10 UTC (2,229 on 16.20, 92 on 16.19; fetch queue empty; newest game created 14 Oct 00:57 UTC). After the discovery fix, **2,940** stored at 11:25 UTC, with 209 queued; the new games are folded into statistics by the next `aggregate` run. |
| Effective games used by the engine | 1,604 (rank- and patch-weighted; patch weights 1 / 0.6 / 0.36) |
| Region share (16.20, before the 11:25 ingest) | OCE 66.2 %, EUNE 8.2 %, EUW 7.1 %, RU 3.3 %, KR 2.9 %, ME 2.6 %, NA 2.6 %, BR 1.7 %, SG 1.7 %, JP 1.4 %, LAN 1.2 %, LAS 0.9 %, TR 0.2 % |
| Rank bands (16.20) | Challenger 417, Grandmaster 40, Master 349, legacy Master+ 631, Diamond 659, Emerald 133 |
| Tracked ladder players | 20,423, of which about 253 have ever been scanned for match ids |
| Professional games | 311 (Leaguepedia): 178 on 16.20, newest 13 Oct 20:47 UTC |
| Bans (current patch) | 21,423 |
| Job health | `/api/health`: ok, no failing jobs; no job failures in 7 days. **Note: "ok" did not reveal the discovery stall.** |
| Champion skins | 3,198 stored (version-check, 11:22 UTC) |
| Drafts / matches | 5 drafts (none with enemy Riot IDs); 0 match records |

---

## SECTION E — DRAFT INTELLIGENCE

### E1. Recommendation engine (IMPLEMENTED · TESTED; `src/domain/engine`, pure and deterministic)

- **Entry points**
  - Engine functions: `recommend(input)` and `whyNot(input, alternative)` (`src/domain/engine/index.ts`).
  - Server wrappers: `recommendForDraft`, `whyNotForDraft`, `playbookForDraft` (`src/server/engine/service.ts`). Recommendations are memoised per draft version for 10 minutes, up to 40 entries.
- **Inputs**
  - The draft state (format, sequence, bans and picks, side, Fearless locks).
  - The five lineup players with roles and pools.
  - The statistics provider (`src/server/stats/loader.ts`).
  - The proficiency lookup and the champion map with curated traits.
  - Optional enemy scouting tendencies and per-draft strategy overrides.
  - The engine config (`DEFAULT_ENGINE_CONFIG` merged with the team's overrides).
- **Hard constraints (never relaxed)**
  1. A champion is a candidate for player P in role R only if it is in P's pool *for R*.
  2. Players only take roles from their profile (primary, secondary, additional).
  3. Banned, picked and Fearless-locked champions are unavailable.
  4. Only the five lineup players exist.
- **Candidate generation and search** (`picks.ts`, `search.ts`)
  - Enumerates legal player→role assignments, ordered by role-distance cost: primary 0, secondary 1, first additional role 2, each later one +0.5, times `roleSwapCost` 0.02.
  - Each open slot is narrowed to its 10 best champions by marginal value (`slotShortlist`).
  - The best complete team reachable is then found: exhaustively below 6,000 combinations, otherwise a beam search of width 14.
- **Scoring** (`evaluate.ts`; all parts in approximate win-rate units, 0.02 ≈ 2 points)
  - *Individual:*
    - champion strength (shrunk win rate in role);
    - player comfort = pool-order comfort + `proficiencyComfort` = (score − 0.5) × 0.05 × confidence (at most ±0.025);
    - pro priority;
    - minus role-swap cost.
  - *Synergy:* pair evidence (Top/Jungle, Jungle/Mid and ADC/Support weighted ×1.3) plus composition structure (engage, frontline, damage mix, waveclear, CC, peel, identity).
  - *Enemy:*
    - lane matchups, weighted by the enemy's likely roles, with severity penalties (−2 / −5 / −9 points thresholds, ×1.6 / ×2.6);
    - cross-role matchups;
    - composition interaction (engage vs disengage, dive vs peel, poke, scaling, range…).
  - *Realism:* execution demand, coordination and resource overload, scaled by the risk preference (reliable ×2, balanced ×1, ceiling ×0.25).
  - Weights live in `config.ts`, e.g. `championStrength 1.0`, `playerComfort 0.7`, `laneMatchup 1.0`, `pairSynergy 0.9`, `structure 1.0`, `proPriority 0.35`; the philosophy split is 50/50 synergy vs enemy.
- **Pick timing** (`timing.ts`): `pickNowScore = fitScore + urgency − counterpick hold + blind safety + flex`.
  - Urgency = value at risk × the probability the champion is banned or taken before our next turn (ban/pick rates, pro first-rotation patterns).
- **Two-pick windows:** pairs are evaluated jointly (`recommendPair`).
- **Role swaps:** recommended only when they beat the current assignment by more than `swapThreshold`, i.e. 1.5 points.
- **Bans** (`bans.ts`, `blind-bans.ts`): ban value = P(enemy takes it) × harm to us (strength, lane damage into our projected pick and pool, cross-role threats, structural fit for them) − our own interest in the champion.
- **Explanations:**
  - "Why this pick?" breakdown: team-fit, enemy-interaction, player-proficiency, patch-strength, pro-priority, realism, timing.
  - `whyNot`, `whatWouldChange`, `simulateResponses`, `threatMap`, `poolPinch`.
  - It says explicitly when player data changed the ranking versus pool order alone.
- **Emergency picks** (`emergency.ts`): see F4.

### E2. Player proficiency (IMPLEMENTED · TESTED; `src/domain/proficiency/index.ts`, `DEFAULT_PROFICIENCY_CONFIG`)

Per (player, champion, role), from the combined history of all linked accounts plus combined mastery.

**Inputs**
- games and wins per champion / role / queue group / patch;
- last played;
- mastery points;
- the player's baseline win rate.

**Queue weights** (`QUEUE_WEIGHTS`): Solo/Duo 1.0, Flex 0.9, other (Clash, Swiftplay…) 0.85, Normal 0.6.

**Role-specific experience** (revision 2, October 2026; full write-up with old vs new in `docs/DRAFT_ENGINE.md`): once ≥ 5 of the player's games on the champion have a known role, games in *other* roles count `offRoleWeight` 0.25, capped at `offRoleCap` 8 games' worth; mastery counts towards a role in proportion to the games on the champion in that role; the Main / Comfortable minimums count games in the role only; recency comes from stored games. Results (win rate) still use every game.

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

**Used by** the engine (comfort modifier among legal champions only), profiles, Team tags and emergency picks.

### E3. Global evidence (`src/server/stats/loader.ts`, `src/domain/engine/memory-stats.ts`)

- **Sampling:** Emerald+ Solo/Duo (queue 420) across 17 configured platforms.
  - Apex tiers (Challenger, Grandmaster, Master) come from full ladders, top 300 by LP.
  - Diamond and Emerald are sampled from one rotating page per division, 150 players.
- **Rank weighting:** a game counts Challenger 1, Grandmaster 1, Master 0.9, Diamond 0.7, Emerald 0.5. Legacy "MASTER+" rows count 1. Configurable via `RIOT_TIER_WEIGHTS`.
- **Three-patch weighting:** the current patch counts 1.0, the previous 0.6 (reduced), two patches back 0.36 (fallback). Older patches fade as the current one accumulates games.
- **Rework discount:** champion change points discount pre-rework evidence. Unconfirmed, auto-detected ones count at least 0.5.
- **Shrinkage** (pseudo-games towards the prior): champion strength 250, lane matchup 400, pairing 1000. The matchup and pairing values were chosen by the leave-one-out test (`docs/DATA_AUDIT.md` §8); smaller values made predictions worse.
- **Sample floor:** matchup and synergy rows with fewer than 2 games are not loaded.
- **Professional evidence:** Leaguepedia games (pro weight 1.0) add matchup/pairing evidence, a pro-presence signal and draft-slot patterns (`pro_pick_slot_stats`: B1, R1/R2, …).

**What actually drives recommendations today:** team fit (curated traits), player proficiency, champion strength, pick/ban presence and pro priority. Lane matchups and pairings are so thin that they barely move results. The data-sufficiency job measures this.

### E4. Recommendation confidence (`src/domain/engine/confidence.ts`)

The confidence label combines two things:
1. **Separation:** the gap between the top two options. ≥ 3 points = "Strong recommendation", ≥ 1.2 = "Moderate preference", less = "Close decision".
2. **Evidence sufficiency:** "Low confidence" is shown whenever there are no statistics or the evidence confidence is below 0.25.

**Not modelled:** statistical uncertainty of the score itself (no intervals) and win probability. Recommendation strength and evidence sufficiency are thus partly conflated into one label, but the label always comes with its reason text. Per-signal evidence counts (games behind strength, lane, pair) are shown in the breakdown.

### E5. Data limitations

- **Sample sizes** (production, 14 Oct): champion strength median 102 effective games (5.8 % of situations reach the 250 prior); lane matchups median 2 (0.3 % have 30+); key pairings median 2.
- **Region skew:** OCE 66 %. Emerald is under-sampled.
- **Player history:** some accounts are thin; one player's season K/D/A is still back-filling (167 of 563 games).
- **Role inference:**
  - Riot's recorded position is trusted for own games; games without a position are excluded from role filters and counted in a note.
  - Enemy roles are inferred probabilistically from champion role share.
  - Scouted enemies' likely roles come from their own games and are labelled with certainty.
- **Pro evidence:** 311 games over 4 patches, mostly 16.20 and 16.18.
- **Heuristics:** composition traits are curated, not learned. Measured against outcomes, no trait effect is detectable yet (engage-heavy teams won 51.6 %, 95 % CI 47–56).
- **Predictive power:** leave-one-out accuracy is 53.0 % for strength alone, 52.2 % with matchups and 52.5 % with matchups and pairings. In-sample accuracy is 66.6 %, an optimistic upper bound.

---

## SECTION F — DRAFTING WORKFLOWS

### F1. Competition modes (`src/domain/competition.ts`, formats in `src/domain/draft/formats.ts`)

| Mode | Default format | Opponent info | Series |
|---|---|---|---|
| **Ranked 5s** (a UNIIVERSE category: our premade five vs another premade five, not a Riot queue) | Tournament draft | short (enemy Riot IDs optional) | single game |
| **Ranked Flex** (Riot's queue) | Ranked Flex / Draft Pick | usually none (IDs optional) | single game |
| Clash | Tournament | short | single game |
| Scrim / Organised | Tournament (selectable) | full | Bo1 / Bo3 / Bo5 |
| Tournament | Tournament (selectable) | full | Bo1 / Bo3 / Bo5 |
| Custom / Practice, Practice, Other | Tournament (selectable) | full | Bo1 / Bo3 / Bo5 |

**Draft formats** (data, not code):
- **Tournament:** ban 1 `BRBRBR`, pick 1 `BRRBBR`, ban 2 `RBRB`, pick 2 `RBBR`. The 1-2-2-1 / 2-1-1 picks are visible.
- **Ranked Flex:** 5 simultaneous bans per side (hidden until revealed), then picks `BRRBBRRBBR`. Modelled as "our bans, then theirs".

**Ranked 5s vs Ranked Flex:**
- Different formats: alternating two-phase bans vs simultaneous bans.
- Different expectations of opponent knowledge.
- They are separate modes, and the user insisted they stay separate.

**Fearless** (Bo3/Bo5): a champion picked by *either* team in an earlier game of the series cannot be picked again; bans reset each game (`src/domain/fearless.ts`, `fearlessLocks`).

### F2. Draft Room (`src/components/draft/draft-room.tsx`, `src/server/live/*`, `src/server/actions/drafts.ts`)

- **Layout:**
  - Desktop (≥ 1280 px) mirrors champion select: BLUE panel left, centre current action + concise recommendation + champion grid (search, role filter, picking player's pool first), RED panel right. The full analysis sits below, collapsed.
  - Phones: action → recommendation → alternatives → compact board → grid → collapsible analysis.
- **Manual entry:** every ban and pick is entered by the controller (`applyDraftAction`), with an optimistic board update. The recommendation panel shows "Updating…" until the server answers; a rejected action reverts.
- **Undo:** `undoDraftAction`, version-checked.
- **Ownership** (`canControlDraft`): the draft's creator controls it. Owners and holders of `manage-matches` (Match Manager) can take over. Everyone else watches.
- **Persistence:** every action is a row in `draft_actions` with a draft `version` (optimistic concurrency).
- **Live view and reconnect:** `GET /api/drafts/[id]/stream` polls the database every 2 s for up to 240 s per connection; the client reconnects. `draft_presence` holds lightweight presence. Not true realtime, by the user's choice.
- **Unfinished drafts:** the Draft page lists them with Resume / Abandon / Delete (creator or admin, each confirmed). Completed matches are never touched.
- **Theorycraft** drafts are never archived automatically.

### F3. Enemy scouting (`src/server/scouting/session.ts`, `src/domain/scouting`, `src/domain/engine/tendencies.ts`)

- **Entry:** up to five optional enemy Riot IDs at draft creation, in any order, with no roles.
- **Pipeline:**
  1. Each ID is resolved once with a bounded budget: server, rank, per-champion games / wins / recency, mastery.
  2. The results are stored on the draft (`draft_enemy_scouting`). There is no opponent database.
  3. Likely roles are inferred from each player's games, with a certainty figure.
  4. Likely picks (`likelyPicks`) become pick probabilities. These raise ban value (`banDamage`) and enemy-response simulation.
- **Missing data:** a "pending" or failed lookup never blocks the draft; the engine falls back to global evidence.
- **Production use:** 0 of 5 drafts had enemy IDs (14 Oct), so this is **untested with real data**.

### F4. Emergency picks (`src/domain/engine/emergency.ts`)

- **When:** only when every champion in the assigned player's pool for a role is banned, taken or Fearless-locked.
- **What:** about three champions plausible in that role (role prior ≥ 15 %, or measured share ≥ 25 % over 300+ games), ranked by team need and patch strength with an unfamiliarity penalty and the player's own proficiency.
- Labelled "EMERGENCY PICKS — Outside Configured Pool". Never written to the profile; the controller may lock one.

### F5. Match Playbook (`src/domain/playbook`, `src/domain/gameplan`; `docs/PLAYBOOK_AND_MATCHES.md`)

- **Inputs:** the final ten champions, assignments, curated traits and current statistics. Pure and deterministic; stored with the match record.
- **Quick Playbook** (one screen at 1366×768+; tabs on phones): WIN CONDITION, EARLY GAME, TEAMFIGHTS, OBJECTIVES, WATCH OUT, PLAYER JOBS (one job each), strategy note.
- **Detailed analysis** (`?view=detail`): IF → THEN rules, ahead/even/behind plans, deny their plan, self-critique, threat map, lanes/teamfight/side lane/objectives, "Copy for Discord".
- **Limitations:** rule-based text from curated traits. No confidence figure; quality depends on trait accuracy.

### F6. Match history (`src/server/matches`, `/matches`)

- **Creation:** automatic when a non-theorycraft draft completes (idempotent).
- **Editing:** mode (outside series), result, duration, Riot match ID, enemy names, opponent label, notes, VOD — by the draft creator or a `manage-matches` holder, server-checked.
- **Deletion:** soft delete (hidden; restorable by saving the draft again); the series is re-scored.
- **Series:** grouped with score. *Next game* inherits mode, event and opponent.
- **Archive only:** results never change recommendations. A test pins this.

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
  - Art falls back: skin splash → default splash → loading art → accent gradient (`card-art.tsx`).
- **Profile pictures:** cropped in the browser, validated by bytes on the server, served members-only from `/api/avatars/[userId]`.
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
  - **Data and cost:** one SQL pass over the members' stored games and participants (`jsonb_array_elements`), players met only once dropped in the database, then cached per team for 15 minutes under the same history fingerprint as Played together (a sync, new game or membership change invalidates it). Every filter is applied in memory. No Riot request. `perf-probe` step `matches.encounters` (counts only, never names).
  - **Limits:** only games UNIIVERSE recorded for members (each account's synced history), so a missing game is not proof two players never met; games without stored match details have no other players.
  - **Tests:** `src/domain/encounters.test.ts`, `tests/db/encounters.test.ts`, `e2e/encounters.spec.ts`. The demo places synthetic recurring players in the demo games (`server/demo/encounters-fixture.ts`, DEMO_ games only).
- **Both teams on match cards** (`TeamComposition`, `src/components/match-history/team-composition.tsx`; data from `src/server/matches/compositions.ts`):
  - **Where:** a player's Match History and Team → Matches show the same preview, blue then red, each in lane order with the name Riot gave for every player.
  - **Marking:** the player the list is about is in bold. UNIIVERSE team members (found by their linked Riot accounts, `teamMembersByPuuid`, one query) are in the accent colour under their profile name. That side is tinted.
  - **Missing data:** a name Riot did not provide falls back to the champion's name, in a quieter colour. Nothing is guessed, and nothing says who queued together.
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
  - **Data:** stored data only. No Riot or OP.GG request.
  - **Policy:** see `docs/RIOT_COMPLIANCE.md` → Player links.
  - **Match History card:** a box rather than a `<button>`, because links cannot sit inside a button. A click anywhere but on a link opens the match. The button behind the content is the card for the keyboard and screen readers: one tab stop, Enter or Space opens it, and its outline marks the card. Item and spell tooltips keep working.
  - **Keyboard:** preview links are `tabIndex=-1`, so the keyboard still moves card by card. The scoreboard's links are in the tab order.
  - **Tests:** `src/domain/opgg.test.ts` (real-world IDs: Hangul, kana, Cyrillic tags, symbols, reserved URL characters); `tests/db/match-history.test.ts`; `e2e/match-teams.spec.ts`.
- **Ranked Flex vs "Ranked 5s":** Riot queue 440 is Ranked Flex everywhere (ingestion, `queueGroupFor`, `QUEUE_LABELS`, season modes, leaderboards, Played Together, Matchups); 420 is Solo/Duo. "Ranked 5s" is a UNIIVERSE draft category (`competition_mode`), not a Riot queue: it has no `MODE_QUEUE`, so match linking neither expects nor rejects a queue for it, and no game is called a premade five. `data-audit` → `queueClassification` reports the stored counts per queue and any game whose queue differs from its match details. On Matches → Drafted, choosing Ranked 5s or Ranked Flex explains that these are draft records and links to the team's Riot Ranked Flex games in Played together (all of them, or those with all five members on one side).

### G3a. Account order (migration `0037_account_order`, `src/domain/account-order.ts`)

- One order for a player's linked accounts: the Main first, then the alternatives in the order the player set (Riot Accounts → Move up/down buttons, `reorderAccountsAction`, same permission as making an account Main). Accounts never reordered fall back to the order they were linked.
- `listAccountsForPlayer(s)` return that order, so every account list follows it: Riot Accounts, Match History, All Champions, Overview, the champion window (Refine and per-account breakdown), Ranked progression, recent performance. "All accounts" aggregates are unchanged.
- `riot_accounts.sort_order` is nullable and presentation only: no game, statistic, label or owner changes. Making an alternative Main swaps it with the former Main; removing the Main promotes the first alternative; replacing a Riot ID keeps the account's place.

### G4. Team screen (`src/components/team/team-roster.tsx`, `src/server/team/roster.ts`)

- **Main lineup:** five role cards (only Main-group players), lineup changed via a menu by `manage-lineup` holders (e.g. the Team Lineup Manager group).
- **Cards:** the artwork with role, picture, name and rank, then one body that continues the art (the card accent fades down from it): the season in the **assigned lineup role** as one row (win rate with record, KDA with kills / deaths / assists per game, CS per minute or average vision for Support) with a win/loss bar and the number of games (`CardPerformance`), then the **pool for that role** with the first choice featured (portrait, name and its games and win rate in the role) and the rest as portraits that fit (`CardPool`). The Card Studio preview uses the same pieces. Every filled card has the same parts, so cards in a row line up; no game in the role this season and no champion chosen are said plainly instead of dashes. Empty roles list their suggestions one line each (reasons on hover and for screen readers), so a vacancy no longer stretches its row (production's empty Support slot made the other cards of its row taller, which was the empty space under their figures).
- **Player window:** the header is the player's card opened up (their own artwork and colours as a static crop, no card effects; role, identity, rank, Full profile as the main action, the lineup position and the last ranked change), then the season as three headline figures with the win/loss bar and a quiet line (games, damage, the other of vision and CS), and the pool with the first choice tinted in the card's colour. Previous / next, keyboard and focus behaviour are those of the shared DetailModal; desktop height follows the content.
- **Strength tags were removed in Phase 9** (by the user's choice), with their code (`player-tags.ts`, `team/tags.ts`); the unused `player_tags` table is kept.
- **Empty roles:** advisory suggestions of registered players who could fill them (`src/domain/team-advice.ts`); never auto-assigned. Production: the Support slot is empty.

### G5. Solo Queue Blocks (`/blocks`; `src/domain/ranked-improvement.ts`, `src/components/ranked/*`)

- **Blocks (Phase 9):** a block starts at **0 / 1** with one click (or by logging a game when none is running) and gains a slot with every game; no maximum. A target (1–100) is optional and can be set, changed or cleared at any time; reaching it does not close the block (Finish block or "+3 more"); finished early is recorded as such.
- **Ranked Focus:** one card with a featured champion (`ranked_profiles.champion1`), the improvement sentence and optional extra champions. The block in progress follows it; finished blocks keep the focus and featured champion they were played with (`ranked_blocks.focus`, `featured_champion_id`, migration 0027).
- **Layout:** Current Block (label, rule, focus, wins/losses, the games as a strip, the next action, Finish and Delete); Quick Add (recent Riot games and manual entry, beside the block on wide screens); Logged Games (five per page); Previous Blocks (latest five, full history paginated); the Ranked Focus editor below.
- **Completion rules (migration 0038: `ranked_blocks.completion_rule`, `completed_reason`):** chosen when a block starts (a game logged with no block running reuses the previous block's rule).
  - *Game target* (`target`, the default and every block before 0038): the player finishes it; a target is an optional plan.
  - *Two-loss limit* (`two-losses`): the block completes by itself on its 2nd loss in total ("Completed · 2-loss limit reached"); no game target. Applied after every add, import, result edit and game deletion (`applyCompletionRule`).
  - *Manual*: Finish block, any time (`completed_reason = manual`).
  - Corrections: an active two-loss block that reaches two losses completes; a block the limit completed that drops below two losses (an edited result or a deleted loss) reopens only while it is the latest block and nothing else is in progress; otherwise it stays completed and its label shows only "Completed". A block the player finished never reopens. Duplicate imports are refused as before.
- **Deleting a block** (`deleteBlock`, `deleteRankedBlockAction`): the player's own block, in progress or finished, after a confirmation that names what goes. One transaction removes the block and its journal entries (`ranked_games` rows); `account_matches` and every Riot record are untouched, so imported games can be imported again. Other blocks keep their labels; the next block is numbered after the highest remaining one. The owner comes from the session; another player's block is "not found".
- **Game entry:** champion, enemy laner, result, **one main mistake** (Mechanics, Trading/Laning, Wave/Tempo, Vision, Macro, Positioning, Decision Making, Mental, Other), optional note, optional teammate tag.
- **Riot import:** one tap adds a recent synced Solo/Duo game from `account_matches`; no extra Riot call.
- **Privacy:** only the owner sees their blocks; nothing feeds drafting data. Editing and deleting games is allowed.
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
| Dialog (`dialog.tsx`), ConfirmDialog, Toast notifications (`toast.tsx`) | `src/components/ui/*` | admin, profile, draft |
| **Menu** (portal-rendered, flips, keyboard; never clipped) | `src/components/ui/menu.tsx` | account menu, Riot account ⋯, Team lineup menu |
| InfoTip (ⓘ, hover/focus/tap), Metric, SaveStatus (autosave state), Skeleton, AutoRefresh | `src/components/ui/*` | profiles, Trends, admin |
| Champion grid / selector (search, Riot role filter), SortablePool | `src/components/champions/*` | profile editing, Welcome, Draft Room |
| ChampionPortrait, RoleIcon | `src/components/champion-portrait.tsx`, `role-icon.tsx` | everywhere |
| CardArtLayer, CustomiseCardButton, ProfileHeader, PlayerSummaryCard | `src/components/players/*` | Team, Players, profiles |
| Navigation: CollapsibleSidebar, NavGroupSection, AccountMenu, MobileNav | `src/components/*` | app shell |
| Class helpers `cn` / `withDefaults` (caller classes replace defaults; no class-merge library) | `src/lib/cn.ts` | components |
| **FilterBar / FilterField**, **SearchInput** | `src/components/ui/filter-bar.tsx`, `search-input.tsx` | Players, profile Overview / All Champions / Match History, Leaderboards, Matches (both tabs); SearchInput also on Admin → People and the skin search |
| Segmented (`segmentedGroupClass`, `segmentClass`, `RoleSegmented`), filter chips (`chipClass`), TabLinks | `src/components/ui/segmented.tsx`, `tab-links.tsx` | every filter and section switch |
| **DetailModal** (the one detail window), `AfterOpen` | `src/components/ui/detail-modal.tsx` | Team player window, Match History / Team Matches / champion window match details, Card Studio, Draft analysis |

**Detail windows (one behaviour everywhere).** `DetailModal` is the site's only detail window: centred over the dimmed page on wider screens, the whole screen on phones (`compact` stays a card). Sizes by content: `compact`, `standard` (a player), `wide` (a match or a champion: a fixed height, so tabs never make it jump), `full`. Native modal `<dialog>`: focus trapped, Escape, the close button and the backdrop close it (with `canClose` for unsaved edits), focus returns to the element that opened it, the page behind does not scroll or shift. Motion: `modal-in` (180 ms fade and slight rise/scale) and `modal-out` (140 ms), none under reduced motion.
- *Performance rules* (measured in `docs/PERFORMANCE.md`, "Detail windows"): the backdrop dims and never blurs (a full-screen `backdrop-filter` was redrawn on every frame of the motion); heavy content waits for the window to be in place (`AfterOpen`, or `onSettled` for content the caller holds, about 120 ms after opening, at once under reduced motion) and renders as a transition; a list memoises its rows so opening one re-renders only the row it marks; Match History keeps the details it has loaded for the page it shows (`MatchDetailCache`, in memory, replaced with every new page of data, never stored in the browser) and starts loading on a mouse press.

**Filters, search, sort and tabs (one behaviour everywhere).**
- *Tabs* (TabLinks, underlined) switch between sections of a page: Matches, a profile, Leaderboard categories. They never filter.
- *Filters* live in a FilterBar. Search comes first and is never folded. From `md` up (Leaderboards: `lg`) the filters sit inline on one row; below it they fold behind one "Filters · what is chosen" button with a count of narrowed filters. Opened, each filter has a visible label; inline, the label is for screen readers and the control says what it holds ("All roles", "Any patch").
- One choice out of a few is a segmented group (role, game mode on Played together, member count); an on/off filter is a chip ("Main lineup only", "Bookmarked", "Archived and deactivated"); long lists are dropdowns. Role filters are always `RoleSegmented` (icon and name; inactive names hidden on phones).
- Choices apply at once and keep the other filters (no Apply button). "Reset" appears only when something is narrowed and restores every default.
- Heights: 36px with a mouse, 44px on touch screens, for fields, segmented groups and chips alike (the e2e spec `filter-consistency` checks this on every bar).
- Sort: column headings where there is a table (All Champions, Solo Queue Meta); a segmented "Rank by"/"Sort" group otherwise; phones get a Sort by dropdown when the headings are hidden.

### H3. Page-by-page overview

| Page | Route | Purpose and layout | Who can edit | Notes |
|---|---|---|---|---|
| Team | `/team` | 5 role cards (grid: 1 col phone → 5 cols at ≥ 1536 px), lineup menu, Customise on own card, empty-role suggestions, "Start a draft" | lineup: `manage-lineup`; pools: own or `manage-players` | Support empty in production |
| Players | `/players` | Directory cards (2/3/4 cols), search, role chips, Main lineup filter, show archived | `manage-players` for archive/group | |
| Player profile | `/players/[id]` (+ `/champions`, `/accounts`) | Hero header + tabs Overview / Champions & Roles / Riot Accounts | own or `manage-players` | Opening your own id redirects to `/overview` |
| My Profile | `/overview` (+ `/champions`, `/accounts`) | Same as above for yourself; statistics with filters | self | Accounts without a profile see "complete your profile" |
| Trends | `/trends` | Pool alerts + grid of top-10 lists (2/3/4 cols), pro patterns (collapsed) | — | |
| Draft setup | `/draft` | Mode → lineup → enemy IDs → side; unfinished drafts list | `create-draft` | |
| Pre-draft plan | `/draft/[id]/prepare` | Ban/pick plan and pro patterns before the draft | controller | |
| Draft Room | `/draft/[id]` | Champion-select layout (F2) | controller | |
| Match Playbook | `/draft/[id]/playbook` (`?view=detail`) | Quick Playbook one-screen; detailed view | — | |
| Matches | `/matches`, `/matches/[id]` | Filterable archive grouped by series; record page with editable facts | creator or `manage-matches` | 0 records in production |
| Solo Queue Blocks | `/blocks`, `/blocks/[id]`, `/blocks/history` | Current block, quick add, dashboard | owner only | |
| Settings | `/settings` | Username, password, profile picture, sign out | self | Riot accounts moved to the profile |
| Admin | `/admin/people` (+ `/access`), `/admin/competition`, `/admin/data`, `/admin/branding`, `/admin/system` | People & Access, Draft Settings, Riot Data, Branding, System Health | per capability | Owner switches via the account menu |
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
  - < 640 phone: top bar + drawer + 5-tab bottom bar (Profile, Team, Draft, Matches, Meta; Team is marked on Players and Leaderboards too).
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
  - **Order:** every tile reads the same way, in rows of its own: (1) the statistic, in full; (2) the leader, on a narrow band of their card artwork, darkened and faded towards the text; (3) the winning value and its sample; (4) your place ("You · 3rd of 7", or "You: not ranked") and the runner-up.
  - **Alignment:** the rows line up across tiles side by side (CSS subgrid), so a statistic name that wraps moves that line's leaders down together instead of overlapping them.
  - **Grid:** as many 16.5rem tiles as fit (`repeat(auto-fill, minmax(min(100%, 16.5rem), 1fr))`): five at 1920, four at 1440, three at 1366, one on phones.
  - **Category rail:** the statistic gets the full width; the leader and a compact "You · 2nd" share the line below it.
  - ≥ 1280: full Draft Room.
- **Team navigation:** the sidebar has one Team entry (`NavHub` in `src/lib/nav.ts`): it opens Team Overview and stays marked on every Team section and on pages inside them (a teammate's profile). The sections are tabs at the top of each Team page, in this order: Overview, Players, Leaderboards, Matches (`SectionTabs` in `src/components/section-tabs.tsx`, rendered by the app shell on those four addresses only, filtered by the same permissions as before; Admin Mode uses `ADMIN_TEAM_SECTIONS`). Every section keeps its own address, so direct links, Back and Forward work. Team Overview stays the team's home page (its header with the logo and the five lineup cards); the other sections name the team at the right end of the bar instead of repeating the header. Phones scroll the bar sideways with a fading edge. Pages inside a section (a profile, the draft room, a match) have no tabs.
- **Team Overview as the team's home** (`TeamRoster`, `src/components/team/team-roster.tsx`):
  - **Five across, centred** (content ≥ 64rem, which covers 1366 and 1440 laptops with the sidebar open): one row of equal portrait cards, capped at 84rem and centred, with the header sharing that width (`LINEUP_WIDTH`). The rem scales with very large screens (`html` font-size clamp), so the whole lineup scales with them rather than stretching. Artwork height `clamp(13rem, 29vh, 20rem)`, queried on the named `lineup` container. The cards stand on a stage (`lineup-stage`) that reaches the foot of the window.
  - **Narrow cards** (under 15rem, e.g. 1366 with the sidebar open): each card is a `card` container, and `CardIdentity` / `CardPerformance` switch on `@max-[15rem]/card:` only there (the avatar above the name, rank and role chip wrapping, tighter labels, the pool count without the word "champions"). Other places that use these components have no `card` container and are unaffected.
  - **The floor** (`lineup-stage-floor`, `aria-hidden`): lit from just under the cards in the team's colour and carrying the team's name faintly (or the logo when one is set). It is decoration only and never sizes a card.
  - **Long names** take a second line on the cards (`CardIdentity wrapName`) instead of being cut.
  - **Unchanged:** 2 + 2 + 1 and 3 + 2 between 36 and 64rem (tablets) and the phone track.
  - **Background visibility** (`BackdropControl`, `src/components/team/backdrop-control.tsx`; `src/lib/backdrop.ts`): the Appearance button (shown only when the team has an app background) opens a popover with a 0–100 slider and "Reset to default" (50). A personal browser preference: cookie `uniiverse_team_backdrop`, read by the page on the server so it renders at the chosen level; no database. The level sets three CSS variables on `:root` through a `<style>` the control owns (`--backdrop-art`: artwork opacity 0.12–0.80; `--backdrop-veil`: veil 1.0–0.5; `--backdrop-vignette`: 1, a static radial vignette that keeps the edges dark). The app shell's backdrop reads them with the old values as fallbacks, so every other page keeps the standard subtle backdrop. Sliding re-renders only the control (the lineup is not touched), no filters or animation. Demo: the screenshot fixture draws an artwork (`src/server/demo/backdrop-art.ts`).
  - **Tests:** `e2e/home-layout.spec.ts` (1366 × 768 with the sidebar open, 1920, 2560), `e2e/team-layout.spec.ts`, `e2e/team-backdrop.spec.ts` (uploads an app background as admin, checks live update, persistence, reset, other pages, no lineup re-render, then removes it).
- **Profile Overview, compact** (`ProfileOverviewTab`):
  - **Order:** season figures, rank and form, then the primary pool, which starts within the first screen at 1440 × 900.
  - **Season summary:** the season's completeness and last update sit on the scope line.
  - **Ranked progress:** one short row, with the current rank and rank changes beside a chart drawn at its own proportions.
  - **Pools heading:** one line, with how editing works and the save state beside Add champion.
  - **Pool cards:** even rows (`poolColumns`: six as 3 + 3, or 6 across on wide screens).
  - **Off roles:** one-line summaries (`PoolSection collapsible`, test ids `<pool>-preview`, `<pool>-expand`) whose portraits still open the champion window. "Show and edit" opens the full pool with adding, removing and reordering.
  - **Tests:** `e2e/home-layout.spec.ts`.
- **Draft is an action, not a tab:** drafting starts from Team Overview (Start a draft; Resume draft when one is unfinished, or "Resume a draft (N)" leading to the list on /draft). `/draft`, draft rooms and series keep their addresses, and links from matches still work; they belong to the Team entry through `TEAM_RELATED`, so the sidebar's Team entry and the phone bar's Team tab stay marked on them. The phone bar is Profile, Team, Matches, Meta (`TAB_LIMIT` 4); Admin Mode's bar no longer has a Draft tab either.
- **Meta & Trends pages share one layout:**
  - **Header:** the title and a line of evidence (patch, games, source, regions, freshness), with the demo badge and the patch choice at the right.
  - **Highlights:** Solo Queue Meta and Pro Play show three leaders from the board below (`MetaHighlights` / `trendHighlights`). They are the most present, the most banned, and the best win rate among champions with the board's own minimum games, each tile over static, lazily loaded splash art with its sample. When nothing qualifies, a tile says so instead of naming a champion. On wide screens Solo's highlights stack in the right column so the top ten still fits one screen.
  - **Board:** the controls sit in the board's toolbar: what is listed on the left, "Rank by" on the right. Duo Synergies puts its two roles on the first row, then whose champions and Rank by.
  - **Definitions:** shown in the right column.
- **Meta & Trends navigation:** the same pattern. The sidebar has one Meta & Trends entry (Player View `nav-trends`, Admin Mode `nav-admin-league`): it opens Solo Queue Meta and stays marked on every Meta & Trends page. Solo Queue Meta, Duo Synergies and Pro Play (`TRENDS_SECTIONS`) are tabs at the top of each of those pages (test ids `meta-tabs`, `meta-tab-solo|duos|pro`; `trends-tab-*` stays the role tabs inside Solo Queue Meta). `/trends` still redirects to Solo Queue Meta, and every section keeps its address. One component draws both tab bars: `SECTION_HUBS` in `src/lib/nav.ts` lists each entry that stands for several pages (key, accessible label, sections, optional Admin Mode sections), and `currentTab` uses it so a section without its own phone tab marks its entry's first tabbed section (Pro Play marks Meta for a team member). Player View now has no collapsible groups. The closable groups remain Admin Mode's People and Site.
- **Touch and inputs:** 44 px touch targets on phones and coarse pointers; 16 px inputs on phones (no iOS zoom).
- **Constraints:** no horizontal page scroll at any width (checked by Playwright on phone/tablet/desktop and a 9-width manual pass on 14 Oct). Wide tables become cards on phones.
- **Known limitations:**
  - The phone Draft Room is a stacked flow, not champion-select-like.
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
  - Statistics provider cached per (patch, stats version).
  - Recommendations memoised per draft version (10 min).
- **Database:** single-digit-millisecond queries Sydney→Sydney. No pipelining through the pooler. Parallel reads only where measured safe; pool max 5.
- **Background work:** all Riot calls run in jobs or in background refreshes after visits; page rendering never waits on Riot.
- **Client:** server components by default; client components for the Draft Room, editors, menus and dialogs. Optimistic draft actions.
- **Images:** champion art via Data Dragon CDN with width/height, lazy loading and async decoding. Branding images come from versioned URLs with CDN caching.
- **Engine:** shortlist + beam search keep recommendations at about 1 s even with five 30-champion pools (local measurement).

### I2. Measurements

`perf-probe` job inside the production function, **14 Oct 2026 11:07 UTC, commit `f373ba0`, syd1** (cold → warm):

| Step | ms |
|---|---|
| database ping | 2.9 → 1.5 |
| session lookup / user | 6 → 3.4 / 14 → 9.4 |
| champions list (173) | 10 → 0.1 |
| players / lineup | 18 / 14 |
| **statistics provider** | **1,143 cold → 10.5 warm** (1,604 effective games) |
| Data health | 87 → 74 |
| draft load / recommendation (empty draft) | 22 / 24 (compute 7) |
| trends report | 103 → 62 |
| pro patterns | 78 → 4.6 |
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
- **Hypothesis (not measured):** match/synergy rows grow quickly as collection resumes, so the cold load will grow. The `MIN_PAIR_GAMES` floor is the existing guard.
- **Data collection, not page speed, is the main practical bottleneck** (D3, K).

### I4. Meta & Trends loading (Oct 2026)

- **What each page waits for** (perf-probe steps `page.trendsSolo`, `page.trendsDuos`, `page.trendsPro`: the page's whole server data path, cold then warm):
  - Solo Queue Meta: the trends report, the champion list and the statistics description. The description comes from the period tables (`describeStatsCheap`, cached for 60 s). The page used to build the whole statistics provider for that one line of text. On 17 Oct 2026 the cold build took 4,046 ms in production (9,671 effective games); the description took 5.4 ms.
  - Duo Synergies: one pairing's rows plus per-pairing counts, cached per statistics version.
  - Pro Play: the pro trends report and the pro draft patterns (cached).
- **Switching tabs:** the Meta tabs prefetch the other Meta pages in full (`prefetch={true}` on `meta` hub links in `SectionTabs`). Switching, and returning to a page seen in the last few minutes, uses the prefetched page; filters and patches still ask the server.
- **Loading state:** `src/app/(app)/trends/loading.tsx` draws the page's shape (header, highlights, board, definitions), so nothing jumps when the figures arrive. The tabs stay in place because they belong to the shell.
- **Local before/after:** measured on the in-memory demo with a Playwright script. Because the demo data is small, local numbers show the client side only. Production differences show in the probe steps above.

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
- the draft engine (legality, search, bans, timing, emergency, large pools, Fearless);
- proficiency (including role-specific);
- statistics filtering;
- permissions and access groups;
- authentication (sessions, temporary passwords, recovery, throttle);
- migrations (applied in order, data-preserving checks);
- Main/Alt accounts;
- ingestion and aggregation (idempotence, per-region discovery, the new refresh-share rule);
- jobs and scheduler;
- matches (archive never feeds recommendations);
- branding uploads;
- team tags and roster;
- Solo Queue Blocks privacy;
- responsive layout (no horizontal overflow on phone/tablet/desktop);
- accessibility (axe: no critical/serious violations on player and admin pages).

**Important untested workflows:**
- Signed-in production use: no automated or manual signed-in run against the live site.
- Real Riot responses: tests use fakes, so live behaviour is only seen through jobs.
- Real Data Dragon images: the container cannot reach them.
- Enemy scouting with real enemy accounts.
- Multi-device live drafting.
- The Leaguepedia login path (exercised only in production jobs).

### J3. Production verification (what was actually checked, 14 Oct 2026)

| Check | Result | Method |
|---|---|---|
| Build and deploy | ✅ Vercel deployed each commit; `/api/health` reported the commit | smoke workflow, job responses |
| Public pages | ✅ `/login` 200; private routes 307 to `/login`; `/api/jobs/tick` 401 without the secret | smoke workflow |
| Migrations 0000–0020 applied; Owner intact | ✅ | `auth-audit` job |
| Data jobs healthy | ✅ no failures in 7 days (but see the discovery stall) | `/api/health`, `data-sufficiency` |
| Linked accounts synced | ✅ 13/13 resolved and synced within the hour | `data-audit` |
| Performance | ✅ see I2 | `perf-probe` |
| Ranked discovery fix | ✅ first run after `562fe24`: 40 players scanned, 840 match ids queued; the next ingest stored 619 new games | `ranked-discover`, `ranked-ingest` jobs |
| Authenticated UI | ❌ **not tested** in production | — |
| Skins collected in production | ✅ 3,198 champion skins stored (11:22 UTC) | `version-check` job (`skinsUpserted`) |

---

## SECTION K — KNOWN ISSUES AND TECHNICAL DEBT

| # | Issue | Area | Severity | User impact | Evidence | Likely cause | Recommended approach | Status |
|---|---|---|---|---|---|---|---|---|
| 1 | Global ranked collection stalled for ~4 h | Data pipeline | **High** | Statistics stop growing; Trends and recommendations go stale | 2,321 games at 08:00 and 11:11 UTC; discovery visit runs averaged 39.3 s against a 40 s cap; ~253 players ever scanned | Ladder refreshes used the whole discovery budget | Fixed in `562fe24` (refresh share capped at 50 %) | **Fixed and production verified** (619 new games at 11:25 UTC); watch it for a day of visit-only ticks |
| 2 | Dead platforms PH2 / TH2 are retried first every run | Data pipeline | Medium | Wasted time each discovery run | `ph2`/`th2` "fetch failed" in every run; never refreshed, so always "stalest" | Riot merged them into SG2; the registry still lists them under `RIOT_PLATFORMS=all` | Remove `ph2`/`th2` from the platform registry, or back off platforms that keep failing | **Open** |
| 3 | GitHub hourly schedule unreliable | Automation | Medium | Data refreshes depend on visits | No `http` ticks 07:15–11:00 UTC on 14 Oct; earlier audit showed irregular delivery | GitHub cron is best-effort | Set up Supabase `pg_cron` every 10 min (`docs/DEPLOYMENT.md` §4c; one secret typed into Supabase's SQL editor) | **Open (user action)**; whether done: UNKNOWN |
| 4 | Thin evidence for matchups and pairings | Engine | Medium | Recommendations lean on curated traits and proficiency | median 2 games per lane/pair; leave-one-out 53 % | Collection volume | Keep collecting; the shrinkage already guards; consider Emerald/non-OCE sampling | Open (data) |
| 5 | Region skew (OCE 66 %), Emerald under-sampled | Data | Low–Medium | Mostly OCE-flavoured meta | data-audit | Early OCE-only collection; SEA host carries only OCE | Fair-share rules exist; volume will dilute | Open |
| 6 | No Support player in the lineup | Team setup | Medium (for drafting) | Engine uses a placeholder Support | data-sufficiency `placeholderRoles: SUPPORT`; Team card empty | Roster | Owner assigns a Support player on Team | **Open (user action)** |
| 7 | 4 accounts with setup pending | Accounts | Low | Those players have no full profile yet | auth-audit | Players have not signed in | Remind players | Open (user action) |
| 8 | `/api/health` "ok" did not reveal the stall | Monitoring | Medium | Silent data staleness | Issue 1 | Health checks job success, not data growth | Add a "no new ranked games in N hours" warning | Open |
| 9 | Authenticated production UI never walked through | QA | Medium | Unknown live-only issues | — | No test account for the developer | Owner runs `docs/LIVE_VALIDATION.md` §15 | Open |
| 10 | Unused schema leftovers (`primary_pool_limit`, `secondary_pool_limit`, `users.draft_lead`, `invites`, `activation_codes`, `opponent_*`) | Database | Low | None | schema | History | Leave, or drop in a careful later migration | Accepted debt |
| 11 | Two pool tables (`player_champion_pools` + `player_role_pools`) | Database | Low | None (helpers hide it) | schema | Additional roles added later | Always use the roster helpers | Accepted debt |
| 12 | Cold statistics load ≈ 1.1 s | Performance | Low | First request after a cold start is slower | perf-probe | Loading all aggregates | Watch as data grows; the sample floor exists | Monitor |

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

**Important architectural decisions:**
- The engine is pure and deterministic, with hard pool constraints.
- Proficiency is a modifier, never a gate.
- Shrinkage is tuned from measured predictive accuracy.
- There is no opponent database; scouting lives on each draft.
- The match archive never feeds recommendations.
- Background work runs through one scheduler with atomic job claims.
- Images are stored in Postgres (no paid storage).
- Every permission is checked on the server.
- No true realtime: polling SSE is enough, by the user's choice.
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
| Unfinished draft deletion | **Implemented** |
| Fearless Draft | **Implemented** |
| Opponent roster substitutions between series games | **Implemented** (per-game enemy names) |
| Reliable 10-minute scheduling (`pg_cron`) | **Requested / recommended; not confirmed set up** (user action) |
| Remove dead platforms PH2/TH2 from collection | **Not started** (recommended) |
| Data-staleness warning in health | **Not started** (recommended) |
| Higher Emerald share (15–20 %) | **Partially implemented** (sampling exists; share still low) |
| Live validation of Phase 6 by a signed-in user | **Not started** (user action, checklist ready) |
| **Abandoned / rejected — do not propose again** | Activation-code sign-in as the normal method; Team Leader / Draft Lead role; invitation links; email-based login; "Remember this device"; an opponent database or opponent-editing UI in the Draft Room; true realtime collaboration with controller hand-off or presence; "NEW" champion badges; Draft History as a separate list; pool size limits; showing mastery level next to mastery points; a win-probability figure (not supported by the data) |

---

## SECTION N — PRODUCT DECISIONS AND PREFERENCES (from the user's own briefs)

- **Simplicity first:**
  - "Do not add complexity merely because it is technically possible."
  - Keep interfaces simple, understandable and fast.
  - Give the user one simple manual instruction at a time; the user is not a developer.
- **Player-defined pools are law:** the engine recommends only inside them. Proficiency and scouting tilt the ranking, never legality.
- **Manual drafting is essential:** the controller enters every action. True realtime multi-user collaboration is *not* wanted ("I no longer care about true realtime multi-user collaboration").
- **Enemy scouting stays optional:** five optional fields, any order, no roles, no editing interface in the room.
- **Historical matches are retained** (soft delete only); results never alter recommendations.
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
- the engine core (`src/domain/engine`);
- the proficiency model;
- the scheduler and job registry;
- the Riot client and rate limiter;
- account sync;
- aggregation;
- authentication and sessions;
- permissions and access groups;
- the migration system;
- the Match Playbook;
- the shared UI primitives (`src/components/ui`), including `Menu` and `Dialog`.

### Areas requiring caution

| Area | Why |
|---|---|
| Authentication / Owner | A past change locked the Owner out (email → username). Always keep `guardLastAdmin`, recovery via `UNIIVERSE_ACCESS_PASSWORD`, and the auth-audit job. |
| Permissions | Server checks in every action; groups must never grant `manage-users`; nobody edits their own access. |
| Migrations | Additive or data-preserving only; update the four expected-migration lists in tests; run the DB tests on real Postgres. |
| Riot API quotas | Per-host limits; never add synchronous Riot calls to page rendering; respect PUUID-per-key encryption. |
| Match-history integrity | Archive only; soft delete; series re-scoring. |
| Draft legality | Pools per role are hard constraints; Fearless locks; role eligibility. |
| Profile relationships | One profile per user (unique `users.player_id`); one Main Riot account per player (unique index); dedupe across accounts. |

### Recommended workflow
1. **Inspect** the current code and production (read-only jobs: `auth-audit`, `data-audit`, `data-sufficiency`, `perf-probe`).
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
- Calling Riot synchronously while rendering or drafting.
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
| Draft engine | `src/domain/engine/*`, `src/server/engine/service.ts`, `src/server/stats/loader.ts` | stats, proficiency | `src/domain/engine/*.test.ts` |
| Draft setup / room / live | `src/components/draft/*`, `src/server/actions/drafts.ts`, `src/server/live/*`, `src/app/api/drafts/[id]/stream` | engine | `tests/db/draft-setup.test.ts`, `realtime.test.ts`, `fearless.test.ts` |
| Scouting | `src/server/scouting/session.ts`, `src/domain/scouting/*`, `src/domain/engine/tendencies.ts` | Riot client | `tests/db/scouting.test.ts` |
| Playbook / matches / series | `src/domain/playbook`, `src/server/matches`, `src/server/series`, `src/app/(app)/matches` | engine | `tests/db/matches.test.ts`, `src/domain/series.test.ts` |
| Data pipelines and jobs | `src/server/jobs/*`, `src/server/ingestion/*`, `src/server/pro/*` | Riot, Leaguepedia | `tests/db/ingestion.test.ts`, `jobs.test.ts`, `automation.test.ts`, `pro.test.ts`, `data-sufficiency.test.ts` |
| Trends | `src/server/trends.ts`, `src/components/trends/trend-list.tsx`, `src/app/(app)/trends/page.tsx` | aggregates | `tests/db/trends.test.ts` |
| Branding | `src/domain/branding.ts`, `src/server/repositories/branding.ts`, `src/components/settings/branding-panel.tsx`, `src/app/api/branding/*` | — | `tests/db/branding.test.ts`, `src/domain/branding.test.ts` |
| Solo Queue Blocks | `src/domain/ranked-improvement.ts`, `src/server/actions/ranked.ts`, `src/components/ranked/*`, `src/app/(app)/blocks` | account_matches | `tests/db/ranked-improvement.test.ts` |
| Health and diagnostics | `src/app/api/health/route.ts`, `src/domain/data-health.ts`, `system-health.ts`, `src/server/ops/*`, `src/server/jobs/*-probe.ts`, `*-audit.ts` | — | `src/domain/*health*.test.ts` |

---

## SECTION P — READ THIS FIRST — CONTEXT FOR CHATGPT

1. **What UNIIVERSE is.** A private web app for one amateur League of Legends team (~10 players + an Owner). It recommends draft picks and bans using *this team's* players, their self-chosen champion pools per role and their own Riot history, combined with high-Elo ranked and professional evidence. Every recommendation is explained. It also has player profiles with statistics, a Team page, Trends, a match archive with game plans, and a private Solo Queue improvement journal.

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
   - **Draft:** setup, live Draft Room, Match Playbook.
   - **Matches:** archive and series.
   - **Trends:** top 10 lists.
   - **Solo Queue Blocks:** private journal.
   - **Settings.**
   - **Admin:** People & Access, Draft Settings, Riot Data, Branding, System Health.

5. **Draft engine design.**
   - **Pure and deterministic.**
   - **Hard constraints:** a champion only for the player assigned to that role, from that player's pool for that role; profile roles only; bans, picks and Fearless locks excluded.
   - **Search:** enumerates legal role assignments; shortlists the 10 best per slot; finds the best complete team (exhaustive or beam search).
   - **Scoring** (in win-rate points): champion strength, player comfort (pool order + role-specific proficiency, ±2.5 pts max), synergy and composition, lane and team matchups, pro priority, execution realism, pick timing (urgency vs counterpick hold).
   - **Evidence handling:** shrunk heavily towards neutral (250 / 400 / 1000 pseudo-games) and blended over 3 patches.
   - **Confidence:** honest labels (Strong / Moderate / Close / Low).
   - **Thin data:** matchup and pairing data barely matter today; team fit, proficiency and strength drive results.

6. **Current Riot data status** (14 Oct):
   - **Player accounts:** 13 linked and fully synced.
   - **Global ranked:** 2,940 games after the fix (2,321 before it; 66 % OCE before the latest batch).
   - **Professional:** 311 games.
   - **Collection:** stalled for ~4 hours on 14 Oct and was fixed (`562fe24`); collection resumed (619 new games stored at 11:25 UTC, 209 queued).
   - **Open issues:** dead PH2/TH2 platforms waste time each run; the hourly GitHub schedule is unreliable (Supabase `pg_cron` recommended).

7. **Account / permission model.**
   - **Owner (one account, Admin Mode only):** everything, including accounts, passwords, permissions and site settings (never delegable).
   - **Everyone else:** team membership (team member or personal use), one base level (Standard Player / Team Manager / Restricted Player / custom levels / Custom ticks) plus optional additional groups (Team Lineup Manager, Match Manager, Player Manager). None opens Admin Mode. All enforced on the server.
   - **Accounts:** created only by the Owner with a Riot-verified Riot ID and a 7-day temporary password; mandatory first-login setup.
   - **Never:** email, invitations, self sign-up.

8. **UI architecture.**
   - **Server components** with client islands (Draft Room, editors, menus).
   - **Shell:** dark navy theme with a cyan accent; Inter; tokens in `src/app/globals.css`.
   - **Navigation:** collapsible sidebar (My Profile, one Team entry, one Meta & Trends entry); the sections of Team and of Meta & Trends as tabs at the top of each of their pages (`SectionTabs`, `SECTION_HUBS`, `TEAM_SECTIONS`, `TRENDS_SECTIONS`); account menu; phone tab bar (Profile, Team, Draft, Matches, Meta).
   - **Shared primitives** in `src/components/ui` (Menu never clips, Dialog, Toast, InfoTip).
   - **One card identity** (featured champion art + skin + accent) across Team, Players and profiles.

9. **Known problems.**
   - Thin matchup and pairing evidence (53 % leave-one-out).
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
