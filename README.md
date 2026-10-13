# UNIIVERSE

A private, player-centred League of Legends tournament drafting platform.

UNIIVERSE answers one question during a draft: **given our exact five players, the champions they actually play, the roles they can genuinely fill, the bans, both teams' picks, the current patch data and the remaining tournament pick order, what is the strongest draft we can realistically execute right now?**

It is not a tier list or a win-rate website. Every recommendation starts from the configured champion pools of the five active players and never leaves them.

## What it does

- **Team Setup** – main players, other players (subs, stand-ins), archived players, the five-player active lineup with role assignments, saved and recent lineups, quick-add.
- **Players** – each player has a primary role with a champion pool and an optional secondary role with its own pool, picked from a visual champion grid synced from Riot's Data Dragon. Linked **Riot accounts** (main/alt, Riot ID shown, PUUID kept internal, no duplicates) feed a per-champion **proficiency** estimate (core / strong / comfortable / moderate / rusty) that refines, but never overrides, the configured pools.
- **Team accounts** – username + Riot ID is the identity (no email). Creating an account creates the player profile and links the Riot account in one step; a password is optional at sign-up. Sessions last 30 days, or a year with "Remember this device".
- **Competition modes** – one dropdown: Ranked 5s / Flex (blind drafting with our lineup; optional enemy Riot IDs), Clash (scouting window with fast Riot-ID entry), Scrim / Organised, Tournament, Custom / Practice and Other; draft formats are data-driven and custom formats can be added in Settings.
- **Series** – scrims, tournaments, custom, practice and other organised games can be a single game, a best of 3 or a best of 5; every game keeps its own side, draft, lineup, playbook and record, and the series ends as soon as one side has won enough.
- **Enemies, simply** – each game stores the enemy champions and, optionally, the enemy player names and an opponent label. There is no opponent database: enemy Riot IDs typed when a draft starts are looked up for that draft only (rank, recent Solo/Duo and Flex games, mastery) and turn into pick likelihoods that the ban and pick recommendations use.
- **Draft Room** – full tournament draft (Ban 1, Pick 1, Ban 2, Pick 2, blue/red sides, double-pick windows) shared **live** between coaches and players (controller, hand-off, presence, reconnect). After every ban and pick UNIIVERSE recalculates what to do now and explains it: recommended pick (or pair), honest decision label (Strong / Moderate / Close / Low), alternatives, **Why not X?** comparisons, **what would change this**, likely enemy responses, a champion threat map, pool-pinch warnings before the next ban phase, "hold this role for a counterpick", ban suggestions, legal **role swaps**, coach overrides with an honest cost, pins for comparison and theorycraft copies.
- **Match Playbook** – when both teams lock five champions: a quick eight-line card (win condition, early plan, play for, fights, side lane, objectives, watch for, avoid), per-player jobs, IF → THEN rules, ahead/even/behind plans, how to deny their plan and a self-critique. Short enough to read out in Discord.
- **Matches** – every completed draft is archived with its playbook; optional result, duration, Riot match ID, notes and VOD. Archive only: results never change recommendations.
- **My Ranked** – a private Solo/Duo improvement journal per player: blocks of up to six games, a thirty-second entry (champion, enemy laner, result, main mistake, notes), one-tap import of recent synced Riot games, ranked focus champions and a one-sentence focus, simple statistics. Only the player can see it; it never touches the team's drafting data.
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
| `pnpm test` | Run the test suite (147 tests covering the draft rules, engine, pipelines, accounts, realtime, archive) |
| `TEST_DATABASE_URL=postgres://… pnpm test` | Same suite, but every database test runs on a real Postgres server (CI does this on PostgreSQL 16) |
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
   | `UNIIVERSE_ACCESS_PASSWORD` | setup key used to create the owner account, and the owner recovery key at `/recover`; keep it set |
   | `CRON_SECRET` | another long random string |
   | `RIOT_API_KEY` | your Riot key |
   | `RIOT_PLATFORMS` | `all` (every public League server), or a list such as `oc1,euw1,kr` |

4. Deploy. The database schema is created automatically on first start; champions sync automatically. Open the URL: the setup page asks for the setup key and creates the **owner** account. Invite coaches and players from Settings → Members.
5. **Automation**: something must call `/api/jobs/tick` regularly. Vercel's built-in cron (`vercel.json`) runs it once a day as a safety net, the included GitHub Actions workflow (`.github/workflows/data-jobs.yml`, repository secrets `APP_URL` and `CRON_SECRET`) every three hours, and Supabase `pg_cron` every ten minutes for the full ranked throughput (docs/DEPLOYMENT.md §4 has the SQL).

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
| `account-sync` | 3 h | Incrementally sync linked player accounts (history, mastery, rank); resolves new sign-ups' Riot IDs to PUUIDs |
| `integrity` | daily | Unstick stale runs, prune the queue, detect patch drift |

Intervals are editable in **Settings → Data jobs** without redeploying. **Settings → Data health** shows freshness and warns when a pipeline has not succeeded for too long.

## Troubleshooting

- **"One step before the app can open"** – production is missing `UNIIVERSE_AUTH_SECRET` or `DATABASE_URL`. Add them in Vercel and redeploy. The first visit then asks for the setup key (`UNIIVERSE_ACCESS_PASSWORD`) to create the owner.
- **A teammate cannot sign in** – only the owner creates invites (Settings → Members); each invite link is single-use and expires. Sign-in is username + password; an account created without a password only works in the browser session that created it until the member sets one under My profile (or the owner sets one for them).
- **Someone forgot their password** – the owner clicks *Reset password* next to the member in Settings → Members and passes on the one-time password; the member's other devices are signed out. If the owner is locked out: run `pnpm user:reset-password <username>` on a machine with the production `DATABASE_URL` in `.env.local`; it prints a temporary password. The app deliberately sends no email.
- **"Complete your player profile" banner** – an account from before automatic profiles (the original owner) is asked once for its Riot ID and main role under My profile; the profile is created and linked immediately.
- **Statistics say "demo"** – no real games have been ingested yet. Check `RIOT_API_KEY` in Settings → Environment, then run `ranked-discover`, `ranked-ingest` and `aggregate` from Settings → Data jobs (or wait for the scheduler). Remove demo statistics from Settings → Demo data once real data exists (they are ignored automatically anyway).
- **Data health says "statistics: none · 0 games"** – the aggregate job ran but had nothing to fold in: no ranked matches and no professional games have been stored yet. Look at Settings → Data jobs: `ranked-discover` / `ranked-ingest` must say *ok* with growing `matchesQueued` / `inserted` numbers and `pro-sync` must show `inserted` > 0. A *degraded* badge with a message (key rejected, query refused…) is the cause; Data health repeats the message as a warning.
- **After changing `RIOT_API_KEY`, match lookups answer 400** – Riot encrypts player ids per key. Discovery prunes the old ids automatically and re-discovers players; linked accounts re-resolve from their Riot ID on the next sync. Nothing to do.
- **Riot jobs fail with 403/401** – 403: the key expired (development keys last 24 hours) or was revoked; 401: the stored `RIOT_API_KEY` is not a key Riot recognises (Settings → Environment says "set, check value" when it does not look like `RGAPI-…`). Replace the value with the key as shown on developer.riotgames.com, or register a Personal key. The job's message says which it was.
- **Champion portraits missing** – the server could not reach Data Dragon yet (`Settings → Data health` shows "offline fixture"). It retries hourly; run `static-sync` manually to force it.
- **A champion was reworked** – Settings → Champion reworks lists auto-detected kit changes; confirm to discount old evidence more strongly, or dismiss.
- **Scheduled GitHub workflow stopped or runs rarely** – GitHub pauses schedules after 60 days without commits (re-enable it under Actions) and runs cron workflows only best-effort (a 10-minute schedule fired four to five times a day for this repository). The workflow therefore runs every three hours; for ten-minute refreshes use Supabase `pg_cron` (docs/DEPLOYMENT.md §4).

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


Responsive layout rules and the Playwright smoke tests are described in `docs/RESPONSIVE.md` (`pnpm build && pnpm test:e2e`).
