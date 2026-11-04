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
- **In members' browsers (field data)**: Admin Mode → System Health → *Page speed in members'
  browsers*: each signed-in page load's LCP, INP and CLS (with FCP and TTFB in support) as the
  member's own browser measured it, counted by page group and device class over the last 28 days
  ([MONITORING.md](MONITORING.md)). Those are real loads on real devices and networks; every other
  figure on this page is a lab measurement on one emulated device or a server timing. The two are
  reported apart and never averaged together.
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
  refresh after a bookmark), keeps only complete results, and the
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

**Animated branding on phones.** These loads used the demo roster, which has no branding images.
Production's logo is an animated GIF of about 7.4 MB (its still frame is about 225 KB), and every
page carries it in the top bar. Phones held either way used to get only the still frame, chosen
while browsers were sent the GIF itself. Since the web copies (`<kind>@web`, docs/HOSTING_USAGE.md),
browsers get the logo as an animated WebP at the size the app draws it, kept for a year: about
0.5 MB measured locally with the team's own 420×420, 144-frame GIF. So phones now get the
animation too, and only reduced motion gets the still frame (`STILL_MEDIA` in
`src/components/brand-image.tsx`). Checked in Chromium (`e2e/team-logo.spec.ts`): phone, phone
held sideways, tablet and desktop request the animation and draw it in a square at its own
proportions; with reduced motion each requests only the still frame. React adds no preload hint for
an image inside `<picture>`, so nothing fetches the animation early for reduced motion.

## Browser code (21 Oct 2026)

**How it was measured.** Production builds before and after, on the same machine. For each page:
the app's own client code it loads up front (the chunks its client-reference manifest lists),
compressed with gzip. React and Next.js themselves are the same on every page and not counted.

| Page | Before | After |
|---|---|---|
| Resources | 69.5 KB | 39.7 KB |
| Admin Mode → Resources | 70.1 KB | 40.3 KB |

**What changed.** Both pages carried zod, the validation library behind the server's checks
(about 30 KB compressed), because they took their sections, icons and address rules from
`src/domain/resources.ts`, which also validates the stored library and what an administrator types
in. Those parts now live in `src/domain/resource-entry.ts`, which has no validation library.
`resources.ts` re-exports them and keeps the validation on the server.

**Clash Scout kept zod, on purpose,** to check a draft kept in the browser synchronously, so a
failed download could never lose someone's work; the client-imports test named it as the one
allowed exception. Clash Scout has since been retired (23 Oct 2026), and no page imports zod at
once any more: the exception list is empty.

**Kept that way.** `src/app/client-imports.test.ts` (part of `pnpm verify`) follows every
`"use client"` module through its imports, re-exports and `import()` calls:
- Server-only code is never reachable from it, at once or later: Node's built-in modules, the
  database, image and session libraries, and modules in `src/server` other than server actions.
  The one server module pages share, the permission model (`src/server/auth/permissions.ts`, which
  has no imports), is listed with the reason.
- Large browser libraries (zod) load only through `import()`, except from the modules listed with
  their reason (none at present).

Run on the code before this change, it reported the three Resources components' imports.

**Lighthouse** (mobile, the two production builds of the demo on this machine, interleaved; median
of three runs each):

| Page | Score | Blocking time | Largest paint |
|---|---|---|---|
| Resources, simulated throttling | 93 → 94 | 0.08 → 0.08 s | 3.16 → 3.00 s |
| Resources, devtools throttling | 93 → 95 | 0.26 → 0.22 s | 1.99 → 2.02 s |

**Reading it.** The gain is a smaller download and a little less script to run at start-up, not
an earlier largest paint, which stays at about 2.0 s with devtools throttling. Simulated throttling
counts every script requested before the largest paint as holding it up, so its largest paint
follows the script size; devtools throttling measures what the page actually did. Differences of a
point or two are within run-to-run noise.

## Field data (21 Oct 2026)

**What is measured.** The figures above are lab figures: one emulated phone, one network, an empty
cache. Since 21 October the app also counts what members actually get. Each signed-in page load
reports its Largest Contentful Paint, Interaction to Next Paint and Cumulative Layout Shift (and
First Contentful Paint and Time to First Byte, which explain them) through Next.js's
`useReportWebVitals`, once, when the page is hidden. The browser reduces each value to a bucket
whose bounds include Google's good and poor thresholds, so the share of good, needs-work and poor
loads is exact, and the 75th percentile is stated as the bucket bound it stayed within ("≤ 2.5 s")
rather than as an estimate. Only the page group ("players") and the device class (by window width:
phone, tablet, desktop) go with it.

**What it costs.** The reporter loads after the page is interactive: +0.9 KB compressed on a page's
first load (the route's own scripts, compressed: Team 63.9 → 64.8 KB, Players 57.3 → 58.2 KB,
measured on the build; loading it with the page would have added 3.6 KB). A page view adds one small INSERT (a write, not database egress); System Health reads at
most a few hundred grouped rows when an administrator opens it. Counts are kept 35 days.

**Reading it.** A page load counts only for the page the app was opened on: moving between pages
inside the app is not a new load (INP keeps counting for that first page). Each browser sends the
measures it supports, so every figure shows how many loads stand behind it, and a small count is a
small sample. Field figures are never mixed with the lab tables above.

## Profile code, lineup swipe and self-updating pages (26 Oct 2026)

Measured on the demo build, main at cceeb23 and this change side by side on the same machine.

**Client JavaScript loaded up front** (gzip, every chunk a page's client-reference manifest lists, so
the same figure on every run). Each profile tab now loads only its own code
(`src/components/players/profile-*-tab.tsx`; before, the profile layout imported every tab's body):

| Page | Before | After |
|---|---|---|
| Overview (`/overview`, `/players/[id]`) | 129.2 KB | 120.6 KB |
| Champions & Roles | 129.2 KB | 113.7 KB |
| Match History | 129.2 KB | 96.1 KB |
| Riot Accounts | 129.2 KB | 73.3 KB |
| Matchups, Stats, Edit, Blocks history | 129.2 KB | 62.2 KB |
| Solo Queue Blocks | 146.8 KB | 83.1 KB |
| A Solo Queue Block | 137.8 KB | 71.8 KB |
| Team, Players, Matches, Leaderboards | 72.8, 64.8, 86, 55.7 KB | +0.4 to +1.1 KB (the page's update watcher) |

**Frames** (`frames.mjs`: Pixel 7 profile, CPU slowed 4×, median of 5 runs; a frame over 25 ms is a
visible hitch at 60 Hz):

| Interaction | Longest frame | Over 25 ms |
|---|---|---|
| Swiping the phone lineup | 33 → 17 ms | 5 → 0 |
| Turning a card | 83 → 67 ms | 2 → 1 |
| Changing profile tab | 100 → 100 ms | 6 → 6 |

The lineup kept the card in view in Team Overview's state, so every card change re-rendered all five
cards mid-swipe; it now lives in a small store that only the role bar follows. Changing tab measured
the same as before the split.

**Page loads** (Pixel 7, CPU 4×, 150 ms round trip at 1.6 Mbps, median of 3): within the noise of the
setup, which moved an unchanged page's Total Blocking Time from 245 to 384 ms between two runs. The
profile's Overview and Match History finished loading 155 and 257 ms sooner (2,625 → 2,470 and
2,533 → 2,276 ms); CLS stayed 0 everywhere. All JavaScript transferred in a profile page's first two
seconds, code fetched ahead for linked pages included, stayed between 260 and 275 KB (269 KB before):
the split changes what a page needs before it works, not the total a visit downloads.

**Self-updating pages** (`docs/ARCHITECTURE.md`, "Pages that update themselves"): a check is one
statement returning a short row (the bulky parts hashed in Postgres), a few hundred bytes from the
database, asked only while a page is on screen. It replaced timed re-renders of a whole profile every
30 seconds while an account was updating.

**Not improved: opening a window on a long page.** `showModal()` makes the rest of the page inert, and
Chromium recomputes the style of every element for that: 142 ms for an empty window on a 1,513-element
Match History page with the CPU slowed 4× (4 ms with `show()`, which would lose the native modal's
inertness and focus containment). `content-visibility` on the list barely helped (116 ms). The native
modal is kept for its accessibility; opening a match window on that page still shows one long frame
(367 ms on the phone profile at 4×, 200 ms on a 1440×900 desktop with the CPU slowed 2×; medians of 3).

## Stored game records: the players' index (26 Oct 2026)

Production's query statistics (`db-usage`, 26 Oct) showed two statements unpacking every stored game
record (7,296 records, about 8 KB of players each, which Postgres keeps compressed in TOAST storage):
- the figures backfill's check for records that list nobody: 93 calls, 2,367 ms each on average, 220 s
  in all, and no row changed;
- possible groups (the earlier games of a match's players, 180 days back): 216 calls, about 900 ms
  each. `perf-probe` → `matches.possibleGroups` took 1,917 ms cold.

**What changed** (migration `0058_match_details_puuids`):
- A GIN index on the records' PUUIDs alone (`jsonb_path_query_array(participants, '$[*].puuid')`),
  with `fastupdate` off: records arrive a few an hour, so each goes straight into the index instead of
  a pending list that every search would scan.
- Possible groups and the newest Riot ID for an OP.GG link find the records through it (`playedIn`,
  `src/server/accounts/match-details.ts`), so only the searched players' games are opened.
- The figures backfill reads each record's stored size (`pg_column_size`) first: an empty list is a few
  bytes, so only those few records are unpacked to confirm.

**Measured locally** (PostgreSQL 16; 7,300 synthetic records with about 8 KB of players each, 7 linked
players, 365 games waiting for figures; the index built over the stored records, as the migration does;
median of 5 `EXPLAIN (ANALYZE, BUFFERS)`):

| Query | Before | After | Shared buffers |
|---|---|---|---|
| Possible groups (9 players, 180 days) | 54 ms | 0.2 ms | 1,043 → 33 |
| Newest Riot ID for OP.GG links (9 players, 30 days) | 14 ms | 0.2 ms | 1,087 → 34 |
| Backfill: mark the records that list nobody | 18 ms | 2.0 ms | 1,043 (same) |
| Backfill: pick the games to fetch | 4.5 ms | 3.2 ms | 1,997 (same) |

- The synthetic records compress to under 1 KB, so Postgres keeps them inline. Production's are read
  from TOAST storage, where unpacking each one costs more: the production figures above are the
  "before", and `db-usage` and `perf-probe` give the "after" once deployed.
- The index takes 6.4 MB here (4.3 MB when filled record by record).
- **Found on the way:** with GIN's default `fastupdate`, an index created before the records arrived
  kept them in its pending list, and Postgres preferred reading the whole table (possible groups only
  went from 66 to 34 ms, through the cheaper condition). With `fastupdate` off it used the index
  whether built over the records or filled one by one.
- `tests/db/possible-groups.test.ts` checks that the condition can use the index, so `playedIn` and the
  index's expression cannot drift apart unnoticed.

**In production** (Data jobs run 40305995576, minutes after the deploy of 0b3edff on 26 Oct):
- `perf-probe` → `matches.possibleGroups`: 184 ms cold and 33 ms warm, against 2,258 and 1,917 ms cold
  (158 and 161 ms warm) in the two runs before. Same answer: 18 earlier stored games searched.
- `db-usage`: the index takes 8.0 MB (`match_details` indexes 0.3 → 8.3 MB); the database grew from
  338 to 346 MB.
- `auth-audit` lists `0058_match_details_puuids` among the applied migrations.
- A second run after the next deploy (40311728193) agreed: 176 ms cold, 35 ms warm.
- **`profile.encounters` read slower: 828 and 736 ms cold** in the two runs after the deploy, against
  242 and 265 ms before. Encounters' own query did not change and does not use the index:
  - the probe times it right after possible groups;
  - possible groups used to unpack every stored record, which left the 1,150 records Encounters reads
    in Postgres's cache;
  - now it opens about 18, so Encounters reads its records itself.
  About 0.7–0.8 s is Encounters' own cold cost, which a visit already paid whenever nothing had read
  those records shortly before. Cutting it would need a stored summary of who met whom (a new table),
  not done here.
- The two statements' new mean times come from `db-usage` once enough calls have accumulated (its
  figures run from 13 Oct, so the old statements stay listed under their old text).

## Season figures: reading each game's patch once (2 Nov 2026)

**Found by** profiling `getTeamRoster` (Team Overview's cards) at production volume: production's
`perf-probe` on 2 Nov read `team.roster` at 535 ms cold and 256 ms warm. A local database scaled to the
same volume (3,878 stored games, 3,724 records; the demo seed copied 13 times with earlier dates)
reproduced it: 255–268 ms warm. In a CPU profile of 13 roster loads, `seasonOfPatch` and
`canonicalPatch` took about 920 of the 1,537 ms spent in `getPlayerOverview`:
`seasonChampionStats` filtered every game four times per champion (the selected mode, then Solo/Duo,
Flex and Normal), and each filter re-read each game's patch with two regular expressions. A season
holds a few patch names and thousands of games.

**What changed:**
- `seasonOfPatch` and `canonicalPatch` keep their answer per patch text (`remember` in
  `src/domain/patch.ts`, at most 1,024 entries, then the memo starts over, so arbitrary input cannot
  grow it).
- `seasonChampionStats` groups the season's games by champion in one pass, keeping their order, and
  filters each champion's own games. A unit test compares it with the four-scan version on 600
  generated games across seasons, modes and odd patch texts (`src/domain/season-stats.test.ts`).

**Measured locally** (the scaled database; `tsx` in one process; interleaved, the code switched back
and forth three times; median of the three):

| Measure | Before | After |
|---|---|---|
| First roster load in a fresh process (in-memory caches empty) | 388 ms | 229 ms |
| Roster, warm (mean of 20 loads) | 185 ms | 71 ms |
| One player's season overview, warm (mean of 20) | 28.3 ms | 10.3 ms |

`perf-probe-local` agreed (medians of 5): `team.roster` 316 → 231 ms cold, 212 → 86 ms warm;
`player.overview` 29 → 12 ms. Steps that do not read season figures stayed within the run-to-run
noise (±15–20%). The database work is unchanged, so production's cold figure keeps its reads; the
production effect is to be confirmed by `perf-probe` after a deploy.

## Field data: Team Overview is the slow first load (4 Nov 2026)

**Source.** The perf probe's new `fieldVitals` (#186), run by hand on production (Production check run 8, commit b04c167): the 28 days from 8 Oct, 125 page loads. A load counts for the page the app was opened on.

| Page group | Loads | LCP p75 | Good LCP | INP p75 | CLS p75 |
|---|---|---|---|---|---|
| Team | 81 | ≤ 5 s (poor) | 38% | ≤ 100 ms | ≤ 0.01 |
| Overview (a profile) | 22 | ≤ 2 s | 85% | ≤ 50 ms | ≤ 0.01 |
| Players | 8 | ≤ 2.5 s | 100% | ≤ 50 ms | ≤ 0.01 |
| Leaderboards | 5 | ≤ 2 s | 100% | ≤ 50 ms | ≤ 0.01 |
| Admin, Matches, Resources | 2–5 each | ≤ 1.5 s | 100% | ≤ 50 ms | ≤ 0.01 |

- **All pages:**
  - TTFB p75 ≤ 3 s (37% good);
  - FCP p75 ≤ 4 s (57% good);
  - INP and CLS are good everywhere.
- **The slow part is the first screen of the page the app opens on.** Team is that page two times in three. Interactions after it are fast.

**What it is not: the page's own server work.**
- **The probe on production:** Team's data (`team.roster`) takes 409 ms cold and 144 ms warm, 849 KB cold and 77 KB warm.
- **Locally, on a fresh demo server:** the page answers in 0.09–0.29 s; 27 KB gzipped.

**What it most likely is.**
1. **Server response on a cold function.** The site serves about 4–5 opened pages a day, so most visits start a new function instance. TTFB p75 is ≤ 3 s on every page. The app's own cold-start work was cut in October (one migration `SELECT`, cached layout reads; see "What changed" above), so what remains is the platform starting the function and the first database connection.
2. **The cards' artwork.** Each Team card draws a full Data Dragon splash (about 1215×717, around 200 KB) with `loading="lazy"`. In production the first card's art may be the largest element on a phone, and a lazy image starts loading only after layout.
   - It could not be measured here: the sandbox cannot reach Data Dragon, and the demo's first cards draw no art.
   - **In the lab** (synthetic art of the real size; slow 4G with 150 ms and 1.6 Mbps; 4× CPU on the phone), the largest element was the page's text:
     - **phone:** 1.17 s median of 5 loads (the subtitle);
     - **desktop:** 0.92 s (the heading).

**Next steps, in order.**
1. **Record the LCP element** with the field figures (the `web-vitals` attribution build gives a CSS selector, which holds no personal data). That tells (1) from (2).
2. **If it is the artwork:** load the first card's art eagerly, with `fetchpriority="high"`. Leave the others lazy, since on phones they start off screen.
3. **If it is server time:** Vercel's Fluid compute is meant to cut cold starts. It is a project setting for the owner. Check that it adds no cost on the plan before turning it on.

A keep-warm ping is not proposed: a frequent GitHub Actions schedule would exceed the minutes budget, and Vercel's free cron runs once a day.

## Team Overview's first card (4 Nov 2026)

**The lab above missed the artwork.** `scripts/phone-load.mjs` aborts every Data Dragon request, so no lab run had drawn a card's art. Measured again with it, a phone's largest element on Team Overview is the first card's splash art, not text.

**How it was measured.** A production build of `main` (659cce0) with the in-memory demo. Chromium was pointed at a local HTTP/2 stand-in for Data Dragon (`--host-resolver-rules`), which served synthetic art with the entropy of a photo at Data Dragon's sizes:
- the splash (1215×717) at 207 KB;
- each new connection held for one handshake: 450 ms on the phone, 120 ms on the desktop.

The phone is `phone-load.mjs`'s: a Pixel 7, 4× CPU, 150 ms and 1.6 Mbps. The desktop is 1440×900 at 40 ms and 20 Mbps. The cache was empty, five loads each, medians. LCP's sub-parts are from the LCP entry and the image's resource timing.

| Load | LCP | Largest element | TTFB | Art request starts | Art load | Render delay |
|---|---|---|---|---|---|---|
| Phone, `/team`, before | 5.65 s | the first card's splash | 0.13 s | 0.97 s | 4.19 s | 0.03 s |
| Phone, `/` (the app's start, a redirect), before | 5.80 s | the same | 0.32 s | 1.15 s | 4.16 s | 0.02 s |
| Phone, `/team`, after | **3.04 s** | the same | 0.15 s | 0.20 s | 2.30 s | 0.05 s |
| Phone, `/`, after | **3.20 s** | the same | 0.28 s | 0.35 s | 2.32 s | 0.06 s |
| Desktop, `/team`, before → after | 0.38 → 0.36 s | the header's text | 0.13 → 0.10 s | 0.29 → 0.13 s | | |

**Why it was slow on a phone.**
1. The art was lazy, so its request waited for layout.
2. Chrome's lazy-loading margin also started the next two cards' splashes, which a phone shows only after a swipe. The three (621 KB) shared the connection, so the first finished with the others.

The server's part was small: TTFB 0.13 s here. The redirect from `/` added about 0.18 s, one round trip.

**What changed** (`card-art.tsx`, `team-roster.tsx`, `globals.css`, the member and public layouts):
- **The first lineup card's art loads at once,** eager with `fetchPriority="high"`. React also emits a preload hint for it.
  - Alone, this started the art at 0.20 s, but LCP only moved from 5.65 to 5.52 s, because the art still shared the connection.
- **On a phone, the other cards' art waits** while the lineup is a track (under `@xl` of the lineup container). It waits until the first card's art has loaded or failed, or until the member touches the track or moves to another card.
  - A lazy image that is not displayed is not fetched.
  - Wider screens show all five cards and never wait.
- **Member and public pages preconnect to Data Dragon.** Next sends the hint as a `Link` response header (checked on a local production build). The layout sends it, so it does not wait for the page's data: the connection can open while the server is still building the roster.

`e2e/team-layout.spec.ts` checks the order on all three viewports.

**What it does not change.**
- The same art in the same quality, the same bytes and the same layout.
- The server's first byte. The field's TTFB p75 was ≤ 3 s on every page (see above). Team's came mostly from the start page's two functions (the next section).

**Reading the field result.** The probe's `fieldVitals` now also reports:
- each page's TTFB;
- each page's loads, LCP and TTFB per device class;
- the same figures for the last 7 days (`last7`).

So:
- **Before:** the first run after the deploy gives Team's split by device and how much of its LCP was TTFB, from loads that are all from before the change.
- **After:** a run at least 7 days after the deploy reads `last7` alone. Monday's scheduled probe does this with no manual run.
- **The target:** Team's LCP p75 ≤ 2.5 s on phones, as on every other page.
- **If it stays above that,** check TTFB first. The art then arrives about 2.3 s after the server answers on slow 4G, and TTFB adds to it.

## The start page's two functions (4 Nov 2026)

**The field showed Team's first byte as the outlier.** Production check run 15's probe covered the 28 days to 4 Nov, all from before this change and #191:
- **Team:** TTFB p75 > 3 s on desktop (43 loads) and ≤ 3 s on phones (35 loads); 23% good.
- **The pages people open directly:** ≤ 0.6–1 s (Players, Leaderboards, Matches, Resources, Admin).
- **Team's own data:** 0.17 s warm and 0.52 s cold (`team.roster`, the same run).

So the delay came before the page's own work.

**Found in the build output.** Vercel's builder was run locally (`vercel build`, CLI 65.11.0, with the project's settings and a dummy `DATABASE_URL`). It groups pages into functions by their settings:
- `/`, the installed app's start page, was in the public pages' function, with `/login`, `/public` and `/invite`;
- `/team` and every other member page were in another function;
- the two groups differed only in `maxDuration`: 300 s in the member and admin layouts, for the background refresh a visit may start, and the default elsewhere.

Opening the app asks for `/`, which looks up the session and redirects to the member's start page. That started both functions one after the other, and on a site opened a few times a day both were often cold.

**Changed:** `maxDuration = 300` in the root layout.
- **Every page is now one function.** Checked with the same build: 6 functions instead of 7. The shared one traces 778 files, 7.2 MB, against Vercel's 250 MB limit.
- **The API routes keep their own functions.**
- **It is a limit, not a cost:** a page is billed for the time it runs.
- **Any page anyone opens now warms the app for everyone,** visitors included.

**Not measurable here:** Vercel's cold starts. Read the field result from the probe's `last7` a week after the deploy:
- **The target:** Team's TTFB p75 ≤ 1 s, like the pages people open directly.
- **If it stays above that,** what remains is the first function's own cold start. Vercel's Fluid compute is the lever: a project setting for the owner, with its cost on the plan checked first.
