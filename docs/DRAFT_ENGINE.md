# Draft engine

The engine lives in `src/domain/engine` and is pure: the same inputs always yield the same recommendation, which makes it testable and reviewable.

## Hard constraints (never violated)

1. A champion is only a candidate for player *P* in role *R* if *P* has it configured in the pool for *R* (primary role → primary pool, secondary role → secondary pool).
2. A player can only be assigned their primary or secondary role.
3. Banned, picked and otherwise unavailable champions (e.g. fearless-draft carry-over) are excluded.
4. Only the five active-lineup players exist as far as the engine is concerned.

## Search space

For the current draft state the engine enumerates every legal player→role assignment (usually one to four), and for each one searches the strongest *complete* team reachable from the locked picks using only eligible champions. Pools are small, so the search is exhaustive when the candidate product is under a few thousand combinations and a beam search otherwise. Evaluations are memoised per recommendation call.

## Team evaluation

Every component is expressed in approximate win-rate points so they can be weighted, summed and explained:

| Part | Components |
| --- | --- |
| Individual | current-patch champion strength (shrunk win rate in role), player comfort (position in pool), pro priority, minus a cost per player moved to their secondary role |
| Synergy | pair synergy evidence (joint win rate isolated from individual strength, key pairs Top/Jungle, Jungle/Mid, ADC/Support weighted up) + composition structure (missing engage, frontline, damage balance, waveclear, reliable CC, carry protection, sustained damage; identity coherence) |
| Enemy | lane matchups (probability-weighted over the enemy's likely role assignments, with non-linear penalties for significantly unfavourable and near-unplayable lanes) + cross-role matchup evidence + composition interaction (our engage vs their disengage, their dive vs our peel, poke dynamics, scaling vs early game, range, CC vs mobility, carry access) |

The **philosophy** multipliers scale the synergy and enemy parts (default 50/50). The severity penalties are what stop "team synergy" from ever justifying an unplayable lane.

## Best fit vs pick now

The best champion for the finished draft is not always the one to lock now. For each candidate the engine computes:

- **Value at risk** = (best team with this champion) − (best team if it were gone), multiplied by the probability it is banned or picked by the enemy before our next turn (from ban/pick rates and pro presence, and whether the enemy still has an open slot for it).
- **Counterpick hold** = value of information for the role: how much better our best option is expected to be if we see the enemy's champion first, scaled by the chance they reveal it before our next pick. High value → "HOLD role".
- **Blind safety** for stable-matchup champions, and a small **flex** bonus when the champion sits in more than one of our players' pools (genuine UNIIVERSE flex, not a pro-play flex).

`pickNowScore = fitScore + urgency − hold + blindSafety + flex`.

## Two-pick windows

When the sequence gives us two consecutive picks (R1/R2, B2/B3, B4/B5) the engine evaluates pairs jointly: both champions locked together, joint completion score plus combined urgency. It never reports "top single + second single".

## Role swaps

If an alternative legal assignment improves the best reachable team by more than the configured threshold (after swap costs), the engine recommends the swap prominently with reasons (pool depth after bans, remaining options, matchup coverage). Otherwise the current assignment is kept: swapping has a real cost and is never forced.

## Bans

Ban value = probability the enemy takes the champion × how much it would hurt (raw strength, lane damage into our projected pick and pool in that role, cross-role problems for our locked champions, whether it fills a structural hole in their draft) − how much we wanted it ourselves.

## Enemy role uncertainty

Revealed enemy champions get role probabilities from measured role share (blended with curated priors), constrained so that two champions cannot occupy the same role. Lane matchups are weighted by those probabilities; genuine flex picks stay ambiguous.

## Evidence and confidence

Statistics come from `StatsProvider` (in-memory, built by `src/server/stats/loader.ts`):

- Win rates are shrunk towards a prior with a pseudo-count (default 250 games for strength, 60 for matchups/synergies).
- Patches are blended with recency decay; older evidence fades automatically as the current patch accumulates games.
- Champion change points (reworks) discount pre-rework evidence; auto-detected ones use a milder discount until confirmed.
- Pro games add weighted evidence for pairings/matchups and a separate pro-presence signal.

When no evidence exists the engine falls back to curated characteristics and reports confidence as *none/low*. Demo statistics are flagged everywhere they appear.

## Configuration

`DEFAULT_ENGINE_CONFIG` in `src/domain/engine/config.ts` holds every weight and threshold. The team's overrides are stored in the database and editable in Settings.
