# Data audit (Phase 4)

> A dated snapshot. Meta & Trends was removed on 19 Oct 2026: the global ranked, professional and
> aggregation pipelines described below no longer run, and `data-audit` now reports linked-account
> sync, matches per queue, queue classification, mastery and Matchups timeline coverage only.

Read-only audit of the production database, taken **2026-10-14 06:06 UTC** on deployment `76100a9`
(Vercel syd1, Supabase Postgres) with the `data-audit` job (stored data per account, region, rank and
patch), which changes nothing. It runs from **Actions → Data jobs → Run workflow** (job
`data-audit`). Players and accounts appear by role or as `p1`/`a1`; no names, Riot IDs or PUUIDs
leave the server. The audit was recorded before any ingestion logic was changed.

The evidence and accuracy sections of the original audit measured the Draft engine and were removed
with it.

## 1. What is stored, folded in and used

| | Stored | Folded into statistics | Waiting | Effective in the statistics |
|---|---|---|---|---|
| Ranked Solo/Duo, patch 16.20 (current) | 1,978 games | 1,808 | 170 | 1,808 raw → **1,288 effective** (rank-weighted) |
| Ranked, patch 16.19 | 89 | 88 | 1 | only where a champion has < 400 current-patch games |
| Ranked, patch 16.18 | 0 | – | – | – |
| Professional games (Leaguepedia) | 311 (16.20: 178, 16.19: 5, 16.18: 79, 16.17: 49) | 311 | 0 | 195 effective (recency-weighted); newest 13 Oct 20:47 |
| Bans, current patch | 19,057 | | | pick/ban presence |
| Linked player accounts | 11 (9 players) | | | |

- **Unique ranked games:** 2,067 (all queue 420; 1 of them lacks clean roles and only counts for bans).
- **Collection rate:** 911 games stored on 13 Oct, 1,156 on 14 Oct (to 06:00). Collection began 6 Oct.
- **Region (current patch):** OCE 1,284 (**64.9 %**), EUNE 182 (9.2 %), EUW 159 (8 %), KR 64, ME 59,
  NA 59, RU 52, BR 39, JP 31, LAN 27, LAS 20, TR 2. PH and TH return errors (both servers were merged
  into SG by Riot); SG, TW and VN return no data. One region dominates.
- **Rank (current patch, raw):** Challenger 357, Grandmaster 40, Master 345, Diamond 582,
  **Emerald 23**, legacy Master+ 631. Emerald is 1.2 % of games although 2,578 Emerald players are
  tracked and 114 Emerald matches sit in the fetch queue. Rank weighting is operational (Challenger 1,
  GM 1, Master 0.9, Diamond 0.7, Emerald 0.5).
- **Discovery:** 16,257 ladder players tracked, only **254** ever scanned for match ids. Fetch queue:
  261 pending, 2,067 done, 41 skipped (remakes/other queues), 0 failed.
- **Personal history:** 11 accounts; ledgers of 20, 100, 100, 20, 17, 91, 43, 872, 100, 91 and 20
  matches. Several stop at exactly 20 or 100, the per-run caps: back-fill is progressing one capped
  batch per sync, not complete.

## 2. Scheduling reality (the main bottleneck)

Job runs in the last 7 days (all via the job endpoint):

| Job | Runs | Failures | Average |
|---|---|---|---|
| ranked-ingest | 10 | 0 | 162 s |
| ranked-discover | 16 | 0 | 14 s |
| account-sync | 9 | 0 | 71 s |
| aggregate | 6 | 0 | 4 s |
| pro-sync | 7 | 0 | 3 s |
| version-check | 8 | 0 | 0.2 s |

The GitHub schedule (`13 */3 * * *`, 8 a day) was delivered irregularly (scheduled runs at 01:36, 07:58,
17:45, 23:49 on 12 Oct; 14:12, 20:41 on 13 Oct; 00:18 on 14 Oct) and most recent refreshes were
manual dispatches. The Vercel cron runs once a day (04:00). `account-sync` additionally waits 180
minutes between runs and refreshes an account only when its last sync is over 120 minutes old.

**Riot is not the limit.** Each ingest run stores 160–520 games in about four minutes under the key's
20/s and 100 per 2 min per routing host; the hosts would allow roughly 70,000 requests a day each.
Collection is limited by how rarely the tick runs. Two smaller limits: the ingester runs three
regional workers for four hosts, and inside the SEA host only OCE has data, so OCE gets a whole host's
share. That, plus the first days of collection being OCE-only, explains the 65 %.

There were no job failures in the week. Aggregation trails ingestion by one tick by design (170 games
waiting at audit time).

## 3. Improvements, in order, with targets

1. **Run the pipeline often and unattended** (stage B): hourly at least, plus a run whenever the team
   is using the site and data is stale, at no extra cost. Target: about 1,000 ranked games a day
   steadily, i.e. 12,000–14,000 per two-week patch.
2. **Balance regions inside each host** and give each host its own worker. Target: no region above
   35 % of a day's games.
3. **Respect the rank mix**: drain the Emerald queue in proportion. Target: Emerald 15–20 % of games.
4. **Account refresh every 30–60 minutes** for linked accounts, with history back-fill continuing in
   the background until each season is complete.
