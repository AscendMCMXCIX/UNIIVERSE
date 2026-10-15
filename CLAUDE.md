# UNIIVERSE: notes for coding agents

## GitHub Actions minutes are limited

The account has 2,000 free Actions minutes a month. A full CI run costs about 17 billed minutes. The details are in `docs/CI_USAGE.md`.

- **Branches and pushes:**
  - Work on a branch and open a pull request. Don't push straight to `main`: every push to `main` runs full CI and deploys to production.
  - Push finished, locally validated work, not every commit. CI runs once per push on a PR, and a newer push cancels the older run.
- **Run the checks locally before pushing:**
  - `pnpm typecheck`, `pnpm lint`, `pnpm vitest run src`.
  - The database suite on Postgres if it is available (`TEST_DATABASE_URL=… pnpm vitest run tests/db`).
  - `pnpm build && pnpm test:e2e` for UI changes.
- **Production checks:** one `Production smoke` run plus one `Data jobs` run listing every job needed (`job: "perf-probe engine-probe"`). Don't loop manual runs: each one bills at least a minute.
- **Re-runs:** don't re-run CI without a reason that isn't the code.
