# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.3.0]: https://github.com/kyroskoh/url-shortener/releases/tag/v0.3.0
[0.2.0]: https://github.com/kyroskoh/url-shortener/releases/tag/v0.2.0
[0.1.0]: https://github.com/kyroskoh/url-shortener/releases/tag/v0.1.0
