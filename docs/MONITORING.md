# Monitoring and alerts

What tells the owner that UNIIVERSE is unwell, what does not yet, and how to close the gaps for free. Nothing here costs money on the current free plans.

**Status (3 Nov 2026):** no paid monitoring and no third-party monitor are set up. The signals below come from GitHub, Vercel, Supabase and the app itself. Scheduled Data jobs runs fail when production is unwell (audit decision 10) or when a day's database egress goes over its budget. The **Production check** checks the live site in a browser after each production deployment and every day, and the **Database backup** watches its own size; both report through one GitHub issue each, opened while failing and closed on recovery.

## What is watched today

| Signal | Where | Who hears about it |
|---|---|---|
| The app or its database is down | `GET /api/health`: `503` with `db.ok: false` when the database does not answer. Scheduled Data jobs runs read it and fail | GitHub's failed-workflow email (below) |
| A scheduled Data jobs run cannot reach the app | `.github/workflows/data-jobs.yml`, hourly (GitHub delivers about 4 a day). The run fails when the tick endpoint answers with an error | GitHub emails the account that last changed the workflow's schedule, if that account has Actions notifications turned on |
| A data job fails three times in a row (Riot sync, champion sync, audits) | `/api/health` → `failingJobs`; Admin → System Health. Scheduled Data jobs runs fail while it is listed | GitHub's failed-workflow email (below) |
| Linked accounts stop syncing | `/api/health` → the `account-sync` job's `lastSuccessAt`. Scheduled runs fail when it is older than 12 hours (repository variable `SYNC_STALE_HOURS`) | GitHub's failed-workflow email (below) |
| A pull request breaks something | CI on every ready pull request (`ci.yml`) | The pull request shows the failure |
| A production deployment fails | Vercel | Vercel can email about failed deployments (Account Settings → Notifications)* |
| The database nears a free-plan limit | Supabase usage | Supabase sends usage emails about the free plan's limits* |
| Accounts, sessions and migrations look wrong | Data jobs `auth-audit` (manual) | Only when run; the run's output names the problem |
| Pages are slow on the server | Data jobs `perf-probe` (manual); `slowest` lists the five slowest steps | Only when run |
| Pages are slow in members' browsers (field data) | Each signed-in page load reports its LCP, CLS, INP, FCP and TTFB as counts (`/api/vitals`, table `web_vitals_daily`, below) | Admin → System Health, "Page speed in members' browsers"; no alert |
| A deployment breaks the live site: the wrong commit answering, an error on a page, a member page reachable signed out or with a forged session, a missing security header, sideways scrolling or a serious axe violation at 1440, 768 or 390 px, or a Riot rule for a Personal key broken (Riot API data on the public pages, Riot's required notice missing, `/riot.txt` not served) | **Production check** (`.github/workflows/production-check.yml`, `scripts/live-check.mjs`): after each successful production deployment (Vercel's deployment status) and daily at 05:37 UTC. The member pages are checked once the `UNIIVERSE_VERIFY_USER` / `UNIIVERSE_VERIFY_PASSWORD` secrets exist; until then they are pending | An issue labelled `production-check` (one at a time; the next passing run closes it), with what failed and the run's link; screenshots in the run's artifact |
| Backups stop passing, or near their size limit | **Database backup** (weekly): a failed run, or an encrypted copy over 80% of `MAX_MB`; the daily Production check fails when no backup passed for 8 days | An issue labelled `database-backup`; the Production check's issue for a stale backup |
| The database nears its plan | Daily Production check: `db-usage`'s size, in decimal megabytes, against `DB_PLAN_MB` (default 500, the free plan's 0.5 GB read the safer way). It grows by about 2 MB a day | An issue labelled `database-size` from 80%, opened once and naming the remedy (the held drops of the retired tables); comments on it and the `production-check` issue from 95%; it closes itself under 80% |
| Database egress goes over budget (Supabase Free includes 5 GB a month) | The app counts the bytes every query brings back (`server/db/egress.ts`, table `db_egress_daily`). Scheduled Data jobs runs call the `egress` job, which fails when yesterday (UTC) went over 120 MB (`EGRESS_DAILY_BUDGET_MB`) | GitHub's failed-workflow email (below); `db-usage` and `perf-probe` show where the bytes went |

\* Their usual behaviour, not checked in this project's Vercel or Supabase settings.

After every production deployment the Production check runs by itself (`CLAUDE.md` §5). A manual Data jobs run is only needed for `auth-audit` after a migration, or `perf-probe` outside the Production check's Monday run.

## Page speed in members' browsers (field data)

Lighthouse and the browser tests measure one emulated device in a lab (`docs/PERFORMANCE.md`). The field figures come from members' own phones, tablets and computers. The two are reported apart and never mixed.

- **What is measured.** On every signed-in page (Player Mode and Admin Mode), the browser reports Google's Core Web Vitals through Next.js's own `useReportWebVitals`, with no extra library: Largest Contentful Paint, Interaction to Next Paint and Cumulative Layout Shift, plus First Contentful Paint and Time to First Byte. Each browser reports what it supports; a browser without a measure sends none.
- **What is sent** (`src/components/web-vitals-reporter.tsx`): once, when the page is hidden (closed, left or put in the background), one small beacon carrying:
  - each measure's bucket number, not its value (the buckets are in `src/domain/web-vitals.ts`);
  - the page group: the first part of the address, such as `players`, never an id;
  - the device class: phone, tablet or desktop, from the window width.

  Nothing identifies the member, their account or what they opened. Moving between pages inside the app is not a new load, so INP keeps counting for the page the app was opened on.
- **What is stored** (`web_vitals_daily`): a count per UTC day, measure, bucket, page group and device class, kept 35 days (migration `0054_web_vitals`, Row Level Security on, closed to Supabase's Data API).
- **Who may send:** the endpoint counts a beacon only for a signed-in member, from this site, well formed and at most 1 KB, and at most 120 a minute per server instance. Anything else is dropped without an error. A forged beacon can only add to counts. It cannot read anything or write anywhere else.
- **Where to read it:** Admin → System Health. For each measure it shows the value 75% of loads stayed within, and the good, needs-work and poor shares. Those three use Google's thresholds, which are bucket bounds, so the shares are exact. It also breaks the figures down by device class and by page group.
- **Cost.** One write per page load, which is not database egress, and no new service. The panel's read is one grouped query of a few hundred rows at most. The browser code is the reporter and Next.js's bundled web-vitals; its size is in `docs/PERFORMANCE.md`.
- **Off switch:** `UNIIVERSE_FIELD_METRICS=off` stops both the measuring and the storing.

## How an alert reaches the owner

A scheduled Data jobs run (hourly; GitHub delivers about 4 a day) starts the tick, then reads `/api/health`. It fails, naming the problem in the run's log, when:
- the app or its database does not answer, or the answer cannot be read;
- `failingJobs` is not empty (a job that failed three times in a row);
- the account sync has not succeeded for 12 hours;
- yesterday's database egress, as counted by the app, was over the daily budget (120 MB unless `EGRESS_DAILY_BUDGET_MB` says otherwise). The log names the five largest query shapes. A deployment that does not have the check yet is a warning, not a failure.

A failed scheduled run is reported by GitHub's usual email. It goes to the account that last changed the workflow's schedule, once that account has GitHub → Settings → Notifications → Actions → "Only notify for failed workflows" turned on (the owner's setting). The check costs no extra Actions minutes: it is part of the same one-minute run, with no new workflow or schedule.

Each failing run sends one email until the problem is fixed, so a fault that lasts a day sends about four.

The Production check and the Database backup report differently: one issue per check (labels `production-check` and `database-backup`, `scripts/report-issue.sh`), opened by the first failing run with what failed and the run's link, commented on by later failing runs, and closed by the next passing run. A new issue notifies the owner as any issue on their repository does; nothing needs tidying after a recovery.

## Still not covered

- **Nothing checks from outside GitHub.** If GitHub Actions is paused (it disables scheduled workflows after 60 days without a commit), the alerts stop too. A free outside uptime monitor on `/api/health` would cover this; the owner creates its account, and no credentials go through the repository.
- **Between scheduled runs,** a fault is noticed only at the next run (hours at worst).
- **Signed-in pages from outside:** the Production check opens the member pages only once a non-admin verification account exists and its sign-in is stored as the repository secrets `UNIIVERSE_VERIFY_USER` and `UNIIVERSE_VERIFY_PASSWORD`. Until then it checks the public pages and the signed-out security only, and says the rest is pending.

Until an outside monitor exists: open Admin → System Health now and then, or run Data jobs `smoke` after anything unusual.

## What `/api/health` returns

- **Fields:** `ok`, `deployment.commit` and `region`, `auth.mode`, `db` (`ok`, `ms`), the current `patch`, when champions and accounts last synced, each job's `status` and `lastSuccessAt`, and `failingJobs`.
- **HTTP status:** `503` when the database does not answer, otherwise `200`.
- **Privacy:** no secrets and no personal data; database errors have connection strings redacted. Anyone can read it, like the sign-in page.
