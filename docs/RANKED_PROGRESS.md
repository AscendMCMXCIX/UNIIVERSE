# Ranked progress and LP per game

How UNIIVERSE records rank and LP, what it can and cannot know, and why. Code:
`src/domain/lp-attribution.ts` (one game's LP), `src/domain/rank-timeline.ts` (the chart),
`src/domain/ranked-year.ts` (the 2026 ranked year), `src/server/accounts/rank-history.ts`
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
MATCH-V5 for each linked account (the season backfill). Ranked progress draws those games week by
week under the rank, for the whole year, and Riot's own wins + losses count is checked against them
(`rank-audit`). The rank itself before the first reading is shown as **not recorded**.

## The 2026 ranked year

One ladder from 8 January 2026, with three seasons that share it (no reset between them on OCE):
Season 1 from 8 January (patch 26.1), Season 2 from 29 April (26.9; apex tiers hard-reset on BR,
EUNE, EUW, LAN, NA and TR only), Season 3 from 29 July (26.15). Games are placed by patch; a reading
by date. Ranked progress opens on the whole year and offers each season on its own.

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

### The five-minute schedule (Supabase pg_cron, free, one-time setup by the owner)

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
- **Ranked progress → Show the readings**: every reading with its first and last time.
