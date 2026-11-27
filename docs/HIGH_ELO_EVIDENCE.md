# Champion Intel: Master+ builds (high-elo aggregates, D2)

Anonymous statistics of what Master, Grandmaster and Challenger players choose in Ranked Solo/Duo
games, shown in Champion Intel's builds and runes as a second source beside the team's own games.
The owner approved high-elo aggregates in principle (OD4, 23 Nov 2026; D2, 26 Nov 2026): **develop
them, and keep collection disabled until every Riot registration, privacy, API and hosting
requirement is satisfied.** This file is the design, the guards, the budgets and the owner's exact
steps to switch it on. It replaces the Matchup Intel design of 23 Nov 2026 (`git show
6dfccdd:docs/HIGH_ELO_EVIDENCE.md`), whose code was reverted (`14a9f10`) and is now ported to the
builds.

**State (27 Nov 2026, Release 19): built, tested, merged, SWITCHED OFF.**

- Two keys, both required, and neither is on:
  1. **In code:** `HIGH_ELO_LADDER_REGISTERED = false` (`src/server/champion-builds/high-elo/switch.ts`).
     The Riot client has **no apex-ladder request** (LEAGUE-V4 `challengerleagues`,
     `grandmasterleagues`, `masterleagues`): `src/server/riot/api/endpoints.test.ts` refuses any
     request the registration does not describe, so no ladder can be read in this build whatever
     else is set. The sampler's client factory returns none (`sampler-client.ts`).
  2. **In the deployment:** `UNIIVERSE_HIGH_ELO_COLLECTION=on` (exactly), set by the owner in Vercel
     (Production). Unset. Never on the in-memory demo.
- **The hard guard:** the `high-elo-sample` job reads both keys and a Riot key on every run; without
  all three it returns at once ("off (not-registered, switch-off)"), makes no client, asks Riot
  nothing and writes nothing. The slice (`runHighEloSlice`) checks the gate again before it makes any
  client. The job has no interval while off, so the tick never runs it; an interval set in Admin
  cannot make it collect.
- **Visible state:** Admin → Data & Integrations → Data health shows "Master+ builds · Off" with every
  reason in words, what is stored and its size; `/api/health` says `highElo: { collection: "off" }`
  and nothing more; the Production check asserts that Champion Intel offers no Master+ source while
  `/api/health` says off.
- **Production reads nothing:** the page reads the counts only where it offers the source.

**Where it is in the code:**

| Part | File |
|---|---|
| Sampling and weights (Horvitz–Thompson), unchanged from 23 Nov | `src/domain/high-elo/sample.ts` (+ test, with the regional-bias simulation) |
| Counts (the builds' own kinds), effective size, the page's rows | `src/domain/high-elo/counts.ts` (+ test) |
| One player's build values, the builds statement's rules in TypeScript | `src/domain/champion-builds-observe.ts`; `tests/db/champion-builds-observe.test.ts` holds it equal to the SQL |
| A fetched game's observations | `src/server/champion-builds/high-elo/observe.ts` |
| The slice, the store and its retention, the abilities' ranks, the switches, the client factory, the state | `src/server/champion-builds/high-elo/` (`sampler.ts`, `store.ts`, `ranks.ts`, `switch.ts`, `sampler-client.ts`, `state.ts`) |
| The job | `src/server/jobs/high-elo-sample.ts` (last in the tick's order, 60 s at most, never due while off); the retention also runs in the daily housekeeping, `src/server/jobs/integrity.ts` |
| The tables | migration `drizzle/0072_high_elo.sql`, `src/server/db/schema/high-elo.ts` |
| The page | the Master+ source in `src/components/champion-lookup/champion-builds.tsx`, read by `src/server/champion-builds/load.ts` |
| Admin | `src/components/admin/high-elo-state.tsx` on Data & Integrations |
| The demo's counts (test data, in-memory demo only, shown only with the browser tests' cookie) | `src/server/demo/high-elo.ts` |
| Tests | the unit tests above, `src/server/champion-builds/high-elo/switch.test.ts`, `tests/db/high-elo.test.ts`, `tests/db/high-elo-job.test.ts` (the stored runs), `e2e/champion-builds.spec.ts` ("Master+ source") |

## What the page shows (once switched on)

In Champion Intel's builds, the queue choice gains a group "Master+ ranked games" with one option,
"Ranked Solo/Duo · all regions" (`source=master` in the address). It is always an explicit choice:
the default stays the team's Ranked Solo/Duo (OB2).

- **The same parts and the same rules** as the team's builds (CHAMPION_INTEL.md, "The choices": 10
  games and a tenth for "Most common"; 30 games, 15%, 2 points and a 99% difference interval above 0
  for "Highest win rate"), read on the counts' **effective number of games**, (Σw)²/Σw², never more
  than the games observed. Shares and win rates are weighted. No player is known, so the one-player
  guard has nothing to hold: the 30 effective games and the 99% test carry the rule.
- **The source line:** "From 1,240 Master+ games · all regions · patch 26.23". Its ⓘs: "1,240 games
  observed, worth 810 as a sample once weighted: figures and thresholds use 810." and "Anonymous
  counts from Master, Grandmaster and Challenger players' Ranked Solo/Duo games in every region,
  weighted by each region's players. No player is stored."
- **Empty:** "No Master+ games counted on patch 26.23 yet" (nothing counted); "Not enough Master+
  games on patch 26.23 yet" (under 20 effective games in every role), its ⓘ giving the effective count.
- **Patches:** the current one, the previous one added where the current has too few, said, exactly
  as the team's builds.
- **One rule set for both sources.** The builds' values come from `observeBuild`, which the database
  test holds equal to the team's statement over every demo record, queue by queue.

## How games are chosen (no regional bias)

The unit is a **Master+ player's game**: one high-elo player's build in one Ranked Solo/Duo game.

**A slice** (one run of `high-elo-sample`, every 120 minutes in the pilot, then hourly) works on the
four regional hosts in parallel (americas, europe, asia, sea). For each region:

1. **Pick one server of the region**, with probability in proportion to its Master+ population as
   last read (a server never read counts as average until it is).
2. **Read its three ladders** (Challenger, Grandmaster, Master); keep only the count in each tier.
   The lists stay in memory for this slice. **The team's own accounts are taken out of them** (every
   Riot account linked to a player profile, read once a slice, in memory only): a member is never
   sampled, never counted in a game, and never in the weights' population, so the counts are of
   players who are not members, as the privacy notice says.
3. **The window:** from the server's cursor to one hour ago, at most 24 hours (the weights scale for
   the part of a longer gap not read).
4. **Sample 6 players** uniformly from the server's Master+ players (a keyed hash of the slice).
5. **Read their Ranked Solo/Duo match ids** in the window.
6. **Fetch at most 8 games**, chosen uniformly from the ids found, each with its timeline.
7. **Observe every Master+ player of each game** (every player on the lists just read, members
   taken out, not only the sampled ones): their lane, champion, result and build values. The other
   players are left out: their rank is not known.

**Weights** (Horvitz–Thompson): each observation weighs one over the probability that the slice
included it: P(game found) = 1 − C(N−m, k)/C(N, k) (N the server's Master+ players, m the game's,
k sampled), times G/M when only G of the M games found are fetched, times the share of the gap read.
So the weighted sums estimate totals over every Master+ player's games, whatever the server's size
or how often it was visited; a game with several high-elo players is not over-counted. The unit test
simulates regions of very different sizes and shows the weighted share recovers the population's
where the unweighted one does not.

## What is stored (no identifiers)

Migration `0072_high_elo`: three tables, each with row-level security on, nothing granted to
Supabase's Data API roles, and `SELECT` for the backup role (docs/DATABASE_PERMISSIONS.md).

| Table | Holds |
|---|---|
| `high_elo_counts` | Per **champion**, patch, lane, region, opponent (`''`: every opponent), kind and value: n, Σw, Σw², Σw of the games won (and `wx`, `wx2`, reserved for Compare's lane figures, 0 here). The key leads with the champion, so the page's read (one champion, two patches) is a range of it |
| `high_elo_population` | Per server: the players in Challenger, Grandmaster and Master at the last read, and when |
| `high_elo_cursors` | Per server: the end of the last window read, visits and games |

- **Kinds:** the builds' own (games, timeline, runes, shards, spells, skills, start, boots, core,
  fourth, fifth), with the same values. `lane.*` is reserved for Compare's early-lane band (its own
  observer, its own pull request); none is written now.
- **Regions:** the build kinds for all regions together (`"all"`); the games per region as well, so
  the sample's spread can be said. Weighted sums add, so "all" is exactly the regions' sum. Per region
  for every kind would take about three times the storage (OB3).
- **Never stored, logged or returned:** PUUIDs, match ids, names, Riot IDs. They exist in memory
  during a slice only, so a deletion request Riot forwards has nothing to match (PRIVACY.md).
  `tests/db/high-elo.test.ts` refuses any column named like a player, game, account or Riot ID in
  `high_elo_*`, and checks every stored value has its kind's form and is under 60 characters (so no
  identifier can hide in one).
- **Nor in the job's runs:** a Riot error's own message names its route, and a match's route its id
  (`Riot API 503 on /lol/match/v5/matches/<id>`), so a failed region's reason in the summary
  (`job_runs`, `data_refresh_status`, kept 60 days) is Riot's status and the kind of failure only
  ("Riot API 503", "Riot API unreachable (network error)"), a database error its code, anything
  else its name and its message with every identifier and route taken out (`sampler.ts`
  `failureReason`); a refused key stops the run with Riot's words for it ("Riot API 403: the key was
  rejected…"), never the route it came on. `tests/db/high-elo-job.test.ts` runs the job as the
  scheduler does and reads the stored runs.
- **Retention:** counts of patches other than the current and the previous one are deleted by each
  slice before its regions, whatever they then do (out of today's games, over the storage cap, out
  of requests), and by the **daily housekeeping** (`integrity`) whether or not the collection runs:
  stopped (interval 0, the switch removed, no key) they still expire within a day of the next patch.
  Never everything: with no current patch known nothing is deleted.
- **Storage cap:** 40 MB (`HIGH_ELO_MAX_BYTES`). A slice that finds `high_elo_counts` larger writes
  nothing, its cursor included ("storage cap"); its old patches are deleted all the same. Deleting
  rows does not shrink the table on disk, so once over the cap the job stays stopped until the
  session acts (a hard stop, below). Modelled at about 10,000 sampled games a patch: about 12 MB a
  patch, 25 MB for the two kept.
- **Exactly once:** the counts and the cursor move in one transaction, from the cursor the slice read;
  a slice that stops writes nothing, and two at once cannot both count a window. The four regions
  write at once and share the "all" rows, so each writes its rows in the key's own order
  (`store.ts` `inKeyOrder`): two regions on the same rows wait for each other and never deadlock.

## Budgets (per day; the pilot's 120-minute slice, then hourly)

| Resource | Budget | Use |
|---|---|---|
| Riot regional hosts | 100 requests per 2 minutes each (Personal key, 20/s) | At most 30 requests a slice per region (120 a slice in all); 0.5 of a host's windows on americas, europe and asia, **0.25 on sea**, which the members' OC1 sync uses. A slice that runs out writes nothing and is read again next time |
| Riot platform hosts | The same, per server | 3 ladder requests per visit |
| Games | — | At most 8 a region a slice (32), **1,000 a day** (cap in `app_settings.high_elo_day`): about 385 a day in the pilot, about 770 hourly |
| Vercel Active CPU | About 480 CPU-s a day; about 100–150 used without deploys | Measured on 23 Nov: 2.5 ms a game and 2.8 ms a 6,000-player ladder locally; at four times that on Vercel, at most 0.5–1.5 CPU-s a slice, **at most 12–36 CPU-s a day** hourly. Each slice records `cpuMs` |
| Vercel Provisioned Memory | About 12 GB-h a day | At most 60 s × 2 GB a slice: 0.4 GB-h a day in the pilot, 0.8 hourly |
| Database storage | 500 MB, about 190 MB used | About 25 MB for two patches, capped at 40 MB |
| Database egress | 120 MB a day | Writes are not egress. **The job's own reads, each slice:** the item data (about 60 KB, cached 10 minutes, so cold on most slices), the abilities' ranks only (`ranks.ts`, about 7 KB, where the abilities' whole records, which the job's first version read, are about 0.6 MB), and the roster's keys, patches, cursors, populations, day's games, team accounts and table size (about 5 KB): about 70 KB a slice (12 KB measured on the test database, which holds no item data), **at most about 1.7 MB a day hourly**, 0.9 MB in the pilot; the daily housekeeping's retention adds one count. **The page's reads:** one champion's counts (about 1,000–3,000 summed rows, 60–180 KB) cached an hour, at most about 10 MB a day at the team's use. **Together at most about 12 MB a day** |
| Deploys | About 6 a day | Collection needs none; the enabling pull request is one |

**Guards:** a slice stops at 60 s or 120 requests; a 401 or 403 stops every region and the run; a
429 pauses that host; the daily cap stops it for the day; the storage cap refuses writes; Admin's
schedule (interval 0) stops it at once with no deploy.

## For the owner

Nothing is collected until steps 1–7 are done. The session does the enabling pull request and the
verification; every step below is the owner's.

**Now (no collection yet):**

1. **Riot Developer Portal** (https://developer.riotgames.com, signed in with the account that owns
   production's key):
   1. Open the application whose key production uses. It must be **Personal** and **Approved**
      (RIOT_COMPLIANCE.md items 1 and 7; the "Personal" confirmation is still outstanding).
   2. Replace the product's description with the text in RIOT_COMPLIANCE.md, "Proposed description
      for the registration" (after any edits listed under it for a part that did not ship), then
      save or submit.
   3. **Keep the same application and key.** Never create another application, and never move
      production to another application's key: Riot encrypts player ids per application, and every
      stored game's ids would change (RIOT_COMPLIANCE.md item 2).
   4. Tell the session: the date, the status after saving (Approved / Pending review / other), and
      any message from Riot.
   5. **If Riot says this collection needs a Production key:** stop and tell the session before
      applying. A Production key on a *new* application would need the re-keying job (item 2: about
      4,900 requests, rehearsed on a copy). Ask Riot whether the same application can be upgraded.
2. **Key type and rate limits:** the application's page shows the key's limits. Expected: Personal,
   20 requests every second and 100 every 2 minutes per host; the design fits them (at most 30
   requests a region a slice, a quarter of a window on `sea`). No Production key is needed for about
   770 games a day. Report what the page shows.
3. **Privacy notice:** approve this row of `/privacy`, "What is stored", which the enabling pull
   request adds with `PRIVACY_UPDATED` (`src/domain/privacy.ts`) set to that day:
   - **What:** "Anonymous high-elo statistics: from Ranked Solo/Duo games of Master, Grandmaster and
     Challenger players who are not members, in every region Riot's API serves, counts per patch,
     role and champion of the rune pages, summoner spells, skill orders, starting items, boots and
     completed items chosen, and of the games won. While a sample is taken, those players' Riot
     identifiers are used only in memory: no name, Riot ID, PUUID or match identifier is stored"
     (if Compare's band uses lane kinds, add ", and how the lane stood at 10 minutes" before ". While
     a sample is taken").
   - **Why:** "Champion Intel's builds and runes from Master+ ranked games, shown apart from the
     team's own".
   - **Who sees it:** "Members who may see teammates' statistics, as totals only".
   - **Kept:** "The current and previous patch; older counts are deleted automatically. They name no
     one, so there is nothing to remove for a person".
4. **Vercel readings** (OD5, still outstanding). Vercel → the project:
   - → Settings → Functions: is **Fluid compute** on (yes / no)?
   - → Usage, the last 7 days: **Fluid Active CPU** per day (CPU-seconds) and **Provisioned
     Memory** per day (GB-hours).
   - **To go ahead, all three must hold:** Active CPU at most **300 CPU-s a day** on average with no
     day above 350 (the plan allows about 480); Provisioned Memory at most **8 GB-h a day** (about 12
     allowed).
5. **Supabase readings.** Supabase → the project: → Reports / Database: **database size** at most
   **300 MB** of 500 (room for the 40 MB cap); → Usage: **egress** this cycle on a pace of at most
   3.5 GB of 5 GB. The session also runs Data jobs `db-usage` and sends its counts.
6. **Say "go".** The session opens the enabling pull request, which adds the three ladder requests to
   the Riot client (with `endpoints.test.ts`, RIOT_COMPLIANCE.md's "Endpoints used" and the
   registered description in `registration-description.test.ts` set to what was pasted), sets
   `HIGH_ELO_LADDER_REGISTERED = true` and returns the real client from `samplerClientFor`, and adds
   the privacy row with its `e2e/privacy.spec.ts` check and `PRIVACY_UPDATED`. It goes through CI and
   merges with your approval.
7. **Flip the switch, before that pull request merges**, so its one deploy carries both keys: Vercel
   → Project → Settings → Environment Variables → Add: Key `UNIIVERSE_HIGH_ELO_COLLECTION`, Value
   `on`, Environment **Production only** → Save. A variable reaches a deployment only when it is
   built, so set it first: no extra redeploy.

**Decisions (recommended answers):**

| Decision | Recommended |
|---|---|
| OB1: the D6 rule (30 games, 99%, one-player guard) | Yes |
| OB2: Master+ an explicit choice, the team's Ranked Solo/Duo staying the default | Yes; revisit after a month of counts |
| OB3: build kinds stored for all regions together, only the games per region | Yes: about 25 MB instead of about 80 MB for two patches |
| OB4: win rates from fewer than 30 games in the tertiary colour | Yes |

**The pilot and the verification** (the session runs these; the owner only reads Vercel):

1. **The deploy of the enabling pull request:** the Production check runs by itself; expect
   "/api/health says the Master+ builds' collection is on, and the builds offer Master+ source".
   Then **one Data jobs run** with `job: "high-elo-sample db-usage"`: expect regions "written" or
   "nothing new", at most 32 games and 120 requests, its `cpuMs`, and `high_elo_counts` in
   `db-usage`'s sizes.
2. **The pilot:** the job's default interval is 120 minutes while on. Admin → Data & Integrations →
   "Master+ builds" shows the last slice, today's games (at most 1,000) and the stored size. 3 days.
3. **Day 3, the owner:** the same Vercel readings and the Supabase size. **Continue if:** CPU added at
   most 30 CPU-s a day; memory added at most 1.5 GB-h a day; the table growing at most 4 MB a day; no
   401 or 403 in the job's summaries; at most one "out of requests" on `sea` a day. **Then** set the
   interval to 60 in Admin → Data & Integrations.
4. **Stop at any time:** set the job's interval to 0 in Admin (immediate, no deploy); or remove
   `UNIIVERSE_HIGH_ELO_COLLECTION` in Vercel and redeploy (key 2 off). Stored counts keep the current
   and previous patch and expire by themselves: the daily housekeeping (`integrity`) deletes older
   patches' counts whether or not the collection runs. **Hard stops**, for the session to act on:
   any day above 350 CPU-s or 10 GB-h; the table above 40 MB (the job then refuses to write by
   itself, and stays stopped: deleting rows does not shrink the table on disk); any key refusal.

## Not built, and why

- **The ladder requests themselves:** they join the client only in the enabling pull request, after
  the owner's registration update (`endpoints.test.ts`; the reason `14a9f10` reverted the 23 Nov work).
- **Per-region figures on the page:** the build kinds are stored for all regions together (OB3); only
  the sample's spread by region is kept.
- **Compare's lane figures from Master+ games:** the columns and the `lane.*` kinds are reserved; the
  band's own pull request adds its observer to the same sampler loop.
- **A GitHub Actions runner for more volume:** a new workflow and secret, which needs the owner's
  approval. Not proposed.
