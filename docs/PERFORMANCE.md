# Performance and stability

How UNIIVERSE is measured, what the measurements showed, what was changed, and the targets the
Draft Room is held to. Numbers below come from the `perf-probe` job (inside the production
function, against the production database) and from a local run of the same probe plus a
Playwright script against a PostgreSQL database seeded with 3,000 ranked games
(`scripts/perf-seed.ts`), which is the scale the all-region ingestion reaches within days.

## How to measure

- **Inside production**: Settings → Data jobs → `perf-probe` (or the *Data jobs* workflow with job
  `perf-probe`). Read-only. It times the exact service calls behind every page and draft action:
  database ping, session lookup, champions, players, lineup, statistics provider (cold and warm),
  Data health, proficiency, draft load, recommendation (first and repeated), matches, trends, pro
  patterns, player data report.
- **From outside**: the *HTTP probe* workflow times public paths (`/api/health`, `/login`,
  `/recover`) three times each from a GitHub runner (US East → Sydney, so about 0.3 s of the
  number is network).
- **Locally at scale**: `DATABASE_URL=… pnpm exec tsx scripts/perf-seed.ts 3000` then
  `pnpm exec tsx scripts/perf-probe-local.ts`.
- **Live logging**: every job run, slow step (> 1.5 s), slow action (> 0.8 s), slow draft-room
  load (> 2 s) and failure is one JSON line in the function logs (`event`, `ms`, `timings`),
  with secrets redacted. Settings → Diagnostics shows the build, the database round trip from
  the rendering instance, the last job runs with durations, backlog and recent errors.
- **Health**: `/api/health` answers in about 10 ms of server time with database round trip,
  auth mode, patch, data freshness and failing jobs; it never touches statistics or providers.

## What the measurements showed (before)

Production, 13 Oct 2026, commit decba40, region syd1, 330 effective ranked games:

| Step | ms |
| --- | --- |
| database round trip (`select 1`) | 3.8 |
| session lookup | 7 |
| user lookup | 8 |
| current patch | 7 |
| champions (173) | 21 |
| players, lineup | 15, 14 |
| **statistics provider, cold** | **395** |
| statistics provider, warm | 14 |
| **Data health (`getDataHealth`)** | **197** cold, 36 warm |
| trends report | 28 |
| `/api/health` TTFB from GitHub | 790 (first), 350 |
| `/login` TTFB from GitHub | 900 (first), 320 |

Locally with 3,000 games (128,110 matchup rows, 51,063 synergy rows): statistics provider cold
**1,086 ms**; every other step under 35 ms.

So the database is not slow (single-digit milliseconds per query from Sydney to Sydney). The
causes were architectural:

1. **The app layout ran Data health on every page**, which built the full statistics provider
   (all matchup and synergy rows), the 17-region coverage table (five aggregate queries) and an
   accounts aggregate. On a cold function that was 0.5–0.7 s before the page's own work, and it
   grows with the data (over a second at 3,000 games, several at all-region scale).
2. **Every draft action ran the recommendation engine twice** (once to snapshot "what was
   recommended", once for the new state) and re-read the draft three to four times.
3. **Draft history did one query per draft** (N+1).
4. **Every cold start took the migration lock in a transaction** even with nothing to apply.
5. Champions, patch, branding, team and custom formats were re-read on every page although they
   change a few times a year.
6. The live draft stream polled three queries per second per viewer.
7. Statistics tables were read without a sample floor: 87% of matchup rows (one game each)
   carried under 1% of the evidence and most of the bytes.
8. Scheduled jobs could overlap (two schedulers, or a manual run during a tick) and ingestion
   ran four parallel region workers against a five-connection pool with nothing left for pages.
9. No request/action timing, no error boundaries, no loading states: a slow or failed panel
   looked like a crash.

## What changed

- `src/server/ops/shell.ts`: the layout reads three tiny tables (patch, job status, period
  counts), cached 30 s per instance. Data health, coverage and the statistics description moved
  to Settings only, and the description is computed from the period tables, not champion rows.
- `src/server/stats/loader.ts`: the five statistics reads run in parallel, select only the
  needed columns and skip matchup/synergy rows below `MIN_PAIR_GAMES` (2). Cold load at 3,000
  games: 1,086 → 165 ms locally.
- `src/server/engine/service.ts`: recommendations are memoised per draft version for ten
  minutes (40 entries); a draft action runs the engine once and re-reads the draft once.
- `src/server/repositories/drafts.ts`: draft history is two queries.
- `src/server/db/migrator.ts`: no lock and no transaction when the ledger already lists every
  migration (one `SELECT` per cold start).
- `src/server/observability/cache.ts`: a small per-instance TTL cache for champions, patch,
  branding, team, custom formats, pro patterns and shell facts, invalidated by the writers
  (static sync, branding save, team update, format save, aggregation).
- `getAuthState` is wrapped in React `cache()`, so the layout and the page share one session
  and user lookup per request.
- Live stream: two queries every 2 s (controller names remembered per instance).
- Jobs: `startJobRun` claims the job atomically; a second scheduler gets `skipped` instead of
  duplicate work, and a run that died frees the key after 15 minutes. Ingestion runs at most
  `RIOT_INGEST_CONCURRENCY` (3) regional workers.
- Pagination: matches (60, *Show more*) and draft history (30, *Show more*).
- Timeouts: Leaguepedia 20 s and Oracle's Elixir 30 s per request (Riot and Data Dragon already
  had 15 s); bounded retries and backoff were already in place.
- Error boundaries and loading states: a route-level error page inside the shell, component
  boundaries around Riot data and professional patterns, skeletons for pages and the draft room.
- Draft room: an entered action appears on the board immediately and the recommendation panel
  is marked *Updating recommendation for the new state…* until the server answers; a rejected
  action reverts the board and shows the reason. No stale recommendation is ever shown as
  current.
- Indexes (migration 0004, evidence from the queries the pages run): `players(team_id,
  archived_at)`, `drafts(team_id, created_at)`, `job_runs(started_at)`.
- `/api/health` rewritten to be cheap and diagnostic; Settings → Diagnostics added.

## Targets

| Interaction | Target | Notes |
| --- | --- | --- |
| Local UI interaction (select role, type to search, pin) | immediate | client state only |
| Persist a manual draft action | < 300 ms server time | one engine run; measured per action in the logs (`draft.action`, `timings.apply`) |
| Recommendation update | < 500 ms | shown as *updating* meanwhile, never stale-as-current |
| Page TTFB, warm instance | < 300 ms server time | plus network |

## Numbers after

Local, same 3,000-game dataset, production build against PostgreSQL 16 on localhost, warm
process; medians of three runs (five for draft actions). "Before" is the same script on commit
decba40.

| Measure | Before | After |
| --- | --- | --- |
| login round trip (submit → Team page) | 1,571 ms | 310 ms |
| Team page TTFB | 142 | 56 |
| Players page TTFB | 76 | 24 |
| Player profile TTFB | 147 | 50 |
| My profile (`/me`) TTFB | 55 | 36 |
| Draft history TTFB | 193 | 31 |
| Matches TTFB | 87 | 73 |
| Trends TTFB | 81 | 49 |
| Settings TTFB | 99 | 51 |
| Draft room TTFB | 146 | 26 |
| draft action, click → local update | 153 | 71 |
| draft action, click → recommendation settled | 153 | 120 |
| save player pools, click → Team page | 175 | 166 |
| statistics provider, cold build | 1,086 | 165 |
| champions list (cold / cached) | 10 | 5 / 0 |
| `/api/health` (cold / warm) | 43 | 30 / 5.5 |
| recommendation, same draft state again | engine run | 0 (memo) |

Server-side timing of a draft action in the "after" run (from the `draft.action` log line):
auth 3–10 ms, apply incl. the recommendation 24–38 ms, total 27–50 ms.

Production figures are taken with `perf-probe` and the HTTP probe workflow after each deploy and
quoted in the deploy report; rerun `perf-probe` at any time for current numbers.

## Production finding: pipelined queries never answer through the pooler (2026-10-13)

The `perf-probe` job (Settings → Data jobs, or the data-jobs workflow with `job=perf-probe`)
runs the service calls behind every page inside the deployment. On 13 October every step
answered in milliseconds except Data health, and inside it only `getGlobalCoverage`: six small
queries issued as one `Promise.all` burst. The probe grew step timeouts, a stop-at-first-hang
rule and a connection ladder, which produced this table on the Vercel (syd1) → Supabase
transaction-pooler path:

| Experiment | Result |
| --- | --- |
| shared pool (max 5): 2, 4, 5 parallel queries | 3 ms, 3 ms, 12 ms |
| shared pool (max 5): 6 parallel queries | no answer in 25 s |
| separate client, max 8, 6 parallel queries | 85 ms (the host opens six connections fine) |
| separate client, max 4, 6 parallel queries | 79 ms |
| separate client, max 1, 6 parallel queries | no answer in 10 s |
| separate client, max 1, 6 parallel queries, `max_pipeline: 0` | 85 ms |
| separate client, max 4, 6 parallel queries, `max_pipeline: 0` | 76 ms |

Cause: when every pooled connection is busy, postgres-js *pipelines* further queries onto busy
connections (it writes the next query before the previous one has answered). Through the
transaction pooler such a query never gets its answer, so any burst larger than the pool hung
the whole request. The same queries run one at a time, or on separate connections, take
milliseconds. `max_pipeline: 0` is not an option because postgres-js needs one pipeline slot to
mark a connection reserved for `BEGIN`.

Fix: `src/server/db/gate.ts` keeps the number of queries in flight at or below the pool size
(a transaction holds one slot for its duration), so postgres-js always finds a free connection
and never pipelines. Queued queries wait for the next free connection, which is what the pool
would do anyway. Guards kept: every probe step has a timeout and names a hung step; process
caches never let callers join an in-flight load for more than fifteen seconds; `getGlobalCoverage`
reads sequentially. Rule for new code: bursts are fine again, the gate orders them.
