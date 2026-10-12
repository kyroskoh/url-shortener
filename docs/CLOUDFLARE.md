# Cloudflare for layurl.com

Blink terminates public TLS at **Cloudflare** and reverse-proxies to **nginx** on the origin.

Hardened in **v0.6.0**: apex + **www** `A`/`AAAA`, provisioner unit tests, GitHub Actions dry-run/apply via [GITHUB_SECRETS.md](GITHUB_SECRETS.md).

## Token setup

Create an API token with at least:

- Zone — DNS — Edit
- Zone — Zone Settings — Edit
- Zone — Cache Purge — Purge (optional)
- Account — Account Rulesets — Edit (or Zone — Transform/Cache Rules as available on your plan)

**Prefer GitHub Secrets** (`CLOUDFLARE_*`) for production. For local runs, set in `.env`:

```bash
CLOUDFLARE_API_TOKEN=...
CLOUDFLARE_ZONE_ID=...
CLOUDFLARE_ORIGIN_IPV4=x.x.x.x
# optional
CLOUDFLARE_ORIGIN_IPV6=
CLOUDFLARE_MANAGE_WWW=true
```

## Production ship (recommended)

Full deploy steps (local / staging / production): [DEPLOY.md](DEPLOY.md).

Prefer the ops path (secrets + Cloudflare + deploy in one flow):

```bash
cp .env.production.example .env.production
# fill secrets; prefer DEPLOY_SSH_KEY_FILE=/path/to/key

gh auth login   # once, if needed
npm run ops:ship   # or: npm run ops:cf-dry-run first
```

See [GITHUB_SECRETS.md](GITHUB_SECRETS.md).

## Provisioner (local / advanced)

```bash
npm run cloudflare:dry-run
npm run cloudflare:apply
# or:
node deploy/scripts/cloudflare-provision.mjs --dry-run
node deploy/scripts/cloudflare-provision.mjs --apply
```

Via Actions: **Deploy** workflow → `cloudflare: dry-run` or `apply` (`apply` requires Environment `production`).

### What the API automates

| Step | Action |
|------|--------|
| DNS | Upsert proxied `A`/`AAAA` for apex → origin; optional `www` (A and AAAA when IPv6 set). Conflicting `CNAME` at the same name is removed first |
| SSL | Encryption mode **Full (strict)** (`ssl=strict`), Always Use HTTPS on, min TLS 1.2 |
| Cache | Cache rule / ruleset: **bypass** caching for short-link style paths so redirects are not edge-cached |

Exact cache expression is printed by the script. Prefer bypass for dynamic `/:slug` redirects.

### Dry-run vs apply

- `--dry-run` (default): prints planned API calls; still needs credentials (reads zone/DNS)
- `--apply`: executes writes; on partial failure exits non-zero and prints **manual fallback** steps
- Refuses without `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID`, and an origin IPv4 and/or IPv6

## When the Cloudflare DNS API is not enough

The script **cannot** finish these; complete them manually:

| Gap | Dashboard path / action |
|-----|-------------------------|
| Domain not in Cloudflare yet | Cloudflare → **Add a site** → follow NS instructions |
| Nameserver cutover | Your **registrar** → replace NS with Cloudflare’s (API cannot change registrar NS) |
| Turnstile keys | **Turnstile** → Add site → copy site/secret into `BLINK_TURNSTILE_*` |
| Full (strict) but origin is HTTP-only | **SSL/TLS** → **Origin Server** → Create certificate → install on nginx HTTPS, **or** temporarily use Full (not strict) until origin has TLS |
| Token/plan cannot edit Rulesets | **Caching** → **Cache Rules** → Create rule: Bypass cache for short-link redirects |
| SSL mode not updated | **SSL/TLS** → **Overview** → Full (strict) |
| DNS record conflict (non-CNAME) | **DNS** → **Records** → edit apex/`www` to proxied (orange cloud) → origin IPs |
| Stale cached responses | **Caching** → **Configuration** → **Purge Everything** after first deploy |
| Authenticated Origin Pulls / Bot Fight | Plan-gated: enable under **SSL/TLS** → **Origin Server** or **Security** → **Bots** if required |

After `--apply`, the script reprints any remaining manual items.

## Recommended production shape

```
Client → Cloudflare (proxied DNS + edge TLS)
       → Origin :80/:443 nginx
       → api / web containers (GHCR images)
```

Set `BLINK_BASE_URL=https://layurl.com`. Secrets and deploy: [GITHUB_SECRETS.md](GITHUB_SECRETS.md).

Production edge on the origin is **host nginx** ([`deploy/nginx.blink-layurl.com.conf`](../deploy/nginx.blink-layurl.com.conf) → `zz-blink-layurl.com.conf`) → localhost API/web containers. Compose’s nginx service is not used in prod.

For **Full (strict)**, origin must present TLS on 443. Deploy runs `ensure-letsencrypt.sh` (uses existing **certbot** if present, else installs it) to issue `/etc/letsencrypt/live/layurl.com/` for `layurl.com` + `www.layurl.com` via HTTP-01 webroot (`/var/www/certbot`). It does **not** reuse other lineages (e.g. `api.kyroskoh.xyz`). Set `BLINK_LETSENCRYPT_EMAIL` in `.env.production`. DNS for layurl.com must already point at this origin (or Cloudflare orange-cloud with HTTP challenge reaching origin on port 80).
