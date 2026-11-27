# Hosting usage (Supabase and Vercel free plans)

UNIIVERSE runs on the free plans of Supabase (the Postgres database) and Vercel (the app). The newest record is first. On 19 Oct 2026 the owner reported:
- Supabase egress at 6.25 GB of the 5 GB a month;
- database size at 0.311 GB of 0.5 GB;
- a Vercel allowance of 10 GB described as "Functions Storage" at 100%.

This page records what caused that, what was changed, how it was measured, and how to check it again. The second pass, after egress reached 7.14 GB on 20 Oct, is the next section.

## 27 Nov 2026: the multikill comparison's own table (migration 0070) and the fairness check

**What changed** (docs/PERFORMANCE.md, "The multikill comparison: the players' counters in their
own table"): the multikill score's comparison read every season record's players from TOAST storage,
2,991 ms cold on production (26 Nov); it now reads `match_multikills`, about 200 bytes a counted
player, kept by the database from the records.

| | Before | After (estimate; the probe and `db-usage` confirm it) |
|---|---|---|
| Database time per cold computation | 2,991 ms, about 3,000 random page reads and a 30 MB temporary sort | about 0.1–0.25 s, the table read in sequence; 30–60 ms warm |
| Vercel Provisioned Memory per cold computation (2 GB × wall time, waiting on the database included) | about 6 GB-s | about 0.4 GB-s |
| Vercel Active CPU | milliseconds (waiting is not Active CPU) | the same |
| Egress per computation | about 27 KB | the same 27 KB; recomputed more often (30-minute limit, 10 minutes after a change): under 1 MB a day realistically, 2.6 MB at worst, of the 120 MB a day |
| Storage | — | about 10–16 MB: 9.75 MB measured for 47,880 rows (7,600 synthetic records of production's shape, heap 7.6 MB plus its key), production's count of counted players unknown here; about +150 KB a day at 75 records a day |
| Writes | — | about nine small rows per stored record, by the trigger (within the noise of an insert: 1,000 inserts took 403 ms with it and 421 ms without, the design map) |

- **The deploy:** the migration copies every stored record's players once, inside the migration's
  transaction at the first cold start after the deploy: 1.8 s locally for 7,600 records (busy
  shared machine), expected about 1–5 s on production. Other cold starts wait on the migration's
  lock; the sync's inserts wait; reads do not. 0058's and 0069's indexes had the same profile.
- **No pre-warming:** a cold computation is now a fraction of a second, the Production check opens
  Leaderboards right after each deploy anyway, and the background tick runs in another instance,
  whose in-memory cache the page does not share: it would only add reads.
- **The fairness check** (`multikill-audit`, read only, by hand, never scheduled): one run reads the
  members' season games (`readLeaderboardGames`, about 0.5–1 MB), the comparison (27 KB) and one
  statement over `match_multikills` (530 KB on 7,600 synthetic records, about 0.5 MB expected):
  about **1.5 MB of egress** and a few seconds of database time once, about 1–3 s of Active CPU and a
  cold start; one Data jobs run (at least 1 billed minute), or Admin's Run check (no Actions minute).
- **After the deploy** (CLAUDE.md §5; one Data jobs run, about 1 minute of Actions and 6 MB of
  probe egress): `auth-audit access-audit perf-probe db-usage multikill-audit`. `auth-audit` lists
  `0070_match_multikills`; `access-audit` finds the backup role reading the new table and the Data
  API's roles holding nothing, and no callable function; `perf-probe`'s
  `leaderboards.multikill-baseline` cold well under 300 ms with the same counts as 26 Nov plus new
  games; `db-usage` gives the table's size.

## 27 Nov 2026: Champion Intel's builds by queue, the builds audit, and the Master+ sampling (switched off)

- **The builds statement counts every queue at once** (D5): each row carries its queue and the most
  games one player had with its value (worked out inside the database). Its answer grows by about
  25–70% in rows, each a few bytes longer: 5–20 KB for a popular champion becomes about 7–30 KB. The
  database time is unchanged (18–44 ms on the demo), it is still one statement per champion and patch
  window cached six hours (`BUILDS_FORMAT` 2 is a new key: the first day of the release counts each
  champion opened once more), and **a queue chosen on the page reads nothing**. The page's payload
  carries up to four queue views (about 4 KB each on the demo, most of them the short "too few" view).
- **The builds audit** (`builds-audit`, called by the Production check on each run): the candidates
  statement (only champion-role-queues with 20 games leave the database: under 3 KB on the demo) and
  up to six counting statements, through the page's own cache key, so they are the page's next reads
  and none within six hours of the last. About a second of function time and, cold, under 0.2 MB of
  egress a run; with about 7 runs a day (6 deploys and the daily run) at most about 1.5 MB a day and
  10 CPU-s. The populated builds facts add one page load and one Swap (a server render) a run.
- **The Master+ sampling** (`high-elo-sample`): **switched off; it costs nothing** (no request, no
  write, no interval). Its budgets once on are in docs/HIGH_ELO_EVIDENCE.md, "Budgets": at most
  12–36 CPU-s and 0.8 GB-h of memory a day hourly (half in the 120-minute pilot), about 25 MB of
  storage for two patches capped at 40 MB, and at most about 10 MB a day of egress for the page's
  reads (one champion's counts, cached an hour). The owner's go-ahead thresholds (Vercel and
  Supabase readings) are in its "For the owner".

## 27 Nov 2026: Matchup Intel's lane figures (one statement per pair, cached six hours)

**What it reads.** Matchup Intel (docs/MATCHUP_INTEL.md), Champion Intel's Compare with a lane, counts
how the two players of one lane compared at 10:00 in the team's stored draft games of that pairing:
ONE statement per pair, role and season, every draft queue at once (`src/server/matchup/lane-query.ts`),
the records found through the champions' index (`match_details_champions_idx`, both champions' ids
among a record's), the two seats' timeline entries read inside the database. Per game only anonymous
numbers leave it: the first 12 frame times and the two seats' gold, experience and CS over them, kill
and death times before 10:00, two first-blood flags, the patch, the queue, the result. About 0.6–0.8 KB a
game: a pair with 50 games about 35 KB uncached, most pairs under 20 games (about 14 KB).

**Cached** six hours in Next's data cache, shared by every instance (`unstable_cache`, tag
`lane-matchups`, dropped by an erasure), keyed by the unordered pair, so Swap and a queue change read
nothing. The notes: one indexed read, cached ten minutes (tag `matchup-notes`). Admin's queue: one
aggregate over `account_matches` (about 15 KB), cached an hour.

**Budget.** Eleven members opening about 20 pairs a day, all cold, would be about 7 MB a day at worst;
with the cache well under 2 MB, against 120 MB a day. Database CPU: a GIN lookup and JSON over at most a
few hundred records, estimated 20–150 ms cold. The perf probe's `matchup.lane-evidence` step (Ahri vs
Zed, Mid) measures it cold and warm (about 40 KB more a probe). Vercel CPU: interpolation and statistics
for at most a few hundred games take a few ms; the band is a server component. The Production check
adds one page load and one request a run (about one CPU-second). If it ever weighs: a `db-usage` run
names the statement `with match_details <hash>`, its sample opening "WITH lane_rec AS MATERIALIZED".

## 26 Nov 2026: Champion Intel's builds and runes (one counting statement per champion, cached six hours)

**What it reads.** Champion Intel's builds (docs/CHAMPION_INTEL.md, "Builds and runes") count what
players chose on a champion in the team's stored draft games: one statement per champion and patch
window (`src/server/champion-builds/query.ts`) that opens only that champion's records through a new
GIN index on the records' champions (`match_details_champions_idx`, migration `0069`, the PUUID
index's twin: a few MB at most), reads each player's timeline entry inside the database (never a
timeline's frames or events, its big columns), and returns totals only: about one short row per
counted value.

**Measured** (the in-memory demo, PGlite, 266 records, 219 timelines; `tests/db/champion-builds.test.ts`
bounds the answer): 17–50 ms of database time per champion; the answer 1–9 KB (Nasus 2.1 KB, Thresh
7.2 KB, Leona's two roles on two patches 7.9 KB, the largest 9.1 KB). Production estimate (about 3,000
records a patch window): 50–300 ms of database time with the index, 5–20 KB for a popular champion.
Without the index every computation would unpack all of the season's records (0.9–2.4 s measured for
comparable scans, PERFORMANCE.md).

**Cost per day.** The counts are cached six hours in Next's data cache, shared by every server
instance (a per-instance cache would miss on every cold instance), keyed by the champion, the patch
window, the abilities' ranks, the item data's version and the rules' format; a page view inside the
six hours reads nothing for them. About eleven members opening 20 champions a day, each counted at
most four times: under 1 MB of egress a day, against the 120 MB budget; a few seconds of database
time. The Production check opens Ahri and Jinx, then Matchup Intel's old address, which lands on
Mordekaiser and reads his builds like any champion's: at most three statements a run (and none
within six hours of another). Vercel Active CPU: choosing and drawing the parts, a few milliseconds a view. The
section streams in after the abilities, so the page's first answer does not wait for it. No job, no
table, no Riot request.

**If it ever weighs.** Read the statement's line in the egress counts: a Data jobs run of `db-usage`
lists the day's 25 largest shapes with their label and sample (`appEgress.topToday`,
`topYesterday`), and `egress` the five largest. The builds' statement is labelled `with
riot_accounts <hash>` (the egress shape names a statement by its first word and the first table it
reads, here the team's accounts in its first `WITH`), its sample starting "WITH mem AS MATERIALIZED (
SELECT ra.puuid FROM riot_accounts ra JOIN players"; `src/server/champion-builds/query.test.ts` holds
the label to these words. A derived per-player table filled as games arrive
would make the read smaller still, at the cost of a migration with its grants block and its own
erasure step (the design's rejected alternative, kept for a future population source).

## 25 Nov 2026: profile pictures read once per upload, not once per browser

**What happened.** Data jobs' hourly health check failed from 24 Nov: the app's own egress counter put
24 Nov at about 158.3 MB against the 120 MB daily budget. The largest statement was the read of
`user_avatars` (67.7 MB), then four Match History and branding reads of 6–9 MB each.

**Why.** A profile picture is stored as uploaded: up to 400 KB and 1024 px a side
(`AVATAR_MAX_BYTES`, `AVATAR_MAX_SIDE`), though no page draws one wider than 96 CSS pixels.
`/api/avatars/<user>?v=<version>` is cached by the browser for a year, but only by that browser
(`private`, since pictures are members-only), so every browser without it read the whole picture
from the database again. The Production check opens a fresh browser per width and page group, and
24 Nov had four runs (two deploys, the scheduled run and one by hand), each reading every member's
picture several times; the public team page's copy (`/api/public/avatars/<player>`) was kept for
only a minute by one server instance.

**What changed** (`src/server/avatars/served-avatar.ts`):
- **A copy for the screen.** Both routes serve WebP at most 288 px a side (96 CSS pixels on a 3×
  screen), made with sharp, which branding's web copies already use. The original is kept unchanged,
  and is served as it is where the copy would not be clearly smaller (a small upload) or cannot be
  decoded. A 275 KB 1024 px JPEG measured locally became 1.4 KB; a detailed photo at 288 px is
  typically tens of KB.
- **Read once per upload.** The copy is kept in Next's data cache, keyed by the user and the stored
  picture's own time of saving (to the millisecond): one small read of that time per request, and
  the picture's bytes only the first time each upload is asked for. A new upload changes the key;
  a removed picture has no row, so it is a 404 at once. The cache keeps a copy 30 days without a
  request.
- **Who may see it is unchanged.** Both routes still check the viewer (or the public page's lineup)
  on every request, before the copy is read.
- **Outside the Next server** (route tests, scripts), where there is no data cache, the copy is made
  each time.

**Expected effect.** The `user_avatars` read falls from tens of MB a day to at most each picture's
stored size once per upload (11 members at the 400 KB limit is 4.4 MB, and only after uploads), plus
a few bytes per request for the saving time. That alone brings a day like 24 Nov to about 90 MB,
under the budget. To check: Data jobs' tick prints yesterday's egress and its largest statements.

## 25 Nov 2026: scores on Team → Matches, and a smaller timeline answer

- **Database egress: one more query for the games Team → Matches shows, plus their lane timelines.**
  Each member's row shows their performance score and place (docs/PERFORMANCE_SCORE.md, "Where it
  shows"), each shown game scored once (`togetherScores`, `src/server/matches/together-scores.ts`):
  the records trimmed in the database to the score's figures, sent as arrays (`loadScoreSources`: no
  names, items, spells, runes, challenges or other stats), the members' PUUIDs looked up once
  (`teamMembersByPuuid`), and the same trimmed lane timelines Match History's cards read
  (`loadScoreTimelines`) for the shown Summoner's Rift games with a lane opponent. Measured with the
  app's egress counter on local PostgreSQL 16 (`tests/db/together-scores.test.ts`): the demo's six
  games, which have no timeline, 10.2 KB, **1.7 KB a game** (2.8 KB a game sent as objects, before
  the arrays). Real PUUIDs are longer than the demo's (78 characters: about 0.5 KB more a game) and
  a stored lane timeline adds about 3–4 KB (above), so a default page of 20 real games is about
  45–125 KB. Against 120 MB a day that is about 1,000 default views for the whole budget; the
  page's other reads (compositions, names) are unchanged. **"Show more"** renders the whole page
  again with 20 more games (`?limit=` up to 500), and a render scores every game it shows, so each
  instance keeps the scores it worked out for 15 minutes (at most 1,000 games; a game waiting for
  its timeline keeps its trimmed record and asks again for the timeline only): on the same
  instance the nth "Show more" reads only its 20 new games (45–125 KB), and the games kept cost the
  members' PUUID lookup alone (measured: 0.5 KB a render on the demo, against 10.2 KB for its six
  games read cold; its first three, then all six with three kept, read 5.6 KB each time). A fresh
  instance, or one past the 15 minutes, reads every shown game once: at `?limit=500` about 1.1–3.1
  MB (1–2.5% of the day's budget). Without the kept scores, the nth "Show more" read 20·(n+1)
  games.
- **Smaller timeline answer (Vercel to the browser):** an opened game's timeline answer no longer
  carries every player's kill, death and assist times or CS at every frame (only the score through
  the game, removed, read them): about 10–20 KB less a game, not database egress (the stored row is
  read as before).
- **Vercel Active CPU:** scoring a page of 20 games is the same work as Match History's cards (about
  1 ms for 10 games, above). **Riot: no new request**, no migration, no new table.

## 24 Nov 2026: the performance score on Match History's cards (Release 17)

Each collapsed Match History card shows its game's performance score (docs/PERFORMANCE_SCORE.md,
"Where it shows"), computed by `getMatchHistory` for the page's rows only, through the opened game's
own functions.

- **Database egress: one more query a page, only for its Summoner's Rift games with a lane
  opponent** (`loadScoreTimelines`, `src/server/accounts/match-timeline.ts`). The records the score
  reads were already read whole for the page (`match_details`); the only timeline input is the lane,
  so the query sends, per game, the frames' times and each player's gold and experience by place in
  the record: no PUUID, CS, positions, purchases, skills, kills or events. At most PER_PAGE_MAX (25)
  rows. Measured with the app's own egress counter (`src/server/db/egress.ts`) on local PostgreSQL
  16:
  - a realistic 25-minute ranked game (`tests/fixtures/riot-game`, 26 frames): **3.3 KB** (about 130
    bytes a minute of game, so about 4 KB at 31 minutes);
  - the demo's nine players' first pages of 10 (70 games, 44 with a stored timeline): **+19.3 KB a
    page, 3.9 KB a game read**, on a page that sent 69.3 KB before (88.6 KB after); pages of 25
    (175 games, 131 read): +57.6 KB a page on 165 KB. The same games' whole timeline rows would be
    53 KB and 159 KB: the trimmed read is about 36% of them;
  - so a production page of 10 lane games adds at most about 40 KB, 25 games about 100 KB. Against
    120 MB a day that is about 3,000 page views of 10 for the whole budget; the page's records already
    send 60–150 KB. Encounters' list of one player's games (`?met=`) is the same list and costs the
    same; Team → Matches reads its own (25 Nov 2026, above).
- **Vercel Active CPU: under 2 ms a page.** Scoring a page of 10 games (the record's mapping, the
  timeline's frames and lanes, the final scores; no score through the game) took 0.9 ms (median of
  the nine demo players, warm; 1.7 ms at most) on this machine, beside the page's render. Nothing is
  computed per frame beyond the 10:00 and 15:00 lane reading and the gold check at the last frame.
- **Riot: no new request.** A card whose Summoner's Rift game has no stored timeline shows no score
  until the timeline is stored (the hourly `timeline-backfill`, or opening the game). No migration,
  no new table.

## 23 Nov 2026: inspecting any player of an opened game (Release 16)

- **Database egress: nothing more per opened game.** The post-game view's inspection of any of the
  ten players, their Build Path, Skill Order and Runes, the performance scores and the score through
  the game all come from the two answers an opened game already loads: its record (one read of
  `match_details`, plus the players' newest recorded Riot IDs, as before) and its timeline (one read
  of `match_timelines` and the same three small reads of `match_details` as before: the players'
  lanes, the gold check and the game version). The timeline answer now carries every player of the
  stored row instead of the profile's player alone, which is bytes from Vercel to the browser (each item's
  name and icon sent once; the demo's 38-minute game's answer is 27 KB in all), not from the
  database. Switching players and comparing two
  read nothing at all. `tests/db/match-views.test.ts` counts the reads.
- **Riot: no new request.** A stored game's timeline is read from storage; Riot is asked only for a
  game whose timeline was never stored, once per game ever, as before. Inspecting a player asks
  nothing.
- **Static data:** the item kinds the build path marks (finished items; consumables, trinkets and
  wards) are about 810 bytes added to the 33 KB of names every match read loads (cached ten
  minutes), stored by the next version check (format 4).

## 20 Nov 2026: Matchup Intel's evidence backfill (`prep-backfill`)

- **Measured** (local PostgreSQL 16, the app's own egress counter, `src/server/db/egress.ts`): the
  demo's 277 members' games, 219 with a timeline, took **1.39 MB in 11 queries: about 5.0 KB a
  game**. The backfill reads only what preparation needs, trimmed in SQL: the ten players' places,
  champions, spells and runes from each record, and from each timeline the member's purchases and
  skill points, the objectives, and the member's and the lane opponent's positions. Timelines with
  positions (kept from 20 Nov 2026 on) add about 1 KB a game.
- **A full run** (1,000 games, the most a run reads) is therefore **about 5–6 MB**, against 120 MB a
  day. Production's 7,500 or so members' games take about 8 runs, one a day by hand, each counted
  first (`before`); `db-usage` shows the day's egress.
- **After it:** a page view's counts are a few KB (counts only, cached an hour, with the
  per-version diff they rest on, so a repeat view makes no query; R7 review B3); forward capture
  adds about five small queries per stored timeline, and a sync or the housekeeping fold makes the
  rows of the games it folded in one call a run (about five queries for up to 100 games, one cache
  clear; R7 review B4), not one a game.

## 19 Nov 2026: the deploy limit raised to about 6 a day

The owner asked on 19 Nov for faster delivery and for the three-a-day limit to be challenged. What a deploy costs is measured above ("What a deploy costs"): about 12.5 CPU-seconds for the signed-in Production check, plus 1–2 seconds of cold starts, so about 15–20 CPU-seconds on Vercel. A day without deploys costs about 100–150 CPU-seconds, against an allowance of about 480. Six deploys a day come to about 90–120 CPU-seconds, for a day of about 190–270: well under half the allowance. **The limit is now about 6 production deploys a day, a batch counting as one** (CLAUDE.md §4). The owner's Usage → Fluid Active CPU readings (STATUS, "Needs the owner") remain the check: a reading above about 300 CPU-seconds a day brings it back down.

## 19 Nov 2026: Vercel's memory allowance, the database's size, and what forward capture adds

**Vercel's Hobby plan also caps Provisioned Memory**, which this page did not track until now (mi-evidence, 19 Nov 2026, from vercel.com/docs/plans/hobby, /docs/functions/usage-and-pricing and /docs/functions/configuring-functions/memory):
- Hobby includes "Active CPU 4 CPU-hrs" and "Provisioned Memory 360 GB-hrs" in 30 days, about 12 GB-hours a day, beside 1,000,000 function invocations and a 300-second function limit.
- "Hobby users will always use the default memory size of 2 GB (1 vCPU)", and Provisioned Memory "continues billing while handling requests, even during I/O operations". So a function's memory-time is its wall time × 2 GB, including the time it waits on the database or on Riot, which Active CPU does not count.
- Exceeding any Hobby allowance pauses the deployment, as Active CPU did on 8 Nov.
- No API on Hobby reads either figure: the owner reads Usage → Provisioned Memory beside Fluid Active CPU in the dashboard. A job that waits on Riot for long (a sampler held to Riot's rate limits, mi-evidence §4) costs memory-time far more than CPU, so any such job is sized against both.

**The database is 173 MB, 34% of its 500 MB plan** (Production check 44324710345, 18 Nov 2026), not the 361–380 MB of 2 Nov below: #86 and #138 dropped about 206 MB of retired tables on 4 Nov. It grows by about 2 MB a day.

**Forward capture (20 Nov 2026) adds to every game stored from then on** (docs/DATA_PIPELINES.md, "What a stored game keeps from 20 Nov 2026 on"), measured on games shaped like Riot's (`tests/db/forward-capture.test.ts`, against the same games as compaction kept them before):

| | Stored (compressed, as the 500 MB counts it) | As text (what reading it whole sends) |
|---|---|---|
| A match record (ten players) | about +1 KB (0.9–1.0 KB) | about +4.8 KB |
| A timeline | +130 to +180 bytes a minute of game: +3.2 KB at 25 minutes, +5.3 KB at 31, +6.0 KB at 38 | +330 to +400 bytes a minute: +8.6 to +12.0 KB |

- The positions (x and y at every frame) and the items used up are the largest parts of a timeline's growth; the ten challenge figures are the largest part of a record's.
- At the rate of 3–7 Nov (about 75 new account games a day, an upper bound: a game two members played is stored once), that is at most about 0.5 MB a day more, against a guard of 1 MB a day above the 2 MB a day: the next `db-usage` after the deploy, and one a week later, show it.
- Egress: the champion window reads only its two players' gold, experience and CS series, as before. Opening one game reads its whole record and timeline, about 15 KB more for a game stored since; a Match History page of 10 new games reads about 48 KB more. Small against the 120 MB a day.
- The overhaul plan's first estimate (4 KB a timeline and 0.8 KB a record) covered the shards, the positions and the haste; the list grew to the level, the four timeline events, the ten challenge figures and the support figures, so the measured figures above replace it.

## 18 Nov 2026: a batch of merges deploys once

The owner asked on 18 Nov for the deploy limit to follow the evidence rather than a fixed rule, without risking another pause. What the record shows:
- **Production deployments in the rolling 30 days** (GitHub's deployment records, which Vercel writes): 168 in the 30 days to 18 Nov, 12:45 UTC, against 324 in the 30 days that ran out on 8 Nov. None on 9 Nov, two on 10 Nov (#278 and #280), none from 11 to 15 Nov, then 3 on each of 16 and 17 Nov and 9 on 18 Nov (#287, #293 and #295, batch 1a's five and batch 1b's one). The window's busiest days left it or are leaving it: 13–14 Oct (103) by 13 Nov, 19–21 Oct (59) on 18–20 Nov; 4, 6 and 7 Nov (52) leave on 4–7 Dec.
- **What a deploy costs** (measured, "8–9 Nov" below): the signed-in Production check, about 12.5 CPU-seconds locally since #274 (likely somewhat more on Vercel), plus the cold starts of the functions the deploy replaced: 0.35–0.6 s for the jobs function's next call and 0.6–1.3 s for a member's first page. Builds are not Active CPU.
- **What the day costs without deploys:** about 100–150 CPU-seconds expected after #274, against about 480 a day for the plan. Vercel's own daily figure is only in the owner's dashboard (Usage → Fluid Active CPU), which no API on Hobby reads.

So the budget counts checks and cold starts more than builds, and a batch can cost about one deploy:
- **Merges about 5 seconds apart (back to back, from one script) deploy once.** `scripts/vercel-ignore-build.sh` now skips a production deployment whose commit a later commit on its branch already holds (`git ls-remote` of the branch, then whether that tip contains the commit); the run's last commit builds (a later commit is skipped the same way when another follows it within seconds), and since it is compared with the last deployment that succeeded, it holds every skipped commit's changes. Any doubt builds: no answer from GitHub within 20 seconds, a tip that does not hold the commit, or no commit to compare. To deploy an older commit on purpose, use Vercel's Instant Rollback, which builds nothing.
- **What Vercel did with the first two batches (18 Nov):** it does not queue a batch's deployments. It started each within about 4 seconds of its merge and built several side by side, each in 32–41 seconds (batch 1a's five, from Vercel's first status to "Deployment has completed"; 93ff2d31, built alone, took 27). So the script sees the next merge only if it landed in those seconds:
  - Merged about 10 seconds apart (11:17:30–11:18:11 UTC, #288, #304, #289, #291 and #292): all five built and deployed, and four of the five Production checks were cancelled by the next.
  - Merged about 5 seconds apart by one script with no pause (12:31:46–12:32:02 UTC, #300, #301, #303 and #302): the first three were "Canceled by Ignored Build Step" within 8 seconds of their merge, and only the last built (93ff2d3, 12:32:32), with one Production check.
  - A batch's merges therefore run back to back from one script, and the last builds, unless only docs, tests or tooling changed since the last deployment that succeeded.
- **The Production check runs once per batch in full:** its job cancels a run in progress when the next deployment's check starts (`concurrency: production-check`, `cancel-in-progress`).
- **Stacked pull requests keep CI exact:** each PR's head merges the previous PR's branch, so CI tests the tree `main` will have once it merges; after each merge `main` holds exactly that tree, and the push to `main` reuses the PR's result ("reuse after merge", docs/CI_USAGE.md). Before each merge, `git merge-tree` of `main` and the head is checked against that tree.
- **The limit stays at about 3 production deploys a day, a batch counting as one** (CLAUDE.md §4). Batches make it rarely binding, and it keeps a margin while early November's heavy days are still in the window.

## 8–9 Nov 2026: Vercel Active CPU (the Hobby plan's 4 hours)

Vercel reported that the project had used the Hobby plan's 4 hours of Fluid **Active CPU** and would be paused on 9 Nov. Community reports count Hobby usage over a rolling 30 days, so the budget is about **480 CPU-seconds a day for everything**. Active CPU is the time code spends executing: rendering, parsing, module loading when an instance starts cold, work in `after()`, and the Routing Middleware (`src/proxy.ts`). Waiting on the database or on Riot is not counted.

**How it was measured.** On Hobby, Vercel's per-route CPU is only in the dashboard: its CLI and API metrics need Observability Plus. So the split was established from:
- production counters: two `db-usage` reports 8 h 19 min apart (session lookups, connection set-ups, pg_cron calls), `rank-schedule-status`, and GitHub's run and deployment history;
- a production-like local build on a copy of production's data volume. It had 14 Riot accounts, 5,217 stored games, 7,555 match records and 4,898 timelines, with a stub for Riot's API. The server's CPU per request was read from per-thread scheduler counters, cold and warm, 15 or more runs each.

The local CPU is not Vercel's, which adds TLS, its own wrapper and function bundling, so production figures per call are likely somewhat higher. The ranking holds.

**Where it goes today** (likely CPU-seconds a day; per-call cost measured, calls counted in production; range in brackets):

| Source | Calls | CPU per call | CPU-s a day |
|---|---|---|---|
| The signed-in Production check (after every deploy and daily) | 1 daily + 1 a deploy (15 on 7 Nov) | about 15 s a run: 852 function invocations, 605–639 of them viewport prefetches | 92 (30–360) |
| The five-minute rank watch (pg_cron) | 288 | 115 ms warm, 400–500 ms cold | 31 (24–46) |
| Instances starting cold when a member opens the app | 5–20 | about 0.6 s to start, 0.7 s for the first page | 13 (3–44) |
| Freshness polls and the re-renders they trigger | about 420 player polls | 7–8 ms; a re-render burst 100–200 ms | 8 (2–27) |
| The ten-minute tick (pg_cron) | 144 | 7 ms with nothing due | 8 (5–15) |
| Member pages | 5–20 page loads | 37–105 ms | 6 (2–19) |
| The jobs function starting cold after each deploy | 4–19 | 0.35–0.6 s more | 5 (1.5–17) |
| Riot syncs started by prefetches of profiles | n/a | 38–42 ms per account | 3 (1–10) |
| Admin pages left open (they re-render on every routine job run) | n/a | 1.5–3 s per open hour | 3 (0–14) |
| Manual Data jobs | 0–17 runs | 20 ms to 1.2 s per job | 3 (0.3–15) |
| Members' viewport prefetches | 5–7 per page view | 5–13 ms | 2.5 (0.7–14) |
| Everything else (scheduled Data jobs, the middleware, images, the daily cron, visit ticks) | | | about 6 |

That is about 180 CPU-seconds on an ordinary day and about 350 on a day like 7 Nov, with 14 deploys.

**What filled the 30 days:**
- **Deploys.** There were 324 production deployments between 9 Oct and 8 Nov: 64 on 14 Oct, and 19 on each of 4 and 6 Nov, and 14 on 7 Nov. Each one starts every function cold. Since 3 Nov, each was also followed by a Production check (71 runs), signed in since 7 Nov. Merges that changed only tests or tooling deployed too.
- **A scheduler calling for nothing.** pg_cron's ten-minute tick was refused with 401 for at least 25 days, until its Vault secret was created on 7 Nov. Each call was most likely a cold start of a function that loads every job before it checks the secret: about 0.45 s, 144 times a day, about 55 s a day.
- **Earlier work, now gone or finished.** The Meta & Trends collection (retired 19 Oct), the timeline and figures backfills (done by 2 Nov), ticks started by visits inside page functions (about 15 s a day), and October's frequent perf-probe and smoke runs (about 470 s in all).

**What changed** (one PR, which itself does not deploy):
1. **The Production check no longer prefetches on viewport, and answers its own page-speed beacons** (`scripts/live-check.mjs`, `checkContext`). Measured against the same local production-like server, accounts due before each run, with the same results (338 passed):
   - server CPU per run: 15,184 CPU-ms before, 12,526 after (−18%);
   - the investigation's run of the same suppression: 14,964 before, 9,774 after;
   - function invocations: 852 before, 253 after;
   - middleware invocations: 898 before, 299 after;
   - prefetch requests across Team, Players and Leaderboards: 60 before, 0 after.

   Fewer invocations also means fewer instances to start cold on Vercel. Every page it opens is still loaded and asserted in full, and a hover or tap still prefetches as it does for a member. The beacons were already dropped by the server for the verification account (#256).
2. **Merges of tests or tooling alone no longer deploy** (`scripts/vercel-ignore-build.sh`). Besides docs, the skipped files are `e2e/`, `tests/`, `scripts/` (which `next build` never reads), `*.test.ts(x)` and the test runners' configuration. Each skipped deploy saves its cold starts and its Production check.
3. **A deploy budget** (CLAUDE.md §4): batch merges, at most about 3 production deploys a day (a batch counts as one since 18 Nov, above), and run manual Data jobs only when needed, several jobs in one run.

This change touches only tests, scripts and docs, so by its own rule it does not deploy. The new check runs on the next deploy and in the daily run, which uses `main`'s script.

**Expected after these:** about 100–150 CPU-seconds a day, roughly 50–75 minutes in 30 days, a quarter to a third of the allowance, with about 3 deploys on a busy day. Most of the saving comes from fewer and cheaper deploys and checks. The follow-ups below would save about 25 CPU-seconds a day more.

**Changed on 20 Nov 2026 (PLAN S8a), each with its own test:**
- **Prefetches no longer start Riot syncs.** A profile's visit refresh starts from the mounted page's first freshness request (`/api/freshness`, which already checks the page's access; `FreshnessWatcher` asks at once on a profile), never from rendering the profile's layout, which a prefetch does. The history slices that continue while a profile stays open start from the same requests, whenever the next slice can start. About 55 Riot requests and about 3 CPU-seconds a day (`src/app/api/freshness/route.test.ts`).
- **Leaderboards' games cache** (and Team Matches', on the same fingerprint) is emptied only by a change to what it holds: a game stored, details summarised, mastery changed, an account linked or removed. A sync that stored nothing no longer empties it: the fingerprint read the last sync's time, which every run moves (`tests/db/leaderboards-cache.test.ts`).
- **Members' links prefetch on intent** (`IntentLink`: a pointer resting on the link, a touch or the keyboard's focus) instead of on sight: Players' names, Leaderboards' names, the Team Peek's "Full profile" and suggestions, Team Matches' names. About 30% of a member's visit; a link nobody pointed at opens a little slower (`e2e/players-directory.spec.ts`, "intent only").
- **Ranked progress's weekly games query is gone:** one query fewer per Overview with statistics (docs/RANKED_PROGRESS.md; `tests/db/rank-history.test.ts`).

**Not changed here** (each is a follow-up with its own review):
- **The rank watch's writes.** It wrote two locked transactions per account and queue on every reading, about 130 statements a run, even when nothing changed. **Done in Release 19 (27 Nov 2026), "Rank watch writes":** one transaction per account for both queues, both queues' last rows read in one statement and their confirmations moved in one: 6 statements for an unchanged account instead of 10 (40% fewer), the same rows written, the locks taken Solo/Duo then Flex so account sync and the watch never wait on each other in a cycle (`recordRankSnapshots`, `src/server/accounts/rank-history.ts`; `tests/db/rank-history.test.ts`: one transaction per reading, two overlapping runs over both queues store each change once and never move a confirmation back; the rank watch, match LP and rank audit suites unchanged). The saving is about 18 s a day by the earlier estimate; read `rank-audit` after the deploy (the LP figures per day should not change).
- **Account sync** reads the rank again although the rank watch read it within 5 minutes, and rewrites every mastery row. About 1 s a day in all. **Not changed (Release 19 review):** skipping that read would leave the profile header's "last checked" (`riot_accounts.rank_updated_at`, which only the sync moves on an unchanged rank; the watch writes the account only on a change) and the match window's own-team rank age stale, so the saving needs the watch to write that time on every unchanged reading, the very write the batching above avoids. Not worth it for 1 s a day.
- **Admin pages left open** re-rendered on every routine job run (0–3 s a day). **Done in S9c (20 Nov 2026):** System Health and Data & Integrations, the two Admin pages with a freshness watcher (`FreshnessWatcher on="return"`), no longer ask on a timer: they read the page again only when the tab is shown or focused again and a job changed something, and on the administrator's own actions (`e2e/auto-update.spec.ts`: half an hour open asks nothing; shown again asks once).

Lengthening the rank watch's interval is **not** a saving. Its calls every 5 minutes keep the jobs function warm, while 10-minute calls start cold, so 10 minutes would cost about 86 s a day. It would also lose LP figures for about 22% of ranked games at 10 minutes and 48% at 15. The 8 Nov check-in found every one of the 10 ranked games since 7 Nov carrying its figure.

**If Vercel pauses the project:** the rolling 30 days fall under 4 hours as the heaviest October days leave the window (103 deployments on 13–14 Oct leave on 12–13 Nov). Then ask Vercel to unpause at vercel.com/help. What counts in the meantime is keeping each day's usage low.

**How to check:**
- the owner's Vercel dashboard: Usage → Fluid Active CPU (daily), and Observability → Functions (per route);
- `db-usage` deltas between two runs: session lookups (one per authenticated request), connection set-ups (one per new connection) and `net.http_get` (pg_cron's calls).

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
- **Pausing it.** Set its interval very high in **Admin → Data & Integrations → Details → Advanced → Schedule** (the Owner only since 19 Nov 2026; 0 turns it off after "TURN OFF figures-backfill" is typed, and `/api/health` then names it), or set `FIGURES_BACKFILL_PER_RUN=0`.

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

## 16 Nov 2026: Matchup Intel's champion abilities

Matchup Intel (then Resources' second tab; a sidebar entry of its own since 18 Nov 2026, at the same address) reads each champion's Data Dragon abilities from `app_settings` "champion_abilities" (`docs/DATA_PIPELINES.md`, "Champion abilities (Matchup Intel)"). Measured on PostgreSQL 16 with Data Dragon 16.22.1's 173 champions:
- **Reads:** only the champions a page shows, 1.2–2.6 KB each (median 1.6 KB; 3.3 KB and about 2–3 ms of database time for a matchup of two), each kept 10 minutes per instance. When nothing changed, the hourly version check's abilities step is one statement: a few hundred bytes back and about 5 ms of database time (4–6 ms, 102 buffers). Both read the stored document once. Before a review found it (16 Nov, before release), the hourly check read the document again for every champion: about 0.5 s of database time and 11,000 buffers (about 87 MiB of 8 KB pages, all from cache) every hour, though only a few hundred bytes left the database.
- **Writes:** about 270 KB once per game version (117 KB on disk). Writes are not egress.
- **Data Dragon and CPU:** a new version needs no extra request, because the champion sync's detail files are reused. The first fill after the deploy requests the 173 files once (about 2.3 MB). Compacting the roster takes about 6 ms of CPU.

## What still needs attention

- **Meta & Trends removed** (after this change). Its collection and aggregation jobs were most of the database's writes, and its tables hold about 200 MB of the database. 12 of them (about 206 MB) were dropped on 4 Nov 2026 (#86, after a verified backup); the last six on 24 Nov 2026 (migration `0068`, #212's change, with the owner's approval; `docs/DATA_PIPELINES.md`, Retired tables).
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
- **Done (4 Nov 2026):** #86 and #138 dropped them, after the owner had verified a backup and kept an offline copy. Production check run 15 then read the database at 161 MB, 32% of the plan, down from 378 MB. Still stored then: `tracked_summoners` (11 MB), the small `region_status`, `champion_change_points` and `stat_*_periods` tables, and the ladder ranks in `last_known_ranks`. Removing them deletes data for good, so it waited for the owner's separate approval: migration `0068` drops them and the last known ranks no stored game names (`docs/DATA_PIPELINES.md`, "Retired tables").
- **Egress:** 27.2 MB on 2 Nov (budget 120 MB a day), on a day with several manual runs.

## 27 Nov 2026 (Release 19): the Production check's audits

The Production check now calls two protected check jobs before it opens the pages (docs/LIVE_VALIDATION.md, "What it checks"): `leaderboard-audit` (one statement of under 1 KB, one Leaderboards data load, which its games cache answers while the stored history is unchanged and otherwise reads about 0.3 MB, then about 20 views at shifted times in memory: about 1 to 2 CPU-seconds) and the builds lane's `builds-audit`. On a deploy day of up to 6 deploys and the daily run, that is at most about 15 to 25 CPU-seconds and 3 MB a day at worst, against about 480 CPU-seconds and 120 MB. A run's other new facts read pages it already loads, plus four GET requests on the desktop (a teammate's Riot Accounts, My Profile twice, and the jobs endpoint refused at once). Watch the first deploy day's reading in `db-usage` and the Vercel Usage readings (docs/OWNER_ACTIONS.md, item 6).
