# Match notes: what a game's post-game view says

The post-game view (`src/components/match-history/post-game.tsx`) answers three questions about one
game in a few short sentences: **Went well**, **Went wrong** and **Focus next**. Every sentence comes
from a written rule in `src/domain/match-notes.ts`, with its thresholds as named constants and its
tests in `src/domain/match-notes.test.ts`. This table is the source of truth: a rule changes here and
in the code together.

## The hard rules

1. Every note is a fact with its numbers and its comparison base: the lane opponent, the player's
   team, or "your last N ranked Top games".
2. No cause or verdict words. The test rejects: because, due to, caused, led to, thanks to, cost,
   should have, mistake, good, bad, great, poor, terrible, feed, fed, int, carry, throw, threw (and
   "laning phase").
3. At most 20 words a sentence.
4. Champions are named, never other players.
5. A rule whose data is missing says nothing: no guess, nothing read into final items.
6. The checkpoints are times ("at 10 minutes"); no phase of the game is named.
7. Remakes (under 5 minutes) are never analysed.
8. **Worded for the viewer.** On the viewer's own game: "you" and "your". On a teammate's game: the
   champion's name and "their" ("2 of Gwen's 5 deaths came before 10 minutes", "Their team won from
   3,400 gold behind"), never the player's name.
9. **Focus next only on the viewer's own game.** On a teammate's game it would be one member coaching
   another unasked (OD20).
10. The game's result does not bias the choice: a Defeat can have Went well notes and a Victory Went
    wrong ones.

## Inputs

- The stored record (always).
- The match timeline (when stored; asked for as the game opens, about 10–20 KB from storage; Riot is
  asked at most once per game, ever).
- The player's own baseline: earlier games in the same role and queue group, at most 50, newest
  first (`personalComparison`). A figure is compared once 10 earlier games carry it; "highest" needs
  20. Kill participation joins the baseline from the ledger's team kills (D-3; the card's standout
  keeps its four figures).
- Ranked games are compared with ranked games, normal with normal, Swiftplay and Quickplay together.

## The rules

| ID | Section | Data | Fires when | Wording (own game) | Topic |
|---|---|---|---|---|---|
| L1 | Well | Timeline, the one lane opponent | CS at 10:00 ≥ +10, or gold ≥ +500 (only what fires is said; a support's CS never) | "You had 47 more CS than Garen at 10 minutes (71 to 24)." | lane |
| L2 | Wrong | same | CS ≤ −10, or gold ≤ −500 | "You had 12 fewer CS and 800 less gold than Garen at 10 minutes." | lane |
| L3 | Well | Timeline at 10:00 and 15:00 | gold(15) − gold(10) ≥ +500 and gold(15) > 0 | "Your gold lead over Garen grew from 200 to 900 between 10 and 15 minutes." | lane-swing |
| L4 | Wrong | same | gold(10) ≥ +300 and gold(15) − gold(10) ≤ −500 | "Your gold lead over Garen fell from 900 to 200 between 10 and 15 minutes." | lane-swing |
| L5 | Well / Wrong | Timeline, all four bot-lane seats clear; ADC or Support | the pair's gold at 10:00 ≥ +800 / ≤ −800 | "You and Jinx had 1,200 less gold than Caitlyn and Lux at 10 minutes." | lane |
| D1 | Wrong | Timeline death times | deaths before 10:00 ≥ 2 | "2 of your 5 deaths came before 10 minutes." | deaths |
| D2 | Wrong | Record | deaths ≥ 7 and the most on the team, with every teammate's record stored (none erased: an erased seat's deaths are not kept, so "the most" could not be backed) | "9 deaths, the most on your team." | deaths |
| D3 | Well | Record | deaths ≤ 2 in a game of 25 minutes or more | "Only 1 death in 28 minutes." | deaths |
| P1 | Well | Baseline of 20 or more | higher than every earlier game | "Your highest Damage/min in your last 24 ranked Top games (900)." | the figure's |
| P2 | Well | Baseline of 10 or more | percentile ≥ 0.8 | "KDA higher than in 21 of your last 24 ranked Top games (4.50; usually 3.10)." | the figure's |
| P3 | Wrong | Baseline of 10 or more | percentile ≤ 0.2 | "Vision/min lower than in 23 of your last 24 ranked Top games (0.63; usually 0.89)." | the figure's |
| K1 | Well / Wrong | Baseline kill participation | percentile ≥ 0.8 / ≤ 0.2 | "Kill participation lower than in 22 of your last 24 ranked Top games (31%; usually 52%)." | teamplay |
| T1 | Well | Record, not a support | damage share ≥ 25% and the most on the team | "The most damage to champions on your team (34% of it)." | damage |
| T2 | Well | Record | the highest vision score of all ten | "The highest vision score in the game (60)." | vision |
| T3 | Well | Record (turret takedowns, team towers) | takedowns ≥ 3 and ≥ 40% of the team's towers | "You took part in 4 of your team's 6 towers." | objectives |
| V1 | Wrong | Record (control wards bought) | none bought in a game of 20 minutes or more (stronger for Support and Jungle) | "No control wards bought." | vision |
| S1 | Well | Record (solo kills) | ≥ 2 | "3 solo kills." | highlight |
| M1 | Well | Record (largest multikill) | ≥ 3 (lowest priority unless a quadra or penta) | "A triple kill." | highlight |
| G1 | Well | Timeline gold curve, all ten players, not contradicting the record | won after a team deficit ≤ −3,000 | "Your team won from 3,400 gold behind (at 18:20)." | team |
| G2 | Wrong | same | lost after a team lead ≥ +3,000 | "Your team lost after leading by 3,100 gold (at 12:00)." | team |
| J1 | Well / Wrong | Timeline objectives; Jungle | before 15:00, at least 3 dragons, voidgrubs and heralds in all, the team taking ≥ 75% / ≤ 25% | "Before 15 minutes your team took 4 of the 5 dragons, voidgrubs and heralds." | objectives |

## Selection

- Every firing note has a strength: how far past its threshold, normalised to 0–1.
- At most **2 Went well** and **2 Went wrong**, with distinct topics inside a section. The player's
  own notes come before team notes (G1, G2) and highlights (S1, M1).
- Then **1 Focus next**, on the viewer's own game only: from the strongest Went wrong note with a
  focus, else the lowest baseline figure at or below the 35th percentile, else none.

## Focus next

| From | Wording |
|---|---|
| L2, L5 | "The first 10 minutes against Garen: 59 CS and −640 gold at 10:00." (L5: "The first 10 minutes in the bot lane: −1,200 gold for the pair at 10:00.") |
| L4 | "Between 10 and 15 minutes against Darius: from +700 to −600 gold." (the five minutes the lead fell in, never the first 10, which the same view may list under Went well) |
| D1 | "Staying alive before 10 minutes: 3 deaths before 10:00 this game." |
| D2, P3 on KDA | "Deaths: 9 this game, the most on your team." / "Deaths: 7 this game; KDA 1.00 against a usual 3.00." |
| P3 on vision, V1 | "Vision: your usual is 0.89 per minute; a control ward on each recall is the simplest start." |
| P3 on CS | "CS: 5.1 per minute this game; 6.8 usually." |
| P3 on damage | "Damage: 480 per minute this game; 650 usually." |
| K1 | "Joining fights: 31% kill participation this game; 52% usually." |

## Fallbacks (always one honest line, never an empty box)

- No baseline yet: "After 10 ranked games as Top, a game is compared with your usual ones." The lane
  and in-game notes still show.
- Nothing fired: "Nothing stood out against your usual Top games."
- No timeline: the lane, death-time, gold-curve and jungle rules are skipped, and the view says once,
  in place of its folds: "Timeline not available for this game".
- A support: CS rules never fire; kill participation, vision and deaths carry more weight.
- A remake: "Remakes are not analysed."
