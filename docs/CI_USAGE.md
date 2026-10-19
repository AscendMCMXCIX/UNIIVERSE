# GitHub Actions usage

The repository is private, so Actions minutes come out of the 3,000 minutes a month included in the owner's GitHub Pro plan (2,000 on GitHub Free, before the upgrade). GitHub bills every job separately and rounds each job up to a whole minute. CI and the data-jobs schedule share the budget.

## What used the minutes (audit of 13–15 Oct 2026)

All 350 workflow runs since 1 Oct were read from the Actions API. Before 13 Oct, usage was a handful of scheduled data-jobs runs a day (about 5 minutes).

| Day | CI runs | Manual data-jobs / smoke runs | Reported usage |
|---|---|---|---|
| 13 Oct | 41 (all pushes to `main`) | 52 + 6 | 363 min |
| 14 Oct | 67 (65 pushes to `main`) | 57 + 11 | 913 min |
| 15 Oct | 27 (21 push, 6 pull_request) | 8 + 5 | 477 min |

**Causes**
1. **Many pushes from automated development sessions.** All runs were started by the same account: a coding agent working in the repository. It committed and pushed after every small step, straight to `main` on 13–14 Oct. That gave 106 full CI runs in two days.
   - 16 of them were cancelled by a newer push, but they had already used minutes.
   - Several were documentation-only commits.
2. **Every commit on a PR branch ran CI twice.**
   - CI ran on `push` to every branch **and** on `pull_request`.
   - The two runs used different concurrency groups (`refs/heads/<branch>` and `refs/pull/<n>/merge`), so neither cancelled the other.
   - On 15 Oct this was the case for all 6 PR commits. Before a PR existed, each branch push also ran CI.
3. **Work was duplicated inside each run.** Measured on run 38730441571, 22 billed minutes:

   | Job | Billed | Main steps |
   |---|---|---|
   | Typecheck, lint, test, build | 7 min | `pnpm test` 4 min 48 s, build 46 s |
   | Database tests on PostgreSQL 16 | 3 min | |
   | Responsive smoke tests (Playwright) | 12 min | build 50 s, browser tests 9 min 27 s |

   - `pnpm test` ran the whole database suite on PGlite, and the PostgreSQL job then ran the same suite again.
   - The production build ran twice, once in two different jobs.
4. **No fail-fast.** The three jobs ran in parallel, so a commit that failed lint still paid for the full browser suite (11 failed runs on 14 Oct).
5. **No timeouts.** A hung job could have run for GitHub's default limit of 6 hours (360 minutes).
6. **One manual data-jobs run per job.** Repeated `workflow_dispatch` runs (up to 11 in 13 minutes) each billed at least one minute.

## What changed

**`ci.yml`**
- **Triggers:**
  - pull requests;
  - pushes to `main`;
  - manual runs (Actions → CI → Run workflow, on any branch).
  - Pushes to other branches without a PR no longer start CI.
- **Skipped changes:**
  - documentation (`docs/**`, `**/*.md`, `.env.example`);
  - the production-only workflows (`data-jobs.yml`, `probe.yml`, `smoke.yml`).
- **Concurrency:** grouped per PR (or per branch for `main`), so a newer push cancels the run it supersedes.
- **Job order:** the database and browser jobs wait for typecheck, lint and unit tests, so a broken commit stops after about two minutes.
- **Database suite:** runs once, on PostgreSQL 16, the production engine.
  - The unit job runs `vitest run src`.
  - The PGlite engine is still exercised end to end by the browser tests, and `pnpm test` still runs the database suite on PGlite locally.
- **Production build:** runs once, in the browser-test job, which serves it to the tests.
- **Playwright cache:** the Chromium download is cached per Playwright version. System libraries are still installed every run because they can't be cached.
- **Timeouts:** 10 minutes for unit, 10 for database, 25 for browser.
- **Draft pull requests** are not checked. Marking one "Ready for review" runs CI.
- **Merged pull requests reuse their result.** Each passing database or browser job uploads a tiny marker artifact named after the source tree it tested (`ci-passed-<tree>-db`, `-e2e`, kept 5 days). The push to `main` after a merge looks both markers up for its own tree and skips the suites when they exist.
  - This applies only when the PR was up to date with `main`, so the merged tree is exactly the tested one.
  - If `main` moved in between, or the lookup fails for any reason, the full CI runs.

No check was removed: typecheck, lint, unit tests, database tests on PostgreSQL, production build and browser tests on three viewports all still run on every PR and every push to `main`.

**`data-jobs.yml`**
- A manual run accepts several jobs, space-separated (`perf-probe auth-audit`). They run one after another, and the run fails if any job fails.
- Job names are validated.
- The timeout is 3 minutes for scheduled runs (they only start the tick) and 20 minutes for manual runs.
- The hourly schedule is unchanged. GitHub delivers it 4–6 times a day, about 5 minutes a day (audit below).
- `smoke` is accepted as a job name (the same public requests as `smoke.yml`, sent without the secret), so a post-deploy check is one run: `job: "smoke perf-probe"`.

**`smoke.yml` / `probe.yml`:** 5- and 10-minute timeouts.

## Expected cost per event

Billed minutes, measured on PRs #6 and #7 and on `main` after merging them (unit job about 2, database about 3, browser about 10–11).

| Event | Before PR #7 | Now |
|---|---|---|
| Push to a branch without a PR, or to a draft PR | ~22 | 0 |
| Documentation-only change | ~22–44 | 0 |
| Commit pushed to a ready PR | ~44 (push + pull_request runs) | ~16 |
| Merging an up-to-date PR (push to `main`) | ~22 | ~1 |
| Merging a PR when `main` moved meanwhile | ~22 | ~16 |
| Commit failing typecheck, lint or unit tests | ~22 | ~2 |
| Post-deploy check (smoke + probes) | 2–4 runs | 1 run, ~1 |
| Hourly data-jobs schedule | ~5 a day | ~5 a day |

A feature PR that is validated locally, pushed once or twice after it is marked ready, and merged while up to date costs about 17–33 minutes. That is roughly 85–165 such PRs a month within 3,000 minutes, after about 130–150 for the schedule. The optimisations above stay: they keep a month's work well inside the allowance and leave room for the unexpected.

## Data-jobs schedule audit (16 Oct 2026)

The workflow comment used to say the hourly schedule costs about 720 minutes a month. That is the ceiling if every hourly run were delivered. The Actions API shows what it really costs:

- **Delivered runs, 1–15 Oct:** 64 scheduled runs, 2–6 a day, about 4.3 a day on average (62 succeeded; the 2 failures were on 15 Oct, when the minutes ran out).
- **Cost:** each run only starts the tick (`?background=1`) and bills 1 minute, so about 130 minutes a month, 4% of the 3,000 included in GitHub Pro.
- **Duplicate work:** none found.
  - Every tick, whatever starts it, renews the shared tick lease, so a visit within 30 minutes of a scheduled tick does not start another.
  - The scheduler only runs jobs that are due (ranked-ingest every 10 minutes, account-sync 15, aggregate 30, ranked-discover and version-check 60, integrity and pro-sync daily), so a tick that finds nothing due does almost no work.
- **What depends on it:**
  - When nobody visits the site, the scheduled ticks are the only regular refresh. Vercel's Hobby cron runs once a day (04:00 UTC).
  - Without the schedule, match ingestion, account sync (and with it the rank snapshots) and aggregation could go up to a day without running on a quiet day.

**Decision: no change.** A reduction would save at most about 130 minutes a month and would leave quiet days with one refresh. If minutes get tight, the first lever is CI on PRs (about 16 minutes per ready-PR run), not this schedule. `DATA_JOBS_ENABLED=false` still pauses it.

## Protecting `main`

On GitHub Free, branch protection rules and rulesets are not available for **private** repositories. The owner now has GitHub Pro, which does allow them, but none is configured: checked on 15 Oct 2026, the API reports `main` as not protected. Turning protection on is a settings change for the owner (see point 3 below for what to set and the docs-only caveat); until then `main` cannot require pull requests or passing checks on the server.

The same rules are applied without cost:
1. **Pushing to `main` is blocked locally.**
   - `.githooks/pre-push` refuses any push to `main`.
   - It is turned on by `pnpm install` (the `prepare` script) and, in Claude Code sessions, by the SessionStart hook in `.claude/settings.json`.
   - Merging a PR on GitHub is not affected.
   - A deliberate exception: `ALLOW_MAIN_PUSH=1 git push …`.
2. **PRs are merged only when CI is green.** This is a documented rule for people and coding agents (`CLAUDE.md`), because GitHub cannot enforce it here.
   - **Docs-only PRs:** CI doesn't run, so there is nothing to wait for and they can be merged directly.
3. **If branch protection is turned on (possible now with GitHub Pro):**
   - Add a ruleset on `main` requiring a pull request and the checks "Typecheck, lint, unit tests", "Database tests on PostgreSQL 16" and "Build and browser tests (Playwright)".
   - Docs-only PRs would then wait for checks that never start. Before requiring checks, replace the workflow-level `paths-ignore` with a job-level skip, because skipped jobs count as passing.

## Vercel deployments

- Vercel deploys every push to `main` to production and every pushed branch to a preview, through its Git integration. This is unchanged and uses no Actions minutes.
- `vercel.json` sets an Ignored Build Step, `scripts/vercel-ignore-build.sh`. It skips a deployment only when every file changed since that branch's last successful deployment (`VERCEL_GIT_PREVIOUS_SHA`) is documentation or tooling the app never reads:
  - `docs/`, `*.md`, `.env.example`;
  - `.github/`, `.githooks/`, `.claude/`.
- Anything else builds. A missing previous deployment or any git error also builds.
- To force a deployment, use Redeploy in the Vercel dashboard.

## Working within the budget (people and coding agents)

The day-to-day rules are in `CLAUDE.md`. In short:
- Work on a feature branch, validate locally (`pnpm verify`, then the database and browser suites as needed) and push finished work.
- Open the PR when the work is complete, or as a draft and mark it ready when done.
- Merge with the "Create a merge commit" method once CI is green and the PR is up to date with `main`, so the push to `main` reuses the result.
- After a deploy that changes app behaviour, run one `Data jobs` run (`smoke perf-probe`).
- **Re-running a job** costs as much as the first run. Do it only when the failure was clearly not caused by the code.
