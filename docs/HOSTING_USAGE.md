# Hosting usage (Supabase and Vercel free plans)

UNIIVERSE runs on the free plans of Supabase (the Postgres database) and Vercel (the app). On 19 Oct 2026 the owner reported:
- Supabase egress at 6.25 GB of the 5 GB a month;
- database size at 0.311 GB of 0.5 GB;
- a Vercel allowance of 10 GB described as "Functions Storage" at 100%.

This page records what caused that, what was changed, how it was measured, and how to check it again.

## How to measure

- **Database (read-only):** one Data jobs run with `job: db-usage`. It returns:
  - the database size;
  - the 25 largest tables;
  - the queries that sent the most rows, used the most time and ran most often (`pg_stat_statements`, counted since its last reset).

  It reads statistics only, never table contents.
- **Deployment size (local):** build with a `DATABASE_URL` set (any Postgres URL works; it is only read to decide what the build leaves out). Then add up the files listed in `.next/**/*.nft.json`. Those files are what each server function carries.
- **Database egress (local):** use a byte-counting TCP proxy between the app and a seeded local Postgres (`scripts/perf-seed.ts`), and run the perf probe through it. The bytes Postgres sends are what Supabase counts as egress.

## Supabase egress: what sent the bytes

From `db-usage` on production (run 39204826986, statistics since 13 Oct, 6 days). Bytes are estimated from rows × columns. Supabase does not report egress per query.

| Source | Calls | Rows sent | Estimate | Status |
|---|---|---|---|---|
| Draft engine: every matchup, synergy and role record of three patches | 212 each | 13.5 M + 5.4 M + 0.7 M | ~1.6 GB | Gone: Draft removed on 19 Oct |
| Old Duo Synergies: every pair of a role, all bands | 169 | 12.6 M | ~0.75 GB | Gone: rewritten on 15 Oct |
| Duo Synergies: the chosen pairing, every patch and band row | 723 | 7.1 M | ~0.4 GB | **Fixed here**: summed in SQL |
| A player's stored games (`loadSeasonGames`, every profile page) | 7,219 | 5.1 M | ~0.9 GB | **Fixed here**: kept per instance until they change |
| postgres-js reading array types on every new connection | 18,346 | 7.8 M | ~0.15 GB | **Fixed here**: `fetch_types: false` |
| Mastery and champion history per account | ~15,000 | 4.5 M | ~0.3 GB | Unchanged (smaller) |
| Branding images (logo, backgrounds; several MB each) | 86 | 86 | ~0.2–0.4 GB | Unchanged (see below) |

What else the numbers show:
- Supavisor (the pooler) runs about 16,700 sets of connection-setup queries of its own, one per new connection. Fewer cold starts and fewer preview deployments reduce them; no setting in the app does.
- The draft engine and the old Duo Synergies loader, both already gone, account for roughly half of the period's egress. The month's reported total therefore overstates what the current code sends.

## Database size

The database is 286 MB (`db-usage`). The largest tables:

| Table | Size | Rows |
|---|---|---|
| `champion_matchups` | 68 MB | 341 k |
| `ranked_participants` | 66 MB | 207 k |
| `champion_synergies` | 28 MB | 136 k |
| `match_details` | 28 MB | 7 k |
| `ranked_bans` | 21 MB | 196 k |
| `brand_assets` | 18 MB | 4 |

All of them are the statistics the app shows, so nothing was deleted (deleting production data needs the owner's approval).

The tables grow with every patch of collected ranked games. The aggregation already keeps a bounded patch window. If the size nears 0.5 GB, the cheapest safe step is to drop the evidence of patches older than the window. That is a data deletion, so it is left to the owner to approve.

## Vercel: "Functions Storage"

Vercel's Hobby plan has no item by that name in its documentation. This was not verified in the Vercel dashboard (this work has no access to it).

What was measured is the size of the server functions each deployment stores. Every one of the 68 functions carried its own copy of PGlite, the embedded demo database (about 19 MB of WASM and data). Production never loads PGlite: it connects to Supabase. Every deployment, production or preview, stored all of those copies again.

| Build with a `DATABASE_URL` | Traced files (all functions) | PGlite part |
|---|---|---|
| Before (main at e976f86) | 1,555 MB | 1,284 MB |
| After | 270 MB | 0 MB |

If the item is in fact Vercel's 10 GB **Fast Origin Transfer** (bytes sent by functions), two changes here reduce it:
- the Meta & Trends tabs no longer render the other two pages in full on every visit;
- previews are no longer built on every push.

The branding images are the other large function responses (see "What still needs attention").

## What changed

1. **PGlite left out of Postgres deployments** (`next.config.ts`). The exclusion applies only when the build has a `DATABASE_URL`, so the demo, local development and the browser tests keep PGlite. `src/server/db/create.ts` now loads PGlite and drizzle's PGlite driver only when a PGlite database is opened. drizzle's driver imports PGlite as soon as it loads, so a top-level import would have made every function fail to start without it.
   - Checked by building with a `DATABASE_URL`, hiding the PGlite package, starting the server and opening the setup page and `/api/health` (`"db":{"ok":true,"mode":"postgres"}`).
2. **Previews only when asked for** (`scripts/vercel-ignore-build.sh`). Production builds are unchanged. A branch push builds a preview only for a branch named `preview/...` or a commit message containing `[preview]`.
   - Nobody reviewed the previews: the browser tests run in CI.
   - If the preview environment has a `DATABASE_URL`, each preview also ran its own cold caches against the live database.
3. **No array-type lookup per connection** (`fetch_types: false` in `create.ts`). Nothing in the app sends or reads Postgres arrays: lists are sent as `IN (...)` and documents as JSON. The whole database suite runs on Postgres with this setting.
4. **Duo Synergies summed in SQL** (`src/server/duo-synergies.ts`).
   - Before: every patch and rank-band row of the chosen pairing (~9,900 rows a request).
   - Now: one row per champion pair that reaches the listing minimum, plus one row of totals.
   - Checked against the previous implementation: identical reports for every role pair, orientation, patch choice, sort and lineup-pool filter (4,410 listed rows, 9,606 pairs), on PGlite and on Postgres.
5. **A player's stored games kept until they change** (`loadSeasonGames`, `cachedUntilChanged` in `src/server/observability/cache.ts`).
   - Each read first asks the database for a one-row fingerprint of the rows: a count plus a hash of every column read, computed in Postgres.
   - Only a new fingerprint loads the rows again. Nothing is ever stale: a synced game, a filled-in record or a removed game shows on the next read.
   - A warm instance sends one small row instead of a thousand.
   - Bounded to 200 entries per database handle.
6. **Meta & Trends tabs prefetched on intent** (`src/components/section-tabs.tsx`). Another tab is fetched in full when the pointer, keyboard focus or a finger is on it, not on every visit.

## Numbers after (local, same seeded database, same probe)

Bytes sent by Postgres to the app while running the perf probe (`runPerfProbe`, the same steps as the `perf-probe` job):

| Run | main (e976f86) | After | Change |
|---|---|---|---|
| One probe, cold process | 5.83 MB | 1.84 MB | −68% |
| Three probes in one process (a warm instance) | 17.38 MB | 5.38 MB | −69% |

## Safeguards

`tests/ops/hosting-budget.test.ts` checks that:
- previews are skipped unless asked for, and production is built;
- a build with a `DATABASE_URL` leaves PGlite out, and one without it keeps PGlite;
- `create.ts` never imports PGlite or its driver at the top level.

Other tests:
- `tests/db/season-games-cache.test.ts`: the cached games follow every change at once.
- `src/server/observability/cache.test.ts`: `cachedUntilChanged` loads again only on a new fingerprint and stays bounded.
- `tests/db/duo-synergies.test.ts`: unchanged, still passes.

## What still needs attention

- **Branding images.** The four stored images total about 18 MB (`brand_assets`), each served from the database on a cache miss.
  - Their URLs are versioned and cached for a year, by browsers and by Vercel's CDN.
  - Assumption, not verified here: Vercel's CDN cache is cleared by each production deployment. The 86 reads in 6 days fit that pattern: a few images times the number of deployments and regions. If so, every deployment reads them from Supabase again, several MB each, both as egress and as function response.
  - A smaller background (an MP4 or WebP instead of a large GIF) is the cheapest fix. Moving the images to object storage is the larger one.
- **Check the Vercel usage page** after a few days. Confirm which item was at 100% (deployment storage or Fast Origin Transfer) and that it is falling.
- **Supabase egress** resets with the billing cycle. Watch the next cycle: the removed draft engine and the changes here should keep it well under 5 GB. The `db-usage` job shows the remaining top queries at any time.
