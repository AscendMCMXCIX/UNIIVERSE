# Performance score (v3)

How the post-game view scores each of a game's players, 0 to 10, ranks all ten and names an MVP
and an ACE (Release 16, at the owner's request of 23 Nov 2026). The model is UNIIVERSE's own:
it borrows the experience of a 0–10 match rating, never another site's name, brand or numbers, and
it is never presented as anyone else's rating. Its code is `src/domain/performance-score.ts`
(pure and deterministic); its tests, with the worked examples below, are
`src/domain/performance-score.test.ts`; the post-game view reads it through
`src/components/match-history/performance-inputs.ts`.

## What it is, and is not

- **A comparison within one game.** Each player's figures are set first against their role's typical
  figures, then against the other players of that game (how far each was from their role's typical)
  and against their lane opponent. Nothing outside the game is read: no history, no ladder
  average, no sample UNIIVERSE does not have. A 7.5 means "well above the others in this game",
  not "a 7.5 game by some absolute standard"; two games' scores are not comparable figures.
- **From Riot's own figures as stored** (the game's record, `match_details`, and its timeline,
  `match_timelines`). Nothing is fetched to score a game, and inspecting another player reads
  nothing more (the record and the timeline already hold all ten).
- **Deterministic and versioned.** The same game always gives the same scores (any order of its
  players); `SCORE_VERSION` is `v3`. A change to a weight, a component or the scale is a new version,
  written here with its date.

## The components

Each is a figure every scored player has, from the game's record unless said otherwise.

| Key | Component | Figure |
| --- | --- | --- |
| `kp` | Kill participation | (kills + assists) ÷ the team's kills |
| `kda` | KDA | ln(1 + (kills + assists) ÷ (deaths + 1)): on a log scale, so 20/0/10 is not ten times 4/2/6 |
| `deaths` | Deaths | − deaths per 10 minutes (fewer is better), apart from the KDA, so deaths weigh twice |
| `damage` | Damage share | damage to champions ÷ the team's |
| `tanking` | Damage taken and mitigated | (damage taken + self-mitigated) ÷ the team's (mitigated only where every teammate's is recorded) |
| `farm` | CS per minute | lane minions and monsters ÷ minutes |
| `gold` | Gold share | gold earned ÷ the team's |
| `vision` | Vision per minute | vision score ÷ minutes |
| `wards` | Wards placed and cleared | (wards placed + wards cleared) ÷ minutes (cleared only where every teammate's is recorded) |
| `objectives` | Objective damage | damage to objectives (Riot's `damageDealtToObjectives`: turrets, epic monsters) ÷ the team's |
| `turrets` | Turret takedowns | per ten minutes; **weight 0 in every role since v3** (a team fact: towers fall to whoever is there, and one turret in a quiet game moved scores) |
| `cc` | Crowd control | seconds of crowd control on enemy champions ÷ minutes |
| `protect` | Healing and shielding | healing + shielding on teammates ÷ minutes |
| `lane` | Lane at 10:00 and 15:00 | gold + experience ahead of the lane opponent, the mean of 10:00 and 15:00, from the timeline's frames |

Not available, so not used: who took part in each dragon, Baron or Herald (the stored timeline keeps
objectives per team, not per player; Riot's per-player takedown challenges are not stored), damage
and vision through the game (only at the end), and wards by time.

**Availability.** A component is used only when **every** scored player has it (since v3 also when
nobody differs on it: it then moves no one): a record that lacks a figure for one player leaves it out for everyone, so nobody is
compared on a figure others were not (an older record without the extra figures is scored on KDA,
kill participation, damage, gold, farm, vision and wards alone). The lane is the one exception: it
counts for the players whose lane opponent the one lane opponent rule names
(`domain/match-analysis laneOpponentOf`) and whose frames give both 10:00 and 15:00; the others are
scored without it.

## Normalisation

1. **Against the role's reference (v3).** Each figure is first compared with its role's typical
   figure (`TYPICAL_FIGURES`, a 30-minute ranked game; `roleReferences()` reads them through the same
   `figure()` as the game's, so a share is a share and a rate a rate at any length). Shares and
   rates are compared as proportions: ln((figure + ε) ÷ (reference + ε)) (`PROPORTION_EPSILON`, so a
   zero is not minus infinity), the KDA and deaths as differences. A player without a recorded
   position, or on ARAM, is compared with the match's mean instead; turrets and the lane with the
   match's mean and 0. A support's low CS, a carry's high damage and a jungler's objective damage
   are what the role does: in a typical game every role's residual is 0, and every role scores
   the same (v1–v2 compared raw figures across all ten, so the bottom laner was the MVP of a
   typical game and the top laner last).
2. **Within the match.** Each residual becomes a z-score against the game's residuals: (residual −
   their median) ÷ their spread, the spread at least `MIN_SPREAD` (a game where players hardly differ
   is not blown up: one jungler's 50 healing among nine zeros, one turret in the game), clamped to
   ±2.5 (`Z_CLAMP`). The median (not the mean) keeps one player far from the rest from shifting
   everyone else.
3. **Role-relative.** Where the player's lane opponent is known, 40% of the component
   (`COUNTERPART_SHARE`) is the comparison with that opponent instead: (residual − opponent's) ÷
   (spread × √2), clamped to ±0.5 (`COUNTERPART_CLAMP`), so that comparison alone moves a component
   by at most 0.2. The lane component is already that comparison and is not blended.
4. **Per role.** Each role weighs the components (below); the score is their weighted mean. Crowd
   control and healing and shielding of teammates count as one (v3): the better of the two, at
   both weights, so an engage support is not marked down for shielding little, nor an enchanter for
   stunning little.
5. **The result.** +0.05 for a win and −0.05 for a loss (`OUTCOME_STEP`, v3; 0.1 before), in the
   weighted mean's units, about ±0.2 on the 0–10 scale: two players with the same figures are 0.4
   apart (0.8 in v1–v2), and a win never makes a poor game good (tested below). A game without a
   winner (a remake) has no step, no MVP and no ACE.
6. **The scale.** score = 10 ÷ (1 + e^(−1.6 × mean)) (`SCALE_K` 1.6), one decimal. 0 is 5.0 (the
   game's average player); +0.5 is 6.9; +1 (a standard deviation above the game on everything
   weighed) is 8.3; −1 is 1.7. The clamp keeps every score strictly between 0 and 10.

## Role weights

Read across a row: what that role is judged on. Only a row's proportions matter.

| Weights | kp | kda | deaths | damage | tanking | farm | gold | vision | wards | objectives | turrets | cc | protect | lane |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Top | 0.5 | 0.8 | 0.8 | 1.2 | 1.3 | 1.2 | 0.8 | 0.3 | 0.2 | 0.6 | 0 | 0.5 | 0.1 | 1.1 |
| Jungle | 1.4 | 1.0 | 0.8 | 0.8 | 0.6 | 0.7 | 0.6 | 0.8 | 0.5 | 1.5 | 0 | 0.5 | 0.1 | 0.6 |
| Mid | 1.1 | 1.0 | 0.8 | 1.4 | 0.3 | 1.1 | 0.8 | 0.5 | 0.3 | 0.4 | 0 | 0.4 | 0.1 | 1.0 |
| Bottom | 1.0 | 1.0 | 0.9 | 1.5 | 0.2 | 1.2 | 0.9 | 0.4 | 0.2 | 0.5 | 0 | 0.2 | 0.1 | 1.0 |
| Support | 1.5 | 1.0 | 0.8 | 0.5 | 0.5 | 0.1 | 0.2 | 1.4 | 1.1 | 0.3 | 0 | 1.0 | 1.0 | 0.6 |
| Position not recorded | 1.2 | 1.0 | 0.8 | 1.0 | 0.5 | 0.7 | 0.6 | 0.7 | 0.4 | 0.6 | 0 | 0.5 | 0.4 | 0 |
| ARAM | 1.4 | 1.0 | 0.6 | 1.5 | 0.9 | 0 | 0.4 | 0 | 0 | 0.2 | 0 | 0.7 | 0.7 | 0 |

Since v3 the weights say what a role is judged on, not how it compares with other roles: the role
references (normalisation, step 1) take care of that, so a typical game scores alike whatever the
row.

- **Supports and tanks can earn excellent ratings:** a support is judged on kill participation,
  vision, wards, crowd control and protecting teammates, and barely on CS and gold; a top laner's
  damage taken and mitigated counts as much as their damage dealt.
- **High-kill carries are not rewarded by default:** kills count only through kill participation and
  the KDA, both against deaths, which weigh twice (KDA and deaths).
- **Game modes.** ARAM (queues 450, 720, 2400 and the older 100) has no lanes, farm or vision in its
  weights, and its timeline steps three minutes. Every other mode is read as Summoner's Rift. A
  player whose position is not recorded (an older record, a mode without positions) gets the
  role-neutral row, and the score's (i) says so ("Position not recorded"). Arena and other modes without
  two teams have no score.
- **A removed player** (personal data erased) is not scored and is not part of the comparison; the
  team's kills still count theirs, from the record's team total.

## Rank, MVP, ACE and why

All scored players are ranked by the unrounded weighted mean (ties by their place in the record).
**MVP** is the winning team's highest, **ACE** the losing team's highest, so the ACE can be the game's
highest score. **Why** names at most two components that lifted the score most and the one that held
it back most, each only beyond ±0.35 (its share of the weighted mean, in words: "Stood out: strong
vision, high kill participation. Held back by many deaths.").

## Worked examples (the tests)

A 30-minute ranked game built from each role's typical figures (`TYPICAL_FIGURES`), the same on
both sides (blue won), then one or two players changed (`performance-score.test.ts`):

| Game | Player | Figures | v1 | v2 | **v3** |
| --- | --- | --- | --- | --- | --- |
| Typical, winners | top / jungle / mid / bottom / support | the role's typical figures | 5.3 / 6.2 / 5.7 / 6.3 / 6.3 | 5.6 / 6.5 / 5.8 / 6.8 / 6.8 | **5.2 each** |
| Typical, losers | the same | the same | 4.5 / 5.4 / 4.9 / 5.6 / 5.6 | 4.8 / 5.8 / 5.0 / 6.0 / 6.0 | **4.8 each** |
| Strong support vs mediocre carry | blue support | 2/3/22, 95 vision, 40 wards placed and 10 cleared, 55 s crowd control, 6k healing and shielding, 35 CS | 9.1 (MVP) | 8.9 (MVP) | **9.0** (MVP) |
| | red bottom | 11/7/3, a carry's usual damage, 14.5k gold | 4.3 | 4.7 | **4.0** |
| Enchanter | blue support | 0/3/22, 4 s crowd control, 18k healing and shielding, 45 vision | — | — | **6.4** (MVP) |
| Tank support | blue support | 1/7/18, 80 s crowd control, 65k taken and mitigated, 75 vision | — | 8.0 (MVP, "Excellent") | **7.7** (MVP; a typical ADC 5.1) |
| Feeding carry | blue mid | 8/13/3, behind on farm and damage | 2.5 (10th) | 3.1 (10th) | **2.0** (10th) |
| Weak winner vs strong loser | blue top (won) | 1/7/2, behind on everything | 2.3 | 3.7 | **1.9** |
| | red top (lost) | 8/2/5, ahead on everything | 7.8 (ACE) | 7.0 (ACE) | **7.4** (ACE) |
| Tank | blue top | 3/5/11, 15k damage, 48k taken and 45k mitigated, 50 s crowd control | 7.2 (MVP) | 6.9 (MVP) | **6.5** (MVP) |
| Dominated laner | red top facing that tank | the role's typical figures | 3.2 | 4.2 | **4.6** |
| Dominated support | red support facing a 3/2/24 support with 100 vision | the role's typical figures | 2.3 | 4.4 | **4.1** |
| Strong carry | blue bottom | 12/2/6, 38k damage, 15k gold | — | — | **7.6** (MVP) |

Fairness, as tested in v3: **a typical game scores the same in every role** (within 0.2 on each
team; the result's step apart, 0.4 between the teams); a strong support game scores far above a
mediocre high-kill carry (9.0 against 4.0) and can be the MVP, and so can an enchanter or a tank
support; a feeding carry with kills scores poorly (2.0, 10th); a win does not lift a weak game above
a strong losing game (1.9 against 7.4); an ordinary game stays at 4 or above when the lane opponent
had an outstanding one (4.6 and 4.1); one jungler's 50 healing or one turret in the game moves no
score by more than 0.3; and the result alone moves a score by at most half a point.

**Calibration check (12).** The reviewer's tank support at 1/7/18 with 80 s of crowd control scored
8.0 "Excellent" and MVP in v2; in v3 7.7, still the game's MVP over a typical ADC (5.1), not
"Excellent": 80 s of crowd control and 75 vision are far above a support's usual, the seven deaths
hold it back ("Held back by many deaths").

Why v3 (the independent review, 24 Nov 2026): v1 and v2 z-scored every figure across all ten
players, so a role's usual figures (an ADC's damage and farm, a support's vision) counted as merit,
and with every role's typical figures the bottom laner was both MVP and ACE and the top laners last.
v3 compares each figure with its role's reference first. The review's other findings: tiny spreads
(MIN_SPREAD), turrets (weight 0), the win step (±0.05) and the support's two ways of helping (crowd
control or protection).

Why v2: in v1, 60% of each component was the comparison with the lane opponent, unbounded, so an
ordinary support facing an outstanding one scored 2.3, and the top facing the tank 3.2. v2 took
40% from the opponent and bounded that part to ±0.5.

## The score through the game

Where the game's timeline is stored, a point every **five minutes** on Summoner's Rift and every
**three** on ARAM (`timelineStep`), each scored by the same function from what the timeline had
recorded **by then**, never from final figures:

- kills, deaths and assists by that moment (from each player's kill times), each starting from a
  prior of `PRIOR_MINUTES` (8) minutes of the role's typical rate (v3: one kill or one death at
  5:00 would otherwise swing the KDA), and each team's kills by then, for kill participation, the
  KDA and deaths per ten minutes; left out of every moment when any
  scored player's kill times are not kept (a timeline stored before 29 Oct 2026) or a player was
  removed (their kills are not kept, so a team's would be short);
- CS and gold at that moment, read between the frames (gold as a share of the team's at that moment);
- the lane: gold plus experience ahead of the lane opponent at that moment before 10:00, the 10:00
  figure until 15:00, then the mean of 10:00 and 15:00 (the final score's own lane figure);
- **not** damage, damage taken, vision, wards, crowd control, healing, objective damage or turrets:
  Riot gives those only for the whole game, so the moments before the end are scored on the rest;
- no result step before the end (the result was not known yet);
- **damped toward 5 by the evidence in so far** (v2): a moment's weighted mean is multiplied, before
  the curve, by minutes ÷ (minutes + 8) on the Rift (`DAMPING_MINUTES`; 5 on ARAM), 0.38 at 5:00,
  0.56 at 10:00, 0.65 at 15:00, 0.76 at 25:00, and by the share of the player's final weighting the
  moment can read (`coverageOf`: the weights of kill participation, the KDA, deaths, farm, gold and
  the lane over those the final score reads, so a support's early points, mostly without the vision
  and crowd control they are judged on, move less). A z-score over a handful of kills swung a point
  at 5:00 to 1.0 in v1; the damping keeps such a point near the middle until the game has said more.
  Only the moment's own minutes and components are read, never the game's length or final figures.
  `coverageOf` reads which components the final score used (its list, through the role's weights),
  never their values. A moment's spread is also at least `MIN_SPREAD` × √(30 ÷ minutes) (v3: a few
  minutes' counts vary more than a whole game's).

The **last point is the game's end and is the final score itself**, read from the whole record (it
carries the components the earlier points cannot) and never damped: the chart joins it to the point
before with a dotted line for that reason. An ordinary game played the same throughout reads
"Steady" at every seat, and a strong one is not called "Rising" by the damping alone (tested). A game without a stored timeline, or whose timeline contradicts its
record (`goldContradictsRecord`), or whose frames have a gap, shows its final scores and says the
score through the game is not available.

**The trend word** (`trendOf`, `TREND_RULES`, `TREND_SENTENCES`): one word and its sentence. Not
shown since the owner's brief of 24 Nov 2026 (the post-game view no longer writes a narrative: the
score, the chart, the lane and the scoreboard speak for themselves); the rules stay in the domain,
tested, should the owner ask for them again. Since
v3 it reads the points' **undamped** weighted means (`TimelinePoint.raw`, z units, no result
step), not the chart's damped scores: in v2 the damping pulled every point toward 5 while the rules
still used 0–10 thresholds, so nearly every player read "Steady" (all 20 in the demo's two timeline
games, one of them falling from 4.6 to 3.4). It reads the points before the end and only three or
more, the first and last thirds being the first and last ceil(n ÷ 3) points, and the final's own
weighted mean (`PlayerScore.raw`) where a rule says so. Near the middle of the scale 0.1 z is about
0.4 points. The first rule that holds, in this order, names it; none may hold, and then nothing is
shown.

| Word | Rule (z units) | Sentence |
| --- | --- | --- |
| Dominant | every point +0.45 or more | Ahead of the game's average at every point of the timeline. |
| Struggling | every point −0.45 or less | Behind the game's average at every point of the timeline. |
| Resilient | the first third's mean −0.3 or less, and the final +0.15 or more | Recovered from a weak start to finish above the game's average. |
| Rising | the last third's mean 0.3 or more above the first third's | Grew stronger as the game went on. |
| Fading | the last third's mean 0.3 or more below the first third's | Started stronger than they finished. |
| Strong finish | the final 0.375 or more above the last point (about 1.5 points) | Finished well above where the timeline stood: the end-of-game figures lifted the score. |
| Weak finish | the final 0.375 or more below the last point | Finished well below where the timeline stood: the end-of-game figures lowered the score. |
| Fast start | the first third's mean +0.45 or more | Started the game ahead of the others. |
| Erratic | the highest and lowest points 1.0 or more apart | Swung between strong and weak stretches. |
| Steady | the highest and lowest points 0.4 or less apart (and, the finish rules having been checked first, the final within 0.375 of the last point) | Held much the same level throughout. |

Tested on synthetic timelines: a steady ordinary game reads "Steady" at every seat; a late-game
carry (every kill after 20:00) reads "Resilient", "Rising" or "Strong finish"; a player falling
behind reads "Fading"; an early stomp then a throw is never "Steady" or "Rising"; a strong game
played the same throughout is never called "Rising" or "Fading" by the damping.

**The chart** (24 Nov 2026): one line, the player inspected, 88px tall beside a desktop's
scoreboard and 64px elsewhere (a tablet's grid, a phone's Player page), in an area of one height
whoever is inspected; its axis fitted to the data (`axisRange`: the lowest and highest scores shown
and 5, half a point beyond, at least 3 apart, whole numbers within 0–10), 5 always a dashed reference
line. The dotted segment into the end is explained in the chart's one (i) ("Each point scores what had
happened by then; the end is the final score, from the whole record"). The second, compared player
(a dashed line, its legend and the comparison table) was removed with the comparison select at the
owner's request (24 Nov 2026).

**How the view shows the score** (24 Nov 2026, the owner's brief §3 and §6): each scoreboard row ends
with the player's score over its place (1st … 10th in quiet text, MVP and ACE as chips); the player
inspected has theirs beside their loadout, the score with MVP or ACE over "3rd of 10" and one (i) that
says how it is worked out ("Compared within this game: each figure against the role's typical figure,
then against the other players and the lane opponent. 0–10; 5 is average."; a player without a
recorded position gets the neutral wording). Removed from the view on that date, the code kept where
it is analytical: the written why (`reasonText`) and the trend word (`trendOf`), "Excellent" from 8.0
(`EXCELLENT_AT`), each team's mean on a split bar (`teamAverages`) and the ten score tiles (the
scoreboard already carries each player's score and place). The collapsed card shows the same score
and place (lane C of Release 17, docs/DESIGN_SYSTEM.md).

## Limitations

- One game's ten players are a small sample; MIN_SPREAD keeps a game where everyone did much the
  same from spreading small differences over the scale.
- The role references are one considered set of typical figures (a 30-minute ranked game), not
  fitted to data UNIIVERSE does not have; a player far from them in a way their champion explains (an
  enchanter's healing, an engage support's crowd control) is helped by the crowd control or
  protection rule, not by a per-champion reference.
- Figures that are not stored are not scored: per-player objective participation (dragons, Barons,
  Heralds), first blood beyond its count, the timing of wards and damage.
- Positions are Riot's (team position, else individual position, else the merged one on older
  records); a swapped lane (a duo that traded lanes) is scored by Riot's reading.
- The weights are a considered first version, chosen so that a typical game in each role scores
  near 5 and the fairness rules above hold; they are not fitted to data UNIIVERSE does not have. A
  revision is a new version, recorded here.

## Versions

- **v1** (23 Nov 2026, Release 16): 60% of each component from the lane opponent, unbounded; the
  timeline's points undamped.
- **v2** (23 Nov 2026, Release 16, before release): 40% from the lane opponent, bounded to ±0.5;
  the top laner's weights; the timeline's points damped toward 5 by minutes played and by the share
  of the final weighting they read.
- **v3** (24 Nov 2026, Release 16, before release, after the independent review): the model above:
  each figure against its role's reference (as a proportion for shares and rates), median-centred,
  `MIN_SPREAD`; crowd control or protection, the better; turret takedowns not scored; the result's
  step ±0.05; the timeline's early counts with a prior and wider spreads; trend words on the
  undamped means, with "Strong finish" and "Weak finish".
