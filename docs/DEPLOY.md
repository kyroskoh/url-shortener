# Deploy

Step-by-step deploy for **local**, **staging**, and **production**. Config reference: [INSTALLATION.md](INSTALLATION.md). Secrets inventory: [GITHUB_SECRETS.md](GITHUB_SECRETS.md). Edge DNS/SSL: [CLOUDFLARE.md](CLOUDFLARE.md).

| Environment | Edge | Images | Secrets |
|-------------|------|--------|---------|
| Local | Compose nginx `:80` | Build from Dockerfiles | `.env` (from `.env.example`) |
| Staging | Host nginx (or Compose nginx) | GHCR tag or local build | Host `.env` (not production secrets) |
| Production | Cloudflare → host nginx + Let's Encrypt | GHCR (`v*` / `latest`) | GitHub Environment `production` via `.env.production` |

---

## Local

### Prerequisites

- Docker Engine + Docker Compose v2
- Git (Windows: Git Bash or WSL for `.sh` helpers)

### Steps

1. Clone and configure:

   ```bash
   cp .env.example .env
   # Edit: BLINK_PASSWORD, BLINK_API_KEY, BLINK_SESSION_SECRET
   # Keep BLINK_BASE_URL=http://localhost (no trailing slash)
   ```

2. Start the stack:

   | Platform | Command |
   |----------|---------|
   | Linux / macOS / Git Bash | `./scripts/docker.sh start` |
   | Windows PowerShell | `.\scripts\docker.ps1 start` |

   Equivalent: `docker compose up -d --build`.

3. Verify:

   | URL | Expect |
   |-----|--------|
   | http://localhost/api/health | Liveness |
   | http://localhost/api/ready | Readiness |
   | http://localhost/admin/ | Web UI |
   | http://localhost/api/docs | OpenAPI |

4. Optional checks:

   ```bash
   npm run smoke
   npx playwright install chromium   # once
   npm run test:e2e                  # stack must be up
   ```

5. Day-to-day:

   | Action | Linux / macOS | Windows |
   |--------|---------------|---------|
   | Logs | `./scripts/docker.sh logs` | `.\scripts\docker.ps1 logs` |
   | Rebuild | `./scripts/docker.sh rebuild` | `.\scripts\docker.ps1 rebuild` |
   | Stop | `./scripts/docker.sh stop` | `.\scripts\docker.ps1 stop` |
   | Backup Postgres | `./scripts/docker.sh backup` | `.\scripts\docker.ps1 backup` |

Local uses Compose nginx ([`deploy/nginx.conf`](../deploy/nginx.conf)). Do **not** run `install-host-nginx.sh` or certbot on a laptop unless you intentionally want host TLS.

### Local without Docker (dev)

```bash
# Postgres + Redis available; DATABASE_URL / REDIS_URL in .env
npm ci
npm run build -w @blink/shared -w @blink/client
npm run dev
```

API and Vite web run separately; nginx routing from Compose does not apply.

---

## Staging

Staging proves the **production Compose overlay** (GHCR images, localhost-bound API/web, host nginx) without touching **layurl.com** or the GitHub `production` Environment.

There is no separate GitHub Environment named `staging`. Use a staging host (or a non-prod path on the same VPS) and a staging hostname (e.g. `staging.layurl.com` or an IP).

### Prerequisites (once)

- Staging host with SSH and **nginx** installed
- Docker optional — first deploy can run [`ensure-docker.sh`](../deploy/scripts/ensure-docker.sh)
- A published GHCR tag (`v*` from CI) **or** build on the host from source
- Staging DNS (optional): A/AAAA → staging origin; Cloudflare orange-cloud only if you want edge TLS there

### Option A — GHCR images (closest to prod)

1. On your machine, publish or pick a tag (CI on `v*` tags publishes `blink-api` / `blink-web`).

2. On the staging host, clone or sync the repo and create a **staging** `.env` (never copy production passwords):

   ```bash
   # On staging host
   git clone https://github.com/kyroskoh/url-shortener.git ~/url-shortener-staging
   cd ~/url-shortener-staging
   cp .env.example .env
   # Set strong unique secrets:
   #   BLINK_PASSWORD, BLINK_API_KEY, BLINK_SESSION_SECRET, POSTGRES_PASSWORD
   #   BLINK_BASE_URL=https://staging.layurl.com   # or http://STAGING_IP
   #   GHCR_OWNER=kyroskoh
   #   BLINK_IMAGE_TAG=v0.6.5                      # or latest
   #   BLINK_LETSENCRYPT_EMAIL=you@example.com     # if using certbot on this host
   ```

3. Install Docker if needed, then host nginx + TLS for the **staging** hostname:

   ```bash
   chmod +x deploy/scripts/ensure-docker.sh deploy/scripts/ensure-letsencrypt.sh deploy/scripts/install-host-nginx.sh
   ./deploy/scripts/ensure-docker.sh
   ```

   Adapt [`deploy/nginx.blink-layurl.com.conf`](../deploy/nginx.blink-layurl.com.conf) (server_name + SSL paths) for your staging hostname, **or** temporarily use Compose nginx (Option B) if you skip host TLS.

   If the hostname is already in DNS and HTTP reaches origin `:80`:

   ```bash
   # After adjusting nginx conf for staging.layurl.com (cert name / server_name):
   ./deploy/scripts/install-host-nginx.sh "$(pwd)/deploy/nginx.blink-layurl.com.conf"
   ```

   Certbot issues a **separate** lineage (default name `layurl.com` in the script — for staging, set `BLINK_LETSENCRYPT_CERT_NAME=staging.layurl.com` and edit `server_name` in the nginx conf before install). Do **not** reuse production or unrelated certs (e.g. `api.kyroskoh.xyz`).

4. Pull and start with the prod overlay:

   ```bash
   echo "$GHCR_TOKEN" | docker login ghcr.io -u YOUR_GITHUB_USER --password-stdin
   set -a && source .env && set +a
   docker compose -f docker-compose.yml -f docker-compose.prod.yml pull
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
   ```

5. Verify:

   ```bash
   curl -sf "$BLINK_BASE_URL/api/ready"
   # Open $BLINK_BASE_URL/admin/
   ```

### Option B — Compose nginx on staging (simpler)

Use when you do not need host nginx / Let's Encrypt yet:

```bash
cp .env.example .env
# fill secrets; BLINK_BASE_URL=http://STAGING_IP or http://staging-host
docker compose up -d --build
curl -sf http://STAGING_IP/api/ready
```

### Staging checklist

- [ ] Secrets differ from production
- [ ] `BLINK_BASE_URL` matches the staging URL users will open
- [ ] Compose nginx **off** if host nginx fronts `127.0.0.1:3000` / `:8080` (prod overlay)
- [ ] Cloudflare provisioner **not** pointed at production apex unless you intend to change live DNS
- [ ] Health: `/api/ready` and a create → redirect smoke test

### Staging → production gate

1. Staging `/api/ready` green on the target image tag  
2. Create link → hit slug → confirm `302`  
3. Optional: Postgres backup/restore drill ([INSTALLATION.md](INSTALLATION.md#postgres-backups))  
4. Then run production ship below with that same `BLINK_IMAGE_TAG`

---

## Production (layurl.com)

Automated path: fill `.env.production` once → `npm run ops:ship`. That syncs GitHub Environment `production`, applies Cloudflare, SSH-deploys Compose + host nginx + certbot, then health-checks.

### Prerequisites (once, outside the repo)

| Item | Notes |
|------|--------|
| Domain on Cloudflare | Zone for `layurl.com`; registrar NS → Cloudflare |
| Origin VPS | SSH access; **host nginx** already installed |
| Ports | Origin `:80` (ACME) and `:443` reachable from Cloudflare |
| Docker | Auto-installed on first deploy via get.docker.com if missing |
| `gh` CLI | Logged in (`gh auth login`) with repo + Actions permissions |

Do **not** reuse other sites’ certificates. Deploy issues `/etc/letsencrypt/live/layurl.com/` for `layurl.com` + `www.layurl.com` only.

### Steps

1. **Publish images** (if shipping a new version):

   ```bash
   # Merge to main, then:
   git tag v0.6.5
   git push origin v0.6.5
   # Wait for CI: test + e2e + GHCR publish (blink-api / blink-web)
   ```

2. **Configure local ship file**:

   ```bash
   cp .env.production.example .env.production
   ```

   Fill at least:

   | Key | Purpose |
   |-----|---------|
   | `BLINK_PASSWORD` / `BLINK_API_KEY` / `BLINK_SESSION_SECRET` | App auth |
   | `POSTGRES_PASSWORD` | Database |
   | `BLINK_BASE_URL` | `https://layurl.com` |
   | `BLINK_LETSENCRYPT_EMAIL` | Certbot registration (recommended) |
   | `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ZONE_ID` | Provisioner |
   | `CLOUDFLARE_ORIGIN_IPV4` (and optional IPv6) | Proxied DNS target |
   | `DEPLOY_HOST` / `DEPLOY_USER` | SSH |
   | `DEPLOY_SSH_KEY_FILE` | Path to **unencrypted** OpenSSH private key (no passphrase; Actions cannot unlock) |
   | `BLINK_IMAGE_TAG` | e.g. `v0.6.5` or `latest` |
   | `GITHUB_REPO` | `kyroskoh/url-shortener` if `gh` cannot infer |

   Optional: Turnstile keys + `BLINK_TURNSTILE_FORCE=true` for public mode. Prefer generating keys:

   ```bash
   npm run ops:turnstile
   # Windows: .\scripts\ops.ps1 turnstile
   ```

   Requires API token permission **Account → Turnstile → Edit**. Full list: [GITHUB_SECRETS.md](GITHUB_SECRETS.md).

3. **Dry-run Cloudflare** (recommended first time):

   ```bash
   gh auth login   # once
   npm run ops:cf-dry-run
   # Windows: .\scripts\ops.ps1 cf-dry-run
   ```

   Run `ops:*` on your **laptop** (needs `gh`), not on the origin VPS. Values with `$` in `.env.production` are loaded without shell expansion; quoting (`'...'`) is still fine. `ops:cf-dry-run` does not require `DEPLOY_*`; full `ops:ship` does (`DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` or `DEPLOY_SSH_KEY_FILE`).

4. **Ship**:

   ```bash
   npm run ops:ship
   # Windows: .\scripts\ops.ps1 ship
   ```

   What `ops:ship` does:

   1. `bootstrap-github-env.sh` — sync secrets/vars into Environment `production`
   2. Triggers **Deploy** workflow: Cloudflare `apply` + Compose deploy
   3. On the host:
      - Clone/sync repo path (`DEPLOY_PATH`, default `~/url-shortener`)
      - `ensure-docker.sh` if Docker missing
      - `install-host-nginx.sh`: HTTP vhost (ACME) → certbot for `layurl.com`/`www` → SSL vhost `zz-blink-layurl.com.conf` → reload
      - `docker compose -f docker-compose.yml -f docker-compose.prod.yml pull && up -d`
   4. Health-check `HEALTHCHECK_URL` or `{BLINK_BASE_URL}/api/ready`

5. **Verify production**:

   ```bash
   curl -sf https://layurl.com/api/ready
   # Admin: https://layurl.com/admin/
   # Confirm origin cert lineage (on host):
   #   ls /etc/letsencrypt/live/layurl.com/
   #   grep -RhoE 'ssl_certificate(_key)?\s+[^;]+;' /etc/nginx | grep blink
   ```

6. **Post-ship** (as needed):

   - Cloudflare dashboard leftovers: [CLOUDFLARE.md](CLOUDFLARE.md#when-the-cloudflare-dns-api-is-not-enough)
   - Abuse / Turnstile / blocklist: [ABUSE.md](ABUSE.md)
   - Schedule Postgres backups on the host ([INSTALLATION.md](INSTALLATION.md#postgres-backups))

### Manual Deploy workflow (optional)

**Actions → Deploy → Run workflow**

| Input | Typical ship | Cloudflare-only |
|-------|--------------|-----------------|
| `cloudflare` | `apply` | `dry-run` |
| `deploy` | `true` | `false` |
| `image_tag` | `v0.6.5` | n/a |

Prefer `npm run ops:ship` so secrets stay synced from `.env.production`.

### Production checklist

- [ ] `v*` CI green and images on GHCR for the tag you ship
- [ ] `.env.production` filled; `DEPLOY_SSH_KEY_FILE` set; never commit the file
- [ ] Cloudflare zone + NS cutover done
- [ ] Origin nginx present; `:80` reachable for HTTP-01
- [ ] `BLINK_LETSENCRYPT_EMAIL` set
- [ ] `ops:cf-dry-run` then `ops:ship`
- [ ] `https://layurl.com/api/ready` OK; SSL mode **Full (strict)**
- [ ] Cert files under `/etc/letsencrypt/live/layurl.com/` (not snakeoil, not other sites)
- [ ] Backup drill documented for the host

### Rollback

1. Ship a previous known-good tag: set `BLINK_IMAGE_TAG=vX.Y.Z` in `.env.production` → `npm run ops:ship` (or Actions with that `image_tag`).
2. Bad migration: restore Postgres dump from before deploy, then restart API ([INSTALLATION.md](INSTALLATION.md#postgres-backups)).
3. Bad nginx/TLS: keep prior `zz-blink-layurl.com.conf` backup on the host; `nginx -t && systemctl reload nginx`. Certbot lineages for other sites are untouched by design.

---

## Topology reference

```
Local:        browser → Compose nginx :80 → api / web containers (build)

Staging:      browser → [optional CF] → host or Compose nginx → api / web (GHCR or build)

Production:   browser → Cloudflare (edge TLS, Full strict)
                     → origin nginx :443 (Let's Encrypt layurl.com)
                     → 127.0.0.1:3000 (api) / :8080 (web)  [Compose nginx off]
```

Related scripts:

| Script | Role |
|--------|------|
| [`scripts/docker.sh`](../scripts/docker.sh) / [`docker.ps1`](../scripts/docker.ps1) | Local Compose helpers |
| [`deploy/scripts/ship-prod.sh`](../deploy/scripts/ship-prod.sh) | `ops:ship` |
| [`deploy/scripts/bootstrap-github-env.sh`](../deploy/scripts/bootstrap-github-env.sh) | Sync GitHub Environment |
| [`deploy/scripts/ensure-docker.sh`](../deploy/scripts/ensure-docker.sh) | get.docker.com on origin |
| [`deploy/scripts/ensure-letsencrypt.sh`](../deploy/scripts/ensure-letsencrypt.sh) | certbot webroot for cert name |
| [`deploy/scripts/install-host-nginx.sh`](../deploy/scripts/install-host-nginx.sh) | HTTP → certbot → SSL vhost |
| [`deploy/scripts/cloudflare-provision.mjs`](../deploy/scripts/cloudflare-provision.mjs) | DNS / SSL mode / cache bypass |

## Acknowledgments

- Inspired by [chhoto-url](https://github.com/SinTan1729/chhoto-url)
- Live at [layurl.com](https://layurl.com)
- Community feedback and contributions

## Support

- Issues: [GitHub Issues](https://github.com/kyroskoh/url-shortener/issues)
- Discussions: [GitHub Discussions](https://github.com/kyroskoh/url-shortener/discussions)

---

Made with ❤️ by [Kyros Koh](https://github.com/kyroskoh)
