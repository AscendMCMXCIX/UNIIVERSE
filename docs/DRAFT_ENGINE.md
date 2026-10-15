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

- **Value at risk** = (best team with this champion) − (best team if it were gone), multiplied by the probability it is banned or picked by the enemy before our next turn.
- **Denial probability** (`enemyActionShares` in `timing.ts`). Ban and pick rates are per game, and a game holds ten bans and ten picks, so a rate is not the chance that one enemy action takes the champion. Each enemy action is one choice among the champions still available:
  - **Ban:** the champion's ban count divided by the ban counts of every available champion.
  - **Pick:** one of the enemy's open roles, in proportion to how open each is, then the champion's share of that role's games among available champions.
  - **What drops out:** banned, picked and Fearless-locked champions leave the denominators.
  - **Pro presence:** blended in with the pro weight.
  - **Draft priority:** a ×1.4 (pick) / ×1.6 (ban) tilt, and the professional slot patterns.
  - **Before October 2026** a rate was used directly as the per-action probability, which overstated "likely gone" risks about ten-fold. In the benchmark, a champion with 5% of its role's games read 28% instead of 3%.
- **Counterpick hold** = value of information for the role: how much better our best option is expected to be if we see the enemy's champion first, scaled by the chance they reveal it before our next pick. The enemy's likely champions are weighted by how often they are played. High value → "HOLD role".
- **Blind safety** for stable-matchup champions, counted only as far as matchup evidence supports it. Lane estimates with no data sit on the prior and barely vary, which says nothing about stability. A small **flex** bonus applies when the champion sits in more than one of our players' pools (genuine UNIIVERSE flex, not a pro-play flex).

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
- Player proficiency is **role-specific** (`src/domain/proficiency/index.ts`, revision 2, see below): the same champion may sit in several role pools; games in other roles add at most eight games' worth to a role, mastery counts towards a role in proportion to the games played in it, and the top tiers need games in the role itself. Win/loss performance still uses every game. A Syndra main asked to play Syndra support therefore gets a lower comfort estimate than in mid.

When no evidence exists the engine falls back to curated characteristics and reports confidence as *none/low*. Demo statistics are flagged everywhere they appear.

## Player proficiency: what is measured (revision 2, October 2026)

Proficiency estimates **experience on a champion in a role**, not skill. It is a 0–1 score, a
confidence (how much evidence there is) and a tier with a label. It refines the order of legal
champions only; pools remain the hard rule.

**Inputs** (all linked accounts together, a game seen by two accounts counted once): games and wins
per champion, role and queue group, last played date per bucket, combined champion mastery points,
and the player's baseline win rate. Queue weights: Ranked Solo/Duo 1.0, Flex 0.9, other supported
queues 0.85, Normal 0.6.

| Part | Formula (DEFAULT_PROFICIENCY_CONFIG) | Weight in the raw score |
|---|---|---|
| Familiarity | log(1 + volume) / log(1 + 60); volume = queue-weighted games in the role + games in other roles × 0.25 (at most 8 in revision 2) + mastery points / 6,000 × mastery weight | 0.50 |
| Recency factor | 0.7 × recency (1.0 within 30 days, to 0.75 at 90 days, then −1/365 per day, floor 0.55) + 0.3 × practice (recent and 90-day games, log-scaled to 20) | 0.25 |
| Role fit | 1 below 5 games with a known position; else 0.6 + 0.4 × min(1, share in the role / 0.6) | 0.10 |
| Performance | win rate shrunk to the player's own baseline with 25 pseudo-games, centred on 0.5 | 0.15 |
| Confidence | queue-weighted games / (games + 15) × 0.7 + 0.15 with mastery + 0.15 with a last-played date | blends the score towards 0.5: score = 0.5 + (raw − 0.5) × (0.4 + 0.6 × confidence) |

**Tiers and labels** (the internal tier names are unchanged for compatibility):

| Tier | Label (before) | Rule |
|---|---|---|
| core | **Main** (Very strong) | familiarity ≥ 0.85, recency factor ≥ 0.8, and ≥ 15 queue-weighted games **in the role** |
| strong | **Comfortable** (Strong) | familiarity ≥ 0.65, recency factor ≥ 0.6, and ≥ 6 games in the role |
| comfortable | **Familiar** (Comfortable) | familiarity ≥ 0.45 |
| rusty | **Out of practice** (Rusty) | familiarity ≥ 0.5 but no game for 90+ days |
| moderate | **Few games** (Limited data) | at least one game (revision 1: three), or mastery worth ≥ 5 games |
| unknown | **Not played** (No data) | nothing on the linked accounts |

Evidence is shown separately from the label as one to three bars (thin / reasonable / solid, from
the confidence), so "how experienced" and "how sure" are no longer one word.

**What revision 2 changed, and why** (found by auditing the model and stored data):

1. Mastery is champion-wide, but revision 1 counted half of it towards every role: a Gwen top main
   looked experienced on Gwen jungle. Now mastery counts in proportion to the games on the champion
   in that role (never below the off-role weight once positions are known).
2. Games in other roles (at 25%) met the top-tier minimums, so 100 Gwen top games made Gwen jungle
   "Very strong". Now other roles add at most 8 games' worth, and the Main / Comfortable minimums
   count games in the role only (games with no recorded position shared out pro rata).
3. Recency used mastery's last-played date, which ARAM or any other mode refreshes; a champion not
   played in a supported queue for months looked current. Now recency comes from stored games, and
   mastery's date only when there are none.
4. One or two games read "No data". They now read "Few games".
5. The labels sounded like verdicts on skill ("Very strong") although the tier measures volume and
   recency. They now describe experience; results stay a separate, labelled figure.

Revision 1 remains in the code (`revision: 1`) only so audits and tests can compare the two.

**Draft intelligence check.** `src/domain/engine/proficiency-revision.test.ts` runs the same
drafts under both revisions: for players who play their pool champions in their own roles the
recommendations are identical; in the leaked-role case (many games on a champion in another role,
few in this one) revision 1 ranked the leaked champion first and revision 2 recommends the
champion actually played in the role. The model change was deployed only after these tests passed.

**Real-data audit** (read-only `proficiency-audit` job, production, 14 Oct 2026, players
anonymised): 6 players, 902 champion/role pairs. 179 tiers changed, all of them downwards or out of
"No data": 138 pairs with one or two games moved from No data to Few games; the remaining changes were
off-role leaks (for example 208 games on a champion with a single game in mid: Very strong →
Familiar), stale experience (30 jungle games, last one 103 days ago: Comfortable → Out of
practice) and small samples (2 games at 100% → Few games, not a high tier). Only one pool champion
in its own role changed (64 games, last one 67 days ago: Very strong → Comfortable, because it was
not played in the last month). No rating went up. Run the job again from Actions → Data jobs →
`proficiency-audit` to repeat the comparison on current data.

## Configuration

`DEFAULT_ENGINE_CONFIG` in `src/domain/engine/config.ts` holds every weight and threshold. The team's overrides are stored in the database and editable in Settings.

## Three layers: can we pick it, is it good, can we execute it

1. **Can** — the hard player constraint above. Nothing below ever relaxes it.
2. **Good** — the evaluation parts (individual, synergy, enemy).
3. **Execute** — the realism layer (`assessRealism` in `evaluate.ts`): mean execution demand of the members (mechanics, coordination, how badly mistakes are punished, derived from the curated traits), a communication burden when three or more kits depend on coordinated follow-up, and resource overload when more than two champions want strongside resources. The team's **risk preference** (`reliable` / `balanced` / `ceiling`, in config or as a strategy override) scales the execution penalties ×2 / ×1 / ×0.25. The projected team reports its execution label, power curve and resource picture.

## Honest decision labels

Every recommendation carries a `decision` label: **Strong** (top option ≥ 3 points ahead), **Moderate** (≥ 1.2), **Close** (less) or **Low confidence** (no or thin current-patch evidence). The gap is shown, never hidden. A close call is reported as a close call.

For a pick, the label also reflects the recommended champion's own evidence (`withPickEvidence`). It drops one step when both of these hold, and the reason names the sample:
- the lead over the runner-up is mostly statistical (champion strength, matchups, pairings);
- the champion has fewer than 100 games in its role this period.

A lead built on the player's comfort or on composition is unaffected.

## Why not X?

`whyNot(input, { championId, role })` compares the recommendation with any other legal candidate on the same dimensions the engine used (lane, team synergy, strength into their draft, current patch, player proficiency/comfort, damage profile, pick timing) and states the closeness and verdict. A champion outside the assigned player's pool for an open role returns nothing: the constraint is hard, and the UI says so.

## What would change this / enemy responses

- `whatWouldChange` simulates plausible next enemy reveals (one representative champion per archetype: disengage, engage, dive assassin, poke, hypercarry, frontline) and reports when the ranking between the top two choices would flip.
- `simulateResponses` lists the enemy's strongest plausible answers to the primary pick across their open roles, weighted by meta share (and scouted likely picks when supplied). They are likelihoods, not predictions.

## Threat map and pool pinch

- `threatMap` produces explicit champion-to-champion threats between our projected team and the revealed enemy picks (dive onto a carry, pick threats, poke without engage to punish it, disengage against our initiator, side-lane pressure, access to their carry). The playbook reuses it.
- `poolPinch` runs while enemy bans remain: for each open role it counts the assigned player's options, estimates which are ban-prone (ban rate, pro presence, and champions that counter their revealed picks) and names the legal escape (a secondary-role move) — "secure this now" versus "it can wait".

## Strategy overrides

Per-draft soft preferences (`DraftOverrides`: strongside, weakside, preserve counterpick, no role flex today, prefer scaling, prefer lower execution, prioritise engage, risk preference). They become config tilts and trait bonuses; they never make an illegal champion legal and never silence severe-lane penalties. The engine re-solves the draft without the overrides and reports the cost (`overrides.warning`) when honouring them costs more than ~1.5 points of draft quality.

## Professional draft patterns

Pro games with known pick order (Leaguepedia `Team1Picks`/`Team2Picks`, Oracle's Elixir `pick`) are folded into `pro_pick_slot_stats`: how often each champion is a B1, an R1/R2, a B2/B3, an R3/R4, a B4/B5, an R5 (counterpick) or a first/second-phase ban. The stats provider exposes a per-champion slot profile; the timing model raises the denial probability of first-rotation champions and lowers it for habitual last-pick counters, and explanations say so ("Pro teams take it first rotation"). The pre-draft page shows the current patterns (B1 priority, R1/R2 pairs, B2/B3 pairs, R5 counterpicks, second-ban targets, flex retention) as context, not as instructions: our pools decide.
