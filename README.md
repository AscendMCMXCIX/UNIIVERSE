# UNIIVERSE

A private, player-centred League of Legends tournament drafting platform.

UNIIVERSE answers one question during a draft: **given our exact five players, the champions they actually play, the roles they can genuinely fill, the bans, both teams' picks, the current patch data and the remaining tournament pick order, what is the strongest draft we can realistically execute right now?**

It is not a tier list or a win-rate website. Every recommendation starts from the configured champion pools of the five active players and never leaves them.

## What it does

- **Team Setup** – main players, other players (subs, stand-ins), archived players, and the five-player active lineup with role assignments.
- **Players** – each player has a primary role with a champion pool and an optional secondary role with its own pool. Pools are picked from a visual champion grid synced from Riot's Data Dragon.
- **Draft Room** – full tournament draft (Ban 1, Pick 1, Ban 2, Pick 2, blue/red sides, double-pick windows). After every ban and pick UNIIVERSE recalculates what to do now and explains it in plain language: recommended pick (or pair), alternatives with trade-offs, "hold this role for a counterpick", ban suggestions, and legal **role swaps** between players when bans pinch a pool.
- **Game plan** – when both teams lock five champions: composition identity, win condition, lane priorities, teamfight roles, side-lane formation, objective approach, key threats and what to avoid. Short enough to read out in Discord.
- **Trends** – contested champions, risers and fallers versus the previous patch, pro priority, and alerts that matter to your lineup's pools.
- **Settings** – data health, job runs, engine weights (the 50/50 synergy-versus-enemy balance is adjustable), pool limits, champion rework handling, demo data controls.

Data updates are automatic: new patches, new champions, high-Elo ranked games (Riot API), professional games (Leaguepedia or Oracle's Elixir), matchup/synergy/pick/ban statistics. No manual data maintenance is needed for normal League changes.

## How it works (short version)

```
Riot Data Dragon ──► champions & patches ─┐
Riot Match API   ──► ranked matches  ─────┼─► aggregated statistics (per patch, per source)
Leaguepedia / OE ──► pro games        ────┘            │
                                                        ▼
                                   curated champion characteristics + your players' pools
                                                        │
                                                        ▼
                                         recommendation engine ──► Draft Room
```

Statistics are shrunk towards sensible priors so three games at 67% never beat 1,500 games at 54%, blended across recent patches with recency decay, and reset after champion reworks. Details: [docs/DRAFT_ENGINE.md](docs/DRAFT_ENGINE.md) and [docs/DATA_PIPELINES.md](docs/DATA_PIPELINES.md).

## Running it locally (no accounts needed)

Requirements: Node.js 20.9+ and pnpm 10 (`corepack enable` installs pnpm automatically).

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000. With no configuration UNIIVERSE runs in **demo mode**: an embedded database in `./.data`, a demo roster, and clearly labelled synthetic statistics so every screen works. Champion portraits need internet access to Riot's CDN; without it the app shows lettered tiles.

Useful commands:

| Command | What it does |
| --- | --- |
| `pnpm dev` | Start the app for development |
| `pnpm check` | Typecheck + lint + tests (what CI runs) |
| `pnpm test` | Run the test suite (68 tests covering the core draft rules) |
| `pnpm jobs:tick` | Run every data job that is due, once |
| `pnpm job <name>` | Run one job (`pnpm job list` shows them) |
| `pnpm seed:demo` | Seed demo roster + demo statistics |
| `pnpm db:generate` | After changing the schema: generate a migration |

## Going to production

The recommended, mostly free setup is **Vercel (app) + Supabase (database)**. Full instructions with screenshots-level detail are in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). The short version:

1. **Create a Supabase project** (free tier is fine to start). Copy the *Transaction pooler* connection string.
2. **Create a Riot API key** at https://developer.riotgames.com. Register a *Personal API key* for a persistent key (development keys expire every 24 hours).
3. **Import this repository into Vercel** and add environment variables (Project → Settings → Environment Variables):

   | Name | Value |
   | --- | --- |
   | `DATABASE_URL` | the Supabase connection string |
   | `UNIIVERSE_ACCESS_PASSWORD` | the team password |
   | `UNIIVERSE_AUTH_SECRET` | any long random string (`openssl rand -hex 32`) |
   | `CRON_SECRET` | another long random string |
   | `RIOT_API_KEY` | your Riot key |
   | `RIOT_PLATFORMS` | e.g. `euw1,kr,na1` |

4. Deploy. The database schema is created automatically on first start; champions sync automatically.
5. **Automation**: Vercel's built-in cron calls `/api/jobs/tick` (see `vercel.json`). On the Hobby plan that only runs once a day, so also enable the included GitHub Actions workflow (`.github/workflows/data-jobs.yml`): add repository secrets `APP_URL` and `CRON_SECRET`. Any other scheduler that can call a URL every ten minutes works too (docs/DEPLOYMENT.md lists options, including Supabase `pg_cron`).

All secrets stay server-side. Nothing is read from the browser.

## Environment variables

See [`.env.example`](.env.example) for every variable with explanations. Locally, copy it to `.env.local`.

## Automated jobs

| Job | Default interval | Purpose |
| --- | --- | --- |
| `version-check` | hourly | Detect a new Riot version; sync champions; open a new statistics period; flag reworks |
| `ranked-discover` | hourly | Refresh Challenger/Grandmaster/Master player lists; queue new match ids (incremental) |
| `ranked-ingest` | 10 min | Fetch queued matches with rate limiting; validate; store (duplicates impossible) |
| `aggregate` | 30 min | Fold new games into pick/ban, matchup and synergy statistics (idempotent) |
| `pro-sync` | daily | Import professional games |
| `integrity` | daily | Unstick stale runs, prune the queue, detect patch drift |

Intervals are editable in **Settings → Data jobs** without redeploying. **Settings → Data health** shows freshness and warns when a pipeline has not succeeded for too long.

## Troubleshooting

- **"One step before the app can open"** – production is missing `UNIIVERSE_ACCESS_PASSWORD` or `DATABASE_URL`. Add them in Vercel and redeploy.
- **Statistics say "demo"** – no real games have been ingested yet. Check `RIOT_API_KEY` in Settings → Environment, then run `ranked-discover`, `ranked-ingest` and `aggregate` from Settings → Data jobs (or wait for the scheduler). Remove demo statistics from Settings → Demo data once real data exists (they are ignored automatically anyway).
- **Riot jobs fail with 403/401** – the key expired (development keys last 24 hours). Replace `RIOT_API_KEY` or register a Personal key.
- **Champion portraits missing** – the server could not reach Data Dragon yet (`Settings → Data health` shows "offline fixture"). It retries hourly; run `static-sync` manually to force it.
- **A champion was reworked** – Settings → Champion reworks lists auto-detected kit changes; confirm to discount old evidence more strongly, or dismiss.
- **Scheduled GitHub workflow stopped** – GitHub pauses schedules after 60 days without commits. Re-enable it under Actions, or rely on Vercel Cron / another scheduler.

## Project layout

```
src/domain      pure draft logic (roles, sequence, eligibility, stats, engine, game plan) – fully tested
src/server      database, Riot/pro providers, ingestion, aggregation, jobs, auth, actions
src/components  UI building blocks (champion picker, draft room, lineup board…)
src/app         Next.js pages and API routes
drizzle         SQL migrations (embedded into the app at build time)
docs            architecture, engine, pipelines, deployment
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full picture.
