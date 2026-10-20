# Monitoring and alerts

What tells the owner that UNIIVERSE is unwell, what does not yet, and how to close the gaps for free. Nothing here costs money on the current free plans.

**Status (20 Oct 2026):** no paid monitoring and no third-party monitor are set up. The signals below come from GitHub, Vercel, Supabase and the app itself. Scheduled Data jobs runs fail when production is unwell (audit decision 10) or when a day's database egress goes over its budget.

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
| Pages are slow | Data jobs `perf-probe` (manual); `slowest` lists the five slowest steps | Only when run |
| Database egress goes over budget (Supabase Free includes 5 GB a month) | The app counts the bytes every query brings back (`server/db/egress.ts`, table `db_egress_daily`). Scheduled Data jobs runs call the `egress` job, which fails when yesterday (UTC) went over 120 MB (`EGRESS_DAILY_BUDGET_MB`) | GitHub's failed-workflow email (below); `db-usage` and `perf-probe` show where the bytes went |

\* Their usual behaviour, not checked in this project's Vercel or Supabase settings.

After every production deploy that changes the app, `CLAUDE.md` §5 asks for one manual Data jobs run (`smoke perf-probe`, plus `auth-audit` after a migration). That is a human check, not an alert.

## How an alert reaches the owner

A scheduled Data jobs run (hourly; GitHub delivers about 4 a day) starts the tick, then reads `/api/health`. It fails, naming the problem in the run's log, when:
- the app or its database does not answer, or the answer cannot be read;
- `failingJobs` is not empty (a job that failed three times in a row);
- the account sync has not succeeded for 12 hours;
- yesterday's database egress, as counted by the app, was over the daily budget (120 MB unless `EGRESS_DAILY_BUDGET_MB` says otherwise). The log names the five largest query shapes. A deployment that does not have the check yet is a warning, not a failure.

A failed scheduled run is reported by GitHub's usual email. It goes to the account that last changed the workflow's schedule, once that account has GitHub → Settings → Notifications → Actions → "Only notify for failed workflows" turned on (the owner's setting). The check costs no extra Actions minutes: it is part of the same one-minute run, with no new workflow or schedule.

Each failing run sends one email until the problem is fixed, so a fault that lasts a day sends about four.

## Still not covered

- **Nothing checks from outside GitHub.** If GitHub Actions is paused (it disables scheduled workflows after 60 days without a commit), the alerts stop too. A free outside uptime monitor on `/api/health` would cover this; the owner creates its account, and no credentials go through the repository.
- **Between scheduled runs,** a fault is noticed only at the next run (hours at worst).

Until an outside monitor exists: open Admin → System Health now and then, or run Data jobs `smoke` after anything unusual.

## What `/api/health` returns

- **Fields:** `ok`, `deployment.commit` and `region`, `auth.mode`, `db` (`ok`, `ms`), the current `patch`, when champions and accounts last synced, each job's `status` and `lastSuccessAt`, and `failingJobs`.
- **HTTP status:** `503` when the database does not answer, otherwise `200`.
- **Privacy:** no secrets and no personal data; database errors have connection strings redacted. Anyone can read it, like the sign-in page.
