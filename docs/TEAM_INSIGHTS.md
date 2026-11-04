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
| With one teammate | games with that teammate on their side | their other games with teammates | the other teammates, the role and the game mode held equal (logistic regression) |
| The team lately | sides with two or more members in the last 30 days | the same earlier in the season | within the same game mode (Mantel–Haenszel) |

Why these designs:
- **Like with like.** A member who plays Jungle with friends and Mid alone would otherwise show a
  "teammate effect" that is really a role effect. Comparing within the same role and game mode removes
  it (tested: `does not mistake a role difference for a teammate effect`).
- **One teammate, the others held equal.** Comparing "with B" against "with other teammates" makes B
  look weak whenever the others include an unusually strong teammate. The regression estimates every
  teammate at once, so one strong teammate does not make the rest look weak by their absence (tested:
  `finds the one teammate who makes a difference, and nobody else`).
- **Within games with teammates.** The teammate question uses games with teammates only, so
  "playing with the team" and "playing with this person" stay separate questions.

## When something stands out

- **Enough games:** a comparison is tested only with at least **20 comparable games on each side**
  (comparable: in a game mode and role that has games on both sides).
- **More than chance:** every tested comparison counts towards the Benjamini–Hochberg adjustment at
  a **5% false discovery rate**. Checking many pairs makes some look different by chance alone; the
  adjustment allows for that (tested on 40 seasons of pure noise: at most 5 with any finding).
- **Large enough to matter:** the difference must also be at least **5 points**.
- **Teammates who always play together** cannot be told apart. They are listed as not tested rather
  than given an unstable figure.

Each finding shows both records, the adjusted difference in win-rate points with its 95% interval,
and the dates of the games. When nothing passes, the page says so, with about how large a difference
the games so far could detect (the median half-width of the tested comparisons' intervals).

## What it does not say

- **Why.** These describe the games played. Who plays together is a choice, and matchmaking adjusts
  opponents to results, so a difference is never a cause.
- **The future.** Nothing is predicted. No rating, score or recommendation is formed.
- **Party status.** Riot's match data does not say who queued together (see `docs/PLAYED_TOGETHER.md`).

## Which games count

- **Season:** the current season's supported Summoner's Rift games (`SEASON_MODES.all`); a game's season
  is read from its patch (`seasonOfGame`, as on Played Together).
- **Left out:** remakes (under five minutes; an unknown duration is not a remake, as on Leaderboards)
  and games without a result.
- **Members:** current members only (`listPlayers`). Several linked accounts of one member count once.
  A game where one member's accounts were on both sides is left out and counted.
- **Who was in a game** comes from the game's stored record (every player's account), not from the
  other members' own histories. A teammate whose history does not reach back that far is still found.
  A game whose record is not stored yet is left out and counted.
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
  ten-player records, 14 accounts of 7 members, 7,657 member places, 4 Nov 2026):
  - the read takes 87–89 ms and returns about 439 KB;
  - a cold page computation takes 491 ms, including the bookkeeping;
  - a cached one takes 13 ms.
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
  count points at a history gap (see the ingestion findings in the session report).

## Code and tests

- `src/domain/stats/inference.ts`:
  - Mantel–Haenszel risk difference with Sato's variance;
  - the CMH test with R's continuity correction;
  - the Wilson interval and Benjamini–Hochberg.
  - Reference values from SciPy and statsmodels; interval coverage checked by seeded simulation.
- `src/domain/stats/logistic.ts`: a grouped logistic regression that refuses singular or separated fits.
  It matches statsmodels' GLM to 8 decimals.
- `src/domain/team-insights.ts`: the comparisons and their rules. Its tests use seeded synthetic seasons:
  - a real effect is found;
  - pure noise stays quiet;
  - a role confounder is removed;
  - a single strong teammate is singled out without making others look weak;
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
  and that the text never uses causal words.
- `e2e/team-insights.spec.ts`: the preview at three widths with axe, and a member sent back to Matches.
  The demo's games are synthetic and too few to test, so the browser test sees "Nothing has enough games".
