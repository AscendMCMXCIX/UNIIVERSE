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
account/queue pairs with a reading, the store short by 1 to 6 games for the other four, which also
hold rows stored without a length that may be those games: `withoutLength` under "Checking it"),
so Riot's count spans the year. Every linked account plays on OCE, where no season reset anything.

So Ranked progress does not offer the seasons as separate periods (it did until November 2026: Season
1 and Season 2 could only ever show "not recorded"). It names the season now ("2026 Season 3"); the
year's coverage strip that marked the three seasons left the page on 18 Nov 2026 (below). Games are
placed by patch; a reading by date.

## What Ranked progress shows

Compact, in Profile Overview (`ranked-progress.tsx`): at the top of the right-hand rail, level with the season card and above Recent form (the owner's order of 23 Nov 2026, Release 16), from a 1440px window; beside the season card from a 58rem dashboard, Recent form across the width under them; on a phone after the season card and before Recent form, the same order:

- **Now:** the crest, the current rank and LP (with how far into the division), and Riot's wins and
  losses for the ranked year with the win rate.
- **How it moved:** over the last 30 days, from the reading in effect when the window began (one
  seen by then and still confirmed then, or followed by its next reading within a single game; that
  game may have been played shortly before the window began, and the figure then includes it) to
  the latest, labelled "Last 30 days". Match History's summary and Team's detail panel give the same
  figure, in ladder points, by the same rule. Where recording began inside the window, or several unseen
  games straddle its start, the first reading inside the window is the start and the label says
  "Since 16 Oct" instead: the figure never takes in games that were not read. A rank read before
  the window and confirmed inside it is "No change"; an account unranked now has nothing to compare.
  Same division (or Master and above): the LP difference. Across divisions: divisions gained or
  lost, no LP figure (LP restarts after a promotion). Never across a reset.
- **Highest recorded** rank and LP, with the day it was first read (the first time, if read again
  later): behind the ⓘ beside the current rank, with the account, the season and the first check
  ("Name#TAG · 2026 Season 3 · rank recorded since 14 Oct 2026"): two short sentences, about 20
  words. Until 25 Nov 2026 the tip also held the 30-day change's path ("From Gold III 47 LP to Gold IV
  97 LP") and "The record is Riot's count for the ranked year"; the owner's readability request (one
  concept a tip) left them to the change beside the rank and the record line's "· 2026 (Riot)" (the year at
  every width; "(Riot)" from a 21rem card, read out on a phone's narrower one). The card itself leads with the two figures it is for, the current
  rank and the 30-day change, on one row (the UX review of Release 13, owner item B3: the card had
  kept every figure in view and read as busy); on a touch phone both stay above its Fold, with the
  win-loss record and win rate under the rank.
- **One card, the same on every screen** (the owner's review of the phone's opened card, Release
  13): the title alone on its row, a phone's chevron at its end (on its own line only at 200% text on
  a 320px phone, never under the ⓘ's touch area); under the rank the queue switch and, with two or more
  linked accounts, one compact account select (`RankedAccountSelect`, each account by its in-game name
  in the player's order) together on one row at the card's start, wrapping only at a large text size;
  then the chart or its line. On a touch phone the controls and the chart are one part behind the
  Fold, which fades in under the rank (instant with reduced motion), nothing above it moving. From md,
  in a card of 24rem or more (the Overview's rail, a tablet's card across the width), the queue switch
  and the account select stand at the end of the title's row instead (Release 16: a row of their own
  cost the one-screen Overview 48px at 1440 × 900; the card is a grid of two columns whose body and
  details are display: contents there); there the account select is at most 7.5rem, a long name cut
  short (whole in its list): at 12rem it put the title on two lines, and the taller card cost Recent
  form's champion list a row at 1920 × 950 (the review's M5). In the 28rem rail of a 1440 × 900 window
  with the sidebar open the title still takes two lines beside a select, and Recent form lists one
  champion fewer there (the server's drawing lists one fewer in each height beside a select, so its
  first paint never runs past the window; the fitted list adds it back where it fits); the page still
  ends in the window (`e2e/home-layout.spec.ts`, every seeded
  member with a second account's select). A phone keeps them under the rank, as the owner's review asked. On a touch phone the title's ⓘ (what the chart shows) is folded away with the chart and comes back with it, so the phone's first screen keeps three ⓘ with Ranked progress above Recent form (UD.PO3).
- **The chart** (`rank-timeline-chart.tsx`, 7.5rem tall, 6rem in a narrow card such as a phone's:
  from 23 Nov 2026 it was stretched to the pools' end in the Overview's 2×2, which the review found
  made a few LP look like a swing, so it is compact) is drawn from two changes of rank or LP
  (`CHART_MIN_CHANGES`, `rankChanges`); with fewer, one quiet line says what was recorded instead,
  never a frame around a flat line or a single step, and never a movement it did not see: "Gold II
  46 LP since 3 Oct: no change recorded." for a rank and LP that never moved, however many checks
  confirmed them; "One change so far: Gold II 46 LP to Gold I 12 LP. A chart appears after the
  next."; "Unranked at every check so far." (`fewReadings`). The card has no
  rule or box inside it, only spacing. A reading seen alone (several unseen games on either side,
  such as the newest check) is its dot, with no wash under it: the wash of a run that narrow was a
  stray sliver down to the axis. The chart shows only the stretch with readings, from the
  first reading to now (at least three days; the days before a newer first reading are hatched).
  No empty band for the months before it. Day and month ticks sit on the installation's midnights.
  Its division lines are named in full ("Platinum II"; a tier's line "Emerald" where the range is
  too wide for every division); a narrow chart (under 25.5rem: a phone, a tablet's third) writes
  every line as match cards write a rank: "P2", a tier's line by its first division, "E4",
  Master's "M".
- **The card ends with the chart** (the owner's decision, 18 Nov 2026). The disclosure that sat
  under it, History and coverage (the ranked year's strip of stored games week by week with the
  days the rank is known, every rank change, the chart's key and every reading), was removed from
  the page. Presentation only: the readings, the rank changes and the history are stored and read
  as before, `rankedYearCoverage` (the coverage's calculation, `src/domain/rank-timeline.ts`) is
  unchanged and tested, and no job changed. The card's tracking line still names the season
  (`rankedSeasonAt`). The readings remain in `rank-audit`'s report (below).
  - **The weekly games are no longer read** (20 Nov 2026, PLAN S8a, as RC§5.3 delegated). The
    strip's stored ranked games week by week were still counted for every Overview with its
    statistics (`rankedWeeks`, one GROUP BY beside the readings' query, a few KB a view) after the
    strip left on 18 Nov; the query and each account's `weeks` are gone. `rankedYearCoverage`, which
    takes the weeks as an argument, keeps its tests; `rank-audit` counts its own.

## LP per game: the rule

A game's LP is the difference between two readings of the account's rank in the game's queue, and
only when those two readings enclose that game and nothing else (`attributeLp`):

1. **Which game.** Riot's wins + losses counts the queue's games of the ranked year, so between two
   readings exactly as many games ended as that count rose. The stored games are matched to the
   count in the order they ended. If a game is missing from the store (not collected yet, Riot
   never served it, or stored without a length), or a stored game was not counted, the match breaks
   and nothing in that stretch is attributed. The break shows at the first reading that counts the
   missing game if it was taken before the next stored game can have ended, or counts that game
   too. If it was taken later and does not count the next game yet, the next game is matched to the
   missing game's change instead. A next game of the other result is then left without a figure
   (the count and the games disagree), and so is one of the same result whose earlier reading is
   more than five minutes older than its start (rule 2: too far), as after a gap in the readings
   that started before the missing game. A next game of the same result whose readings pass rule 2
   is given the missing game's change ("What the readings cannot rule out", below). The rule
   assumes Riot counts each game within about ten minutes of its end. Remakes (under five minutes)
   are not counted by Riot and never take part.
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
apart from the game. The rank watch keeps both windows to a few minutes. Nor can a game Riot
counted that the store lacks (rule 1) be told from the next game of the same result when the last
reading without it was taken in the five minutes before that game began or during it (the missing
game still being played, or not counted yet), and no reading counted it until that game had ended
(Riot counting it late, or no reading in between). Every figure's tooltip names the two readings it
rests on, with their times, so it can be checked.

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
- **Without a dedicated schedule** (before 7 Nov 2026): ticks came from GitHub Actions (hourly,
  delivered four to six times a day), from visits (at most every 30 minutes while someone uses the
  site) and from Vercel's daily cron. Most games fell between readings several games apart: `—`.
- **With the five-minute schedule** below (running since 7 Nov 2026, 08:10 UTC): nearly every
  ranked game of an active account gets its figure.
- **An account idle for 30 days** (no ranked game and no rank change) is read about hourly, so its
  first game back usually has no figure, and in about a third of sessions neither does the second;
  from then on it is read every run. Expect `readings-too-far` and `several-games` for such games.

### The five-minute schedule (Supabase pg_cron, free, installed by the app)

**Install it:** Actions → **Data jobs** → Run workflow → job `rank-schedule`. The app installs the schedule itself, from its own server, with the `CRON_SECRET` it already holds, so nobody types or sees the secret:
- it enables pg_cron and pg_net;
- it stores the secret in Supabase Vault (`uniiverse_cron_secret`);
- it schedules `uniiverse-rank-watch` every five minutes.

Running it again changes nothing, except that it updates the Vault copy after a change of `CRON_SECRET`. Only the production deployment installs it.
- **Check it:** Data jobs `rank-schedule-status` (read only). It reports whether the schedule exists, its runs of the last hour by status, its calls by HTTP status, and when the app last recorded a call of this schedule and of the ten-minute tick (`callsRecordedByApp`, what `/api/health` reads). `/api/health` shows `rank-watch`'s last success, which should never be more than about five minutes old, and lists `rank-schedule` in `failingJobs` once the installed schedule has not called the app for 20 minutes (its direct calls of `/api/jobs/rank-watch` are recorded; a tick's rank watch does not count), which fails the next scheduled Data jobs run (docs/MONITORING.md). A run in which every account it tried failed, or which a full rate limit stopped before its first reading, is *degraded* with a count-only message, which Admin repeats; it still answers ok, so the schedule's call is not refused, and the next run reads again.
- **After a change of `CRON_SECRET`:** run Data jobs `rank-schedule` again (it updates the Vault copy), then `rank-schedule-status`: `vaultMatchesServerSecret` should be `true` and the calls `200`. Until then every call is refused (401).
- **Remove it:** Data jobs `rank-schedule-off`. It unschedules the job and deletes the Vault copy, unless another pg_cron job still reads it (production's ten-minute `uniiverse-tick` does): then it keeps it and says how many jobs read it (`secretStillUsedBy`, a count only). To remove both, unschedule `uniiverse-tick` first (docs/DEPLOYMENT.md), then run `rank-schedule-off`.
- **From Admin** (since 19 Nov 2026): both jobs are setup jobs, under Data & Integrations → Details → Advanced, for the Owner only, each run only once its phrase is typed (TURN ON, TURN OFF). On 18 Nov 2026 the schedule was removed by a one-click Run now among the read-only checks and nothing said so for 22 hours; now, while it is off after being on, `/api/health` carries the notice "LP five-minute schedule off since <day>" and every Production check warns about it (docs/MONITORING.md), until `rank-schedule` runs again. The jobs route (Data jobs, `CRON_SECRET`) runs both as before.

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
  at the first reading against the stored games, and the queue's rows that are not counted games:
  `withoutLength`, what the sync stores with the start time and the queue only (a remake, a game whose
  champion was still unknown three days after it, a game whose record does not name the account;
  which is which is not stored, and Riot counts the second kind, so where Riot's count exceeds the
  stored games these rows may be the difference); `withoutChampion.refusedForGood`, a listed game
  Riot refused for good, recorded with no start time; and `remakesWithLength` and
  `withoutChampion.championUnknownWithLength`, rows with a length under five minutes or with a
  counted length and no champion, which no version of the sync writes. Then the readings and the
  games between them, how many games have a figure and why the others have none, with the last few figures and the minutes
  between each game and its two readings; the 2026 seasons' first patches as stored; the rank changes
  recorded; the year's games and rank changes week by week. Accounts appear as P1/A1 only. Its
  `readings`, `lastReading`, `medianMinutesBetweenReadings`, weekly `soloReadings`/`flexReadings` and
  daily `cadence[].readings` count the stored rows, one per rank change (an unchanged reading confirms the last row and adds none), not
  how often ranks were read: for that, Data jobs `rank-schedule-status` (the schedule's runs and
  calls) and `/api/health` (`rank-watch`'s last success). Its LP tally reads the confirmations, as
  the match cards do, since #255.
- **Ranked progress**: the chart's readings, each with its time in the chart's tip (the list of every
  reading with its first and last time left the page with History and coverage on 18 Nov 2026;
  `rank-audit` still lists them).
