#!/usr/bin/env bash
# Install Blink site config into an existing host nginx and reload.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="${1:-$ROOT/deploy/nginx.host.conf}"

if [[ ! -f "$SRC" ]]; then
  echo "Missing nginx host config: $SRC" >&2
  exit 1
fi

if ! command -v nginx >/dev/null 2>&1; then
  echo "nginx not found on PATH — install nginx on the host first" >&2
  exit 1
fi

run() {
  if [[ "$(id -u)" -eq 0 ]]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    echo "Need root or sudo to install nginx site" >&2
    exit 1
  fi
}

if [[ -d /etc/nginx/sites-available ]]; then
  DEST=/etc/nginx/sites-available/blink-layurl.conf
  run cp "$SRC" "$DEST"
  run ln -sfn "$DEST" /etc/nginx/sites-enabled/blink-layurl.conf
  # Avoid default site stealing layurl.com if it listens on _ or empty server_name
  echo "Installed $DEST → sites-enabled"
elif [[ -d /etc/nginx/conf.d ]]; then
  DEST=/etc/nginx/conf.d/blink-layurl.conf
  run cp "$SRC" "$DEST"
  echo "Installed $DEST"
else
  echo "Neither sites-available nor conf.d found under /etc/nginx" >&2
  exit 1
fi

run nginx -t
if command -v systemctl >/dev/null 2>&1; then
  run systemctl reload nginx
else
  run nginx -s reload
fi
echo "Host nginx reloaded for Blink"
