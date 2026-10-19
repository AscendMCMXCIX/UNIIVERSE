# Champion window and Matchups

Profile → **All Champions** → a champion opens the **champion window** (the shared centred
`DetailModal`), in the list's scope (season, game mode, account) and in the role of the row. It has
two views:

- **Overview:** the champion's games, win rate, KDA, CS and damage per minute and mastery; the
  proficiency and why; the lane against every opponent at 5, 10, 15 and 20 minutes (with the
  games behind each column); the opponents faced most; the latest games as match cards.
- **Matchups:** one lane opponent at a time, chosen in a searchable list ("Gwen vs Nasus", each
  option with its games and record) or from up to three frequent-opponent shortcuts:
  - games, record and win rate, always with the sample size; where the games came from (queue,
    account);
  - the lane chart: the average gold, experience or CS difference per minute (one selector),
    drawn only where at least 3 games reached the minute, single games as faint lines, a zero
    line; hover, touch or the arrow keys read one minute with its average and its games;
  - the checkpoint table and the cautious sentences;
  - every game behind the numbers as the shared match card. A game replaces the window with the
    match window (never two dimmed layers); its **Back** button returns to the same view.

A **Refine** button in the window's header changes the season, the game mode and (with several
linked accounts) the account, for the window and the list behind it.

The window lives in the URL (`?champion=Gwen&crole=TOP&tab=matchups&vs=Nasus`), so it can be
linked and reloaded; Back closes it. The old section addresses (`/overview/matchups`,
`/players/[id]/matchups`) redirect into it, keeping the champion, the opponent, the season, the
game mode and the account; without a champion, the most played one opens. Matchups is no longer a
profile section.

**Scope differences, disclosed in the window:** the Overview tiles count every game on the
champion in the role (as All Champions does); the lane figures count only Summoner's Rift games of
5 minutes or more with an identified lane opponent. The window defaults to all linked accounts, like
All Champions (the old Matchups page defaulted to the Main account).

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
| Lane-opponent reliability | The opponent is the enemy with the same `teamPosition`, the position Riot assigns on Summoner's Rift. The ledger stores it during the account sync. For each game shown, the details are checked again: exactly one enemy must hold that position, otherwise the game is counted as "lane opponent unclear" and contributes no lane figures. Games with no position (ARAM and other modes) are outside the synced queues. Remakes (under 5 minutes) are excluded. Lane swaps and roams are not detected: the position is Riot's assignment, not a reading of where the player stood. |
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

Nothing is fetched while a page renders. The champion window says how many of the games have a timeline, how many are still to be collected, how many Riot no longer provides, and how many have no clear lane opponent.

## How the numbers are made (`src/domain/matchups.ts`)

- **Alignment:** each value is read at an exact moment (10:00 = 600,000 ms) by interpolating linearly between the two frames around it, never by frame number.
- **Game length:** a game that had ended before a moment has no value there and is left out of that moment's figures. Every column shows the number of games behind it.
- **Direction:** differences are the player minus their lane opponent. The opponent is identified per game from the stored match details.
- **The graph:** gold, experience or CS, one at a time. Each game is a faint line, coloured by result. The average line is drawn only for minutes that at least 3 games reached; other minutes are a gap, never zero. With no such minute there is no curve, only the checkpoint table.
- **Sentences:** they appear only with at least 5 games that have a timeline at the moments compared. They describe what happened in these games, for example "ahead in gold at 10:00 in 6 of 8 games" or "the gold lead grew between 10:00 and 20:00". They never say "always", never give a reason, and there are no grades or advice. A fixed note says the pattern is not its cause.

## Access

The champion window has the same access as All Champions and Match History:
- players always see their own;
- teammates' matchups need *view teammate statistics*, checked on the server.

The page receives only figures. No PUUIDs, names or other players' identities are sent.

The default is every linked account. Refine offers each account, the season and the game mode.

## Known limitations

- Coverage depends on the backfill. On release, few games have frames; about 30 are added per hourly tick, which shares Riot's limits with ranked collection.
- Older games may have no timeline at Riot (shown as "no longer provided").
- The current season is the default; Refine chooses another one.
- Lane swaps (for example a bot-lane swap) follow Riot's assigned positions.
