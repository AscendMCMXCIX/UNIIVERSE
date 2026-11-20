# Help text: the tooltip inventory, verdict by verdict

The overhaul's stage-0 inventory (`docs/overhaul/tooltips.json` on the `overhaul/plan` branch, 19 Nov 2026) listed 196 help texts: 86 kept as they were, and 110 to rewrite (77), remove (19) or replace with a better label (14). This page records where each of the 110 was applied. The rules they follow are in STANDARDS ("Tooltips") and DESIGN_SYSTEM §7 ("Explain"); the checks that keep them are `src/components/ui/tip-length.test.ts` (length, jargon, each LP state) and `src/components/ui/title-use.test.ts` (no explanation in a `title`).

| Id | Verdict | Where |
|---|---|---|
| G01 | rewrite | S4b |
| G02 | rewrite | S8b (this branch) |
| G03 | remove | S8b (this branch): the 5 keys no page reads deleted (the sixth, Last sync, is shown) |
| G05 | rewrite | S8b (this branch) |
| G07 | rewrite | S8b (this branch) |
| G14 | improve-label | S8b (this branch) |
| G15 | improve-label | S4b |
| T01 | rewrite | S4b |
| T02 | rewrite | S4b |
| T03 | improve-label | S8b (this branch): the first two reasons on the line, the rest for screen readers; "main role" |
| T05 | rewrite | S8b (this branch) |
| T08 | rewrite | S8b (this branch) (words for screen readers) |
| T09 | remove | S8b (this branch) |
| T10 | rewrite | S8b (this branch) (title removed: "CS/min" says it) |
| T11 | rewrite | S8b (this branch) (the note read out beside the counted games, no title) |
| T13 | improve-label | S3/S4b |
| T14 | rewrite | S4b |
| T15 | remove | S8b (this branch) |
| T16 | rewrite | S8b (this branch) (the value whole only, as a cut rank) |
| T17 | remove | S8b (this branch) |
| T18 | remove | S8b (this branch) |
| P02 | rewrite | S8b (this branch) (a tip on the badge) |
| P04 | improve-label | S8b (this branch) |
| P05 | rewrite | S8b (this branch) (the date for screen readers; Ranked progress shows the checks) |
| P09 | rewrite | S8b (this branch) |
| O01 | rewrite | S8b (this branch) |
| O02 | remove | S8b (this branch) |
| O03 | remove | S8b (this branch) |
| O04 | rewrite | S8b (this branch) |
| O06 | rewrite | S8b (this branch): rewritten to what recentForm() does (the latest 20; 10+ older games; each figure's gap) |
| O07 | rewrite | S8b (this branch) |
| O10 | rewrite | S4b |
| O12 | remove | S8b (this branch) |
| O15 | rewrite | S8b (this branch) (with TD14) |
| C01 | remove | S8b (this branch) |
| C02 | rewrite | S8b (this branch) (column titles removed; the cells read out) |
| C03 | rewrite | S8b (this branch) (as C02) |
| C04 | remove | S8b (this branch) |
| C05 | rewrite | S8b (this branch) (as C02; "their", S4b) |
| C06 | remove | S8b (this branch) |
| C07 | rewrite | S8b (this branch) (for screen readers) |
| C09 | rewrite | S8b (this branch) |
| C12 | rewrite | S8b (this branch) |
| C13 | rewrite | S4b |
| C14 | rewrite | S8b (this branch) |
| C16 | rewrite | S5 (the text is gone) |
| C17 | improve-label | S5 (the label is gone) |
| C18 | rewrite | S8b (this branch) (the arrow keys kept) |
| H01 | rewrite | S4b |
| H06 | rewrite | S8b (this branch) (KP said in the summary's ⓘ) |
| H08 | rewrite | S8b (this branch) (in the summary's ⓘ) |
| H09 | rewrite | S8b (this branch) |
| H10 | rewrite | S8b (this branch): each state rewritten and tested alone; the two checks' times kept |
| H12 | rewrite | S8b (this branch) (the Best chip opens its sentence as a tip) |
| H18 | rewrite | S4b/S6 |
| H19 | rewrite | S4b/S6 |
| H22 | rewrite | S4b, title removed here |
| H23 | improve-label | S8b (this branch) ("Lane" kept on screen, "opponent" read out: the row has no room) |
| H26 | rewrite | S6 (panel removed) |
| H27 | rewrite | S6 (panel removed) |
| H28 | remove | S6 (panel removed) |
| H29 | remove | S6 (panel removed) |
| H32 | rewrite | S4b/S6 |
| H33 | rewrite | S4b/S6 |
| H36 | remove | S8b (this branch) |
| E01 | rewrite | S4b |
| E02 | remove | S4b |
| E03 | rewrite | S8b (this branch) |
| M01 | rewrite | S4b |
| M02 | rewrite | S4b |
| M03 | remove | S8b (this branch) |
| M04 | rewrite | S8b (this branch) |
| M06 | improve-label | kept as a value shown whole: the CS and damage show on wide rows; the title carries them where the narrow row leaves them out |
| L01 | rewrite | S4b |
| L03 | rewrite | kept as names: the gap token and the role badge in words (Leaderboards' layout is S8a's) |
| L04 | remove | S4b |
| L06 | rewrite | S8b (this branch) |
| L07 | improve-label | not changed: Leaderboards' later design keeps the thresholds behind the ⓘ (records.test.ts pins it) |
| L08 | rewrite | S8b (this branch) |
| I01 | rewrite | S7a |
| I04 | improve-label | S8b (this branch) (badge kept, its meaning a tip) |
| I05 | improve-label | S0b |
| I06 | improve-label | S7a (the label is gone) |
| I07 | rewrite | S8b (this branch) |
| I12 | rewrite | S8b (this branch): "Only with “…”" (reads right for a form and for a condition) |
| S08 | remove | S8b (this branch) |
| S09 | rewrite | S4b |
| S10 | rewrite | S8b (this branch) |
| S12 | rewrite | S8b (this branch) (with TD9) |
| S15 | rewrite | S4b |
| S16 | rewrite | S8b (this branch) |
| A01 | rewrite | S9c (Admin Mode's text is the administration lane's) |
| A02 | improve-label | S9c (Admin Mode's text is the administration lane's) |
| A03 | rewrite | S9c (Admin Mode's text is the administration lane's) |
| A05 | remove | S9c (Admin Mode's text is the administration lane's) |
| A07 | rewrite | S9c (Admin Mode's text is the administration lane's) |
| A09 | rewrite | S9c (Admin Mode's text is the administration lane's) |
| A10 | rewrite | S9c (Admin Mode's text is the administration lane's) |
| A11 | rewrite | S9c (Admin Mode's text is the administration lane's) |
| A12 | rewrite | S9c (Admin Mode's text is the administration lane's) |
| A13 | rewrite | S9c (Admin Mode's text is the administration lane's) |
| A14 | improve-label | S9c (Admin Mode's text is the administration lane's) |
| D01 | rewrite | S8b (this branch) |
| D02 | rewrite | S8b (this branch) |
| D03 | rewrite | S8b (this branch) |
| D04 | rewrite | S8b (this branch) |
| D05 | rewrite | S8b (this branch) |
| D06 | rewrite | S8b (this branch) |
| D07 | rewrite | S8b (this branch) (the figures say what they are on screen; no titles) |
| D08 | rewrite | S8b (this branch) |

The kept items (86) are unchanged, except D09's words "Primary role" → "Main role" on the pool's role icon.
