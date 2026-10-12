#!/usr/bin/env bash
# Sync .env.production into GitHub Environment "production" (vars + secrets).
# Never prints secret values. Requires: gh auth login, repo admin/secrets write.
#
# Usage:
#   ./deploy/scripts/bootstrap-github-env.sh           # full (app + CF + deploy SSH)
#   ./deploy/scripts/bootstrap-github-env.sh --cf-only # Cloudflare + app secrets; skip DEPLOY_*
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/.env.production}"
ENV_NAME="${ENV_NAME:-production}"
CF_ONLY=0
if [[ "${1:-}" == "--cf-only" ]]; then
  CF_ONLY=1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — copy .env.production.example and fill values." >&2
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI required (https://cli.github.com/)" >&2
  exit 1
fi

# shellcheck disable=SC1091
source "$ROOT/deploy/scripts/load-env.sh" "$ENV_FILE"

REPO="${GITHUB_REPO:-}"
if [[ -z "$REPO" ]]; then
  REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || true)"
fi
if [[ -z "$REPO" ]]; then
  echo "Set GITHUB_REPO=owner/name in .env.production or run from a cloned repo with gh." >&2
  exit 1
fi

require() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required key in .env.production: $name" >&2
    exit 1
  fi
}

# Allow multiline key via path
if [[ -n "${DEPLOY_SSH_KEY_FILE:-}" && -f "${DEPLOY_SSH_KEY_FILE}" ]]; then
  DEPLOY_SSH_KEY="$(cat "$DEPLOY_SSH_KEY_FILE")"
  export DEPLOY_SSH_KEY
fi

require BLINK_PASSWORD
require BLINK_API_KEY
require BLINK_SESSION_SECRET
require POSTGRES_PASSWORD
require CLOUDFLARE_API_TOKEN
require CLOUDFLARE_ZONE_ID
require CLOUDFLARE_ORIGIN_IPV4

if [[ "$CF_ONLY" -eq 0 ]]; then
  require DEPLOY_HOST
  require DEPLOY_USER
  require DEPLOY_SSH_KEY
else
  echo "Cloudflare-only bootstrap: skipping required DEPLOY_HOST / DEPLOY_USER / DEPLOY_SSH_KEY"
fi

echo "Ensuring GitHub Environment '$ENV_NAME' on $REPO …"
# Create environment if missing (idempotent)
if ! gh api "repos/$REPO/environments/$ENV_NAME" >/dev/null 2>&1; then
  gh api -X PUT "repos/$REPO/environments/$ENV_NAME" --silent
  echo "Created environment $ENV_NAME"
else
  echo "Environment $ENV_NAME already exists"
fi

set_var() {
  local key="$1"
  local val="${!key:-}"
  if [[ -n "$val" ]]; then
    gh variable set "$key" --env "$ENV_NAME" --repo "$REPO" --body "$val" >/dev/null
    echo "  var  $key"
  fi
}

set_secret() {
  local key="$1"
  local val="${!key:-}"
  if [[ -n "$val" ]]; then
    printf '%s' "$val" | gh secret set "$key" --env "$ENV_NAME" --repo "$REPO" >/dev/null
    echo "  secret $key"
  fi
}

echo "Setting variables …"
set_var BLINK_BASE_URL
set_var BLINK_PUBLIC_MODE
set_var BLINK_TURNSTILE_FORCE
set_var CLOUDFLARE_MANAGE_WWW
set_var DEPLOY_PATH
set_var HEALTHCHECK_URL
set_var BLINK_LETSENCRYPT_EMAIL

# Defaults when unset in file
if [[ -z "${BLINK_BASE_URL:-}" ]]; then
  gh variable set BLINK_BASE_URL --env "$ENV_NAME" --repo "$REPO" --body "https://layurl.com" >/dev/null
  echo "  var  BLINK_BASE_URL (default)"
fi

echo "Setting secrets …"
set_secret BLINK_PASSWORD
set_secret BLINK_API_KEY
set_secret BLINK_SESSION_SECRET
set_secret POSTGRES_PASSWORD
set_secret BLINK_TURNSTILE_SITE_KEY
set_secret BLINK_TURNSTILE_SECRET_KEY
set_secret CLOUDFLARE_API_TOKEN
set_secret CLOUDFLARE_ZONE_ID
set_secret CLOUDFLARE_ORIGIN_IPV4
set_secret CLOUDFLARE_ORIGIN_IPV6
# Optional / deploy (set_secret skips empty)
set_secret DEPLOY_HOST
set_secret DEPLOY_USER
set_secret DEPLOY_SSH_KEY
set_secret GHCR_PULL_TOKEN

echo "Bootstrap complete (values not printed)."
