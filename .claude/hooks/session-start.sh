#!/bin/bash
# Activates the repository's git hooks (.githooks/pre-push blocks direct pushes to main) in every
# Claude Code session. Idempotent; installs nothing.
set -euo pipefail
cd "${CLAUDE_PROJECT_DIR:-.}"
git config core.hooksPath .githooks 2>/dev/null || true
