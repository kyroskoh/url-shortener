# Installation

## Requirements

- Docker Engine + Docker Compose v2
- For production: a VPS, domain **layurl.com** on Cloudflare

## Local

```bash
cp .env.example .env
# Edit secrets: BLINK_PASSWORD, BLINK_API_KEY, BLINK_SESSION_SECRET
```

Helper scripts (create `.env` from `.env.example` on first `start` if missing):

| Platform | Start | Stop | Rebuild |
|----------|-------|------|---------|
| Linux / macOS | `./scripts/docker.sh start` | `./scripts/docker.sh stop` | `./scripts/docker.sh rebuild` |
| Windows | `.\scripts\docker.ps1 start` | `.\scripts\docker.ps1 stop` | `.\scripts\docker.ps1 rebuild` |

Also: `logs`, `status`, `restart`, `down`, `backup`, `restore`. Or raw Compose: `docker compose up --build`.

| URL | Service |
|-----|---------|
| http://localhost/ | Custom landing if `BLINK_LANDING_PAGE` set; else `302` → `/admin/` |
| http://localhost/admin/ | Web UI (nginx → web) |
| http://localhost/api/ | API (nginx → api) |
| http://localhost/api/docs | OpenAPI UI |
| http://localhost/api/health | Liveness |
| http://localhost/api/ready | Readiness |
| http://localhost/api/metrics | Prometheus scrape |
| http://localhost/{slug} | Redirect (nginx → api) |

Data volumes: `blink_pg_data`, `blink_redis_data`.

### Prebuilt images (GHCR)

CI publishes on `v*` tags:

- `ghcr.io/<github-owner>/blink-api:<tag>`
- `ghcr.io/<github-owner>/blink-web:<tag>`

Compose in this repo builds from source by default. To use prebuilt images, set `image:` on the `api` / `web` services (and remove or keep `build:` as you prefer) after authenticating to GHCR if the packages are private.

## Environment

All app settings use the `BLINK_*` prefix. See [`.env.example`](../.env.example).

| Variable | Default | Notes |
|----------|---------|-------|
| `BLINK_BASE_URL` | `http://localhost` | No trailing slash; use `https://layurl.com` in prod |
| `BLINK_SITE_TITLE` | `Blink` | UI title |
| `BLINK_PASSWORD` | — | Plain or Argon2 hash |
| `BLINK_API_KEY` | — | Plain or Argon2 hash; send as `X-API-Key` |
| `BLINK_PUBLIC_MODE` | `false` | Unauthenticated create |
| `BLINK_DISABLE_FRONTEND` | `false` | API/redirects only |
| `BLINK_EXTRA_PROTOCOLS` | empty | Comma-separated extras |
| `BLINK_SLUG_LENGTH` | `8` | Random slug length |
| `BLINK_RATE_LIMIT_MAX` | `120` | Per window |
| `BLINK_RATE_LIMIT_WINDOW_SEC` | `60` | Window length |
| `BLINK_CACHE_TTL_SEC` | `300` | Redis redirect TTL |
| `BLINK_SESSION_SECRET` | — | Cookie signing |
| `BLINK_TURNSTILE_SITE_KEY` | empty | Optional |
| `BLINK_TURNSTILE_SECRET_KEY` | empty | Optional |
| `BLINK_TURNSTILE_FORCE` | `false` | Require Turnstile on public create |
| `BLINK_URL_CHECK_PROVIDER` | `none` | `none` \| `blocklist` \| `http` |
| `BLINK_URL_CHECK_BLOCKLIST_PATH` | empty | Host blocklist file (matches host + subdomains) |
| `BLINK_URL_CHECK_HTTP_URL` | empty | External URL check endpoint |
| `BLINK_URL_CHECK_HTTP_TIMEOUT_MS` | `5000` | HTTP provider timeout (fail closed) |
| `BLINK_PREVIEW_TTL_SEC` | `3600` | Destination preview Redis TTL |
| `BLINK_WEBHOOK_URL` | empty | Hit webhook POST URL (off when empty) |
| `BLINK_WEBHOOK_SECRET` | empty | HMAC secret for `X-Blink-Signature` |
| `BLINK_IDEMPOTENCY_TTL_SEC` | `86400` | Create `Idempotency-Key` Redis TTL |
| `BLINK_LANDING_PAGE` | empty | In-container path to custom HTML for `/` |
| `DATABASE_URL` | compose default | Postgres |
| `REDIS_URL` | compose default | Redis |

Cloudflare provisioner vars: see [CLOUDFLARE.md](CLOUDFLARE.md). Production secrets and Deploy workflow: [GITHUB_SECRETS.md](GITHUB_SECRETS.md).

## Migrations

The API runs Drizzle migrations on startup. To roll back a bad deploy: restore a Postgres dump taken before the migration (see [Backups](#postgres-backups)). Do not delete migration files that have been applied in production.

## Postgres backups

Scripts write **custom-format** `pg_dump` files under `./backups/` (gitignored). Redis is **not** backed up — redirect cache, rate limits, and sessions are rebuildable.

```bash
# From repo root (stack must be running)
./deploy/scripts/backup-postgres.sh
# or: ./scripts/docker.sh backup

# Restore (destructive — requires confirm)
CONFIRM_RESTORE=1 ./deploy/scripts/restore-postgres.sh backups/blink-YYYYMMDD-HHMMSS.dump
# then: ./scripts/docker.sh restart api
```

On Windows, use Git Bash or WSL for the `.sh` scripts, or `.\scripts\docker.ps1 backup` / `restore` (invokes bash and passes `CONFIRM_RESTORE` into WSL when needed):

```powershell
.\scripts\docker.ps1 backup
$env:CONFIRM_RESTORE = "1"
.\scripts\docker.ps1 restore backups/blink-YYYYMMDD-HHMMSS.dump
```

### Restore drill

1. Create a known short link in the admin UI (note the slug).
2. Run `./deploy/scripts/backup-postgres.sh` and keep the printed path.
3. Delete the link (or quarantine it) in the UI / API.
4. `CONFIRM_RESTORE=1 ./deploy/scripts/restore-postgres.sh <dump>` then restart API.
5. Confirm the slug redirects again and appears in the admin list.

Optional env: `BACKUP_DIR` overrides the output directory (default `./backups`).

## Reverse proxy

**Local Compose** includes container nginx ([`deploy/nginx.conf`](../deploy/nginx.conf)) on port 80.

**Production** (existing host nginx): Compose nginx is disabled. API/web bind `127.0.0.1:3000` / `127.0.0.1:8080`. Install [`deploy/nginx.blink-layurl.com.conf`](../deploy/nginx.blink-layurl.com.conf) as `/etc/nginx/.../zz-blink-layurl.com.conf` via `deploy/scripts/install-host-nginx.sh` (also run by `ops:ship`). That vhost listens on **80 and 443** when TLS cert paths resolve (`BLINK_SSL_CERT` / `BLINK_SSL_KEY` or auto-detect).

Routing (both configs):

- `/` → `api` `site-home` (custom landing file or `302` to `/admin/`)
- `/admin/` → web (Vite SPA; path prefix stripped)
- `/api/` → api
- `/{slug}` short paths → api redirect handler (`/r/:slug`)

If Docker is missing on the origin, deploy runs [`deploy/scripts/ensure-docker.sh`](../deploy/scripts/ensure-docker.sh) (`curl https://get.docker.com | sh`).

### Custom landing page

1. Set `BLINK_LANDING_PAGE=/data/landing.html` on the `api` service
2. Mount a file, e.g. `./deploy/landing.example.html:/data/landing.html:ro`
3. Restart Compose — `/` serves that HTML; admin UI remains at `/admin/`

UI timestamps (created / last hit / expires) use month abbreviations (MMM) and show both UTC and local time.

Trusts `CF-Connecting-IP` / `X-Forwarded-For` when behind Cloudflare.

## Production ship (automated)

```bash
cp .env.production.example .env.production
# fill secrets; prefer DEPLOY_SSH_KEY_FILE=/path/to/key

gh auth login   # once, if needed
npm run ops:ship   # or: npm run ops:cf-dry-run first
```

Details: [GITHUB_SECRETS.md](GITHUB_SECRETS.md). Irreducible once: Cloudflare zone/NS, SSH host (Docker is auto-installed via get.docker.com; host nginx must already exist for prod).

## Production checklist

1. Follow [Production ship](#production-ship-automated) above
2. Publish images via `v*` tag CI → GHCR before shipping a new tag
3. [CLOUDFLARE.md](CLOUDFLARE.md) — provisioner runs inside `ops:ship` (DNS, Full strict, cache bypass)
4. Enable Turnstile if public mode is on; set keys + `BLINK_TURNSTILE_FORCE=true` in `.env.production`
5. Consider URL blocklist (`deploy/blocklist.example.txt`) — see [ABUSE.md](ABUSE.md)
6. Regular Postgres backups — see [Postgres backups](#postgres-backups)

## Resource expectations

Node-based images are larger than chhoto-url’s scratch/alpine Rust images. Expect tens to low hundreds of MB RAM for the full stack under light load — not &lt;10 MB. Optimize later if needed.
