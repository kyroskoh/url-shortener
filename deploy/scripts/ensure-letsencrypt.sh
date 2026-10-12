#!/usr/bin/env bash
# Ensure Let's Encrypt cert for layurl.com (+ www) using certbot webroot.
# Reuses an existing certbot install and an existing layurl.com lineage if present.
# Does not modify other sites' certificates (e.g. api.kyroskoh.xyz).
set -euo pipefail

DOMAINS=(layurl.com www.layurl.com)
CERT_NAME="${BLINK_LETSENCRYPT_CERT_NAME:-layurl.com}"
WEBROOT="${BLINK_LETSENCRYPT_WEBROOT:-/var/www/certbot}"
LIVE_DIR="/etc/letsencrypt/live/${CERT_NAME}"

run() {
  if [[ "$(id -u)" -eq 0 ]]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    echo "Need root or sudo for certbot" >&2
    exit 1
  fi
}

ensure_certbot() {
  if command -v certbot >/dev/null 2>&1; then
    echo "Using existing certbot: $(command -v certbot)"
    return
  fi
  echo "Installing certbot …"
  if command -v apt-get >/dev/null 2>&1; then
    run apt-get update -y
    run DEBIAN_FRONTEND=noninteractive apt-get install -y certbot
  elif command -v dnf >/dev/null 2>&1; then
    run dnf install -y certbot
  elif command -v yum >/dev/null 2>&1; then
    run yum install -y certbot
  else
    echo "certbot not found and no supported package manager" >&2
    exit 1
  fi
}

cert_ready() {
  [[ -f "${LIVE_DIR}/fullchain.pem" && -f "${LIVE_DIR}/privkey.pem" ]]
}

# True if certbot already manages CERT_NAME (any domains)
lineage_exists() {
  cert_ready && return 0
  if command -v certbot >/dev/null 2>&1; then
    certbot certificates 2>/dev/null | grep -q "Certificate Name: ${CERT_NAME}" && return 0
  fi
  return 1
}

ensure_webroot() {
  run mkdir -p "$WEBROOT"
  run chmod 755 "$WEBROOT"
}

issue_or_renew() {
  local email="${BLINK_LETSENCRYPT_EMAIL:-}"
  local -a args=(
    certonly
    --webroot
    -w "$WEBROOT"
    --cert-name "$CERT_NAME"
    --non-interactive
    --agree-tos
    --keep-until-expiring
    --preferred-challenges http
  )
  local d
  for d in "${DOMAINS[@]}"; do
    args+=(-d "$d")
  done

  if [[ -n "$email" ]]; then
    args+=(--email "$email")
  else
    args+=(--register-unsafely-without-email)
  fi

  # Expand lineage if it exists with a subset of names
  if lineage_exists; then
    args+=(--expand)
  fi

  echo "Running: certbot ${args[*]}"
  run certbot "${args[@]}"
}

# --- main ---
# Allow caller to pass .env (safe for $ in passwords; unlike raw `source`)
if [[ -f "${1:-}" ]]; then
  # shellcheck disable=SC1091
  source "$(cd "$(dirname "$0")" && pwd)/load-env.sh" "$1"
fi

ensure_certbot
ensure_webroot

if cert_ready; then
  echo "Let's Encrypt cert already present: $LIVE_DIR"
  # Still expand/renew if needed (no-op when not due)
  issue_or_renew || echo "WARN: certbot keep/expand returned non-zero; using existing cert files" >&2
else
  echo "Requesting Let's Encrypt certificate for ${DOMAINS[*]} …"
  issue_or_renew
fi

if ! cert_ready; then
  echo "Failed to obtain $LIVE_DIR/{fullchain,privkey}.pem" >&2
  exit 1
fi

echo "BLINK_SSL_CERT=${LIVE_DIR}/fullchain.pem"
echo "BLINK_SSL_KEY=${LIVE_DIR}/privkey.pem"
export BLINK_SSL_CERT="${LIVE_DIR}/fullchain.pem"
export BLINK_SSL_KEY="${LIVE_DIR}/privkey.pem"
