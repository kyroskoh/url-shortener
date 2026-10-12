# Cloudflare for layurl.com

Blink terminates public TLS at **Cloudflare** and reverse-proxies to **nginx** on the origin.

## Token setup

Create an API token with at least:

- Zone — DNS — Edit
- Zone — Zone Settings — Edit
- Zone — Cache Purge — Purge (optional)
- Account — Account Rulesets — Edit (or Zone — Transform/Cache Rules as available on your plan)

Set in `.env`:

```bash
CLOUDFLARE_API_TOKEN=...
CLOUDFLARE_ZONE_ID=...
CLOUDFLARE_ORIGIN_IPV4=x.x.x.x
# optional
CLOUDFLARE_ORIGIN_IPV6=
CLOUDFLARE_MANAGE_WWW=true
```

## Provisioner

```bash
node deploy/scripts/cloudflare-provision.mjs --dry-run
node deploy/scripts/cloudflare-provision.mjs --apply
```

### What the API automates

| Step | Action |
|------|--------|
| DNS | Upsert proxied `A`/`AAAA` for apex → origin; optional `www` |
| SSL | Encryption mode **full** (Full strict), Always Use HTTPS on, min TLS 1.2 |
| Cache | Cache rule / ruleset: **bypass** caching for short-link style paths so redirects are not edge-cached |

Exact cache expression is printed by the script (documented in script output). Prefer bypass for dynamic `/:slug` redirects; purge on link edit if you ever allow caching.

### Dry-run vs apply

- `--dry-run` (default): prints planned API calls; no writes
- `--apply`: executes writes; on partial failure exits non-zero and prints **manual fallback** steps

## When the Cloudflare DNS API is not enough

The script **cannot** finish these; complete them manually:

| Gap | Dashboard path / action |
|-----|-------------------------|
| Domain not in Cloudflare yet | Cloudflare → **Add a site** → follow NS instructions |
| Nameserver cutover | Your **registrar** → replace NS with Cloudflare’s (API cannot change registrar NS) |
| Turnstile keys | **Turnstile** → Add site → copy site/secret into `BLINK_TURNSTILE_*` |
| Full (strict) but origin is HTTP-only | **SSL/TLS** → **Origin Server** → Create certificate → install on nginx HTTPS, **or** temporarily use Full (not strict) until origin has TLS |
| Token/plan cannot edit Rulesets | **Caching** → **Cache Rules** → Create rule: Bypass cache when URI Path does not start with `/api` and is not a static asset — or bypass all HTML redirects as needed |
| SSL mode not updated | **SSL/TLS** → **Overview** → Full (strict) |
| DNS record conflict | **DNS** → **Records** → edit apex/`www` to proxied (orange cloud) → origin |
| Stale cached responses | **Caching** → **Configuration** → **Purge Everything** after first deploy |
| Authenticated Origin Pulls / Bot Fight | Plan-gated: enable under **SSL/TLS** → **Origin Server** or **Security** → **Bots** if required |

After `--apply`, the script reprints any remaining manual items.

## Recommended production shape

```
Client → Cloudflare (proxied DNS + edge TLS)
       → Origin :80/:443 nginx
       → api / web containers
```

Set `BLINK_BASE_URL=https://layurl.com`.
