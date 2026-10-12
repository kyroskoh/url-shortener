#!/usr/bin/env bash
# Ops wrappers for Blink production.
# Usage: ./scripts/ops.sh bootstrap|ship|cf-dry-run
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CMD="${1:-}"

case "$CMD" in
  bootstrap)
    exec bash "$ROOT/deploy/scripts/bootstrap-github-env.sh"
    ;;
  ship)
    exec bash "$ROOT/deploy/scripts/ship-prod.sh"
    ;;
  cf-dry-run)
    exec bash "$ROOT/deploy/scripts/ship-prod.sh" --dry-run
    ;;
  *)
    echo "Usage: $0 bootstrap|ship|cf-dry-run" >&2
    exit 1
    ;;
esac
