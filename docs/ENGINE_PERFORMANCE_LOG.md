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
