# Ranked progress and LP per game

How UNIIVERSE records rank and LP, what it can and cannot know, and why. Code:
`src/domain/lp-attribution.ts` (one game's LP), `src/domain/rank-timeline.ts` (the chart),
`src/domain/ranked-year.ts` (the 2026 ranked year and its seasons), `src/server/accounts/rank-history.ts`
(readings), `src/server/jobs/rank-watch.ts` (the frequent readings), `src/server/jobs/rank-audit.ts`
(the read-only audit).

## What Riot provides, and what it does not

- **LEAGUE-V4** gives an account's **current** rank in each ranked queue: tier, division, LP, wins
  and losses of the ranked year. Nothing about the past: no earlier rank, no LP per game.
- **MATCH-V5** gives the games (queue, result, duration, when), with no rank or LP in them.
- So a rank at a past moment exists only where someone read it at that moment, and a game's LP
  change only where the rank was read just before and just after it. No Riot API, and no
  compliant source, holds the team's ranks from before UNIIVERSE started reading them.

## Why the history starts in mid-October 2026

Rank readings are stored in `rank_snapshots`, which shipped with migration `0035` on 15 October
2026. Before it, each sync replaced the account's current rank and kept nothing. Ranked progress
therefore starts at each account's first reading (15 or 16 October for the accounts linked then;
later for accounts linked later). It was never a date filter or a pagination limit: no earlier
reading exists anywhere. The retired features' tables hold none either (Ranked Development kept
no LP; the opponents' ranks were other players').

What does exist for the whole year, from **8 January 2026**: every ranked game, collected from
MATCH-V5 for each linked account (the season backfill). Riot's own wins + losses count is checked
against them (`rank-audit`). The rank itself before the first reading is **not recorded** and is
never estimated from those games.

## The 2026 ranked year: seasons, not splits

Riot calls the year "the 2026 Season" and its three parts "Season 1", "Season 2" and "Season 3"
(the /dev post on the apex reset, 21 April 2026; patch 26.9's "SR Ranked Season 2 will start at
12:00:00 noon, April 29, local server time"). Riot's 2026 ranked notes use neither "split" (the 2024
word) nor "act". The three seasons share **one ladder**: ranks reset once, on 8 January. Season 1
from 8 January (patch 26.1), Season 2 from 29 April (26.9; apex tiers hard-reset to Master 0 LP on
BR, EUNE, EUW, LAN, NA and TR only, "for all other players, nothing will change"), Season 3 from
29 July (26.15). The data agrees: LEAGUE-V4's wins + losses at each account's first reading count the
games stored since 8 January, not those of one season (`rank-audit`, 6 Nov: exactly for 12 of the 16
account/queue pairs with a reading, the store short by 1 to 6 games for the other four), so Riot's
count spans the year. Every linked account plays on OCE, where no season reset anything.

So Ranked progress does not offer the seasons as separate periods (it did until November 2026: Season
1 and Season 2 could only ever show "not recorded"). It names the season now ("2026 Season 3") and
marks the three seasons on the year's coverage strip. Games are placed by patch; a reading by date.

## What Ranked progress shows

Compact, in Profile Overview under the season card and Recent form (`ranked-progress.tsx`):

- **Now:** the crest, the current rank and LP (with how far into the division), and Riot's wins and
  losses for the ranked year with the win rate.
- **How it moved:** over the last 30 days, from the reading in effect when the window began (one
  seen by then and still confirmed then, or followed by its next reading within a single game) to
  the latest, labelled "Last 30 days". Where recording began inside the window, or several unseen
  games straddle its start, the first reading inside the window is the start and the label says
  "Since 16 Oct" instead: the figure never takes in games that were not read. A rank read before
  the window and confirmed inside it is "No change"; an account unranked now has nothing to compare.
  Same division (or Master and above): the LP difference. Across divisions: divisions gained or
  lost, no LP figure (LP restarts after a promotion). Never across a reset.
- **Highest recorded** rank and LP, with the day it was first read (the first time, if read again later).
- **The chart** (`rank-timeline-chart.tsx`, 120 px tall): only the stretch with readings, from the
  first reading to now (at least three days; the days before a newer first reading are hatched).
  No empty band for the months before it. Day and month ticks sit on the installation's midnights.
- **History and coverage** (closed at first, a native disclosure): the ranked year as one strip
  (every stored ranked game week by week, the three seasons marked, the stretch since the first
  reading lit, and "Rank known on N of M days": the installation's calendar days covered by a
  reading, from its first sight to its last confirmation, or between two readings at most one game
  apart, out of the days of the ranked year so far), what cannot be recovered and why, every rank change, the chart's
  key, and every reading (the newest 200) with its first and last time.

## LP per game: the rule

A game's LP is the difference between two readings of the account's rank in the game's queue, and
only when those two readings enclose that game and nothing else (`attributeLp`):

1. **Which game.** Riot's wins + losses counts the queue's games of the ranked year, so between two
   readings exactly as many games ended as that count rose. The stored games are matched to the
   count in the order they ended. If a game is missing from the store (not collected yet, or Riot
   never served it), or a stored game was not counted, the match breaks and nothing in that
   stretch is attributed. Remakes (under five minutes) are not counted by Riot and never take part.
2. **Nothing else in between.** The earlier reading must still have held when the game began:
   confirmed while it was played, or in the five minutes before it was created. A queue dodge, the
   only other LP change a player makes, happens in champion select and is followed by a six-minute
   queue lockout and another champion select, so none fits between that reading and the game. The
   later reading must come within about ten minutes after the game ended.
3. **One ladder.** Both readings ranked, in the same ranked season, and the wins or the losses up
   by exactly one, as the game's result says.

Then:
- **Same division, or Master and above** (one LP ladder): the LP difference, `+24 LP` / `−21 LP`.
- **A change of division**: shown as **Promoted** or **Demoted**, with no LP figure: the LP after a
  demotion is a placement in the lower division, not the LP the game cost.
- **100 LP below Master**: a promotion series; no figure.
- **Everything else**: `—`, with the reason in its tooltip (on hover, or a tap on a touch screen,
  which leaves the card closed) and for screen readers: before tracking, several games between the readings (their combined change is given for the run of
  games, never to one of them), readings too far from the game, a reset, placements, a game whose
  length is not stored, or Riot's count and the stored games disagreeing.

**What the readings cannot rule out.** A queue dodge in the minutes between a game's end and the
next reading would be counted with that game: Riot reports no dodges, so no tracker can separate
them. The same holds for decay (Diamond and above, after weeks without a game) in the last minutes
of a game, after its last reading during play; decay earlier in the game shows in that reading,
apart from the game. The rank watch keeps both windows to a few minutes. Every figure's tooltip
names the two readings it rests on, with their times, so it can be checked.

## Readings: when ranks are read

Each reading is one LEAGUE-V4 request per account, answering both queues. An unchanged reading
moves the last row's `confirmed_at` on (migration `0065`); a change is a new row. Each queue's
reading is one transaction holding a lock on that account and queue, so overlapping runs never
store the same values twice, and a reading older than the newest one (a slow answer) changes
nothing.

Readings come from:
- **account sync**, when each account is refreshed (every 45 minutes for active players at best,
  when a tick runs);
- **the rank watch** (`rank-watch`, in every tick and callable on its own), which reads the accounts
  that played ranked in the last 30 days every run, and the others about hourly. With a run every
  five minutes, each game has a reading while it is played and one a few minutes after it ends.

How often runs happen is what decides how many games get a figure:
- **Today (without a dedicated schedule):** ticks come from GitHub Actions (hourly, delivered four to
  six times a day), from visits (at most every 30 minutes while someone uses the site) and from
  Vercel's daily cron. Most games then fall between readings several games apart: `—`.
- **With the five-minute schedule** below: nearly every ranked game gets its figure.

### The five-minute schedule (Supabase pg_cron, free, installed by the app)

**Install it:** Actions → **Data jobs** → Run workflow → job `rank-schedule`. The app installs the schedule itself, from its own server, with the `CRON_SECRET` it already holds, so nobody types or sees the secret:
- it enables pg_cron and pg_net;
- it stores the secret in Supabase Vault (`uniiverse_cron_secret`);
- it schedules `uniiverse-rank-watch` every five minutes.

Running it again changes nothing, except that it updates the Vault copy after a change of `CRON_SECRET`. Only the production deployment installs it.
- **Check it:** Data jobs `rank-schedule-status` (read only). It reports whether the schedule exists, its runs of the last hour by status, and its calls by HTTP status. `/api/health` shows `rank-watch`'s last success, which should never be more than about five minutes old, and lists `rank-schedule` in `failingJobs` once the installed schedule has not called the app for 20 minutes (its direct calls of `/api/jobs/rank-watch` are recorded; a tick's rank watch does not count), which fails the next scheduled Data jobs run (docs/MONITORING.md). A run in which no account could be read is *degraded* with a count-only message, which Admin repeats.
- **After a change of `CRON_SECRET`:** run Data jobs `rank-schedule` again (it updates the Vault copy), then `rank-schedule-status`: `vaultMatchesServerSecret` should be `true` and the calls `200`. Until then every call is refused (401).
- **Remove it:** Data jobs `rank-schedule-off`. It unschedules the job and deletes the Vault copy, unless another pg_cron job still reads it (production's ten-minute `uniiverse-tick` does): then it keeps it and says how many jobs read it (`secretStillUsedBy`, a count only). To remove both, unschedule `uniiverse-tick` first (docs/DEPLOYMENT.md), then run `rank-schedule-off`.

`src/server/jobs/rank-schedule.test.ts` covers the guards and the command text. CI's Postgres has no pg_cron, so the SQL itself was run against a real pg_cron, with stand-ins for Vault and pg_net, when it was written.

**By hand instead** (the same result, if the job cannot run):

The database itself calls the rank watch every five minutes. Supabase includes pg_cron and pg_net
on the free plan; the secret is kept in Supabase Vault, not in the schedule's text.

In the Supabase dashboard → **SQL Editor**, replace `YOUR-APP` and `YOUR_CRON_SECRET` (the value of
the `CRON_SECRET` environment variable in Vercel, typed here and nowhere else) and run once:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
select vault.create_secret('YOUR_CRON_SECRET', 'uniiverse_cron_secret');
select cron.schedule(
  'uniiverse-rank-watch', '*/5 * * * *',
  $$ select net.http_get(
       url := 'https://YOUR-APP/api/jobs/rank-watch',
       headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'uniiverse_cron_secret')),
       timeout_milliseconds := 60000) $$);
```

`select * from cron.job;` lists it; `select cron.unschedule('uniiverse-rank-watch');` removes it.

What it costs: 288 short calls a day (Vercel function invocations, a few seconds each, within the
Hobby plan); about one LEAGUE-V4 request per active account per run (about 3,000 a day for ten
active accounts), within half of the Personal key's rate limits; a few kilobytes of database
traffic per run. No GitHub Actions minutes.

## Checking it

- **Data jobs → `rank-audit`** (read-only): per account and queue, Riot's count of the year's games
  at the first reading against the stored games, the queue's rows without a champion by kind (a game
  Riot refused for good, recorded with no start time, or one whose champion the list did not have),
  which say why Riot's count can exceed the stored games, the readings and the games between them,
  how many games have a figure and why the others have none, with the last few figures and the minutes
  between each game and its two readings; the 2026 seasons' first patches as stored; how often
  ranks were read; the year's games and readings week by week. Accounts appear as P1/A1 only.
- **Ranked progress → History and coverage**: every reading with its first and last time.
