# Champion experience labels: audit (October 2026)

What every label on **My Profile → All Champions** means, how it is worked out, and where else the
same label appears. The rule behind the October 2026 correction:

- **Player preference** is what the player chooses: their roles, their champion pools and the
  order of those pools. It is shown as **In pool** (Primary pool / Secondary pool in the champion
  window; the tip says it is the player's own choice) and is never worked out from games.
- **Observed experience** is what their games show: the **Experience** label and the figures. It is
  never presented as skill, and never as the player's choice.

## The labels on All Champions

| Label | What it shows | How it is worked out | Inputs | Automatic or set by the player | Effect elsewhere |
|---|---|---|---|---|---|
| **Games** (and the bar) | Games on the champion in the filtered games | Count of stored games matching the page's filters (season, game mode, role played, account); the bar is relative to the most-played champion in view | Stored match history of the player's linked accounts | Automatic | None directly |
| **Win rate** (W–L, colour, gauge) | Share of those games won | wins ÷ games in the filtered games; coloured only from `WIN_RATE_MIN_GAMES.champion` games, with a small-sample note below that | Same games | Automatic | None directly (results enter Experience only through the shrunk performance part, below) |
| **KDA** / **Perfect** | (kills + assists) ÷ deaths over the filtered games; *Perfect* with no deaths | Sum over the games, not an average of ratios | Same games | Automatic | None |
| **CS/min** | Creep score per minute over the filtered games | Total CS ÷ total minutes | Same games | Automatic | None |
| **Experience** (badge) | How much the player has played the champion **in that role** | `estimateProficiency` (`src/domain/proficiency`): volume (log-scaled, queue-weighted games plus mastery at 1 game per 6,000 points, credited to the role in proportion to games there), recency (last 30/90 days), role fit (share of games in the role) and results shrunk towards the player's own baseline (15% of the score), then a tier with minimum games in the role for the top two | **Every stored game on the linked accounts** (all seasons, supported queues; Normal games at 60% weight), champion mastery | Automatic | The same rating is shown on Team Overview cards and player details; it never changes the pools |
| Evidence bars (Solid / Reasonable / Thin / No evidence) | How far the data supports the Experience label | `confidenceWord(confidence)`: weighted games, mastery known, a last-played date | Same as Experience | Automatic | The confidence scales how far the score moves from neutral |
| **Mastery points** | Champion mastery summed over the linked accounts | Sum of each account's points (each account counted once) | Riot champion mastery (any mode, ARAM included) | Automatic | Through Experience only (never alone: mastery only caps at *Some experience*) |
| **In pool** | The champion is in one of the player's pools for that role (the tip: "their own choice, not worked out from games") | Pool membership | The player's pools | **Set by the player** (or an admin) | Pools decide which lineup roles a player is offered for; unchanged |
| Role (icon and name) | The role of the row | The role the games were played in (or the pool's role) | Stored positions | Automatic | Experience is rated per role |

Experience is deliberately **not limited by the filters**: a champion can show "3 games" this season
and *Played a lot* from earlier seasons. The column heading and its tip say so.

## The Experience tiers

| Tier (code) | Label (before) | Label (now) | Meaning |
|---|---|---|---|
| `core` | Main | **Played a lot** | 15+ games in the role (more counting mastery), with games in the last month |
| `strong` | Comfortable | **Played regularly** | 6+ games in the role, with recent games |
| `comfortable` | Familiar | **Some experience** | Games or mastery on the champion, but not regular recent play in this role |
| `moderate` | Few games | **Few games** | A game or two, or a little mastery |
| `rusty` | Out of practice | **Not played lately** | Plenty of games, none for 3+ months |
| `unknown` | Not played | **No games** | No games or mastery on the linked accounts |

Why the words changed: *Main* read as "my main", a choice (and clashed with the *Main* Riot account);
*Comfortable* and *Familiar* read as how good the player is. The new words say what the games show.
No tier, threshold or score changed, and no pool or player setting was rewritten.

## Consistency across pages

The label comes from one place (`TIER_LABELS`, `TIER_DESCRIPTIONS` and `tierPhrase` in
`src/domain/proficiency`) and the same estimate (`getProficiencyLookup`), so it is the same word for
the same champion and role on:

- My Profile → **All Champions** (column *Experience*) and the **champion window** ("Experience: …");
- My Profile → **Roles & champion pools** (the quiet label under each pool champion);
- the **player details** window and teammate profiles (table column *Experience*);
- **Team Overview** cards (first pool champion, when teammate statistics are visible).

## How Experience is worked out (revision 2, October 2026)

Moved here from the former draft engine notes when Draft was removed; the model itself is unchanged.

Proficiency estimates **experience on a champion in a role**, not skill. It is a 0–1 score, a
confidence (how much evidence there is) and a tier with a label. It never changes the pools.

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

**Real-data audit** (read-only `proficiency-audit` job, production, 14 Oct 2026, players
anonymised): 6 players, 902 champion/role pairs. 179 tiers changed, all of them downwards or out of
"No data": 138 pairs with one or two games moved from No data to Few games; the remaining changes were
off-role leaks (for example 208 games on a champion with a single game in mid: Very strong →
Familiar), stale experience (30 jungle games, last one 103 days ago: Comfortable → Out of
practice) and small samples (2 games at 100% → Few games, not a high tier). Only one pool champion
in its own role changed (64 games, last one 67 days ago: Very strong → Comfortable, because it was
not played in the last month). No rating went up. Run the job again from Actions → Data jobs →
`proficiency-audit` to repeat the comparison on current data.
