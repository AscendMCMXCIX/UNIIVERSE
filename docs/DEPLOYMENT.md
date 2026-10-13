# Deployment guide

This guide assumes no prior deployment experience. The whole setup takes about 30 minutes and uses free tiers to start.

## 1. Database: Supabase

1. Go to https://supabase.com, create an account and a new project (pick a region close to your team). Choose a strong database password and save it.
2. In the project, open **Connect** (top bar) → **Connection string** → tab **Transaction pooler**. Copy the URI; replace `[YOUR-PASSWORD]` with your database password. This is your `DATABASE_URL`.
3. Backups: Supabase Pro includes daily backups and point-in-time recovery; the free tier does not. For a free project, download a backup occasionally from **Database → Backups**, or run `pg_dump` with the *Session pooler* string. Player profiles, pools, lineups and draft history are the valuable data.

## 2. Riot API key

1. Sign in at https://developer.riotgames.com with your Riot account.
2. The dashboard shows a **Development API key** (expires every 24 hours) — fine for testing.
3. For a persistent key, click **Register product** → **Personal API key**, describe UNIIVERSE as a private team drafting tool, and wait for approval. Replace `RIOT_API_KEY` when it arrives.
4. Riot keys allow 20 requests/second and 100 per 2 minutes by default; UNIIVERSE respects this automatically. Higher limits: set `RIOT_RATE_LIMITS`.

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
   | `RIOT_PLATFORMS` | e.g. `euw1,kr,na1` | optional |

   Generate random strings with `openssl rand -hex 32` or any password manager. Enter them only in Vercel's Environment Variables screen (or `.env.local` locally) — never in chat, commits or the repository.
4. Click **Deploy**. On first start the app creates its tables and syncs champions. Open the URL: the **setup page** asks for the setup key and your email/password and creates the owner account. From then on everyone signs in at `/login`.
5. **Invite the team**: Settings → Members → create an invite (role: coach/analyst or player, optionally pre-linked to a player profile). Send the link; it is single-use and expires. Players who claim a profile can edit only their own pools and link their own Riot accounts.
6. Later changes to environment variables need a redeploy (Deployments → ⋯ → Redeploy).

**Function duration.** The job endpoint and the live draft stream declare `maxDuration = 300` seconds. Vercel projects created since 2025 run on Fluid compute, where 300 s is allowed on every plan. If a deploy is rejected with a message about `maxDuration` exceeding the plan limit, enable Fluid compute (Project → Settings → Functions) or lower both values to 60 in `src/app/api/jobs/[job]/route.ts` and `src/app/api/drafts/[id]/stream/route.ts`; jobs are incremental and simply continue on the next tick.

**TLS to the database.** Hosted databases get an encrypted connection automatically (`sslmode` in the URL wins; `DATABASE_SSL` overrides). Supabase's pooler works with the defaults.

**Setup key.** The owner account cannot be created in production until `UNIIVERSE_ACCESS_PASSWORD` is set; the setup page says so. The key is only ever used once, on that page; afterwards it can stay or be removed.

**Preview deployments.** Every Vercel deployment, preview or production, requires accounts. Scope `DATABASE_URL` to the *Production* environment only (the checkbox list when adding a variable) unless you want previews to share the live database; a preview without a database shows the setup instructions rather than running.

The app works with any host that runs Next.js (Railway, Render, Fly.io, a VPS with `pnpm build && pnpm start`). Set `UNIIVERSE_REQUIRE_AUTH=true` on non-Vercel hosts so the password is enforced.

## 4. Automation (data refreshes)

UNIIVERSE needs something to call `https://YOUR-APP/api/jobs/tick` regularly with the header `Authorization: Bearer <CRON_SECRET>`. Every call runs whatever is due. Pick one or more:

**a) Vercel Cron** (zero setup, included): `vercel.json` schedules the tick every 10 minutes. On the Hobby plan Vercel runs it only about once a day, which keeps champions and pro data fresh but makes ranked ingestion slow. The Pro plan runs it every 10 minutes.

**b) GitHub Actions** (free, every 10 minutes): in the GitHub repository go to **Settings → Secrets and variables → Actions** and add secrets `APP_URL` (e.g. `https://uniiverse.vercel.app`) and `CRON_SECRET`. The workflow `.github/workflows/data-jobs.yml` is already in the repository. GitHub pauses scheduled workflows after 60 days with no commits; re-enable under the **Actions** tab if that happens.

**c) Supabase pg_cron** (runs inside your database, never pauses): in the Supabase SQL editor enable the extensions and schedule the call:

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

**d) Any cron service** (cron-job.org, UptimeRobot heartbeat…): call the same URL every 10 minutes with the bearer header.

Check **Settings → Data health** after an hour: every job should show *ok* with a recent success time.

## 5. After the first deployment: validate against the real services

The app was built and tested without network access to Riot, Data Dragon and Leaguepedia. Work through [LIVE_VALIDATION.md](LIVE_VALIDATION.md) once with real credentials; it lists what to click, what to expect and what a failure looks like. Read [RIOT_COMPLIANCE.md](RIOT_COMPLIANCE.md) before registering a persistent Riot key.

## 6. Updating the app

Push to the branch Vercel deploys from; CI (`.github/workflows/ci.yml`) typechecks, lints, tests and builds every push. Data updates never require a deployment.

## 7. Local development against production data (optional)

Put the same `DATABASE_URL` in `.env.local` to run the app locally against the real database. Leave it out to use the embedded demo database.
