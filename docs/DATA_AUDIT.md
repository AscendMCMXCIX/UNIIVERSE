# Data sufficiency audit (Phase 4)

Read-only audit of the production database, taken **2026-10-14 06:06 UTC** on deployment `76100a9`
(Vercel syd1, Supabase Postgres) with two jobs that change nothing:

- `data-audit` (stored data per account, region, rank and patch), and
- `data-sufficiency` (new): the evidence the engine actually holds for each signal in real drafts,
  how fast data arrives, how often the scheduled jobs really ran, ten draft scenarios run on
  in-memory fixtures, and a held-out accuracy check.

Both run from **Actions → Data jobs → Run workflow** (job `data-audit` / `data-sufficiency`). Players
and accounts appear by role or as `p1`/`a1`; no names, Riot IDs or PUUIDs leave the server. The audit
was recorded before any ingestion or recommendation logic was changed.

## 1. What is stored, folded in and used

| | Stored | Folded into statistics | Waiting | Used by the engine |
|---|---|---|---|---|
| Ranked Solo/Duo, patch 16.20 (current) | 1,978 games | 1,808 | 170 | 1,808 raw → **1,288 effective** (rank-weighted) |
| Ranked, patch 16.19 | 89 | 88 | 1 | only where a champion has < 400 current-patch games (see §6) |
| Ranked, patch 16.18 | 0 | – | – | – |
| Professional games (Leaguepedia) | 311 (16.20: 178, 16.19: 5, 16.18: 79, 16.17: 49) | 311 | 0 | 195 effective (recency-weighted); newest 13 Oct 20:47 |
| Bans, current patch | 19,057 | | | pick/ban presence |
| Linked player accounts | 11 (9 players) | | | 4 of the 5 probe-lineup players have usable data |

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

## 3. Sufficiency per signal

"Effective games" are the patch-, rank- and rework-weighted games the engine holds. The shrinkage
prior was 250 games for champion strength and 60 for matchups and pairings (raised in §8): at the prior weight the
data and the neutral prior count equally (evidence confidence 0.5). Measured over the 2,066 ranked
games of the last 7 days, i.e. the champions, lanes and pairs that real drafts actually contain:

| Signal | Verdict | Evidence in real drafts |
|---|---|---|
| Champion strength (win rate in role) | **Limited** | median 83 effective games; 0 % reach 250; 30 % under 50. Only 4 of 548 champion-roles have 250+ games this patch. |
| Pick/ban priority (presence) | **Sufficient** for popular champions, Limited for rare ones | 1,978 games, 19,057 bans: a 20 % pick rate is known to about ±2 points |
| Lane matchups | **Insufficient** | median 1.8 effective games; 44 % of lane pairings never seen; 4.3 % have 15+; no current-patch lane row has 30+ games |
| Synergy / pairings (Top–Jungle, Jungle–Mid, ADC–Support) | **Insufficient** | median 1.4; 0.5 % reach 60 |
| Composition quality | **Heuristic (attribute-inferred)** | curated traits, not measured. Checked against outcomes: the team with clearly more engage won 51.4 % (n 477, 95 % CI 47–56), frontline 49.6 % (n 423), counter-engage 52.3 %, poke 47.1 %, scaling 49.7 %: no trait effect is detectable at this sample size |
| Professional priority | **Limited** | 178 current-patch games, 311 over four patches, fresh (13 Oct) |
| Enemy tendencies | **Insufficient (unused)** | works only when enemy Riot IDs are entered; 0 of 7 drafts had any |
| Player proficiency | **Limited** | 4 of 5 lineup players have data; several histories still at the 20/100-game caps; no Support player (placeholder) |
| Ban recommendations | **Limited** | presence is solid; "threat to our pool" leans on matchups, which are insufficient |
| Pick recommendations | **Limited** | driven by team fit (curated traits), player proficiency and champion strength; matchups and pairings add little |

### Matchup and pairing examples (current statistics)

| Matchup | Effective games | Observed | Estimate used | Confidence | Fallback |
|---|---|---|---|---|---|
| Gwen vs Ornn (Top) | 2 | 2–0 (95 % CI 34–100 %) | 52.6 % | 0.03 | strength in role + traits |
| Ambessa vs Jax (Top) | 6 | 66.7 % (30–90 %) | 52.1 % | 0.09 | strength in role + traits |
| Riven vs Renekton (Top) | 2 | 2–0 | 53.3 % | 0.03 | strength in role + traits |
| Ahri vs Orianna (Mid) | 0 | – | 51.2 % (strength only) | 0 | strength in role + traits |
| Jinx vs Caitlyn (ADC) | 19.7 | 59.9 % (38–78 %) | 53.7 % | 0.25 | – |
| Kai'Sa vs Tristana (ADC, most played lane) | 27.4 | 44.2 % (28–62 %) | 44.4 % | 0.31 | – |

Top–Jungle pairings: the most played (Ambessa + Lee Sin) has 15.8 effective games, confidence 0.21;
Ornn + Jarvan IV and Gwen + Viego have none. Engage-vs-disengage and frontline-vs-carry are
composition questions answered from curated traits only (see the table above).

Shrinkage does its job: a 2–0 record moves Gwen vs Ornn from 51.0 % to 52.6 %, not to 100 %.

## 4. Draft scenarios (in-memory fixtures; nothing saved)

The current main lineup, with the empty Support role filled by a labelled placeholder:

| Scenario | Primary | Decision label | Evidence |
|---|---|---|---|
| Blind first pick, Ranked Flex | Syndra (Mid), alternatives Ambessa (Top), Sejuani (Jungle) | Close decision (gap 0.000) | low; Syndra 137 effective games; player comfortable (5 games) |
| Tournament, first ban | Tristana (protects ADC) | Moderate preference (gap 0.014) | low; driven by presence (20 % pick, 13 % ban) |
| Tournament, first pick after bans | Syndra (Mid) | Close decision | low |
| Known enemies, last pick (Ornn, Sejuani, Orianna, Jinx, Leona revealed) | Rammus (Jungle) over Amumu | Low confidence (gap 0.005) | player data decided it (39 recent games); lane vs Sejuani 1.4 games |
| Partial scouting (enemy Top and Jungle tendencies) | Tristana ban, unchanged | Moderate | scouting did not change the first ban |
| Strong enemy frontline (Ornn, Sejuani) | Thresh + Ashe | Low confidence | team fit and proficiency dominate |
| High-engage enemy (Malphite, Rell) | Sejuani + Ashe | Low confidence | Sejuani 20 effective games |
| Poor matchup / counter-pick | not runnable | – | no lane counter to the Top player's first champion has 10+ games |
| Limited pools (one champion each) | Thresh (Support) | Close decision | emergency alert for Mid with alternatives labelled "Limited data" / "No data" |
| Emergency: Top pool unavailable | Syndra; Top emergency: Jayce (Strong), Yone (Comfortable), Olaf (Strong) | Close decision | familiarity from the Top player's own games |

The engine behaves sensibly and honestly: it labels nearly every decision Close or Low confidence,
and the evidence label is "low" in every scenario, which matches the sample sizes above.

## 5. Confidence: what the labels mean, and calibration

- **Evidence confidence** (`none`/`low`/`medium`/`high`, the "evidence" chip): how much measured data
  stands behind the champions in play, `games / (games + prior)` averaged over the projected team.
  It says nothing about which option is better.
- **Decision label** (Strong recommendation / Moderate preference / Close decision / Low confidence):
  the score gap between the top option and the runner-up (≥ 3 points strong, ≥ 1.2 moderate),
  downgraded to Low confidence whenever evidence is thin. It says how clearly the engine prefers its
  first option under its own model, not how likely a game is to be won.

**Held-out check.** The 171 ranked games stored but not yet folded into statistics never informed the
estimates. Predicting the winner from the statistics alone (no players, no composition model):

| Model | Accuracy | 95 % CI | Brier (coin flip 0.250) |
|---|---|---|---|
| Champion strength only | 49.1 % | 41.7–56.6 % | 0.250 |
| + lane matchups | 52.0 % | 44.6–59.4 % | 0.250 |
| + key pairings | 55.0 % | 47.5–62.2 % | 0.250 |

The same check on games already inside the statistics reaches 79.5 %, which only shows how much small
samples memorise their own games. Conclusion: at today's volume the measured win rates carry no
detectable predictive signal on unseen games (171 games can only detect large effects). This
supports keeping the evidence label at "low" and keeping shrinkage strong; it does not justify any
probability-of-winning display, and the engine shows none. The check repeats automatically with each
audit run, so calibration can be re-measured as volume grows.

## 6. Three-patch evidence

The window is current + two previous patches, with older patches decayed (×0.6 per patch) and scaled
down as each champion's own current-patch sample approaches 400 games; champion change points
discount pre-rework games. This is per champion, so older patches still fill in for most champions
today (only 4 champion-roles have 250+ games). In practice the ranked window is one patch: 16.19 has
88 games and 16.18 none, because collection started on 6 Oct. It fills itself as patches pass, since
old games are kept. The evidence panel shows the previous patch at weight 0 because it applies the
saturation to the whole patch total; that display is misleading and is corrected in stage B.
Personal season statistics are separate (account ledgers, season boundaries) and unaffected.

## 7. Improvements, in order, with targets

1. **Run the pipeline often and unattended** (stage B): hourly at least, plus a run whenever the team
   is using the site and data is stale, at no extra cost. Target: about 1,000 ranked games a day
   steadily, i.e. 12,000–14,000 per two-week patch.
2. **Balance regions inside each host** and give each host its own worker. Target: no region above
   35 % of a day's games.
3. **Respect the rank mix**: drain the Emerald queue in proportion. Target: Emerald 15–20 % of games.
4. **Account refresh every 30–60 minutes** for linked accounts, with history back-fill continuing in
   the background until each season is complete.
5. **Fix the patch-weight display** (§6).

What those targets buy (estimates from pick rates, at 12,000 games per patch): champion strength
median ≈ 500 effective games (**Sufficient**); the most common lane matchups 30–80 games (**Limited**
moving to Sufficient); rare matchups and most pairings stay **Insufficient** and keep falling back to
strength and curated traits. That is the honest ceiling for a single API key: UNIIVERSE samples the
Emerald+ ladder, it does not see every game worldwide.

## 8. After stages B–F (re-run 2026-10-14 07:35 UTC, deployment `35c96c4`)

Same read-only jobs, about 90 minutes after the automation changes went live.

| Measure | Stage A (06:06) | After (07:35) |
|---|---|---|
| Ranked games stored, patch 16.20 | 1,978 (170 waiting) | 2,229 (all folded in; 0 waiting) |
| Effective games the engine holds | 1,288 | 1,604 |
| Emerald games, current patch (raw) | 23 | 133 |
| OCE share of current patch | 64.9 % | 66.2 % |
| Champion strength: median effective games | 83 | 102 (still **Limited**) |
| Lane matchups: median effective games | 1.8 | 2.0 (still **Insufficient**) |
| Key pairings: median effective games | 1.4 | 2.0 (still **Insufficient**) |
| Ladder players ever scanned for matches | 254 of 16,257 | 253 of 17,454 (discovery last ran 06:31; it scans more players each tick it runs) |

New games are now folded into the statistics in the same tick that stores them, so the held-out
sample of §5 is normally empty. The audit therefore adds a **leave-one-out check**: every folded
current-patch game is predicted from the statistics with that game's own result taken back out.
On 2,228 games:

| Model | Accuracy | 95 % CI | Brier |
|---|---|---|---|
| Champion strength only | 53.0 % | 50.9–55.0 % | 0.250 |
| + lane matchups (old prior weight 60) | 51.1 % | 49.0–53.1 % | 0.252 |
| + key pairings (old prior weight 60) | 48.3 % | 46.3–50.4 % | 0.258 |

Champion strength now shows a small but real signal (the interval clears 50 %). At the old prior
weight, lane matchups and pairings made predictions **worse**: with two games per combination they
mostly add noise. A sensitivity check over prior weights:

| Prior weight (pseudo-games) | + matchups | + matchups and pairings |
|---|---|---|
| 60 | 51.1 %, Brier 0.252 | 48.3 %, 0.258 |
| 150 | 52.6 %, 0.251 | 50.6 %, 0.253 |
| 400 | 52.2 %, 0.250 | 52.1 %, 0.251 |
| 1000 | 52.8 %, 0.250 | 52.6 %, 0.250 |

**Change made:** the engine's prior weights are now 400 for lane matchups and 1000 for pairings
(champion strength unchanged at 250), the smallest values at which they stop costing accuracy.
A matchup now counts half only after about 400 effective games, so the engine leans on champion
strength, player proficiency and curated characteristics (as it already did for most situations)
and lets matchup and pairing data in automatically as it accumulates. Confidence figures shown
for matchups and pairings drop accordingly, which is the honest reading of two-game samples. The
check re-runs with each audit; the weights should be revisited when lane matchups reach a median
of 30+ effective games.

**Confirmed in production** (re-run 07:51 UTC on deployment `9709434`, same 2,228 games): strength
+ matchups 52.2 % (95 % CI 50.2–54.3 %), Brier 0.250; + pairings 52.5 % (50.4–54.5 %), Brier 0.250,
against 51.1 % and 48.3 % before. The in-sample figure fell from 78.7 % to 66.6 %: the statistics now
memorise their own games far less. Example: Gwen vs Ornn (4 games, 3 won) now reads 49.6 % with
confidence 0.01 instead of 50.9 % with 0.06; the engine relies on strength and characteristics there.

**Automation observed:** visit-started ticks ran at 06:29 and 07:47 UTC without any manual trigger.
The second spent 121 s on account sync and 30 s on discovery, which left no time for ranked
ingestion inside the 150 s visit budget; the budget is now 230 s (commit `c36fc5c`).

Still open: oc1 remains 66 % of the current patch because of games collected before balancing;
new collection is round-robin by region and rank, so the share falls as the patch fills. Emerald is
6 % of current-patch games (target 15–20 %).
