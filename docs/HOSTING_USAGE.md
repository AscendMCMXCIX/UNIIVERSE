# Hosting usage (Supabase and Vercel free plans)

UNIIVERSE runs on the free plans of Supabase (the Postgres database) and Vercel (the app). On 19 Oct 2026 the owner reported:
- Supabase egress at 6.25 GB of the 5 GB a month;
- database size at 0.311 GB of 0.5 GB;
- a Vercel allowance of 10 GB described as "Functions Storage" at 100%.

This page records what caused that, what was changed, how it was measured, and how to check it again. The second pass, after egress reached 7.14 GB on 20 Oct, is the next section.

## 20 Oct 2026: egress at 7.14 GB of 5 GB

Supabase warned that the organisation was over its quota (1 Oct – 1 Nov cycle: 7.14 GB of 5 GB, no cached egress, daily peaks 14–19 Oct). What was established, from two `db-usage` reports 18.7 hours apart (19 Oct 05:29 and 20 Oct 00:09 UTC; `pg_stat_statements` since 13 Oct) and from the code:

| Source | Evidence | In those 18.7 hours |
|---|---|---|
| **Branding images, read from the database on every CDN miss** | `select content_type, data from brand_assets` ran 93 more times (86 → 179). Its blocks read put the average image at about 2 MB. Images went over the wire as bytea's hex text, **twice their size**. 14 production deployments that day: each one empties Vercel's CDN cache, region by region. | about 370 MB |
| **Players' stored games, mastery and champion history**, reloaded by profile, team and leaderboard pages | `account_matches` +664 loads (338,000 rows), `account_mastery` +1,835 loads (366,000 rows), `account_champion_history` +911 loads (456,000 rows). At their row sizes (about 180, 100 and 125 bytes on the wire) | about 155 MB |
| Retired Meta & Trends collection, until its removal at 12:13 UTC | `ranked_participants` +1,666 inserts, `champion_matchups` +193 inserts. Writes: little egress. | small |
| Connection set-up, array types, sessions, champions list | `pgbouncer.get_auth` +2,124, the array-type query +413, sessions +1,141, champions +618 | a few MB |

Postgres counts calls and rows, not bytes, so the byte figures above are estimates from row sizes. That is why the app now counts the bytes itself (below).

**What changed**
1. **The app counts its database egress.** Every query passes through the concurrency gate (`src/server/db/gate.ts`), which measures the size of each result as Postgres sends it (`src/server/db/egress.ts`). Totals per query shape and UTC day go to `db_egress_daily` every five minutes per instance, kept 35 days. A shape is the SQL text with its literals replaced, as `pg_stat_statements` shows it: no stored value is ever written there.
   - Checked against a byte-counting proxy on real Postgres: 1,395,007 bytes sent, 1,393,166 counted (−0.13%; `tests/db/egress.test.ts`).
   - TLS and connection set-up are not counted, and an instance stopped before its next write loses up to five minutes of counts. So the totals are a floor, close to the real figure.
2. **An alert.** Scheduled Data jobs runs call the `egress` job. It fails, with the five largest query shapes in its message, when yesterday went over 120 MB (about 3.6 GB in 30 days; `EGRESS_DAILY_BUDGET_MB` overrides it). GitHub's failed-workflow email is the alert, as for the other checks (`docs/MONITORING.md`).
3. **Where the bytes go:**
   - `db-usage` now reports the app's own daily totals and largest shapes, the size of every stored image, the size of match JSON on the wire, and the statements that read the most blocks (large values rank there, not by rows).
   - `perf-probe` reports the kilobytes each step read (cold and warm).
4. **Branding images:**
   - Read as base64: 1.33 times their size instead of 2 times. Measured on real Postgres: about 400 KB instead of about 600 KB for a 300 KB image.
   - Kept by each server instance, one version per kind. A request for the version it holds (the `?v=` every URL built by the app carries) is answered without the database. Each new deployment still reads each image once per instance.
5. **Profile pictures and card banners** are also read as base64.

**Second step: players' stored data** (the second source in the table above)
- Every Riot account's stored games, mastery and champion history are kept by each server instance until they change (`src/server/accounts/account-rows.ts`), per account rather than per page or per player.
  - Each read first asks Postgres for one short fingerprint row per account (row count and a hash of every column read). Only the accounts whose fingerprint changed, or that the instance has not read yet, are loaded, in one query.
  - So nothing is ever stale: a synced game or a new mastery figure shows on the next read. A warm Team page sends one short row per account instead of every stored game, mastery and history row of ten players.
  - Concurrent reads of the same account share one load; at most 150 accounts per kind are kept per instance.
- Before, only a player's games were kept (per set of accounts), and mastery was read whole on every profile page and every five minutes for each proficiency lookup.
- Pages no longer re-render on a timer (26 Oct): an open page asks for a short version of its data (`/api/freshness`, a few hundred bytes from the database) and is read again only when it changed. Before, a profile with an updating account re-rendered every 30 seconds (2 minutes while catching up on older games), changed or not.
- **The champion window** (Matchups) read every game's whole match record and the whole timeline (all ten players) on every open, warm or cold: 1.6 MB on production (`perf-probe`, 20 Oct).
  - Now one query does the matching in Postgres: the player, the one enemy in the same assigned position, and only those two players' gold, experience and CS frames.
  - A lane whose record and timeline are stored is final, so each instance keeps it; a lane still waiting for its timeline is read again. An erasure drops every kept lane on the instance that ran it (it rewrites records and deletes frames).
  - Its game list comes from the per-account store above.
  - On Postgres with 12 games (`tests/db/matchups-lane-read.test.ts`): whole records 113 KB; the window 18 KB on a fresh instance and 1.5 KB when opened again. Every timeline status (frames, pending, unavailable, no details) is unchanged.

**Measured on production after the first step** (`perf-probe`, 20 Oct 01:33 UTC, KB the database sent per step, cold then warm):

| Step | Cold | Warm |
|---|---|---|
| Encounters (Team → Matches) | 4,167 | 24 |
| Champion window (Matchups) | 1,634 | 1,634 |
| Leaderboards | 1,339 | 27 |
| Team page (roster) | 1,176 | 308 |
| Played Together | 350 | 23 |
| Proficiency lookup | 235 | 0 |
| Profile overview | 103 | 14 |

Branding images, from `db-usage` on the same day:
- The logo is a **7.6 MB animated GIF** (420×420), with a 225 KB still frame.
- The two backgrounds are 1.8 MB PNGs each.
- Since the first step each instance reads each image once per version, as base64: about 15 MB per instance after a deployment, nothing more until the next.
- Fewer deployments, and a lighter logo animation (an owner's choice; the upload panel already suggests under 5 MB), are what remain.

**The multikill backfill** (`figures-backfill`, from 20 Oct; `src/server/accounts/figures-backfill.ts`). This is an estimate from the code and the `perf-probe` figures above; the `egress` job will show the real figure once it runs.
- **Reads per run.** Each run asks Riot again for up to 60 older Season 2026 match records (30 until 22 Oct) and writes them into `match_details`. Writes are not egress. The run itself reads back only the list of due games and the champions' keys, a few KB.
- **Reloads it causes.** Each page that shows the changed data reads it again once:
  - the touched accounts' stored games, on the next profile or Team read: about 150 KB per account, the same as after an account sync;
  - Leaderboards, Played Together and Encounters, whose caches follow the stored history: up to about 3.8 MB for all three, cold, when someone opens them.
- **A profile's Refresh** (from 22 Oct) fetches up to 40 of that player's own records at once, at most once every 2 minutes per player, whoever clicks.
  - Its reloads are those of one run: that player's stored games, and the shared pages' caches when they are next opened.
  - It is bounded by the backlog: once a player's games all have their counts, Refresh fetches nothing more for them, and nothing is reloaded.
  - Every profile tab and Riot accounts share one Refresh per player (from 22 Oct, `refresh-store.ts`). After a run that changed something, the page on screen reads its own data again, as a reload would; a press inside the 2 minutes reads nothing.
- **Daily range.**
  - The backfill runs at most hourly, in the same tick as the account sync. On a day the team plays, most runs land in a tick whose account sync already changed the same caches.
  - Worst case: someone opens all those pages after every hourly run, about 24 × 4.5 MB, roughly 110 MB a day.
  - A realistic day is a few MB to a few tens of MB, under the 120 MB daily budget.
  - This lasts until the backlog is gone: about 3,400 games on 20 Oct, at 30 a run until 22 Oct and 60 after, and sooner for players who use Refresh.
- **Pausing it.** Set its interval very high in **Admin → Data & Riot**, or set `FIGURES_BACKFILL_PER_RUN=0`.

**The counter's first day** (`egress` and `db-usage` runs 39417129007 and 39417193755, 20 Oct 11:45 UTC). 19 Oct reads 0 MB because counting began on 20 Oct at 00:58 UTC. 20 Oct had 136 MB by 11:45 UTC (12,297 calls), already over the 120 MB budget, so the next scheduled run fails on it, as intended. A day with four production deployments:

| Query shape | MB | Calls |
|---|---|---|
| Branding images (`brand_assets`) | 35.6 | 8 |
| Encounters (Team → Matches), cold per instance | 34.4 | 10 |
| Champion history, stored games and mastery for profiles and Team | about 25 | about 280 |
| Job status (`data_refresh_status`, its `details`) | 3.4 | 22 |
| Riot accounts, profile pictures, pools, players, champions | about 10 | about 1,300 |

**Third step: branding images served as web copies** (`src/server/branding/web-copy.ts`). Images are kept exactly as uploaded, and each also gets a copy made for the screen:
- WebP at the largest size the app draws it: a logo at most 256 pixels (80 CSS pixels on a 3× screen), a background at most 2560. An animation keeps every frame and its timing.
- Stored beside the original (`brand_assets`, kind `logo@web` etc.) and served in its place by the same versioned URL. Only one row is read: the copy when it was made from the current upload, else the original.
- Made by the image route itself, after it has answered with the original (`after()`), from the bytes it already holds: nothing more is read from the database. A new upload deletes the old copies; a copy made from an older upload is never stored or served.
- Uses sharp, which Next.js already installs, now a direct dependency. Only the image route's function carries it (about 18 MB; its musl build is left out, `next.config.ts`).
- Measured locally on Postgres with a production build: a 30-frame 420×420 GIF of 1.94 MB became a 272 KB animated WebP; its 436 KB still frame 5 KB; a 4.5 MB PNG background 263 KB. Production's 7.6 MB logo and 1.8 MB backgrounds are larger, so the saving there should be similar or larger.
- So each image costs the database its full size once, when its copy is made, and its copy's size on each read after that.

## How to measure

- **Database (read-only):** one Data jobs run with `job: db-usage`. It returns:
  - the database size;
  - the 25 largest tables;
  - the queries that sent the most rows, used the most time and ran most often (`pg_stat_statements`, counted since its last reset).

  It reads statistics only, never table contents.
- **Deployment size (local):** build with a `DATABASE_URL` set (any Postgres URL works; it is only read to decide what the build leaves out). Then add up the files listed in `.next/**/*.nft.json`. Those files are what each server function carries.
- **Database egress (local):** use a byte-counting TCP proxy between the app and a seeded local Postgres (`scripts/perf-seed.ts`), and run the perf probe through it. The bytes Postgres sends are what Supabase counts as egress.

## Supabase egress: what sent the bytes

From `db-usage` on production (run 39204826986, statistics since 13 Oct, 6 days). Bytes are estimated from rows × columns. Supabase does not report egress per query.

| Source | Calls | Rows sent | Estimate | Status |
|---|---|---|---|---|
| Draft engine: every matchup, synergy and role record of three patches | 212 each | 13.5 M + 5.4 M + 0.7 M | ~1.6 GB | Gone: Draft removed on 19 Oct |
| Old Duo Synergies: every pair of a role, all bands | 169 | 12.6 M | ~0.75 GB | Gone: rewritten on 15 Oct |
| Duo Synergies: the chosen pairing, every patch and band row | 723 | 7.1 M | ~0.4 GB | **Fixed here**: summed in SQL |
| A player's stored games (`loadSeasonGames`, every profile page) | 7,219 | 5.1 M | ~0.9 GB | **Fixed here**: kept per instance until they change |
| postgres-js reading array types on every new connection | 18,346 | 7.8 M | ~0.15 GB | **Fixed here**: `fetch_types: false` |
| Mastery and champion history per account | ~15,000 | 4.5 M | ~0.3 GB | Unchanged (smaller) |
| Branding images (logo, backgrounds; several MB each) | 86 | 86 | ~0.2–0.4 GB | Unchanged (see below) |

What else the numbers show:
- Supavisor (the pooler) runs about 16,700 sets of connection-setup queries of its own, one per new connection. Fewer cold starts and fewer preview deployments reduce them; no setting in the app does.
- The draft engine and the old Duo Synergies loader, both already gone, account for roughly half of the period's egress. The month's reported total therefore overstates what the current code sends.

## Database size

The database is 286 MB (`db-usage`). The largest tables:

| Table | Size | Rows |
|---|---|---|
| `champion_matchups` | 68 MB | 341 k |
| `ranked_participants` | 66 MB | 207 k |
| `champion_synergies` | 28 MB | 136 k |
| `match_details` | 28 MB | 7 k |
| `ranked_bans` | 21 MB | 196 k |
| `brand_assets` | 18 MB | 4 |

All of them are the statistics the app shows, so nothing was deleted (deleting production data needs the owner's approval).

The players' index on `match_details` (migration 0058, 26 Oct 2026; docs/PERFORMANCE.md → "Stored game records") adds a few MB: 6.4 MB for 7,300 synthetic records of production's shape, 8.0 MB in production (7,296 records, 26 Oct). `db-usage` counts it in `match_details`'s `index_bytes`.

The tables grow with every patch of collected ranked games. The aggregation already keeps a bounded patch window. If the size nears 0.5 GB, the cheapest safe step is to drop the evidence of patches older than the window. That is a data deletion, so it is left to the owner to approve.

## Vercel: "Functions Storage"

Vercel's Hobby plan has no item by that name in its documentation. This was not verified in the Vercel dashboard (this work has no access to it).

What was measured is the size of the server functions each deployment stores. Every one of the 68 functions carried its own copy of PGlite, the embedded demo database (about 19 MB of WASM and data). Production never loads PGlite: it connects to Supabase. Every deployment, production or preview, stored all of those copies again.

| Build with a `DATABASE_URL` | Traced files (all functions) | PGlite part |
|---|---|---|
| Before (main at e976f86) | 1,555 MB | 1,284 MB |
| After | 270 MB | 0 MB |

If the item is in fact Vercel's 10 GB **Fast Origin Transfer** (bytes sent by functions), two changes here reduce it:
- the Meta & Trends tabs no longer render the other two pages in full on every visit;
- previews are no longer built on every push.

The branding images are the other large function responses (see "What still needs attention").

## What changed

1. **PGlite left out of Postgres deployments** (`next.config.ts`). The exclusion applies only when the build has a `DATABASE_URL`, so the demo, local development and the browser tests keep PGlite. `src/server/db/create.ts` now loads PGlite and drizzle's PGlite driver only when a PGlite database is opened. drizzle's driver imports PGlite as soon as it loads, so a top-level import would have made every function fail to start without it.
   - Checked by building with a `DATABASE_URL`, hiding the PGlite package, starting the server and opening the setup page and `/api/health` (`"db":{"ok":true,"mode":"postgres"}`).
2. **Previews only when asked for** (`scripts/vercel-ignore-build.sh`). Production builds are unchanged. A branch push builds a preview only for a branch named `preview/...` or a commit message containing `[preview]`.
   - Nobody reviewed the previews: the browser tests run in CI.
   - If the preview environment has a `DATABASE_URL`, each preview also ran its own cold caches against the live database.
3. **No array-type lookup per connection** (`fetch_types: false` in `create.ts`). Nothing in the app sends or reads Postgres arrays: lists are sent as `IN (...)` and documents as JSON. The whole database suite runs on Postgres with this setting.
4. **Duo Synergies summed in SQL** (`src/server/duo-synergies.ts`; removed later on 19 Oct with Meta & Trends).
   - Before: every patch and rank-band row of the chosen pairing (~9,900 rows a request).
   - Now: one row per champion pair that reaches the listing minimum, plus one row of totals.
   - Checked against the previous implementation: identical reports for every role pair, orientation, patch choice, sort and lineup-pool filter (4,410 listed rows, 9,606 pairs), on PGlite and on Postgres.
5. **A player's stored games kept until they change** (`loadSeasonGames`; then `cachedUntilChanged` in `src/server/observability/cache.ts`, today `accountRows` in `src/server/accounts/account-rows.ts`).
   - Each read first asks the database for a one-row fingerprint of the rows: a count plus a hash of every column read, computed in Postgres.
   - Only a new fingerprint loads the rows again. Nothing is ever stale: a synced game, a filled-in record or a removed game shows on the next read.
   - A warm instance sends one small row instead of a thousand.
   - Bounded to 200 entries per database handle.
6. **Meta & Trends tabs prefetched on intent** (`src/components/section-tabs.tsx`). Another tab is fetched in full when the pointer, keyboard focus or a finger is on it, not on every visit. Removed later on 19 Oct with Meta & Trends.

## Numbers after (local, same seeded database, same probe)

Bytes sent by Postgres to the app while running the perf probe (`runPerfProbe`, the same steps as the `perf-probe` job):

| Run | main (e976f86) | After | Change |
|---|---|---|---|
| One probe, cold process | 5.83 MB | 1.84 MB | −68% |
| Three probes in one process (a warm instance) | 17.38 MB | 5.38 MB | −69% |

## Safeguards

`src/server/ops/hosting-budget.test.ts` checks that:
- previews are skipped unless asked for, and production is built;
- a build with a `DATABASE_URL` leaves PGlite out, and one without it keeps PGlite;
- `create.ts` never imports PGlite or its driver at the top level.

Other tests:
- `tests/db/season-games-cache.test.ts`: the cached games follow every change at once.
- `src/server/observability/cache.test.ts` (today `tests/db/account-rows.test.ts`): the cache loads again only on a new fingerprint and stays bounded.
- `tests/db/duo-synergies.test.ts`: unchanged, passed (removed later with Meta & Trends).

## 21 Oct 2026: the first days with the counter

- **The days.** The `db-usage` report of 21 Oct, 06:26 UTC (Data jobs run 39555368544) gives:
  - 20 Oct: 164.5 MB of the 120 MB daily budget, so the `egress` alert fired as designed.
  - 21 Oct to 06:26: 62.5 MB.
- **What 20 Oct still held.** Its first half came before the WebP brand images (#97 merged about 12:00 UTC). Brand image reads are 46.3 MB of that day; none appear among 21 Oct's largest reads.
- **The perf probe is itself a cost.** One `perf-probe` run reads about 6 MB (run 39550211385, cold and warm steps):
  - encounters 2.6 MB;
  - leaderboards 0.95 MB;
  - the Team roster 0.8 MB.

  The five post-deploy probes on 21 Oct account for about half of that morning's egress. So a deploy is now checked with `smoke` alone, and `perf-probe` runs only for changes to data loading (CLAUDE.md §5).
- **Job status reads.** Every page's shell and every scheduler tick read each job's whole last summary (`data_refresh_status.details`), about 175 KB a read and 61 reads by 06:26 on 21 Oct. They now read only the fields they use (#110). On production after its deploy (Data jobs run 39558941024), the probe's status read went from 175 KB to 3 KB and data health from 195 KB to 23 KB.

## 21 Oct 2026: Encounters as one compact answer

Encounters was the largest read left after the branding images: 34.4 MB in 10 cold loads on 20 Oct. On 21 Oct at 07:00 UTC, a production probe measured one cold load (9,647 rows): 2,616 KB in 655 ms. A warm load took 21 KB in 62 ms.

**What changed** (`src/server/matches/encounters.ts`)
- **Before:** the database sent one row per member, game and other player, each repeating the game's columns, the account ids and the 78-character PUUID.
- **Now it sends one JSON value instead.** Each member game appears once, with the players met in it by index, and each player appears once, as their key and latest Riot ID.
  - **Keys:** the database computes each player's key (`encounterKey`), so PUUIDs no longer leave it.
  - **Fewer players:** only players some view can show are kept: twice or more alongside, twice or more against, or in two games with two members. Filters only remove games, so a player outside these never appears in any view or insight.
- **The page is unchanged.** The page rebuilds the same rows from this answer, so every count, filter, list, insight and player window is computed as before. `tests/db/encounters-equivalence.test.ts` keeps the previous query as a reference and compares both on a random history that includes every edge case. That covers 90 season, mode, member and account filters, every list, minimum, order and search, the insights and each player's games.
- **JIT is off for this statement.** Postgres assumes each game has 100 participants, not 10, which put the query over its JIT threshold. Compiling took longer than running it: 0.1 to 1.7 s, depending on the table statistics. The query now runs in a transaction with `SET LOCAL jit = off`.

**Measured locally** (PostgreSQL 16, a production-sized synthetic history: 7 members, 2,733 member games, about 9,300 rows; three to four runs):

| | Database sent | Query time |
|---|---|---|
| Previous query | 2,526 KB (9,321 rows) | 130–200 ms |
| Compact answer, cold load (with the team's other reads) | 434 KB | 190–290 ms |
| Warm load (cached) | 4 KB | 11–15 ms |

- **83% less data per cold load.** The query takes about 60–100 ms longer in the database, which now does the counting. In production the previous load was mostly transfer (655 ms for 2.6 MB), so it should not be slower there.
- **Production after the deploy:** pending (the post-deploy `perf-probe`).

## 21 Oct 2026: Leaderboards as one compact answer

With Encounters done, Team Leaderboards' stored games were the largest single read: 17.1 MB in 21 calls on 21 Oct by 10:10 UTC (about 835 KB a call), each time an instance's cache was cold or the history had changed.

**What changed** (`storedGames` in `src/server/leaderboards/service.ts`)
- **Before:** one row per stored game. Each row carried 20 columns, the account's id and the game's extra figures as a JSON object with their names (`doubleKills`, `controlWardsBought`, ...).
- **Now the database sends one JSON value:** each game an array, its account by its place in the list and its extra figures as an array in a fixed order. Absent or null figures are left out, which every board already read as missing.
- **Everything after the read is unchanged:** one game per match per player, the stored-row count, the cache, the boards. `tests/db/leaderboards-equivalence.test.ts` keeps the previous reading as a reference and compares both on a random history with every kind of stored game. It compares the games, the stored-row count, and every statistic's board in every queue, role, season and lineup scope (over 2,800 boards).

**Measured locally** (PostgreSQL 16, a production-sized synthetic history: 7 members, 1,800 games, 85% with their figures; three runs):

| | Database sent | Query time |
|---|---|---|
| Previous query | 813 KB | 20–40 ms |
| Compact answer | 278 KB | 22–32 ms |
| Whole cold load, with the page's other reads | 283 KB | 39–78 ms |
| Warm load (cached) | 5 KB | 10–23 ms |

- **66% less data per cold load,** at the same query time: about 11 MB a day at 21 Oct's rate.
- **Production after the deploy:** pending (the post-deploy `perf-probe` and `db-usage`).

## 21 Oct 2026: Encounters per profile

Encounters moved from Team → Matches into each player's profile (Match History → Encounters). The team-wide read above is gone with it: there is no team load to cache any more.

**How a profile's Encounters reads** (`src/server/players/encounters.ts`)
- **The season and game-mode choices** come from one count per season and queue, a few rows (`loadGamesBySeason`). Match History reads the same from the games it lists.
- **A page of players** is counted in the database for this player's games only: one per match, the season read from the patch, the players met by account. Only the page shown is sent (25 players, more with "Show more"), with the four highlights, as one JSON value. Keys are computed in the database, so no PUUID leaves it.
- **One player's window** is the same query narrowed to that player, with their 100 newest games.
- **Nothing is cached:** each request costs a few kilobytes, so there is no cold load to pay for.

**Measured locally** (PostgreSQL 16, a production-sized synthetic history: 7 members, 2,720 member games with full match records; the busiest player has 1,100 games on two accounts, 959 of them in Season 2026; four runs each):

| | Database sent | Query time |
|---|---|---|
| Season and game-mode counts | 0.5 KB | 24–32 ms |
| A page: opponents met twice or more, with highlights | 2.7 KB | 113–149 ms |
| A page: everyone met once or more, best record first | 2.6 KB | 85–102 ms |
| A page: Ranked Solo/Duo, one account | 2.6 KB | 38–42 ms |
| One player's window (26 games) | 1.8 KB | 53–67 ms |

- **Before (Team → Matches):** a cold load sent 434 KB locally and 2.6 MB in production before the compact answer (above), then about 4 KB warm.
- **Production after the deploy:** pending (the post-deploy `perf-probe`, step `profile.encounters`).

## 29 Oct 2026: Match History's Refine (team members)

Match History's Refine counts, for every visit, how many of the listed games each other team member played with the player and against them (`src/server/players/history-members.ts`).

**How it reads:** one statement over `account_matches` only: the player's listed games with their side, joined to the members' own stored games by match, compared by side, grouped per member. The database sends one row per member (a few hundred bytes). The games of one member are read only while that member is chosen. No record JSON (`match_details.participants`) is read.

**Measured locally** (PostgreSQL 16, a production-sized synthetic history: 7 other members, 5,000 stored records with ten participants each, the player with 1,100 games on two accounts, 275 of them shared; `EXPLAIN (ANALYZE, BUFFERS)`, warm):

| | Database time | Buffers | Statement round trip |
|---|---|---|---|
| Members found in the records' participants (first version, not shipped) | 72.8 ms | 17,592 (every record opened; Postgres chose a sequential scan over the participants index) | 98–162 ms |
| Members found in their own stored games (shipped) | 5.6 ms | 125 | 21–36 ms |

Both found the same 137 games with a member and 138 against. Cold, the first version would have read every stored record from disk on each visit (the cost that makes Encounters slow cold in production, `docs/PERFORMANCE.md`); the shipped one reads narrow rows only.

- **Production after the deploy** (Data jobs run 40825361632, 29 Oct 2026, commit 19b73c3): the `perf-probe` step `profile.historyMembers` took 78.6 ms and sent 0.5 KB for the player with the most games: 1,150 games, 6 members with a linked account, 1,115 member placements. That is one first call, including the round trip from Vercel's Sydney region to the database.

## 29 Oct 2026: players met in other games (Match History's scoreboard)

When a game opens under its card, the scoreboard marks the players the player met in other games of the list's season and game mode (`loadMatchMeetings`, `src/server/players/encounters.ts`).

**How it reads:** one statement, once per game opened (kept by the list's cache): the game's record names its players (those Encounters lists), then only the records holding one of them are found through the participants' index (`match_details_puuids_idx`), each kept when it is one of the player's games in the scope (a primary-key lookup in `account_matches`). The answer is a few rows: place in the scoreboard, Encounters key, and three counts (about 70 bytes a marked player). Not the player's whole history: the Encounters list reads every record of the season, this reads only the records of the nine other players.

**Measured locally** (PostgreSQL 16, the synthetic history above: 5,000 stored records, the player with 1,100 games on two accounts, plus 40 recurring players placed in every 5th and 7th of the player's games and every 9th of the other members' games; `EXPLAIN (ANALYZE, BUFFERS)`, warm):

| Game | Records found through the index | Of them the player's | Database time | Buffers | Statement round trip |
|---|---|---|---|---|---|
| Two recurring players (10 games each; answer 139 bytes) | 41 | 19 | 2.0–4.3 ms | 355–358 | 3.5–9.2 ms |
| No recurring player (only the game itself) | 1 | 1 | 0.5 ms | 48 | 2.8–3.8 ms (one of 24 ms) |
| Not the player's game (answered "not found"; the index is not used) | – | – | 0.2 ms | 3 | 3.0–4.3 ms |

The higher figures in each range were taken while the browser tests ran on the same machine.

The counts equal those of the player's games in Encounters for the same players (checked on this history, and on every game of a randomised one in `tests/db/profile-encounters.test.ts`).

- **Production after the deploy** (Data jobs run 40829460360, 29 Oct 2026, commit 1a24d17): the `perf-probe` step `profile.matchMeetings` took 25.9 ms and sent 0.1 KB for the newest game of the player with the most games (1,150 games this season). No player in that game had been met in another game this season, so this is the light case, the table's second row. A game with players met before has not been timed in production yet; later probe runs time whichever game is newest then. That is one first call, including the round trip from Vercel's Sydney region to the database.

## What still needs attention

- **Meta & Trends removed** (after this change). Its collection and aggregation jobs were most of the database's writes, and its tables hold about 200 MB of the database. 12 of them (about 206 MB) were dropped on 4 Nov 2026 (#86, after a verified backup); the rest stay until the owner decides (`docs/DATA_PIPELINES.md`, Retired tables).
- **Branding images.** The four stored images total about 18 MB (`brand_assets`), each served from the database on a cache miss.
  - Their URLs are versioned and cached for a year, by browsers and by Vercel's CDN.
  - Assumption, not verified here: Vercel's CDN cache is cleared by each production deployment. The 86 reads in 6 days fit that pattern: a few images times the number of deployments and regions. If so, every deployment reads them from Supabase again, several MB each, both as egress and as function response.
  - Done on 20 Oct: they are served from WebP copies at the size they are drawn (third step above). Moving the images to object storage is the larger fix, if ever needed.
- **Encounters** (Team → Matches) was the next largest read when an instance starts cold: 2.6–4.1 MB a load, 34 MB on 20 Oct. It then sent about a sixth of that, and since moving to profiles a few kilobytes a page (21 Oct, above); its production figure follows the deploy.
- **Leaderboards** was then the largest read (about 835 KB a cold load, 17 MB on 21 Oct by 10:10 UTC). It now sends about a third of that (21 Oct, above); its production figure follows the deploy.
- **Check the Vercel usage page** after a few days. Confirm which item was at 100% (deployment storage or Fast Origin Transfer) and that it is falling.
- **Supabase egress** resets with the billing cycle. Watch the next cycle: the removed draft engine and the changes here should keep it well under 5 GB. The `db-usage` job shows the remaining top queries at any time.

## 2 Nov 2026: database size and the retired tables

Read-only `data-audit` and `db-usage` runs on 2 Nov 2026 (after the deploy of 8b079e9):

- **Size:** `db-usage` reports 361 MB (`data-audit`: 378,042,035 bytes) of the free plan's 0.5 GB. On 26 Oct it was 346 MB, so it grows by about 2 MB a day: roughly two months of headroom at this pace.
- **About 217 MB of it is retired data** that nothing reads or writes:
    - `ranked_participants` 71.2 MB;
    - `champion_matchups` 70.7 MB;
    - `champion_synergies` 29.2 MB;
    - `ranked_bans` 23.1 MB;
    - `tracked_summoners` 11 MB;
    - `ranked_matches` 4.8 MB;
    - `match_fetch_queue` 3.5 MB;
    - the professional, statistics and Draft tables, about 5 MB together.

  `last_known_ranks` (8.4 MB) also holds 32,729 ladder ranks from the retired collection.
- **Live data:** `match_details` 44.9 MB, `match_timelines` 39.5 MB, `brand_assets` 18.4 MB, `account_matches` 5.8 MB.
- **What to do:** the held drops (PRs #86 and #138, `docs/DATA_PIPELINES.md`, "Retired tables") free most of it, once the owner has verified a backup and kept an offline copy. Until then nothing is deleted.
- **Done (4 Nov 2026):** #86 and #138 dropped them, after the owner had verified a backup and kept an offline copy. Production check run 15 then read the database at 161 MB, 32% of the plan, down from 378 MB. Still stored: `tracked_summoners` (11 MB), the small `region_status`, `champion_change_points` and `stat_*_periods` tables, and the ladder ranks in `last_known_ranks`. Removing them deletes data for good, so it is a separate decision for the owner (`docs/DATA_PIPELINES.md`, "Retired tables").
- **Egress:** 27.2 MB on 2 Nov (budget 120 MB a day), on a day with several manual runs.
