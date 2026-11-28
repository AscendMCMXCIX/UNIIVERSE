# UNIIVERSE: notes for coding agents

These rules apply to every change: features, bug fixes, UI changes and docs. The aim is to keep quality and automatic Vercel deploys while keeping GitHub Actions usage small and meaningful. The repository has been public since 6 Nov 2026, so GitHub does not bill the minutes its standard runners spend on it (while it was private they came out of the 3,000 a month of the owner's GitHub Pro plan, which November nearly used up). A full CI run takes about 20 minutes of wall-clock time since 19 Nov 2026, with the browser suite in four parallel shards and WebKit beside them (one browser job took 34–54 minutes before); the details are in `docs/CI_USAGE.md`. Public also means the repository, its history, its Actions logs and its artifacts can be read by anyone: never commit personal data, and never print a username, Riot ID, PUUID or other personal data in a job's output (counts and anonymous labels only). Branch protection is not configured on `main` (Pro would allow it; turning it on is the owner's decision), so these rules are the protection. Follow them even when nothing stops you.

## 1. Branch

- **Start from the latest `main`:** `git fetch origin main && git switch -c <topic> origin/main`. Use one branch per piece of work, with a descriptive name.
- **Never commit to `main` or push to it.** `.githooks/pre-push` refuses pushes to `main`; the session start hook turns it on. Don't bypass it (`ALLOW_MAIN_PUSH=1`) unless the user explicitly asks.

## 2. Develop and validate locally

Locally, test what the change touches. CI is the full-suite gate (since 28 Nov 2026, at the owner's request): every ready pull request runs every unit, database and browser test, in four shards plus WebKit, in about 20 minutes. So don't repeat the whole browser suite locally. It takes over an hour on a session's machine and duplicates CI.

| Changed | Run |
|---|---|
| Always | `pnpm verify` (typecheck, lint, unit tests, about 1 minute) |
| Database, queries, migrations, server logic | `service postgresql start` if needed, then the `tests/db` files for what changed: `TEST_DATABASE_URL=postgres://uniiverse:uniiverse@127.0.0.1:5432/uniiverse pnpm vitest run tests/db/<files>`. Run the whole `tests/db` folder (a few minutes) when a migration or shared server code changed. |
| UI, pages, client components, styles | `pnpm build`, then the specs that cover what changed: `pnpm exec playwright test e2e/<specs> --trace off`, on the projects (phone, tablet, desktop) the change can affect. Look at the changed pages yourself, as screenshots at the sizes that matter. |
| Migrations | `pnpm db:generate`, then follow docs/UNIIVERSE_TECHNICAL_HANDOVER.md §A3. A new table, view, function or serial column gets the grants block from docs/DATABASE_PERMISSIONS.md in the same migration: RLS on, nothing for Supabase's Data API roles, `SELECT` for the backup role. Never rely on automatic grants. |
| Something that can behave differently in Safari (touch, dialogs, forms, the installed app) | CI runs the WebKit job on every ready pull request (since 19 Nov 2026). For a branch without a pull request, the WebKit workflow by hand (Actions → WebKit; docs/RESPONSIVE.md → Safari and iPhones). |

- **Which specs:**
  - the changed page's own spec;
  - the specs of any shared component you changed (search `e2e/` for its test ids);
  - any spec CI failed on.
- **The whole suite locally** only to reproduce a CI failure the targeted run cannot, or when CI cannot run.
- Fix failures locally. Don't push to "see what CI says": a push to a ready PR should be a batch that passes its targeted checks.
- Commit as often as you like; commits are free.

## 3. Push and open the PR

- **Pushes:**
  - Pushing a branch with no PR, or with a draft PR, runs no CI and costs nothing.
  - Every push to a ready PR runs the full CI (about 20 minutes), and a newer push cancels the running one. So push to a ready PR when a batch of changes passes its targeted checks, not after each small fix.
  - Pushes at the end of a session turn are fine on a branch without a ready PR.
- **Opening the PR:**
  - Open it early: as a draft while the branch takes shape. Mark it "Ready for review" as soon as the first batch passes its targeted local checks, so CI runs the full suite while the work goes on.
  - Don't wait idle on CI. Build the next batch in the meantime (another worktree if it touches the same files), and read CI's result when it arrives.
  - Describe what changed and what was validated locally. List anything found but left for later under "Known, tracked" (§8).
  - Keep unrelated changes out of the PR.
- **Docs-only changes** (`docs/`, `*.md`) still go through a branch and a PR. CI runs no suite for them: its `CI gate` (the check the "Protect main" ruleset requires) passes in seconds.

## 4. Merge

- **When:** only when every CI job on the PR's latest commit has passed, `CI gate` included. Never merge with CI red, pending or cancelled. For docs-only PRs only `CI gate` runs, in seconds.
- **Up to date first:** the PR should be up to date with `main`. If `main` moved, merge `origin/main` into the branch, re-validate locally, then push once.
  - An up-to-date PR lets the push to `main` reuse the PR's CI result (about 1 minute instead of 16).
- **How:** merge with the "merge" method and `expectedHeadSha`, and only when the user has asked or approved merging.
- **Deployment:** Vercel deploys `main` to production on its own. There is no manual deploy step. Merges that change only docs, tests (`e2e/`, `tests/`, `*.test.ts`), the test runners' configuration, `scripts/` or repository settings are skipped by `scripts/vercel-ignore-build.sh`.
- **Deploy budget (Vercel Active CPU):** the Hobby plan allows 4 hours of Active CPU in 30 days, about 480 CPU-seconds a day for everything, and it ran out on 8 Nov 2026 (docs/HOSTING_USAGE.md, "Vercel Active CPU"). Every production deploy costs part of that: every function starts cold, and the signed-in Production check runs against it.
  - Batch merges: at most about 6 production deploys a day, where a batch counts as one (raised from 3 on 19 Nov 2026 at the owner's request). A deploy costs about 15–20 CPU-seconds, most of it the signed-in Production check, against a day of about 100–150 without deploys and an allowance of about 480 (docs/HOSTING_USAGE.md, "19 Nov 2026"). The owner's Usage readings can lower it again.
  - Merge a set of ready PRs back to back, seconds apart (one script, no pause between merges), rather than spread across the day. Vercel starts each production deployment within a few seconds of its merge, and builds several at once; `scripts/vercel-ignore-build.sh` skips one whose commit a later commit on `main` already holds when it starts. So a merge followed within those seconds by the next is skipped, and the last one builds (unless only docs, tests or tooling changed): on 18 Nov 2026 merges 5 seconds apart deployed once, merges 10 seconds apart deployed each (docs/HOSTING_USAGE.md, "18 Nov 2026"). The Production check cancels its own earlier run, so it checks the last deployment in full.
  - A batch of stacked PRs: each PR's head merges the previous PR's branch, so its CI tests the tree `main` will have after it merges; before each merge, `git merge-tree` of `main` and the head must give that tree (docs/HOSTING_USAGE.md, "18 Nov 2026").

## 5. After a production deploy

- **The Production check runs by itself** after every successful production deployment (`.github/workflows/production-check.yml`, Vercel's deployment status): it waits for production to answer from the deployed commit, then checks health, the signed-out and forged-session security, the headers, and the pages at three widths with axe. Read its result (Actions → Production check); a failure also opens a `production-check` issue. If it did not run, start it by hand (Run workflow) rather than Data jobs `smoke`.
- **After a migration** also run one `Data jobs` run with `job: "auth-audit"`. **Add `perf-probe`** (Production check → Run workflow → perf) when the change touches data loading, queries or caching; it also runs every Monday. One probe reads about 6 MB from the production database, against an egress budget of 120 MB a day (`docs/HOSTING_USAGE.md`).
- **Visible changes:** production-verified means the Production check passed on the deployed commit *with* the member pages, and the check exercises the change: docs/LIVE_VALIDATION.md, "What it checks", lists what it asserts on each page. A change it only renders is "deployed, its pages load cleanly on production"; CI checks its behaviour on demo data. The check signs in as the verification account: a member with no player profile, kept by Data jobs `verify-account`, its password worked out from `VERIFY_ACCOUNT_SECRET`, or from `CRON_SECRET` until the owner sets it (docs/LIVE_VALIDATION.md). If its summary says the member pages are pending, they were not checked, and changes to member pages stay "deployed", not "production-verified".
- **Docs- or tooling-only merges:** skip the check.
- **Don't loop manual runs.** Each run bills at least 1 minute of Actions and wakes production's functions (Vercel Active CPU). Put several jobs in one Data jobs run, and run `perf-probe` and `smoke` only when a change needs them.

## 6. Actions hygiene

- **Re-runs:** don't re-run CI, push empty commits or close and reopen PRs to kick it. Re-run only when a failure is clearly unrelated to the code (runner loss, an install outage), and at most once.
- **Workflow changes:** don't add workflows, schedules or matrix jobs without the user's approval. Keep the existing optimisations: PR-only triggers, docs skip, cancel-in-progress, fail-fast job order, one build, reuse after merge, timeouts.
- **Before pushing a workflow change:** run `actionlint`. Where it is not installed, the Workflow lint check runs it on the pull request; merge only once it passes.

## 7. Standards

- **What a change should be:** `docs/STANDARDS.md` covers the product rules, honest data, design tokens, shared components, dates and numbers, images, responsive and accessible pages, performance, and security.
- **Automated checks** (all run by `pnpm verify`):
  - `src/app/design-tokens.test.ts`: no font sizes in px, no arbitrary values that copy a token, no Tailwind names for the panel and card radii, no hex colours in classes, easing curves from the tokens only, uppercase labels spaced with `tracking-label`;
  - ESLint (`eslint.config.mjs`): pages and components write dates and numbers only through `src/lib/format.ts`; `src/lib/format.test.ts` proves the rule fires;
  - `src/server/actions/guards.test.ts`: every server action, in any `"use server"` module, establishes who is asking before its first other asynchronous step.
  - `src/app/page-guards.test.ts`: every member and admin page calls `requirePageAccess` itself; a layout's check does not protect its pages, which render at the same time.
  - `src/app/client-imports.test.ts`: browser code never reaches server-only code, and large libraries (`zod`) load through `import()` except in the modules it lists with their reasons.
- **When a check fails, fix the code, not the check.** A genuine exception goes into the check's own list, with its reason.

## 8. Review, scope and pace (the owner's instruction of 28 Nov 2026)

The aim is production-ready, polished and well-tested work, delivered at a sustainable pace. Validation and review are scaled to the risk of the change, not repeated for their own sake.

- **Routine UI work:**
  - covers layout, styles, copy and one page's own behaviour;
  - needs the implementer's targeted tests (§2), a regression test for each fix, a look at the screenshots, and CI;
  - gets no separate reviewers or skeptics.
- **One independent review of the diff** for:
  - security;
  - authentication and permissions;
  - privacy and personal data;
  - data integrity;
  - migrations and anything destructive;
  - significant shared architecture: the app shell, the posture, and shared layout, paging or modal components that many pages use.

  Several reviewers, or adversarial skeptics, only for security, permissions, data integrity and destructive operations.
- **A fix is verified by its regression test.** Don't send a routine fix back to reviewers. Don't review unchanged code again: a later review reads only the diff since the last one.
- **What blocks a release:**
  - a defect the change introduces or makes worse;
  - a security, privacy or data problem;
  - an owner requirement that is not met.

  A pre-existing or minor finding outside the change goes under the PR's "Known, tracked" heading and in STATUS.md's tracked list, and into a later batch. Give a finding one fix round. If it is not settled then, ship what is right and track the rest.
- **Batches:**
  - Related fixes go in one PR.
  - A change across the platform builds its shared components first, then applies them to the pages in coordinated batches of several pages per PR, not one long cycle per page.
- **In parallel:** independent work goes on while CI or another long validation runs.
- **Restarts:** containers and workers can restart at any time, so save progress as you go.
  - Commit after each finished step (commits are free), with a message that says what is done and what is next.
  - The branch is pushed at the end of each turn; this runs no CI without a ready PR.
  - A lane that runs for long commits as it goes and keeps its notes in the repository's own files or its commit messages. A restarted lane then resumes from git and does not start over. Workflows resume from their journal (`resumeFromRunId`).
- **Workflows and subagents:**
  - Use them for work that splits into independent parts: mapping many pages, building separate pages, one review of a large diff.
  - Keep each lane's scope narrow.
  - Don't spawn a panel where one agent, or your own check, is enough.
