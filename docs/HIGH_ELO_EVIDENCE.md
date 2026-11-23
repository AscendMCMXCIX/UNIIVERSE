# Matchup Intel: high-elo evidence (OD4)

The plan for Matchup Intel's statistics from high-elo ranked games: the owner's decision (OD4), the design, the budgets, and the checks that come before anything is collected. Detail of the earlier, single-region design is in the overhaul's `docs/overhaul/mi-evidence.md` and `PLAN.md` S10 (branch `overhaul/plan`); where they differ, this file is right.

**State (23 Nov 2026): built and tested, switched off, not merged.**

- The code is on a draft pull request, with collection switched off (`HIGH_ELO_COLLECTION_ENABLED = false`, `src/server/matchup-intel/high-elo/switch.ts`).
- It is merged only after the owner's registration update (check 1 below), because it adds the three ladder requests to the client, and `endpoints.test.ts` lists only requests the registration describes.
- Off, the job makes no Riot request, writes nothing and the tick never runs it; the page shows the line it shows today: "No high-elo evidence (not collected)".
- Nothing is collected until the owner's checks below are done and a further pull request turns the switch on.

**Where it is in the code:**

| Part | File |
|---|---|
| Sampling, weights, counts, statistics, the page's lines | `src/domain/matchup-intel/high-elo/` (`sample.ts`, `counts.ts`, `lines.ts`) |
| A game's observations (the team evidence's own rules) | `src/server/matchup-intel/high-elo/observe.ts` |
| The slice, the store, the switch | `src/server/matchup-intel/high-elo/` (`sampler.ts`, `store.ts`, `switch.ts`) |
| The job | `src/server/jobs/high-elo-sample.ts` (last in the tick, 60 s at most) |
| The tables | migration `drizzle/0068_high_elo.sql`, `src/server/db/schema/matchup-evidence.ts` |
| The page | `src/components/matchup-intel/high-elo-panel.tsx`, in the evidence fold |
| Tests | the modules' unit tests (a simulation shows the weights remove regional bias), `tests/db/high-elo.test.ts`, `e2e/matchup-intel-high-elo.spec.ts` |
| The demo's counts (test data, in-memory demo only) | `src/server/demo/high-elo.ts` |

## The owner's decision (23 Nov 2026)

OD4 asked whether UNIIVERSE may collect anonymous aggregate statistics from high-elo ranked games of players who are not members. The owner approved it and widened it beyond the plan's single region:

- **All regions Riot's API serves**, not one region and not OCE alone.
- **Master, Grandmaster and Challenger** players (the plan had Challenger and Grandmaster).
- **Global statistics by default**, with optional regional breakdowns.
- **The current patch first.**
- **Accurate sample sizes**, and observed statistics kept clearly apart from curated matchup advice.
- **No regional bias**, and no conclusion drawn from a small sample.
- **Collected incrementally**, within Riot's policies and rate limits.
- **Sustainable on Vercel Hobby.**
- **Only the aggregated counts this feature needs**: no player identifier stored.
- **Nothing fabricated**: a missing figure is said to be missing, and nothing is a recommendation.
- **The same interface**: no new tab, no new scrolling.
- **Collection stays off** until policy compliance and the resource limits are verified (below).

## What the page shows

Inside Matchup Intel's existing evidence fold (the one it shares with Riot's tips), as a third section after "In your games" and "In the team's games". The fold stays closed by default, so the one-screen fit at 1440 × 900 and on phones is unchanged.

- **Its title says what it is:** "Observed in Master+ ranked games · all regions · patch 26.23 (n = 1,240)". It is never called advice, a recommendation or "best", and the curated briefing above keeps its own label.
- **A region switch** (All regions, Americas, Europe, Korea and Japan, Southeast Asia and Oceania) is the shared segmented control. All regions is the default. Each region shows the same lines from its own games, with its own n.
- **The lines**, each with its n and its interval:

  | Line | Shown from | What it says |
  |---|---|---|
  | Games and result | 30 games (effective) | "1,240 games · 51% won (95% interval 48–54%)". When the interval includes 50% it says so; nothing is "favoured". |
  | Against the chosen opponent | 100 games (effective) | The same, for games where Riot's positions confirm the lane opponent. Under 100: "37 against Darius, fewer than the 100 a line needs", and the lines below are the champion's in that role, against anyone, said as such. |
  | Keystone, summoner spells, starting items, first completed item, first three skill points, skills to five points | 100 games (effective) | The most common value with its share, and every other value at 15% or more: "Conqueror 62% · Grasp of the Undying 21%". A share, never a win rate per choice. |
  | Lane end | 30 measured games | The middle half and the median, by the team evidence's rule (never one minute). |

- **Under a threshold** the line says how many games there are and how many it needs. A region with no games says so.
- **Patches:** the current patch only. The previous patch is counted too, labelled, only where Riot's per-version data shows no change for the champion and what the line names. This is the team evidence's rule (`patchesFor`).
- **Production without data** (switch on, nothing counted yet) says "Master+ games: none counted on patch 26.23 yet".

## How games are chosen (no regional bias)

The unit is a **Master+ player's game**: one high-elo player's choices in one ranked Solo/Duo game.

**A slice** (one run of the `high-elo-sample` job inside the existing tick, hourly by default) works on the four regional hosts in parallel (americas, europe, asia, sea). For each region:

1. **Pick one platform of the region**, with probability in proportion to its Master+ population as last read. Bigger servers are visited more often, every server is visited, and a server never read counts as average until it is read.
2. **Read its three ladders** (Challenger, Grandmaster and Master, Solo/Duo) and keep only the count of players in each tier. The lists themselves stay in memory for this slice.
3. **Choose the window:** from the platform's cursor to one hour ago, at most 24 hours. A longer gap is covered by its last 24 hours, and the weights below scale for the part not read.
4. **Sample k players** (6 by default) uniformly from the platform's Master+ players, by a keyed hash of the slice.
5. **Read their Solo/Duo match ids** in the window, one request each.
6. **Fetch at most G games** (8 by default), chosen uniformly from the ids found, each with its timeline.
7. **Observe every Master+ participant of each game:** every player in it who is on the platform's lists just read, not only the sampled ones. A game's other players are left out, because their rank is not known.

**Weights** (Horvitz–Thompson). Each observation is weighted by one over the probability that this slice included it:

- P(game found) = 1 − C(N−m, k) / C(N, k), where N is the platform's Master+ players and m the game's Master+ participants;
- times G / M when only G of the M games found are fetched;
- times the share of the gap the window covers.

The weighted sums therefore estimate totals over every Master+ player's games, whatever the server's size or how often it was visited:

- **Global figures** add every region's weighted sums.
- **A region's figures** add only its own.
- Bigger regions count for more because they have more Master+ games, not because they were sampled more.
- A game with several high-elo players is not over-counted.

**Accurate sample sizes:**

- Every line states **n**, the games actually observed.
- Thresholds and intervals use the **effective sample size**, (Σw)² / Σw², which is never larger than n.
- Intervals are Wilson intervals on the weighted share at the effective size, at 95%.

## What is stored (no identifiers)

Migration 0068 adds three tables. Each has row-level security on, nothing granted to Supabase's Data API roles, and `SELECT` for the backup role (docs/DATABASE_PERMISSIONS.md).

| Table | Holds | Size |
|---|---|---|
| `mi_high_counts` | Per patch, region, role, champion, opponent (empty for all opponents), kind and value: n, Σw, Σw² and Σw for the games won | Kinds: games, keystone, spells, start, first item, skills, skills to five, lane end in 30-second buckets. Against an opponent, only games and lane end. At most about 20 MB for two patches |
| `mi_high_population` | Per platform: the players in Challenger, Grandmaster and Master at the last read, and when | 17 rows |
| `mi_high_cursors` | Per platform: the end of the last window read, visits and games | 17 rows |

- **Kept only in memory, during a slice:** PUUIDs, match ids and Riot IDs. They are never stored, logged or returned, so a deletion request Riot forwards has nothing to match.
- **A schema test** refuses any `puuid`, `match` or `riot_id` column in `mi_high_*`.
- **Retention:** each slice deletes counts older than the previous patch.
- **Exactly once:** the counts and the cursor move in one transaction, and the cursor moves only from the value the slice read. A slice that stops writes nothing, and two at once cannot both count a window.

## Budgets (per day, at the default hourly slice)

| Resource | Budget | Use |
|---|---|---|
| Riot regional hosts | 100 requests per 2 minutes each | At most about 22 requests a slice per host, so about 530 a day per host, under 1% of a host's daily capacity. Shares: 0.5 of a window on americas, europe and asia; 0.25 on sea, which the members' sync uses |
| Riot platform hosts | The same, per platform | 3 ladder requests per visit |
| Games | — | At most 32 a slice, about 770 a day, about 10,000 a patch; observations several times that |
| Vercel Active CPU | About 480 CPU-s a day for everything; about 100–150 used | Measured locally (23 Nov): 2.5 ms to read and observe a game (a 374 KB timeline) and 2.8 ms to read a 6,000-player ladder. At four times that on Vercel, at most about 0.5 CPU-s a slice, about 12 CPU-s a day. Each slice's summary records its CPU time (`cpuMs`), and the pilot reads it |
| Vercel Provisioned Memory | About 12 GB-h a day | At most 60 s a slice × 2 GB × 24, which is 0.8 GB-h |
| Database storage | 500 MB plan, 181 MB used | At most about 20 MB for two patches |
| Database egress | 120 MB a day | Writes are not egress; a page reads at most a few hundred rows, cached per instance |
| Deploys | About 6 a day | None once it is built |

**Guards:**

- A slice stops at 60 s or 120 requests.
- A 401 or 403 stops the run.
- A 429 pauses that host (Retry-After).
- The interval is Admin's schedule: 0 turns it off without a deploy.
- A daily cap (1,000 games) stops it for the rest of the day.

## Before collection is switched on (the owner's checks)

1. **Riot's registration.** Update UNIIVERSE's product description in the Developer Portal to cover high-elo aggregate collection in every region, and confirm the application stays Approved. The existing key and application are kept; the pending higher-limit application is separate. A draft for the Matchup Intel part:

   > Matchup Intel also shows aggregate statistics from high-elo ranked games, without specific players: about once an hour it reads the Challenger, Grandmaster and Master Solo/Duo ladders of one server per region (LEAGUE-V4), recent ranked match ids of a few of those players, and those matches and timelines (MATCH-V5), and reduces them at once to counts per patch, region, role and champion (and lane opponent): keystones, summoner spells, starting items, first completed items, skill order, results and the lane's end. No player identifier, name or match id is stored, nothing is shown about any player, counts older than the previous patch are deleted, and it uses a small share of the key's rate limits.

   With it, `endpoints.test.ts` and RIOT_COMPLIANCE.md's "Endpoints used" gain the three ladder paths. This is the branch's change, merged only after the owner's update.
2. **The privacy notice** (OD9's part for OD4): say that aggregate statistics of non-members' ranked games are kept, without identifiers.
3. **Resource baseline (OD5).** One Vercel Usage reading (Fluid Active CPU, Provisioned Memory) before switching on.
4. **The pilot.** Switch on with the slice every 120 minutes for 3 days, read Usage again, then go to hourly. The pilot records the per-slice CPU and the method rate limits Riot reports.

Then a pull request sets `HIGH_ELO_COLLECTION_ENABLED = true`: its CI, deploy and Production check, as for any change.

## Not built, and why

- **A win rate per build or rune page:** it needs thousands of games per arm, which a personal key does not reach, and builds follow game state.
- **Power spikes and wave guidance:** nothing in the records measures them honestly; the page keeps saying so.
- **The other nine players' ranks:** unknown, so their choices are not counted.
- **A GitHub Actions runner** for more volume (the plan's Tier 2): a new workflow and secret, which needs the owner's approval. Not proposed now.
