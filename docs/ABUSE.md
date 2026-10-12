# Abuse playbook (Blink / layurl.com)

How operators handle bad or spammy short links while staying privacy-respecting (no IP/UA analytics storage).

## Labels (match the admin UI)

| UI control | Meaning |
|------------|---------|
| **Quarantine** | Sets link `status` to `quarantined`. Slug is kept; redirects show the branded “Link unavailable” page (`410`). Destination is not opened. |
| **Re-enable** | Sets `status` back to `active`. Redis redirect cache for that slug is cleared so the destination works again. |
| **Delete** | Permanently removes the link row. |

## Report a bad link

1. Note the short URL slug (path after `/`).
2. Sign in as admin (password) or use `X-API-Key`.
3. Find the link in the list (filter by slug or destination).
4. Click **Quarantine** (preferred for investigation) or **Delete** (if confirmed junk).
5. Optionally add a note on the link via **Edit** documenting why it was quarantined.

API equivalent:

```http
POST /api/links/{slug}/status
Content-Type: application/json
X-API-Key: <key>

{ "status": "quarantined" }
```

Re-enable:

```http
POST /api/links/{slug}/status
{ "status": "active" }
```

## Prevent spam on public create

1. Set `BLINK_PUBLIC_MODE=true` only if needed.
2. Configure Cloudflare Turnstile (`BLINK_TURNSTILE_SITE_KEY` / `BLINK_TURNSTILE_SECRET_KEY`).
3. For public instances, set `BLINK_TURNSTILE_FORCE=true` so create always requires a valid token (even if someone forgets keys — creates fail closed until keys exist).
4. Enable URL checks:
   - `BLINK_URL_CHECK_PROVIDER=blocklist`
   - `BLINK_URL_CHECK_BLOCKLIST_PATH` pointing at a host list (see `deploy/blocklist.example.txt`)
   - Or `BLINK_URL_CHECK_PROVIDER=http` with `BLINK_URL_CHECK_HTTP_URL` posting `{ "url", "host" }` and expecting `{ "ok": true }` / `{ "allowed": true }`.

## Rotate API key / password

1. Generate a new random API key and password.
2. Update `.env` (`BLINK_API_KEY`, `BLINK_PASSWORD`) — plain values are hashed at startup with Argon2.
3. Restart the `api` container: `docker compose up -d api --force-recreate`.
4. Invalidate old clients; update any automation with the new `X-API-Key`.
5. Optionally clear sessions by changing `BLINK_SESSION_SECRET` and restarting (forces re-login).

## After quarantine

- Confirm `https://layurl.com/{slug}` (or local) shows **Link unavailable**, not the destination.
- Purge Cloudflare cache for that path if you ever allowed edge caching (provisioner bypasses short-link cache by default).
- Keep the blocklist updated for repeat offender hosts.
