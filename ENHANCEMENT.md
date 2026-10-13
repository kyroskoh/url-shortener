# Enhancements backlog & implementation roadmap

Phases 0–4 complete; production line through **[v0.6.5](https://github.com/kyroskoh/url-shortener/releases/tag/v0.6.5)** (beta). See [PRD.md](PRD.md) / [CHANGELOG.md](CHANGELOG.md).

**Versioning:** do **not** publish v0.7–v0.9. Ship **Phases 5a + 5b + 5c → v1.0.0** (first official / out of beta), then 1.1+ for later phases. Post-ship bugfixes → **patch** bumps on that line; re-run the verify gate before tagging. Intermediate beta patches (e.g. **v0.6.5**) may ship 5a/5b before GA.

**Per-phase gate (mandatory):** `npm test` · `npm run typecheck` · relevant e2e/smoke · short acceptance checklist. Do not advance phases until green.

---

## Agent handoff — current status

| Phase | Target | Status | Notes for next agent |
|-------|--------|--------|----------------------|
| **5a** | → v1.0.0 | **Done** ([v0.6.5](https://github.com/kyroskoh/url-shortener/releases/tag/v0.6.5)) | CLI/stats/abuse contact/bulk template |
| **5b** | → v1.0.0 | **Done** ([v0.6.5](https://github.com/kyroskoh/url-shortener/releases/tag/v0.6.5)) | Pause / `active_at` / duplicate policy / bulk timezones; apply migrate `0004` on deploy |
| **5c** | → v1.0.0 | **Not started** | Webhooks 2.0 — next coding slice toward GA |
| **GA** | **v1.0.0** | Blocked on 5c | Tag + beta→stable docs after 5c gate |
| **6** | v1.1.0 | Planned | Multi-admin, API keys, audit, session revoke |
| **7** | v1.2.0 | Planned | Public accounts + Social SSO + linking |
| **8** | v1.3.0 | Planned | Safe Browsing, CF purge, www→apex |
| **9** | v1.4.0 | Planned | Docker Hub, rollback automation, Origin CA |

**Deploy note:** apply migration `apps/api/drizzle/0004_lifecycle.sql` (`active_at`) before relying on pause / delayed activation in prod.

**Cursor plan (full detail):** `.cursor/plans/enhancement_backlog_roadmap_*.plan.md` — treat this file as the operator-facing summary; the plan has API/UI/file-level specs.

---

## Shipped earlier (not open)

### Phase 3

- Hourly hit aggregates + admin chart (`GET /api/links/:slug/hits`)
- Hit webhooks with `X-Blink-Signature` HMAC-SHA256
- Idempotent create (`Idempotency-Key`)
- Cursor pagination on `GET /api/links`
- OpenAPI-aligned `@blink/client` + `blink` CLI
- Prometheus `/metrics`
- Per-link `maxHits` (edit may only increase or clear)

### Through v0.6.5

- Phase 4 ops (backups, GHCR, E2E); trust/ops harden; admin login + mobile UI
- Phase 5a + 5b shipped in [v0.6.5](https://github.com/kyroskoh/url-shortener/releases/tag/v0.6.5)

---

## Phase 5a — Quick wins (**Done** in v0.6.5, part of v1.0.0)

### Acceptance (verified)

- [x] `blink get` / `quarantine` / `hits` CLI + client `get` / `setStatus`
- [x] Admin `GET /api/stats` + summary strip in admin UI
- [x] `BLINK_ABUSE_CONTACT` on quarantined/expired branded pages; [docs/ABUSE.md](docs/ABUSE.md)
- [x] Bulk import Load/Download template + [docs/examples/bulk-import.csv](docs/examples/bulk-import.csv) + [docs/API.md](docs/API.md)
- [x] `npm test -w @blink/api` + `npm run typecheck`

### Key files

- `packages/cli/src/cli.ts`, `packages/client/src/index.ts`
- `apps/api/src/links.ts` (`getInstanceStats`), `routes.ts` (`GET /stats`)
- `apps/api/src/branded-pages.ts`, `config.ts` (`abuseContact`)
- `apps/web/src/App.tsx` (stats strip, bulk import UX), `styles.css`
- `.env.example` — `BLINK_ABUSE_CONTACT`

---

## Phase 5b — Link lifecycle (**Done** in v0.6.5, part of v1.0.0)

### Scope

| Item | Intent | Implementation notes |
|------|--------|----------------------|
| Soft pause | `status`: `active` \| `paused` \| `quarantined` | Branded paused page `410`; admin Pause/Resume |
| `active_at` | Delayed activation | Column + create/edit UI; redirect `not_yet_active` until time |
| Duplicate policy | `BLINK_DUPLICATE_DESTINATION=warn\|block` | Default `warn`; `block` → 409 |
| Edit parity | Edit `expiresAt` + `activeAt` | Clear with null/empty |
| Bulk import | Columns + non-ISO dates + timezone | See below |

### Bulk import columns (order)

`slug,destination,notes,expires_at,active_at,timezone,max_hits`

- **Dates:** ISO-8601, `YYYY-MM-DD`, `YYYY-MM-DD HH:mm:ss`, unix epoch; reject ambiguous `MM/DD`/`DD/MM`
- **`timezone`:** `UTC` (default), `Local` (API host), abbreviations (`SGT`, …), or IANA (`Asia/Singapore`) — table in `@blink/shared` `IMPORT_TIMEZONE_REFERENCE`; admin **Timezone ?** hover next to Load/Download template
- **No `status` in CSV** (pause/quarantine stay admin actions)

### Key files (already touched)

- Migration: `apps/api/drizzle/0004_lifecycle.sql`
- `apps/api/src/db/schema.ts`, `links.ts`, `routes.ts`, `branded-pages.ts` (`pausedPage`, `notYetActivePage`), `import-csv.ts`
- `packages/shared` — `paused` status, `activeAt`, `import-timezones.ts`
- `apps/web` — pause UI, activeAt create/edit, timezone tip, `@blink/shared` dependency
- `.env.example` / INSTALLATION — `BLINK_DUPLICATE_DESTINATION`

### Acceptance (verified)

- [x] Soft pause + branded paused page; admin Pause/Resume
- [x] `active_at` column + create/edit + `not_yet_active` redirect path
- [x] `BLINK_DUPLICATE_DESTINATION` warn/block
- [x] Bulk import dates + timezone column; unit tests + typecheck green
- [ ] Operator: apply `0004_lifecycle.sql` on deploy / smoke paused & not-yet-active in target env

---

## Phase 5c — Webhooks 2.0 (**Not started**, part of v1.0.0)

### Scope

1. **Events beyond `hit`:** `link.created`, `link.deleted`, `link.quarantined`, `link.paused`, `link.limit_reached`, `link.expired` — generalize `apps/api/src/webhooks.ts`; keep HMAC + fire-and-forget
2. **`BLINK_WEBHOOK_EVENTS`** — comma allowlist; empty = all
3. **Delivery status** — Redis `blink:webhook:last` `{ event, at, httpStatus, ok, error?, slug? }`; admin `GET /api/webhooks/status`; optional one-line UI near stats strip

### Key files to touch

- `apps/api/src/webhooks.ts`, `webhooks.test.ts`, call sites in `links.ts` / status routes
- `apps/api/src/config.ts`, `routes.ts`, `redis.ts`
- Docs: API.md, INSTALLATION, `.env.example`

---

## v1.0.0 — Official GA cut

After 5a–5c gates green:

1. Tag **v1.0.0**; GHCR publish
2. CHANGELOG “First official release”; README/PRD beta → stable
3. Update this file: 5a–5c **Done**; point to 1.1+ backlog

---

## Phase 6 — Multi-admin (v1.1.0)

**Not started.** OIDC deferred (enterprise IdP → Future consideration).

| Work | Notes |
|------|-------|
| `operators` table | email, role `admin`\|`viewer`, invite token, `session_version` |
| Bootstrap | Empty operators → keep env `BLINK_PASSWORD`; env `BLINK_API_KEY` = break-glass |
| Invite / accept | Admin invite; accept sets password |
| RBAC | Viewer read-only; admin full |
| **`api_keys` table** | Per-account keys (admin/operator); plaintext once; revoke |
| **Audit log** | `audit_events`; `GET /api/audit` |
| **Session revoke** | Bump `session_version` on password/role/revoke |
| UI | Email login when multi-admin; Operators + API keys panels |

Migration sketch: `0005_operators.sql` (+ `api_keys`).

---

## Phase 7 — Public accounts + dual-path create (v1.2.0)

**Not started.** Depends on Phase 6 session patterns.

### Create paths (both when flags on)

1. **Anonymous** — `BLINK_PUBLIC_MODE` + Turnstile → unowned link (no self-manage)
2. **Account** — register/login → owned links + **My links**

### Account signup (either / both)

| Method | Details |
|--------|---------|
| **Basic** | Username and/or email + strong password (min 12, letter+number, denylist); Argon2 |
| **Social SSO** | Passport: Google + GitHub when env client id/secret set |

### Account linking (bidirectional)

- Basic → Connect Google/GitHub (`intent=link`)
- Social → Set password (+ email/username if needed)
- Auto-link Social login when email matches local user
- Unlink / remove password only if another login method remains
- Conflicts → 409

### Also

- Member API keys (`owner_kind=user`)
- **Turnstile when rate-limited** for account actors (session/personal key); env break-glass key **exempt**
- Flags: `BLINK_PUBLIC_ACCOUNTS`, `BLINK_AUTH_LOCAL`, OAuth env vars
- Tables: `users`, `user_identities`, `links.owner_user_id`
- Routes: `/register`, `/login` (reserved slugs exist)

---

## Phase 8 — Trust and edge (v1.3.0)

**Not started.**

| Item | Notes |
|------|-------|
| Google Safe Browsing | `BLINK_URL_CHECK_PROVIDER=safebrowsing` + API key; extend `url-check.ts` |
| CF cache purge | `deploy/scripts/cloudflare-purge.mjs`; deploy.yml `purge` input |
| www → apex | Provisioner Dynamic/Bulk Redirect when `CLOUDFLARE_MANAGE_WWW` |

---

## Phase 9 — Supply chain (v1.4.0)

**Not started.**

| Item | Notes |
|------|-------|
| Docker Hub mirror | CI push after GHCR; soft-skip if secrets missing |
| Deploy rollback | `rollback` input → previous `v*` tag |
| Origin CA automation | `cloudflare-origin-ca.mjs` + docs; keep Let’s Encrypt path |

---

## Future consideration

Not in Phases 5–9. Revisit when demand justifies.

| Status | Idea | Notes |
|--------|------|-------|
| Idea | Enterprise OIDC for operators (generic IdP) | Phase 6 password invite; Phase 7 Passport social ≠ full OIDC |
| Idea | Email verification + password-reset mail | Needs SMTP |
| Idea | Webhook retries / DLQ | Fire-and-forget until ops demand |
| Candidate | Outbound webhook HTTP timeout + circuit silence | Still no full DLQ |
| Candidate | Scheduled Postgres backup cron / off-host copy | Scripts exist (Phase 4) |
| Candidate | Prometheus gauges mirroring instance stats | e.g. `blink_links_total{status=}` |
| Idea | Public-create destination allowlist | Inverse of blocklist |
| Idea | Slack / Discord / Zapier presets | Prefer generic HMAC webhooks |
| Idea | A/B destinations, link trees, branded domains | Product expansion |
| Idea | SaaS billing / orgs | PRD non-goal |
| Idea | Claim anonymous slug into a user account | Out of Phase 7 |

## Won’t do (for now)

| Status | Idea | Notes |
|--------|------|-------|
| Won’t do | Geo / IP / UA analytics | PRD Phase 3 non-goal |
| Won’t do | Tracking pixels, marketing cookies | Product non-goals |
| Won’t do | Kubernetes operator, multi-region active-active | Phase 4 non-goals |

---

## Suggested next-agent sequence

1. **Implement Phase 5c** — webhooks events + filter + Redis status (file list above); unit tests + typecheck.
2. **Operator smoke** — ensure prod/staging ran `0004_lifecycle.sql` after v0.6.5 deploy.
3. **GA v1.0.0** — CHANGELOG/README/PRD + tag (only after 5c verified).
4. Continue **6 → 7 → 8 → 9** per sections above; keep Future consideration out of scope unless reprioritized.

---

## Acknowledgments

- Inspired by [chhoto-url](https://github.com/SinTan1729/chhoto-url)
- Live at [layurl.com](https://layurl.com)
- Community feedback and contributions

## Support

- Issues: [GitHub Issues](https://github.com/kyroskoh/url-shortener/issues)
- Discussions: [GitHub Discussions](https://github.com/kyroskoh/url-shortener/discussions)

---

Made with ❤️ by [Kyros Koh](https://github.com/kyroskoh)
