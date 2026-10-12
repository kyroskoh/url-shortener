# PRD — Blink (layurl.com)

## Outcome

Ship **Blink**, a self-hosted URL shortener hosted publicly as **[layurl.com](https://layurl.com)**. Operators run it via Docker Compose (nginx, API, web, Postgres, Redis). Short links look like `https://layurl.com/{slug}`.

Inspired by [chhoto-url](https://github.com/SinTan1729/chhoto-url), rebuilt on Node.js with a fresh UI and Redis-backed performance.

| | |
|---|---|
| **Product** | Blink |
| **Host** | layurl.com |
| **Repo** | url-shortener |
| **Owner** | Operator / maintainer of this repository |
| **Success evidence** | Phase 0 ([v0.1.0](https://github.com/kyroskoh/url-shortener/releases/tag/v0.1.0)); Phase 1 ([v0.2.0](https://github.com/kyroskoh/url-shortener/releases/tag/v0.2.0)); Phase 2 ([v0.3.0](https://github.com/kyroskoh/url-shortener/releases/tag/v0.3.0)); Phases 3–4 remain implementable from this PRD |
| **Current phase** | Phase 2 complete ([v0.3.0](https://github.com/kyroskoh/url-shortener/releases/tag/v0.3.0)); next is **Phase 3 — Analytics and integrations** |

## Problem

Most URL shorteners are bloated, hard to self-host, or lack essentials (custom slugs, expiry, hit counts, API). Rust/SQLite options like chhoto-url are excellent but do not match a Node.js + Redis + Cloudflare ops stack. We need a privacy-respecting shortener with a distinctive UI, Docker-first deploy, and a clear multi-phase roadmap.

## Scope

### In scope (this repository)

- Phase 0 application (MVP) + documentation + Cloudflare provisioner — **done** ([v0.1.0](https://github.com/kyroskoh/url-shortener/releases/tag/v0.1.0))
- Phase 1 trust/abuse features — **done**
- Phase 2 product depth — **done**
- Full specifications for Phases 3–4 product features (this document; Phase 3 is next to implement)

### Non-goals (all phases)

- Tracking pixels, marketing cookies, newsletter popups
- Paywalls or ads
- Matching chhoto-url binary size / RAM footprint (Node is heavier; documented honestly)
- Multi-tenant SaaS billing

## System and architecture boundary

```
Browser/API client → Cloudflare (DNS + TLS) → nginx → web (Vite/React) | api (Fastify)
                                                              ↓
                                                    Postgres + Redis
```

| Service | Role |
|---------|------|
| `web` | Admin and public UI |
| `api` | REST, redirects, auth |
| `postgres` | Durable link storage |
| `redis` | Redirect cache, rate limits, sessions |
| `nginx` | Reverse proxy |
| Cloudflare | Edge DNS/TLS for layurl.com |

**Data model:** `links` (slug, destination, notes, hits, last_hit_at, expires_at, **status** `active`\|`quarantined`, created_at, updated_at). Auth via env-hashed admin password + API key (Argon2). Settings via env (`BLINK_*`).

**Redirect path:** `GET /:slug` → Redis → Postgres miss-fill → `302`; missing → branded `404`; expired → branded `410`; **quarantined → branded unavailable page**. Hits incremented without storing IP/UA. Rate limits key on `CF-Connecting-IP` when present.

---

## Phase 0 — MVP (complete — v0.1.0)

### Goal

Runnable Docker Compose stack with create/redirect/admin, Redis cache, nginx, Cloudflare runbook + API provisioner, Blink-branded UI on layurl.com.

### Dependencies

None (greenfield).

### Functional requirements

1. Create short links with random or custom slug; edit, delete, filter by slug/URL/notes.
2. Instant `302` redirect; no interstitial.
3. Optional expiry; branded `410` when expired; branded `404` when missing.
4. Privacy-respecting hit count + `last_hit_at`.
5. QR code for a short link.
6. Admin password session (HttpOnly cookie) + `X-API-Key`.
7. Public mode: create without auth; list/delete require admin.
8. Custom site title; optional disable frontend.
9. Protocol allowlist: `http`, `https`, `ftp`, `magnet` + `BLINK_EXTRA_PROTOCOLS`.
10. Reserved slugs blocked (`api`, `admin`, `healthz`, app paths, etc.).
11. Reject dangerous schemes (`javascript:`, `data:`, etc.) even if protocols widened.
12. Redis redirect cache + Redis rate limiting (CF-Connecting-IP aware).
13. OpenAPI at `/docs`; `/healthz`, `/readyz`; structured JSON logs.
14. CSV export (admin).
15. Turnstile on public create when `BLINK_TURNSTILE_*` set; skip when unset.
16. Copy/share on create; warn when destination already has a slug.
17. Drizzle migrate-on-start; rollback documented.
18. Cloudflare provisioner (`--dry-run` / `--apply`) for DNS, SSL Full (strict), cache bypass for redirects; manual checklist when API insufficient.

### Acceptance criteria

- [x] `docker compose up --build` serves UI via nginx on localhost
- [x] Admin can create/edit/delete/filter links; redirect is instant
- [x] Second redirect for same slug hits Redis cache
- [x] Reserved slug and dangerous scheme rejected
- [x] Branded 404 and 410 HTML pages render
- [x] Public create works without Turnstile when keys unset; fails without token when keys set
- [x] Rate limit returns `429` when threshold exceeded
- [x] Hit count updates without persisting IP/UA
- [x] `cloudflare-provision.mjs --dry-run` lists planned changes; API gaps print dashboard paths
- [x] README alone suffices for local run

### Verification

- Compose smoke script: create → redirect → reserved reject → expiry 410 → auth reject — **passed**
- Manual: Turnstile keys set/unset behavior
- Manual: provisioner dry-run with token (operator)
- Release: [v0.1.0](https://github.com/kyroskoh/url-shortener/releases/tag/v0.1.0)

---

## Implementing Phase 1–4 product features

Phases **0–2** are complete. Phase **3** is the active implementation target. Phase **4** remains fully specified below for later passes without re-discovery.

---

## Phase 1 — Trust and abuse (complete)

### Goal

Reduce spam and malicious short links on a public layurl.com instance while keeping privacy defaults.

### Dependencies

Phase 0 complete ([v0.1.0](https://github.com/kyroskoh/url-shortener/releases/tag/v0.1.0)).

### In-scope features

1. Optional malware/phishing URL check hook (blocklist file and/or Safe Browsing–style HTTP provider)
2. Link disable / quarantine (keep slug; stop redirect; admin re-enable)
3. Turnstile UX polish + `BLINK_TURNSTILE_FORCE=true` for public instances
4. Abuse playbook documentation (report bad links, rotate API key, quarantine workflow)

### Functional requirements

| ID | Requirement |
|----|-------------|
| P1-R1 | `links.status` enum: `active` \| `quarantined`; default `active` |
| P1-R2 | Quarantined slugs return branded 410/403 page (not destination); admin can set status via API/UI |
| P1-R3 | `BLINK_URL_CHECK_PROVIDER=none\|blocklist\|http`; blocklist path or HTTP endpoint configurable |
| P1-R4 | On create/edit, if check fails, reject with clear error; never store destination as active |
| P1-R5 | When `BLINK_TURNSTILE_FORCE=true`, public create requires valid Turnstile even in “dev” |
| P1-R6 | `docs/ABUSE.md` describes report path, quarantine, key rotation |

### Acceptance criteria

- [x] Admin quarantines a link → public redirect no longer reaches destination
- [x] Admin re-enables → redirect works again; Redis cache invalidated
- [x] With blocklist containing a host, create to that host fails
- [x] Force Turnstile rejects public create without token (keys missing + FORCE, or missing token when keys set)
- [x] Abuse playbook exists and matches UI labels ([docs/ABUSE.md](docs/ABUSE.md))

### Non-goals (Phase 1)

- Full user reporting portal with accounts
- Automatic legal takedown workflows

### Verification

- API / unit tests for URL blocklist; compose smoke includes quarantine → 410 → re-enable → 302
- Manual: set `BLINK_TURNSTILE_FORCE=true` without keys and confirm public create fails

---

## Phase 2 — Product depth (complete)

### Goal

Power-user link management and richer create flows without becoming a marketing suite.

### Dependencies

Phase 0 (and Phase 1 status field recommended for one-time/disabled interplay).

### In-scope features

1. UTM builder on create (optional query params; not end-user tracking)
2. Admin destination preview / unfurl (title + favicon; Redis-cached)
3. Bulk import; tags; folders
4. Per-link password; one-time (burn-after-read) links
5. Custom landing page file mount

### Functional requirements

| ID | Requirement |
|----|-------------|
| P2-R1 | Create accepts optional `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`; applied to destination URL safely |
| P2-R2 | `GET /api/links/:slug/preview` fetches title/favicon once; cache in Redis with TTL; admin-only |
| P2-R3 | Bulk import CSV (slug, destination, notes, expires_at); dry-run validation mode |
| P2-R4 | Tags (many-to-many) and folders (optional parent); filter list by tag/folder |
| P2-R5 | Optional `link_password` (Argon2); redirect gate page before 302 |
| P2-R6 | `one_time=true` deletes or burns link after first successful redirect |
| P2-R7 | Mount path `BLINK_LANDING_PAGE` serves custom HTML at `/` when set (overrides default UI home) |

### Acceptance criteria

- [x] UTM fields append to destination without breaking existing query strings
- [x] Preview returns title for a known HTML fixture; second call is cache hit
- [x] Bulk import dry-run reports row errors without writing; apply writes valid rows
- [x] Tag/folder filters return correct subsets
- [x] Password-protected link prompts then redirects; wrong password fails
- [x] One-time link works once then 404/410
- [x] Custom landing page served when env set (admin UI at `/admin/`; `/` → landing or redirect)

### Non-goals (Phase 2)

- Visual page builder
- A/B testing of destinations

### Verification

- Unit tests for UTM merge; import dry-run; preview SSRF rejects — **passed**
- Compose smoke: UTM redirect, one-time burn, password unlock, import dry-run, `/` → `/admin/` — **passed**
- Release: [v0.3.0](https://github.com/kyroskoh/url-shortener/releases/tag/v0.3.0)

---

## Phase 3 — Analytics and integrations

### Goal

Aggregated analytics and machine-friendly integrations without PII.

### Dependencies

Phase 0 redirects/hits; Phase 2 pagination helpful for large lists.

### In-scope features

1. Aggregated click time-series dashboard (no PII)
2. Webhooks on hit + HMAC signing
3. Idempotent create (`Idempotency-Key`)
4. Cursor pagination on link list
5. OpenAPI-generated typed client; CLI client
6. Prometheus metrics

### Functional requirements

| ID | Requirement |
|----|-------------|
| P3-R1 | Store hourly (or daily) hit aggregates per slug — counts only, no IP/UA |
| P3-R2 | Admin UI chart for selected slug + API `GET /api/links/:slug/hits?from&to` |
| P3-R3 | Webhook URL config; POST JSON on hit with `X-Blink-Signature` HMAC-SHA256 |
| P3-R4 | Create with `Idempotency-Key` returns same link on retry within TTL |
| P3-R5 | `GET /api/links?cursor=&limit=` cursor pagination; deprecate unbounded dump |
| P3-R6 | Published typed client from OpenAPI; `blink` CLI for create/list/delete |
| P3-R7 | `/metrics` Prometheus: `blink_redirects_total`, `blink_cache_hits_total`, `blink_cache_misses_total` |

### Acceptance criteria

- [ ] After N redirects, time-series points match N within aggregation window
- [ ] Webhook delivered with valid HMAC; invalid secret rejected by test consumer
- [ ] Idempotent create does not duplicate slugs
- [ ] Pagination walks full set without duplicates/skips
- [ ] CLI creates a link against local compose
- [ ] Prometheus scrape shows counters incrementing

### Non-goals (Phase 3)

- Geo/IP analytics
- Third-party ad pixels

### Verification

- Contract tests for webhooks/HMAC; load smoke for pagination; metrics scrape check

---

## Phase 4 — Ops and scale

### Goal

Production operability: backups, optional multi-admin, published images, E2E.

### Dependencies

Phases 0–3 for full E2E surface; Phase 0 sufficient for backups/CI of MVP.

### In-scope features

1. Postgres backup / restore scripts (versioned dumps)
2. Multi-admin roles / SSO **only if still needed** — default remains single-admin; justify before building
3. CI + Docker Hub / GHCR publish
4. Full E2E browser suite

### Functional requirements

| ID | Requirement |
|----|-------------|
| P4-R1 | `deploy/scripts/backup-postgres.sh` and `restore-postgres.sh` with timestamped dumps |
| P4-R2 | Document restore drill; backup does not include Redis (rebuildable) |
| P4-R3 | If multi-admin approved: invite + role `admin`\|`viewer`; SSO via OIDC optional |
| P4-R4 | GitHub Actions: test, build, push images on tag |
| P4-R5 | Playwright (or equivalent) E2E: login, create, redirect, quarantine, expiry |

### Acceptance criteria

- [ ] Backup + restore round-trip preserves links
- [ ] CI green on main; images published on version tag
- [ ] E2E suite passes against compose
- [ ] If multi-admin skipped, PRD amendment records single-admin decision

### Non-goals (Phase 4)

- Kubernetes operator
- Multi-region active-active

### Verification

- Restore drill in staging; CI logs; E2E report artifact

---

## Cloudflare live ops (Phase 0 requirement)

### Automate via API (`deploy/scripts/cloudflare-provision.mjs`)

- Upsert proxied DNS for apex/`www`
- Zone SSL **Full (strict)**, Always Use HTTPS, min TLS 1.2
- Cache rule: do not edge-cache short-link redirects
- `--dry-run` then `--apply`; refuse without `CLOUDFLARE_API_TOKEN`

### Manual when API is not enough (must be listed with dashboard paths)

| Gap | Operator action |
|-----|-----------------|
| Zone not in CF / NS at registrar | Add site in Cloudflare; change NS at registrar (API cannot set registrar NS) |
| Turnstile widget | Create at Turnstile dashboard → paste keys into `BLINK_TURNSTILE_*` |
| Full (strict) needs HTTPS origin | Install Origin CA on nginx or terminate TLS on origin |
| Plan-gated / token denied | Dashboard: SSL/TLS → Overview; Caching → Cache Rules; DNS → Records |
| Stale edge | Caching → Configuration → Purge Everything (or prefix) |

## Risks and dependencies

| Risk | Mitigation |
|------|------------|
| Open redirect / malware links | Scheme allowlist, reserved slugs, Phase 1 URL check + quarantine |
| Redis/Postgres data loss | Postgres volumes + Phase 4 backups; Redis ephemeral OK |
| Cloudflare API drift | Dry-run + manual checklist |
| Node heavier than Rust shortener | Document resource expectations in README |

## Assumptions

- Single admin is enough until Phase 4 decides otherwise
- Production domain is layurl.com; local uses `http://localhost`
- Operator owns Cloudflare zone and can create API tokens

## Rollout

1. Phase 0: local compose → staging origin → Cloudflare provisioner apply → layurl.com
2. Phases 1–4: implement per this PRD in order; do not skip Phase 1 before public open create at scale
