# Performance and stability

How UNIIVERSE is measured, what the measurements showed, what was changed, and the targets the
pages are held to. (Measurements of the Draft Room and its recommendation engine were removed
with the Draft feature in October 2026. Meta & Trends was removed on 19 October 2026; the dated
measurements below still list its pages and jobs as they were measured.) Numbers below come from the `perf-probe` job (inside the production
function, against the production database) and from a local run of the same probe plus a
Playwright script against a PostgreSQL database seeded with 3,000 ranked games
(`scripts/perf-seed.ts`), which is the scale the all-region ingestion reaches within days.

## How to measure

- **Inside production**: Admin → Data & Riot → `perf-probe` (or the *Data jobs* workflow with job
  `perf-probe`). Read-only. It times the exact service calls behind every page:
  database ping, session lookup, champions, players, lineup, Data health, proficiency, Team
  Matches, player data report.
- **From outside**: the *HTTP probe* workflow times public paths (`/api/health`, `/login`,
  `/recover`) three times each from a GitHub runner (US East → Sydney, so about 0.3 s of the
  number is network).
- **Locally at scale**: `DATABASE_URL=… pnpm exec tsx scripts/perf-seed.ts 3000` then
  `pnpm exec tsx scripts/perf-probe-local.ts`.
- **Live logging**: every job run, slow step (> 1.5 s), slow action (> 0.8 s) and failure is one JSON line in the function logs (`event`, `ms`, `timings`),
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
2. **Every cold start took the migration lock in a transaction** even with nothing to apply.
3. Champions, patch, branding, team and custom formats were re-read on every page although they
   change a few times a year.
4. Statistics tables were read without a sample floor: 87% of matchup rows (one game each)
   carried under 1% of the evidence and most of the bytes.
5. Scheduled jobs could overlap (two schedulers, or a manual run during a tick) and ingestion
   ran four parallel region workers against a five-connection pool with nothing left for pages.
6. No request/action timing, no error boundaries, no loading states: a slow or failed panel
   looked like a crash.

## What changed

- `src/server/ops/shell.ts`: the layout reads three tiny tables (patch, job status, period
  counts), cached 30 s per instance. Data health, coverage and the statistics description moved
  to Settings only, and the description is computed from the period tables, not champion rows.
- `src/server/stats/loader.ts`: the five statistics reads run in parallel, select only the
  needed columns and skip matchup/synergy rows below `MIN_PAIR_GAMES` (2). Cold load at 3,000
  games: 1,086 → 165 ms locally.
- `src/server/db/migrator.ts`: no lock and no transaction when the ledger already lists every
  migration (one `SELECT` per cold start).
- `src/server/observability/cache.ts`: a small per-instance TTL cache for champions, patch,
  branding, team, custom formats, pro patterns and shell facts, invalidated by the writers
  (static sync, branding save, team update, format save, aggregation).
- `getAuthState` is wrapped in React `cache()`, so the layout and the page share one session
  and user lookup per request.
- Jobs: `startJobRun` claims the job atomically; a second scheduler gets `skipped` instead of
  duplicate work, and a run that died frees the key after 15 minutes.
- Pagination: matches (60, *Show more*).
- Timeouts: Riot and Data Dragon 15 s per request; bounded retries and backoff.
- Error boundaries and loading states: a route-level error page inside the shell, component
  boundaries around Riot data, skeletons for pages.
- Indexes (migration 0004, evidence from the queries the pages run): `players(team_id,
  archived_at)`, `job_runs(started_at)`.
- `/api/health` rewritten to be cheap and diagnostic; Settings → Diagnostics added.

## Targets

| Interaction | Target | Notes |
| --- | --- | --- |
| Local UI interaction (select role, type to search) | immediate | client state only |
| Page TTFB, warm instance | < 300 ms server time | plus network |

## Numbers after

Local, same 3,000-game dataset, production build against PostgreSQL 16 on localhost, warm
process; medians of three runs. "Before" is the same script on commit
decba40.

| Measure | Before | After |
| --- | --- | --- |
| login round trip (submit → Team page) | 1,571 ms | 310 ms |
| Team page TTFB | 142 | 56 |
| Players page TTFB | 76 | 24 |
| Player profile TTFB | 147 | 50 |
| My profile (`/me`) TTFB | 55 | 36 |
| Matches TTFB | 87 | 73 |
| Trends TTFB | 81 | 49 |
| Settings TTFB | 99 | 51 |
| save player pools, click → Team page | 175 | 166 |
| statistics provider, cold build | 1,086 | 165 |
| champions list (cold / cached) | 10 | 5 / 0 |
| `/api/health` (cold / warm) | 43 | 30 / 5.5 |

Production figures are taken with `perf-probe` and the HTTP probe workflow after each deploy and
quoted in the deploy report; rerun `perf-probe` at any time for current numbers.

## Production finding: pipelined queries never answer through the pooler (2026-10-13)

The `perf-probe` job (Admin → Data & Riot, or the data-jobs workflow with `job=perf-probe`)
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

Confirmed on the deployment (build ede8fb4, 13:25 UTC): the whole probe answered in 923 ms with
nothing degraded; eight parallel queries through the five-connection pool took 3 ms (queued by
the gate instead of pipelined), Data health 32 ms, its coverage part 52 ms, statistics provider
cold 276 ms.

## Phase 3 (14 Oct 2026)

Local production build, in-memory demo database, Chromium, three loads each (server time to first
byte; HTML and JavaScript as transferred before compression):

| Page | TTFB ms | HTML KB | JS KB |
| --- | --- | --- | --- |
| /team | 112 / 55 / 54 | 100 | 524 |
| /players | 37 / 42 / 31 | 81 | 489 |
| /matches | 28 / 25 / 28 | 66 | 488 |
| /trends | 70 / 31 / 49 | 91 | 493 |
| /settings | 32 / 22 / 17 | 49 | 498 |

Changes that matter for speed: a custom logo is no longer inlined into every page as a data URL
(up to 150 KB per page before) but served once from `/api/branding/logo?v=…` with a year-long
immutable cache; branding and image metadata are cached per process for a minute; the champion grid filters locally with no requests;
autosave sends at most one request at a time and merges quick edits; the in-app backdrop uses
the still frame of an animated background, so nothing animates behind the work surfaces.

## Phase 4 (14 Oct 2026)

Same local setup (production build, in-memory demo database), server time to first byte after a
warm-up request; the first request after a server start takes 0.8–0.95 s on any page (module
loading and demo seeding), as before:

| Page | TTFB ms (warm) | HTML KB |
| --- | --- | --- |
| /team | 82 / 50 | 101 |
| /players | 37 / 37 | 78 |
| /matches | 32 / 21 | 65 |
| /trends | 49 / 46 | 136 |
| /settings | 17 / 19 | 49 |

Trends HTML grew (three more lists, each rendered with its first five rows); Team adds the
composition summary and suggestions without new queries when the lineup is complete (champion map
and proficiency are already cached per process). Work moved off the request path: a visit's
background refresh and a viewed player's account refresh run after the page is sent (Next.js
`after`), so neither adds to page time. Measured in production by the `perf-probe` job.


## Phase 8 (14 Oct 2026)

Measured locally (production build, Postgres on the same machine, so no network latency;
production numbers come from `perf-probe`), 1440×900, median of three:

| Page | Response start | DOM ready | Load |
|---|---|---|---|
| Team | 22 ms | 75 ms | 80 ms |
| My Profile → Overview | 12 ms | 54 ms | 58 ms |
| Champions & Roles | 15 ms | 61 ms | 62 ms |
| Solo Queue Blocks | 18 ms | 83 ms | 106 ms |
| Match History | 18 ms | 79 ms | 80 ms |

| Interaction | Time |
|---|---|
| Champion search: typing until the grid shows only matches | 47 ms |
| Adding a champion to a pool until "Saved" | 488 ms |
| Changing the Overview game mode until the page settles | 59 ms |
| Match History: next page / opening a game / pool filter | 108 ms / 113–229 ms / 72 ms |
| Starting a Solo Queue Block | 126 ms |
| Sidebar hover open/close cycle | layouts per cycle fell from about 28 to 4–5 (clip-path and transform instead of a width animation) |

Match History renders from stored data only: the list makes no Riot request; opening a game whose
record was never collected fetches it once. The summary line is computed from the same in-memory
game list as the page, so it adds no query.

## Detail windows (17 Oct 2026)

**How it was measured.** A production build on the in-memory demo roster (synthetic data), in
headless Chromium. Each window was opened five times from a fresh page and the median taken, from a
Chrome trace of every run:
- *First frame*: click to the first frame drawn with the window.
- *Largest gap*: the largest interval between frames actually drawn (`Display::DrawAndSwap`, not
  `requestAnimationFrame` callbacks) during the 300 ms of the opening motion. 16.7 ms means 60 FPS.
- *Draw*: the average cost of drawing one of those frames.
- *Content*: click to the window's content being on screen.

Two set-ups: desktop at 1440×900 with normal CPU, and phone at 390×844 with the CPU slowed 4×. This
Chromium composites in software (there is no GPU), so drawing costs are a worst case. They are
compared like for like, not as absolute figures for real devices.

**What the profile showed (before).**
- **Backdrop blur.** The 2 px `backdrop-filter` blur on the full-screen backdrop was redrawn on every
  frame of the motion. Frames cost 38–56 ms to draw on desktop, and 5–9 ms with the blur turned off
  in the same build. This was the largest cost.
- **`showModal()`.** It makes the page inert, so Chromium restyles every element of the page behind
  (about 940 on Match History). That costs 44–54 ms at 4× CPU and about 12 ms at 1×, inside the
  click. It comes with the native modal dialog (focus trap, inert page, top layer), which is kept for
  accessibility.
- **Re-rendering on open.** Opening a match re-rendered every card of the page; React's work in the
  click was about 80 ms at 4× CPU. Opening a champion re-sorted and re-rendered All Champions.
- **Content mid-motion.** The scoreboard arrived from the server during the motion and rendered and
  laid out in one block: a 90 ms task at 4× CPU, and on desktop extra drawing while the window was
  still scaling.
- **No reuse.** A match opened a second time was fetched again.
- **First opening of the Team player window.** About 75 ms of it was first-time compilation of its
  code; a second opening does not pay it.
- **Not causes.** The shadow, the scroll lock (3 ms) and the dimmed cards' filter on Team made no
  measurable difference.

**What changed.**
- The backdrop dims (a little darker, 70%) and no longer blurs. This covers every window and dialog.
- Content waits for the window to be in place. `AfterOpen` is used in the champion window;
  `onSettled` is used for the match window's header and scoreboard. Both wait about 120 ms (the
  ease-out motion is over 90% done by then), or no time under reduced motion, then render as a
  transition and fade in. Until then the window shows its shell and a light skeleton.
- Match History cards are memoised (opening one re-renders only the card it marks), and so is the
  All Champions list.
- Match History keeps the details it has loaded for the page it shows (`MatchDetailCache`, at most
  30). It lives in memory only, is replaced whenever the page's data is (a new page, a filter, a
  refresh after a bookmark or a Solo Queue Blocks import), keeps only complete results, and the
  server still checks access on every load.
- A mouse press on a card starts loading the match before the click lands. Touch does not, because
  a finger going down is often the start of a scroll.

**Numbers** (median of five; before → after):

| Window | Desktop: largest gap | Desktop: draw | Phone 4×: first frame | Phone 4×: largest gap | Phone 4×: draw | Content (desktop / phone) |
|---|---|---|---|---|---|---|
| Match History: open a game | 77 → 35 ms | 41 → 16 ms | 138 → 99 ms | 33 → 27 ms | 14 → 5 ms | 112 → 197 / 228 → 308 ms |
| Match History: the same game again | 64 → 32 ms | 38 → 14 ms | 104 → 81 ms | 31 → 33 ms | 13 → 4 ms | 120 → 179 / 202 → 271 ms |
| Match History: the next game | 65 → 34 ms | 41 → 15 ms | 129 → 68 ms | 32 → 28 ms | 14 → 5 ms | 111 → 184 / 238 → 280 ms |
| Team: a player | 65 → 18 ms | 50 → 13 ms | 210 → 203 ms | 25 → 19 ms | 16 → 5 ms | unchanged (no loading) |
| Team Matches: a game | 65 → 36 ms | 45 → 17 ms | 123 → 124 ms | 32 → 27 ms | 15 → 5 ms | 108 → 181 / 359 → 442 ms |
| All Champions: a champion | 73 → 30 ms | 56 → 14 ms | 155 → 121 ms | 32 → 27 ms | 15 → 5 ms | 181 → 197 / 352 → 344 ms |
| Closing (Escape), largest gap | 54–66 → 24–31 ms | | | 27–47 → 32–51 ms | | |
| Match window: switching to Build | 54 → 17 ms | 49 → 3 ms | 31 → 33 ms | 16 → 22 ms | 13 → 1 ms | 53 → 52 / 62 → 61 ms |

**Reading the numbers.**
- *Smoothness.* The motion is far smoother on desktop, where the largest gap halved. Phone frames
  were already near 30 ms apart and cost a third as much to draw now.
- *Content later.* The content appears later (about 70–90 ms on desktop, 50–80 ms on the phone
  set-up) because it waits for the window to be in place. This is deliberate: rendering it
  mid-motion was the other source of dropped frames. Holding it until the motion ended completely
  (180 ms) cost a further 90 ms to save two slow frames on desktop. Showing it as soon as it arrived kept 7 slow
  frames on desktop instead of 4.
- *Not 60 FPS here.* With software compositing at 1440×900, drawing one frame of the motion still
  costs about 14 ms in this environment, so it does not hold a steady 60 FPS. On a GPU-composited
  device that drawing is not the limit, but it has not been measured here.
- *Team player window.* Its first frame on the slowed phone is still about 200 ms: the restyle for
  `showModal()`, its first-time code compilation, and the five cards' selection states.

## Phones (20 Oct 2026)

**How it was measured.** A production build on the in-memory demo roster, in headless Chromium
emulating a Pixel 7 (412×915, touch) with the CPU slowed 4× and a slow 4G network (150 ms round
trip, 1.6 Mbps down, 750 kbps up), close to Lighthouse's mobile set-up. Every load starts with an
empty cache (no service worker). Riot's image CDN is unreachable from the test machine, so champion
art failed at once: the figures cover the page, its scripts and styles, not the artwork, which on a
real phone arrives after them and is lazy where it is below the fold. Median of three loads
(five for the before/after table), with `scripts/phone-load.mjs` (usage at its top).

**Every page** (median of 3):

| Page | First paint | Largest paint | Blocking time | Longest task | Layout shift | Scripts (compressed) |
|---|---|---|---|---|---|---|
| Team | 1.03 s | 1.49 s | 219 ms | 247 ms | 0.002 | 302 KB |
| Players | 1.03 s | 1.43 s | 178 ms | 219 ms | 0.001 | 281 KB |
| Profile | 0.95 s | 1.44 s | 200 ms | 211 ms | 0.000 | 256 KB |
| Profile → All Champions | 1.03 s | 1.46 s | 260 ms | 244 ms | 0.001 | 256 KB |
| Profile → Match History | 0.96 s | 1.56 s | 246 ms | 248 ms | 0.001 | 256 KB |
| Leaderboards | 1.01 s | 1.47 s | 172 ms | 207 ms | 0.002 | 268 KB |
| Team Matches | 0.96 s | 1.49 s | 246 ms | 240 ms | 0.002 | 279 KB |
| Settings | 0.98 s | 1.36 s | 215 ms | 245 ms | 0.009 | 270 KB |
| Admin → People | 1.01 s | 1.44 s | 211 ms | 230 ms | 0.002 | 176 KB |
| Public team page (guest) | 1.12 s | 1.12 s | 201 ms | 251 ms | 0.005 | 202 KB |
| Sign-in (guest) | 1.02 s | 1.02 s | 203 ms | 253 ms | 0.000 | 144 KB |

**Reading it.** Every page paints within about a second and its largest element within 1.6 s,
with almost no layout shift. Blocking time sits around 170–260 ms (the "needs improvement" band
starts at 200 ms) and is set mostly by React and Next.js starting up: even the sign-in page, with
58 elements and 144 KB of scripts, has a 250 ms task. App code is a small share of it.

**What changed.** The Player Card Studio (its editor, champion grid and preview) was bundled into
every page with a Customise button, including the public team page, where nobody can customise.
`CustomiseCardButton` now lives in its own module and loads the Studio when it is wanted: the
button starts fetching it when pointed at, focused or pressed, and opening it is a transition, so
the page stays as it is (the button shows it is busy) until the Studio is ready. A failed load
closes it again with a notice.

| Page | Scripts before → after (compressed) | Blocking time before → after | Largest paint before → after |
|---|---|---|---|
| Team | 302 → 259 KB | 188 → 208 ms | 1.43 → 1.43 s |
| Players | 281 → 266 KB | 185 → 174 ms | 1.37 → 1.40 s |
| Public team page (guest) | 202 → 188 KB | 177 → 183 ms | 1.05 → 1.07 s |

**Reading it.** Each of those pages downloads 13–43 KB less script on a cold load, Team the most
(the Studio's champion grid and preview went with it). Paint and blocking times did not change
beyond run-to-run noise (about ±20 ms here): the scripts load in parallel and never held up the
first paint, and the blocking time is React and Next.js starting up. The gain is data on a phone
connection, and the public page no longer ships an editor nobody there can open.
