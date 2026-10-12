#!/usr/bin/env bash
# Install Docker Engine + Compose plugin via get.docker.com if missing.
# Safe to re-run. Prefer root or passwordless sudo.
set -euo pipefail

run() {
  if [[ "$(id -u)" -eq 0 ]]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    echo "Need root or sudo to install Docker" >&2
    exit 1
  fi
}

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  echo "Docker and Compose already installed: $(docker --version)"
  exit 0
fi

echo "Installing Docker via https://get.docker.com …"
run sh -c 'curl -fsSL https://get.docker.com | sh'

# Ensure compose plugin (get.docker.com usually includes it)
if ! docker compose version >/dev/null 2>&1; then
  echo "docker compose plugin missing after install" >&2
  exit 1
fi

# Allow invoking user to use docker without sudo on next login (best-effort)
if [[ "$(id -u)" -ne 0 ]] && command -v sudo >/dev/null 2>&1; then
  run usermod -aG docker "$(id -un)" || true
fi

# Start daemon if needed
run systemctl enable --now docker 2>/dev/null || run service docker start 2>/dev/null || true

echo "Docker ready: $(docker --version)"
docker compose version
