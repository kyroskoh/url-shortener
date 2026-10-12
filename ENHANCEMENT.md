# Enhancements backlog

Ideas beyond the shipped roadmap. Phase 0–3 (through **v0.4.2**) are implemented in-repo; Phase 4 remains in [PRD.md](PRD.md).

## Shipped in Phase 3 (not open)

- Hourly hit aggregates + admin chart (`GET /api/links/:slug/hits`)
- Hit webhooks with `X-Blink-Signature` HMAC-SHA256
- Idempotent create (`Idempotency-Key`)
- Cursor pagination on `GET /api/links`
- OpenAPI-aligned `@blink/client` + `blink` CLI
- Prometheus `/metrics`
- Per-link `maxHits` (edit may only increase or clear)

## Recommended next

| Status | Idea |
|--------|------|
| Candidate | Webhook events beyond `hit`: `link.created`, `link.deleted`, `link.quarantined`, `link.limit_reached` / expired |
| Candidate | Instance stats API `GET /api/stats` (totals, hits today/7d, top slugs) + admin summary strip |
| Candidate | Webhook delivery status (last HTTP status / time / error) for operators |
| Candidate | CLI parity: `blink get`, `quarantine`, `hits` |
| Candidate | `active_at` / delayed activation in Advanced options |
| Candidate | Soft pause (disable redirects without abuse “quarantine” label) |
| Candidate | Duplicate-destination policy: optional block (not only warn) |

## Phase 4 (see PRD)

| Status | Idea |
|--------|------|
| Planned | Postgres backup / restore scripts + restore drill docs |
| Planned | CI + GHCR / Docker Hub publish on version tag |
| Planned | Playwright (or equivalent) E2E suite |
| Decide | Multi-admin / OIDC — only if still needed (default single-admin) |

## Deferred / won’t do (for now)

| Status | Idea | Notes |
|--------|------|-------|
| Won’t do | Geo / IP / UA analytics | PRD Phase 3 non-goal |
| Won’t do | Tracking pixels, marketing cookies | Product non-goals |
| Idea | Slack / Discord webhook presets, Zapier-style connectors | Prefer generic HMAC webhooks |
| Idea | A/B destinations, link trees, branded domains per link | Out of scope |
| Won’t do | Kubernetes operator, multi-region active-active | Phase 4 non-goals |
| Idea | Webhook retries / DLQ | Fire-and-forget until ops demand |
