#!/usr/bin/env bash
# FundFlow test runner.
#
# Usage:
#   scripts/test.sh                 # run unit + integration (server + client)
#   scripts/test.sh server          # only backend tests
#   scripts/test.sh client          # only frontend tests
#   scripts/test.sh e2e             # only Playwright E2E (requires browsers installed)
#   scripts/test.sh all             # everything, including e2e
#   scripts/test.sh watch           # vitest in watch mode
#
# E2E note: run `npx playwright install chromium` once before the first e2e run.
set -euo pipefail

mode="${1:-default}"

case "$mode" in
  server)
    npx vitest run --project=server
    ;;
  client)
    npx vitest run --project=client
    ;;
  e2e)
    npx playwright test
    ;;
  watch)
    npx vitest
    ;;
  all)
    npx vitest run
    npx playwright test
    ;;
  default|"")
    npx vitest run
    ;;
  *)
    echo "Unknown mode: $mode"
    echo "Valid: server | client | e2e | watch | all"
    exit 1
    ;;
esac
