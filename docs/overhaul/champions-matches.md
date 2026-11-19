# Stage 0 · All Champions and Match History / Encounters: audit and redesign study (directive §4 and §5)

Read-only audit, 19 Nov 2026, about 06:50–08:40 UTC. Nothing was edited, committed, pushed, started or stopped; no e2e spec was run. The demo's data is synthetic (Demo Top, Demo Rival 5, …): the design is judged, not the numbers. No personal data is written here.

**Sources**
- **Code:** `origin/ux/matchup-intel-dashboard` (9cce9a33, what :3871 serves). Every file read is byte-identical on `origin/main` (5e37015b) and `origin/ux/leaderboards-dashboard` (a3cbcb22), checked with `git diff --stat`. The one exception is `champion-detail.tsx`, which differs by 3 lines on the Matchup Intel branch (the Matchup Intel link).
- **Demo server:** http://127.0.0.1:3871, cookie `uniiverse_view=player`. Chromium `/opt/pw-browsers/chromium` at DPR 1, one browser at a time, `nice -n 15`.
  - Sizes: 1440×900 (the benchmark), 1280×800, 1920×1080, 768×1024, 390×844, 375×667 and 320×568. Phones were emulated with touch.
  - The demo viewer has no player profile of its own, so every page here is a teammate's profile: `/players/<Demo Top>/champions` and `/players/<Demo Top>/matches`, plus Demo Mid.
- **Leaderboards:** outside this audit; :3852 answered but was not needed.
- **Prior work:** the 8 Nov synthesis (`scratchpad/ux/synthesis.md`, P1–P13), docs/DESIGN_SYSTEM.md, MOBILE.md, MATCHUPS.md, ARCHITECTURE.md and LIVE_VALIDATION.md.
- **Measurement scripts:** `docs/overhaul/cm-tools/` (ac1–ac3, mh1–mh2, enc1, small, tab; the wireframes are in `mock/`).
- **Screenshots:** in `docs/overhaul/shots-champions-matches/`, cited below as **[S·name]**. The full paths are listed in the appendix.

**A demo limitation that matters.** The demo has no Riot key. A game whose timeline was never stored therefore shows "The timeline appears once Riot access is configured for this site." in three places: Timeline, Build, and the Analysis lane. The game measured in detail (`DEMO_99b92137_33`, Gwen, a Victory, 7/5/3, 28:24) has a stored timeline. Production fetches timelines in the background (the `timeline-backfill` job), so most recent games there have one.

---

## 0. Summary

**All Champions today.**
- **Desktop:** a row opens a centred window of 1216×810 at 1440×900 (1347×972 at 1920) over the whole list. It has two tabs (Overview, Matchups), six figure tiles, a multikill strip, two lane tables, a lane chart, the opponents and the latest games: 128 figures in Overview and 155 in Matchups.
  - The owner's first priority, "your win rate against each opposing champion, with its games", is not shown anywhere as a list. Overview shows the five most-met opponents as "7 · 1W 6L", with no percentage. Matchups shows one opponent at a time, chosen from a dropdown.
  - Switching champion means closing the window, then clicking another row: two motions and a full server render of the page (17–21 KB, about 0.6–1.2 s even locally).
- **Phones:** the window covers the whole screen. Its header is 190px and its Overview is 2.6 screens (390×844) to 5.1 screens (320×568). The opponents start 1.15 screens down.
- **The list on phones:** rows are 101px, the first row starts at 357/377/447px, and at 320×568 not one whole row sits above the tab bar.

**Match History today.**
- **Desktop:** an opened game unfolds under its card into four subtabs (Scoreboard, Analysis, Timeline, Build).
  - The content behind them is 2,695px at 1440, and on a phone 4,481px (about 7 screens).
  - The player's own figures repeat: CS/min appears four times, and kill participation, damage share, KDA ratio and damage per minute three times each.
  - The Analysis is about 100 raw figures in five blocks, and not one sentence answers what went well or wrong.
  - At 1440 the expanded Scoreboard puts "Close this game" 1,011px below the card's top (1.12 screens).
  - Opening the next card makes it jump 423px above the screen before it smooth-scrolls back.
- **Phones:** a pinned header of 205/233/261px (24%/35%/46% of the screen at 390/375/320), and 2.35–2.4 screens per tab. There is no Next or Previous. At 320px the tab labels collide ("ScoreboardAnalysis").

**What the data supports.**
- **The lane opponent is real, not co-occurrence.** `account_matches.enemy_champion_id` is the enemy holding the player's Riot position (`teamPosition || individualPosition`), stored at sync. The champion window's lane figures re-check that exactly one enemy holds it.
- **The record keeps:** six item slots plus the trinket, both summoner spells, the keystone, both rune trees and the full rune page (records since 14 Oct). Also KDA, CS, gold, damage dealt and taken, vision, wards, level, and multikill/solo-kill/objective extras.
- **The timeline keeps:** the build order, skill order, gold/XP/CS per minute for all ten players, kill and death times, and objective times.
- **Missing:** stat shards (Riot sends `perks.statPerks`; it is not parsed), item metadata for "completed item" timing, time spent dead, who killed whom, plates, and support healing and shielding.

**Proposals.**
1. **All Champions → a preview that unfolds over the list's secondary columns.**
   - Champion, Games and Win rate never move; KDA→Mastery fold away; one panel inside the same card.
   - It shows the champion, games, win rate and record, then every lane opponent met 3+ times, each with its win rate beside its games. Opponents with 1–2 games are folded. Each opponent opens the games behind its figure.
   - Escape, ✕, Back or the selected row close it; ↑↓ or another row switch champion in place.
   - The lane chart, the tables, the tiles and the tabs all go.
   - On phones it becomes a sheet with ‹ › for the previous and next champion. Wireframes: **[S·mock-a]**, **[S·mock-b]**.
2. **Match History → one post-game view, no tabs.**
   - The card folds into a header with Previous, Next and Close.
   - The loadout is drawn as the client draws it: portrait and level, spells and runes 2×2, and a 2×3 inventory with the trinket beside it. Then the rune page, each figure once, the lane by role, three short answers (Went well, Went wrong, Focus next) from a written rule set, and a compact scoreboard of both teams. The gold graph and the build and skill order are folds.
   - At 1440 the game and its header fit in about 620px, one screen.
   - On phones: a whole screen with a 52px header and a Previous/Next bar. The first screen holds everything but the scoreboard. Wireframes: **[S·mock-c]**, **[S·mock-d]**.

**Counts:** 25 findings, 11 major and 14 minor. All Champions has 11 (5 major), Match History and Encounters 10 (6 major), and the data 4 (all minor). 73 screenshots (contact sheets included), 4 wireframes, and 22 analysis rules (§6.4).

---

## 1. All Champions today

### 1.1 How it works

- **Route.** `/players/[id]/champions`, or `/overview/champions` for one's own profile. The server component `ProfileChampionsTab` loads `getPlayerOverview` and, when `?champion=` is set, `getPlayerMatchups(..., { exact: true })`.
- **The list** (`all-champions.tsx`). The layout follows the list's own width (a container query):
  - Below 44rem, one compact row per champion: the win rate and games at the right, then labelled pairs (KDA, CS/min, Kills, Multikills, Mastery).
  - From 44rem, a table with eight columns: Champion, Games (with a share bar), Win rate, KDA, CS/min, Kills, Multikills (the rarest) and Mastery.
  - From 76rem, four multikill columns.
  - Rows are 51px on desktop and 101px on phones.
  - A search field, sortable headings (Sort by on phones), the first 20 rows, then "Show all".
  - **[S·ac-1440-top-list] [S·ac-390-top-list]**
- **The champion window** (`champion-window.tsx` and `champion-detail.tsx`). The shared `DetailModal`: `size="wide"` is `min(76rem, 100%−3rem)` × `min(90%, 58rem)`, centred over a dimmed page, and the whole screen on phones.
  - **Header:** the champion's splash, a portrait, the name, role, pool chip, scope line, Refine and Matchup Intel, then the tabs.
  - **Overview** (**[S·ac-1440-top-window-overview-0/1]**):
    - six tiles: Games, Win rate, KDA, CS/min, Damage/min, Mastery;
    - a multikills strip;
    - "The lane against every opponent": gold, XP, CS, "Ahead in gold" and "Games with a timeline" at 5, 10, 15 and 20 minutes, two sentences and a disclaimer;
    - "Opponents faced most": the top five, as "7 · 1W 6L";
    - "Latest games": five game cards.
  - **Matchups** (**[S·ac-1440-top-window-matchups-0/1]**):
    - an opponent picker ("Gwen vs Nasus") and the "Often:" chips;
    - four tiles: Games, Record, Win rate, With a timeline;
    - games by queue;
    - a lane chart (Gold / XP / CS), a second checkpoint table, the sentences and "How these figures are made";
    - every game behind the figures.
  - A game replaces the window with the match window, which has a Back button.
- **The address.** `?champion=Gwen&crole=TOP`, plus `&tab=matchups&vs=Nasus`.
  - Opening pushes a history entry, so Back closes the window (measured at 1280, 1440 and 1920).
  - A tab change replaces the entry; Refine replaces it too.
  - Escape closes the window, and focus returns to the row (`afterClose.focus = open-champion`).
- **Phones.** The window covers the screen, and Back closes it with the list's place kept (y 120 → 120).

### 1.2 Measurements

| What | 1440×900 | 1920×1080 | 1280×800 | 768×1024 | 390×844 | 375×667 | 320×568 |
|---|---|---|---|---|---|---|---|
| Window size | 1216×810 | 1347×972 | 1216×720 | 720×922 | the whole screen | the whole screen | the whole screen |
| Header | 183px | | | | 190px (22.5%) | 190px (28.5%) | 194px (34%) |
| Overview body, screens | 1.56 (975/624) | | | 1.83 | 2.64 | 3.73 | 5.09 |
| Matchups body, screens | 1.45 | | | | 2.82 | | |
| Opponents block starts | 160px into the body | | | | 751px (1.15 screens) | 787px | 873px |
| Figures in the body (Overview / Matchups) | 128 / 155 | | | | 128 / 149 | | |
| Open until the lane data shows (local) | 693 ms | 576 ms | 818 ms | | | | |
| Switch champion (Escape, next row, lane data) | 1,184 ms | 977 ms | 946 ms | | | | |
| Server payload per open | (RSC render of the whole page) | 21.2 KB | 21.2 KB / 17.2 KB | | | | |

Phone list (Demo Mid, 8 champions) **[S·ac3-390/375/320-mid-list]**:

| | 390×844 | 375×667 | 320×568 |
|---|---|---|---|
| First row's top | 357px | 377px | 447px |
| Row height | 101px | 101px | 118px, then 101px |
| Whole rows above the tab bar | 4 | 2 | **0** |
| Lone "Filters" row | 44px | 44px | 44px |

### 1.3 Findings

**AC-1 (major) · Desktop · The champion window hides the list, and switching costs two motions and a page render.**
- **What the user sees:**
  - at 1440 a 1216×810 window covers 76% of the screen, with the list dimmed out of reach **[S·ac-1440-top-window-overview-0]**; at 1920 it is 1347×972 **[S·ac2-1920-mid-window]**;
  - to compare Gwen with Galio, the user closes the window, clicks Galio, waits for the opening motion and a server round trip, and reads again. That took 946–1,184 ms locally (§1.2), and production adds a Vercel function and Supabase.
  - Every open or switch is a full server render of the profile page: `router.push` re-runs `getPlayerOverview` and `getPlayerMatchups`.
- **Why it matters:** the directive asks to "switch directly between champions" and "preserve the browsing position" with a panel "naturally connected to the champion list".
- **Proposal:** the preview of §4.

**AC-2 (major) · All sizes · The owner's priority is buried.**
- **What the user sees:**
  - Overview lists five opponents as "7 · 1W 6L": games and record, with no win rate **[S·ac-1440-top-window-overview-0]**;
  - the win rate against an opponent appears only in Matchups, after picking that opponent ("Win rate 14%"), one at a time;
  - on a 390px phone the opponents start 751px into the body, 1.15 screens down.
- **Why it matters:** §4 lists "personal win rate against each opposing champion" and "number of games supporting each matchup percentage" as what to prioritise.
- **Proposal:** the opponents list is the panel's body (§4.2).

**AC-3 (major) · All sizes · Too much, in too many forms.**
- **What the user sees:**
  - Overview carries 128 figures and 442 words: six tiles, a multikill strip, a 4×5 lane table, two sentences, five opponents and five game cards.
  - Matchups carries 155 figures: four tiles, a queue split, a chart, a second 4×5 table, sentences, a fold and up to all games.
  - The header adds the scope line, Refine and Matchup Intel buttons, and the two tabs.
- **Why it matters:** §4 says "simplify substantially… avoid unnecessary statistical panels, excessive colour coding and complicated tab structures". Five of the six tiles repeat the row the user just clicked: Games, Win rate, KDA, CS/min, Mastery.
- **Proposal:** keep identity, games, win rate and record, and the opponents with their games. Remove the tiles, multikills, lane tables, chart, queue split, tabs and the in-window Refine (§4.2, "Removed").

**AC-4 (major) · Phones · A whole-screen window with a 190px header and up to five screens of body.**
- **What the user sees:** the header takes 22.5% / 28.5% / 34% of 390 / 375 / 320 screens, and the Overview is 2.64 / 3.73 / 5.09 screens long **[S·sheet-ac-390-overview] [S·sheet-small-phones]**. Reading the matchups means scrolling through tiles, multikills and lane tables first.
- **Proposal:** a sheet over the list, with the opponents first and ‹ › to the next champion (§4.6).

**AC-5 (major) · Phones · The list starts low, and each row is 101px.**
- **What the user sees:**
  - the first row's top is at 357 / 377 / 447px;
  - 4 / 2 / **0** whole rows sit above the tab bar at 390 / 375 / 320 **[S·ac3-320-mid-list]**;
  - each row carries seven figures (win rate, games and record, KDA, CS/min, Kills, Multikills, Mastery);
  - a lone 44px "Filters" row breaks the 8 Nov rule P5 ("never give a row to a single control").
- **Why it matters:** the synthesis set "at least 2 All Champions rows" on the first phone screen (P7); 320 misses it.
- **Proposal:**
  - 64px rows: a 40px portrait, the name over the role and "In pool", the win rate over the games. The sorted figure replaces the role line's end when the list is sorted by something else.
  - Filters moves to the end of the scope line.
  - Estimates: about 7 whole rows above the tab bar at 390 and at least 2 at 320.

**AC-6 (minor) · Window · Colour on every lane cell.**
- **What the user sees:** the lane table colours all 12 difference cells green or red, plus the win-rate tones; in Matchups that doubles with the second table.
- **Why it matters:** §4 asks for less colour coding. DESIGN_SYSTEM §1: the identity "never comes from extra colour, glows on data…".
- **Proposal:** the panel colours one figure per row at most, the win rate through `winRateTone`. Lane figures leave the panel.

**AC-7 (minor) · Data path · Each open re-renders the page and reads every game's lane.**
- **What happens:**
  - `getPlayerMatchups({ exact: true })` runs `laneExtracts` over every game on the champion. Each game's record and timeline are matched inside Postgres, both players' frames come back, and the result is kept per instance once final.
  - The page's `getPlayerOverview` runs again.
  - A switch repeats both.
- **Proposal:** the panel needs only the opponents' tally (from the cached `accountRows`, without opening a match record) and, when an opponent is expanded, that pair's games (`vs`, the existing non-exact path). Fetch it through a server action cached per page, as Match History's `MatchDetailCache` does, and update the address without a navigation (`history.pushState`/`replaceState`, as `writeMatch` does).

**AC-8 (minor) · Window · Refine duplicates the page's filters.** The window carries its own season, mode and account Refine because it covers the page's. A panel beside the list leaves the page's filters visible. **Proposal:** no Refine in the panel; the scope line says what is counted.

**AC-9 (minor) · Overview · A second home for the same window.** `profile-pools.tsx` opens the same window from the profile Overview's pools (key `champ`). **Proposal:** a pool links to `…/champions?champion=X&crole=R` (All Champions with the preview open), so there is one place and one behaviour.

**AC-10 (minor, data) · The opponent tally and the lane figures can disagree.**
- **What happens:**
  - the fold (`accounts/sync.ts` `foldGame`) stores `enemy_champion_id` from `participants.find(enemy && same position)`, the first match, with no uniqueness check;
  - the lane figures (`laneExtracts`, `laneOpponentOf`) require exactly one enemy in the position.
  - With Riot's `teamPosition` that is always one in matchmade Summoner's Rift games. With the `individualPosition` fallback two enemies can share it, and such a game counts in the tally but not in the lane.
- **Proposal:**
  - apply `laneOpponentOf`'s rule in the fold;
  - optionally a one-off recomputation for stored rows from `match_details`, with no Riot request;
  - a `data-audit` count of disagreements first.

**AC-11 (minor) · List · Wide-tier noise.**
- **What the user sees:** from 76rem the list shows Kills (a sum, which follows Games) and four multikill columns.
- **Proposal:**
  - keep them while no champion is open, for exploring;
  - while the preview is open, fold everything after Win rate (§4.1);
  - a question for the owner: drop the Kills column. It sorts like Games, and per-game kills are in KDA.

---

## 2. What the data supports for All Champions

### 2.1 Is the lane opponent known? Yes: by position, not by co-occurrence.

- **At sync.** `foldGame` (`src/server/accounts/sync.ts`, around line 787) takes `position = teamPosition || individualPosition` (`fold-input.ts:61`). `opponent` is the enemy on the other team with the same position; it is left unknown if that player's data was erased. `enemy_champion_id` (`schema/accounts.ts:128`) is stored on the player's game row.
- **When read.** `getPlayerMatchups` tallies `enemy_champion_id` per champion and role, giving `opponents: [{championId, games, wins, lastPlayedAt}]` for **every** lane opponent. For lane figures it re-reads the record and requires exactly one enemy in the position (`laneExtracts`, SQL `count(*) = 1`).
- **Caveats to state in the UI:**
  - it is Riot's assignment, so lane swaps are not detected;
  - bot lane is 1v1: an ADC's opponent is the enemy BOTTOM and a support's is the enemy UTILITY;
  - games stored before the column existed, or whose opponent was erased, have none, so the panel says "known in N of M games";
  - remakes and games under 5 minutes never count.
- **Available but not used:** the record holds all ten players' positions, so a bot-lane pair (the enemy ADC and support together) could be derived. Pairs get sparse quickly; it is a later option, not v1.
- **Volume** (MATCHUPS.md, 14 Oct): about 3,400 games across 13 accounts. A busy champion may have 40 games against 20–25 different opponents, so most pairs have 1–2 games. Hence the thresholds below.

### 2.2 Thresholds and sorting (recommended)

| Rule | Value | Why |
|---|---|---|
| An opponent is listed with a percentage | **3+ games** | Below 3, a percentage is 0, 50 or 100% and says nothing. The games and record stay visible. |
| A win rate is coloured, and ranked first when sorting by win rate | **5+ games** | The app's existing rule: `WIN_RATE_MIN_GAMES.champion = 5` and Encounters' `ESTABLISHED_GAMES = 5`, where smaller samples are grey and ranked after the rest. |
| Opponents with 1–2 games | Folded: "N more opponents with 1–2 games" | Shown with W/L only, no percentage |
| No opponent with 3+ games | List all of them, W/L only, with "No opponent met 3 times yet" | Honest fallback |
| Sort | **Most games** (default), **Best**, **Worst** | Best and Worst rank 5+ games first, then 3–4; ties go to more games, then the most recent |
| Coverage line | "Lane opponent known in N of M games" | Shown only when N < M; a short definition sits at the panel's foot |

---

## 3. Match History / Encounters today

### 3.1 How it works

- **Routes.** `/players/[id]/matches` and `/overview/matches` (Games | Encounters). Team → Matches (`together-details.tsx`) uses the same breakdown.
- **The card** (`match-history-view.tsx` and `match-card.tsx`, owner decision D8 of 8 Nov, live since 19 Nov).
  - About 102px on desktop, in one row: result, queue, time and LP; the portrait with its level, two spells, the keystone and the secondary tree; champion and role; K/D/A, ratio and multikill; KP, CS/min (CS) and damage/min (share); the build as 2×3 plus the trinket; both teams with ranks.
  - About 120px on phones **[S·mh-1440-top-list] [S·mh-390-top-list]**.
- **Opening a game.**
  - Desktop and tablet (from 48rem): the game opens under its card (`MatchExpansion` → `MatchBreakdown`) with four tabs, then "Close this game" at the end. `?match=` replaces the history entry, so Back leaves the page.
  - Phones: a whole-screen `MatchDetailModal`, pushed as a history entry so Back closes it, with the list's place and the focus kept (measured: y 500 → 500, focus back on the card at 390 and 375).
- **The tabs** (`match-breakdown.tsx`):
  - Scoreboard: two `TeamTable`s with ranks, "Met N×", possible groups and the ranks note.
  - Analysis (`match-analysis-panel.tsx`): "Your share of the team" (3 bars); "Lane against X" (CS, gold and XP at 10:00, 15:00 and the end); "In this game" (CS/min, damage/min, gold/min and vision against the lane opponent, the team average and a place); "Compared with your usual" (four percentile tracks over up to 50 earlier games); "Objectives and vision" (10 figures plus 6 team-total bars).
  - Timeline: the team gold curve with kills and objectives.
  - Build: build order, skill order, runes and summoner spells.
  - The timeline is requested when Timeline, Build or (with a lane opponent) Analysis is opened.

### 3.2 Measurements

**Desktop 1440×900, Demo Top, game 33 (stored timeline)** **[S·mh-1440-top-2-*-page0]**:

| Tab | Under the card | Card top → "Close this game" | Screens | Page height | Words / figures in the panel |
|---|---|---|---|---|---|
| Scoreboard | 926px | 1,011px | **1.12** | 2,366px | 691 / 216 |
| Analysis | 799px | 884px | 0.98 | 2,239px | 416 / 100 |
| Timeline | 581px | 666px | 0.74 | 2,021px | 189 / 16 |
| Build | 389px | 474px | 0.53 | 1,829px | 58 / 21 |

- **Tab changes resize the expansion.** Changing tab moves "Close this game" and every card below by up to 537px (926 → 389).
- **Without a stored timeline** (game 35, **[S·mh-1440-top-0-timeline-page0]**), Timeline and Build show the same one-line message, and so does the Analysis lane.

**Tablet 768×1024:**
- Scoreboard: 907px under a 120px card (0.99 screens to close).
- Analysis: **1,360px (1.43 screens)**.
- The champion window there is 720×922 with a body of 1.83 screens.

**Switching games on desktop** (mh2.json, **[S·mh2-1440-before-switch] → [S·mh2-1440-after-switch]**):
1. Game 1 is open, and the reader scrolls until game 2's card sits at y = 300.
2. A click on game 2 closes game 1, and game 2's card **jumps to y = −123**, off the screen.
3. A smooth scroll brings it back to y = 64.
- **Result:** the clicked card moves 423px away from under the pointer before coming back.

**Phone 390×844 (whole-screen window), game 33** **[S·sheet-mh-390-scoreboard / -analysis / -timeline-build]**:

| | Pinned header | Tabs start | Scoreboard | Analysis | Timeline | Build |
|---|---|---|---|---|---|---|
| 390×844 | 205px (24%) | 370px | 2.35 screens (1,494px) | 2.40 (1,531px) | 1.28 (814px) | 1.01 (642px) |
| 375×667 | 233px (35%) | 398px | 3.5 screens | | | |
| 320×568 | 261px (46%) | 426px | tab labels collide **[S·crop-320-match-tabs]** | | | |

- **Total content behind the tabs on a 390 phone:** 4,481px, about 7 screens of 637px.
- **To go to the next game:** close (Back), find the next card, tap. There is no Next.

### 3.3 Repetition: the player's own figures in one open game (desktop, card plus Scoreboard plus Analysis, game 33)

| Figure | Where it appears | Times |
|---|---|---|
| CS/min 7.7 | card · scoreboard row · "In this game" · "Compared with your usual" | **4** |
| Kill participation 53% | card · scoreboard row · share bar | 3 |
| Damage share 20% | card "(20%)" · scoreboard "· 20%" · share bar | 3 |
| KDA 2.00 | card · scoreboard · "Compared" | 3 |
| Damage/min 644 | card · "In this game" · "Compared" | 3 |
| CS 219 | card "(219)" · scoreboard · lane "End 219 · 74" | 3 |
| Spells, keystone, secondary tree | card · scoreboard · Build "Runes and summoner spells" | 3 |
| Gold 11.1k / 11,132, gold/min 392 | scoreboard · lane End · "In this game" | 2–3 |
| Vision 18; wards 8 | scoreboard · "In this game"; scoreboard · "Objectives" | 2 each |
| Items | card · scoreboard | 2 |
| Team kills, gold, towers, dragons, barons | team header · Analysis team totals | 2 |

On a phone the window adds its header loadout and a six-figure grid (KDA, KP, Damage, Gold, CS, Vision) on top, so KP and CS/min reach four copies again.

### 3.4 Findings

**MH-1 (major) · All sizes · Four subtabs hide the game, and every tab change resizes it.**
- **What the user sees:** reading one game means four tab clicks; desktop heights go 926 / 799 / 581 / 389px, moving everything below the breakdown each time. The runes sit in the last tab.
- **Why it matters:** §5 says "remove unnecessary subtabs".
- **Proposal:** one view (§6).

**MH-2 (major) · All sizes · The same figures three or four times (§3.3).**
- **Why it matters:** §5 says "remove repetitive statistics". The repetition is what makes the Analysis long.
- **Proposal:** each figure once (§6.2).

**MH-3 (major) · All sizes · The Analysis presents comparisons, not answers.**
- **What the user sees:** about 100 figures and 416 words in five blocks of bars, tables and tracks **[S·mh-1440-top-2-analysis-page0]**. Nothing says what went well, what went wrong or what to work on; the player has to do the reading.
- **What is good:** the honesty rules (no score, the comparison base named) should be kept.
- **Proposal:** the rule-based notes of §6.4, using the same comparisons as their evidence.

**MH-4 (major) · Desktop · Too tall to read and close in one screen; switching jumps.**
- **What the user sees:**
  - "Close this game" is 1,011px below the card's top at 1440×900 on Scoreboard (1.12 screens), and 1.43 screens on a tablet's Analysis;
  - after reading, the next game is a scroll past the breakdown away;
  - clicking it makes the card jump 423px before scrolling back (§3.2).
- **Why it matters:** §1 says "preserve browsing position… avoid unexpected layout shifts"; §5 says "make closing, switching and returning intuitive".
- **Proposal:**
  - the game fits in one screen (about 620px at 1440, **[S·mock-c]**);
  - a sticky footer with Previous, Next and Close;
  - anchored switching, so the clicked card's top stays where it was (§6.3).

**MH-5 (major) · Phones · Pinned header of 205–261px, 2.35–2.4 screens per tab, and no Next.**
- **What the user sees:**
  - the window's pinned header (portrait, result, five chips, loadout) takes 24% / 35% / 46% of 390 / 375 / 320 screens;
  - the six-figure grid follows it, and the tabs start at 370 / 398 / 426px;
  - at 320px the tab labels touch **[S·crop-320-match-tabs]**;
  - to read the next game, the user closes it and taps the next card.
- **Proposal:** a 52px header, no tabs, and a 60px Previous / "Game 3 of 10" / Next bar. The first screen holds result, loadout, runes, figures, lane and the three answers **[S·mock-d]** (§6.3).

**MH-6 (major) · All sizes · Items and runes do not read like League.**
- **What the user sees:**
  - the inventory appears only as 22–28px icons inside the card and scoreboard rows;
  - the full rune page sits at the end of the Build tab as an unlabelled row of nine icons (tree icons at 80% opacity) beside "Flash Teleport" in text **[S·mh-1440-top-2-build-page0]**;
  - there are no stat shards.
- **Why it matters:** §5 asks for a "recognisable six-slot item inventory… runes and summoner spells… resembling the actual League client".
- **Proposal:** the loadout block (§6.2): a 64–72px portrait with its level; spells and runes 2×2, as the client's scoreboard draws them; a **2×3 inventory with the trinket beside the first row**, as the in-game HUD draws it (`ItemRow stacked` already orders it 0, 1, 2, trinket / 3, 4, 5); the rune page grouped by tree, plus shards once stored.

**MH-7 (minor) · All sizes · A missing timeline is said three times.** "The timeline appears once Riot access is configured" appears in Timeline, Build and the Analysis lane. In production, an old game whose timeline Riot no longer serves gets the same three messages. **Proposal:** one quiet line at the folds ("Timeline not available for this game"). Notes that need the timeline are skipped; nothing is claimed.

**MH-8 (minor) · Desktop · Back leaves the page, while phones and the champion window close with Back.** The inline game replaces `?match=`, but the phone's game and the champion window push. **Proposal:** one rule everywhere:
- opening an item (a game, a champion preview) pushes one entry;
- switching (Previous / Next, another row) replaces it;
- closing goes Back, if this page pushed.
- So Back always closes what is open and never steps through games. This challenges the 8 Nov P2 decision for the inline game.

**MH-9 (minor) · Encounters on phones · The list starts at about 540px.** The two highlight lines, the All/Against/Alongside segments and the search take 64% of a 390 screen, leaving 3 players visible **[S·enc-390-list]**. **Proposal:**
- the highlights become one line under the scope ("Most games against: Demo Duo 1, 12 games · 42%");
- the search moves behind the toolbar's search icon until tapped, as All Champions' compact search does.
- Encounters' players still open their games in Match History, so the post-game redesign applies unchanged.

**MH-10 (minor) · All sizes · Mouse-only explanations.** The ten "Objectives and vision" figures and the share bars explain themselves only through the HTML `title` attribute (for example `title="Damage to epic monsters, towers and inhibitors"`), which touch and keyboard users never see. This conflicts with directive §6. **Proposal:** these blocks go; a figure promoted into a note says what it is in the sentence itself.

---

## 4. All Champions redesign: the preview that unfolds over the list

Wireframes: **[S·mock-a-champions-panel-1440]** (desktop) and **[S·mock-b-champions-sheet-390]** (phone). They are wireframes, not pixel specs.

### 4.1 Desktop layout (from a list of about 50rem, so 1280 with the sidebar open, 1440, 1920 and up)

- **One card, two pages.**
  - The list card keeps its size.
  - Champion, Games and Win rate keep their exact x positions: no column of the list moves.
  - The columns after Win rate (KDA, CS/min, Kills, Multikills, Mastery) fold away. Their cells go `visibility: hidden`, so the grid keeps its widths and nothing reflows, and their headings fold with them.
  - The preview occupies that space, inside the same card: same `surface`, hairline `border-l-border-strong`, a soft shadow to the left, the card's right radius. At 1440 that space is about 432px (27rem), from x = 976 to 1408. It scales with the root size and the champion column, to about 28–33rem at 1920.
- **Joined to its row.**
  - The selected row takes `surface-3` with the 2px accent bar at its left (DESIGN_SYSTEM §5).
  - Its background runs to the preview's edge, and the edge line is interrupted beside it (a 2px notch the colour of the row), so the row reads as opening into the page.
  - When the row scrolls out of view, the notch simply goes.
- **Vertical placement.**
  - The preview's top aligns with the card's top (the search row).
  - It is `position: sticky` under the pinned section tabs (`top: calc(var(--bar-top) + var(--tabs-top) + 0.5rem)`), with `max-height` the screen less the pinned bars.
  - Its content is designed to fit (about 560–650px, below), so it normally never scrolls. With a long expanded opponent it scrolls inside, one deliberate region with `overscroll-behavior: contain` and edge fades. That is the only nested scroller, and it never appears for the folded state.
- **Fallback widths.**
  - When the folded region would be narrower than 26rem (1024–1279 with the sidebar open, or larger text), the preview becomes a right drawer of 26rem over the list (`DetailModal`, modal, with scrim). It has ‹ › in its header to switch without closing.
  - Tablets (768–1023) always get this drawer.
- **Sort indicator.** When the list is sorted by a folded column (KDA, for example), the toolbar shows "Sorted by KDA ↓" so the order stays explained.

### 4.2 Content (in this order; nothing else)

1. **Header (about 88px).**
   - A 56px portrait, the name (22px, bold), and "Top · Primary pool" (`text-fg-subtle`).
   - ✕ (40px, a 44px target on touch) at the right.
   - With several roles: "Also as Mid: 3 games · 1W 2L", a link that switches to that row.
2. **The figures (about 70px).**
   - The win rate is large (`text-4xl`, toned by `winRateTone`, at least 5 games), followed by "win rate".
   - At the right: "**14** games · 4W 10L".
   - One quiet line: "KDA 2.74 · 7.9 CS/min · 428K mastery". It may be dropped if the owner wants the leanest version.
3. **"Against each lane opponent"** and one segmented control: **Most games** · Best · Worst.
   - Rows of 46px: a 28px portrait, the champion's name, "1W 6L", the win rate (toned only at 5+ games, grey at 3–4), "7 games", and a disclosure arrow.
   - Rows are 3+ games only (§2.2), followed by "▸ N more opponents with 1–2 games (Garen, Sett)", which unfolds the rest with W/L only.
4. **An opponent unfolded in place** (one at a time; `vs` in the address):
   - **One sentence**, only when at least 5 of its games have a timeline (`MIN_PATTERN_GAMES`): "At 10:00 you had more gold than Nasus in 5 of 6 games with a timeline (+623 on average)." It reuses `describeLane`'s wording rules ("in these games", never a cause).
   - **The games behind the figure**, as compact rows: W/L, K/D/A, CS, the game's own gold difference at 10:00 (or "no timeline") and when it was played. A row opens the game (§6); its Back returns here.
   - **"Prepare Gwen vs Nasus in Matchup Intel →"**: the one link to the pre-game tool.
5. **Foot line:** "Lane opponent: the enemy Riot placed in your position. Known in 14 of 14 games." One sentence, no ⓘ (directive §6: improve the label rather than add a tooltip).

**Removed from today's window:**
- the two tabs;
- the six tiles;
- the multikills strip;
- "The lane against every opponent" table and its sentences;
- the lane chart and the second checkpoint table;
- the queue and account split;
- "How these figures are made", replaced by the foot line;
- the in-window Refine and the scope line (the page's filters sit beside it).

The lane-by-minute views go with them. If the owner misses them, they come back later as a fold under an opponent, never as a tab.

**Why this stays distinct from Matchup Intel.** All Champions shows *your results* (games, records, the games behind them), the same for every viewer who may see the profile. Matchup Intel shows *preparation* (abilities, cooldowns, curated or assembled notes). The panel shows no ability, build or advice, only one link per opponent.

### 4.3 Interaction

| Action | Desktop (side page) | Drawer (tablet, narrow desktop) | Phone (sheet) |
|---|---|---|---|
| Open | Click or Enter on a row. Focus stays on the row; the preview's title is announced (`aria-live="polite"`: "Gwen, Top. 14 games, 29% win rate.") | Click or tap: the drawer slides in, and focus moves to its title | Tap: the sheet rises (`DetailModal size="sheet"`), and focus moves to its title |
| Switch champion | Click another row, or ↑/↓ on the list (the preview follows focus after 150 ms of rest); the address is **replaced** | ‹ › in the drawer header (the list's order, with its sort and search) | ‹ › in the sheet header; the address is replaced |
| Into the preview (keyboard) | → or a second Enter on the selected row moves focus to the sort control; Tab continues through the opponents | Already inside | Already inside |
| Close | ✕, Escape (from the list or the preview), a second click on the selected row, or Back. Focus returns to the row | ✕, Escape, the scrim, Back | ✕, pull down, the scrim above it, Back |
| An opponent | Click or Enter toggles its games (`aria-expanded`); `vs` is replaced in the address | Same | Same, inside the sheet |
| A game | Opens the match window (§6) over the page; its Back returns to the preview | Same | The whole-screen game; Back returns to the sheet |

- **History** (the MH-8 rule):
  - the first open **pushes** one entry;
  - switching champion or opponent **replaces** it;
  - close goes **Back** if this page pushed, else replaces without the parameters (today's `useChampionWindow` logic, kept).
  - So Back always closes, and never walks through champions.
- **The address:** `?champion=Gwen&crole=TOP[&vs=Nasus]`.
  - Old links keep working: `tab=matchups&vs=X` opens the preview with X unfolded, and `/players/[id]/matchups` already redirects into it.
  - A deep link renders the preview **on the server**, in the first HTML, with the list already folded, so nothing moves after hydration.
  - The row is scrolled into view only if it is off screen. If it sits beyond the first 20 rows, the list renders through it.
- **The list keeps its place.** Opening, switching and closing never scroll the page (`scroll: false`, no `scrollIntoView` except keyboard moves off screen). The search, sort and "Show all" state are untouched.
- **Data.**
  - A server action `getChampionPreview(playerId, {season, mode, account, champion, role})` returns the header figures (from the row already on the page) and the opponents' tally, with no match-record read.
  - `getPairingGames(..., vs)` returns the pair's games with each game's 10:00 gold difference and the sentence, reusing `getPlayerMatchups`' non-exact `detail`.
  - Results are cached per page; pressing a row (`pointerdown`, mouse) prefetches. The same access checks apply (`view-teammate-stats`).

### 4.4 Keyboard and screen readers

- **Rows.** Each row keeps one `<button>` covering the row, with `aria-controls="champion-preview"`, `aria-expanded` and `aria-current="true"` on the selected one. The list stays in DOM order, so ↑/↓ add a shortcut and do not replace Tab.
- **The preview** is `<aside id="champion-preview" aria-labelledby="champion-preview-title">`. It is not modal on desktop, with no focus trap, so the page stays usable. The drawer and the sheet are modal (`DetailModal`), with the existing focus rules.
- **Opponents:** `<button aria-expanded>` controls each games list.
- **Announcements.** Win rates are announced with their sample ("14 percent, 7 games, 1 win 6 losses"). A grey small sample says "small sample" in screen-reader text.
- **Targets and motion.** Targets are 44px on touch and 36px with a mouse. Reduced motion makes every transition instant.

### 4.5 Motion and stability

- **Opening.**
  - The folded columns go `visibility: hidden` in the same frame, with no width animation.
  - The preview's content fades in and slides 12px from the list outward, like a page unfolding: 200 ms, `--ease-emphasized`, transform and opacity only.
  - The edge line draws from the selected row outward (`scale-y`, 160 ms).
- **Switching:** a 120 ms crossfade of the content, while the notch moves to the new row (`translateY`, 150 ms).
- **Closing:** a 140 ms fade (`ease-in`), then the columns return.
- **What never moves:** the row heights (51px) and the x positions of Champion, Games and Win rate.
- **Tests:** an e2e check that those three columns' x positions are equal before and after opening (±1px at 1280, 1440 and 1920), and that `scrollY` is unchanged.

### 4.6 Phones

- **The list (AC-5).**
  - 64px rows: a 40px portrait; the name (semibold) over the role and In pool; at the right the win rate (toned) over "14 games".
  - The figure the list is sorted by replaces "In pool" when the sort is not games or win rate (for example "Top · KDA 2.74").
  - The scope line ends with Filters; search and sort share the next row (as today from 360px).
- **The sheet** (**[S·mock-b]**).
  - `DetailModal size="sheet"`, docked, content-sized up to the cap, with the list visible and dimmed above.
  - Header: a handle; a 48px portrait, the name and the role; then ‹ › and ✕ (40px).
  - Body: the figures line, "Against each lane opponent" with sort as a compact select, opponent rows of 52px (name over "7 games · 1W 6L", the win rate at the right), the folded row and the foot line.
  - An opponent unfolds its games inside the sheet.
  - Pull down, ✕ or Back closes it; the list keeps its place and the row gets the focus back.
  - Estimated height with Demo Top's Gwen: about 470px, so the list's first rows stay visible.

### 4.7 Build list (components, tests, docs)

- **Reuse:**
  - `DetailModal` (`sheet` and the drawer);
  - `segmented` (`segmentClass`);
  - `ChampionPortrait`;
  - `winRateTone`, `winRateSampleNote`;
  - `LaneGameCard`, made compact for the games rows;
  - `describeLane` for the sentence;
  - `useChampionWindow`'s history logic, generalised;
  - `MatchDetailModal` for games.
- **New:**
  - `ChampionPreview` (the page, drawer and sheet variants);
  - `PreviewHost` (choosing the variant by the folded region's width);
  - the list's `folded` state, a class on the grid rather than a container query, so the change is in one frame;
  - `getChampionPreviewAction` and `getPairingGamesAction` (server, with `requirePageAccess`-equivalent checks; covered by `guards.test.ts`).
- **Tests and the live check:**
  - 14 e2e specs reference the champion window (`champion-detail`, `champion-tab-*`, `open-champion`). They need new test ids or new assertions.
  - The live check's fact "the champion window opens and Escape closes it" becomes "the preview opens beside the list at 1440 with Champion, Games and Win rate in place, and Escape and Back close it; on a phone the sheet opens and Back closes it".
- **Docs:** MATCHUPS.md is rewritten (the champion window becomes the preview); MOBILE.md (rows, sheet); DESIGN_SYSTEM §7 (overlays: "a preview unfolds inside its list's card"); LIVE_VALIDATION.md.

---

## 5. What the match store keeps (and what it does not)

| Wanted for the post-game | Stored? | Where | Since / coverage | Notes |
|---|---|---|---|---|
| Result, queue, duration, date, patch | Yes | `match_details` (queueId, gameDuration, gameCreation, gameVersion); `account_matches` | All stored games | |
| K/D/A, CS (lane plus jungle combined), gold, damage to champions, damage taken, vision, wards placed, level | Yes | `match_details.participants[]` (`participantDetail`) | All stored records | Jungle CS is not separate (lane and neutral are summed) |
| **Six item slots plus the trinket** | Yes | `participants[].items` = item0..item6 (6 is the trinket; 0 is an empty slot) | All stored records | Icons from Data Dragon `cdn/<ver>/img/item/<id>.png`; names in `app_settings.riot_assets` |
| **Summoner spells** | Yes | `participants[].spells` [summoner1Id, summoner2Id] | All | `img/spell/<id>.png` |
| **Keystone, primary and secondary trees** | Yes | `participants[].runes.keystone/primary/secondary` | All | |
| **Full rune page** (keystone plus 3, and 2 secondary) | Yes | `runes.primaryPerks` and `secondaryPerks` | Records stored from Phase 9 (14 Oct 2026) on; older ones have the keystone and trees only | |
| **Stat shards** | **No** | Riot sends `perks.statPerks {offense, flex, defense}`; `matchParticipantSchema` does not parse it | — | **D-1**: add it to the zod schema and `participantDetail` (`runes.shards: [offense, flex, defense]`), forward only, with no migration (jsonb). Icons are on Data Dragon under `cdn/img/perk-images/StatMods/*.png` (checked: 7 icons answer 200). The ids are not in runesReforged.json, so a small fixed table maps them (5008 adaptive, 5005 attack speed, 5007 ability haste, 5010 move speed, 5001 scaling health, 5011 health, 5013 tenacity and slow resist; check it against the current client data when building). Older games show no shards (re-fetching costs one Riot request per game: not recommended) |
| Multikills, largest spree, first blood, wards destroyed, control wards bought, objective and building damage, turret takedowns, CC seconds, solo kills | Yes | `participants[].stats` (`extraStats`) | Records from Phase 14 on; absent fields are never shown as zero | |
| Team objectives and bans | Yes | `match_details.teams[]` (objectives: tower, dragon, baron, horde, riftHerald, inhibitor, champion) | All | |
| Build order with times, skill order | Yes | `match_timelines.participants[].purchases/skills` | When the timeline is stored (backfill, or on open) | |
| Gold, XP and CS per minute for all ten players | Yes | `match_timelines.frames` | Matchups release on; backfilled | Enables the lane at 10:00 and 15:00, the bot-lane **2v2** (four players' frames) and the team gold curve |
| The player's kill, death and assist times; every team kill; objectives with times | Yes | `participants[].kills/deaths/assists`, `events.objectives` | Timelines stored from 29 Oct 2026 on (older ones are re-fetched once when opened) | Enables "3 of your 5 deaths came before 10 minutes" |
| Who killed whom, positions on the map | **No** | — | — | No note may say whom you died to, or where |
| Time spent dead, turret plates, healing and shielding on teammates, damage mitigated | **No** | Riot sends them (`totalTimeSpentDead`, `challenges.turretPlatesTaken`, `totalHealsOnTeammates`, `totalDamageShieldedOnTeammates`, `damageSelfMitigated`) | — | **D-4**: optional, forward only, from the same request into `extraStats`. Supports and tanks are poorly served by damage-only figures |
| Item metadata (cost, components) for "first completed item at 13:00" | **No** | `compactAssets` keeps item **names** only | — | **D-2**: keep `gold.total` and `into` (empty means a finished item) from the item.json already downloaded at each version |
| A baseline for kill participation, gold/min and damage share | Partly | `account_matches.team_kills`, `team_damage` and `gold` exist; `SeasonGame` and `loadSeasonGames` do not load them | — | **D-3**: add the three to `SeasonGame` so notes can compare them with the player's usual |
| The lane opponent | Yes | `account_matches.enemy_champion_id`; the record's positions | Rows synced after the column existed; erased opponents are left unknown | AC-10 (the uniqueness rule) |
| LP for a ranked game | Yes, computed | `MatchRow.lp` (`domain/lp-attribution`) | Where the readings prove it | Not in `MatchDetailView` today; pass it from the list row or add it |

**Data findings (all minor; AC-10 is counted under All Champions):**
- **D-1 · Stat shards are not stored.** The rune page cannot be complete. The fix is forward only and needs no migration (above).
- **D-2 · Item metadata is names only.** The notes cannot say when the first finished item was bought. Keep `gold.total` and `into` at each version sync, from a download that already happens.
- **D-3 · The baseline lacks kill participation, gold per minute and damage share,** although their columns exist on `account_matches`. Rule K1 (§6.4) depends on it.
- **D-4 · Riot fields that would serve supports and tanks are dropped:** time dead, plates, healing and shielding on teammates, damage mitigated. Forward only, from the same request. Optional.

---

## 6. Match History redesign: one post-game view

Wireframes: **[S·mock-c-postgame-1440]** (desktop) and **[S·mock-d-postgame-390]** (phone).

### 6.1 Principles

1. **No subtabs.** One view, in reading order. The heavy extras (the gold graph and its events; build order and skill order) are folds, closed by default.
2. **Each figure once.**
3. **One screen.**
   - Desktop: the game and its header fit one screen at 1440×900 with the pinned tabs (target 680px or less; the wireframe is about 620px).
   - Phone: everything but the scoreboard fits the first screen at 390×844 (about 1.4 screens in all).
4. **The loadout reads like the client**, in UNIIVERSE's surfaces: dark inset slots, no gold frames.
5. **Notes are rules, not opinions:** each names its data, its comparison base and its sample, and none claims a cause (§6.4).
6. **Open, read, close and switch without hunting.** Previous, Next and Close are always in reach; the history rule is MH-8's.

### 6.2 Desktop (a breakdown of 60rem or more: 1440, 1920; 1280 with the sidebar collapsed)

- **The card folds into a 50px header when opened.**
  - It keeps the result rail and wash, "Victory", "28:24 · Ranked Solo/Duo · 2d ago", the LP chip, and "Gwen · Top".
  - At its right: **‹ Previous · Next › · Close ▴**.
  - The card's loadout, figures, build and teams are not repeated: they move into the view below.
  - The card's top edge stays where it was (anchor). Closing unfolds it back.
- **Two columns.**
  - **Left, "Your game"** (about 528px at 1440):
    1. **Loadout:**
       - a 72px portrait with the level badge;
       - a 2×2 grid at 30px: Flash and Teleport, keystone and secondary tree (the client's scoreboard arrangement; `ChampionLoadout` at `size="lg" icon={30}`);
       - the **inventory**: 2×3 at 40px with the trinket beside the first row, in an inset slot frame (`ItemRow stacked`, sized up, `bg-black/35`, hairline border);
       - empty slots stay as quiet tiles here, unlike the card, because a post-game inventory with empty slots is truthful.
    2. **Rune page, one line:** the primary tree icon (18px), the keystone (28px) and three runes (22px), a divider, the secondary tree and two runes, a divider, three shards (16px) once stored. Older records show the keystone and secondary tree only, without a sentence.
    3. **Figures, one row of six tiles** (`StatStrip` with `StatTile labelFirst`): K/D/A "7 / 5 / 3" over "2.00 KDA"; CS "219" over "7.7 / min"; Gold "11.1k" over "392 / min"; Damage "18.3k" over "20% of team"; Vision "18" over "8 wards"; Kill participation "53%" over "of 19 kills".
    4. **Lane, by role** (§6.5): "LANE VS [Garen] Garen", then 10:00, 15:00 and End columns, each with CS, gold and XP (or level), signed, in plain `fg` with no colour.
    5. **Notes** (§6.4), each section a small uppercase label with an icon:
       - ▲ **Went well** (`good` icon);
       - ▼ **Went wrong** (`warn` icon; never `red`, which means Defeat);
       - ◎ **Focus next** (`accent` icon);
       - text in `fg`, at most 2 + 2 + 1 bullets.
  - **Right, "Scoreboard":**
    - `TeamTable`'s compact variant: the player's team first, each team's header carrying "19 kills · 55.3k gold · 10 towers · 4 dragons · 1 baron";
    - rows of 37px: a 26px portrait with its level, the name over "champion · rank", K/D/A, items 6+1 at 20px, CS and damage share;
    - the player's row lit, members in the accent colour, the lane opponent marked "Lane", and "Met N×" kept;
    - possible groups and the ranks note in one line under the teams.
  - The two columns stack below a 60rem breakdown (1280 with the sidebar open, tablets): an estimated 1.0–1.1 screens there, still with no tabs.
- **Folds** under the scoreboard: "▸ Gold over the game" (today's `TimelinePanel`) and "▸ Build order and skill order" (`BuildPanel` without its runes section).
- **Sticky footer** while the game is open and its end is below the screen: "‹ Previous game · Next game ›   Close ▴", with `position: sticky; bottom: 0` inside the expansion. Escape (focus inside the game) closes it.

### 6.3 Phone, and the open / read / close / switch interaction

- **The whole-screen window** (`DetailModal`, as today), redesigned:
  - **Header, 52px plus the top inset, pinned:** "Victory · Gwen" in the result colour, the LP chip, and ✕ (40px). It replaces today's 205–261px header.
  - **Body, the one scroller:**
    - meta line "Ranked Solo/Duo · 28:24 · 17 Nov · Patch 16.20";
    - loadout row: a 56px portrait with level, spells and runes 2×2 at 24px, the inventory 2×3 plus the trinket at 32px;
    - rune line;
    - figures in 3×2 cells;
    - lane in one or two lines;
    - notes;
    - scoreboard, with two-line rows of about 48px: portrait, name and champion, K/D/A, then items 6+1 at 16px and "219 CS · 20%";
    - folds.
  - **Bottom bar, 60px plus the bottom inset, pinned:** **‹ Previous** · "Game 3 of 10" · **Next ›**, each a 44px target.
- **Measured against the wireframe:** at 390×844 everything down to "Focus next" sits on the first screen, and the scoreboard starts at about 665px (**[S·mock-d]**). Chrome is 112px against today's 205px.
- **Switching:**
  - Previous and Next replace `?match=` (history replace) and swap the content (a 120 ms crossfade), scroll the body to the top and announce "Game 4 of 10: Defeat on Jax".
  - At the ends of the page they are disabled ("Last game on this page").
  - Optional later: a horizontal swipe on the loadout row that ignores touches starting within 24px of either screen edge (iOS Back).
- **Close and return:** ✕ or Back (one pushed entry). Before the window closes, the list behind is scrolled, instantly and unseen, to the card of the **last game viewed**, and focus returns to that card. Closing after reading game 6 lands on game 6, not game 3.
- **Desktop switching without a jump:**
  - When a card is clicked while another game is open, or Next/Previous is pressed, record the target's top on screen, apply the change, then in `useLayoutEffect`, before paint, `scrollBy` the difference.
  - The new header lands exactly where the clicked card or the old header was (±2px).
  - Test: today's mh2 scenario must show card 2's top at 300 → 300 instead of 300 → −123 → 64.
- **Tablet (768–1023):** the stacked one-column view under the card, with the sticky footer.

### 6.4 The analysis, rewritten: Went well · Went wrong · Focus next

**Inputs.**
- The record (always, for a stored game).
- The timeline (when stored).
- The player's own baseline: earlier games in the same role and queue group, at most 50, newest first. A figure is compared once 10 earlier games carry it (`BASELINE_MIN`); "best" needs 20 (`BEST_MIN`); this is the existing `personalComparison`.
- Ranked games are compared with ranked games, normal with normal, and Swiftplay and Quickplay together.

**Hard rules.**
1. Every note is a fact with its numbers and its comparison base: the lane opponent, your team, or "your last N ranked Top games".
2. No cause or verdict words. A `refused-words` test, like Matchup Intel's, rejects: because, due to, caused, led to, thanks to, cost (you), should have, mistake, good, bad, great, poor, terrible, feed, fed, int, carry, throw, threw.
3. At most 20 words per sentence, in plain language (directive §6).
4. Champions are named, never other players.
5. A rule whose data is missing is skipped silently. Nothing is inferred from final items or guessed.
6. "Laning phase" is never named, nor its end; the checkpoints are times: "at 10 minutes" (directive §3's rule).
7. Remakes are never analysed.

**Rules** (thresholds are named constants in `src/domain/match-notes.ts`, unit-tested):

| ID | Section | Data needed | Fires when | Wording (template) | Topic |
|---|---|---|---|---|---|
| L1 | Well | Timeline frames for you and the lane opponent (exactly one enemy in your position); the game reached 10:00 | CS difference at 10:00 ≥ +10, or gold ≥ +500 (only the part(s) that fire are said) | "{n} more CS than {Opp} at 10 minutes ({a} to {b})." / "{g} more gold than {Opp} at 10 minutes." | lane |
| L2 | Wrong | same | CS ≤ −10, or gold ≤ −500 | "{n} fewer CS than {Opp} at 10 minutes ({a} to {b})." | lane |
| L3 | Well | frames at 10:00 and 15:00 | gold(15) − gold(10) ≥ +500 and gold(15) > 0 | "Your gold lead over {Opp} grew from {g10} to {g15} between 10 and 15 minutes." | lane |
| L4 | Wrong | same | gold(10) ≥ +300 and gold(15) − gold(10) ≤ −500 | "Your gold lead over {Opp} fell from {g10} to {g15} between 10 and 15 minutes." | lane |
| L5 | Well / Wrong | Frames for four players (you and your bot-lane partner against theirs); role ADC or Support | Pair gold difference at 10:00 ≥ +800 / ≤ −800 | "You and {Ally} had {g} more (fewer) gold than {Opp1} and {Opp2} at 10 minutes." | lane |
| D1 | Wrong | Timeline death times | Deaths before 10:00 ≥ 2 | "{n} of your {d} deaths came before 10 minutes." | deaths |
| D2 | Wrong | Record (all five teammates' deaths) | deaths ≥ 7 and the most on your team | "{d} deaths, the most on your team." | deaths |
| D3 | Well | Record | deaths ≤ 2 and game ≥ 25 min | "Only {d} deaths in {m} minutes." | deaths |
| P1 | Well | Baseline, 20 or more | Higher than every earlier game (existing `best`, `standoutOf`) | "Your highest {figure} in your last {n} {queue} games as {role} ({value})." | the figure's |
| P2 | Well | Baseline, 10 or more | percentile ≥ 0.8 | "{Figure} higher than in {k} of your last {n} {queue} games as {role} ({value}; usually {median})." | the figure's |
| P3 | Wrong | Baseline, 10 or more | percentile ≤ 0.2 | "{Figure} lower than in {k} of your last {n} {queue} games as {role} ({value}; usually {median})." | the figure's |
| K1 | Well / Wrong | Baseline KP (needs D-3) | percentile ≥ 0.8 / ≤ 0.2 | "Kill participation higher (lower) than in {k} of your last {n} … ({kp}%; usually {median}%)." | teamplay |
| T1 | Well | Record (team damage), not a support | Damage share ≥ 25% and first on your team | "The most damage to champions on your team ({share}% of it)." | damage |
| T2 | Well | Record | Vision score first of all ten players | "The highest vision score in the game ({v})." | vision |
| T3 | Well | Record (turret takedowns, team towers) | Takedowns ≥ 3 and ≥ 40% of the team's towers | "You took part in {t} of your team's {T} towers." | objectives |
| V1 | Wrong | Record (`controlWardsBought`) | 0 bought and game ≥ 20 min. Stronger for Support and Jungle; joins a vision note when one fires | "No control wards bought." | vision |
| S1 | Well | Record (`soloKills`) | ≥ 2 | "{n} solo kills." | highlight |
| M1 | Well | Record (`largestMultiKill`) | ≥ 3. Lowest priority unless quadra or penta | "A triple (quadra, penta) kill." | highlight |
| G1 | Well (team) | Timeline gold curve, all ten players, not contradicting the record (`goldContradictsRecord`) | Won after a team deficit ≤ −3,000 | "Your team won from {x} gold behind (at {mm:ss})." | team |
| G2 | Wrong (team) | same | Lost after a team lead ≥ +3,000 | "Your team lost after leading by {x} gold (at {mm:ss})." | team |
| J1 | Well / Wrong | Timeline objectives; role Jungle | Before 15:00, at least 3 dragons, voidgrubs or heralds taken in all, and your team took ≥ 75% / ≤ 25% of them | "Before 15 minutes your team took {k} of the {n} dragons, voidgrubs and heralds." | objectives |
| F* | Focus | From the strongest Wrong note with a focus mapping; else the lowest baseline percentile ≤ 0.35; else none | see below | see below | |

**Focus lines** (one sentence, the measure and the usual value, a practice cue where a plain one exists):
- **Lane (L2, L4, L5):** "The first 10 minutes against {Opp}: {cs10} CS and {±gold10} gold at 10:00." It carries a link: "Prepare {You} vs {Opp} in Matchup Intel".
- **Early deaths (D1):** "Staying alive before 10 minutes: {n} deaths before 10:00 this game."
- **Deaths (D2, P3-KDA):** "Deaths: {d} this game; {median} in your usual {role} games."
- **Vision (P3-vision, V1):** "Vision: your usual is {median} per minute; a control ward on each recall is the simplest start."
- **CS (P3-CS):** "CS: {cspm} per minute this game; {median} usually."
- **Damage (P3-damage):** "Damage: {dpm} per minute this game; {median} usually."
- **Teamplay (K1):** "Joining fights: {kp}% kill participation this game; {median}% usually."

**Selection:**
- Compute every firing note with a strength: how far past its threshold, normalised (for example (value − threshold) ÷ threshold, capped at 1; a baseline note uses its distance from 0.8 or 0.2).
- Take up to **2 Went well** and **2 Went wrong**, with distinct topics inside a section. Personal notes come before team notes (G1, G2) and highlights (S1, M1).
- A topic may appear in both sections only when the notes describe different moments (L1 and L4).
- Then **1 Focus**.
- The result does not bias the choice: a Defeat can have Went well notes, and a Victory Went wrong ones.

**Fallbacks** (always one honest line, never an empty box):
- No baseline yet: "After 10 {queue} games as {role}, a game is compared with your usual ones." The lane and in-game notes still show.
- Nothing fired: "Nothing stood out against your usual {role} games."
- No timeline: the lane notes are skipped, and one quiet line at the folds says so.
- Support: CS rules never fire (as today's `forSupport: false`); KP, vision and deaths carry more weight.

**Worked example** (the demo game in **[S·mock-c]**):
- **Went well:**
  - "47 more CS than Garen at 10 minutes (71 to 24), and 145 more by the end." (L1, with the end figure);
  - "A triple kill." (M1).
- **Went wrong:**
  - "Vision score per minute lower than in 22 of your last 24 ranked Top games (0.63; usually 0.89), and no control wards bought." (P3 plus V1);
  - "KDA lower than in 20 of those 24 games (2.00; usually 3.45)." (P3).
- **Focus next:** "Vision: your usual is 0.89 per minute; a control ward on each recall is the simplest start."
- **Every figure comes from today's Analysis tab:** the 10:00 lane cells, the "Compared with your usual" tracks and the Objectives grid. The rules need no new data except D-3 (for K1) and D-1 (for shards).

### 6.5 The lane, by role

| Role | Compared with | At 10:00 and 15:00 (timeline) | At the end (record) |
|---|---|---|---|
| Top, Mid | The enemy in your position | CS, gold, XP | CS, gold, level |
| Jungle | The enemy jungler | CS (jungle camps), gold, XP; plus "Before 15 minutes your team took {k} of {n} dragons, voidgrubs and heralds" | CS, gold, level |
| ADC | The enemy ADC (CS); you and your support against theirs (gold) | CS 1v1; gold 2v2 | CS, gold, level |
| Support | You and your ADC against theirs | gold 2v2, XP | vision against the enemy support, level |

- If the lane opponent is not clear (not exactly one enemy in the position), the lane block says "Lane opponent not clear in this game" and lane notes are skipped.
- **Data:** the 2v2 needs four players' frames, which `match_timelines.frames` holds for all ten. A new `pairMoments()` sits beside `laneMoments()`.

### 6.6 Build list (Match History)

- **Reuse:**
  - `MatchResult`, `matchTone` and `MatchRail` (header);
  - `ChampionLoadout` (sized up);
  - `ItemRow stacked` (sized up, with slot frames);
  - `IconImg` (its three states: image, empty, initials);
  - `RuneLine` (from `BuildPanel`, grouped by tree);
  - `StatStrip` and `StatTile`;
  - `TeamTable` (a new `compact` variant);
  - `TimelinePanel` and `BuildPanel` (inside `Disclosure`);
  - `personalComparison`, `standoutOf`, `laneMoments` and `goldStory` (the notes' inputs);
  - `MatchDetailCache` (loading);
  - `DetailModal` (the phone window).
- **New:**
  - `PostGame` (replacing `MatchBreakdown`'s tab row), with `PostGameHeader` (the folded card: Previous, Next, Close) and `PostGameNotes`;
  - `src/domain/match-notes.ts`: pure rules, constants, selection, templates;
  - `match-notes.test.ts`: every rule's thresholds and fallbacks, plus refused words;
  - `pairMoments()`;
  - D-1 (shards), D-3 (baseline fields), optionally D-2 and D-4.
- **Server.**
  - `getMatchDetail` gains the LP (from the list's attribution) and shards.
  - The timeline is requested **on open**, because the lane and notes need it. From storage it is a read of about 10–20 KB, against the 120 MB-a-day egress budget.
  - Riot is asked only when it is not stored, as the Analysis tab already does today for games with a lane opponent. To bound Riot requests, older games (beyond the backfill's window) fetch from Riot only when a fold is opened.
- **Applies to:** Match History (inline and phone), Team → Matches (`together-details.tsx`, in the member's perspective), and games opened from the champion preview (`MatchDetailModal`).
- **Tests and the live check:**
  - 14 e2e specs use `match-tab-*`, `match-expanded`, `match-breakdown`, `match-panel-*` or `match-detail` and need rework.
  - The live check's facts "a game opens under its card with `?match=`… Close returns focus… on phones a whole screen and Back closes it" are kept and extended:
    - no tabs;
    - card plus game at most 1 screen at 1440×900;
    - Next keeps the header's y (±2px);
    - on phones Next replaces the address and Back closes.
- **Docs:**
  - DESIGN_SYSTEM §1: record the 19 Nov product decision. Its line "Match History is a finished, successful experience… change it only for… a product decision" applies; the card's D8 density is unchanged.
  - MOBILE.md (Open a game);
  - a new `docs/MATCH_NOTES.md`: the rules table above, as the source of truth;
  - LIVE_VALIDATION.md.

---

## 7. Risks, dependencies and decisions for the owner

**Decisions** (each recommended):
1. Replace the champion window with the preview, dropping the lane chart, the tables, the tiles and the tabs (§4.2).
2. Redesign the opened game: no tabs, the card folding into a header, notes from §6.4.
3. One history rule for opened items (MH-8): open pushes, switch replaces, close goes Back. This changes desktop Match History.
4. Store stat shards from now on (D-1, forward only).
5. Optionally: D-2, D-3 and D-4, and dropping the Kills column (AC-11).

**Risks:**
- The folded-columns geometry depends on width and text size, so the drawer fallback must be tested at 1024–1279 with the sidebar open and at 150–200% text.
- About 28 e2e specs (14 + 14, with some overlap) and two live-check fact groups change, which means a long CI cycle; ship All Champions and Match History as separate PRs.
- The automatic timeline read raises database egress per opened game (bounded above).
- Phone Previous/Next must not fight iOS's edge-swipe Back.

**Dependencies:**
- Directive §6: tooltip rules (no ⓘ in either design; the labels carry it).
- §2: phone frames. The sheet and the window sit above the bottom tab bar, as today's windows do.
- The stage-1 Team and Profile work touches the same profile tabs.

**Order (suggested):**
1. AC-10 and D-1 (small, server-only, no UI).
2. The All Champions preview (§4).
3. `match-notes` domain plus tests.
4. The `PostGame` view (§6).
5. Phone Previous/Next and anchored switching.
6. Docs and the live check.

---

## Appendix: screenshots and wireframes (full paths)

Directory: `docs/overhaul/shots-champions-matches/`

- **[S·mock-a-champions-panel-1440]** `docs/overhaul/shots-champions-matches/mock-a-champions-panel-1440.png`: the proposed desktop preview (wireframe)
- **[S·mock-b-champions-sheet-390]** `docs/overhaul/shots-champions-matches/mock-b-champions-sheet-390.png`: the proposed phone sheet (wireframe)
- **[S·mock-c-postgame-1440]** `docs/overhaul/shots-champions-matches/mock-c-postgame-1440.png`: the proposed desktop post-game (wireframe)
- **[S·mock-d-postgame-390]** `docs/overhaul/shots-champions-matches/mock-d-postgame-390.png`: the proposed phone post-game (wireframe)
- **[S·ac-1440-top-list]** `docs/overhaul/shots-champions-matches/ac-1440-top-list.png`
- **[S·ac-1440-top-window-overview-0/1]** `docs/overhaul/shots-champions-matches/ac-1440-top-window-overview-0.png`, `docs/overhaul/shots-champions-matches/ac-1440-top-window-overview-1.png`
- **[S·ac-1440-top-window-matchups-0/1]** `docs/overhaul/shots-champions-matches/ac-1440-top-window-matchups-0.png`, `docs/overhaul/shots-champions-matches/ac-1440-top-window-matchups-1.png`
- **[S·ac2-1920-mid-window]** `docs/overhaul/shots-champions-matches/ac2-1920-mid-window.png` (also `ac2-1280-mid-window.png` and `ac2-1440-mid-window.png` in the same directory)
- **[S·ac-390-top-list]** `docs/overhaul/shots-champions-matches/ac-390-top-list.png`
- **[S·sheet-ac-390-overview]** `docs/overhaul/shots-champions-matches/sheet-ac-390-overview.png`: the phone list, then the window's screens 1–3
- **[S·sheet-ac-390-matchups]** `docs/overhaul/shots-champions-matches/sheet-ac-390-matchups.png`
- **[S·ac3-390/375/320-mid-list]** `docs/overhaul/shots-champions-matches/ac3-390-mid-list.png`, `docs/overhaul/shots-champions-matches/ac3-375-mid-list.png`, `docs/overhaul/shots-champions-matches/ac3-320-mid-list.png`
- **[S·sheet-small-phones]** `docs/overhaul/shots-champions-matches/sheet-small-phones.png`: 320 list, champion window and match window; 375 champion and match windows
- **[S·crop-320-match-tabs]** `docs/overhaul/shots-champions-matches/crop-320-match-tabs.png`: "ScoreboardAnalysis"
- **[S·mh-1440-top-list]** `docs/overhaul/shots-champions-matches/mh-1440-top-list.png`
- **[S·mh-1440-top-2-*-page0]** `docs/overhaul/shots-champions-matches/mh-1440-top-2-scoreboard-page0.png`, `…-analysis-page0.png`, `…-timeline-page0.png`, `…-build-page0.png` (same directory)
- **[S·mh-1440-top-0-timeline-page0]** `docs/overhaul/shots-champions-matches/mh-1440-top-0-timeline-page0.png`: no stored timeline
- **[S·mh2-1440-before-switch]**, **[S·mh2-1440-after-switch]** `docs/overhaul/shots-champions-matches/mh2-1440-before-switch.png`, `docs/overhaul/shots-champions-matches/mh2-1440-after-switch.png`
- **[S·mh-390-top-list]** `docs/overhaul/shots-champions-matches/mh-390-top-list.png`
- **[S·sheet-mh-390-scoreboard]**, **[S·sheet-mh-390-analysis]**, **[S·sheet-mh-390-timeline-build]** `docs/overhaul/shots-champions-matches/sheet-mh-390-scoreboard.png`, `docs/overhaul/shots-champions-matches/sheet-mh-390-analysis.png`, `docs/overhaul/shots-champions-matches/sheet-mh-390-timeline-build.png`
- **[S·enc-390-list]** `docs/overhaul/shots-champions-matches/enc-390-list.png` (and `enc-1440-list.png`)
- **Tablet:** `docs/overhaul/shots-champions-matches/tab-768-champion.png`, `docs/overhaul/shots-champions-matches/tab-768-match.png`
- **Raw measurements (JSON):** `ac-1440-top.json`, `ac-390-top.json`, `ac2.json`, `mh-1440-top-0.json`, `mh-1440-top-2.json`, `mh-390-top-2.json`, `mh2.json` in the same directory
- **Wireframe sources:** `docs/overhaul/cm-tools/mock/` (HTML, rendered by `cm-tools/render.cjs`)
