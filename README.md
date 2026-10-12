# Blink

**Short links. Instant redirects.**

Blink is a self-hosted URL shortener for **[layurl.com](https://layurl.com)** — Node.js, Postgres, Redis, nginx, and Cloudflare. Inspired by [chhoto-url](https://github.com/SinTan1729/chhoto-url), with a fresh UI and Redis-backed redirects.

> GitHub repository name: `url-shortener`. Product name: **Blink**.

## Quick start

```bash
cp .env.example .env
# set BLINK_PASSWORD, BLINK_API_KEY, BLINK_SESSION_SECRET
docker compose up --build
```

Open [http://localhost](http://localhost) (nginx). API OpenAPI: [http://localhost/api/docs](http://localhost/api/docs).

Default local admin password/API key come from `.env` (change before any public deploy).

## Features (Phase 0)

- Random or custom short slugs · expiry · notes · filter/edit/delete
- Instant `302` redirects · Redis cache · privacy-respecting hit counts
- Timestamps with **MMM** month names, shown in **UTC and local** time
- Password + API key auth · optional public create · Turnstile when configured
- Reserved slugs · dangerous scheme blocking · branded 404/410
- **Phase 1:** quarantine / re-enable · optional URL blocklist/HTTP check · Turnstile force-on · [abuse playbook](docs/ABUSE.md)
- QR codes · CSV export · Docker Compose · Cloudflare DNS/SSL/cache provisioner

Phases 2–4 (UTM, webhooks, backups, …) are specified in [PRD.md](PRD.md).

## Stack

| Service | Tech |
|---------|------|
| API | Fastify, Drizzle, Postgres |
| Cache / limits | Redis |
| Web | React, Vite |
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
| `CLOUDFLARE_*` | Provisioner for DNS/SSL/cache |

## Production (layurl.com)

1. Point origin at your VPS and run Compose
2. Follow [docs/CLOUDFLARE.md](docs/CLOUDFLARE.md) — `node deploy/scripts/cloudflare-provision.mjs --dry-run` then `--apply`
3. Set `BLINK_BASE_URL=https://layurl.com`

## Docs

- [PRD.md](PRD.md) — product requirements (Phases 0–4)
- [docs/INSTALLATION.md](docs/INSTALLATION.md)
- [docs/CLOUDFLARE.md](docs/CLOUDFLARE.md)
- [docs/API.md](docs/API.md)
- [docs/ABUSE.md](docs/ABUSE.md)
- [CHANGELOG.md](CHANGELOG.md)
- [CONTRIBUTING.md](CONTRIBUTING.md)

## License

[MIT](LICENSE.md)
