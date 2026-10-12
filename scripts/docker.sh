#!/usr/bin/env bash
# Blink Docker helpers (Linux / macOS / Git Bash).
# Usage: ./scripts/docker.sh <start|stop|rebuild|restart|logs|status|down|backup|restore>
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
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

ensure_env() {
  if [[ ! -f .env ]]; then
    if [[ -f .env.example ]]; then
      echo "No .env found - copying from .env.example"
      cp .env.example .env
      echo "Edit .env (BLINK_PASSWORD, BLINK_API_KEY, BLINK_SESSION_SECRET) before production use."
    else
      echo "error: missing .env (and no .env.example to copy)" >&2
      exit 1
    fi
  fi
}

usage() {
  cat <<'EOF'
Blink Docker helpers

Usage: ./scripts/docker.sh <command> [args...]

Commands:
  start      Start stack in background (build if needed)
  stop       Stop containers (keep volumes)
  rebuild    Rebuild images and recreate containers
  restart    Restart running containers
  logs       Follow service logs (optional service name)
  status     Show compose ps
  down       Stop and remove containers (keep volumes)
  backup     Postgres dump to ./backups/ (timestamped)
  restore    Restore dump (needs CONFIRM_RESTORE=1 and dump path)
  help       Show this help

Examples:
  ./scripts/docker.sh start
  ./scripts/docker.sh logs api
  ./scripts/docker.sh rebuild
  ./scripts/docker.sh backup
  CONFIRM_RESTORE=1 ./scripts/docker.sh restore backups/blink-YYYYMMDD-HHMMSS.dump
EOF
}

cmd="${1:-help}"
shift || true

case "$cmd" in
  start)
    ensure_env
    "${COMPOSE[@]}" up -d --build "$@"
    echo
    echo "Admin UI:  http://localhost/admin/"
    echo "API docs:  http://localhost/api/docs"
    echo "Health:    http://localhost/api/health"
    ;;
  stop)
    "${COMPOSE[@]}" stop "$@"
    ;;
  down)
    "${COMPOSE[@]}" down "$@"
    ;;
  rebuild)
    ensure_env
    "${COMPOSE[@]}" up -d --build --force-recreate "$@"
    echo
    echo "Rebuilt. Admin UI: http://localhost/admin/"
    ;;
  restart)
    "${COMPOSE[@]}" restart "$@"
    ;;
  logs)
    "${COMPOSE[@]}" logs -f --tail=200 "$@"
    ;;
  status|ps)
    "${COMPOSE[@]}" ps "$@"
    ;;
  backup)
    exec "$ROOT/deploy/scripts/backup-postgres.sh" "$@"
    ;;
  restore)
    exec "$ROOT/deploy/scripts/restore-postgres.sh" "$@"
    ;;
  help|-h|--help)
    usage
    ;;
  *)
    echo "error: unknown command '$cmd'" >&2
    usage >&2
    exit 1
    ;;
esac
