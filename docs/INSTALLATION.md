# Installation

## Requirements

- Docker Engine + Docker Compose v2
- For production: a VPS, domain **layurl.com** on Cloudflare

## Local

```bash
cp .env.example .env
# Edit secrets: BLINK_PASSWORD, BLINK_API_KEY, BLINK_SESSION_SECRET
docker compose up --build
```

| URL | Service |
|-----|---------|
| http://localhost/ | Web UI (nginx → web) |
| http://localhost/api/ | API (nginx → api) |
| http://localhost/api/docs | OpenAPI UI |
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
| `DATABASE_URL` | compose default | Postgres |
| `REDIS_URL` | compose default | Redis |

Cloudflare provisioner vars: see [CLOUDFLARE.md](CLOUDFLARE.md).

## Migrations

The API runs Drizzle migrations on startup. To roll back a bad deploy: restore a Postgres volume snapshot or dump taken before the migration (see Phase 4 backup scripts in the PRD). Do not delete migration files that have been applied in production.

## Reverse proxy

Compose includes **nginx** (`deploy/nginx.conf`):

- `/api/` → `api:3000`
- `/` static UI → `web:80` (built assets served by nginx in the web container)
- `/{slug}` short paths → `api` redirect handler (`/r/:slug`)

UI timestamps (created / last hit / expires) use month abbreviations (MMM) and show both UTC and local time.

Trusts `CF-Connecting-IP` / `X-Forwarded-For` when behind Cloudflare.

## Production checklist

1. Strong `BLINK_PASSWORD`, `BLINK_API_KEY`, `BLINK_SESSION_SECRET`
2. `BLINK_BASE_URL=https://layurl.com`
3. Run origin with Compose; open 80/443 only as needed
4. [CLOUDFLARE.md](CLOUDFLARE.md) — provision DNS, Full (strict), cache bypass
5. Enable Turnstile if public mode is on
6. Regular Postgres backups (Phase 4 scripts when implemented; until then `pg_dump`)

## Resource expectations

Node-based images are larger than chhoto-url’s scratch/alpine Rust images. Expect tens to low hundreds of MB RAM for the full stack under light load — not &lt;10 MB. Optimize later if needed.
