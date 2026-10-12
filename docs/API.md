# Blink API

Base path (via nginx): `/api`. OpenAPI UI: `/api/docs`.

Admin UI: `/admin/` (home `/` redirects there unless `BLINK_LANDING_PAGE` is set).

Auth (admin routes):

- Session cookie after `POST /api/auth/login`, or
- Header `X-API-Key: <key>`

Public create (when `BLINK_PUBLIC_MODE=true`) may omit auth; may require Turnstile token header/body field `turnstileToken`.

## Endpoints

### Health & metrics

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/health` | No | Liveness |
| GET | `/api/ready` | No | Postgres + Redis ready |
| GET | `/api/metrics` | No | Prometheus text (`blink_redirects_total`, `blink_cache_hits_total`, `blink_cache_misses_total`) |

### Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/login` | No | Body `{ "password" }` → sets session cookie |
| POST | `/api/auth/logout` | Session | Clears session |
| GET | `/api/auth/me` | Admin | Current auth status |

### Config (public subset)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/config` | No | Site title, public mode, Turnstile, `adminPath`, `customLanding` |

### Tags & folders

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/tags` | Admin | List tags |
| POST | `/api/tags` | Admin | Body `{ "name" }` |
| DELETE | `/api/tags/:id` | Admin | Delete tag |
| GET | `/api/folders` | Admin | List folders |
| POST | `/api/folders` | Admin | Body `{ "name", "parentId?" }` |
| DELETE | `/api/folders/:id` | Admin | Delete folder |

### Links

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/links` | Admin | List/filter `?q=` `?tag=` `?folder=` `?cursor=` `?limit=` (default 50, max 100) → `{ links, nextCursor }` |
| GET | `/api/links/export.csv` | Admin | CSV export (walks all pages) |
| POST | `/api/links/import` | Admin | CSV body (`text/plain` or `{ csv }`); `?dryRun=true` validates without writing |
| POST | `/api/links` | Admin or public | Create (see body below); optional header `Idempotency-Key` |
| GET | `/api/links/:slug` | Admin | Get one |
| GET | `/api/links/:slug/preview` | Admin | Title + favicon (Redis-cached); SSRF-safe. Soft-handles upstream non-2xx (parses HTML when present; else hostname fallback) |
| GET | `/api/links/:slug/hits` | Admin | Hourly hit series `?from=` `?to=` (ISO) → `{ points: [{ t, hits }] }` |
| PATCH | `/api/links/:slug` | Admin | Update fields including password / tags / folder / `maxHits` |
| POST | `/api/links/:slug/status` | Admin | Body `{ "status": "active" \| "quarantined" }` |
| DELETE | `/api/links/:slug` | Admin | Delete |
| GET | `/api/links/:slug/qr` | Admin | PNG QR for short URL |

**Create body**

```json
{
  "destination": "https://example.com/path?ref=1",
  "slug": "optional",
  "notes": null,
  "expiresAt": null,
  "turnstileToken": "optional",
  "utmSource": "newsletter",
  "utmMedium": "email",
  "utmCampaign": "spring",
  "utmTerm": null,
  "utmContent": null,
  "password": "optional-gate-password",
  "oneTime": false,
  "maxHits": null,
  "tagNames": ["docs"],
  "tagIds": [],
  "folderId": null
}
```

Slugs are letters, numbers, hyphen, and underscore only (`[A-Za-z0-9_-]{1,64}`).

UTM fields are merged into the stored destination at create time (existing query keys kept; provided `utm_*` overwrite).

`maxHits` (optional integer ≥ 1): after that many successful redirects the link returns branded **410** (slug kept). On update, a finite `maxHits` may only be **increased** or cleared to `null` (unlimited)—never decreased.

Link DTO includes `hasPassword`, `oneTime`, `maxHits`, `folderId`, `tags[]` (never returns password hash).

Quarantined links keep the slug but redirects return branded **410 Link unavailable** (see [ABUSE.md](ABUSE.md)).

Duplicate destination: create response may include `warnings: ["duplicate_destination"]`.

**Idempotency:** send `Idempotency-Key: <string>` on create; retries within `BLINK_IDEMPOTENCY_TTL_SEC` return the same link (`200` on replay).

**Bulk import CSV columns:** `slug,destination,notes,expires_at`

### Webhooks

When `BLINK_WEBHOOK_URL` is set, each successful redirect POSTs JSON:

```json
{ "event": "hit", "slug": "abc", "at": "2026-10-12T00:00:00.000Z", "shortUrl": "https://layurl.com/abc" }
```

If `BLINK_WEBHOOK_SECRET` is set, header `X-Blink-Signature: sha256=<hmac-sha256-hex>` is included. Delivery is fire-and-forget (does not block redirects).

### Redirect (not under `/api`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/{slug}` | No | `302` to destination; `404`/`410` branded HTML; password gate when set |
| POST | `/api/r/:slug/unlock` | No | Form/JSON `{ password }` → gate cookie + redirect |
| GET | `/` | No | Custom landing HTML if `BLINK_LANDING_PAGE` set; else `302` → `/admin/` |

Password-protected, one-time, and `maxHits`-limited links are not Redis destination-cached. One-time links are deleted after the first successful `302`.

Reserved slugs never redirect (handled as app routes or 404).

## Errors

JSON `{ "error": "code", "message": "..." }` with appropriate HTTP status (`400`, `401`, `404`, `409`, `410`, `429`).

## Rate limits

Redis-backed; keyed by `CF-Connecting-IP` or `X-Forwarded-For` first hop / peer. Exceeding limit → `429`.
