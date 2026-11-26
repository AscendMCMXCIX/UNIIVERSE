# Performance score (v3)

How the post-game view scores each of a game's players, 0 to 10, ranks all ten and names an MVP
and an ACE (Release 16, at the owner's request of 23 Nov 2026). The model is UNIIVERSE's own:
it borrows the experience of a 0–10 match rating, never another site's brand or numbers, and it is
never presented as anyone else's rating. Its one (i) says so in words ("UNIIVERSE's own score, not
OP.GG's"), at the owner's request of 25 Nov 2026 to distinguish it clearly from OP.GG's proprietary
score; the view never calls it an "OP Score". Its code is `src/domain/performance-score.ts`
(pure and deterministic); its tests, with the worked examples below, are
`src/domain/performance-score.test.ts`; the post-game view and Match History's cards read it through
`src/domain/performance-inputs.ts` (moved there from `src/components/match-history/` in Release 17,
which re-exports it).

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
highest score (and the MVP then 2nd); a game without a winner (a remake) has neither. Verified on 25
Nov 2026 (the owner's requirements, §1): `scoreMatch` reads each player's team result from the
record (`recordTeamsOf`: the team's own `win`), so every player of a side has the same result; the
tests assert MVP = the winning side's top score and ACE = the losing side's on a set of 60 varied
games, the ACE first overall, and no winner (`src/domain/performance-score.test.ts`, "MVP and ACE"),
and the Production check asserts the MVP's row is on the team that won and the ACE's on the team
that lost, and that a card's or a Team Matches member's MVP is on a won game and ACE on a lost one.

**How a place shows** (25 Nov 2026): one badge across the site, `PlacementBadge`
(`src/components/ui/placement-badge.tsx`): **MVP** in the fixed gold (`--color-gold`, a rarity colour
Branding never changes) on a gold wash with a gold ring, **ACE** the same in the fixed violet
(`--color-violet`), any other place ("2nd" … "10th") restrained, the secondary text on a faint
neutral wash. MVP and ACE replace the ordinal; the ordinal stays in its words ("MVP: highest score on
the winning team, 1st of 10"). One shape at every size (a pill, the same height and minimum width
whatever it says). **Why** names at most two components that lifted the score most and the one that held
it back most, each only beyond ±0.35 (its share of the weighted mean, in words: "Stood out: strong
vision, high kill participation. Held back by many deaths.").

## Where it shows

- **The opened game** (Release 16): every player's score over their place badge on the scoreboard,
  and the inspected player's score with its badge, "3rd of 10" and the (i). Computed in the browser
  from the two answers the game has loaded: `finalScoresOf(getMatchDetail's view, getMatchTimeline's
  view)`. The open card's folded header shows its card's score and badge, so the game says its score
  before the view below has loaded.
- **The collapsed Match History card** (Release 17; given a place of its own at the owner's request
  of 25 Nov 2026, §1, with OP.GG's hierarchy as the reference: the result, the champion, the K/D/A,
  then the score and its place): `ScoreMark` (`src/components/match-history/score-mark.tsx`), the
  score bold in the primary colour with the place badge. On a wide card (lists from 50rem) it has a
  column of its own (2.5rem) right after the K/D/A, the score (`text-xl`, the card's largest figure)
  over the badge, centred, at one x on every card of the list; on a phone's and a two-row card
  (under 50rem) it is a line of its own directly under the K/D/A and its ratio, the score
  (`text-md`) beside the badge. A card without a score keeps the place with a quiet dash
  (`match-score-empty`, hidden from screen readers), so nothing moves from card to card. Its words
  for a screen reader, and in the card's label, are "Performance score 3.5, 9th of 10, MVP".
  Encounters' list of one player's games (`?met=`) is Match History's list and has the same cards.
- **Team → Matches** (25 Nov 2026): each member's score and badge on their row, the same as their own
  card and the opened game: stacked at the row's end where the row shows the CS and damage (a
  tablet, one to a row), else at the end of the role's line (a phone, two to a row beside the open
  sidebar). Each shown game is scored once on the server (`src/server/matches/together-scores.ts`,
  `togetherScores`) through the card's own functions (`gameScores`, below), from the record trimmed in
  the database to the score's figures (`loadScoreSources`) and the same trimmed lane timelines; a
  member is found in the record by their linked accounts' PUUIDs on the listed side (else by side and
  champion when one player matches), never guessed. The timeline's gold check is read from every
  player's side at once (it is symmetric), so a game listed for both sides gets the opened game's
  answer whichever side comes first. Each instance keeps a finished game's scores for 15 minutes, so
  "Show more" reads only its new games (docs/PLAYED_TOGETHER.md, "Scores").

### One calculation, never the card's own

The card's score is the opened game's, computed on the server when the list is read, through the
same functions (`src/server/players/match-history.ts`, `cardPerformance`, which reads one player's
place from `gameScores`, the game's scores for everyone; Team → Matches reads every member's from
the same `gameScores`):

- the record is mapped by `recordTeamsOf` and `scoreFiguresOf`, which `getMatchDetail` uses for the
  scoreboard (the players' figures, places, positions, lane opponents, team kills and results, the
  profile's team first);
- the timeline by `framesGoldOf` and `framesBySeat` (`src/server/accounts/match-timeline.ts`), which
  `getMatchTimeline` uses for every player's frames and lane, including the check that drops a
  timeline contradicting its record (`goldContradictsRecord`); `scoreTimelineOf` gives what the final
  score reads of them;
- and both are scored by `finalScoresOf` (`src/domain/performance-inputs.ts`), which the opened game
  calls in the browser too.

The timeline's only part in the final score is the lane (gold and experience against the lane
opponent at 10:00 and 15:00). So the list reads only that, for the page's Summoner's Rift games with
a lane opponent: one query, trimmed in the database to the frames' times and each player's gold and
experience by place in the record (no PUUID, CS, positions, purchases or events;
`loadScoreTimelines`). An ARAM game, or a game without a lane opponent, reads no timeline (Match
History lists Summoner's Rift queues only). `tests/db/card-score.test.ts` compares every card with
the opened game on stored games of every kind below and on every first-page card of the demo's
players; `e2e/match-score.spec.ts` opens each game of the first page and compares its scoreboard
row with the card.

### When the card shows no score

- **The timeline is not stored yet** (a Summoner's Rift game with a lane opponent, and Riot access
  configured): opening the game fetches the timeline from Riot first and its score includes the lane,
  which the card cannot know. The card shows nothing rather than a score without the lane, and its
  label says "performance score once the game's timeline is stored". The hourly timeline backfill
  stores the linked players' lane games' timelines (newest first), and opening the game stores it at
  once, so this is a short wait for a new game. The same holds for a timeline kept before the kills
  and objectives (29 Oct 2026) whose frames are missing: opening it fills them. One kept with its
  frames is final: fetched again, its frames stay as they are (`completedTimeline`).
- **Without Riot access** (the demo, a local build) nothing is ever fetched: the opened game scores
  what is stored, and so does the card.
- **A timeline Riot no longer provides** is final: both score the game without the lane.
- **No stored record, or the card's player removed from it** (personal data erased): no score, as in
  the opened game. A game with another player removed is scored out of nine, as the opened game does.

A card without a score keeps the score's place with a quiet dash (25 Nov 2026: the place is the
same on every card, so a missing score no longer moves the columns or the line under the K/D/A);
the dash is hidden from screen readers, and the card's label says why.

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

## The score through the game (removed)

Removed at the owner's request of 25 Nov 2026 (requirements §1, "Expanded match details"): the
chart under the scoreboard, its heading "Score through the game", its (i), its loading area and its
"timeline not available" line, and every calculation only it used: the score at every five minutes
(three on ARAM) from what had happened by then (`timelineScores`, `timelineStep`), its damping toward
5 (`DAMPING_MINUTES`, `evidenceAt`, `coverageOf`), its early-count priors (`PRIOR_MINUTES`), the wider
early spreads and the absent result step (`ScoreContext.spreadScale` and `outcome`), the trend words
read from it (`trendOf`, `TREND_RULES`, `TREND_SENTENCES`), the opened game's `gameScoresOf`, and the
timeline answer's per-player kill, death and assist times and CS at every frame, which only it read
(`TimelinePlayerView`: the answer is that much smaller). Kept, because other features read them: the
stored timeline data itself (kill times, frames, purchases, skills, events), the lane at 10:00 and
15:00 (`seriesAt`, `laneValue`: the final score's lane component and the Lane table), the trimmed
timelines the cards score from (`loadScoreTimelines`, `scoreTimelineOf`), the build path and the
skill order. **Final scores are unchanged** (still v3): `src/domain/performance-inputs.test.ts` pins
the final scores, places, MVPs and ACEs of four games to the values the code gave before the
removal, and the e2e and DB tests still compare every card with its opened game.

**How the view shows the score** (24 Nov 2026, the owner's brief §3 and §6; the badge of 25 Nov
2026): each scoreboard row ends with the player's score over their place badge; the player inspected
has theirs beside their loadout, the score with its badge over "3rd of 10" and one (i) that says how
it is worked out and whose it is, two short sentences on that one concept ("UNIIVERSE's own score,
not OP.GG's: each figure compared with the role and this game's players. 5 is average."; a player
without a recorded position gets the neutral wording, "the role wasn't recorded, so each figure is
compared with every player's"). What MVP and ACE mean is the badge's own words for screen readers
("MVP: highest score on the winning team, 1st of 10"), not a third sentence in the tip. Removed from the view on 24
Nov 2026, the code kept where it is analytical: the written why (`reasonText`), "Excellent" from 8.0
(`EXCELLENT_AT`), each team's mean on a split bar (`teamAverages`) and the ten score tiles (the
scoreboard already carries each player's score and place). The collapsed card shows the same score
and place (docs/DESIGN_SYSTEM.md).

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
- **v3, 25 Nov 2026** (the owner's requirements, §1): the score through the game and the trend words
  removed with every calculation only they used (above); the final scores unchanged, so the version
  stays v3.
