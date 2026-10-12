# Enhancements backlog

Ideas beyond the shipped roadmap. Phases 0–4 complete; trust/ops hardening through **[v0.6.0](https://github.com/kyroskoh/url-shortener/releases/tag/v0.6.0)**. See [PRD.md](PRD.md) / [CHANGELOG.md](CHANGELOG.md).

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
| Candidate | Multi-admin: invite + role `admin`\|`viewer`; optional OIDC SSO (deferred from Phase 4 — single-admin retained) |
| Candidate | Webhook events beyond `hit`: `link.created`, `link.deleted`, `link.quarantined`, `link.limit_reached` / expired |
| Candidate | Instance stats API `GET /api/stats` (totals, hits today/7d, top slugs) + admin summary strip |
| Candidate | Webhook delivery status (last HTTP status / time / error) for operators |
| Candidate | CLI parity: `blink get`, `quarantine`, `hits` |
| Candidate | `active_at` / delayed activation in Advanced options |
| Candidate | Soft pause (disable redirects without abuse “quarantine” label) |
| Candidate | Duplicate-destination policy: optional block (not only warn) |
| Candidate | Docker Hub mirror of GHCR images |
| Candidate | Cloudflare cache purge helper (Actions input / script after quarantine or deploy) |
| Candidate | `BLINK_ABUSE_CONTACT` on “Link unavailable” page + ABUSE.md report path |
| Candidate | Deploy rollback runbook automation (workflow `image_tag` → prior `v*` / GHCR tag) |
| Candidate | First-party Google Safe Browsing client (generic HTTP URL-check provider remains) |
| Candidate | www → apex Cloudflare Bulk Redirect / rule |
| Candidate | Origin CA issuance automation (beyond [CLOUDFLARE.md](docs/CLOUDFLARE.md) manual gaps) |

## Deferred / won’t do (for now)

| Status | Idea | Notes |
|--------|------|-------|
| Won’t do | Geo / IP / UA analytics | PRD Phase 3 non-goal |
| Won’t do | Tracking pixels, marketing cookies | Product non-goals |
| Idea | Slack / Discord webhook presets, Zapier-style connectors | Prefer generic HMAC webhooks |
| Idea | A/B destinations, link trees, branded domains per link | Out of scope |
| Won’t do | Kubernetes operator, multi-region active-active | Phase 4 non-goals |
| Idea | Webhook retries / DLQ | Fire-and-forget until ops demand |
