# Data pipelines

All pipelines follow the same shape: **external provider → adapter → validation → normalised tables → aggregation → cached draft features**. Provider quirks never reach the engine.

## Riot static data (Data Dragon)

`version-check` (hourly) fetches `versions.json`. When the newest version differs from the stored current patch it downloads `champion.json`, upserts champions (new ones get `firstSeenVersion`), fingerprints each kit from the per-champion file, flags suspected reworks as unconfirmed change points, opens the new patch as *current* and clears caches. If Data Dragon is unreachable and the database is empty, an offline fixture seeds the roster so development can continue; it is replaced by the first successful sync.

## Ranked high-Elo matches (Riot API)

1. `ranked-discover`: for each configured platform (`RIOT_PLATFORMS`) and tier (`RIOT_TIERS`) fetch the league list, keep the top N by LP (`RIOT_MAX_PLAYERS_PER_TIER`), upsert `tracked_summoners`. Then, for the players least recently scanned, fetch new ranked match ids since their cursor and queue them (`match_fetch_queue`, primary key = match id, so duplicates are impossible).
2. `ranked-ingest`: fetch queued matches in batches, validate with zod, normalise (patch from game version, positions to roles, champion keys to ids), reject remakes/non-ranked queues, store match + participants + bans in one transaction, mark the queue item done. Transient failures retry with attempts counting; 404s are marked failed.
3. Rate limiting: a sliding-window limiter (`RIOT_RATE_LIMITS`, default dev-key limits 20/1s and 100/120s), `Retry-After` on 429, exponential backoff on 5xx, bounded retries. Jobs stop at their time budget and resume on the next run.

## Professional games

`pro-sync` (daily) uses the provider named by `PRO_DATA_PROVIDER`:

- `leaguepedia` (default): Cargo API query joining `ScoreboardGames` and `ScoreboardPlayers`, paged, polite rate limiting, no key required.
- `oracleselixir`: parses the public CSV export from `PRO_DATA_CSV_URL`.

Games are stored under provider-scoped ids; champion names are resolved to Data Dragon ids via `ChampionNameResolver` (aliases such as Wukong → MonkeyKing). A failing provider leaves existing pro data untouched and marks the job degraded.

**Pick order.** Leaguepedia's `Team1Picks`/`Team2Picks` (champions in lock order) and Oracle's Elixir's `pick` column give each pick its 1–5 order within the side. From that the aggregation derives the tournament slot (B1, R1/R2, B2/B3, R3, R4, B4/B5, R5) and the ban phase (bans 1–3 vs 4–5); games without a complete order still count for every other statistic but not for slot patterns.

## Aggregation

`aggregate` (every 30 minutes) folds unaggregated ranked matches and pro games into:

- `stat_periods` – games per `(patch, source)`
- `champion_role_stats` – games/wins per champion and role
- `champion_ban_stats`
- `champion_matchups` – champion-in-role vs enemy-champion-in-role (all 25 pairings per game, both perspectives)
- `champion_synergies` – ally pairs with roles
- `pro_pick_slot_stats` – professional games only: games/wins per champion and draft slot (plus most common role), the basis of the pro draft patterns and of the slot shares the timing model uses

Counters are incremented with `ON CONFLICT … DO UPDATE` and the source rows are marked `aggregatedAt` in the same transaction, so re-running never double counts and a crash mid-batch is harmless. Only matches with five distinct recognised positions per team contribute role-based statistics; bans always count. After aggregation the stats version is bumped so cached providers rebuild.

## Linked Riot accounts (`account-sync`)

Players and opponent players can link Riot accounts (Riot ID → PUUID, de-duplicated by PUUID and by canonical name). Every three hours `account-sync` takes the accounts least recently synced (`ACCOUNT_SYNC_BATCH`, `ACCOUNT_SYNC_MIN_AGE_MINUTES`) and, per account: resolves the PUUID when unknown, refreshes rank and champion mastery, and fetches match ids since the account's cursor. Each match is folded exactly once into `account_champion_history` (games/wins per champion, role, queue group and patch) through the `account_matches` ledger, so re-running or overlapping windows never double count. Demo accounts (label `demo`) are never synced. The proficiency model (`src/domain/proficiency`) reads this history; unlinking an account deletes its rows.

## Statistics provider

`src/server/stats/loader.ts` builds an in-memory provider per (patch, stats version): blends the current and recent patches with recency decay, applies rework discounts, weights pro evidence, and exposes strength, role share, presence, matchup and synergy lookups with shrinkage. Demo statistics are only used when no real data exists and are labelled `isDemo`.

## Trends

Computed on demand from the aggregate tables (never raw matches): contested champions, presence and win-rate deltas versus the previous patch, pro presence, per-role lists, and alerts for the active lineup's pools.

## Health and self-monitoring

`data_refresh_status` records each job's last start/success/failure, error, duration and consecutive failures. `Settings → Data health` and `/api/health` surface warnings when a pipeline is stale (e.g. ranked ingestion silent for 12 hours, version check for 26 hours) or failing repeatedly. The `integrity` job unsticks interrupted runs, prunes the queue, retries old failures, and triggers a version check when match data is newer than the synced patch.
