# Draft engine and data pipeline: investigation log (October 2026)

A working log of an autonomous engineering session on draft intelligence, engine speed and Riot
data freshness. Every number here says where it was measured. **Synthetic** means the seeded
benchmark below; **production** means a read-only job that ran against the live deployment.

## How to reproduce the engine benchmark

```
pnpm exec tsx scripts/bench-engine.ts --runs 15 --out before.json
# change something
pnpm exec tsx scripts/bench-engine.ts --runs 15 --baseline before.json
```

- **Data:** `scripts/bench/sim.ts` simulates 6,000 ranked games (seed 20261015) and aggregates them
  the way `src/server/ingestion/aggregate.ts` does: role stats, every ally pair, every cross-team
  pair, bans as a share of games. Rows seen once are dropped, as the loader drops them. Result:
  249 champion-role rows, 29,004 matchup rows, 11,690 pair rows. Production at the time had
  5,741 current-window games and 31,786 lane-matchup rows (data-sufficiency job, 15 Oct), so the
  sample sizes are comparable; the win rates are synthetic.
- **Scenarios (15):** `scripts/bench/scenarios.ts`. Blind B1, first ban, red R1/R2 pair window,
  counterpick B4/B5, last pick R5, pools partly banned, support pool exhausted, Fearless BO3 game 2
  (10 locked), Fearless BO5 game 4 (30 locked), large pools (every plausible champion), Ranked Flex,
  scouted enemy players, small pools, role-swapped lineup, no player data.
- **Machine:** 4-core Intel Xeon 2.1 GHz, Node 22.22, one process, no other load.
- **Method:** one cold call, then 15 timed calls; median and p95. Run-to-run noise is about ±15%
  on the larger scenarios. Each run also checks legality: every recommended or listed champion is in
  the assigned player's pool for that role and not banned, picked or Fearless-locked.

## Checkpoint A — baseline (synthetic, before any change)

| Scenario | Median | p95 | Recommendation |
|---|---|---|---|
| blind-B1 | 127.5 ms | 177.5 ms | Galio MID · Close decision |
| ban-B1 | 90.0 ms | 98.7 ms | ban Kennen |
| pair-R1R2 | 176.6 ms | 195.0 ms | Ezreal ADC + Nautilus SUPPORT |
| large-pools-B1 | 711.1 ms | 1013.8 ms | Aphelios ADC |
| fearless-bo3-g2 | 49.2 ms | 73.3 ms | Ezreal ADC |
| Sum of all 15 medians | 1,713 ms | | all legal |

Production reference (perf-probe job, 15 Oct, small real pools): `engine.recommend` 23.5 ms;
`stats.loadProvider` cold 3,368 ms, warm 246 ms.

### Where the time went (CPU profile of the benchmark)

`evaluateTeam` 24%, `emptyTraits` 12%, the memo key `teamKey` 9%, `teamProfile` 8%, synergy
lookups 6%, garbage collection 6%. A blind pick asked for about 20,000 team evaluations, of which
only about 2,700 were distinct teams: the rest were memo hits, and each distinct team cost about
30 µs.

## Checkpoint C — engine speed (exact: identical recommendations)

Changes, each verified by comparing every scenario's recommendation, top three candidates,
decision label, gap and denial risk with the baseline run:

1. `emptyTraits` returned `Object.fromEntries(...)`, a dictionary-mode object. Every trait object
   now has one fast shape (a literal).
2. `evaluateTeam` recomputed each member's strength, comfort, lane and cross-role matchups for
   every team, although they do not depend on teammates. They are now cached per member, and
   pair synergy per pair, in caches tied to the evaluation memo. A what-if with a hypothetical
   enemy gets a new memo and therefore fresh caches (tested in `evaluate-cache.test.ts`).
3. The memo key sorted and joined strings; it is now built in role order.
4. Team profiles add cached trait vectors; composition identity picks its top two without
   `Object.entries` + sort (same result as the stable sort, tested); the realism descriptors are
   computed once per champion.
5. Identical `bestCompletion` searches within one recommendation share one result. The same
   best-team search ran two or three times per call.

| Scenario | Before | After | Change |
|---|---|---|---|
| blind-B1 | 127.5 ms | 57.1 ms | −55% |
| ban-B1 | 90.0 ms | 24.6 ms | −73% |
| pair-R1R2 | 176.6 ms | 95.7 ms | −46% |
| large-pools-B1 | 711.1 ms | 333.1 ms | −53% |
| fearless-bo3-g2 | 49.2 ms | 23.6 ms | −52% |
| Sum of all 15 medians | 1,713 ms | 797 ms | −53% |

All 15 recommendations unchanged; one gap differs in the 17th decimal place.

## Checkpoint B — draft reasoning (changes recommendations; each justified below)

### B1. Denial probability used per-game rates as per-action probabilities (proven unit error)

**What it did.** `assessTiming` computed the chance that one enemy ban takes a champion as `banRate × 1.6`, and one enemy pick as `pickRate × 1.4`. A rate is the share of games in which the champion is banned (picked), and a game holds ten bans and ten picks. A 30% ban rate therefore became a 48% chance per enemy ban. Over three bans that is an 86% "likely gone" risk, shown to users as such and fed into the pick-now urgency.

**Fix.** `enemyActionShares` treats each enemy action as one choice among the still-available champions:
- **Ban:** in proportion to ban counts.
- **Pick:** a role in proportion to how open the enemy's roles are, then the champion's share of that role's games.

The existing priority tilts (×1.4, ×1.6), professional slot patterns and pro presence still apply on top.

**Check against known truth (synthetic).** In the simulation, the enemy takes Ezreal in R1/R2 2.1% of the time (its share of ADC games × 2 of 5 picks). The new model says 3.2% (including the ×1.4 priority tilt); the old one said 27.6%.

**Effect on recommendations.** On a blind first pick every champion of the best projected team has the same fit, so only timing separates them. The inflated urgency used to decide which one to lock first, and called the result "Strong" or "Moderate". Now:

| Scenario | Before | After |
|---|---|---|
| blind-B1 | Galio MID, denial 17.9% | Ezreal ADC, denial 3.2%, gap 0.01 pts (Close) |
| pool-partially-banned | Galio MID, **Strong** (denial 17.9%) | Galio MID, **Close** (denial 2.0%) |
| support-pool-exhausted | Leona SUPPORT, **Strong**, gap 10.7 pts (denial 39.5% × 28 pts at risk) | Leona SUPPORT, **Moderate**, gap 1.6 pts (denial 5.3%) |
| large-pools-B1 | Aphelios ADC (denial 39.9%) | Amumu SUPPORT, Close: the flex bonus (two players' pools) now outweighs a ~4% denial risk |
| ban-B1 | Kennen, Bel'Veth, Aphelios | Kennen, Aphelios, Taric |

Seven pick scenarios changed their first choice, all between champions with the same projected-team fit, and all now labelled Close. Two "Strong" labels became Close and Moderate because their lead was the inflated risk. The ban models (live bans and the pre-draft blind bans) use the same shares. Their "the enemy practically never picks it" cut-offs were rescaled to the same meaning in the new units: about 0.2% and 0.5% of the role's games.

### B2. "Safe blind pick" on thin evidence (proven: shrinkage artefact)

**What it did.** Blind safety rewarded a low spread of a champion's lane estimates across likely enemies. Shrunk estimates with no matchup data sit on the prior, so they barely vary. The champions with the least evidence looked the most blind-safe: Amumu with 33 games got the bonus and the "matchups are stable" sentence.

**Fix.** The bonus is scaled by the weighted mean confidence of those matchup estimates. The sentence appears only when that evidence is at least 0.2. The enemy's likely champions in the hold and spread calculation are now weighted by how often they are played, not uniformly.

### B3. Decision labels ignored the recommended champion's own sample

**Fix.** `withPickEvidence` drops the label one step when both hold, and names the sample in the reason:
- the lead is mostly statistical;
- the champion has fewer than 100 games in its role this period.

Comfort- or composition-driven leads are unaffected. It did not trigger in the 15 synthetic scenarios, where no recommended champion was both thin and statistically ahead.

### Reviewed and left unchanged (with reasons)

- **Pair synergy.** The engine already uses ally-pair evidence for all ten pairs, key pairs ×1.3, with a 1,000-game prior chosen from the production leave-one-out check: smaller priors made predictions worse. At production sample sizes (median about 4 games per pair) synergy rarely moves a recommendation. That is the conservative behaviour asked for; no change.
- **Matchups.** Role-specific (same-role lane plus probability-weighted cross-role), shrunk to the strength-based expectation (prior 400), with severity penalties. Player comfort enters separately, so a theoretical counter does not outrank a much more familiar champion unless the evidence is strong. No change.
- **Fearless.** Locks are merged into the draft's unavailable champions before the engine runs; both Fearless scenarios stayed legal; the new shares also drop locked champions from the denominators.

## Checkpoint D — Riot ingestion and freshness

### Where the delay actually is

The path is Riot → fetch queue → ingest (fetch, validate, store) → aggregate → statistics version bump → stats provider rebuild → engine.

| Stage | Delay | Notes |
|---|---|---|
| Waiting for a tick | **About an hour on average.** This is the dominant delay. | The 10/15/30-minute job intervals never bind, because ticks are rarer. Ticks come only from: the hourly GitHub schedule (best effort, `:17`); a page visit, at most every 30 minutes; the daily Vercel cron. |
| Ingest | Up to about 150 s of each tick, per region in parallel | Bounded by Riot's rate limits, which stay as they are. |
| Ingest → aggregate | Same tick | Aggregation runs right after ingestion when time is left. |
| Aggregate → engine | Next request | Every stats load reads `stats_version`, so a bump reaches every instance on its next request. **But** the recommendation cache (10 min) was keyed without it: a draft could show recommendations from before the new games for up to ten minutes. |

**Not changed (cost decision, yours):** tick cadence. A 10–15 minute external trigger would cut the dominant delay from about an hour to about 10 minutes. It costs Actions minutes: about one per run, so 15-minute runs would be about 2,900 a month, above the 2,000 free. It also costs Vercel function time. An external pinger would avoid the Actions cost.

### Fixed (all with database tests in `tests/db/ingestion-reliability.test.ts` and `caching.test.ts`)

1. **Two aggregations at once double-counted.** The batch was read outside the transaction and marked without checking that it was still unaggregated; only the job lock prevented overlap. Each batch now claims its matches inside the transaction (`... WHERE aggregated_at IS NULL RETURNING`) and folds in only what it claimed. On the old code the new test counts 40 matches as 80; on the new code, 40.
2. **A new champion's matches lost their role statistics for good.** Participants with an unknown champion key were dropped, the match became "unreliable", and it was marked aggregated anyway. Recent matches (under 3 days) now wait for the static data to learn the champion; older ones are folded in as before.
3. **One failed match stopped its whole region for the run**, including a permanent 404. Only transient failures (rate limits, timeouts, 5xx) stop a region now.
4. **Permanent client errors other than 404 were retried forever.** A 400 or 422 stayed pending, was retried five times, and was reset daily by integrity. Any 4xx (except 401/403/429) now marks the match failed. A 200 in an unexpected shape stays retryable, so a Riot-side format change cannot fail every match permanently.
5. **429s and timeouts used up a match's attempts**, parking it until the daily reset. They no longer count.
6. **One duplicate-check query per match** → one per batch. A conflicting insert now also marks its queue row done.
7. **Recommendation cache keyed without the statistics version and the team's engine settings.** New games, or a changed setting, now give a fresh recommendation at once on every instance.
8. **The stats provider was rebuilt every 10 minutes even when nothing changed**: about 3.4 s cold in production, about 0.4 s locally. Concurrent cold requests each built their own. The rebuild now happens when the version changes; the TTL is a 60-minute safety net. Concurrent requests share one build. Change-point edits and static syncs now bump the version, so every instance follows them, not only the one that made the change.

**Rate limits are unchanged:** no new requests, no new parallelism. Fixes 3 and 5 only stop a region from idling, or a match from being parked, for reasons unrelated to that match.

## Checkpoint E — database and caches

- **Benchmark database:** `uniiverse_bench`, seeded with `scripts/perf-seed.ts 6000`. That gives 6,000 ranked matches, 227,822 matchup rows (47,902 with at least two games) and 91,340 pair rows.
- **Cold statistics load** (`scripts/bench-stats-load.ts`): median 415 ms locally. The three large queries take a median of about 225 ms; building the provider takes the rest.
- **Query plans.** The loader filters by patch, and the primary key starts with the patch, so old patches are skipped as history grows. With only the window's patches in the table the planner rightly scans sequentially. No new index is justified.
- **List accumulation.** The loader built per-key lists by copying them for every row, quadratic in samples per key. They are now appended. No measurable change locally (one band, so one sample per key); production keys can hold up to about 18 samples (6 bands × 3 patches).

**Not changed, with reasons:**
- **Summing ladder bands in SQL.** The `GROUP BY` could happen before transfer: blending is linear within a patch, so it would be exact. It would cut the rows sent to the server by roughly the number of bands a pair appears in. With rebuilds now happening only when statistics change, it is the next opportunity rather than a necessity.
- **The `games ≥ 2` filter** is applied per band row, so a pair seen once in each of three bands is skipped. At the 400/1,000-game priors, such pairs move estimates by under 1%. Summing bands in SQL (above) would fix this as a side effect.

## Checkpoint F — final validation (local; nothing deployed)

- **Engine benchmark, final:** sum of the 15 scenario medians 1,713 ms → 827 ms (−52%), including the reasoning changes.
  - blind-B1: 127.5 → 57.5 ms.
  - large-pools-B1: 711 → 342 ms.
  - ban-B1: 90 → 27 ms.
  - All 15 scenarios legal.
- **Unit tests:** 596 passed (106 files). 20 tests are new: timing, confidence, evaluation caches, team-profile internals, identity tie-breaking.
- **Database tests:** 295 passed (42 files). 6 are new: ingestion failure classes, region continues after a permanent failure, rate limits keep their attempts, concurrent aggregation, unknown-champion deferral, cache freshness and shared cold loads.
- **Browser tests (Playwright):** 98 passed, 0 failed, 49 skipped. The skips are the existing desktop-only or data-dependent ones, unchanged.
- **Typecheck, lint and production build:** clean.
- **Not validated against production:** no production database or Riot key was used. The production-side effects can be checked after deployment:
  - `perf-probe` for `stats.loadProvider` and `engine.recommend` timings;
  - `data-sufficiency` for queue and aggregation state;
  - the Draft Room's denial percentages.
