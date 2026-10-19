# Deployment guide

This guide assumes no prior deployment experience. The whole setup takes about 30 minutes and uses free tiers to start.

## 1. Database: Supabase

1. Go to https://supabase.com, create an account and a new project (pick a region close to your team). Choose a strong database password and save it.
2. In the project, open **Connect** (top bar) → **Connection string** → tab **Transaction pooler**. Copy the URI; replace `[YOUR-PASSWORD]` with your database password. This is your `DATABASE_URL`.
3. Backups: Supabase Pro includes daily backups and point-in-time recovery; the free tier does not. For a free project, download a backup occasionally from **Database → Backups**, or run `pg_dump` with the *Session pooler* string. Player profiles, pools, lineups and the stored match history are the valuable data.

## 2. Riot API key

1. Sign in at https://developer.riotgames.com with your Riot account.
2. The dashboard shows a **Development API key** (expires every 24 hours) — fine for testing.
3. For a persistent key, click **Register product** → **Personal API key**, describe UNIIVERSE as a private team tool for one amateur team, and wait for approval. Replace `RIOT_API_KEY` when it arrives.
4. Development and personal keys allow 20 requests/second and 100 per 2 minutes **per Riot host** (every server such as `oc1` or `kr`, and every regional routing host such as `sea` or `europe`, has its own budget). UNIIVERSE keeps one limiter per host, so collecting from all regions runs in parallel without tripping the limit. A production key with higher limits: set `RIOT_RATE_LIMITS` (per host), e.g. `500:10,30000:600`.
5. Which servers to collect from: `RIOT_PLATFORMS=all` for every public League server (recommended), or a list such as `oc1,euw1,kr`. Admin → Data & Riot → **Global Data Coverage** shows every server with its status, patch, games and last sync; a configured server without data is never reported as healthy.

## 2b. Leaguepedia account (professional draft data)

Professional picks, bans and pick order come from Leaguepedia (lol.fandom.com). Its API rate-limits anonymous clients so tightly that a cloud host is refused on the very first request ("You've exceeded your rate limit"), so UNIIVERSE logs in with a *bot password*, a read-only API credential tied to a wiki account:

1. Create a free account at https://lol.fandom.com (any Fandom account works) and sign in.
2. Open https://lol.fandom.com/wiki/Special:BotPasswords, enter a bot name such as `uniiverse` and click **Create**. Leave the grants at their defaults (basic rights are enough to read Cargo tables).
3. The page shows the login name in the form `YourAccount@uniiverse` and a generated password. Add them in Vercel as `LEAGUEPEDIA_USERNAME` and `LEAGUEPEDIA_PASSWORD` (Environment Variables → Production) and redeploy. Enter them only there; never in chat, commits or the repository.
4. Run `pro-sync` from Admin → Data & Riot: expect `fetched` and `inserted` above zero and the log line "logged in to Leaguepedia as …". A wrong password shows as "Leaguepedia login failed: …".

Leaguepedia asks API users for a descriptive user agent and a polite request rate; UNIIVERSE sends one and waits a second between pages. Alternative without an account: `PRO_DATA_PROVIDER=oracleselixir` with `PRO_DATA_CSV_URL` pointing at an Oracle's Elixir match-data CSV.

## 3. App: Vercel

> **Production target:** Vercel. **Production branch:** `main` (Vercel → Project → Settings → Git → Production Branch). Every push to `main` produces a production deployment; pushes to other branches produce preview deployments.

1. Push this repository to GitHub (already done if you are reading this there).
2. Go to https://vercel.com → **Add New… → Project** → import the repository. Framework: Next.js (auto-detected). Keep defaults.
3. Before the first deploy, open **Environment Variables** and add:

   | Name | Value | Required |
   | --- | --- | --- |
   | `DATABASE_URL` | Supabase transaction-pooler URI | yes |
   | `UNIIVERSE_AUTH_SECRET` | long random string (signs sessions) | yes |
   | `UNIIVERSE_ACCESS_PASSWORD` | one-time setup key for creating the owner account | yes |
   | `CRON_SECRET` | long random string | yes (automation) |
   | `RIOT_API_KEY` | your Riot key | for ranked data and linked accounts |
   | `RIOT_PLATFORMS` | `all`, or a list such as `oc1,euw1,kr` | optional (default `oc1`) |
   | `RIOT_DEFAULT_PLATFORM` | server the sign-up region selector starts on (default `oc1`; Riot confirms each account's real server) | optional |
   | `LEAGUEPEDIA_USERNAME` / `LEAGUEPEDIA_PASSWORD` | bot password from §2b | for professional draft data |

   Generate random strings with `openssl rand -hex 32` or any password manager. Enter them only in Vercel's Environment Variables screen (or `.env.local` locally) — never in chat, commits or the repository.
4. Click **Deploy**. On first start the app creates its tables and syncs champions. Open the URL: the **setup page** asks for the setup key, a username, your Riot ID, your main role and a password, and creates the owner account together with its player profile. From then on everyone signs in at `/login` with username + password.
5. **Add the team**: switch to Admin Mode (sidebar) → Players & Accounts → **Add Player Account**: username and Riot ID, nothing else. Riot confirms the Riot ID (a working `RIOT_API_KEY` is needed), then the account, the player profile and the Riot account are created together and the page shows a temporary password once (only its hash is stored; valid 7 days). Give the player the website address, their username and the temporary password. They sign in with the two, choose a permanent password, complete the mandatory first-time setup (roles and champion pools) and land in the normal Player View. Players edit only their own profile and control the drafts they create.
6. Later changes to environment variables need a redeploy (Deployments → ⋯ → Redeploy).

**Function duration.** The job endpoint declares `maxDuration = 300` seconds. Vercel projects created since 2025 run on Fluid compute, where 300 s is allowed on every plan. If a deploy is rejected with a message about `maxDuration` exceeding the plan limit, enable Fluid compute (Project → Settings → Functions) or lower the value to 60 in `src/app/api/jobs/[job]/route.ts`; jobs are incremental and simply continue on the next tick.

**TLS to the database.** Hosted databases get an encrypted connection automatically (`sslmode` in the URL wins; `DATABASE_SSL` overrides). Supabase's pooler works with the defaults.

**Setup key.** The owner account cannot be created in production until `UNIIVERSE_ACCESS_PASSWORD` is set; the setup page says so. Keep it afterwards: it is also the owner-recovery key (see below).

**Owner recovery (forgot the username or password).** Sign-in is username + password only; there is no email login and no reset link. Accounts created before usernames existed were given their former display name as username (an account with a blank display name got the part of its email before the @). If the owner does not know the username or password, open `https://YOUR-APP/recover` and enter the setup key (`UNIIVERSE_ACCESS_PASSWORD`): the page shows the owner username, lets the owner choose a new username and/or password (leave a field empty to keep it), and signs them in. The key is checked in constant time and throttled like the setup page; the role, the player profile and the password hash stay untouched unless changed on purpose, and no account is ever created. Keep `UNIIVERSE_ACCESS_PASSWORD` set for this reason. The CLI alternative, for a machine with the production `DATABASE_URL` in `.env.local`, is `pnpm user:reset-password <username>`. Admin → Data & Riot → `auth-audit` is a read-only check that lists owner usernames and flags accounts that cannot sign in.

**Session length.** Every sign-in lasts 24 hours from the moment of signing in (activity does not extend it); then the person signs in again. There is no "Remember this device" option. The length is fixed in `src/server/auth/config.ts`; the old `UNIIVERSE_SESSION_DAYS` / `UNIIVERSE_SESSION_REMEMBER_DAYS` variables are ignored and can be deleted from the hosting environment.

**Preview deployments.** Every Vercel deployment, preview or production, requires accounts. Scope `DATABASE_URL` to the *Production* environment only (the checkbox list when adding a variable) unless you want previews to share the live database; a preview without a database shows the setup instructions rather than running.

The app works with any host that runs Next.js (Railway, Render, Fly.io, a VPS with `pnpm build && pnpm start`). Set `UNIIVERSE_REQUIRE_AUTH=true` on non-Vercel hosts so the password is enforced.

## 4. Automation (data refreshes)

UNIIVERSE needs something to call `https://YOUR-APP/api/jobs/tick` regularly with the header `Authorization: Bearer <CRON_SECRET>`. Every call runs whatever is due, within a four-minute budget, and the response lists each job's summary, error and last log lines. The three schedulers below are complementary; the repository ships with a) and b) configured and c) is the one that gives ranked ingestion its full throughput.

**d) Visits** (built in, no setup): while the team uses the site, a page view starts a background tick when none has started for 30 minutes (`UNIIVERSE_VISIT_TICK_MINUTES`; a lease row in `app_settings` makes it one tick however many people are on), and opening a player's pages refreshes that player's Riot accounts. The page is sent first; the work runs afterwards in the same invocation (Next.js `after`, `maxDuration = 300`; the tick may use up to 230 s, `UNIIVERSE_VISIT_TICK_BUDGET_MS`). On by default on Vercel; `UNIIVERSE_BACKGROUND_REFRESH=false` turns it off.

**a) Vercel Cron, daily safety net** (included): `vercel.json` schedules the tick once a day at 04:00 UTC. The Hobby plan accepts daily schedules only (it rejected `*/10`), so this alone keeps champions, the patch and professional data fresh but ingests few ranked games. It needs no setup beyond the `CRON_SECRET` variable, and it never pauses.

**b) GitHub Actions, hourly** (included): in the GitHub repository go to **Settings → Secrets and variables → Actions** and add secrets `APP_URL` (e.g. `https://team-uniiverse.vercel.app`) and `CRON_SECRET`. The workflow `.github/workflows/data-jobs.yml` then starts the tick on a `17 * * * *` schedule with `?background=1`: the app answers 202 at once and runs the tick on its own for up to four minutes, so each run bills about one Actions minute. GitHub delivers about 4–5 of the hourly runs a day, so this costs about 130 minutes a month of the 3,000 included in GitHub Pro (see `docs/CI_USAGE.md`). It can be run by hand from the **Actions** tab with a job name (`ranked-discover`, `pro-sync`, `aggregate`, `data-sufficiency`…); manual runs wait and print the response, and several jobs can share one run (`perf-probe engine-probe`). GitHub runs cron workflows best-effort (a `*/3 hours` schedule was delivered four to six times a day for this repository), which is why d) exists. GitHub also disables scheduled workflows after 60 days without commits; re-enable under **Actions** if that happens. The repository variable `DATA_JOBS_ENABLED=false` pauses it.

**c) Supabase pg_cron, every ten minutes** (recommended for ranked data; runs inside your database, free, never pauses): in the Supabase dashboard open **SQL Editor**, paste the following, replace the two placeholders (the URL of your app and the value of `CRON_SECRET`, typed here and nowhere else) and run it once:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule(
  'uniiverse-tick', '*/10 * * * *',
  $$ select net.http_get(
       url := 'https://YOUR-APP/api/jobs/tick',
       headers := '{"Authorization": "Bearer YOUR_CRON_SECRET"}'::jsonb,
       timeout_milliseconds := 290000) $$);
```

`select * from cron.job;` lists the schedule and `select cron.unschedule('uniiverse-tick');` removes it. With this in place a development Riot key yields roughly a hundred ranked games per tick; a Personal key, with its higher rate limits, several times that.

**d) Any other cron service** (cron-job.org, UptimeRobot heartbeat…): call the same URL every ten minutes with the bearer header. Check that the service waits long enough for the response (up to five minutes).

Check **Admin → Data & Riot** after an hour: every job should show *ok* with a recent success time, and a *degraded* job's message is repeated there as a warning.

## 5. After the first deployment: validate against the real services

The app was built and tested without network access to Riot, Data Dragon and Leaguepedia. Work through [LIVE_VALIDATION.md](LIVE_VALIDATION.md) once with real credentials; it lists what to click, what to expect and what a failure looks like. Read [RIOT_COMPLIANCE.md](RIOT_COMPLIANCE.md) before registering a persistent Riot key.

## 6. Updating the app

Merge a pull request into `main`, the branch Vercel deploys from (direct pushes to `main` are blocked by `.githooks/pre-push`). CI (`.github/workflows/ci.yml`) typechecks, lints, tests and builds pull requests and pushes to `main`. Docs- and tooling-only changes skip CI and the production build. The workflow is in `CLAUDE.md`, the budget in `docs/CI_USAGE.md`. Data updates never require a deployment.

## 7. Local development against production data (optional)

Put the same `DATABASE_URL` in `.env.local` to run the app locally against the real database. Leave it out to use the embedded demo database.
