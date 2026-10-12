# GitHub Secrets for Blink production

**Source of truth for production credentials is GitHub** (repository secrets + Environment `production`). Local `.env` is for development only — never commit real secrets.

Flow: configure secrets → Actions **Deploy** workflow (Cloudflare dry-run / apply, Compose deploy) → origin pulls GHCR images with a rendered `.env`.

## Repository / Environment secrets

| Secret | Required for | Notes |
|--------|--------------|-------|
| `BLINK_PASSWORD` | Deploy | Admin password (plain; hashed at API startup) |
| `BLINK_API_KEY` | Deploy | API key for `X-API-Key` |
| `BLINK_SESSION_SECRET` | Deploy | Cookie signing |
| `POSTGRES_PASSWORD` | Deploy | Prod Postgres; used in `DATABASE_URL` |
| `BLINK_TURNSTILE_SITE_KEY` | Deploy (optional) | Public create |
| `BLINK_TURNSTILE_SECRET_KEY` | Deploy (optional) | Pair with site key |
| `CLOUDFLARE_API_TOKEN` | Cloudflare job | DNS + zone settings + cache rules |
| `CLOUDFLARE_ZONE_ID` | Cloudflare job | Zone id for layurl.com |
| `CLOUDFLARE_ORIGIN_IPV4` | Cloudflare job | Origin A record |
| `CLOUDFLARE_ORIGIN_IPV6` | Cloudflare job | Optional; apex + www AAAA |
| `DEPLOY_HOST` | Deploy | SSH host |
| `DEPLOY_USER` | Deploy | SSH user |
| `DEPLOY_SSH_KEY` | Deploy | Private key (PEM) |
| `GHCR_PULL_TOKEN` | Deploy (optional) | PAT if host cannot use `GITHUB_TOKEN` |

Store deploy + Cloudflare **apply** secrets on the **`production`** Environment. Enable required reviewers on that Environment so apply/deploy need approval.

## Environment variables (non-secret)

| Variable | Default | Notes |
|----------|---------|-------|
| `BLINK_BASE_URL` | `https://layurl.com` | Public origin |
| `BLINK_PUBLIC_MODE` | `false` | Unauthenticated create |
| `BLINK_TURNSTILE_FORCE` | `false` | Fail closed without Turnstile when true |
| `CLOUDFLARE_MANAGE_WWW` | `true` | Upsert www A/AAAA |
| `DEPLOY_PATH` | `~/url-shortener` | Remote compose directory |
| `HEALTHCHECK_URL` | `{BLINK_BASE_URL}/api/ready` | Post-deploy check |
| `BLINK_IMAGE_TAG` | workflow input | GHCR tag (`v0.6.0`, `latest`, …) |

## Workflow

Manual: **Actions → Deploy → Run workflow**

| Input | Purpose |
|-------|---------|
| `cloudflare` | `skip` \| `dry-run` \| `apply` (`apply` uses Environment `production`) |
| `deploy` | SSH + `docker compose` with [`docker-compose.prod.yml`](../docker-compose.prod.yml) |
| `image_tag` | GHCR tag to pull (rollback = prior `v*`) |

Local Cloudflare (with secrets in shell / `.env`):

```bash
npm run cloudflare:dry-run
npm run cloudflare:apply
```

Render `.env` on a runner or trusted host:

```bash
FORCE=1 ./deploy/scripts/render-env.sh .env
```

See also [CLOUDFLARE.md](CLOUDFLARE.md), [INSTALLATION.md](INSTALLATION.md), [ABUSE.md](ABUSE.md).
