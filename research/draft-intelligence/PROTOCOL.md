# Draft Intelligence pilot: pre-registered protocol (Phase 1)

Frozen on 2 November 2026, before any outcome or prediction result was computed. Changes after
this commit are listed at the end with their reason; results computed under a changed rule are
reported as exploratory.

This is offline research. Nothing here is imported by the app, deployed, or connected to the
production database, and no Riot API request is made.

## Questions

| # | Question | Why it matters for the draft plan |
| --- | --- | --- |
| RQ1 | In professional play, does a team's recent experience with the champions it drafts predict winning beyond team strength and side? | Tests the pool-fit principle the plan puts first |
| RQ2 | At each pick, how well can the pick actually made be anticipated from the draft state, and do team comfort and role awareness add to plain popularity? | Plausibility of candidate options, and the quality of the enemy-reply model the exposure search depends on |
| RQ3 | How many of the enemy's actual picks fall inside the top 10, 15 and 20 "plausible replies" that model produces? | Whether a pruned search over enemy replies is viable |
| RQ4 | Are actual bans anticipated better from the opponent's comfort than from popularity? | Whether opponent-aware ban suggestions carry signal |
| RQ5 (exploratory) | Do the unreviewed champion traits in `src/domain/champion-model` add anything to RQ1's best model? | Whether composition traits carry signal before any knowledge base is built |
| RQ6 (only if a team export is supplied) | Does a player's experience on a champion in a role, as of each game, predict that game's result and performance beyond the player's own baseline? | Team-specific pool model, the part professional data cannot test |

## Data

- **Professional drafts:** [LoL-Draft](https://github.com/DeusExMachina1993/lol-draft) at commit `447d68c` (release v2026.08, data through 31 Aug 2026), CC BY-SA 4.0, adapted from Leaguepedia (CC BY-SA 3.0). It holds complete 20-action tournament drafts: picks and bans in order, sides, winner, patch, teams, series and game number. It holds no player or role per pick, so "pools" here are a team's pools.
- **Champion keys, names and the unreviewed role priors:** `src/server/riot/fixtures/champions.fixture.json` and `src/domain/champion-model/curated-data.ts` (repository files, read only).
- **Team export (RQ6, optional):** only if the owner supplies the pseudonymous export described in `README.md`. It is never committed.

## Splits and leakage rules

1. **Development period:** games before 1 Jan 2025. **Test period:** 1 Jan 2025 to 31 Aug 2026, locked: no model choice, weight or threshold is tuned on it.
2. **As of each game:** every feature uses only games that started before it. History reaches back into the development period.
3. **Outcomes are never features.** Rolling win rates use only earlier games.
4. **Fearless series:** a tournament counts as Fearless when it has at least 20 series of two or more games and no champion is picked twice within any of its series. There, champions picked earlier in the series are removed from the candidates.
5. **No retuning after viewing test results.** Any analysis added later is labelled exploratory.

## Features

- **Elo:** one rating per team name, starting at 1500, updated after every game in time order, with K and a blue-side term chosen on the development period. The model uses the rating difference.
- **Team comfort:** for team T and champion c, the number of games T picked c in the 180 days before the game. A draft's comfort is the mean of `log(1 + n)` over its five picks. The model uses blue minus red.
- **Popularity:** a champion's share of games in which it was picked, across all games in the 30 days before.
- **Meta win rate:** a champion's win rate over the 60 days before, shrunk towards 50% with 20 pseudo-games. A draft's meta is the mean of (rate − 0.5) over its picks; the model uses blue minus red.
- **Role fit (RQ2 to RQ4):** the earlier picks of a team are assigned to roles by the most likely assignment under the role priors. A candidate's role fit is the largest prior it has for a role still open. Champions with no prior get an even prior.
- **Recency-weighted comfort (RQ2 to RQ4):** the team's earlier picks of c in 180 days, each weighted by exp(−age in days / 60).

## Models and baselines

**RQ1, outcome (logistic regression, blue win as the target):**

| Model | Inputs |
| --- | --- |
| M0 | Side only (intercept) |
| M1 | + Elo difference |
| Mmeta | M1 + meta difference (the "basic champion statistics" baseline) |
| M2 | M1 + comfort difference |
| M3 | M1 + comfort and meta differences |

Fitted on the development period, scored on the test period.

**RQ2 to RQ4, choice (each action scored over every champion still available):**

| Scorer | Basis |
| --- | --- |
| Random | Uniform over the available champions (computed exactly) |
| Popularity | Popularity |
| Comfort | Recency-weighted comfort of the acting team, popularity breaking ties |
| Mix | Conditional logit on log popularity, log(1 + comfort) and role fit, weights fitted on the development period |
| Mix without role | The same, without role fit, to isolate the draft-state model |

RQ4 also scores bans by the **opponent's** comfort, since bans target the other team.

## Measures

- **RQ1:**
    - Test-period log loss, Brier score, AUC and calibration (ten bins).
    - **Primary:** log loss of M2 minus M1, with a 95% interval from 1,000 bootstrap resamples of series.
    - Secondary: M3 minus Mmeta (comfort beyond basic statistics), and M2 against Mmeta.
- **RQ2:**
    - Top-1, top-5 and top-10 hit rates and mean reciprocal rank, per scorer, for all picks and by pick slot.
    - **Primary:** the top-5 hit rate of Mix minus Popularity, paired, with a bootstrap interval over series.
- **RQ3:** coverage at 10, 15 and 20: the share of actual picks whose champion is in the scorer's top k.
- **RQ4:** top-5 hit rate per ban phase.
- **RQ5:** M3 plus trait differences (engage, frontline, peel, poke, scaling, early game, and damage balance as the gap between physical and magic share), compared with M3 as in the primary measure. Exploratory only.

## Decision rules for the pilot's recommendation

These thresholds are judgement calls, fixed now so the results cannot move them.

1. **Pool fit holds** if M2 improves on M1, with the interval wholly below zero.
2. **Comfort beats basic statistics** if M3 improves on Mmeta, with the interval wholly below zero.
3. **Candidate model useful** if Mix beats Popularity on top-5 hit rate by at least 5 points absolute, with the interval excluding zero.
4. **Pruned enemy search viable** if Mix's coverage at 20 is at least 75%. Below that, the exposure search would ignore too many real replies, and better priors (or opponent information) would be needed first.
5. **The pilot supports Phase 2** only if rules 1 and 4 hold and nothing in RQ6 (if run) contradicts them. Reviewer agreement and knowledge-base upkeep, which need people and sources, stay open for Phase 2's start whatever happens.

## RQ6 (if the team export arrives)

- **Rows:** one per member game: pseudonymous player, champion, Riot role, queue, patch, start time, result, K/D/A, CS, game duration. No Riot ID, PUUID or non-member data.
- **Features as of each game:**
    - games on the champion in the role over 365 days;
    - days since the last game on it;
    - the player's earlier win rate on it, shrunk to their own baseline with 25 pseudo-games;
    - the player's overall baseline.
- **Models:** result (logistic regression) and KDA and CS-per-minute z-scores within each player (linear regression).
- **Comparisons:** the player's baseline alone; plus games played; plus the full as-of profile.
- **Split:** temporal. Build on games before 1 May 2026, test on later games.
- **Not used:** mastery points and declared pools. Only their current values exist, so using them for past games would leak.

## Changes after freezing

(none yet)
