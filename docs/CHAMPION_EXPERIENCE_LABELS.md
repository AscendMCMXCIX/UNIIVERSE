# Champion experience labels: audit (October 2026)

What every label on **My Profile → All Champions** means, how it is worked out, and where else the
same label appears. The rule behind the October 2026 correction:

- **Player preference** is what the player chooses: their roles, their champion pools and the
  order of those pools. It is shown as **In your pool** (or Primary pool / Secondary pool in the
  champion window) and is never worked out from games.
- **Observed experience** is what their games show: the **Experience** label and the figures. It is
  never presented as skill, and never as the player's choice.

## The labels on All Champions

| Label | What it shows | How it is worked out | Inputs | Automatic or set by the player | Effect on drafting |
|---|---|---|---|---|---|
| **Games** (and the bar) | Games on the champion in the filtered games | Count of stored games matching the page's filters (season, game mode, role played, account); the bar is relative to the most-played champion in view | Stored match history of the player's linked accounts | Automatic | None directly |
| **Win rate** (W–L, colour, gauge) | Share of those games won | wins ÷ games in the filtered games; coloured only from `WIN_RATE_MIN_GAMES.champion` games, with a small-sample note below that | Same games | Automatic | None directly (results enter Experience only through the shrunk performance part, below) |
| **KDA** / **Perfect** | (kills + assists) ÷ deaths over the filtered games; *Perfect* with no deaths | Sum over the games, not an average of ratios | Same games | Automatic | None |
| **CS/min** | Creep score per minute over the filtered games | Total CS ÷ total minutes | Same games | Automatic | None |
| **Experience** (badge) | How much the player has played the champion **in that role** | `estimateProficiency` (`src/domain/proficiency`): volume (log-scaled, queue-weighted games plus mastery at 1 game per 6,000 points, credited to the role in proportion to games there), recency (last 30/90 days), role fit (share of games in the role) and results shrunk towards the player's own baseline (15% of the score), then a tier with minimum games in the role for the top two | **Every stored game on the linked accounts** (all seasons, supported queues; Normal games at 60% weight), champion mastery | Automatic | The underlying score (not the word) is the engine's *player-proficiency* factor: a preference modifier inside the pool, never a gate |
| Evidence bars (Solid / Reasonable / Thin / No evidence) | How far the data supports the Experience label | `confidenceWord(confidence)`: weighted games, mastery known, a last-played date | Same as Experience | Automatic | The confidence scales how far the score moves from neutral |
| **Mastery points** | Champion mastery summed over the linked accounts | Sum of each account's points (each account counted once) | Riot champion mastery (any mode, ARAM included) | Automatic | Through Experience only (never alone: mastery only caps at *Some experience*) |
| **In your pool** | The champion is in one of the player's pools for that role | Pool membership | The player's pools | **Set by the player** (or an admin) | Pools are the draft engine's hard constraint (who can play what) and pool order its first-choice signal; unchanged |
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
No tier, threshold, score or engine weight changed, and no pool or player setting was rewritten.

## Consistency across pages

The label comes from one place (`TIER_LABELS`, `TIER_DESCRIPTIONS` and `tierPhrase` in
`src/domain/proficiency`) and the same estimate (`getProficiencyLookup`), so it is the same word for
the same champion and role on:

- My Profile → **All Champions** (column *Experience*) and the **champion window** ("Experience: …");
- My Profile → **Roles & champion pools** (the quiet label under each pool champion);
- the **player details** window and teammate profiles (table column *Experience*);
- **Team Overview** cards (first pool champion, when teammate statistics are visible);
- the **Draft Room** explanations ("Mia plays it regularly (7 games)", "has played this champion a
  lot", emergency suggestions).

Draft-engine hard constraints (pools, roles, lineup, legality, fearless) do not read the label.
