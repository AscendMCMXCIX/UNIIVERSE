# Performance score (v1)

How the post-game view scores each of a game's players, 0 to 10, ranks all ten and names an MVP
and an ACE (Release 16, at the owner's request of 23 Nov 2026). The model is UNIIVERSE's own:
it borrows the experience of a 0–10 match rating, never another site's name, brand or numbers, and
it is never presented as anyone else's rating. Its code is `src/domain/performance-score.ts`
(pure and deterministic); its tests, with the worked examples below, are
`src/domain/performance-score.test.ts`; the post-game view reads it through
`src/components/match-history/performance-inputs.ts`.

## What it is, and is not

- **A comparison within one game.** Each player's figures are set against the other players of that
  game and against their lane opponent. Nothing outside the game is read: no history, no ladder
  average, no sample UNIIVERSE does not have. A 7.5 means "well above the others in this game",
  not "a 7.5 game by some absolute standard"; two games' scores are not comparable figures.
- **From Riot's own figures as stored** (the game's record, `match_details`, and its timeline,
  `match_timelines`). Nothing is fetched to score a game, and inspecting another player reads
  nothing more (the record and the timeline already hold all ten).
- **Deterministic and versioned.** The same game always gives the same scores (any order of its
  players); `SCORE_VERSION` is `v1`. A change to a weight, a component or the scale is a new version,
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
| `turrets` | Turret takedowns | Riot's `turretTakedowns` |
| `cc` | Crowd control | seconds of crowd control on enemy champions ÷ minutes |
| `protect` | Healing and shielding | healing + shielding on teammates ÷ minutes |
| `lane` | Lane at 10:00 and 15:00 | gold + experience ahead of the lane opponent, the mean of 10:00 and 15:00, from the timeline's frames |

Not available, so not used: who took part in each dragon, Baron or Herald (the stored timeline keeps
objectives per team, not per player; Riot's per-player takedown challenges are not stored), damage
and vision through the game (only at the end), and wards by time.

**Availability.** A component is used only when **every** scored player has it and the players
differ on it: a record that lacks a figure for one player leaves it out for everyone, so nobody is
compared on a figure others were not (an older record without the extra figures is scored on KDA,
kill participation, damage, gold, farm, vision and wards alone). The lane is the one exception: it
counts for the players whose lane opponent the one lane opponent rule names
(`domain/match-analysis laneOpponentOf`) and whose frames give both 10:00 and 15:00; the others are
scored without it.

## Normalisation

1. **Within the match.** For each component, a player's figure becomes a z-score against the game's
   scored players: (figure − mean) ÷ standard deviation, clamped to ±2.5 (`Z_CLAMP`) so one extreme
   figure moves a score without deciding it.
2. **Role-relative.** Where the player's lane opponent is known, 60% of the component
   (`COUNTERPART_SHARE`) is the comparison with that opponent instead: (figure − opponent's) ÷
   (standard deviation × √2) (the difference of two players' figures has √2 times the spread of
   one), clamped the same way. A support's CS and gold are measured mostly against the other
   support, a jungler's objective damage against the other jungler. The lane component is already
   that comparison and is not blended.
3. **Per role.** Each role weighs the components (below); the score is their weighted mean.
4. **The result.** +0.1 for a win and −0.1 for a loss (`OUTCOME_STEP`), in the weighted mean's
   units, about ±0.4 on the 0–10 scale: a win never makes a poor game good (tested below). A game
   without a winner (a remake) has no step, no MVP and no ACE.
5. **The scale.** score = 10 ÷ (1 + e^(−1.6 × mean)) (`SCALE_K` 1.6), one decimal. 0 is 5.0 (the
   game's average player); +0.5 is 6.9; +1 (a standard deviation above the game on everything
   weighed) is 8.3; −1 is 1.7. The clamp keeps every score strictly between 0 and 10.

## Role weights

Read across a row: what that role is judged on. Only a row's proportions matter.

| Weights | kp | kda | deaths | damage | tanking | farm | gold | vision | wards | objectives | turrets | cc | protect | lane |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Top | 0.7 | 0.9 | 0.8 | 1.2 | 1.0 | 1.1 | 0.8 | 0.4 | 0.2 | 0.6 | 0.8 | 0.4 | 0.1 | 1.1 |
| Jungle | 1.4 | 1.0 | 0.8 | 0.8 | 0.6 | 0.7 | 0.6 | 0.8 | 0.5 | 1.5 | 0.4 | 0.5 | 0.1 | 0.6 |
| Mid | 1.1 | 1.0 | 0.8 | 1.4 | 0.3 | 1.1 | 0.8 | 0.5 | 0.3 | 0.4 | 0.5 | 0.4 | 0.1 | 1.0 |
| Bottom | 1.0 | 1.0 | 0.9 | 1.5 | 0.2 | 1.2 | 0.9 | 0.4 | 0.2 | 0.5 | 0.7 | 0.2 | 0.1 | 1.0 |
| Support | 1.5 | 1.0 | 0.8 | 0.5 | 0.5 | 0.1 | 0.2 | 1.4 | 1.1 | 0.3 | 0.3 | 1.0 | 1.0 | 0.6 |
| Position not recorded | 1.2 | 1.0 | 0.8 | 1.0 | 0.5 | 0.7 | 0.6 | 0.7 | 0.4 | 0.6 | 0.5 | 0.5 | 0.4 | 0 |
| ARAM | 1.4 | 1.0 | 0.6 | 1.5 | 0.9 | 0 | 0.4 | 0 | 0 | 0.2 | 0.4 | 0.7 | 0.7 | 0 |

- **Supports and tanks can earn excellent ratings:** a support is judged on kill participation,
  vision, wards, crowd control and protecting teammates, and barely on CS and gold; a top laner's
  damage taken and mitigated counts as much as their damage dealt.
- **High-kill carries are not rewarded by default:** kills count only through kill participation and
  the KDA, both against deaths, which weigh twice (KDA and deaths).
- **Game modes.** ARAM (queues 450, 720, 2400 and the older 100) has no lanes, farm or vision in its
  weights, and its timeline steps three minutes. Every other mode is read as Summoner's Rift. A
  player whose position is not recorded (an older record, a mode without positions) gets the
  role-neutral row, and the panel says so ("Position not recorded"). Arena and other modes without
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

A 30-minute ranked game built from each role's typical figures, the same on both sides (blue won),
then one or two players changed (`performance-score.test.ts`, `TYPICAL`):

| Game | Player | Figures | Score | Rank |
| --- | --- | --- | --- | --- |
| Typical | each role, blue (won) | the role's typical figures | 5.3 (top) to 6.3 (bottom, support) | |
| | each role, red (lost) | the same | 4.5 (top) to 5.6 (bottom, support) | |
| Strong support vs mediocre carry | blue support | 2/3/22, 95 vision, 40 wards placed and 10 cleared, 55 s crowd control, 6k healing and shielding, 35 CS | **9.1** | 1st, MVP |
| | red bottom | 11/7/3, a carry's usual damage, 14.5k gold | **4.3** | 9th |
| Feeding carry | blue mid | 8/13/3, behind on farm and damage | **2.5** | 10th |
| Weak winner vs strong loser | blue top (won) | 1/7/2, behind on everything | **2.3** | 10th |
| | red top (lost) | 8/2/5, ahead on everything | **7.8** | 1st, ACE |
| Tank | blue top | 3/5/11, 15k damage, 48k taken and 45k mitigated, 50 s crowd control | **7.2** | 1st, MVP |

Fairness, as tested: a strong support game scores at least as well as a mediocre high-kill carry
(9.1 against 4.3) and can be the MVP; a feeding carry with kills scores poorly (2.5, 10th); a win
does not lift a weak game above a strong losing game (2.3 against 7.8); a typical game in any role
is within 0.75 of its team's mean; and the result alone moves a score by at most a point.

A property of the role-relative half to know: a player with typical figures whose lane opponent had
an outstanding game is marked down (the red top in the tank example scores 3.2), because 60% of each
of their components is the comparison with that opponent. That is the model's intent (the lane was
lost to that opponent) and its limit (their figures alone were ordinary).

## The score through the game

Where the game's timeline is stored, a point every **five minutes** on Summoner's Rift and every
**three** on ARAM (`timelineStep`), each scored by the same function from what the timeline had
recorded **by then**, never from final figures:

- kills, deaths and assists by that moment (from each player's kill times), and each team's kills by
  then, for kill participation, the KDA and deaths per ten minutes; left out of every moment when any
  scored player's kill times are not kept (a timeline stored before 29 Oct 2026) or a player was
  removed (their kills are not kept, so a team's would be short);
- CS and gold at that moment, read between the frames (gold as a share of the team's at that moment);
- the lane: gold plus experience ahead of the lane opponent at that moment before 10:00, the 10:00
  figure until 15:00, then the mean of 10:00 and 15:00 (the final score's own lane figure);
- **not** damage, damage taken, vision, wards, crowd control, healing, objective damage or turrets:
  Riot gives those only for the whole game, so the moments before the end are scored on the rest;
- no result step before the end (the result was not known yet).

The **last point is the game's end and is the final score itself**, read from the whole record (it
carries the components the earlier points cannot): the chart joins it to the point before with a
dotted line for that reason. A game without a stored timeline, or whose timeline contradicts its
record (`goldContradictsRecord`), or whose frames have a gap, shows its final scores and says the
score through the game is not available.

**The trend word** (`trendOf`, `TREND_RULES`, `TREND_SENTENCES`): one word and its sentence, from
the points before the end only (the final point reads more figures) and only with three or more,
the first and last thirds being the first and last ceil(n ÷ 3) points. The first rule that holds,
in this order, names it; none may hold, and then nothing is shown.

| Word | Rule | Sentence |
| --- | --- | --- |
| Dominant | every point 6.5 or more | Ahead of the game's average at every point of the timeline. |
| Struggling | every point 3.5 or less | Behind the game's average at every point of the timeline. |
| Resilient | the first third's mean 4 or less, and the final score 5.5 or more | Recovered from a weak start to finish above the game's average. |
| Rising | the last third's mean 1.5 or more above the first third's | Grew stronger as the game went on. |
| Fading | the last third's mean 1.5 or more below the first third's | Started stronger than they finished. |
| Fast start | the first third's mean 6.5 or more | Started the game ahead of the others. |
| Erratic | the highest and lowest points 4 or more apart | Swung between strong and weak stretches. |
| Steady | the highest and lowest points 1.5 or less apart | Held much the same level throughout. |

**Excellent** (`EXCELLENT_AT`): a score of 8.0 or more is called "Excellent" beside it; no other band
is named. **Each team's mean** (`teamAverages`): the mean of its scored players' scores, shown on one
split bar, the winning team first.

## Limitations

- One game's ten players are a small sample: a game where everyone did much the same spreads small
  differences over the scale (the z-scores divide by a small spread), and the clamp is what keeps
  that in bounds.
- Figures that are not stored are not scored: per-player objective participation (dragons, Barons,
  Heralds), first blood beyond its count, the timing of wards and damage.
- Positions are Riot's (team position, else individual position, else the merged one on older
  records); a swapped lane (a duo that traded lanes) is scored by Riot's reading.
- The weights are a considered first version, chosen so that a typical game in each role scores
  near 5 and the fairness rules above hold; they are not fitted to data UNIIVERSE does not have. A
  revision is a new version, recorded here.

## Versions

- **v1** (23 Nov 2026, Release 16): the model above.
