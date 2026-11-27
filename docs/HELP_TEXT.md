# Help text: the tooltip inventory, verdict by verdict

The overhaul's stage-0 inventory (`docs/overhaul/tooltips.json` on the `overhaul/plan` branch, 19 Nov 2026) listed 196 help texts: 86 kept as they were, and 110 to rewrite (77), remove (19) or replace with a better label (14). This page records where each of the 110 was applied. The rules they follow are in STANDARDS ("Tooltips") and DESIGN_SYSTEM §7 ("Explain"); the checks that keep them are `src/components/ui/tip-length.test.ts` (length, jargon, each LP state) and `src/components/ui/title-use.test.ts` (no explanation in a `title`; Admin Mode included since S9c).

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
| I12 | rewrite | S8b (this branch): "Riot adds “…”" (one lead that reads right for a form, a condition or a recipient) |
| S08 | remove | S8b (this branch) |
| S09 | rewrite | S4b |
| S10 | rewrite | S8b (this branch) |
| S12 | rewrite | S8b (this branch) (with TD9) |
| S15 | rewrite | S4b |
| S16 | rewrite | S8b (this branch) |
| A01 | rewrite | S9a/S9c: the people list's rows were rebuilt (Release 6); the "No account" tip is gone; its words, as proposed, are the "Profiles without an account" group's description |
| A02 | improve-label | S9a/S9c: the reason is visible text beside the disabled Manage access (`access-locked-reason`); no title |
| A03 | rewrite | S9a/S9c: the name link is gone; the person view's "Open their profile in Player Mode" is visible text |
| A05 | remove | S9a/S9c: removed with the rebuilt list |
| A07 | rewrite | S9c: visible text beside the badge, "Made with an older security key, so it can no longer be applied."; no title |
| A09 | rewrite | S9c: applied as proposed (label "About these states") |
| A10 | rewrite | S9c: the badge says it, "database answers in 12 ms"; no title (and pool max lost its title) |
| A11 | rewrite | S9c: `RelativeTime` (its title is the date and time in words, formatDateTime) |
| A12 | rewrite | S9c: Page speed is in words first ("Main content showed", "Taps and clicks answered", "The page stayed still"); the technical table names each measure in full, "Largest Contentful Paint (LCP)"; no abbr title |
| A13 | rewrite | S9c: "Reset to default" |
| A14 | improve-label | S9c: the button says "Rotate", its state in aria-pressed; no title |
| D01 | rewrite | S8b (this branch) |
| D02 | rewrite | S8b (this branch) |
| D03 | rewrite | S8b (this branch) |
| D04 | rewrite | S8b (this branch) |
| D05 | rewrite | S8b (this branch) |
| D06 | rewrite | S8b (this branch) |
| D07 | rewrite | S8b (this branch) (the figures say what they are on screen; no titles) |
| D08 | rewrite | S8b (this branch) |

The kept items (86) are unchanged, except D09's words "Primary role" → "Main role" on the pool's role icon.

## 27 Nov 2026: Matchup Intel's band (Release 19)

Every ⓘ and fixed sentence of the band is in `src/domain/matchup/words.ts`, each ⓘ one or two
sentences of at most 25 words, none with a refused word or "you" (`src/domain/matchup/words.test.ts`
counts them as `tip-length.test.ts` does; `refused-words.ts` holds both lists).

| Where | Words |
|---|---|
| Reviewed notes ⓘ (`NOTES_TIP`) | "Written and checked by a team administrator from the sources shown. Observations about the two kits, not advice." |
| In the team's matches ⓘ (`TEAM_TIP`) | "Counted in the team's stored matches, both teams, with a timeline to 10:00. Not a global sample; high-elo games are not collected." |
| From Riot's data ⓘ (`RIOT_TIP`) | "Riot's level 1 numbers side by side, the same quantity only. Riot's data cannot show every balance change; cooldowns are in the rows below." |
| Under 10 games (`FEW_TIP`) | "A few games can lean either way by chance, so figures show from 10 games with a timeline." |
| A share's range (`shareTip`) | "The likely range of the share over many more such games (95%)." then "A range that includes 50% shows no difference beyond chance." or, where it does, "It includes 50%: these games don't show a difference beyond chance." |
| The sample (`sampleTip`) | the window ("Only games since Riot's latest change to Darius, on 26.22." / "Riot changed Darius on 26.22: 9 of these games came before it." / "Riot's data before 26.22 was not compared."), then "3 on patch 26.23; 2 more without a timeline." |
| The medians (`medianTip`) | "Riven's figures minus Darius's in the middle game. The middle half ran from −220 to +540 gold." |
| Kills (`killsTip`) | "Riven took a kill on Darius in 4 and Darius on Riven in 5 of the 12 games with kill times." |
| States | "No Ranked Solo/Duo games of Riven vs Darius in Top in the team's matches yet." · "4 games in the team's matches (Ranked Solo/Duo, Season 2026). Figures show from 10." · "Lane figures can't be loaded right now." · "A champion is picked only once in a draft game, so no game has this pair." · "No reviewed notes for Riven vs Darius in Top yet." · "Reviewed on 26.21 · not re-checked for 26.23" · "A reviewed note is hidden: Riot's data for Darius changed after its review on 26.23." · "A reviewed note is hidden: its last review (26.19) is 4 patches old." |

## 25 Nov 2026: one concept a tip (the owner's readability request)

The owner asked for concise InfoTips: one concept each, plain language a newcomer understands, one or two short sentences, no needless maths or jargon, the essential information visible without the tip, and a shared popover (`src/components/ui/breakdown-popover.tsx`, the Leaderboards lane's) for a detailed breakdown rather than a giant bubble. The typography lane rewrote the tips in its files; the others are their lanes' (listed at the end). The tip's bubble is the body size since this release (14px; 12px before).

| Where | Before | Now | Left out, and where it is |
|---|---|---|---|
| Recent form's ⓘ (`RECENT_FORM_HELP`, O06) | "The latest 20 games against all in this filter. Trends and arrows need 10+ older games too and a clear gap: 8+ win-rate points, 15% KDA or vision, 0.5 CS/min." (31 words, four thresholds) | "The latest 20 games compared with every game in these filters. Arrows show only when there are enough older games and the difference is clear." (25) | the thresholds, which stay in `src/domain/recent-form.ts` (`FORM_MIN_RECENT` 10 older games; `FORM_GAP` 8 win-rate points; `FORM_METRIC_GAP` 15% for KDA and vision, 0.5 CS/min) and here |
| Ranked progress, the rank's ⓘ (`RankDetails`, P05) | the account, season and first check; "The record is Riot's count for the ranked year."; the highest recorded; the 30-day change's path (38 words, three concepts) | the account, season and first check; the highest recorded (about 20 words, `ranked-progress.test.ts` counts it rendered) | the ranked year: the record line says "· 2026" at every width, "(Riot)" too from a 21rem card (read out on a phone's, where it would take the record to a second line beside the 30-day change; 25 Nov 2026 review); the path (the change beside the rank says it) |
| Settings → Riot API, the credential's ⓘ (A09) | "Accepted: Riot is answering. Rejected: the API key is wrong or expired (development keys last 24 hours). Unavailable: Riot is busy or down." (a legend of three states) | what the state shown means, e.g. "Riot refused the key: it is wrong or has expired. Development keys last 24 hours." (`STATE[…].means`); only for administrators, whose badge names the credential's state | the other states' meanings; a member reads the state's plain sentence in the panel, which never needed the tip |
| Recent games (metric, G-series) | "…from each patch, queue and role they played it in during the last 30 days, counted whole." | "Games on this champion from each patch, queue and role they played it in during the last 30 days, so some can be older." (24) | "counted whole" (jargon), said in plain words: a group last played in the 30 days counts with its older games, so the figure is never read as games of the last 30 days alone (R7 review C3; `metrics.test.ts` holds it) |
| Games on record (metric) | "Every stored game from all their Riot accounts (this season's, and older ones still kept); each game counts once." | "Every stored game from all their Riot accounts, each counted once." | the parenthesis |
| Mastery (metric) | "Riot's mastery points on this champion, added up over their Riot accounts: long-term play, not current form." | "Riot's mastery points on this champion across their accounts: long-term play, not current form." | none |
| Settings → Social links (visible help, `SOCIAL_LINKS_HELP`) | 44 words: who sees a public link, what each service opens, nothing connected | "Optional. Each link stays private until you switch on Show publicly, then it shows on your card and the public team page. Nothing is connected or embedded." (27) | what each service opens: its field's placeholder says it (youtube.com/@yourname, twitch.tv/yourname, your Discord username) |

`tip-length.test.ts` now also counts a state's `means` and `SOCIAL_LINKS_HELP`. Moved to the shared breakdown popover once it was in the tree (the release's review): the data status's ⓘ (`ui/data-status.tsx`: the state as the heading, each part with its why, the times, a Refresh's progress; a press opens it, beside the ⓘ or as a phone's sheet) and the experience label's why in Riot data (`TierWhy` in `team/player-data-panel.tsx`: the tier's rule, then up to five notes, 58 words in one bubble before; `player-data-panel.test.ts` holds every tip left in the panel to 25 words). Still a candidate: Riot Accounts' explanation of how linked accounts count.

Left to the lanes that own the files (reported to the coordinator): Match History's summary ⓘ (`history-summary.tsx`, 42 words rendered: the window, KP and the LP's source), Encounters' `ENCOUNTERS_CAVEAT` and `refineUnavailable` ("Refine narrows the games list. Encounters uses only the season and game mode."), the playing sessions tip (`history-refine-fields.tsx`), the performance score's `METHOD` tips, the build path's legend, and Team Matches' `TOGETHER_CAVEAT`, which hard-codes "from Season 2026" (`app/(app)/matches/page.tsx`): wrong from 2027, the scope line already names the season.
