# UNIIVERSE

A private, player-centred League of Legends team platform.

UNIIVERSE brings one team's players, lineup, champion pools and Riot games together: who plays which role, what each player brings to it, how the team has been playing together, and how each player's season is going.

It is not a tier list or a win-rate website. Everything starts from the team's own players and their configured champion pools.

## What it does

- **Team** – the current main lineup as five esports-style player cards: picture, rank, role, and the champions each brings to that role with this season's games, W–L, mastery points and proficiency. Champions are edited in place (autosave); players are swapped from a dropdown by whoever may manage the lineup (any team member who lists that role). Five cards sit side by side on wide screens and wrap in balanced rows on smaller ones; the Off Role badge appears only when someone plays outside their primary role, and Support cards show average vision score instead of CS/min.
- **Players** – one directory of everyone in UNIIVERSE (lineup first), each with a profile every member can open: picture, roles, rank, champion pools, linked Riot accounts and a Season statistics tab. Teammates can view a profile but never edit it; the Solo Queue Blocks journal stays private. Players edit their own profile in place; who else may edit is a permission.
- **Champion pools** – each player has a primary role with a champion pool (up to six) and an optional secondary role with its own pool (up to three), picked from one shared champion selector (instant search, champion-select role filter with Riot's position icons) and ordered by preference with drag and drop (mouse, touch or keyboard). Changes save automatically (Saving… / Saved / Unable to save — Retry) and never overwrite a newer edit made elsewhere. Linked **Riot accounts** (Riot ID shown, PUUID kept internal, no duplicates) feed a per-champion, per-role **proficiency** estimate of experience (Main / Comfortable / Familiar / Few games / Out of practice / Not played, with the strength of the evidence shown separately as one to three bars, each explained by an ⓘ that opens on hover, keyboard focus or tap) built from every linked account together (games de-duplicated, mastery combined with a per-account breakdown; Ranked Solo/Duo counts most, then Flex, then Normal games) that refines, but never overrides, the configured pools.
- **Accounts and permissions** – an administrator creates every account in Admin Mode → Users & Permissions (**Add Player Account**: username + Riot ID; Riot must confirm the Riot ID first; no email, no self sign-up, no invitation links) and is shown a randomly generated **temporary password** once (stored only as a hash, valid 7 days). The player opens the normal UNIIVERSE address, signs in with their username and the temporary password, must choose a permanent password (typed twice), completes the mandatory **Welcome** setup (primary role and 1–6 champions, optional secondary role and up to 3) and lands in the Player View. After that they sign in with username + password; a sign-in lasts 24 hours, then they sign in again. A forgotten password is reset by an admin, which issues a new temporary password. Each account has one **Access Level**: **Owner** (everything, including accounts, passwords and permissions), **Team Manager** (runs the team from the ordinary pages: lineup, players, matches), **Standard Player** (the default), **Restricted Player**, or **Custom** (plain-English capabilities ticked one by one); an administrator can edit what each level allows or add their own. Account and permission management is for administrators (the Owner, and accounts given administrator access) and is never part of a level or group; nobody changes their own level, groups or administrator access, only the Owner changes the Owner account, and the last administrator can never lose it. Every rule is enforced on the server, not by hidden buttons. Players change their own username, password (12+ characters and not a common password, for new and changed passwords; existing passwords keep working) and optional profile picture in Settings, and manage their Riot accounts there: a renamed Riot ID is followed automatically by PUUID, and a typed change asks before replacing one account with a different one.
- **Team Matches** – the Riot games two or more team members played on the same side (**Played together**), with filters, bookmarks and the full match details.
- **Encounters** – in each profile's Match History, the opponents and allies that player keeps meeting, with their record against and alongside them.
- **Team** – five equal player cards: the featured champion's splash art (any champion, with any of its skins; new champions and skins appear automatically after the daily static sync) behind the header, two or three strength tags for the role each player holds in the lineup, chosen across the lineup so teammates are told apart (signature champions, class and style tags from proven champions in that role, performance tags only with enough games in it), season games, win rate and KDA in that role, and the entire role pool as a wrapping grid (no "+N more", no scrolling inside the card). Your own card has a **Customise** button (featured champion, skin, accent colour).
- **My Profile** – tabs **Overview**, **Champions & Roles** and **Riot Accounts**, the same tabs every teammate sees on `/players/[id]`. The statistics default to every champion, every linked account and every supported game mode in the current season, with filters for season, mode, role, configured pool, champion and account and a plain label saying exactly what is counted (a game seen from two accounts counts once; role filters count only games played in that position). The same champion may sit in several role pools; its experience is tracked per role. Profiles are read-only for others and editable by their owner or an admin: roles (primary, secondary and up to three optional additional roles, each with its own pool, no size cap, drag to reorder), the season headline (win rate, games, KDA, then CS, damage and vision per game), and one card per pool champion with its games, win rate, KDA and proficiency tier (with an explanation; tiers need enough games, mastery alone never makes a champion "Core"), with a **Season** dropdown (earlier seasons only when their games are stored) and a **Game mode** dropdown (All supported games, Ranked Solo/Duo, Ranked Flex, Normal games). The season is labelled **Partial** until every linked account has been read back to the season start, and **Complete** after. Teammates see the same view on a profile. Nothing is modelled: every figure is a count of stored games.
- **Match History** (a section of My Profile) – your stored Riot games across every linked account, newest first, a page at a time (as many rows as fit the screen), compact like OP.GG: result, queue, time, champion, spells and runes, K/D/A, CS/min, damage/min, vision, kill participation and items, with filters for season, mode, role, champion and account. Clicking a game opens its details over the page (both teams, objectives, bans, every player's figures) without losing your place; a Ranked Solo/Duo game can be added to your Solo Queue Block from there. Nothing is fetched from Riot while the list opens: records are kept by the regular account sync, and older games fill in over the following syncs (the page says so). Your profile picture can be changed straight from My Profile (camera badge).
- **Solo Queue Blocks** (a section of My Profile) – a private Solo/Duo improvement journal per player: the ranked focus at the top (kept with every block it was played with), blocks of a size the player chooses (finish early any time; history shows planned, logged and completed early), one-tap logging of recent synced Riot games (main mistake and a note), and "Played with" for registered teammates found on the same side of the same match (correctable, never an enemy, not claimed as a duo). Only the player can see it; it never touches the team's statistics.
- **Navigation** – one **Team** entry, whose sections (Overview, Players, Leaderboards, Matches) are tabs at the top of its pages; **Resources**, the team's library of League of Legends sites, kept by administrators in Platform Settings; and **My Profile**, whose sections (Overview, Champions & Roles, Solo Queue Blocks, Match History, Riot Accounts) are one dropdown that keeps the season and mode filters and works with Back/Forward. A collapsed sidebar opens smoothly while the pointer is over it (clip and transform only, no reflow; reduced motion respected) and the toggle at its foot keeps it open (Ctrl+\\). The account menu holds only Settings and Sign out; administrators' mode switch sits in the sidebar.
- **Riot accounts** – each player has exactly one **Main** account (shown on the profile and used for rank) and any number of **Alts**; all of them feed statistics. "Make Main account" swaps them; removing the Main promotes the oldest Alt.
- **Settings** – for everyone: the account, its password, sign out (Riot accounts moved to My Profile → Riot Accounts).
- **Public team page** – visitors at the site's address get the team's public lineup and its substitutes (`/public`, from a public allowlist: no Riot ID, and no rank, statistic or Leaderboards unless a deployment with a Riot Production key allows them). Its **Sign in** opens a small window over the page with the same sign-in as `/login`, which stays for direct links.
- **Install App** – beside Settings (sidebar and phone menu), and in the public team page's header. Where the browser offers to install (Chrome or Edge on Windows, Android, macOS, Linux, ChromeOS), **Install** shows the browser's own install dialog. iPhone and iPad get the Share → Add to Home Screen steps for the browser in use; other browsers get their own steps or an honest alternative. Not shown inside the installed app.
- **Branding** – team name, short name, optional tagline (none is shown when empty), logo, a **sign-in background** and a separate **app background** (the existing background was copied to both) up to 20 MB each (sent in pieces of 3.5 MB to stay under the hosting platform's 4.5 MB request limit; GIFs keep their animation; the browser tab and people who prefer reduced motion get the still first frame) and five colours (primary and secondary accent, background, surface, highlight) with a live preview and contrast checks that refuse unreadable combinations.
- **Player Mode and Admin Mode** – administrators (the Owner, and any account given administrator access) play in Player Mode like everyone else and switch to **Admin Mode** with **Switch to Admin Mode** in the sidebar, the phone menu or Settings (**Return to Player Mode** goes back). Admin Mode has its own pages and none of the player pages: **Dashboard** (accounts, data and recent activity at a glance), **Users & Permissions** (Add Player Account, statuses, password resets, deactivate, delete, team membership, access levels and groups, administrator access), **Platform Settings** (Branding, Previews), **Data & Integrations** (Riot data and jobs), **System Health** (Website, Database, Riot API, player syncing, background jobs, each backed by evidence) and **Audit Logs** (who changed what, by category). Every `/admin` address is Admin Mode and checked on the server; a reload, a bookmark or the installed app keeps the mode. Players never see Admin Mode named. Results of actions appear as short notifications.

Data updates are automatic: new patches, new champions and skins (Data Dragon), and the linked players' own games, ranks and mastery (Riot API). No manual data maintenance is needed for normal League changes.

## How it works (short version)

```
Riot Data Dragon ──► champions, skins & patches ─┐
Riot account APIs ─► linked players' games,      ├─► your players' pools, statistics and proficiency
                     ranks and mastery ──────────┘                    │
                                                                       ▼
                              Team Overview · profiles · Leaderboards · Team Matches
```

Every figure is a count of the linked players' own stored games; proficiency shrinks small samples towards a prior so three games at 67% never look decisive. Details: [docs/DATA_PIPELINES.md](docs/DATA_PIPELINES.md) and [docs/CHAMPION_EXPERIENCE_LABELS.md](docs/CHAMPION_EXPERIENCE_LABELS.md).

## Running it locally (no accounts needed)

Requirements: Node.js 20.9+ and pnpm 10 (`corepack enable` installs pnpm automatically).

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000. With no configuration UNIIVERSE runs in **demo mode**: an embedded database in `./.data`, a demo roster, demo linked accounts with synthetic games so every screen works, and a local owner session (no login). Champion portraits need internet access to Riot's CDN; without it the app shows lettered tiles.

Useful commands:

| Command | What it does |
| --- | --- |
| `pnpm dev` | Start the app for development |
| `pnpm check` | Typecheck + lint + tests (what CI runs) |
| `pnpm test` | Run the test suite (domain logic, pipelines, accounts, permissions and the database layer) |
| `TEST_DATABASE_URL=postgres://… pnpm test` | Same suite, but every database test runs on a real Postgres server (CI does this on PostgreSQL 16) |
| `pnpm jobs:tick` | Run every data job that is due, once |
| `pnpm job <name>` | Run one job (`pnpm job list` shows them) |
| `pnpm seed:demo` | Seed the demo roster |
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
   | `RIOT_PLATFORMS` | the server the Riot key check asks, e.g. `oc1` (optional; default `oc1`) |

4. Deploy. The database schema is created automatically on first start; champions sync automatically. Open the URL: the setup page asks for the setup key and creates the **owner** account. Create every other account from Admin → Players & Accounts (Add Player Account) and give each player the address, their username and the temporary password shown once.
5. **Automation**: something must call `/api/jobs/tick` regularly. Vercel's built-in cron (`vercel.json`) runs it once a day as a safety net, the included GitHub Actions workflow (`.github/workflows/data-jobs.yml`, repository secrets `APP_URL` and `CRON_SECRET`) hourly, and the site itself whenever the team uses it (a visit starts a background tick when none ran for 30 minutes). Supabase `pg_cron` is optional for a strict ten-minute cadence (docs/DEPLOYMENT.md §4 has the SQL).

All secrets stay server-side. Nothing is read from the browser. **Nothing in this repository has been verified against the real Riot or Data Dragon services yet** (the build environment could not reach them); [docs/LIVE_VALIDATION.md](docs/LIVE_VALIDATION.md) is the checklist to run after the first deployment.

## Environment variables

See [`.env.example`](.env.example) for every variable with explanations. Locally, copy it to `.env.local`.

## Automated jobs

| Job | Default interval | Purpose |
| --- | --- | --- |
| `version-check` | hourly | Detect a new Riot version; sync champions and skins |
| `account-sync` | 15 min | Incrementally sync linked player accounts (history, mastery, rank), most urgent first; resolves new sign-ups' Riot IDs to PUUIDs |
| `timeline-backfill` | hourly | Fetch the match timelines Matchups needs, a few per run |
| `figures-backfill` | hourly | Fetch again, once, the records of Season 2026 games stored before multikills and the other extra figures were kept, a few per run |
| `integrity` | daily | Unstick job states left running by an interrupted process |

Intervals are editable in **Admin → Data & Riot** without redeploying. The same page shows freshness and warns when a pipeline has not succeeded for too long.

## Troubleshooting

- **"One step before the app can open"** – production is missing `UNIIVERSE_AUTH_SECRET` or `DATABASE_URL`. Add them in Vercel and redeploy. The first visit then asks for the setup key (`UNIIVERSE_ACCESS_PASSWORD`) to create the owner.
- **A player cannot sign in** – everyone signs in with username + password. A temporary password expires after seven days and stops working once the player has chosen a permanent one. An admin clicks *Reset password* under Admin → Players & Accounts (or Users & Permissions): a new temporary password is shown once, the old password and all of that player's sessions stop working, and the player must choose a new password at the next sign-in. Repeated wrong passwords are throttled for 15 minutes. A deactivated account cannot sign in until it is reactivated.
- **An admin forgot their password** – another admin clicks *Reset password* next to them in Admin → Users & Permissions and passes on the one-time password; their other devices are signed out. Players have no password. If the owner is locked out: run `pnpm user:reset-password <username>` on a machine with the production `DATABASE_URL` in `.env.local`; it prints a temporary password. The app deliberately sends no email.
- **"Complete your player profile" banner** – an account from before automatic profiles (the original owner) is asked once for its Riot ID and main role under My profile; the profile is created and linked immediately.
- **After changing `RIOT_API_KEY`, match lookups answer 400** – Riot encrypts player ids per key. Linked accounts re-resolve from their Riot ID on the next sync. Nothing to do.
- **Riot jobs fail with 403/401** – first click **Check key now** under Admin → Data & Riot → Riot credential (or run the `riot-check` job): it makes one cheap request and records whether Riot accepts the key, with the HTTP status. *Rejected* with 403: the key expired (development keys last 24 hours) or was revoked; 401: the stored `RIOT_API_KEY` is not a key Riot recognises (Admin → System Health → Environment says "set, check value" when it does not look like `RGAPI-…`). Replace the value in Vercel → Settings → Environment Variables and redeploy, or register a Personal key. *Accepted* while a job still reports 403 means that one request was refused for another reason (a routing value that does not serve the endpoint, as OCE Riot ID lookups were until the `sea` → `asia` fix); the job's message names the endpoint.
- **Champion portraits missing** – the server could not reach Data Dragon yet (Admin → Data & Riot shows "offline fixture"). It retries hourly; run `static-sync` manually to force it.
- **Scheduled GitHub workflow stopped or runs rarely** – GitHub pauses schedules after 60 days without commits (re-enable it under Actions) and runs cron workflows only best-effort (a 10-minute schedule fired four to five times a day for this repository). The workflow therefore only starts the tick (about one billed minute per run) and visits to the site start one too; for a strict ten-minute cadence use Supabase `pg_cron` (docs/DEPLOYMENT.md §4).

## Project layout

```
src/domain      pure logic: roles, eligibility, stats, proficiency, team advice – fully tested
src/server      database, Riot providers, jobs, accounts, auth, matches, actions
src/components  UI building blocks (champion picker, lineup board, player cards, match details…)
src/app         Next.js pages and API routes
drizzle         SQL migrations (embedded into the app at build time)
docs            architecture, pipelines, deployment, Riot compliance, live validation and feature notes
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full picture.


Responsive layout rules and the Playwright smoke tests are described in `docs/RESPONSIVE.md` (`pnpm build && pnpm test:e2e`).
