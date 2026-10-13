# GitHub Secrets for Blink production

**Source of truth for production credentials is GitHub** (Environment `production`). Local [`.env.production`](../.env.production.example) is the only file you edit; scripts sync it with `gh` — no dashboard clicking.

## Ship steps

Full local / staging / production runbooks: [DEPLOY.md](DEPLOY.md).

Prerequisites (once, outside this repo): Cloudflare zone for `layurl.com` with NS at Cloudflare; origin host with SSH and **host nginx** already installed. Docker is installed automatically on first ship via get.docker.com if missing.

```bash
cp .env.production.example .env.production
# fill secrets; prefer DEPLOY_SSH_KEY_FILE=/path/to/key

gh auth login   # once, if needed
npm run ops:ship   # or: npm run ops:cf-dry-run first
```

`ops:ship` bootstraps the GitHub Environment `production` (secrets/vars), runs Cloudflare apply, deploys Compose from GHCR (host nginx + certbot for `layurl.com`), and health-checks `/api/ready`.

Optional splits:

```bash
npm run ops:turnstile    # create/reuse CF Turnstile widget → write BLINK_TURNSTILE_* into .env.production
npm run ops:bootstrap    # sync secrets/vars only
npm run ops:cf-dry-run   # bootstrap + Cloudflare dry-run (no deploy)
```

Windows:

```powershell
cp .env.production.example .env.production
# fill secrets; prefer DEPLOY_SSH_KEY_FILE=/path/to/key

gh auth login   # once, if needed
.\scripts\ops.ps1 turnstile   # needs Account → Turnstile → Edit on the API token
.\scripts\ops.ps1 ship   # or: .\scripts\ops.ps1 cf-dry-run first
```

Scripts never print secret values. They call [`ensure-turnstile.mjs`](../deploy/scripts/ensure-turnstile.mjs), [`bootstrap-github-env.sh`](../deploy/scripts/bootstrap-github-env.sh) and [`ship-prod.sh`](../deploy/scripts/ship-prod.sh).

## Secret inventory (Environment `production`)

| Secret | Used by |
|--------|---------|
| `BLINK_PASSWORD` | Deploy / API |
| `BLINK_API_KEY` | Deploy / API |
| `BLINK_SESSION_SECRET` | Deploy / API |
| `POSTGRES_PASSWORD` | Deploy Postgres + `DATABASE_URL` |
| `BLINK_TURNSTILE_SITE_KEY` | Deploy (optional) |
| `BLINK_TURNSTILE_SECRET_KEY` | Deploy (optional) |
| `CLOUDFLARE_API_TOKEN` | Provisioner |
| `CLOUDFLARE_ZONE_ID` | Provisioner |
| `CLOUDFLARE_ORIGIN_IPV4` | Provisioner |
| `CLOUDFLARE_ORIGIN_IPV6` | Provisioner (optional) |
| `DEPLOY_HOST` / `DEPLOY_USER` / `DEPLOY_SSH_KEY` | SSH deploy (key must be **unencrypted**; prefer `DEPLOY_SSH_KEY_FILE`) |
| `GHCR_PULL_TOKEN` | Optional GHCR pull |

## Environment variables (non-secret)

| Variable | Default | Notes |
|----------|---------|-------|
| `BLINK_BASE_URL` | `https://layurl.com` | Public origin |
| `BLINK_PUBLIC_MODE` | `false` | Unauthenticated create |
| `BLINK_TURNSTILE_FORCE` | `false` | Fail closed without Turnstile |
| `CLOUDFLARE_MANAGE_WWW` | `true` | Upsert www A/AAAA |
| `DEPLOY_PATH` | `~/url-shortener` | Remote compose directory |
| `HEALTHCHECK_URL` | `{BLINK_BASE_URL}/api/ready` | Post-deploy check |
| `BLINK_LETSENCRYPT_EMAIL` | (empty) | Certbot registration email (recommended) |

## Manual workflow (optional)

**Actions → Deploy → Run workflow** still works with the same inputs (`cloudflare`, `deploy`, `image_tag`). Prefer `npm run ops:ship`.

See also [CLOUDFLARE.md](CLOUDFLARE.md), [INSTALLATION.md](INSTALLATION.md), [ABUSE.md](ABUSE.md).

## Acknowledgments

- Inspired by [chhoto-url](https://github.com/SinTan1729/chhoto-url)
- Live at [layurl.com](https://layurl.com)
- Community feedback and contributions

## Support

- Issues: [GitHub Issues](https://github.com/kyroskoh/url-shortener/issues)
- Discussions: [GitHub Discussions](https://github.com/kyroskoh/url-shortener/discussions)

---

Made with ❤️ by [Kyros Koh](https://github.com/kyroskoh)
