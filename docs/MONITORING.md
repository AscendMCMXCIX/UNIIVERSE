# Monitoring and alerts

What tells the owner that UNIIVERSE is unwell, what does not yet, and how to close the gaps for free. Nothing here costs money on the current free plans.

**Status (4 Nov 2026):** no paid monitoring and no third-party monitor are set up. The signals below come from GitHub, Vercel, Supabase and the app itself. Scheduled Data jobs runs fail when production is unwell (audit decision 10) or when a day's database egress goes over its budget. The **Production check** checks the live site in a browser after each production deployment and every day, and the **Database backup** watches its own size; both report through one GitHub issue each, opened while failing and closed on recovery.

## What is watched today

| Signal | Where | Who hears about it |
|---|---|---|
| The app or its database is down | `GET /api/health`: `503` with `db.ok: false` when the database does not answer. Scheduled Data jobs runs read it and fail | GitHub's failed-workflow email (below) |
| A scheduled Data jobs run cannot reach the app | `.github/workflows/data-jobs.yml`, hourly (GitHub delivers about 4 a day). The run fails when the tick endpoint answers with an error | GitHub emails the account that last changed the workflow's schedule, if that account has Actions notifications turned on |
| A data job fails, or is killed before it finishes (Riot sync, champion sync, audits) | `/api/health` → `failingJobs`: a job whose last run failed or never finished, from the first such run until a run succeeds (also while it is being run again). A run still "running" after 15 minutes counts as killed; the next run or the daily `integrity` job records it as a failed run. Admin → System Health once it happened three times in a row. Scheduled Data jobs runs fail while it is listed | GitHub's failed-workflow email (below) |
| Linked accounts stop syncing | `/api/health` → `data.accounts`, when a linked account was last read from Riot in full (from the accounts themselves: the `account-sync` job records a success when it had nothing to do, no key, or every account failed). Scheduled runs fail when it is older than 12 hours (repository variable `SYNC_STALE_HOURS`) | GitHub's failed-workflow email (below) |
| Riot rejects the API key (a development key expired, a key revoked), or refuses one request the account sync needs (one API, or a routing host that does not serve it) | `/api/health` → `riot.credential` is `rejected` and `failingJobs` lists `riot-key`, from Riot's 401/403 until Riot accepts a request under the key again; a failure with no answer (a 5xx, a rate limit, a network error) does not clear it. The account sync alone would not show it: every linked account then waits, backing off for up to about five hours, and its runs find nothing due and succeed. Admin → Data & Integrations names the key in use and what to do. A scheduled Data jobs run that finds it listed first asks again, once (`riot-check`, which records the answer). While a refusal is recorded, `riot-check` asks platform status and then each request an account sync makes, on the host the sync uses, for one linked account per server in use (up to four servers; a match's details only when that account has a Ranked Solo/Duo game). It starts no request more than 30 s after it began and a request already sent ends within 7 s, so it answers inside the run's 45 s wait for it; a check that runs out of time records nothing and answers `unavailable`, so the refusal stands. It answers `accepted` only when Riot accepts them all, as after a short Riot-side 401/403 incident: the run then drops `riot-key` with a warning and does not fail on it. Otherwise (a request still refused, which `riot-check` and Admin name by API and host; unavailable, out of time included; an unreadable answer or none) it fails and names the re-check's result | GitHub's failed-workflow email (below) |
| Some linked accounts cannot be synced | The `account-sync` run is *degraded* whenever an account it tried could not be synced. Its error counts them (it never names an account; "none of the N" when every one failed, which is how a rejected key or a Riot outage looks); Admin → Data & Integrations repeats it as a warning, and each player's Riot Accounts tab says why | Only someone who looks |
| The five-minute rank schedule goes silent (its calls refused after a `CRON_SECRET` change, pg_cron stopped, the job removed by hand, a restore into a new project) | `/api/health` → `failingJobs` lists `rank-schedule` while the schedule is installed (the `rank-schedule` job's last success is later than `rank-schedule-off`'s) and neither it nor `rank-watch` has succeeded for 20 minutes. A refused call records nothing in the app, so this silence is the only sign. Data jobs `rank-schedule-status` then says why (calls by HTTP status, whether Vault matches the server's secret); after a `CRON_SECRET` change, run Data jobs `rank-schedule` again | GitHub's failed-workflow email (below) |
| The rank watch reads no account in a run (a Riot outage, timeouts, the network) | The `rank-watch` run is *degraded* and says how many accounts it tried, counts only; Admin → Data & Integrations repeats it as a warning. It is not listed in `failingJobs`, so a Riot outage does not fail the scheduled run | Only someone who looks |
| A pull request breaks something | CI on every ready pull request (`ci.yml`) | The pull request shows the failure |
| A production deployment fails | Vercel | Vercel can email about failed deployments (Account Settings → Notifications)* |
| The database nears a free-plan limit | Supabase usage | Supabase sends usage emails about the free plan's limits* |
| Accounts, sessions and migrations look wrong | Data jobs `auth-audit` (manual) | Only when run; the run's output names the problem |
| Pages are slow on the server | Data jobs `perf-probe` (manual); `slowest` lists the five slowest steps | Only when run |
| Pages are slow in members' browsers (field data) | Each signed-in page load reports its LCP, CLS, INP, FCP and TTFB, and two parts of TTFB (REDIRECT, a same-origin redirect before the page, sent only when there was one; SERVER, the request's own time), as counts (`/api/vitals`, table `web_vitals_daily`, below) | Admin → System Health, "Page speed in members' browsers"; the `perf-probe` summary's `fieldVitals` (each page group's loads and 75th-percentile LCP, INP and CLS over 28 days, counts only), so a probe run in the Production check shows them without signing in; no alert |
| A deployment breaks the live site: the wrong commit answering, an error on a page, a member page reachable signed out or with a forged session (the shared pages, and a real member's profile, champions and matches, the pages of the #170 fix), a missing security header, sideways scrolling or a serious axe violation at 1440, 768 or 390 px, or a Riot rule for a Personal key broken (Riot API data on the public pages, Riot's required notice missing, `/riot.txt` not served) | **Production check** (`.github/workflows/production-check.yml`, `scripts/live-check.mjs`): after each successful production deployment (Vercel's deployment status) and daily at 05:37 UTC. The member pages are checked once the `UNIIVERSE_VERIFY_USER` / `UNIIVERSE_VERIFY_PASSWORD` secrets exist; until then they are pending | An issue labelled `production-check` (one at a time; the next passing run closes it), with what failed and the run's link; screenshots in the run's artifact |
| Backups stop passing, or near their size limit | In the private repository `AscendMCMXCIX/uniiverse-backups` (since 6 Nov 2026): **Database backup** (weekly), a failed run or an encrypted copy over 80% of `MAX_MB`; **Backup age** (daily), no backup passed for 8 days | An issue labelled `database-backup` in the private repository, and GitHub's failed-workflow email |
| The database nears its plan | Daily Production check: `db-usage`'s size, in decimal megabytes, against `DB_PLAN_MB` (default 500, the free plan's 0.5 GB read the safer way). It grows by about 2 MB a day | An issue labelled `database-size` from 80%, opened once and saying what to do (an engineering session reads `db-usage` and proposes what to reduce; deleting stored data or a larger plan is the owner's decision); comments on it and the `production-check` issue from 95%; it closes itself under 80% |
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
- `failingJobs` is not empty: a job whose last run failed or was killed before it finished, until a run succeeds, or `riot-key` while Riot refuses a request under the configured key, unless Riot accepts the key and the account sync's requests when the run asks again (one `riot-check` call: then a warning, not a failure), or `rank-schedule` while the installed five-minute rank schedule has been silent for 20 minutes;
- the account sync has not succeeded for 12 hours;
- yesterday's database egress, as counted by the app, was over the daily budget (120 MB unless `EGRESS_DAILY_BUDGET_MB` says otherwise). The log names the five largest query shapes. A deployment that does not have the check yet is a warning, not a failure.

A failed scheduled run is reported by GitHub's usual email. It goes to the account that last changed the workflow's schedule, once that account has GitHub → Settings → Notifications → Actions → "Only notify for failed workflows" turned on (the owner's setting). The check costs no extra Actions minutes: it is part of the same one-minute run, with no new workflow or schedule.

Each failing run sends one email until the problem is fixed, so a fault that lasts a day sends about four.

The Production check and the Database backup (in the private backup repository) report the same way: one issue per check (labels `production-check` and `database-backup`, `scripts/report-issue.sh`), opened by the first failing run with what failed and the run's link, commented on by later failing runs, and closed by the next passing run. A new issue notifies the owner as any issue on their repository does; nothing needs tidying after a recovery.

## Still not covered

- **Nothing checks from outside GitHub.** If GitHub Actions is paused (it disables scheduled workflows after 60 days without a commit), the alerts stop too. A free outside uptime monitor on `/api/health` would cover this; the owner creates its account, and no credentials go through the repository.
- **Between scheduled runs,** a fault is noticed only at the next run (hours at worst).
- **Signed-in pages from outside:** the Production check opens the member pages only once a non-admin verification account exists and its sign-in is stored as the repository secrets `UNIIVERSE_VERIFY_USER` and `UNIIVERSE_VERIFY_PASSWORD`. Until then it checks the public pages and the signed-out security only, and says the rest is pending.

Until an outside monitor exists: open Admin → System Health now and then, or run Data jobs `smoke` after anything unusual.

## What `/api/health` returns

- **Fields:** `ok`, `deployment.commit` and `region`, `auth.mode`, `db` (`ok`, `ms`), the current `patch`, when champions and accounts last synced, each job's `status` and `lastSuccessAt`, `failingJobs` (failing jobs by key, plus `riot-key` and `rank-schedule` as above), and `riot.credential`: the state of the configured Riot key as the jobs last recorded it (`accepted`, `rejected`, `unavailable`, `unknown` or `not-configured`), the word only, never the key or its fingerprint.
- **HTTP status:** `503` when the database does not answer, otherwise `200`.
- **Privacy:** no secrets and no personal data; database errors have connection strings redacted. Anyone can read it, like the sign-in page.
