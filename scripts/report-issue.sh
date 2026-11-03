#!/usr/bin/env bash
# One issue per automated check, opened while it fails and closed once it passes again, so a
# failure reaches the owner as an ordinary GitHub notification with what failed and where, and a
# recovery needs nobody to tidy up (docs/MONITORING.md). Used by the Production check and Database
# backup workflows with the run's own token (issues: write); it never reads or writes anything else.
#
#   scripts/report-issue.sh <label> <title> fail <body file>   open the issue, or comment on the open one
#   scripts/report-issue.sh <label> <title> ok                 close the open one, if any
#
# Needs GH_TOKEN, GITHUB_REPOSITORY and RUN_URL in the environment.
set -euo pipefail
label="$1" title="$2" state="$3" body="${4:-}"
repo="$GITHUB_REPOSITORY"
gh label create "$label" --repo "$repo" --color B60205 --description "Opened and closed by an automated check (docs/MONITORING.md)" >/dev/null 2>&1 || true
open="$(gh issue list --repo "$repo" --label "$label" --state open --limit 1 --json number --jq '.[0].number // empty')"
case "$state" in
  fail)
    if [ -n "$open" ]; then gh issue comment "$open" --repo "$repo" --body-file "$body"
    else gh issue create --repo "$repo" --title "$title" --label "$label" --body-file "$body"; fi ;;
  ok)
    if [ -n "$open" ]; then gh issue close "$open" --repo "$repo" --comment "Passing again: $RUN_URL"; fi ;;
  *) echo "state must be fail or ok" >&2; exit 2 ;;
esac
