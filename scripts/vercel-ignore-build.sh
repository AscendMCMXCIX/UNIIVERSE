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
