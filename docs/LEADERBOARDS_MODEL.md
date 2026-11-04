# Leaderboards: the proposed model

Status: **proposal, built and tested; awaiting the owner's approval of the rules.**
- **Built as recommended on 3 Nov 2026:** one Recent form board (overall, All games, ranked by win
  rate) and the Records & achievements tab. Left out of the launch: the role boards, the Ranked
  switch and the lane figure (sections 3 and 5 describe the full model).
- **Where the code is:**
  - `src/domain/leaderboard-recent.ts` and `src/domain/leaderboard-records.ts`;
  - the view in `src/server/leaderboards/recent-view.ts`;
  - the page in `src/components/leaderboards/recent-leaderboards.tsx`.
- **Who sees it:** administrators can open it on live data at `/leaderboards?preview=recent-form`.
  Members keep today's boards (`docs/TEAM_LEADERBOARDS.md`) until the owner approves.
- **Thresholds** were confirmed with the team's own figures (section 6; the 3 Nov data audit).

## 1. What is wrong with the current boards

- **Small samples win, large ones freeze.** Rankings are season averages behind a flat minimum of
  10 games (5 in a role). A player at 12 games and 75% ranks above one at 400 games and 56%. The
  first player's rate moves about 2 points with each game; the second's moves about 0.1, so the
  heavy player can hardly climb.
- **Role-dependent figures are compared across roles.** Highlights sets CS per minute, vision per
  minute and objective damage side by side as if comparable, but these are won by laners, supports
  and junglers respectively, whoever played best.
- **Too many choices.** Three things multiply:
  - eight categories;
  - a season;
  - five game scopes, six role choices and a lineup switch.

  That gives hundreds of views, and no answer to "how am I doing lately?"
- **Different kinds of numbers share one grid.** Averages, totals and single-game records sit
  together.

## 2. Principles

1. **Compare like with like.** Everyone is compared on the same number of recent games. A figure
   that depends on the role is compared only within that role.
2. **Say what counts.** Every row shows its games, its record and its dates.
3. **Equal opportunity, not equal results.** Playing more does not raise anyone's place. Nobody's
   figures are adjusted, weighted or normalised.
4. **One plain figure per column.** No composite "impact" score, no hidden formula.
5. **Two experiences, kept apart:** how players are doing lately (Recent performance), and what
   they have achieved (Records & achievements).

## 3. Recent performance (the default view)

### The window

- **A player's latest 20 eligible games from the last 60 days.**
- **An eligible game** is one of the supported 5v5 Summoner's Rift queues in the chosen mode (All
  games, or Ranked: Solo/Duo and Flex), at least 5 minutes long. Remakes are left out, as
  everywhere else in UNIIVERSE.
- **On a role board** only games played in that role count. The role is Riot's position for that
  game, not the player's preferred role.
- **It slides.** Each newly collected game enters and the oldest leaves. A game older than 60 days
  leaves even when no new game arrives, so the board ages with the calendar.
- **Missing figures.** A figure Riot did not provide for a game is left out of that figure only,
  never counted as zero. The figure then uses the latest 20 games that carry it, within the same
  60 days, and says how many it used.

### Status

| Games in the window | Status | On the board |
|---|---|---|
| 20 | Established | Ranked |
| 10–19 | Provisional | Listed after every established player, in order, marked "Provisional · 14 of 20 games"; never above an established player |
| 0–9 | Not enough recent games | Listed below the board: "Needs 6 more games", with the date of their last game |

### Boards and figures

| Board | Ranked by | Also shown (each can be chosen to rank by) |
|---|---|---|
| Overall | Win rate | Record (W–L), games, last game |
| Top | Win rate | KDA, CS per minute, damage per minute |
| Jungle | Win rate | KDA, kill participation, vision per minute |
| Mid | Win rate | KDA, CS per minute, damage per minute |
| Bottom | Win rate | KDA, CS per minute, damage share |
| Support | Win rate | KDA, kill participation, vision per minute |

- **Overall** ranks only win rate, the one figure that means the same in every role.
- **KDA and kill participation** shift with role (supports and junglers collect assists), so they
  appear on role boards only.
- **How figures are formed:**
  - win rate: wins over the window's decided games;
  - KDA: (kills + assists) over deaths, from the window's totals (deaths of 0 count as 1, as Riot's
    own KDA does);
  - per-minute figures: the window's total over its total minutes, never an average of per-game
    rates;
  - shares: the window's total over the team's total in the same games.
- **Ties** share a place, written "2=". Places, ties and gaps use each figure as the page shows it
  (win rate in whole points, KDA to two decimals), so two figures that read the same always share a
  place.

### Uncertainty, in plain words

- **Twenty games is a short window.** One game moves a win rate by 5 points, and 65% against 55% is
  two games.
- **Gaps are shown in games or in the figure's own unit**, never as a bare rank. For example: "1 win
  behind Demo Mid", "0.40 KDA behind Demo Top". The gap is to the place directly above; when
  several players share it, all are named ("3 wins behind Demo Mid and Demo Top").
- **No confidence interval** is drawn on the page, because a band most players cannot read is not
  honesty. The record (13–7) and the games stay visible on every row.

### What a player can do to climb

- **The window's next step is exact.** The next game replaces the oldest one in the window. Every
  established window has 20 games, so one win can at best draw level with the place above, and only
  when the window's oldest game was a loss. The page says so: "Win your next game to draw level with
  Demo Jungle".
- **Otherwise** it shows the gap in wins to the place above. When the oldest game was a win, a win
  only keeps the gap, so the row says "1 win behind", not "win your next game".
- **These notes assume the players above do not play in the meantime.** The page says this once,
  under the board.

### Inactivity

- **Sixty days.** A player who stops playing moves to provisional, then below the board, within 60
  days of their last games. They come back as soon as they play again.

### What this view does not do

- It has no season averages, no shrinkage towards a prior, no Elo-like rating and no
  cross-role ranking of role-dependent figures.
- **No shrinkage, because the window equalises samples.** Every established player has exactly 20
  games, so shrinking towards the team's mean would not change their order. It would only hide how
  provisional players are doing, and listing provisional players after established ones does that
  job openly.

## 4. Records & achievements

Single games and achievements, clearly labelled. More games give more chances here, which is
expected of a record.

- **Season records** (this season, all supported games; each opens its game):
  - most kills;
  - most assists;
  - most damage per minute (games of 15 minutes or more);
  - most CS per minute (15 minutes or more);
  - most vision score per minute (15 minutes or more);
  - best KDA in a game with 10 or more takedowns;
  - longest win streak.

  Each record shows the role and champion it was set on.
- **Multikills this season:** pentakills, quadra kills and triple kills per player, rarest first.
- **Champion milestones**, under their own "Lifetime and milestones" heading:
  - games on one champion this season (25, 50, 100);
  - Riot mastery points on a champion (100,000, 500,000, 1,000,000).

  Mastery is all-time by Riot's definition, so it never mixes with season figures.

## 5. Navigation

- **Two tabs:** Recent performance, Records & achievements.
- **Recent performance has one row of controls:**
  - a board (Overall, Top, Jungle, Mid, Bottom, Support);
  - a mode (All games, Ranked).

  No season or lineup choice is needed: the window is recent by definition, and the line under the
  title says which games count.
- **Records & achievements has one choice:** the season, current by default.
- **The table shows** each player's place, figure, record and games, the window's dates, and the
  gap to the place above. Choosing another column ranks by it, and the choice is kept in the
  address.

## 6. Thresholds, from the team's own data

**Preliminary**, from production on 2 Nov 2026 (data-audit):
- 2,215 Summoner's Rift games in the last 90 days across members' linked accounts, about 740 a
  month.
- Most members' newest game is from the last three days. One last played on 1 Aug. One account
  last played on 27 Sep, but its owner plays on others. One member has no games.

**What that means for the window:**
- At about 80 games a month for an active member, 20 games is one to three weeks of play.
- 60 days keeps occasional players on the board and removes those who have stopped.
- 10 games for provisional status is half the window: enough to show a trend, but never enough to
  rank above a full window.

**Confirmation before the page switches:** `data-audit` → `leaderboardSamples` (added with this
change) reads the members' games exactly as the boards count them (one per match per player,
members only, read only) and reports, for All games and for Ranked:
- per board: established, provisional and not-enough members; members with 10 or more games (those
  a 10-game window would rank); the median days an established member's 20 games span; how many
  established members share a place; and their win rates as the page would show them, without
  labels (how far apart the places are, and how often a 20-game window ties);
- per member (anonymous labels, as elsewhere in the audit): eligible games in the last 60 days,
  overall and per role, not capped at 20;
- whether each board passes the acceptance below.

Acceptance:
- at least 5 established members overall;
- at least 3 established members on each role board.

If a role board falls short, its window becomes 10 games (one documented change, the same for every
role), because a board of one or two players is not a competition.

## 7. Validation in code

`src/domain/leaderboard-recent.ts` and its tests cover:
- the window (latest 20, 60 days, mode, role, remakes);
- statuses and their order (no provisional player above an established one);
- figures computed from totals;
- missing figures;
- ties;
- the "win your next game" calculation, and that the note says "draw level" only when one win
  does that;
- that figures which read the same share a place;
- the audit's counts per board and mode, and that its read of the games matches the page's and
  copies nothing (`tests/db/leaderboard-samples.test.ts`);
- that playing more games never raises a player's place by itself;
- that a 10-game player at 80% does not outrank a 20-game player.
