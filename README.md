# UNIIVERSE

A private, player-centred League of Legends tournament drafting platform.

UNIIVERSE answers one question during a draft: **given our exact five players, the champions they actually play, the roles they can genuinely fill, the bans, both teams' picks, the current patch data and the remaining tournament pick order, what is the strongest draft we can realistically execute right now?**

It is not a tier list or a win-rate website. Every recommendation starts from the configured champion pools of the five active players and never leaves them.

## What it does

- **Team Setup** – main players, other players (subs, stand-ins), archived players, the five-player active lineup with role assignments, saved and recent lineups, quick-add.
- **Players** – each player has a primary role with a champion pool and an optional secondary role with its own pool, picked from a visual champion grid synced from Riot's Data Dragon. Linked **Riot accounts** (main/alt, Riot ID shown, PUUID kept internal, no duplicates) feed a per-champion **proficiency** estimate (core / strong / comfortable / moderate / rusty) that refines, but never overrides, the configured pools.
- **Team accounts** – owner, coaches/analysts and players sign in with their own accounts; invites let a player claim their profile and edit their own pools.
- **Competition modes** – Ranked Flex (simultaneous blind bans, team-specific ban plan), Clash (scouting window with fast Riot-ID entry), scrims, tournaments, custom and other; draft formats are data-driven and custom formats can be added in Settings.
- **Opponents & scouting** – opponent teams and players with Unicode-exact Riot IDs, confidence levels, ban damage per player, cautious performance notes. Never attempts to de-anonymise anyone.
- **Draft Room** – full tournament draft (Ban 1, Pick 1, Ban 2, Pick 2, blue/red sides, double-pick windows) shared **live** between coaches and players (controller, hand-off, presence, reconnect). After every ban and pick UNIIVERSE recalculates what to do now and explains it: recommended pick (or pair), honest decision label (Strong / Moderate / Close / Low), alternatives, **Why not X?** comparisons, **what would change this**, likely enemy responses, a champion threat map, pool-pinch warnings before the next ban phase, "hold this role for a counterpick", ban suggestions, legal **role swaps**, coach overrides with an honest cost, pins for comparison and theorycraft copies.
- **Match Playbook** – when both teams lock five champions: a quick eight-line card (win condition, early plan, play for, fights, side lane, objectives, watch for, avoid), per-player jobs, IF → THEN rules, ahead/even/behind plans, how to deny their plan and a self-critique. Short enough to read out in Discord.
- **Matches** – every completed draft is archived with its playbook; optional result, duration, Riot match ID, notes and VOD. Archive only: results never change recommendations.
- **Trends** – contested champions, risers and fallers versus the previous patch, pro priority and draft patterns, and alerts that matter to your lineup's pools.
- **Settings** – branding (name, colour, logo), members and invites, draft formats, data health, job runs, engine weights (the 50/50 synergy-versus-enemy balance and the risk preference are adjustable), pool limits, champion rework handling, demo data, Riot compliance notice.

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

Statistics are shrunk towards sensible priors so three games at 67% never beat 1,500 games at 54%, blended across recent patches with recency decay, and reset after champion reworks. Details: [docs/DRAFT_ENGINE.md](docs/DRAFT_ENGINE.md), [docs/DATA_PIPELINES.md](docs/DATA_PIPELINES.md) and [docs/PLAYBOOK_AND_MATCHES.md](docs/PLAYBOOK_AND_MATCHES.md).

**Hard rule:** a champion is only ever recommended for the player assigned to that role, and only from that player's configured pool for that role. Proficiency data, coach overrides, scouting and pro patterns tilt the ranking; none of them can make an ineligible champion legal.

## Running it locally (no accounts needed)

Requirements: Node.js 20.9+ and pnpm 10 (`corepack enable` installs pnpm automatically).

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000. With no configuration UNIIVERSE runs in **demo mode**: an embedded database in `./.data`, a demo roster, demo linked accounts, clearly labelled synthetic statistics so every screen works, and a local owner session (no login). Champion portraits need internet access to Riot's CDN; without it the app shows lettered tiles.

Useful commands:

| Command | What it does |
| --- | --- |
| `pnpm dev` | Start the app for development |
| `pnpm check` | Typecheck + lint + tests (what CI runs) |
| `pnpm test` | Run the test suite (139 tests covering the draft rules, engine, pipelines, accounts, realtime, archive) |
| `pnpm jobs:tick` | Run every data job that is due, once |
| `pnpm job <name>` | Run one job (`pnpm job list` shows them) |
| `pnpm seed:demo` | Seed demo roster + demo statistics |
| `pnpm db:generate` | After changing the schema: generate a migration |

## Going to production

The recommended, mostly free setup is **Vercel (app) + Supabase (database)**. Full instructions with screenshots-level detail are in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). The short version:

1. **Create a Supabase project** (free tier is fine to start). Copy the *Transaction pooler* connection string.
2. **Create a Riot API key** at https://developer.riotgames.com. Register a *Personal API key* for a persistent key (development keys expire every 24 hours). Read [docs/RIOT_COMPLIANCE.md](docs/RIOT_COMPLIANCE.md) before registering.
3. **Import this repository into Vercel** and add environment variables (Project → Settings → Environment Variables):

   | Name | Value |
   | --- | --- |
   | `DATABASE_URL` | the Supabase connection string |
   | `UNIIVERSE_AUTH_SECRET` | any long random string (`openssl rand -hex 32`) |
   | `UNIIVERSE_ACCESS_PASSWORD` | a one-time setup key used to create the owner account |
   | `CRON_SECRET` | another long random string |
   | `RIOT_API_KEY` | your Riot key |
   | `RIOT_PLATFORMS` | e.g. `euw1,kr,na1` |

4. Deploy. The database schema is created automatically on first start; champions sync automatically. Open the URL: the setup page asks for the setup key and creates the **owner** account. Invite coaches and players from Settings → Members.
5. **Automation**: Vercel's built-in cron calls `/api/jobs/tick` (see `vercel.json`). On the Hobby plan that only runs once a day, so also enable the included GitHub Actions workflow (`.github/workflows/data-jobs.yml`): add repository secrets `APP_URL` and `CRON_SECRET`. Any other scheduler that can call a URL every ten minutes works too (docs/DEPLOYMENT.md lists options, including Supabase `pg_cron`).

All secrets stay server-side. Nothing is read from the browser. **Nothing in this repository has been verified against the real Riot, Data Dragon or Leaguepedia services yet** (the build environment could not reach them); [docs/LIVE_VALIDATION.md](docs/LIVE_VALIDATION.md) is the checklist to run after the first deployment.

## Environment variables

See [`.env.example`](.env.example) for every variable with explanations. Locally, copy it to `.env.local`.

## Automated jobs

| Job | Default interval | Purpose |
| --- | --- | --- |
| `version-check` | hourly | Detect a new Riot version; sync champions; open a new statistics period; flag reworks |
| `ranked-discover` | hourly | Refresh Challenger/Grandmaster/Master player lists; queue new match ids (incremental) |
| `ranked-ingest` | 10 min | Fetch queued matches with rate limiting; validate; store (duplicates impossible) |
| `aggregate` | 30 min | Fold new games into pick/ban, matchup and synergy statistics (idempotent) |
| `pro-sync` | daily | Import professional games (with pick order for draft patterns) |
| `account-sync` | 3 h | Incrementally sync linked player and opponent accounts (history, mastery, rank) |
| `integrity` | daily | Unstick stale runs, prune the queue, detect patch drift |

Intervals are editable in **Settings → Data jobs** without redeploying. **Settings → Data health** shows freshness and warns when a pipeline has not succeeded for too long.

## Troubleshooting

- **"One step before the app can open"** – production is missing `UNIIVERSE_AUTH_SECRET` or `DATABASE_URL`. Add them in Vercel and redeploy. The first visit then asks for the setup key (`UNIIVERSE_ACCESS_PASSWORD`) to create the owner.
- **A teammate cannot sign in** – only the owner creates invites (Settings → Members); each invite link is single-use and expires. A player who claimed a profile can edit only that profile.
- **Someone forgot their password** – the owner clicks *Reset password* next to the member in Settings → Members and passes on the one-time password. If the owner is locked out: run `pnpm user:reset-password owner@email` on a machine with the production `DATABASE_URL` in `.env.local`; it prints a temporary password. The app deliberately sends no email.
- **Statistics say "demo"** – no real games have been ingested yet. Check `RIOT_API_KEY` in Settings → Environment, then run `ranked-discover`, `ranked-ingest` and `aggregate` from Settings → Data jobs (or wait for the scheduler). Remove demo statistics from Settings → Demo data once real data exists (they are ignored automatically anyway).
- **Riot jobs fail with 403/401** – the key expired (development keys last 24 hours). Replace `RIOT_API_KEY` or register a Personal key.
- **Champion portraits missing** – the server could not reach Data Dragon yet (`Settings → Data health` shows "offline fixture"). It retries hourly; run `static-sync` manually to force it.
- **A champion was reworked** – Settings → Champion reworks lists auto-detected kit changes; confirm to discount old evidence more strongly, or dismiss.
- **Scheduled GitHub workflow stopped** – GitHub pauses schedules after 60 days without commits. Re-enable it under Actions, or rely on Vercel Cron / another scheduler.

## Project layout

```
src/domain      pure logic: roles, formats, eligibility, stats, engine, proficiency, scouting, playbook – fully tested
src/server      database, Riot/pro providers, ingestion, aggregation, jobs, accounts, auth, live draft, matches, actions
src/components  UI building blocks (champion picker, draft room, insight panels, lineup board, playbook…)
src/app         Next.js pages and API routes
drizzle         SQL migrations (embedded into the app at build time)
docs            architecture, engine, pipelines, playbook & matches, deployment, Riot compliance, live validation
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full picture.
