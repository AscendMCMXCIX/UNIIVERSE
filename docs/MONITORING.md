# Monitoring and alerts

What tells the owner that UNIIVERSE is unwell, what does not yet, and how to close the gaps for free. Nothing here costs money on the current free plans.

**Status (19 Oct 2026):** no paid monitoring and no third-party monitor are set up. The signals below come from GitHub, Vercel, Supabase and the app itself.

## What is watched today

| Signal | Where | Who hears about it |
|---|---|---|
| The app or its database is down | `GET /api/health`: `503` with `db.ok: false` when the database does not answer | Nobody automatically, unless a scheduled Data jobs run fails (next row) |
| A scheduled Data jobs run cannot reach the app | `.github/workflows/data-jobs.yml`, hourly (GitHub delivers about 4 a day). The run fails when the tick endpoint answers with an error | GitHub emails the account that last changed the workflow's schedule, if that account has Actions notifications turned on |
| A data job fails (Riot sync, champion sync, audits) | `/api/health` → `failingJobs`; Admin → System Health | Only someone who looks. Scheduled runs only *start* the tick (`?background=1`), so a failing job does not fail the run |
| A pull request breaks something | CI on every ready pull request (`ci.yml`) | The pull request shows the failure |
| A production deployment fails | Vercel | Vercel can email about failed deployments (Account Settings → Notifications)* |
| The database nears a free-plan limit | Supabase usage | Supabase sends usage emails about the free plan's limits* |
| Accounts, sessions and migrations look wrong | Data jobs `auth-audit` (manual) | Only when run; the run's output names the problem |
| Pages are slow | Data jobs `perf-probe` (manual); `slowest` lists the five slowest steps | Only when run |

\* Their usual behaviour, not checked in this project's Vercel or Supabase settings.

After every production deploy that changes the app, `CLAUDE.md` §5 asks for one manual Data jobs run (`smoke perf-probe`, plus `auth-audit` after a migration). That is a human check, not an alert.

## Gaps

1. **A failing data job raises no alert.** The Riot account sync could fail for days, for example after the development API key expires, and only Admin → System Health would show it.
2. **Downtime is noticed only hourly at best**, and only by the account that last edited the workflow.
3. **Nothing checks from outside GitHub.** If GitHub Actions is paused (it disables scheduled workflows after 60 days without a commit), the only automatic signal stops too.

## Proposal (free; needs the owner's approval)

These change how Actions behave or add an outside service, so they wait for a decision (audit decision list).

1. **Make the scheduled run fail when a job is failing.** After starting the tick, the scheduled step also reads `/api/health` and exits with an error when `failingJobs` is not empty or `ok` is false. It costs no extra Actions minutes (the same one-minute run) and reuses GitHub's failure emails. It is a change to the existing workflow, not a new workflow or schedule.
2. **One free outside uptime monitor**, for example a free tier that checks `/api/health` every few minutes and emails on a non-200 answer. The owner creates the account (no credentials go through the repository), and it reads only `/api/health`, which holds no secrets or personal data.
3. **Turn on GitHub Actions notifications** for the owner's account (GitHub → Settings → Notifications → Actions → "Only notify for failed workflows"), so point 1 reaches someone.

Until then: open Admin → System Health once a week, or run Data jobs `smoke` after anything unusual.

## What `/api/health` returns

- **Fields:** `ok`, `deployment.commit` and `region`, `auth.mode`, `db` (`ok`, `ms`), the current `patch`, when champions and accounts last synced, each job's `status` and `lastSuccessAt`, and `failingJobs`.
- **HTTP status:** `503` when the database does not answer, otherwise `200`.
- **Privacy:** no secrets and no personal data; database errors have connection strings redacted. Anyone can read it, like the sign-in page.
