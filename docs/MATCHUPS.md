# All Champions' preview and Matchups

Profile → **All Champions** lists one row per champion, and a champion opens its **preview**, in the
list's scope (season, game mode, account, role played) and in one of the positions the player
actually played it in (the owner's request of 25 Nov 2026; before it, PLAN S5 and the overhaul audit
CM §4). It shows the player's own results, the same for every viewer who may see the profile; an
opponent's abilities and cooldowns are Champion Intel's (docs/CHAMPION_INTEL.md; Matchup Intel's
until 23 Nov 2026), reached by one link per opponent.

**The rows** (`all-champions.tsx`, `champion-roles.tsx`; `server/players/overview.ts` →
`topChampions`, `ChampionRow`). One row per champion, its figures (games, win rate, KDA, CS/min,
kills, multikills, mastery) over every game it was played in within the filters, all positions
together, so the table's totals are the filters' (a game seen from two linked accounts counts once).
Under the name, the League position icon of **every position Riot recorded** for those games, most
games first (ties: the position played most recently, then the positions' order:
`domain/season-stats` `positionsPlayed`), with no minimum: a single game in a position shows its
icon. Positions are never read from the configured pools or a champion's usual lane, and a game with
no recorded position belongs to no position: it counts in the champion's totals (and the row exists
even when no game records one: "No position"), and the preview says how many there are. "In pool"
follows the icons when the pool of one of the row's positions holds the champion (read out with
those positions). With a mouse each icon is a control: a tooltip on hover and keyboard focus
("Mid · 2 games · 50% win rate · 1W 1L", also its accessible name) and a press that opens the
champion in that position; the champion's own name opens it in its most played position. On a touch
screen a 44px target per icon cannot fit a compact row, so the icons are 14px marks 2px apart there
and the row stays one 44px target, which reads where it was tapped (`roleMarkAt`, the 25 Nov 2026
review): a tap on a mark (its box widened by half the gap on each side, and 6px above and below)
opens the champion in that position, anywhere else on the row its most played position. The marks'
text reads every position's games, win rate and record, and the preview's position choice shows
them on screen, so a tooltip's facts never need a hover. A role filter leaves that position's games alone, so its rows
show that one icon. Each position's own figures are sent with the row only where they differ from
the row's (two or more positions, or a game with none), so a one-position champion's figures go once.

**Where it opens.** On a computer (from 768px wide, in a window taller than 480px, where the
section is at least 47.5rem: a 1024px window with the sidebar folded, 1280px with it open, an
1180px tablet held sideways) the
preview is a **pane beside the list** (the owner's request of 25 Nov 2026: the docked panel of
Release 16 lay over half the table "without purpose"). The list narrows to a column of
`minmax(22.5rem, min(32%, 24rem))` (room for five position buttons and "In pool" on one line beside
the rank, the portrait and the figures: at 20rem, 1366px with the sidebar open, "In pool" took a
second line as the pane opened and every row below moved): each champion's name, position icons and
"In pool", and its win rate over its games, under a heading row of the table's height that sorts by
Champion, Games or Win rate, so no row and no name moves as the preview opens or closes. A list
sorted by a figure it no longer shows (KDA, mastery…) says so once in that heading row ("Sorted by
KDA") and keeps every row's line as it was. The pane takes the rest, and **the page is the one thing
that scrolls** (the 25 Nov 2026 review: no scroll box beside the page's): while the pane fits the
window it is pinned under the profile's section tabs; taller, it scrolls with the page, held between
the tabs and the window's foot (sticky lines and a spacer above it, `usePanePlacement`), so reading
down takes its end into view and scrolling back brings its top back under the tabs, with its header
(portrait, name, ‹ › and a labelled **Close**) pinned under the tabs while it passes. Opened, or
showing another champion, its top is placed under the tabs wherever the list is scrolled. Nothing
covers the list; a click elsewhere on the page
leaves the pane open (it is part of the page, not a layer). Under 768px (the phone's frame, touch or
mouse), in a short window, and where the section is narrower than 46rem (an upright tablet, a large
text size) it is a **sheet** (the phone window shell, `PreviewWindow`) with the same content and ‹ ›,
and the pane's labelled Close (since 25 Nov 2026; a bare ✕ before); Close, Back or a pull down close it. The server knows the address, so a linked preview is beside the
list in the first HTML; CSS keeps that pane from the windows that get the sheet until hydration.
(From S5 to 22 Nov 2026 a panel over the columns after Win rate; from 23 Nov 2026 it unfolded under
its row; from Release 16 to 25 Nov 2026 a panel docked at the window's right edge, over the table.)

**Content, in this order and nothing else** (`champion-preview.tsx`, `champion-matchups.tsx`):

1. **Identity:** the portrait and name (the pane's heading; the sheet's header), "In pool", the
   champion's **mastery, marked "all positions"** (Riot counts mastery per champion, never per
   position), and, for a champion of several positions or with games in none, its games in all.
2. **Position:** every position it was played in, most games first, each with its games, win rate
   and record ("Top 22" over "50% · 11W 11L", the win rate quiet under 5 games; the same words in
   its accessible name), the app's segmented control, 44px on touch. With one position it shows the
   position's name alone: the figures right under it are its record (they sat twice, one above the
   other, until the review of 25 Nov 2026); its accessible name still says the record. A choice switches every figure below and the opponents at once
   (`crole`, replaced; the opened opponent goes with the old position). Where some games record no
   position: "1 more game has no recorded position: it counts in Sion's totals only."
3. **Figures of that position:** its win rate (coloured by `winRateTone` from 5 games) over
   "14 games · 4W 10L", KDA with the average K/D/A, CS/min with CS a game, damage/min with damage a
   game, vision a game ("—" where no game carries one), one line of kills and the four multikills
   ("*" where only some games are counted so far, "not counted yet" where none is), wrapping between
   items only where it must ("0 penta" whole, each "·" ending its line), and what they are
   averaged over ("Averages over all 22 Top games in these filters"). No boxes: labels over figures.
4. **Lane opponents:** ONE table of every lane opponent the champion met in that position, however
   few the games (no folds, no "more" toggles, no Best/Worst tabs): portrait and name, games, W/L,
   win rate; a search by name from four opponents, belonging to the position it was typed in
   (another position's table starts whole, and a table that draws no field is never filtered: a word
   left behind never hides an opponent); three orders, **Most games** (ties: the most
   recent), **Highest win rate** and **Lowest win rate** (`src/domain/champion-preview.ts`):
   - an opponent met fewer than **3** times is a small sample: its win rate in the quiet colour
     (read out "small sample"), and the win-rate orders list it **after** the ranked opponents (3+
     games), past a quiet divider ("Fewer than 3 games: not ranked by win rate"), in the same
     direction, so a 1–0 never tops "Highest win rate" as 100%; ties go to more games, then the most
     recent; the counts are always shown;
   - a win rate is coloured from **5** games (the app's champion rule).
5. **An opponent's detail, without an accordion** (`vs` in the address, replaced): selecting a row
   shows, **beside the table** where the preview is at least 38rem wide (and replaces the detail when
   another row is chosen; the row again or "Clear" puts it back), or as **one step in place of the
   table** in a narrower preview (the sheet; "All opponents" goes back, the focus following, and the
   step's start and then the row it left from are brought into view where they are not): "vs
   Nasus" with its games, W/L and win rate, the KDA over its games with the average K/D/A
   (`pairingKda`, the games with a full record), one sentence only with at least 5 games with a
   timeline ("At 10:00 you had more gold than Nasus in 5 of 6 games with a timeline (+623 on
   average)", "Gwen had" on a teammate's profile: `src/domain/viewer-words.ts`), every game as a
   compact row (W/L, K/D/A, CS, the gold difference at 10:00 or "no timeline", the date), each
   opening the match window; and "Gwen and Nasus in Champion Intel" (`/lookup?champion=Gwen&champion2=Nasus`,
   the two side by side: Matchup Intel's place since 23 Nov 2026; positions are not part of
   Champion Intel).
6. **Foot line:** "Lane opponent: the enemy Riot placed in your position" ("their position" on a
   teammate's), with "Known in N of M games" when some games name none.

Removed with the old champion window (19 Nov 2026): its tabs, the six tiles, the multikill strip,
the lane tables, chart and second checkpoint table, the queue and account split, "How these figures
are made", and the window's own Refine (the page's filters sit beside the preview). Removed on 25
Nov 2026: the four boxed tiles, "Also as Mid" links (one row per champion now), the 3+/1–2 folds,
the first-five toggle, Best/Worst, the opponent accordion, its "Show all games" and the docked panel
over the table. If the lane-by-minute views are missed, they come back in the opponent's detail,
never as a tab.

**Address and history.** One key: `?champion=Gwen&crole=TOP[&vs=Nasus]`. The first open pushes one
history entry; switching champion, position or opponent replaces it; closing goes Back when this
page pushed it. So Back always closes and never walks through champions or positions. Closing
(Close, Escape or Back) leaves the list where the reader is, not where it was when the preview
opened (the owner's request, 25 Nov 2026): the list's own entry restores no scroll while the
preview's entry is on top of it (`history.scrollRestoration` "manual" for that entry alone, the
browser's own again once the preview has closed: `keepListPlace` in preview-data.ts). The address
changes through the History API, never a navigation, so the page does not re-render. A deep link
renders the preview's data in the first HTML; a `crole` the champion was not played in (in these
filters) opens its most played position. A game opened from an opponent's games (the match window
over the preview) adds `&match=` by the same rule, so it has an entry of its own: Back closes the
game and leaves the preview as it was (on a phone the sheet steps aside while the game is open and
comes back), and Back from a page a link in the game opened returns to the game. Old links keep
working: `tab=matchups&vs=X` opens the preview with X open; `/overview/matchups` and
`/players/[id]/matchups` redirect into it (the most played champion when none is named); the
Overview's old `?champ=` key redirects to All Champions. A pool card on the Overview links to All
Champions with that champion's preview open, in the pool's role.

**Keyboard.** A click on a row opens it (focus stays on the row; the preview's champion, position,
games and win rate are announced), Enter opens it and moves focus to the pane's heading; ↑/↓ (or
K/J) on the list move it to the row above or below, in that champion's most played position; ‹ ›
in its header do the same; Escape, Close, Back or the selected row again close it, and focus returns
to the row. Keys inside the preview are its own (its positions, its opponents' search and orders,
their rows, the games). A position icon's tooltip closes on Escape alone.

**Data path** (`src/server/actions/champion-preview.ts`, `src/server/players/champion-preview.ts`):

- The rows' positions and each position's figures come with the page's one read of the stored
  games (`getPlayerOverview`): no query, request or byte from the database was added for them;
  switching position in the preview asks the server only for that position's opponents.
- `getChampionPreviewAction`: the lane opponents' tally in one position from the stored rows
  (`getPlayerMatchups` with `role` and `tallyOnly`), no match record or timeline read. About 0.4 KB
  per answer on the demo.
- `getPairingGamesAction`: one opponent's games, through Matchups' pairing path (only that pair's
  records and timelines).
- Answers are kept per page (switching back asks nothing); pressing a row with a mouse fetches its
  tally ahead.
- The lane opponent is the game's stored one: the fold's strict rule (`laneOpponentOf`: only when
  exactly one enemy held the player's position).

## Comparison with other players (not built)

A "compare with players of my rank" mode was investigated and deliberately **not** built: no
interface for it exists. The reasons, the methodology a future version would need, and the
collection estimates are in `UNIIVERSE_CHAMPION_ANALYSIS_AND_RANK_COMPARISON_REPORT.md`. In short:
- the peer sample (`ranked_matches` / `ranked_participants`, no longer collected since Meta & Trends was removed in Oct 2026) stored champions, positions, result
  and K/D/A only: no gold, experience, CS or timelines, so no like-for-like lane comparison exists;
- a match's `tier_band` is the ladder band of the sampled player whose history produced it, not
  each participant's rank at match time, and there is no Platinum or lower band;
- per lane matchup and band, the current-patch sample is mostly a handful of games.

## Data feasibility (investigated before building)

| Question | Finding |
|---|---|
| Match history schema | `account_matches` holds one row per game per linked account: champion, role, result, queue, duration and the **enemy champion in the same position**. `match_details` holds both teams' participants with their positions. |
| Lane-opponent reliability | One rule names the opponent everywhere (`laneOpponentOf`, `src/domain/match-analysis.ts`; docs/DATA_PIPELINES.md, "The lane opponent: one rule"): the one enemy with the player's `teamPosition` (the position Riot assigns on Summoner's Rift, one per team), and only when nobody else on the player's side holds it; the `individualPosition` only when the player's team position is empty; otherwise "lane opponent unclear", and no opponent is stored. Records stored before 20 Nov 2026 keep one merged position, held to the same uniqueness. The ledger stores the opponent during the account sync, and the opponents' tally and the lane figures both read that stored opponent, so they always count the same games (until 20 Nov 2026 the sync took the first enemy in the position while the lane demanded exactly one: `data-audit` → `laneOpponents` counts any stored row that still disagrees, and `lane-opponent-recompute` repairs them by hand). Games with no position (ARAM and other modes) are outside the synced queues. Remakes (under 5 minutes) are excluded. Lane swaps and roams are not detected: the position is Riot's assignment, not a reading of where the player stood (positions at every frame are kept from 20 Nov 2026 on, for a later reading). |
| Were gold/XP frames stored? | **No.** `match_timelines` held only purchases and skill level-ups, fetched one match at a time when someone opened the match details. The minute-by-minute frames were discarded. |
| Match-V5 timeline | `GET /lol/match/v5/matches/{id}/timeline` (regional host). The frames are about 60 s apart but **not exactly** (for example 60,412 ms, then 120,903 ms), and the last frame is the end of the game. Each frame gives every participant's `totalGold`, `xp`, `minionsKilled` and `jungleMinionsKilled`. |
| Rate limits | Each timeline is one request against the same application limits as the account sync and ranked collection. The shared per-host limiter follows the limits Riot reports. |
| Retention | Riot does not document how long timelines stay available. A missing timeline (404) is stored as "unavailable" and never requested again. The `data-audit` job reports availability by game age (last 90 days, 90–365 days, older). Production coverage is measured there rather than assumed. |
| Storage | Frames are kept compactly: the frame timestamps once, then gold, experience and CS arrays per participant, keyed by PUUID and kept server-side. That is about 6 KB of JSON per match for 10 players. The production ledger (about 3,400 games across 13 accounts on 14 Oct 2026) would need about 20–25 MB at most. The column is additive (`match_timelines.frames`, migration `0036_matchups_frames`); existing rows keep their build order. |

## How it is collected

The `timeline-backfill` job is part of the scheduler tick:
- It runs just before ranked ingestion, capped at 25 s per tick.
- Each run fetches up to `TIMELINE_BACKFILL_PER_RUN` timelines (default 30), one request at a time, newest games first.
- Only the linked players' own rift games that name a lane opponent are fetched; remakes are skipped.
- A run stops at the first refusal (429) or error and writes nothing for that game.
- Rows stored earlier for the build order keep their purchases; the frames are added to them.
- The Match History details panel also stores frames whenever it fetches a timeline.

Nothing is fetched while a page renders. The preview's foot line says in how many of the champion's games the lane opponent is known; an opponent's games say "no timeline" where none is stored.

## How the numbers are made (`src/domain/matchups.ts`)

- **Alignment:** each value is read at an exact moment (10:00 = 600,000 ms) by interpolating linearly between the two frames around it, never by frame number.
- **Game length:** a game that had ended before a moment has no value there and is left out of that moment's figures. Every column shows the number of games behind it.
- **Direction:** differences are the player minus their lane opponent. The opponent is the game's stored one (the rule above), found in the stored match details by its champion on the other side.
- **Sentences:** they appear only with at least 5 games that have a timeline at the moments compared. They describe what happened in these games, for example "ahead in gold at 10:00 in 6 of 8 games" or "the gold lead grew between 10:00 and 20:00". They never say "always", never give a reason, and there are no grades or advice. A fixed note says the pattern is not its cause.

## Access

The preview and its two actions have the same access as All Champions and Match History:
- players always see their own;
- teammates' figures need *view teammate statistics*, checked on the server by each action;
- a personal-use profile is its player's and the administrators' only (`mayOpenProfile`), answered
  as one that does not exist (`tests/db/champion-preview.test.ts`).

The page receives only figures. No PUUIDs, names or other players' identities are sent.

The default is every linked account. The page's Refine offers each account, the season and the game mode.

## Known limitations

- Coverage depends on the backfill. On release, few games have frames; about 30 are added per hourly tick, which shares Riot's limits with ranked collection.
- Older games may have no timeline at Riot (shown as "no longer provided").
- The current season is the default; the page's Refine chooses another one.
- Lane swaps (for example a bot-lane swap) follow Riot's assigned positions.
