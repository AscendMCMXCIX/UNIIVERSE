# Team insights

**Team → Matches → Insights** (`/matches/insights`) says what the team's own games show about
playing together, and which of it is more than chance.

Status: **an administrators' preview.** Members are sent to Team → Matches until the owner decides
(`TEAM_INSIGHTS_AUDIENCE` in `src/server/matches/team-insights-view.ts`; activation is that one value,
plus a link from Team → Matches if wanted). Nothing links to the page yet.

## What it compares

Every comparison sets a member's record in one kind of game against their record in another:

| Question | One kind of game | Compared with | How |
|---|---|---|---|
| With teammates or alone | games with at least one other member on their side | games with no other member in the game | within the same game mode and role (Mantel–Haenszel) |
| With one teammate | games with that teammate on their side | the member's games without them, alone or with others | every other teammate's presence held equal, within the same game mode and role (logistic regression) |
| The team lately | sides with two or more members in the last 30 days | the same earlier in the season | within the same game mode (Mantel–Haenszel) |

Why these designs:
- **Like with like.** A member who plays Jungle with friends and Mid alone would otherwise show a
  "teammate effect" that is really a role effect. Comparing within role and mode removes it (tested:
  `does not mistake a role difference for a teammate effect`).
- **One teammate, every other held equal.** The regression estimates all of a member's teammates at
  once (one indicator each; teammates with fewer than five games together are pooled as one). A
  teammate's figure is their own coefficient, so a teammate who often plays alongside a strong one is
  not credited with that teammate's games. A strong teammate also makes no one else look weak (tested:
  `finds the one teammate who makes a difference, and nobody else`, `a pair who always play
  together is not separated, and a teammate who avoids them is not blamed for their effect`).
- **What it does not separate.** Effects add up on the log-odds scale. A general benefit of playing
  with teammates shows in every teammate's figure; the with-teammates comparison measures that benefit
  on its own (tested: `shows a general benefit of playing with teammates in every teammate's figure,
  singling nobody out`).
- **Only what the games can tell apart.** Whether a teammate's figure can be estimated is decided
  exactly, from the design's null space. Two teammates who always play together, a teammate fixed by
  others (always with one of two), or a member with no games without teammates are reported as "not
  compared". They stay in the model, so the others are still held equal to them. They are never given
  an unstable figure (tests: the duo, pair and three-teammate scenarios in
  `src/domain/team-insights.test.ts`).
- **Members on both sides.** A game with members on both sides is left out of every comparison: it
  is one win and one loss for the team.

## When something stands out

- **Enough games:** a comparison is tested only with 20 comparable games on each side. Comparable
  means in a game mode and role that has games on both sides.
- **More than chance:** every tested comparison counts towards the Benjamini–Hochberg adjustment at
  a **5% false discovery rate**. Checking many pairs makes some look different by chance alone; the
  adjustment allows for that (tested on 40 seasons of pure noise: at most 5 with any finding).
- **Large enough to matter:** the difference must also be at least **5 points**, with its 95%
  interval clear of zero.
- **Findings' intervals** are widened for the number of findings among the comparisons checked
  (Benjamini–Yekutieli false coverage: level 1 − R·q/m). Picking the strongest results out of many
  would otherwise overstate their precision.
- **Statuses on the page:**
  - "Stands out";
  - "Under 5 points": more than chance after the adjustment, but smaller than the floor;
  - "Within chance";
  - "Waiting for more games";
  - "Not compared": these games cannot tell the teammate apart, or are too one-sided to estimate.
- **The detectable difference:** when nothing passes, the page gives about how large a difference the
  games so far could detect. That is the median half-width of the tested comparisons' intervals at the
  level a lone finding must reach after the adjustment (p ≤ 5%/m), and never less than 5 points.
- **One look at a time.** The 5% rate applies each time the page is worked out (on new games and each
  day). Looking again as games arrive gives chance more opportunities. Measured on 40 simulated seasons
  of pure noise (7 members, 1,200 games over 120 days), re-checked every two days from day 40:
  - 0 to 2 seasons had a finding at the last check;
  - 5 to 9 had one at some check (two different random generators).

  The page says so. A finding that comes and goes deserves less weight than one that stays. (A third
  generator, mulberry32, also produced a lopsided excess of negative findings when only the older games
  were kept. That was the generator, not the method: its consecutive draws are correlated under that
  selection.)

Each finding shows both records, the adjusted difference in win-rate points with its interval, and the
dates of the games.

## What it does not say

- **Why.** These describe the games played. Who plays together is a choice, and matchmaking adjusts
  opponents to results, so a difference is never a cause.
- **The future.** Nothing is predicted. No rating, score or recommendation is formed.
- **Party status.** Riot's match data does not say who queued together (see `docs/PLAYED_TOGETHER.md`).

## Which games count

- **Season:** the current season's supported Summoner's Rift games (`SEASON_MODES.all`); a game's season
  is read from its patch (`seasonOfGame`, as on Played Together).
- **Left out:** remakes (under five minutes; an unknown duration is not a remake, as on Leaderboards),
  games without a result, and games with members on both sides.
- **Members:** current members only (`listPlayers`). Several linked accounts of one member count once.
  A game where one member's accounts were on both sides is left out and counted.
- **Who was in a game** comes from two places:
  - each member's own stored game: the side copied from the record when the game was summarised,
    which survives a change of Riot key;
  - the game's stored record (every player's account), which finds a teammate whose own history does
    not reach back that far.

  A game whose side cannot be read either way is left out and counted.
- **After a change of Riot key:** games found only through a record are lost until the records are
  fetched again (`docs/RIOT_COMPLIANCE.md`). Everything else keeps working (tested).
- **Erased people** (`docs/PRIVACY.md`) have no PUUID in stored records and are never matched.

## Cost

- **Riot:** none. Only stored data is read.
- **Database:**
  - one read per computation: the members' season games, and their places in those games' records;
  - the records are expanded inside Postgres, so only compact `[match, member, side]` entries leave it,
    never the records;
  - matches and members travel as small numbers, so the answer is about 60 bytes per member game.
- **Cache:** the result is cached per team, keyed on the accounts and the season's stored games and
  records. Routine syncs that find nothing new do not recompute it; a new day does, so "the last 30
  days" moves on. Six hours is the most one server instance keeps an answer.
- **Measured** locally on Postgres 16 with a production-like volume (5,000 stored matches with full
  ten-player records, 14 accounts of 7 members, 7,657 member places), on the final code, 4 Nov 2026.
  Other test suites were running on the same four-core machine, so these are upper figures:
  - the read takes 98–116 ms and returns about 435 KB for 7,353 member games;
  - a cold page computation takes 709 ms, including the bookkeeping;
  - a cached one takes 20 ms.
  - On an idle machine, before the review changed the read (it now also reads each member's own
    stored side), the same data took 87–89 ms, 491 ms and 13 ms.
  - The same data as separate rows with ids was about 1.9 MB as JSON.
  - Production's season is smaller: about 4,000–5,000 member games.
- **Page:** server-rendered, no client JavaScript of its own (the disclosures are `<details>`).

## Checking it against production before activation

`Data jobs` → `data-audit` (read only) reports `teamInsights`, with anonymous labels (p1, p2…) and counts
only:
- the games read and left out;
- every comparison, with its sides' games, the difference and interval in points, the adjusted
  p-value, and whether it is a finding;
- the typical detectable difference;
- `placesMissingFromOwnHistory`: members' places in the season's stored records that are missing from
  that member's own history. Played Together reads the histories, so it misses those games. A non-zero
  count points at a gap in that member's own season history: a game the sync never stored for them
  (`docs/DATA_PIPELINES.md` describes how the history is collected). Since 6 Nov 2026 it also says why,
  for the account the record names:
  - `reasons.unavailable`: the account has the game as a row Riot refused (no time, or its record gone);
  - `reasons.withoutChampion`: the account has the game, stored without a champion;
  - `reasons.noRow`: no row at all. `noRow` splits these by the game's queue (`unsupportedQueue`: a
    queue the sync does not collect) and by where the game falls in that account's stored history:
    `beforeOldestGame`, `afterNewestGame`, or `insideHistory`: a game inside the stored range that the
    sync did not store, which points at the list or the sync rather than at how far back it reached;
  - `byMember`: places per anonymous label.

## Code and tests

- `src/domain/stats/inference.ts`:
  - Mantel–Haenszel risk difference with Sato's variance;
  - the CMH test with R's continuity correction;
  - the Wilson interval and Benjamini–Hochberg.
  - Reference values from SciPy and statsmodels; interval coverage checked by seeded simulation.
- `src/domain/stats/logistic.ts`:
  - a grouped logistic regression that refuses singular or separated fits; it matches statsmodels'
    GLM to 8 decimals;
  - the design's pivots and null space, and the test for which coefficients the data can estimate.
- `src/domain/team-insights.ts`: the comparisons and their rules. Its tests use seeded synthetic seasons:
  - a real effect is found;
  - pure noise stays quiet;
  - a role confounder is removed;
  - a single strong teammate is singled out without making others look weak;
  - duo partners, an always-together pair, and a teammate fixed by two others are each handled as
    above;
  - inseparable teammates are refused;
  - the input order does not matter;
  - 12,000 synthetic matches (about 15,600 member games) take about 0.35 s, generation included.
- `src/server/matches/team-insights.ts`: the reads, the cache and the audit section. Tested in
  `tests/db/team-insights.test.ts` on PGlite and Postgres 16:
  - teammates found from records;
  - personal-use and erased players are never members;
  - exclusions are counted;
  - the cache and membership changes behave;
  - the audit is anonymous.
- `src/server/matches/team-insights-view.ts`: the access gate and the words. Unit tests check the gate
  and that the text never uses causal words. `src/components/matches/team-insights.test.ts` renders
  the states the demo cannot reach (findings, each status, the comparisons not checked).
- `e2e/team-insights.spec.ts`: the preview at three widths with axe, and a member sent back to Matches.
  The demo's games are synthetic and too few to test, so the browser test sees "Nothing has enough games".
