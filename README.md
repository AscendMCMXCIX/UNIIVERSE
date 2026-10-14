# UNIIVERSE

A private, player-centred League of Legends tournament drafting platform.

UNIIVERSE answers one question during a draft: **given our exact five players, the champions they actually play, the roles they can genuinely fill, the bans, both teams' picks, the current patch data and the remaining tournament pick order, what is the strongest draft we can realistically execute right now?**

It is not a tier list or a win-rate website. Every recommendation starts from the configured champion pools of the five active players and never leaves them.

## What it does

- **Team** – the current main lineup as five esports-style player cards: picture, rank, role, and the champions each brings to that role with this season's games, W–L, mastery points and proficiency. Champions are edited in place (autosave); players are swapped from a dropdown by whoever may manage the lineup (substitutes through an explicit option).
- **Players** – one directory of everyone in UNIIVERSE (lineup first), each with a profile every member can open: picture, roles, rank, champion pools, linked Riot accounts and a Season statistics tab. Teammates can view a profile but never edit it; the Solo Queue Blocks journal stays private. Players edit their own profile in place; who else may edit is a permission.
- **Champion pools** – each player has a primary role with a champion pool (up to six) and an optional secondary role with its own pool (up to three), picked from one shared champion selector (instant search, champion-select role filter with Riot's position icons) and ordered by preference with drag and drop (mouse, touch or keyboard). Changes save automatically (Saving… / Saved / Unable to save — Retry) and never overwrite a newer edit made elsewhere. Linked **Riot accounts** (Riot ID shown, PUUID kept internal, no duplicates) feed a per-champion **proficiency** estimate (Very strong / Strong / Comfortable / Rusty / Limited data, each explained by an ⓘ that opens on hover, keyboard focus or tap) built from every linked account together (games de-duplicated, mastery combined with a per-account breakdown; Ranked Solo/Duo counts most, then Flex, then Normal games) that refines, but never overrides, the configured pools.
- **Accounts and permissions** – an admin creates every account from Admin → Players & Accounts (**Add Player Account**: username + Riot ID; Riot must confirm the Riot ID first; no email, no self sign-up, no invitation links) and is shown a randomly generated **temporary password** once (stored only as a hash, valid 7 days). The player opens the normal UNIIVERSE address, signs in with their username and the temporary password, must choose a permanent password (typed twice), completes the mandatory **Welcome** setup (primary role and 1–6 champions, optional secondary role and up to 3) and lands in the Player View. After that they sign in with username + password; a sign-in lasts 24 hours, then they sign in again. A forgotten password is reset by an admin, which issues a new temporary password. Each account has one **Access Level**: **Owner** (everything, including accounts, passwords and permissions), **Administrator** (runs the team and the site: lineup, players, matches, competition, branding, data), **Standard Player** (the default), **Restricted Player**, or **Custom** (plain-English capabilities ticked one by one); an owner can edit what each level allows or add their own. Account and permission management stays with Owners and cannot be delegated; nobody changes their own level and the last Owner can never lose Owner access. Every rule is enforced on the server, not by hidden buttons. Players change their own username, password (6+ characters with a capital letter, a number and a symbol for new and changed passwords; existing passwords keep working) and optional profile picture in Settings, and manage their Riot accounts there: a renamed Riot ID is followed automatically by PUUID, and a typed change asks before replacing one account with a different one.
- **Competition modes** – Ranked 5s (our five against a premade five, tournament-style draft; a UNIIVERSE category, not a Riot queue), Ranked Flex (Riot's standard ranked draft), Clash, Scrim / Organised, Tournament, Custom / Practice and Other. Each mode uses a predefined pick/ban template (Admin → Competition lists them); there is no format editor. Ranked 5s and Ranked Flex are separate modes. Enemy players are optional: zero to five Riot IDs in any order, no roles to assign (UNIIVERSE infers each one's likely role from their games and says how sure it is); drafts work fully without them.
- **Series** – scrims, tournaments, custom, practice and other organised games can be a single game, a best of 3 or a best of 5; every game keeps its own side, draft, lineup, playbook and record, and the series ends as soon as one side has won enough.
- **Enemies, simply** – each game stores the enemy champions and, optionally, the enemy player names and an opponent label. There is no opponent database: enemy Riot IDs typed when a draft starts are looked up for that draft only (rank, recent Solo/Duo and Flex games, mastery) and turn into pick likelihoods that the ban and pick recommendations use.
- **Starting a draft** – Draft → competition mode → the active lineup (swap a player in place, warned about empty pools) → optional enemy Riot IDs → our side → Start. Organised modes add only series length, opponent and draft format. Enemy Riot IDs are entered here only; the room uses the scouting without an editing panel. Unfinished drafts from the last three days can be continued; history lives in Matches.
- **Draft Room** – full tournament draft (Ban 1, Pick 1, Ban 2, Pick 2, blue/red sides, double-pick windows) shared **live** with the team (presence, reconnect): the player who created a draft controls it, admins can override, everyone else watches and inspects. The desktop room reads like champion select and fits one screen: BLUE on the left, RED on the right, and in the centre the current action, a concise recommendation (primary option with one reason and its confidence, three alternatives, emergency picks, role swaps) and the shared champion grid (search, role filter, the picking player's pool first) scrolling inside; the full analysis sits below, collapsed. Phones get current action → recommendation → selector → compact board → analysis. After every ban and pick UNIIVERSE recalculates what to do now and explains it: recommended pick (or pair), honest decision label (Strong / Moderate / Close / Low), alternatives, **Why not X?** comparisons, **what would change this**, likely enemy responses, a champion threat map, pool-pinch warnings before the next ban phase, "hold this role for a counterpick", ban suggestions, legal **role swaps**, coach overrides with an honest cost, pins for comparison and theorycraft copies. When every champion in a player's pool is banned or taken, **EMERGENCY PICKS — Outside Configured Pool** offers about three plausible champions for that role (labelled as outside the pool, honest about the player's familiarity, never added to the profile); the draft controller may lock one.
- **Match Playbook** – when both teams lock five champions: the final board and a **Quick Playbook** (WIN CONDITION, EARLY GAME, TEAMFIGHTS, OBJECTIVES, WATCH OUT and one short job per player) in 15px body text that still fits a laptop screen (phones get tabs: essentials first). **Detailed analysis** is a separate view: IF → THEN rules, ahead/even/behind plans, how to deny their plan, a self-critique and the full per-player notes. Copy for Discord produces the compact text.
- **Matches** – every completed draft is archived with its playbook; optional result, duration, Riot match ID, notes and VOD. The draft's creator or an admin can correct a record (mode, result, enemy names, notes…) or delete it after a confirmation; a series is re-scored when one of its games is deleted. Archive only: results never change recommendations.
- **My Overview** – each player's whole current season: rank, season record and one card per pool champion (portrait, games, wins/losses, win rate, mastery combined across accounts, proficiency, last played), with a **Season** dropdown (earlier seasons only when their games are stored) and a **Game mode** dropdown (All supported games, Ranked Solo/Duo, Ranked Flex, Normal games). The season is labelled **Partial** until every linked account has been read back to the season start, and **Complete** after. Teammates see the same view on a profile. Nothing is modelled: every figure is a count of stored games.
- **Solo Queue Blocks** (optional, under My Overview) – a private Solo/Duo improvement journal per player: blocks of up to six games, a thirty-second entry (champion, enemy laner, result, main mistake, notes), one-tap import of recent synced Riot games, ranked focus champions and a one-sentence focus, simple statistics. Only the player can see it; it never touches the team's drafting data.
- **Trends** – contested champions, risers and fallers versus the previous patch, pro priority and draft patterns, and alerts that matter to your lineup's pools.
- **Settings** – for everyone: the account, its password, linked Riot accounts, sign out.
- **Branding** – team name, short name, optional tagline (none is shown when empty), logo and background images (GIFs keep their animation; the browser tab and people who prefer reduced motion get the still first frame) and five colours (primary and secondary accent, background, surface, highlight) with a live preview and contrast checks that refuse unreadable combinations.
- **Admin Mode** – an admin who also plays (has a player profile) uses UNIIVERSE as a player by default; an admin-only account (no player profile, e.g. `adminascend`) opens straight in the Admin area. Either switches to Admin Mode from the sidebar (or the phone drawer) for the Admin area: Players & Accounts (Add Player Account; status filters Active · Setup incomplete · Deactivated · Riot synced · Sync delayed; password resets, deactivate, delete, Main / Other), Users & Permissions (one Access Level per account; what each level allows, editable, behind a disclosure), Competition (read-only draft templates, pool limits, engine weights), Data & Riot (status cards — Healthy / Updating / Delayed / Unavailable / Needs attention — for Riot, player accounts, statistics, global data, professional data and anything that needs you; details on request), Branding and System Health (Website, Database, Riot API, Player syncing, Background jobs in plain words, each backed by evidence; technical details on request). Results of actions appear as short notifications. Players never see it.

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

4. Deploy. The database schema is created automatically on first start; champions sync automatically. Open the URL: the setup page asks for the setup key and creates the **owner** account. Create every other account from Admin → Players & Accounts (Add Player Account) and give each player the address, their username and the temporary password shown once.
5. **Automation**: something must call `/api/jobs/tick` regularly. Vercel's built-in cron (`vercel.json`) runs it once a day as a safety net, the included GitHub Actions workflow (`.github/workflows/data-jobs.yml`, repository secrets `APP_URL` and `CRON_SECRET`) hourly, and the site itself whenever the team uses it (a visit starts a background tick when none ran for 30 minutes). Supabase `pg_cron` is optional for a strict ten-minute cadence (docs/DEPLOYMENT.md §4 has the SQL).

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

Intervals are editable in **Admin → Data & Riot** without redeploying. The same page shows freshness and warns when a pipeline has not succeeded for too long.

## Troubleshooting

- **"One step before the app can open"** – production is missing `UNIIVERSE_AUTH_SECRET` or `DATABASE_URL`. Add them in Vercel and redeploy. The first visit then asks for the setup key (`UNIIVERSE_ACCESS_PASSWORD`) to create the owner.
- **A player cannot sign in** – everyone signs in with username + password. A temporary password expires after seven days and stops working once the player has chosen a permanent one. An admin clicks *Reset password* under Admin → Players & Accounts (or Users & Permissions): a new temporary password is shown once, the old password and all of that player's sessions stop working, and the player must choose a new password at the next sign-in. Repeated wrong passwords are throttled for 15 minutes. A deactivated account cannot sign in until it is reactivated.
- **An admin forgot their password** – another admin clicks *Reset password* next to them in Admin → Users & Permissions and passes on the one-time password; their other devices are signed out. Players have no password. If the owner is locked out: run `pnpm user:reset-password <username>` on a machine with the production `DATABASE_URL` in `.env.local`; it prints a temporary password. The app deliberately sends no email.
- **"Complete your player profile" banner** – an account from before automatic profiles (the original owner) is asked once for its Riot ID and main role under My profile; the profile is created and linked immediately.
- **Statistics say "demo"** – no real games have been ingested yet. Check `RIOT_API_KEY` in Admin → System Health → Environment, then run `ranked-discover`, `ranked-ingest` and `aggregate` from Admin → Data & Riot (or wait for the scheduler). Remove demo statistics from Admin → System Health → Demo data once real data exists (they are ignored automatically anyway).
- **Data health says "statistics: none · 0 games"** – the aggregate job ran but had nothing to fold in: no ranked matches and no professional games have been stored yet. Look at Admin → Data & Riot: `ranked-discover` / `ranked-ingest` must say *ok* with growing `matchesQueued` / `inserted` numbers and `pro-sync` must show `inserted` > 0. A *degraded* badge with a message (key rejected, query refused…) is the cause; Data health repeats the message as a warning.
- **After changing `RIOT_API_KEY`, match lookups answer 400** – Riot encrypts player ids per key. Discovery prunes the old ids automatically and re-discovers players; linked accounts re-resolve from their Riot ID on the next sync. Nothing to do.
- **Riot jobs fail with 403/401** – first click **Check key now** under Admin → Data & Riot → Riot credential (or run the `riot-check` job): it makes one cheap request and records whether Riot accepts the key, with the HTTP status. *Rejected* with 403: the key expired (development keys last 24 hours) or was revoked; 401: the stored `RIOT_API_KEY` is not a key Riot recognises (Admin → System Health → Environment says "set, check value" when it does not look like `RGAPI-…`). Replace the value in Vercel → Settings → Environment Variables and redeploy, or register a Personal key. *Accepted* while a job still reports 403 means that one request was refused for another reason (a routing value that does not serve the endpoint, as OCE Riot ID lookups were until the `sea` → `asia` fix); the job's message names the endpoint.
- **Champion portraits missing** – the server could not reach Data Dragon yet (Admin → Data & Riot shows "offline fixture"). It retries hourly; run `static-sync` manually to force it.
- **A champion was reworked** – Admin → Competition → Champion reworks lists auto-detected kit changes; confirm to discount old evidence more strongly, or dismiss.
- **Scheduled GitHub workflow stopped or runs rarely** – GitHub pauses schedules after 60 days without commits (re-enable it under Actions) and runs cron workflows only best-effort (a 10-minute schedule fired four to five times a day for this repository). The workflow therefore only starts the tick (about one billed minute per run) and visits to the site start one too; for a strict ten-minute cadence use Supabase `pg_cron` (docs/DEPLOYMENT.md §4).

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
