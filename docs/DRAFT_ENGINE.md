# Draft engine

The engine lives in `src/domain/engine` and is pure: the same inputs always yield the same recommendation, which makes it testable and reviewable.

## Hard constraints (never violated)

1. A champion is only a candidate for player *P* in role *R* if *P* has it configured in the pool for *R* (primary role → primary pool, secondary role → secondary pool, an additional role → that role's own pool).
2. A player can only be assigned one of their profile roles: primary, secondary or one of their optional additional roles.
3. Banned, picked and otherwise unavailable champions are excluded. In a Fearless series every champion picked (by either team) in an earlier game of the series is unavailable; bans do not carry over. The locks come from `fearlessLocks` (`src/domain/fearless.ts`) and are merged into the draft state's unavailable champions when the draft loads, so pick validation, the engine, the pre-draft plan and emergency picks all respect them.
4. Only the five active-lineup players exist as far as the engine is concerned.

## Search space

For the current draft state the engine enumerates every legal player→role assignment (usually one to four), and for each one searches the strongest *complete* team reachable from the locked picks using only eligible champions. The search is exhaustive when the candidate product is under a few thousand combinations and a beam search otherwise. Evaluations are memoised per recommendation call.

Pools have no size cap (up to 250 champions per role). To stay fast with large pools, each open slot is narrowed to a shortlist of its 10 best champions by marginal value (`search.slotShortlist`) before the team search; the player's best champions for the slot are always kept. With five 30-champion pools a recommendation takes about a second.

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

The cost grows with distance from the player's main role (`roleDistance`): primary 0, secondary 1, first additional role 2, each later additional role 0.5 more, each multiplied by `roleSwapCost`. Assignments are listed by that cost first, so the engine prefers primary, then secondary, and only uses an additional role when it is clearly better (for example, the main role's pool is banned out).

## Bans

Ban value = probability the enemy takes the champion × how much it would hurt (raw strength, lane damage into our projected pick and pool in that role, cross-role problems for our locked champions, whether it fills a structural hole in their draft) − how much we wanted it ourselves.

## Enemy role uncertainty

Revealed enemy champions get role probabilities from measured role share (blended with curated priors), constrained so that two champions cannot occupy the same role. Lane matchups are weighted by those probabilities; genuine flex picks stay ambiguous.

## Evidence and confidence

Statistics come from `StatsProvider` (in-memory, built by `src/server/stats/loader.ts`):

- Win rates are shrunk towards a prior with a pseudo-count: 250 games for champion strength, 400 for lane matchups and 1000 for pairings. The matchup and pairing weights come from the leave-one-out check in the `data-sufficiency` job (see `docs/DATA_AUDIT.md` §8): smaller weights made predictions worse at current sample sizes.
- Patches are blended with recency decay; older evidence fades automatically as the current patch accumulates games.
- Champion change points (reworks) discount pre-rework evidence; auto-detected ones use a milder discount until confirmed.
- Pro games add weighted evidence for pairings/matchups and a separate pro-presence signal.

When no evidence exists the engine falls back to curated characteristics and reports confidence as *none/low*. Demo statistics are flagged everywhere they appear.

## Configuration

`DEFAULT_ENGINE_CONFIG` in `src/domain/engine/config.ts` holds every weight and threshold. The team's overrides are stored in the database and editable in Settings.

## Three layers: can we pick it, is it good, can we execute it

1. **Can** — the hard player constraint above. Nothing below ever relaxes it.
2. **Good** — the evaluation parts (individual, synergy, enemy).
3. **Execute** — the realism layer (`assessRealism` in `evaluate.ts`): mean execution demand of the members (mechanics, coordination, how badly mistakes are punished, derived from the curated traits), a communication burden when three or more kits depend on coordinated follow-up, and resource overload when more than two champions want strongside resources. The team's **risk preference** (`reliable` / `balanced` / `ceiling`, in config or as a coach override) scales the execution penalties ×2 / ×1 / ×0.25. The projected team reports its execution label, power curve and resource picture.

## Honest decision labels

Every recommendation carries a `decision` label: **Strong** (top option ≥ 3 points ahead), **Moderate** (≥ 1.2), **Close** (less) or **Low confidence** (no or thin current-patch evidence). The gap is shown, never hidden. A close call is reported as a close call.

## Why not X?

`whyNot(input, { championId, role })` compares the recommendation with any other legal candidate on the same dimensions the engine used (lane, team synergy, strength into their draft, current patch, player proficiency/comfort, damage profile, pick timing) and states the closeness and verdict. A champion outside the assigned player's pool for an open role returns nothing: the constraint is hard, and the UI says so.

## What would change this / enemy responses

- `whatWouldChange` simulates plausible next enemy reveals (one representative champion per archetype: disengage, engage, dive assassin, poke, hypercarry, frontline) and reports when the ranking between the top two choices would flip.
- `simulateResponses` lists the enemy's strongest plausible answers to the primary pick across their open roles, weighted by meta share (and scouted likely picks when supplied). They are likelihoods, not predictions.

## Threat map and pool pinch

- `threatMap` produces explicit champion-to-champion threats between our projected team and the revealed enemy picks (dive onto a carry, pick threats, poke without engage to punish it, disengage against our initiator, side-lane pressure, access to their carry). The playbook reuses it.
- `poolPinch` runs while enemy bans remain: for each open role it counts the assigned player's options, estimates which are ban-prone (ban rate, pro presence, and champions that counter their revealed picks) and names the legal escape (a secondary-role move) — "secure this now" versus "it can wait".

## Coach / strategy overrides

Per-draft soft preferences (`DraftOverrides`: strongside, weakside, preserve counterpick, no role flex today, prefer scaling, prefer lower execution, prioritise engage, risk preference). They become config tilts and trait bonuses; they never make an illegal champion legal and never silence severe-lane penalties. The engine re-solves the draft without the overrides and reports the cost (`overrides.warning`) when honouring them costs more than ~1.5 points of draft quality.

## Professional draft patterns

Pro games with known pick order (Leaguepedia `Team1Picks`/`Team2Picks`, Oracle's Elixir `pick`) are folded into `pro_pick_slot_stats`: how often each champion is a B1, an R1/R2, a B2/B3, an R3/R4, a B4/B5, an R5 (counterpick) or a first/second-phase ban. The stats provider exposes a per-champion slot profile; the timing model raises the denial probability of first-rotation champions and lowers it for habitual last-pick counters, and explanations say so ("Pro teams take it first rotation"). The pre-draft page shows the current patterns (B1 priority, R1/R2 pairs, B2/B3 pairs, R5 counterpicks, second-ban targets, flex retention) as context, not as instructions: our pools decide.
