#!/bin/bash
# Vercel "Ignored Build Step" (vercel.json → ignoreCommand): exit 0 skips the deployment, exit 1
# builds it. A deployment is skipped only when every file changed since this branch's last
# successful deployment is something the deployed app never contains or reads (docs, Markdown,
# GitHub workflows, git hooks, Claude Code settings, the browser and database tests, unit test files,
# the test runners' configuration, and the repository's scripts, which `next build` does not use),
# or when it is an unrequested preview. Any doubt builds production.
# A production deployment costs Vercel Active CPU, which the Hobby plan caps at 4 hours a month:
# every function starts cold again, and the Production check runs against it (docs/HOSTING_USAGE.md,
# "Vercel Active CPU"). So a merge that changes only tests or tooling does not deploy.
# `--app-files` prints, from the file names on stdin, those that do need a deployment (for tests).
# Preview deployments (every branch push) are skipped unless asked for: each one stores another
# full copy of the app's functions on Vercel, and nobody reviews them (the browser tests run in CI).
# Ask for one with a branch named preview/... or "[preview]" in the commit message.
app_files() {
  grep -Ev '^(docs/|\.github/|\.githooks/|\.claude/|e2e/|tests/|scripts/)|\.md$|^\.env\.example$|\.test\.tsx?$|^(playwright|vitest)\.config\.[cm]?[jt]s$' || true
}
if [ "${1:-}" = "--app-files" ]; then app_files; exit 0; fi
if [ "${VERCEL_ENV:-}" = "preview" ]; then
  case "${VERCEL_GIT_COMMIT_REF:-}" in preview/*) echo "Preview branch: building."; exit 1 ;; esac
  case "${VERCEL_GIT_COMMIT_MESSAGE:-}" in *"[preview]"*) echo "Preview requested in the commit message: building."; exit 1 ;; esac
  echo "Preview deployment not requested (branch preview/... or [preview] in the commit message): skipping."
  exit 0
fi
# A batch of merges deploys once. Vercel starts each production deployment within a few seconds of
# its merge (it builds several at once; it does not queue them), and this step runs first. When this
# commit's branch already has a later commit that contains it, that later commit's own deployment
# builds (and holds this commit's changes, since it is compared with the last deployment that
# succeeded), so this one is skipped: merges made back to back, seconds apart, deploy their last
# commit only (18 Nov 2026: 5 seconds apart, three of four skipped; 10 seconds apart, none). Any doubt
# builds: no answer from GitHub in time, a later commit that does not contain this one, or no commit
# to compare.
# (To deploy an older commit on purpose, use Vercel's Instant Rollback, which builds nothing.) docs/HOSTING_USAGE.md, "18 Nov 2026".
superseded_by() {
  local ref="${VERCEL_GIT_COMMIT_REF:-}" sha="${VERCEL_GIT_COMMIT_SHA:-}" url tip
  url="${VERCEL_IGNORE_REMOTE:-}"
  if [ -z "$url" ] && [ -n "${VERCEL_GIT_REPO_OWNER:-}" ] && [ -n "${VERCEL_GIT_REPO_SLUG:-}" ]; then
    url="https://github.com/${VERCEL_GIT_REPO_OWNER}/${VERCEL_GIT_REPO_SLUG}.git"
  fi
  [ -n "$url" ] && [ -n "$ref" ] && [ -n "$sha" ] || return 1
  tip=$(timeout 20 git ls-remote "$url" "refs/heads/$ref" 2>/dev/null | cut -f1) || return 1
  [ -n "$tip" ] && [ "$tip" != "$sha" ] || return 1
  timeout 60 git fetch --quiet --depth=50 "$url" "$tip" 2>/dev/null || return 1
  git merge-base --is-ancestor "$sha" "$tip" 2>/dev/null || return 1
  printf '%s\n' "$tip"
}
if [ "${VERCEL_ENV:-}" = "production" ] && tip=$(superseded_by); then
  echo "A later commit on ${VERCEL_GIT_COMMIT_REF} (${tip:0:7}) holds this one and deploys next: skipping this deployment."
  exit 0
fi
prev="${VERCEL_GIT_PREVIOUS_SHA:-}"
if [ -z "$prev" ]; then
  echo "No previous deployment to compare with: building."; exit 1
fi
if ! git cat-file -e "${prev}^{commit}" 2>/dev/null; then
  echo "Previous deployment ${prev} is not in this clone: building."; exit 1
fi
if ! changed=$(git diff --name-only "$prev" HEAD); then
  echo "Could not compare with ${prev}: building."; exit 1
fi
if [ -z "$changed" ]; then
  echo "No file changes since ${prev}: building."; exit 1
fi
app=$(printf '%s\n' "$changed" | app_files)
if [ -z "$app" ]; then
  echo "Only documentation or repository tooling changed since ${prev}: skipping this deployment."
  exit 0
fi
echo "App files changed since ${prev}: building."
exit 1
