# UNIIVERSE: notes for coding agents

These rules apply to every change: features, bug fixes, UI changes and docs. The aim is to keep quality and automatic Vercel deploys while staying within the 3,000 GitHub Actions minutes a month included in the owner's GitHub Pro plan. A full CI run costs about 40 billed minutes (34–48 measured on 22 Oct); the details are in `docs/CI_USAGE.md`. Branch protection is not configured on `main` (Pro would allow it; turning it on is the owner's decision), so these rules are the protection. Follow them even when nothing stops you.

## 1. Branch

- **Start from the latest `main`:** `git fetch origin main && git switch -c <topic> origin/main`. Use one branch per piece of work, with a descriptive name.
- **Never commit to `main` or push to it.** `.githooks/pre-push` refuses pushes to `main`; the session start hook turns it on. Don't bypass it (`ALLOW_MAIN_PUSH=1`) unless the user explicitly asks.

## 2. Develop and validate locally

Most of the testing happens here, not on GitHub. Run what the change touches:

| Changed | Run |
|---|---|
| Always | `pnpm verify` (typecheck, lint, unit tests, about 1 minute) |
| Database, queries, migrations, server logic | `service postgresql start` if needed, then `TEST_DATABASE_URL=postgres://uniiverse:uniiverse@127.0.0.1:5432/uniiverse pnpm vitest run tests/db` |
| UI, pages, client components, styles | `pnpm build && pnpm test:e2e`. Targeted specs are fine while iterating; run the full suite once before the PR is ready. |
| Migrations | `pnpm db:generate`, then follow docs/UNIIVERSE_TECHNICAL_HANDOVER.md §A3. A new table, view, function or serial column gets the grants block from docs/DATABASE_PERMISSIONS.md in the same migration: RLS on, nothing for Supabase's Data API roles, `SELECT` for the backup role. Never rely on automatic grants. |
| Something that can behave differently in Safari (touch, dialogs, forms, the installed app) | Once it is ready: the WebKit workflow, by hand (Actions → WebKit; docs/RESPONSIVE.md → Safari and iPhones). |

- Fix failures locally. Don't push to "see what CI says".
- Commit as often as you like; commits are free.

## 3. Push and open the PR

- **Pushes:**
  - Pushing a branch with no PR, or with a draft PR, runs no CI and costs nothing.
  - Every push to a ready PR runs the full CI (about 40 minutes), and a newer push cancels the running one. So push to a ready PR only when a batch of validated changes is finished, not after each small fix.
  - Pushes at the end of a session turn are fine on a branch without a ready PR.
- **Opening the PR:**
  - Open it when the work is complete and validated. Alternatively, open it as a draft early and mark it "Ready for review" when done; that runs CI.
  - Describe what changed and what was validated locally.
  - Keep unrelated changes out of the PR.
- **Docs-only changes** (`docs/`, `*.md`) still go through a branch and a PR. CI is skipped for them automatically.

## 4. Merge

- **When:** only when every CI job on the PR's latest commit has passed. Never merge with CI red, pending or cancelled. Docs-only PRs have no CI to wait for.
- **Up to date first:** the PR should be up to date with `main`. If `main` moved, merge `origin/main` into the branch, re-validate locally, then push once.
  - An up-to-date PR lets the push to `main` reuse the PR's CI result (about 1 minute instead of 16).
- **How:** merge with the "merge" method and `expectedHeadSha`, and only when the user has asked or approved merging.
- **Deployment:** Vercel deploys `main` to production on its own. There is no manual deploy step. Docs- or tooling-only merges are skipped by `scripts/vercel-ignore-build.sh`.

## 5. After a production deploy

- **App behaviour changed:** run one `Data jobs` workflow run on `main` with `job: "smoke"` (add `auth-audit` after a migration). Check `deployment.commit` in the output. The run fails if health is not ok or a page errors.
- **Add `perf-probe`** when the change touches data loading, queries or caching. One probe reads about 6 MB from the production database, against an egress budget of 120 MB a day (`docs/HOSTING_USAGE.md`).
- **Visible changes:** when the environment can reach the site and `UNIIVERSE_VERIFY_USER` / `UNIIVERSE_VERIFY_PASSWORD` are set, also run `node scripts/live-check.mjs` (read only; docs/LIVE_VALIDATION.md → Automated live check) and review its screenshots. Until it has run on the deployed commit, the change is deployed, not production-verified.
- **Docs- or tooling-only merges:** skip the check.
- **Don't loop manual runs.** Each run bills at least 1 minute.

## 6. Actions hygiene

- **Re-runs:** don't re-run CI, push empty commits or close and reopen PRs to kick it. Re-run only when a failure is clearly unrelated to the code (runner loss, an install outage), and at most once.
- **Workflow changes:** don't add workflows, schedules or matrix jobs without the user's approval. Keep the existing optimisations: PR-only triggers, docs skip, cancel-in-progress, fail-fast job order, one build, reuse after merge, timeouts.
- **Before pushing a workflow change:** run `actionlint`.

## 7. Standards

- **What a change should be:** `docs/STANDARDS.md` covers the product rules, honest data, design tokens, shared components, dates and numbers, images, responsive and accessible pages, performance, and security.
- **Automated checks** (all run by `pnpm verify`):
  - `src/app/design-tokens.test.ts`: no font sizes in px, no arbitrary values that copy a token, no Tailwind names for the panel and card radii, no hex colours in classes, easing curves from the tokens only, uppercase labels spaced with `tracking-label`;
  - ESLint (`eslint.config.mjs`): pages and components write dates and numbers only through `src/lib/format.ts`; `src/lib/format.test.ts` proves the rule fires;
  - `src/server/actions/guards.test.ts`: every server action, in any `"use server"` module, establishes who is asking before its first other asynchronous step.
  - `src/app/page-guards.test.ts`: every member and admin page calls `requirePageAccess` itself; a layout's check does not protect its pages, which render at the same time.
  - `src/app/client-imports.test.ts`: browser code never reaches server-only code, and large libraries (`zod`) load through `import()` except in the modules it lists with their reasons.
- **When a check fails, fix the code, not the check.** A genuine exception goes into the check's own list, with its reason.
