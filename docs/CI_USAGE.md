# GitHub Actions usage

**Since 6 Nov 2026 the repository is public**, so GitHub does not bill the minutes its standard (GitHub-hosted) runners spend on it; the measurements and rules below were made while it was private, when Actions minutes came out of the 3,000 minutes a month included in the owner's GitHub Pro plan (2,000 on GitHub Free, before the upgrade), GitHub billed every job separately and rounded each job up to a whole minute, and CI and the data-jobs schedule shared the budget. They are kept as the record of what each run costs in time and as the hygiene that keeps runs few and meaningful (CLAUDE.md §3 and §6).

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
- **Timeouts:** 10 minutes for unit, 10 for database, 60 for browser (25 at first; 30 and then 40 on 21 Oct as the suite grew; 60 on 23 Oct, below). A job killed by its timeout bills everything it used.
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
- `smoke` is accepted as a job name (the same public requests as `smoke.yml`, sent without the secret): a quick check by hand. It fails the run when health is not ok or a page errors. After a deploy, the Production check runs by itself instead (CLAUDE.md §5).

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

## 21 Oct 2026: a full run now costs about 34 minutes

The browser suite has grown: 720 tests (240 on each of the three viewports, one worker) take about 25 minutes, against 9–10 when the table above was measured. Run 39561556212 (#111), billed per job, rounded up:

| Job | Took | Billed |
|---|---|---|
| Typecheck, lint, unit tests | 2 min 2 s | 3 min |
| Database tests on PostgreSQL 16 | 3 min 3 s | 4 min |
| Build and browser tests | 26 min 49 s | 27 min |

- **A commit pushed to a ready PR costs about 34 minutes**, twice the ~16 above. A PR merged while up to date still costs about 1 more on `main`.
- **The browser job was close to its limit:** 27 of its 30 minutes, then 27 min 40 s on #112's run (39586959165). The limit is now 40 minutes: a run that reaches it fails and costs a whole re-run (34 minutes), while the limit itself costs nothing unless a run hangs.
- **This month so far is close to the allowance.** The Actions API lists 422 CI runs from 1 to 21 Oct. Over 400 of them, the runs' own durations add up to about 2,400 minutes. The billed total is higher, because each job is rounded up and the database job runs beside the browser job. The estimate is about 3,000–3,400 minutes for CI alone, before the data-jobs schedule and manual runs.
  - This is an estimate. The API's per-run billing figure reads 0 for this repository, so the real figure is only on GitHub's billing page: Settings → Billing and licensing → Usage.
  - Until it is checked, push to a ready PR only when a batch of work is finished and validated locally (CLAUDE.md §3).

## 23 Oct 2026: the browser job may take 60 minutes

**Why.** Two of the five PR runs on 22 Oct reached the 40-minute limit, or nearly did:
- #128's browser job finished 1 second under it;
- #133's first attempt was cancelled at it after installing the browser's system libraries took 13 min 49 s (the Ubuntu mirror sent 23.8 MB at 28.7 kB/s). Up to then, 377 tests had passed and none had failed. One re-run passed.

The limit is now 60 minutes for the browser job only (unit and database stay at 10). It costs nothing unless a run hangs.

**Measured** (the browser job's steps; billed is the whole run, each job rounded up):

| Run | PR | Install | Build | Browser tests | Browser job | Billed |
|---|---|---|---|---|---|---|
| 39746390248 | #128 | 1 min 52 s | 1 min 8 s | 36 min 26 s | 39 min 59 s | 48 |
| 39778569173 | #130 | 1 min 35 s | 39 s | 22 min 48 s | 25 min 33 s | 34 |
| 39784634349 | #131 | 1 min 31 s | 49 s | 29 min 54 s | 32 min 44 s | 40 |
| 39815223669 | #132 | 21 s | 53 s | 31 min 33 s | 33 min 16 s | 42 |
| 39823366492 | #133 | 14 min 13 s | 1 min | cancelled at 40 min | 40 min 17 s | 48 |
| 39823366492, re-run | #133 | 26 s | 58 s | 33 min 41 s | 35 min 34 s | 36 more |
| 39880698722 | #134 | 25 s | 51 s | 31 min 17 s | 33 min 6 s | 42 |
| 39886898466 | #135 | 37 s | 42 s | 27 min 4 s | 28 min 47 s | 36 |

- **A ready-PR run bills 34–48 minutes**, about 40 on average. The same suite took 22.8 to 36.4 minutes on different runners.
- **After the 60-minute limit (23 Oct):** #134 and #135 passed on their first attempt, with no test retried. Their installs took 25 and 37 s, and their browser jobs 33 and 29 minutes. Each push to `main` after the merge reused the PR's result: 10 s, one billed minute. The smoke run after each deploy took 5 s, also one billed minute.
- **Usage this month is probably past the allowance.** The 21 Oct estimate was 3,000–3,400 minutes for CI from 1 to 21 Oct. About 20 PR runs (some 900 minutes) followed by the end of 22 Oct, and #134 and #135 about 80 more on 23 Oct. The API still reports 0 billed minutes for this repository, so only the billing page (Settings → Billing and licensing → Usage) has the real figure. If the plan allows overage, minutes past 3,000 are charged; if not, Actions stop until the next cycle.

**Installing the browser (no change).**
- The step downloads Chromium (about 150 MB, 5–10 s) and installs its system libraries with apt: 9 fonts (Japanese, Chinese, Thai, Unifont and others) and 8 upgraded libraries, 23.8 MB. Normally 21 s to 1 min 52 s in all.
- The Chromium cache never helps a PR's first run. A PR's cache belongs to that PR, and `main` never saves one, because the push after a merge reuses the PR's result instead of running the browser job. Saving one on `main` would cost a step on every merge to save 5–10 s per PR: not worth it.
- The apt part runs on every run, cached or not. Skipping it would change the fonts the tests render names in (several tests use names in other scripts), and a Playwright container image would replace the job's whole environment with a 1–2 GB download. Neither is worth it for a stall seen once; the 60-minute limit absorbs one.

**Browser-test time: where it goes** (#133's green run: 460 tests, 353 more skipped by design, one worker).
- The desktop project takes 21 of the 33 minutes; phone 6.6 and tablet 5.2.
- Slowest files: `quality.spec.ts` 4.7 min, `responsive.spec.ts` 1.9, `clash-scout.spec.ts` 1.7, `studio-touch.spec.ts` 1.7, `team-flip.spec.ts` 1.6.
- Slowest tests: `quality.spec.ts` "player pages fit every width" 2.6 min (10 pages at 15 sizes, 150 page loads, each waiting for the network to go quiet, link prefetches included), its admin version 49 s, `studio-touch.spec.ts` 78 s, `card-layout.spec.ts` 57 s.

**Ways to shorten it, not applied** (each changes what or how the suite tests, so the owner decides):
1. Measure `quality.spec.ts`'s widths by resizing a loaded page, or wait for the page's own ready signal instead of a quiet network: about 2–3 minutes a run. A resized page and a page loaded at that size are not quite the same test.
2. Run tests that do not depend on the screen size (permissions, text, saved data) on one project instead of three: several minutes, after a review of each spec.
3. More than one worker: the tests share one in-memory database, so they would need isolating first, and the runner has 2 cores.
4. Sharding over several jobs shortens the wait but bills more minutes in all (each shard installs and builds): no.

**Flaky tests fixed.** The green re-run of #133 passed only after retrying two Leaderboards tests:
- **The status ⓘ's times broke hydration** (React error #418). They were inside an element that allows the server's and the browser's words to differ, but React allows that only for an element's own text, and the times were one level down. A minute boundary between the server's render and the browser's, or a device clock that is off, made every page with the ⓘ (a profile's Overview, All Champions, Match History, Encounters, and Leaderboards) re-render in the browser, losing a click made meanwhile. Each line of times now allows the difference itself. A test in `cross-device.spec.ts` sets the browser's clock three days ahead and visits those pages; it failed on all five before the fix, and found one more such time: each game's "3h ago" in Match History's narrow layout (since 16 Oct), now fixed the same way.
- **Leaderboards now says when it is interactive** (`data-ready`, like Match History, Team and Clash Scout), and its tests wait for it before choosing a statistic or a tile.

## The WebKit workflow (21 Oct 2026)

`.github/workflows/webkit.yml` runs `e2e/webkit.spec.ts` in Safari's engine, then
`scripts/webkit26-check.mjs` in Safari 26's (WebKit 26.0, since 10 Nov 2026; docs/RESPONSIVE.md →
Safari and iPhones, Safari 26). It is started by hand only, never by a push or a pull request, so it
costs nothing until someone runs it.
- **One run:** install, the WebKit download (cached after the first run), a build, a few minutes of
  tests, then WebKit 26.0's download (not cached) and its check: about 11 minutes.
- **When to run it:** once before releasing a change that could behave differently in Safari
  (touch, dialogs, forms, the installed app), and after changing the spec.
- Editing the workflow does not start CI (it is in `paths-ignore`).

## Data-jobs schedule audit (16 Oct 2026)

The workflow comment used to say the hourly schedule costs about 720 minutes a month. That is the ceiling if every hourly run were delivered. The Actions API shows what it really costs:

- **Delivered runs, 1–15 Oct:** 64 scheduled runs, 2–6 a day, about 4.3 a day on average (62 succeeded; the 2 failures were on 15 Oct, when the minutes ran out).
- **Cost:** each run only starts the tick (`?background=1`) and bills 1 minute, so about 130 minutes a month, 4% of the 3,000 included in GitHub Pro.
- **Duplicate work:** none found.
  - Every tick, whatever starts it, renews the shared tick lease, so a visit within 30 minutes of a scheduled tick does not start another.
  - The scheduler only runs jobs that are due (account-sync and rank-checks every 15 minutes, version-check, timeline-backfill and figures-backfill 60, integrity daily), so a tick that finds nothing due does almost no work.
- **What depends on it:**
  - When nobody visits the site, the scheduled ticks are the only regular refresh. Vercel's Hobby cron runs once a day (04:00 UTC).
  - Without the schedule, account sync (and with it the rank snapshots) could go up to a day without running on a quiet day.

**Decision: no change.** A reduction would save at most about 130 minutes a month and would leave quiet days with one refresh. If minutes get tight, the first lever is CI on PRs (about 40 minutes per ready-PR run since 22 Oct), not this schedule. `DATA_JOBS_ENABLED=false` still pauses it.

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

- Vercel deploys every push to `main` to production through its Git integration, and a pushed branch to a preview only when asked for (a `preview/...` branch or `[preview]` in the commit message; docs/HOSTING_USAGE.md). This uses no Actions minutes.
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
- After a deploy, read the Production check, which runs by itself (CLAUDE.md §5); add `perf-probe` (Production check → Run workflow → perf) when data loading changed, since each probe reads about 6 MB of the daily egress budget.
- **Re-running a job** costs as much as the first run. Do it only when the failure was clearly not caused by the code.

## 3 Nov 2026: the Production check and the workflow lint

- **Production check** (`production-check.yml`): about 3 billed minutes a run (install with the pnpm and Playwright caches, then the live check at three widths). It runs after each successful production deployment (a docs-only merge is not deployed, so it does not run) and once a day: with about one deployment a day, about 180 minutes a month. Mondays add the perf probe (under a minute). It does not start CI.
- **Workflow lint** (`workflow-lint.yml`): about 15 seconds, only on pull requests that change a workflow. It does not start CI.
- **Database backup:** the size summary and the manifest artifact add a few seconds a week. Since 6 Nov 2026 it runs in the private repository `uniiverse-backups`, where its minutes count against GitHub Pro's private allowance: about 3 a week, plus about 1 a day for its Backup age check.


## 6 Nov 2026: November measured by job

**How.** Every run since 1 Nov (263, from the Actions API), each job's own time rounded up to the minute, as GitHub bills a private repository. All jobs ran on Linux runners. The API's per-run billing figure still reads 0 here, so this is the closest figure short of the billing page.

| Workflow | Billed minutes, 1–6 Nov |
|---|---|
| CI | 2,580 |
| Production check | 75 |
| WebKit | 55 |
| Data jobs | 44 |
| Workflow lint | 18 |
| Dependabot (probably not billed) | 13 |
| Database backup | 8 |
| **All** | **about 2,793** |

**CI's jobs** (green pull-request runs, n = 50 each, medians):

| Job | Median | Total |
|---|---|---|
| Build and browser tests | 39 min | 1,869 |
| Database tests on PostgreSQL 16 | 5 min | 251 |
| Typecheck, lint, unit tests | 3 min | 127 |

- **A full run bills 47 minutes** (median of 58), up from about 40 on 23 Oct. The browser job is 80% of it.
- **The 34 small runs** (the push to `main` reusing the PR's result, or skipped jobs) cost 35 minutes in all, as designed.
- **What the schedule really costs:** Data jobs delivered 3–5 scheduled runs a day at 1 minute each, not 24; the daily Production check bills about 3; the weekly backup about 3.
- **The remainder of November:** about 207 minutes, against about 160–210 for the schedule through 30 Nov. No full CI run fits (STATUS.md, Outstanding 4).
- **For December:** the browser job is the only lever that matters. Its options are listed under "Ways to shorten it, not applied" (23 Oct). Each changes what or how the suite tests, so each needs a local before/after run of the full suite first.

## 6 Nov 2026: the repository is public

**Minutes.** Standard GitHub-hosted runners are free for a public repository, so CI, the Production check, the Data jobs schedule and the backup no longer draw on the 3,000 minutes. The estimates above are kept as history.

**What a public repository changes for the workflows:**
- **Fork pull requests** run `ci.yml` and `workflow-lint.yml`, which use no secrets and read the repository only. No workflow uses `pull_request_target`, and the workflows with secrets (Data jobs, Production check, backup, probe, smoke) start only from a schedule, a deployment or a person with write access.
- **CI's reuse marker:** a push to `main` skips the suites when an artifact `ci-passed-<tree>-db` and `-e2e` exists. A fork's pull request runs its own copy of `ci.yml` and could upload such a name, so the lookup now counts only artifacts from runs of this repository's own branches (`workflow_run.head_repository_id == repository_id`).
- **Logs and artifacts are readable by everyone.** Every job's output must hold counts and anonymous labels only. `auth-audit` printed the owner's username and last sign-in time; it now prints a label and the day. The weekly database backup is an encrypted artifact, downloadable by anyone signed in to GitHub: STATUS.md lists where to keep it as the owner's decision.
