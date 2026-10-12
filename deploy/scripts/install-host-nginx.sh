#!/usr/bin/env bash
# Install Blink layurl.com vhost + Let's Encrypt (certbot webroot).
# Order: HTTP vhost (ACME) → certbot for layurl.com → SSL vhost → reload.
# Does not reuse unrelated certs (e.g. api.kyroskoh.xyz).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="${1:-$ROOT/deploy/nginx.blink-layurl.com.conf}"
SITE_NAME="zz-blink-layurl.com.conf"
TMP="$(mktemp)"

cleanup() { rm -f "$TMP"; }
trap cleanup EXIT

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

# Load optional paths from deploy .env if present (safe for $ in passwords)
if [[ -f "$ROOT/.env" ]]; then
  # shellcheck disable=SC1091
  source "$ROOT/deploy/scripts/load-env.sh" "$ROOT/.env"
fi

install_site() {
  local file="$1"
  for legacy in blink-layurl.conf nginx.host.conf zz-blink-layurl.com.conf; do
    run rm -f "/etc/nginx/sites-enabled/$legacy" "/etc/nginx/sites-available/$legacy" "/etc/nginx/conf.d/$legacy" 2>/dev/null || true
  done
  if [[ -d /etc/nginx/sites-available ]]; then
    local dest="/etc/nginx/sites-available/$SITE_NAME"
    run cp "$file" "$dest"
    run ln -sfn "$dest" "/etc/nginx/sites-enabled/$SITE_NAME"
    echo "Installed $dest → sites-enabled/$SITE_NAME"
  elif [[ -d /etc/nginx/conf.d ]]; then
    local dest="/etc/nginx/conf.d/$SITE_NAME"
    run cp "$file" "$dest"
    echo "Installed $dest"
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
}

render_http_only() {
  cp "$SRC" "$TMP"
  sed -i \
    -e '/listen 443 ssl;/d' \
    -e '/listen \[::\]:443 ssl;/d' \
    -e '/__BLINK_SSL_BEGIN__/,/__BLINK_SSL_END__/d' \
    "$TMP"
}

render_with_ssl() {
  local cert="$1"
  local key="$2"
  local cert_esc key_esc
  cp "$SRC" "$TMP"
  cert_esc="$(printf '%s' "$cert" | sed 's/[\/&]/\\&/g')"
  key_esc="$(printf '%s' "$key" | sed 's/[\/&]/\\&/g')"
  sed -i \
    -e "s|__BLINK_SSL_CERT__|${cert_esc}|g" \
    -e "s|__BLINK_SSL_KEY__|${key_esc}|g" \
    "$TMP"
}

# 1) HTTP-only first so ACME challenge can reach /.well-known via this vhost
run mkdir -p /var/www/certbot
render_http_only
install_site "$TMP"
echo "HTTP vhost installed (ACME-ready)"

# 2) Obtain / reuse Let's Encrypt cert for layurl.com only (not other host certs)
bash "$ROOT/deploy/scripts/ensure-letsencrypt.sh" "$ROOT/.env"

CERT="${BLINK_SSL_CERT:-/etc/letsencrypt/live/layurl.com/fullchain.pem}"
KEY="${BLINK_SSL_KEY:-/etc/letsencrypt/live/layurl.com/privkey.pem}"
# ensure-letsencrypt prints BLINK_SSL_*; also accept defaults if files exist
if [[ ! -f "$CERT" || ! -f "$KEY" ]]; then
  CERT="/etc/letsencrypt/live/layurl.com/fullchain.pem"
  KEY="/etc/letsencrypt/live/layurl.com/privkey.pem"
fi

if [[ ! -f "$CERT" || ! -f "$KEY" ]]; then
  echo "ERROR: Let's Encrypt files missing after ensure-letsencrypt.sh" >&2
  echo "       Expected /etc/letsencrypt/live/layurl.com/{fullchain,privkey}.pem" >&2
  exit 1
fi

# 3) Re-install with SSL
render_with_ssl "$CERT" "$KEY"
install_site "$TMP"
echo "SSL enabled with Let's Encrypt: $CERT"
echo "Host nginx reloaded for Blink ($SITE_NAME)"
