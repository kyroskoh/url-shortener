#!/usr/bin/env bash
# Blink Postgres backup — timestamped pg_dump (custom format).
# Usage (from repo root): ./deploy/scripts/backup-postgres.sh
# Env: COMPOSE_PROJECT_NAME, BACKUP_DIR (default: ./backups)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

COMPOSE=(docker compose)
if ! docker compose version >/dev/null 2>&1; then
  if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE=(docker-compose)
  else
    echo "error: Docker Compose v2 (docker compose) is required" >&2
    exit 1
  fi
fi

BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups}"
mkdir -p "$BACKUP_DIR"

if ! "${COMPOSE[@]}" ps --status running --services 2>/dev/null | grep -qx postgres; then
  echo "error: postgres service is not running. Start the stack first (e.g. ./scripts/docker.sh start)." >&2
  exit 1
fi

stamp="$(date -u +%Y%m%d-%H%M%S)"
outfile="$BACKUP_DIR/blink-${stamp}.dump"

echo "Backing up Postgres to $outfile ..."
"${COMPOSE[@]}" exec -T postgres \
  pg_dump -U blink -d blink -Fc --no-owner --no-acl \
  >"$outfile"

if [[ ! -s "$outfile" ]]; then
  echo "error: backup file is empty" >&2
  rm -f "$outfile"
  exit 1
fi

size="$(wc -c <"$outfile" | tr -d ' ')"
echo "OK: wrote $outfile ($size bytes)"
echo "Note: Redis is not included (cache/sessions/rate limits are rebuildable)."
echo "$outfile"
