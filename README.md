# Blink

**Short links. Instant redirects.**

Blink is a self-hosted URL shortener for **[layurl.com](https://layurl.com)** — Node.js, Postgres, Redis, nginx, and Cloudflare. Inspired by [chhoto-url](https://github.com/SinTan1729/chhoto-url), with a fresh UI and Redis-backed redirects.

> GitHub repository name: `url-shortener`. Product name: **Blink**. Current release: **[v0.6.0](https://github.com/kyroskoh/url-shortener/releases/tag/v0.6.0)**.

## Quick start

```bash
cp .env.example .env
# set BLINK_PASSWORD, BLINK_API_KEY, BLINK_SESSION_SECRET
```

**Linux / macOS / Git Bash**

```bash
./scripts/docker.sh start      # up -d --build
./scripts/docker.sh stop       # stop containers
./scripts/docker.sh rebuild    # rebuild + recreate
./scripts/docker.sh logs       # follow logs
./scripts/docker.sh backup     # Postgres dump → ./backups/
```

**Windows (PowerShell or cmd)**

```powershell
.\scripts\docker.ps1 start
.\scripts\docker.ps1 stop
.\scripts\docker.ps1 rebuild
.\scripts\docker.ps1 logs
.\scripts\docker.ps1 backup    # needs Git Bash for .sh scripts
# or: scripts\docker.cmd start
```

Or raw Compose: `docker compose up --build`.

Open [http://localhost/admin/](http://localhost/admin/) (nginx). Root `/` redirects to `/admin/` unless a custom landing page is configured. API OpenAPI: [http://localhost/api/docs](http://localhost/api/docs).

Default local admin password/API key come from `.env` (change before any public deploy).

## Features

- Random or custom short slugs · expiry · notes · filter/edit/delete
- Instant `302` redirects · Redis cache · privacy-respecting hit counts
- Timestamps with **MMM** month names, shown in **UTC and local** time
- Password + API key auth · optional public create · Turnstile when configured
- Reserved slugs · dangerous scheme blocking · branded 404/410
- **Phase 1:** quarantine / re-enable · optional URL blocklist/HTTP check · Turnstile force-on · [abuse playbook](docs/ABUSE.md)
- **Phase 2:** UTM builder · destination preview · bulk CSV import · tags/folders · per-link password · one-time links · custom landing page (`BLINK_LANDING_PAGE`)
- **Phase 3:** hourly hit charts · max redirects · HMAC webhooks · idempotent create · cursor pagination · Prometheus `/api/metrics` · `@blink/client` + `blink` CLI
- **Phase 4:** Postgres backup/restore · GitHub Actions CI + GHCR images · Playwright E2E
- **v0.6.0:** Phase 1 / Cloudflare harden · Secrets-backed Deploy workflow · prod Compose/GHCR overlay
- QR codes (show/hide + PNG download) · CSV export · Docker Compose · Cloudflare DNS/SSL/cache provisioner

Ideas beyond the roadmap: [ENHANCEMENT.md](ENHANCEMENT.md).

## CI and images

On push/PR to `main`: typecheck (builds workspace packages first), unit tests, and Playwright E2E against Compose. On `v*` tags: publish `ghcr.io/<owner>/blink-api` and `blink-web` (version tag + `latest`). Manual **Deploy** workflow: Cloudflare dry-run/apply + SSH Compose from GHCR using [GitHub Secrets](docs/GITHUB_SECRETS.md). Local Compose still builds from Dockerfiles; prod overlay: `docker-compose.prod.yml`.

## Backups

```bash
./deploy/scripts/backup-postgres.sh
CONFIRM_RESTORE=1 ./deploy/scripts/restore-postgres.sh backups/blink-YYYYMMDD-HHMMSS.dump
```

Redis is not included (rebuildable). Restore drill: [docs/INSTALLATION.md](docs/INSTALLATION.md#postgres-backups).

## E2E

With the stack running (`./scripts/docker.sh start`):

```bash
npx playwright install chromium   # once
npm run test:e2e
```

## CLI

```bash
npm run build -w @blink/client -w @blink/cli
BLINK_BASE_URL=http://localhost BLINK_API_KEY=changeme-api-key \
  node packages/cli/dist/cli.js create https://example.com --slug demo
```

## Stack

| Service | Tech |
|---------|------|
| API | Fastify, Drizzle, Postgres |
| Cache / limits | Redis |
| Web | React, Vite (served at `/admin/`) |
| Proxy | nginx |
| Edge | Cloudflare (layurl.com) |

## Configuration

See [`.env.example`](.env.example) and [docs/INSTALLATION.md](docs/INSTALLATION.md). Important vars:

| Variable | Purpose |
|----------|---------|
| `BLINK_BASE_URL` | Public origin for displayed short links (`https://layurl.com` in prod) |
| `BLINK_PASSWORD` / `BLINK_API_KEY` | Admin auth |
| `BLINK_PUBLIC_MODE` | Allow create without login |
| `BLINK_TURNSTILE_*` | Optional bot protection on public create |
| `BLINK_LANDING_PAGE` | Optional path to custom HTML for `/` |
| `BLINK_WEBHOOK_URL` / `BLINK_WEBHOOK_SECRET` | Optional hit webhooks + HMAC |
| `CLOUDFLARE_*` | Provisioner for DNS/SSL/cache |

## Production (layurl.com)

1. Point origin at your VPS and run Compose
2. Follow [docs/CLOUDFLARE.md](docs/CLOUDFLARE.md) — `node deploy/scripts/cloudflare-provision.mjs --dry-run` then `--apply`
3. Set `BLINK_BASE_URL=https://layurl.com`

## Docs

- [PRD.md](PRD.md) — product requirements (Phases 0–4)
- [ENHANCEMENT.md](ENHANCEMENT.md) — backlog beyond the PRD
- [docs/INSTALLATION.md](docs/INSTALLATION.md)
- [docs/CLOUDFLARE.md](docs/CLOUDFLARE.md)
- [docs/API.md](docs/API.md)
- [docs/ABUSE.md](docs/ABUSE.md)
- [CHANGELOG.md](CHANGELOG.md)
- [CONTRIBUTING.md](CONTRIBUTING.md)

## License

[MIT](LICENSE.md)
