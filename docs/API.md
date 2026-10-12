# Blink API

Base path (via nginx): `/api`. OpenAPI UI: `/api/docs`.

Auth (admin routes):

- Session cookie after `POST /api/auth/login`, or
- Header `X-API-Key: <key>`

Public create (when `BLINK_PUBLIC_MODE=true`) may omit auth; may require Turnstile token header/body field `turnstileToken`.

## Endpoints

### Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/healthz` | No | Liveness |
| GET | `/api/readyz` | No | Postgres + Redis ready |

### Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/login` | No | Body `{ "password" }` → sets session cookie |
| POST | `/api/auth/logout` | Session | Clears session |
| GET | `/api/auth/me` | Admin | Current auth status |

### Config (public subset)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/config` | No | Site title, public mode, Turnstile site key, base URL |

### Links

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/links` | Admin | List/filter `?q=` |
| GET | `/api/links/export.csv` | Admin | CSV export |
| POST | `/api/links` | Admin or public | Create `{ destination, slug?, notes?, expiresAt?, turnstileToken? }` |
| GET | `/api/links/:slug` | Admin | Get one |
| PATCH | `/api/links/:slug` | Admin | Update (destination, notes, expiresAt, status) |
| POST | `/api/links/:slug/status` | Admin | Body `{ "status": "active" \| "quarantined" }` |
| DELETE | `/api/links/:slug` | Admin | Delete |
| GET | `/api/links/:slug/qr` | Admin or owner flow | PNG/SVG QR for short URL |

Quarantined links keep the slug but redirects return branded **410 Link unavailable** (see [ABUSE.md](ABUSE.md)).

Duplicate destination: create response may include `warnings: ["duplicate_destination"]` with existing slug(s).

### Redirect (not under `/api`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/{slug}` | No | `302` to destination; `404`/`410` branded HTML |

Reserved slugs never redirect (handled as app routes or 404).

## Errors

JSON `{ "error": "code", "message": "..." }` with appropriate HTTP status (`400`, `401`, `404`, `409`, `410`, `429`).

## Rate limits

Redis-backed; keyed by `CF-Connecting-IP` or `X-Forwarded-For` first hop / peer. Exceeding limit → `429`.
