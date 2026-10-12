#!/usr/bin/env bash
# Bootstrap GitHub secrets (if needed) and run Deploy workflow: Cloudflare apply + Compose.
# Usage:
#   ./deploy/scripts/ship-prod.sh              # apply + deploy
#   ./deploy/scripts/ship-prod.sh --dry-run    # Cloudflare dry-run only
#   IMAGE_TAG=v0.6.2 ./deploy/scripts/ship-prod.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/.env.production}"
DRY=0
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY=1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — copy .env.production.example and fill values." >&2
  exit 1
fi

# shellcheck disable=SC1091
source "$ROOT/deploy/scripts/load-env.sh" "$ENV_FILE"

REPO="${GITHUB_REPO:-}"
if [[ -z "$REPO" ]]; then
  REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || true)"
fi
if [[ -z "$REPO" ]]; then
  echo "Set GITHUB_REPO=owner/name or run inside the repo with gh." >&2
  exit 1
fi

IMAGE_TAG="${IMAGE_TAG:-${BLINK_IMAGE_TAG:-latest}}"

echo "Bootstrapping GitHub Environment from .env.production …"
bash "$ROOT/deploy/scripts/bootstrap-github-env.sh"

if [[ "$DRY" -eq 1 ]]; then
  echo "Triggering Deploy workflow (cloudflare=dry-run, deploy=false) …"
  gh workflow run deploy.yml --repo "$REPO" \
    -f cloudflare=dry-run \
    -f deploy=false \
    -f image_tag="$IMAGE_TAG"
else
  echo "Triggering Deploy workflow (cloudflare=apply, deploy=true, tag=$IMAGE_TAG) …"
  gh workflow run deploy.yml --repo "$REPO" \
    -f cloudflare=apply \
    -f deploy=true \
    -f image_tag="$IMAGE_TAG"
fi

echo "Waiting for workflow run to appear …"
sleep 3
RUN_ID="$(gh run list --repo "$REPO" --workflow=deploy.yml --limit 1 --json databaseId -q '.[0].databaseId')"
if [[ -z "$RUN_ID" || "$RUN_ID" == "null" ]]; then
  echo "Could not find Deploy workflow run." >&2
  exit 1
fi

echo "Watching run $RUN_ID …"
gh run watch "$RUN_ID" --repo "$REPO" --exit-status
echo "Ship complete."
