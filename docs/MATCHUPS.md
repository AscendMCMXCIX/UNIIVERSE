# All Champions' preview and Matchups

Profile → **All Champions** → a champion opens its **preview**, in the list's scope (season, game
mode, account) and in the role of the row (PLAN S5, overhaul audit CM §4). It shows the player's own
results, the same for every viewer who may see the profile; preparation (abilities, cooldowns,
notes) is Matchup Intel's (docs/MATCHUP_INTEL.md), reached by one link per opponent.

**Where it opens** (since Release 16, the owner's request of 23 Nov 2026; docs/DESIGN_SYSTEM.md §7,
"Peek"). From 768px wide (tablets and computers, at any list width, the sidebar open or not) the
preview is a **compact panel docked at the window's right edge**, the shared Peek's
(`ui/peek.tsx`, `clamp(26rem, 34vw, 36rem)` wide, from under the tablet's bar to the bottom): the
table stays exactly where it is (its columns, every row's place and height, the page's scroll), the
selected row takes `surface-3` and a 2px accent bar, and the panel's content fits it at 1280 × 800
and up with an opponent open (only its body would scroll, in a shorter window). ‹ › in its header
and ↑/↓ (J/K) from the list move it along the rows; ✕, Escape, the row again, Back and a click
outside it (not on a row, a link, a window or a popover) close it, and Back puts the list back as it
was, with its search, sort and filters. Under 768px, touch or mouse, and in short windows
(`ui/posture.ts`), it is the same Peek's **sheet** with the same content and ‹ ›; ✕, Back or a pull
down close it. (From S5 to 22 Nov 2026 the wide list showed it as a panel laid over the columns
after Win rate, joined to its row by a 2px notch; from 23 Nov 2026 until Release 16 it unfolded
under its row across the list, pushing the rows below it down, with a tall list of opponents in
two columns from 50rem.)

**Content, in this order and nothing else:**

1. **Header:** the champion's name in the panel's (or sheet's) header with ‹ › and ✕; under it the
   portrait, the role and "In pool", "Also as Mid: 3 games · 1W 2L" (switches to that row), and at
   the right the win rate (coloured by `winRateTone` from 5 games) over "14 games · 4W 10L".
2. **Figures:** four compact tiles of averages (KDA with the average K/D/A, CS/min with CS a game,
   damage/min with damage a game, vision a game; "—" where no game carries one; one row from a
   26rem panel, two by two in a phone's sheet) and a line saying what they cover ("Averages over all
   8 games in these filters", or "from the N games with a full record, of M") with the mastery
   points. The same in the panel and the sheet.
3. **Against each lane opponent**, a compact table (Opponent, Games, Record, Win; rows of 36px,
   44px on touch, under one heading row), sorted by Most games, Best or Worst
   (`src/domain/champion-preview.ts`):
   - an opponent shows a win rate from **3 games**, coloured from **5**, always with its games
     beside it;
   - opponents with 1–2 games fold into "N more opponents with 1–2 games" (W/L only);
   - with none at 3 games, every opponent is listed with W/L only, and "No opponent met 3 times yet";
   - Best and Worst rank opponents with 5+ games first, then 3–4; ties go to more games, then the
     most recent.
4. **An opponent unfolds under its row, in the same panel** (`vs` in the address): the KDA over its
   games with the average K/D/A (`pairingKda`, the games with a full record, as the champion's KDA
   is counted), one sentence only with at least 5 games
   with a timeline ("At 10:00 you had more gold than Nasus in 5 of 6 games with a timeline (+623 on
   average)", "Gwen had" on a teammate's profile: wording follows the viewer,
   `src/domain/viewer-words.ts`), its games as compact rows (W/L, K/D/A, CS, the gold difference at
   10:00 or "no timeline", the date; the first five, then "Show all"), each opening the match
   window; and "Prepare Gwen vs Nasus in Matchup Intel →".
5. **Foot line:** "Lane opponent: the enemy Riot placed in your position" ("their position" on a
   teammate's), with "Known in N of M games" when some games name none.

Removed with the old champion window (19 Nov 2026): its tabs, the six tiles, the multikill strip,
the lane tables, chart and second checkpoint table, the queue and account split, "How these figures
are made", and the window's own Refine (the page's filters sit beside the preview). If the
lane-by-minute views are missed, they come back as a fold under an opponent, never as a tab.

**Address and history.** One key: `?champion=Gwen&crole=TOP[&vs=Nasus]`. The first open pushes one
history entry; switching champion or opponent replaces it; closing goes Back when this page pushed
it. So Back always closes and never walks through champions. The address changes through the
History API, never a navigation, so the page does not re-render. A deep link renders the preview's
data in the first HTML. A game opened from an opponent's games (the match window over the preview)
adds `&match=` by the same rule, so it has an entry of its own: Back closes the game and leaves the
preview as it was (on a phone the sheet steps aside while the game is open and comes back), and Back
from a page a link in the game opened returns to the game. Before 20 Nov 2026 the game had no entry,
and Back closed the preview behind it and left the game open. Old links keep working: `tab=matchups&vs=X` opens the preview with X
unfolded; `/overview/matchups` and `/players/[id]/matchups` redirect into it (the most played
champion when none is named); the Overview's old `?champ=` key redirects to All Champions. A pool
card on the Overview links to All Champions with that champion's preview open, in the pool's role.

**Keyboard.** A click on a row opens it (focus stays on the row; the preview's summary is
announced), Enter opens it and moves focus to its heading; ↑/↓ (or K/J) move it to the row above or
below; Escape, ✕, Back or the selected row again close it, and focus returns to the row.

**Data path** (`src/server/actions/champion-preview.ts`, `src/server/players/champion-preview.ts`):

- `getChampionPreviewAction`: the lane opponents' tally from the stored rows (`getPlayerMatchups`
  with `tallyOnly`), no match record or timeline read. About 0.4 KB per answer on the demo.
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
