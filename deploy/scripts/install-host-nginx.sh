#!/usr/bin/env bash
# Install Blink layurl.com vhost into an existing host nginx and reload.
# Uses a unique destination name (zz-blink-layurl.com.conf) to avoid clashing
# with generic conf.d files.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="${1:-$ROOT/deploy/nginx.blink-layurl.com.conf}"
SITE_NAME="zz-blink-layurl.com.conf"

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

# Drop legacy install names from earlier deploys
for legacy in blink-layurl.conf nginx.host.conf; do
  run rm -f "/etc/nginx/sites-enabled/$legacy" "/etc/nginx/sites-available/$legacy" "/etc/nginx/conf.d/$legacy" 2>/dev/null || true
done

if [[ -d /etc/nginx/sites-available ]]; then
  DEST="/etc/nginx/sites-available/$SITE_NAME"
  run cp "$SRC" "$DEST"
  run ln -sfn "$DEST" "/etc/nginx/sites-enabled/$SITE_NAME"
  echo "Installed $DEST → sites-enabled/$SITE_NAME"
elif [[ -d /etc/nginx/conf.d ]]; then
  DEST="/etc/nginx/conf.d/$SITE_NAME"
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
echo "Host nginx reloaded for Blink ($SITE_NAME)"
