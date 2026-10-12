# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.1.0]: https://github.com/kyroskoh/url-shortener/releases/tag/v0.1.0
