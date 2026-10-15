# GitHub Actions usage

The repository is private, so Actions minutes come out of the account's 2,000 free minutes a month. GitHub bills every job separately and rounds each job up to a whole minute. CI and the data-jobs schedule share the budget.

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

No check was removed: typecheck, lint, unit tests, database tests on PostgreSQL, production build and browser tests on three viewports all still run on every PR and every push to `main`.

**`data-jobs.yml`**
- A manual run accepts several jobs, space-separated (`perf-probe engine-probe`). They run one after another, and the run fails if any job fails.
- Job names are validated.
- The timeout is 3 minutes for scheduled runs (they only start the tick) and 20 minutes for manual runs.
- The hourly schedule is unchanged. GitHub delivers it 4–6 times a day, about 5 minutes a day.

**`smoke.yml` / `probe.yml`:** 5- and 10-minute timeouts.

## Expected cost per event

Billed minutes, based on the run measured above.

| Event | Before | After |
|---|---|---|
| Commit pushed to a PR branch | ~44 (push + pull_request runs) | ~17 |
| Push to `main` | ~22 | ~17 |
| Push to a branch without a PR | ~22 | 0 |
| Documentation-only change | ~22–44 | 0 |
| Commit failing typecheck, lint or unit tests | ~22 | ~2 |
| Three data jobs checked by hand | 3+ | 1+ |

## Working within the budget (people and coding agents)

- **Work on a branch and open a PR.** Avoid pushing straight to `main`: each push to `main` is a full CI run plus a production deploy.
- **Validate before pushing.** Run the checks locally first (`pnpm typecheck`, `pnpm lint`, `pnpm vitest run`, `pnpm build && pnpm test:e2e`), then push a finished, validated piece of work. Don't push after every commit.
- **Only the latest push is checked.** Pushing several commits at once runs CI once; a push that supersedes a running check cancels it.
- **After a deploy,** one `Production smoke` run plus one `Data jobs` run with all the needed jobs is enough.
- **Re-running a job** costs as much as the first run. Do it only when the failure was clearly not caused by the code.
