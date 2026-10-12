# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Prod origin: `ensure-docker.sh` (get.docker.com), host nginx [`deploy/nginx.blink-layurl.com.conf`](deploy/nginx.blink-layurl.com.conf) as `zz-blink-layurl.com.conf`, **certbot** [`ensure-letsencrypt.sh`](deploy/scripts/ensure-letsencrypt.sh) for `layurl.com`/`www` (reuse existing certbot; do not reuse other site certs); Compose nginx off (API/web on `127.0.0.1:3000` / `:8080`)

## [0.6.1] — 2026-10-12

### Added

- README release badge (shields.io → latest GitHub release)
- Zero-click ops: `.env.production.example`, `deploy/scripts/bootstrap-github-env.sh`, `ship-prod.sh`, `scripts/ops.sh` / `ops.ps1`, npm `ops:bootstrap` / `ops:ship` / `ops:cf-dry-run`
- Deploy workflow: fail-closed when secrets missing; clone compose tree on origin if absent

### Changed

- CI: run tests on pull requests; full test + GHCR publish only on `v*` tags (no duplicate pipeline on `main` push)
- [docs/GITHUB_SECRETS.md](docs/GITHUB_SECRETS.md) / INSTALLATION: one-command production ship

## [0.6.0] — 2026-10-12

### Added

- Secrets-backed production path: [docs/GITHUB_SECRETS.md](docs/GITHUB_SECRETS.md), `deploy/scripts/render-env.sh`, `docker-compose.prod.yml` (GHCR images + `POSTGRES_PASSWORD`)
- GitHub Actions **Deploy** workflow: Cloudflare dry-run/apply, SSH Compose deploy, post-deploy `/api/ready` health check; `apply`/deploy gated on Environment `production`
- Cloudflare provisioner helpers + unit tests (`deploy/scripts/cloudflare-lib.mjs`); npm `cloudflare:dry-run` / `cloudflare:apply`
- Admin status filter and quarantined badge; Turnstile token gate, expired/error callbacks, reset after failed create
- URL check: parent-domain blocklist matching, HTTP provider timeout (`BLINK_URL_CHECK_HTTP_TIMEOUT_MS`), HTTP provider unit tests

### Fixed

- CI typecheck: build `@blink/shared` / `@blink/client` before consumers (fixes missing `dist` / `@blink/client` on clean `npm ci`)
- Cloudflare provisioner upserts www **AAAA** when IPv6 + `CLOUDFLARE_MANAGE_WWW`
- Quarantine / expired HTML responses send `Cache-Control: no-store`

### Changed

- Bump Actions `checkout` / `setup-node` to v5
- Expanded [docs/ABUSE.md](docs/ABUSE.md) / [docs/CLOUDFLARE.md](docs/CLOUDFLARE.md); deferred ops ideas listed in [ENHANCEMENT.md](ENHANCEMENT.md)

## [0.5.0] — 2026-10-12

### Added

- Phase 4 ops and scale: Postgres backup/restore scripts (`deploy/scripts/backup-postgres.sh`, `restore-postgres.sh`) with restore drill in [docs/INSTALLATION.md](docs/INSTALLATION.md)
- Docker helper commands `backup` / `restore` in `scripts/docker.sh` and `scripts/docker.ps1`
- GitHub Actions CI: typecheck, unit tests, Compose + Playwright E2E; GHCR publish of `blink-api` / `blink-web` on `v*` tags
- Playwright E2E suite (`e2e/`): login, create, redirect, quarantine, expiry

### Changed

- Multi-admin / OIDC deferred to [ENHANCEMENT.md](ENHANCEMENT.md); single-admin (env password + API key) retained (PRD P4-R3 amendment)
- Image publish target is GHCR only (Docker Hub deferred)

## [0.4.2] — 2026-10-12

### Added

- Docker helpers: `scripts/docker.sh` (Linux/macOS), `scripts/docker.ps1` / `scripts/docker.cmd` (Windows) for `start` / `stop` / `rebuild` / `logs` / `status` / `restart` / `down`

### Changed

- Hits chart: x-axis labels every 2 UTC hours; hover/focus tooltip with hour + hit count and bar highlight

## [0.4.1] — 2026-10-12

### Changed

- Hits panel: 24-hour UTC bar chart with last-24h / lifetime / peak stats (replaces sparse line chart)
- QR codes hidden by default; **Show QR** / **Hide QR** toggle and **Download PNG** (`blink-{slug}.png`)

## [0.4.0] — 2026-10-12

### Added

- Phase 3 analytics and integrations: hourly `hit_aggregates`, admin Hits chart, `GET /api/links/:slug/hits`
- Optional per-link `maxHits` (max redirects) in Advanced options; edit may only increase or clear
- Hit webhooks via `BLINK_WEBHOOK_URL` / `BLINK_WEBHOOK_SECRET` with `X-Blink-Signature` HMAC-SHA256
- Idempotent create with `Idempotency-Key` (Redis TTL `BLINK_IDEMPOTENCY_TTL_SEC`)
- Cursor pagination on `GET /api/links?cursor=&limit=` (`nextCursor`); admin Load more
- Prometheus `GET /api/metrics` (`blink_redirects_total`, `blink_cache_hits_total`, `blink_cache_misses_total`)
- `@blink/client` typed client + `blink` CLI (`create` / `list` / `delete`)
- [ENHANCEMENT.md](ENHANCEMENT.md) backlog for post–Phase 3 ideas
- Expanded reserved slugs (product paths, auth/signup keywords, probes)
- Slug charset enforcement: letters, numbers, hyphen, underscore only

### Changed

- Liveness `/api/healthz` → `/api/health`; readiness `/api/readyz` → `/api/ready` (legacy names remain reserved)

### Verified

- Local compose rebuild + `npm run smoke` + `blink` CLI create against localhost

## [0.3.1] — 2026-10-12

### Fixed

- Destination preview no longer fails hard on upstream non-2xx (e.g. 404); parses HTML/`og:title` when present and falls back to hostname + favicon
- One-time checkbox layout in create Advanced options and edit form (was stretched by full-width input styles)

## [0.3.0] — 2026-10-12

### Added

- Phase 2 product depth: optional UTM fields on create (merged into destination)
- Admin destination preview (`GET /api/links/:slug/preview`) with Redis cache and SSRF guards
- Bulk CSV import (`POST /api/links/import?dryRun=`) with dry-run validation
- Tags and folders (CRUD + list filters `?tag=` / `?folder=`)
- Per-link password gate (Argon2) and unlock form before redirect
- One-time (burn-after-read) links deleted after first successful redirect
- Custom landing via `BLINK_LANDING_PAGE`; admin UI moved to `/admin/`
- Smoke coverage for UTM, one-time, password unlock, import dry-run, and `/` → `/admin/`

## [0.2.0] — 2026-10-12

### Added

- Phase 1 trust & abuse: link `status` (`active` / `quarantined`), Quarantine / Re-enable in admin UI
- `POST /api/links/:slug/status` and status field on link update/list/CSV export
- Optional URL check providers (`none` | `blocklist` | `http`) on create/edit
- `BLINK_TURNSTILE_FORCE` for public create; fail closed when forced without keys
- Branded “Link unavailable” page for quarantined slugs; Redis cache cleared on status change
- [docs/ABUSE.md](docs/ABUSE.md) operator playbook; `deploy/blocklist.example.txt`
- Smoke coverage for quarantine → 410 → re-enable → redirect

## [0.1.0] — 2026-10-12

### Added

- Phase 0 MVP: Blink URL shortener for layurl.com (Fastify, React, Postgres, Redis, nginx)
- Short links with random/custom slugs, expiry, notes, filter, edit, delete
- Privacy-respecting hit counts and last-hit timestamp
- Link timestamps shown with month abbreviation (MMM) plus both **UTC** and **local** time
- Redis redirect cache and rate limiting (Cloudflare-aware client IP)
- Admin password + API key auth; public create mode; Turnstile when configured
- Reserved slugs, dangerous scheme rejection, branded 404/410 pages
- QR codes, CSV export, OpenAPI docs, health endpoints
- Docker Compose stack and Cloudflare provisioner (`--dry-run` / `--apply`)
- Product documentation: PRD (Phases 0–4), README, INSTALLATION, CLOUDFLARE, API

### Security

- Dependency updates: `drizzle-orm` ≥0.45.2, `@fastify/swagger-ui` 6.x, Vite 6.4.4
- Removed locked `drizzle-kit` (use `npx drizzle-kit@0.31.11 generate` when needed) to drop nested vulnerable `esbuild` / `@esbuild-kit` chain
- `npm audit`: 0 vulnerabilities

[0.6.1]: https://github.com/kyroskoh/url-shortener/releases/tag/v0.6.1
[0.6.0]: https://github.com/kyroskoh/url-shortener/releases/tag/v0.6.0
[0.5.0]: https://github.com/kyroskoh/url-shortener/releases/tag/v0.5.0
[0.4.2]: https://github.com/kyroskoh/url-shortener/releases/tag/v0.4.2
[0.4.1]: https://github.com/kyroskoh/url-shortener/releases/tag/v0.4.1
[0.4.0]: https://github.com/kyroskoh/url-shortener/releases/tag/v0.4.0
[0.3.1]: https://github.com/kyroskoh/url-shortener/releases/tag/v0.3.1
[0.3.0]: https://github.com/kyroskoh/url-shortener/releases/tag/v0.3.0
[0.2.0]: https://github.com/kyroskoh/url-shortener/releases/tag/v0.2.0
[0.1.0]: https://github.com/kyroskoh/url-shortener/releases/tag/v0.1.0
