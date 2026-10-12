#!/usr/bin/env bash
# Blink Postgres restore from a pg_dump custom-format file.
# Usage: CONFIRM_RESTORE=1 ./deploy/scripts/restore-postgres.sh backups/blink-YYYYMMDD-HHMMSS.dump
# Requires CONFIRM_RESTORE=1 to avoid accidental overwrites.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

if [[ "${CONFIRM_RESTORE:-}" != "1" ]]; then
  echo "error: refuse to restore without CONFIRM_RESTORE=1" >&2
  echo "example: CONFIRM_RESTORE=1 $0 backups/blink-YYYYMMDD-HHMMSS.dump" >&2
  exit 1
fi

dump="${1:-}"
if [[ -z "$dump" ]]; then
  echo "error: dump path required" >&2
  echo "usage: CONFIRM_RESTORE=1 $0 <path-to.dump>" >&2
  exit 1
fi
if [[ ! -f "$dump" ]]; then
  echo "error: dump not found: $dump" >&2
  exit 1
fi
# Resolve to absolute path for docker exec redirection
if [[ "$dump" != /* ]]; then
  dump="$ROOT/$dump"
fi
if [[ ! -f "$dump" ]]; then
  echo "error: dump not found: $dump" >&2
  exit 1
fi

COMPOSE=(docker compose)
if ! docker compose version >/dev/null 2>&1; then
  if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE=(docker-compose)
  else
    echo "error: Docker Compose v2 (docker compose) is required" >&2
    exit 1
  fi
fi

if ! "${COMPOSE[@]}" ps --status running --services 2>/dev/null | grep -qx postgres; then
  echo "error: postgres service is not running. Start the stack first." >&2
  exit 1
fi

echo "Restoring $dump into Postgres (destructive) ..."
# Drop/recreate public schema then restore custom-format dump
"${COMPOSE[@]}" exec -T postgres \
  psql -U blink -d blink -v ON_ERROR_STOP=1 \
  -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO blink; GRANT ALL ON SCHEMA public TO public;"

"${COMPOSE[@]}" exec -T postgres \
  pg_restore -U blink -d blink --no-owner --no-acl \
  <"$dump"

echo "OK: restore complete from $dump"
echo "Restart API so migrations/cache stay consistent: ./scripts/docker.sh restart api"
echo "Redis was not restored (rebuildable)."
