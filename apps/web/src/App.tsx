import { FormEvent, useCallback, useEffect, useState } from "react";
import { api, type Config, type Link } from "./api";
import { formatDateTimeBoth } from "./datetime";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: { sitekey: string; callback: (token: string) => void },
      ) => string;
      reset: (id?: string) => void;
    };
  }
}

export function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [destination, setDestination] = useState("");
  const [slug, setSlug] = useState("");
  const [notes, setNotes] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [filter, setFilter] = useState("");
  const [links, setLinks] = useState<Link[]>([]);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [created, setCreated] = useState<Link | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Link | null>(null);

  const refreshAuth = useCallback(async () => {
    const me = await api.me();
    setAuthed(me.status === 200);
  }, []);

  const refreshLinks = useCallback(async () => {
    if (!authed) {
      setLinks([]);
      return;
    }
    const res = await api.list(filter || undefined);
    if (res.data) setLinks(res.data.links);
  }, [authed, filter]);

  useEffect(() => {
    void (async () => {
      const cfg = await api.config();
      if (cfg.data) {
        setConfig(cfg.data);
        document.title = `${cfg.data.siteTitle} · layurl.com`;
      }
      await refreshAuth();
    })();
  }, [refreshAuth]);

  useEffect(() => {
    void refreshLinks();
  }, [refreshLinks]);

  useEffect(() => {
    if (!config?.turnstileSiteKey || authed) return;
    const existing = document.getElementById("cf-turnstile-script");
    if (!existing) {
      const s = document.createElement("script");
      s.id = "cf-turnstile-script";
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      document.body.appendChild(s);
      s.onload = () => renderTurnstile(config.turnstileSiteKey!);
    } else {
      renderTurnstile(config.turnstileSiteKey);
    }
  }, [config, authed]);

  function renderTurnstile(sitekey: string) {
    const el = document.getElementById("turnstile-box");
    if (!el || !window.turnstile) {
      setTimeout(() => renderTurnstile(sitekey), 200);
      return;
    }
    el.innerHTML = "";
    window.turnstile.render(el, {
      sitekey,
      callback: (token) => setTurnstileToken(token),
    });
  }

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    setError("");
    const res = await api.login(password);
    if (res.error) {
      setError(res.error);
      return;
    }
    setPassword("");
    setAuthed(true);
    setInfo("Signed in");
  }

  async function onLogout() {
    await api.logout();
    setAuthed(false);
    setLinks([]);
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        destination,
        notes: notes || null,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      };
      if (slug.trim()) body.slug = slug.trim();
      if (!authed && turnstileToken) body.turnstileToken = turnstileToken;

      const res = await api.create(body);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.data) {
        setCreated(res.data.link);
        setWarnings(res.data.warnings ?? []);
        setDestination("");
        setSlug("");
        setNotes("");
        setExpiresAt("");
        setInfo("Short link created");
        await refreshLinks();
      }
    } finally {
      setBusy(false);
    }
  }

  async function copyCreated() {
    if (!created) return;
    await navigator.clipboard.writeText(created.shortUrl);
    setInfo("Copied to clipboard");
  }

  async function shareCreated() {
    if (!created) return;
    if (navigator.share) {
      await navigator.share({
        title: config?.siteTitle ?? "Blink",
        url: created.shortUrl,
      });
    } else {
      await copyCreated();
    }
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    try {
      const res = await api.update(editing.slug, {
        destination: editing.destination,
        notes: editing.notes,
        expiresAt: editing.expiresAt,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setEditing(null);
      setInfo("Link updated");
      await refreshLinks();
    } finally {
      setBusy(false);
    }
  }

  async function removeLink(slugToDelete: string) {
    if (!confirm(`Delete ${slugToDelete}?`)) return;
    const res = await api.remove(slugToDelete);
    if (res.error) {
      setError(res.error);
      return;
    }
    setInfo("Deleted");
    await refreshLinks();
  }

  const canCreate = authed || Boolean(config?.publicMode);

  return (
    <div className="shell">
      <div className="auth-bar">
        {authed ? (
          <>
            <a className="btn secondary" href={api.exportUrl}>
              Export CSV
            </a>
            <button type="button" className="secondary" onClick={() => void onLogout()}>
              Sign out
            </button>
          </>
        ) : (
          <form className="row" onSubmit={(e) => void onLogin(e)}>
            <input
              type="password"
              placeholder="Admin password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-label="Admin password"
            />
            <button type="submit">Sign in</button>
          </form>
        )}
      </div>

      <header className="hero">
        <p className="brand">{config?.siteTitle ?? "Blink"}</p>
        <p className="tagline">Short links. Instant redirects.</p>
        <p className="host">layurl.com</p>
      </header>

      {canCreate && (
        <section className="panel">
          <form className="form-grid" onSubmit={(e) => void onCreate(e)}>
            <label>
              Destination URL
              <input
                required
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="https://example.com/very/long/path"
              />
            </label>
            <label>
              Custom slug (optional)
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="my-link"
              />
            </label>
            <label>
              Notes
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
            <label>
              Expires at (optional)
              <input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </label>
            {!authed && config?.turnstileSiteKey && (
              <div id="turnstile-box" aria-label="Turnstile" />
            )}
            <div className="row">
              <button type="submit" disabled={busy}>
                Shorten
              </button>
            </div>
          </form>

          {created && (
            <div className="success-box">
              <p>
                <code>{created.shortUrl}</code>
              </p>
              {warnings.includes("duplicate_destination") && (
                <p className="msg">
                  Warning: this destination already has one or more short links.
                </p>
              )}
              <div className="row" style={{ marginTop: "0.75rem" }}>
                <button type="button" onClick={() => void copyCreated()}>
                  Copy
                </button>
                <button type="button" className="secondary" onClick={() => void shareCreated()}>
                  Share
                </button>
                {authed && (
                  <img
                    className="qr"
                    src={api.qrUrl(created.slug)}
                    alt="QR code"
                  />
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {!canCreate && (
        <section className="panel">
          <p className="msg">Sign in to create short links, or enable public mode.</p>
        </section>
      )}

      {error && <p className="msg error">{error}</p>}
      {info && <p className="msg ok">{info}</p>}

      {authed && (
        <>
          <div className="toolbar">
            <h2 style={{ margin: 0 }}>Your links</h2>
            <input
              placeholder="Filter slug, URL, notes"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{ maxWidth: 280 }}
            />
          </div>
          <div className="list">
            {links.map((link) => (
              <article className="item" key={link.slug}>
                {editing?.slug === link.slug ? (
                  <form className="form-grid" onSubmit={(e) => void saveEdit(e)}>
                    <label>
                      Destination
                      <input
                        value={editing.destination}
                        onChange={(e) =>
                          setEditing({ ...editing, destination: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Notes
                      <textarea
                        value={editing.notes ?? ""}
                        onChange={(e) =>
                          setEditing({ ...editing, notes: e.target.value })
                        }
                      />
                    </label>
                    <div className="row">
                      <button type="submit" disabled={busy}>
                        Save
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setEditing(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <strong>
                      <a href={link.shortUrl}>{link.shortUrl}</a>
                    </strong>
                    <p className="meta">{link.destination}</p>
                    {link.notes && <p className="meta">{link.notes}</p>}
                    <p className="meta">
                      {link.hits} hits
                      {link.createdAt
                        ? ` · created ${formatDateTimeBoth(link.createdAt)}`
                        : ""}
                    </p>
                    {link.lastHitAt && (
                      <p className="meta">
                        last hit {formatDateTimeBoth(link.lastHitAt)}
                      </p>
                    )}
                    {link.expiresAt && (
                      <p className="meta">
                        expires {formatDateTimeBoth(link.expiresAt)}
                      </p>
                    )}
                    <div className="row">
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setEditing(link)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => void removeLink(link.slug)}
                      >
                        Delete
                      </button>
                      <img
                        className="qr"
                        src={api.qrUrl(link.slug)}
                        alt={`QR for ${link.slug}`}
                      />
                    </div>
                  </>
                )}
              </article>
            ))}
            {!links.length && <p className="meta">No links yet.</p>}
          </div>
        </>
      )}

      <footer className="footer">
        Blink · hosted on layurl.com · privacy-respecting redirects
      </footer>
    </div>
  );
}
