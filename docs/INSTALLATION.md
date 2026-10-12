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

Also: `logs`, `status`, `restart`, `down`. Or raw Compose: `docker compose up --build`.

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
| `BLINK_URL_CHECK_BLOCKLIST_PATH` | empty | Host blocklist file |
| `BLINK_URL_CHECK_HTTP_URL` | empty | External URL check endpoint |
| `BLINK_PREVIEW_TTL_SEC` | `3600` | Destination preview Redis TTL |
| `BLINK_WEBHOOK_URL` | empty | Hit webhook POST URL (off when empty) |
| `BLINK_WEBHOOK_SECRET` | empty | HMAC secret for `X-Blink-Signature` |
| `BLINK_IDEMPOTENCY_TTL_SEC` | `86400` | Create `Idempotency-Key` Redis TTL |
| `BLINK_LANDING_PAGE` | empty | In-container path to custom HTML for `/` |
| `DATABASE_URL` | compose default | Postgres |
| `REDIS_URL` | compose default | Redis |

Cloudflare provisioner vars: see [CLOUDFLARE.md](CLOUDFLARE.md).

## Migrations

The API runs Drizzle migrations on startup. To roll back a bad deploy: restore a Postgres volume snapshot or dump taken before the migration (see Phase 4 backup scripts in the PRD). Do not delete migration files that have been applied in production.

## Reverse proxy

Compose includes **nginx** (`deploy/nginx.conf`):

- `/` → `api` `site-home` (custom landing file or `302` to `/admin/`)
- `/admin/` → `web:80` (Vite SPA; path prefix stripped)
- `/api/` → `api:3000`
- `/{slug}` short paths → `api` redirect handler (`/r/:slug`)

### Custom landing page

1. Set `BLINK_LANDING_PAGE=/data/landing.html` on the `api` service
2. Mount a file, e.g. `./deploy/landing.example.html:/data/landing.html:ro`
3. Restart Compose — `/` serves that HTML; admin UI remains at `/admin/`

UI timestamps (created / last hit / expires) use month abbreviations (MMM) and show both UTC and local time.

Trusts `CF-Connecting-IP` / `X-Forwarded-For` when behind Cloudflare.

## Production checklist

1. Strong `BLINK_PASSWORD`, `BLINK_API_KEY`, `BLINK_SESSION_SECRET`
2. `BLINK_BASE_URL=https://layurl.com`
3. Run origin with Compose; open 80/443 only as needed
4. [CLOUDFLARE.md](CLOUDFLARE.md) — provision DNS, Full (strict), cache bypass
5. Enable Turnstile if public mode is on; use `BLINK_TURNSTILE_FORCE=true` for public instances
6. Consider URL blocklist (`deploy/blocklist.example.txt`) — see [ABUSE.md](ABUSE.md)
7. Regular Postgres backups (Phase 4 scripts when implemented; until then `pg_dump`)

## Resource expectations

Node-based images are larger than chhoto-url’s scratch/alpine Rust images. Expect tens to low hundreds of MB RAM for the full stack under light load — not &lt;10 MB. Optimize later if needed.
