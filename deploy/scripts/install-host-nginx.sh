#!/usr/bin/env bash
# Install Blink layurl.com vhost into an existing host nginx and reload.
# Fills SSL cert paths for Cloudflare Full (strict); falls back to HTTP-only
# if certs are missing.
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

# Load optional paths from deploy .env if present
if [[ -f "$ROOT/.env" ]]; then
  # shellcheck disable=SC1091
  set -a
  # shellcheck source=/dev/null
  source "$ROOT/.env"
  set +a
fi

resolve_ssl() {
  local cert="${BLINK_SSL_CERT:-}"
  local key="${BLINK_SSL_KEY:-}"

  if [[ -n "$cert" && -n "$key" && -f "$cert" && -f "$key" ]]; then
    echo "$cert|$key"
    return
  fi

  # Common Let's Encrypt layout for layurl.com
  cert="/etc/letsencrypt/live/layurl.com/fullchain.pem"
  key="/etc/letsencrypt/live/layurl.com/privkey.pem"
  if [[ -f "$cert" && -f "$key" ]]; then
    echo "$cert|$key"
    return
  fi

  # Cloudflare Origin CA style drop path
  cert="/etc/nginx/ssl/layurl.com.pem"
  key="/etc/nginx/ssl/layurl.com.key"
  if [[ -f "$cert" && -f "$key" ]]; then
    echo "$cert|$key"
    return
  fi

  # Reuse first ssl_certificate pair from other nginx configs on this host
  local found
  found="$(
    grep -RhoE '^\s*ssl_certificate\s+[^;]+;' /etc/nginx 2>/dev/null \
      | grep -v zz-blink-layurl \
      | head -1 \
      | sed -E 's/.*ssl_certificate\s+([^;]+);/\1/' \
      | tr -d ' '"'"'"' \
      || true
  )"
  local found_key
  found_key="$(
    grep -RhoE '^\s*ssl_certificate_key\s+[^;]+;' /etc/nginx 2>/dev/null \
      | grep -v zz-blink-layurl \
      | head -1 \
      | sed -E 's/.*ssl_certificate_key\s+([^;]+);/\1/' \
      | tr -d ' '"'"'"' \
      || true
  )"
  if [[ -n "$found" && -n "$found_key" && -f "$found" && -f "$found_key" ]]; then
    echo "Reusing existing host certs: $found" >&2
    echo "$found|$found_key"
    return
  fi

  echo ""
}

SSL_PAIR="$(resolve_ssl || true)"
cp "$SRC" "$TMP"

if [[ -n "$SSL_PAIR" ]]; then
  CERT="${SSL_PAIR%%|*}"
  KEY="${SSL_PAIR##*|}"
  # Escape for sed
  CERT_ESC="$(printf '%s' "$CERT" | sed 's/[\/&]/\\&/g')"
  KEY_ESC="$(printf '%s' "$KEY" | sed 's/[\/&]/\\&/g')"
  sed -i \
    -e "s|__BLINK_SSL_CERT__|${CERT_ESC}|g" \
    -e "s|__BLINK_SSL_KEY__|${KEY_ESC}|g" \
    "$TMP"
  echo "SSL enabled: cert=$CERT"
else
  echo "WARN: no SSL certs found — installing HTTP-only (Cloudflare Full OK; Full strict needs origin TLS)" >&2
  echo "      Set BLINK_SSL_CERT / BLINK_SSL_KEY or place files at /etc/nginx/ssl/layurl.com.{pem,key}" >&2
  # Drop 443 listens and SSL block
  sed -i \
    -e '/listen 443 ssl;/d' \
    -e '/listen \[::\]:443 ssl;/d' \
    -e '/__BLINK_SSL_BEGIN__/,/__BLINK_SSL_END__/d' \
    "$TMP"
fi

# Drop legacy install names from earlier deploys
for legacy in blink-layurl.conf nginx.host.conf zz-blink-layurl.com.conf; do
  run rm -f "/etc/nginx/sites-enabled/$legacy" "/etc/nginx/sites-available/$legacy" "/etc/nginx/conf.d/$legacy" 2>/dev/null || true
done

if [[ -d /etc/nginx/sites-available ]]; then
  DEST="/etc/nginx/sites-available/$SITE_NAME"
  run cp "$TMP" "$DEST"
  run ln -sfn "$DEST" "/etc/nginx/sites-enabled/$SITE_NAME"
  echo "Installed $DEST → sites-enabled/$SITE_NAME"
elif [[ -d /etc/nginx/conf.d ]]; then
  DEST="/etc/nginx/conf.d/$SITE_NAME"
  run cp "$TMP" "$DEST"
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
