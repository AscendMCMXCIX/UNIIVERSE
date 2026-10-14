# Data pipelines

All pipelines follow the same shape: **external provider → adapter → validation → normalised tables → aggregation → cached draft features**. Provider quirks never reach the engine.

## Riot static data (Data Dragon)

`version-check` (hourly) fetches `versions.json`. When the newest version differs from the stored current patch it downloads `champion.json`, upserts champions (new ones get `firstSeenVersion`), fingerprints each kit from the per-champion file, flags suspected reworks as unconfirmed change points, opens the new patch as *current* and clears caches. If Data Dragon is unreachable and the database is empty, an offline fixture seeds the roster so development can continue; it is replaced by the first successful sync.

## Ranked high-Elo matches (Riot API)

Servers come from `RIOT_PLATFORMS` (`all`, a list of platform ids, or regional shorthands), resolved through the single platform registry in `src/domain/riot-platforms.ts` (17 public League servers, no Chinese servers). Riot rate-limits each host separately, and the client keeps one sliding-window limiter per host (`RateLimiterPool`), so regions never compete for one budget and a 429 on one host pauses only that host.

1. `ranked-discover`: region-scoped and bounded. Each run refreshes the league lists of the *stalest* few platforms (`RIOT_LEAGUE_REFRESHES_PER_RUN`, default 6; a platform counts as fresh for `RIOT_LEAGUE_REFRESH_MINUTES`, default 360), in parallel across platform hosts, keeping the top N by LP per tier (`RIOT_MAX_PLAYERS_PER_TIER`) and upserting `tracked_summoners` in batches. It then scans the match lists of the least recently scanned players, taking a fair share per platform (`RIOT_MAX_PLAYERS_PER_RUN` divided across the configured platforms, so KR never starves OCE), and queues new ranked match ids since each player's cursor (`match_fetch_queue`, primary key = match id, so duplicates are impossible). `region_status` records, per platform, the last ladder refresh, last scan, last ingest and last error.
   Riot encrypts player ids (PUUIDs) per API key: ids fetched under one key answer 400 under another. After every full league refresh the job prunes tracked rows the refresh did not touch (players off the ladder, or ids stored under a previous key), and a player whose id Riot cannot decode is dropped on the spot; both come back from the next league list under readable ids. Match ids are not encrypted, so the fetch queue survives a key change untouched.
2. `ranked-ingest`: drains the queue with one worker per regional host (americas, europe, asia, sea) running in parallel, each taking batches of its platforms' pending ids: fetch, validate with zod, normalise (patch from game version, positions to roles, champion keys to ids), reject remakes/non-ranked queues, store match + participants + bans in one transaction, mark the queue item done. Workers keep taking batches while the time budget allows; a worker stops early when its batch hits failures or the key is rejected. Transient failures retry with attempts counting; 404s are marked failed. The job summary lists requests per host and matches per platform.
3. Rate limiting: per-host sliding windows (`RIOT_RATE_LIMITS`, default dev/personal-key limits 20/1 s and 100/120 s per host), `Retry-After` on 429, exponential backoff on 5xx, bounded retries. Jobs stop at their time budget and resume on the next run.
4. Coverage: Admin → Data & Riot → **Global Data Coverage** lists every server (configured or not) with status (Active · Stale · No data · Error · Pending · Not configured), the patch with most games, current-patch/all games, players tracked, queued ids and last sync. A configured region without current-patch games is a warning, never "healthy".

## Professional games

`pro-sync` (daily) uses the provider named by `PRO_DATA_PROVIDER`:

- `leaguepedia` (default): Cargo API query joining `ScoreboardGames` and `ScoreboardPlayers`, paged, polite rate limiting, no key required.
- `oracleselixir`: parses the public CSV export from `PRO_DATA_CSV_URL`.

Games are stored under provider-scoped ids; champion names are resolved to Data Dragon ids via `ChampionNameResolver` (aliases such as Wukong → MonkeyKing). A failing provider leaves existing pro data untouched and marks the job degraded with the provider's own message (Cargo reports a refused query as HTTP 200 with an `error` object, which the adapter quotes verbatim). The Leaguepedia query joins `ScoreboardGames`, `ScoreboardPlayers` and `Tournaments` (for the league name, which `ScoreboardGames` does not carry); if the Tournaments join is refused the adapter retries without it and leaves the league blank.

Leaguepedia rate-limits anonymous API clients to the point that a shared cloud egress address is refused on its first request, so the adapter logs in with a bot password (`LEAGUEPEDIA_USERNAME` as `Account@BotName`, `LEAGUEPEDIA_PASSWORD`; DEPLOYMENT.md §2b) once per run, keeps the session cookies for that run and adds `assert=user` to every query so a lost session is reported instead of silently answered anonymously. Without credentials the job explains what to configure.

Every job result, in Admin → Data & Riot and in the HTTP response, carries the last log lines, and a degraded job's message is repeated as a Data health warning so a rejected key or a refused query is visible without opening logs.

**Pick order.** Leaguepedia's `Team1Picks`/`Team2Picks` (champions in lock order) and Oracle's Elixir's `pick` column give each pick its 1–5 order within the side. From that the aggregation derives the tournament slot (B1, R1/R2, B2/B3, R3, R4, B4/B5, R5) and the ban phase (bans 1–3 vs 4–5); games without a complete order still count for every other statistic but not for slot patterns.

## Aggregation

`aggregate` (every 30 minutes) folds unaggregated ranked matches and pro games into:

- `stat_periods` – games per `(patch, source)`
- `stat_region_periods` – games per `(patch, source, platform)` with queue id, ladder population (e.g. `MASTER+`) and first/last game time: the provenance behind every number (which regions, how many games each, how fresh)
- `champion_role_stats` – games/wins per champion and role
- `champion_ban_stats`
- `champion_matchups` – champion-in-role vs enemy-champion-in-role (all 25 pairings per game, both perspectives)
- `champion_synergies` – ally pairs with roles
- `pro_pick_slot_stats` – professional games only: games/wins per champion and draft slot (plus most common role), the basis of the pro draft patterns and of the slot shares the timing model uses

Counters are incremented with `ON CONFLICT … DO UPDATE` and the source rows are marked `aggregatedAt` in the same transaction, so re-running never double counts and a crash mid-batch is harmless. Only matches with five distinct recognised positions per team contribute role-based statistics; bans always count. After aggregation the stats version is bumped so cached providers rebuild.

## Linked Riot accounts (`account-sync`)

Players link Riot accounts by Riot ID (`GameName#TAG`, stored exactly as typed). ACCOUNT-V1 requests go to the americas, asia or europe routing value (`accountRegionFor` in `src/domain/riot-platforms.ts`): Riot does not serve that API from the `sea` host that carries OCE and South-East Asian match data, and asking it there answers 403, which is indistinguishable from a rejected key. Resolution is real and in this order: ACCOUNT-V1 `by-riot-id` → PUUID (the canonical identity; Riot's own spelling of the name is adopted), then ACCOUNT-V1 `region/by-game/lol/by-puuid` → the server the account actively plays on, which replaces the sign-up region selection (`platform_source = riot`); if that lookup is unavailable the selected server stays (`platform_source = user`, OCE by default). Sign-up never waits for Riot: accounts are inserted as `never`, a best-effort verification runs right after the sign-up response (`kickoffAccountSync`), and anything Riot could not answer is stored as `pending` with a plain-language reason and retried by the job.

Every tick (`account-sync` is due every 15 minutes) works through the linked accounts most urgent first: new or failing links (retried with back-off: 5 minutes after the first failure, doubling per attempt up to 6 hours), accounts still collecting this season's history (every run until complete), accounts of active players (main group, or signed in during the last week) not refreshed for 45 minutes (`ACCOUNT_SYNC_ACTIVE_AGE_MINUTES`), then everyone else after 3 hours (`ACCOUNT_SYNC_MIN_AGE_MINUTES`); `ACCOUNT_SYNC_BATCH` and `ACCOUNT_SYNC_PENDING_BATCH` bound a run so failing links never starve the rest. Opening a player's overview, profile or Riot settings also refreshes that player's due accounts in the background (about 40 seconds, 60 matches, a two-minute lease per player), and the page re-renders itself every 30 seconds while anything is still updating, so history fills in while it is watched. Per account it resolves the PUUID when unknown, confirms the server, refreshes rank and champion mastery, and collects the whole current season for every supported queue (Ranked Solo/Duo 420, Ranked Flex 440, Normal Draft 400, Blind 430, Swiftplay 480, Quickplay 490, Clash 700): the newest page first, then older pages resumed from `history_backfill` until the season start, bounded per run so the tick stays inside its time budget. Each match is folded exactly once into `account_champion_history` (games/wins/KDA per champion, role, queue group and patch) through the `account_matches` ledger, so re-running or overlapping windows never double count. Several accounts of one player are combined by the proficiency service; a Riot ID that resolves to a PUUID already linked (a renamed account) is flagged as a duplicate and never counted twice. Demo accounts (label `demo`) are never synced. Once the current season is complete, spare budget collects the previous season the same way (`history_backfill.previous`), so last season can be shown with real numbers; older seasons are not collected. Sync states shown to players: Updating (being verified, or first games on the way) · Catching up on history (recent data in, older games of the season being added automatically) · Up to date · Delayed (no refresh for 6 h, or Riot unavailable; retried automatically) · Needs attention (Riot ID not found, duplicate), each with a sentence and "Last updated". "Retry sync" appears only for Delayed and Needs attention. Unlinking an account deletes its rows.

Raw facts (`riot_accounts`, `account_champion_history`, `account_mastery`) stay separate from the derived proficiency (`src/domain/proficiency`): games, recent games, games this patch, role usage, last played, mastery and results become a 0–1 score, a confidence and a tier (Main · Comfortable · Familiar · Few games · Out of practice · Not played; revision 2, see `docs/DRAFT_ENGINE.md`). The engine applies proficiency as a comfort modifier among *legal* champions only (pools remain the hard eligibility rule) and the recommendation's "Why this pick?" breakdown states the contribution and says explicitly when player data changed the ranking versus pool order alone. Each player's profile shows the per-champion table with provenance (accounts, games analysed, current-patch games, last sync); owners and coaches see raw sync diagnostics.

`account_matches` also keeps per-match facts (queue, champion, role, result, enemy champion in the same position, patch, duration) so a player's own Solo/Duo games can be imported into their private Ranked Improvement journal without another Riot call; nothing in the journal flows back into statistics or proficiency.

## Statistics provider

`src/server/stats/loader.ts` builds an in-memory provider per (patch, stats version): blends the current and recent patches with recency decay, applies rework discounts, weights pro evidence, and exposes strength, role share, presence, matchup and synergy lookups with shrinkage. Demo statistics are only used when no real data exists and are labelled `isDemo`.

## Trends

Computed on demand from the aggregate tables (never raw matches): contested champions, presence and win-rate deltas versus the previous patch, pro presence, per-role lists, and alerts for the active lineup's pools.

## Health and self-monitoring

`data_refresh_status` records each job's last start/success/failure, error, duration and consecutive failures. Admin → Data & Riot and `/api/health` surface warnings when a pipeline is stale (e.g. ranked ingestion silent for 12 hours, version check for 26 hours) or failing repeatedly. The `integrity` job unsticks interrupted runs, prunes the queue, retries old failures, and triggers a version check when match data is newer than the synced patch.
