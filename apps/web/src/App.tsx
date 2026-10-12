import { FormEvent, useCallback, useEffect, useState } from "react";
import { api, type Config, type Folder, type Link, type Tag } from "./api";
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
  const [utmSource, setUtmSource] = useState("");
  const [utmMedium, setUtmMedium] = useState("");
  const [utmCampaign, setUtmCampaign] = useState("");
  const [utmTerm, setUtmTerm] = useState("");
  const [utmContent, setUtmContent] = useState("");
  const [linkPassword, setLinkPassword] = useState("");
  const [oneTime, setOneTime] = useState(false);
  const [tagNames, setTagNames] = useState("");
  const [folderId, setFolderId] = useState("");
  const [filter, setFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [folderFilter, setFolderFilter] = useState("");
  const [links, setLinks] = useState<Link[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [created, setCreated] = useState<Link | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Link | null>(null);
  const [editTags, setEditTags] = useState("");
  const [preview, setPreview] = useState<{
    slug: string;
    title: string | null;
    favicon: string | null;
    cached: boolean;
  } | null>(null);
  const [importCsv, setImportCsv] = useState("");
  const [importResult, setImportResult] = useState<string>("");
  const [newTag, setNewTag] = useState("");
  const [newFolder, setNewFolder] = useState("");

  const refreshAuth = useCallback(async () => {
    const me = await api.me();
    setAuthed(me.status === 200);
  }, []);

  const refreshMeta = useCallback(async () => {
    if (!authed) {
      setTags([]);
      setFolders([]);
      return;
    }
    const [t, f] = await Promise.all([api.tags(), api.folders()]);
    if (t.data) setTags(t.data.tags);
    if (f.data) setFolders(f.data.folders);
  }, [authed]);

  const refreshLinks = useCallback(async () => {
    if (!authed) {
      setLinks([]);
      return;
    }
    const res = await api.list({
      q: filter || undefined,
      tag: tagFilter || undefined,
      folder: folderFilter || undefined,
    });
    if (res.data) setLinks(res.data.links);
  }, [authed, filter, tagFilter, folderFilter]);

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
    void refreshMeta();
  }, [refreshMeta]);

  useEffect(() => {
    if (authed || !config?.turnstileRequired || !config.turnstileSiteKey) return;
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

  function resetCreateForm() {
    setDestination("");
    setSlug("");
    setNotes("");
    setExpiresAt("");
    setUtmSource("");
    setUtmMedium("");
    setUtmCampaign("");
    setUtmTerm("");
    setUtmContent("");
    setLinkPassword("");
    setOneTime(false);
    setTagNames("");
    setFolderId("");
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
        oneTime,
      };
      if (slug.trim()) body.slug = slug.trim();
      if (!authed && turnstileToken) body.turnstileToken = turnstileToken;
      if (utmSource.trim()) body.utmSource = utmSource.trim();
      if (utmMedium.trim()) body.utmMedium = utmMedium.trim();
      if (utmCampaign.trim()) body.utmCampaign = utmCampaign.trim();
      if (utmTerm.trim()) body.utmTerm = utmTerm.trim();
      if (utmContent.trim()) body.utmContent = utmContent.trim();
      if (linkPassword.trim()) body.password = linkPassword.trim();
      if (authed && tagNames.trim()) {
        body.tagNames = tagNames
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
      }
      if (authed && folderId) body.folderId = folderId;

      const res = await api.create(body);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.data) {
        setCreated(res.data.link);
        setWarnings(res.data.warnings ?? []);
        resetCreateForm();
        setInfo("Short link created");
        await refreshLinks();
        await refreshMeta();
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
        oneTime: editing.oneTime,
        folderId: editing.folderId,
        tagNames: editTags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setEditing(null);
      setInfo("Link updated");
      await refreshLinks();
      await refreshMeta();
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

  async function setStatus(slug: string, status: "active" | "quarantined") {
    setBusy(true);
    setError("");
    try {
      const res = await api.setStatus(slug, status);
      if (res.error) {
        setError(res.error);
        return;
      }
      setInfo(status === "quarantined" ? "Link quarantined" : "Link re-enabled");
      await refreshLinks();
    } finally {
      setBusy(false);
    }
  }

  async function loadPreview(slug: string) {
    setBusy(true);
    setError("");
    try {
      const res = await api.preview(slug);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.data) {
        setPreview({
          slug,
          title: res.data.title,
          favicon: res.data.favicon,
          cached: res.data.cached,
        });
      }
    } finally {
      setBusy(false);
    }
  }

  async function runImport(dryRun: boolean) {
    setBusy(true);
    setError("");
    setImportResult("");
    try {
      const res = await api.importCsv(importCsv, dryRun);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.data) {
        setImportResult(
          `${dryRun ? "Dry-run" : "Import"}: ${res.data.succeeded} ok, ${res.data.failed} failed of ${res.data.total}`,
        );
        if (!dryRun) await refreshLinks();
      }
    } finally {
      setBusy(false);
    }
  }

  async function addTag(e: FormEvent) {
    e.preventDefault();
    if (!newTag.trim()) return;
    const res = await api.createTag(newTag.trim());
    if (res.error) {
      setError(res.error);
      return;
    }
    setNewTag("");
    await refreshMeta();
  }

  async function addFolder(e: FormEvent) {
    e.preventDefault();
    if (!newFolder.trim()) return;
    const res = await api.createFolder(newFolder.trim());
    if (res.error) {
      setError(res.error);
      return;
    }
    setNewFolder("");
    await refreshMeta();
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

            <details className="advanced">
              <summary>Advanced options</summary>
              <div className="form-grid" style={{ marginTop: "0.75rem" }}>
                <label>
                  utm_source
                  <input
                    value={utmSource}
                    onChange={(e) => setUtmSource(e.target.value)}
                  />
                </label>
                <label>
                  utm_medium
                  <input
                    value={utmMedium}
                    onChange={(e) => setUtmMedium(e.target.value)}
                  />
                </label>
                <label>
                  utm_campaign
                  <input
                    value={utmCampaign}
                    onChange={(e) => setUtmCampaign(e.target.value)}
                  />
                </label>
                <label>
                  utm_term
                  <input value={utmTerm} onChange={(e) => setUtmTerm(e.target.value)} />
                </label>
                <label>
                  utm_content
                  <input
                    value={utmContent}
                    onChange={(e) => setUtmContent(e.target.value)}
                  />
                </label>
                <label>
                  Link password (optional)
                  <input
                    type="password"
                    value={linkPassword}
                    onChange={(e) => setLinkPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </label>
                <label className="row" style={{ alignItems: "center", gap: "0.5rem" }}>
                  <input
                    type="checkbox"
                    checked={oneTime}
                    onChange={(e) => setOneTime(e.target.checked)}
                  />
                  One-time (burn after first redirect)
                </label>
                {authed && (
                  <>
                    <label>
                      Tags (comma-separated)
                      <input
                        value={tagNames}
                        onChange={(e) => setTagNames(e.target.value)}
                        placeholder="campaign, docs"
                      />
                    </label>
                    <label>
                      Folder
                      <select
                        value={folderId}
                        onChange={(e) => setFolderId(e.target.value)}
                      >
                        <option value="">None</option>
                        {folders.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
              </div>
            </details>

            {!authed && config?.turnstileRequired && config.turnstileSiteKey && (
              <div id="turnstile-box" aria-label="Cloudflare Turnstile challenge" />
            )}
            {!authed && config?.turnstileRequired && !config.turnstileSiteKey && (
              <p className="msg error">
                Public create requires Turnstile, but keys are not configured. Sign in
                as admin or set BLINK_TURNSTILE_* keys.
              </p>
            )}
            <div className="row">
              <button
                type="submit"
                disabled={
                  busy ||
                  (!authed &&
                    Boolean(config?.turnstileRequired) &&
                    !config?.turnstileSiteKey)
                }
              >
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
          <section className="panel">
            <h2 style={{ marginTop: 0 }}>Bulk import</h2>
            <p className="meta">
              CSV columns: slug, destination, notes, expires_at
            </p>
            <textarea
              rows={4}
              value={importCsv}
              onChange={(e) => setImportCsv(e.target.value)}
              placeholder={"slug,destination,notes,expires_at\nhello,https://example.com,,"}
            />
            <div className="row" style={{ marginTop: "0.75rem" }}>
              <button
                type="button"
                className="secondary"
                disabled={busy || !importCsv.trim()}
                onClick={() => void runImport(true)}
              >
                Dry-run
              </button>
              <button
                type="button"
                disabled={busy || !importCsv.trim()}
                onClick={() => void runImport(false)}
              >
                Import
              </button>
            </div>
            {importResult && <p className="msg ok">{importResult}</p>}
          </section>

          <section className="panel">
            <h2 style={{ marginTop: 0 }}>Tags &amp; folders</h2>
            <form className="row" onSubmit={(e) => void addTag(e)}>
              <input
                placeholder="New tag"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
              />
              <button type="submit">Add tag</button>
            </form>
            <form className="row" onSubmit={(e) => void addFolder(e)} style={{ marginTop: "0.5rem" }}>
              <input
                placeholder="New folder"
                value={newFolder}
                onChange={(e) => setNewFolder(e.target.value)}
              />
              <button type="submit">Add folder</button>
            </form>
            <p className="meta" style={{ marginTop: "0.75rem" }}>
              Tags: {tags.map((t) => t.name).join(", ") || "none"}
            </p>
            <p className="meta">
              Folders: {folders.map((f) => f.name).join(", ") || "none"}
            </p>
          </section>

          <div className="toolbar">
            <h2 style={{ margin: 0 }}>Your links</h2>
            <input
              placeholder="Filter slug, URL, notes"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{ maxWidth: 200 }}
            />
            <input
              placeholder="Tag filter"
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              style={{ maxWidth: 140 }}
              list="tag-list"
            />
            <datalist id="tag-list">
              {tags.map((t) => (
                <option key={t.id} value={t.name} />
              ))}
            </datalist>
            <select
              value={folderFilter}
              onChange={(e) => setFolderFilter(e.target.value)}
              aria-label="Folder filter"
              style={{ maxWidth: 160 }}
            >
              <option value="">All folders</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          {preview && (
            <div className="panel" style={{ marginBottom: "1rem" }}>
              <p className="meta">
                Preview for <code>{preview.slug}</code>
                {preview.cached ? " (cached)" : ""}
              </p>
              <div className="row" style={{ alignItems: "center" }}>
                {preview.favicon && (
                  <img
                    src={preview.favicon}
                    alt=""
                    width={20}
                    height={20}
                    style={{ borderRadius: 4 }}
                  />
                )}
                <strong>{preview.title ?? "(no title)"}</strong>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setPreview(null)}
                >
                  Close
                </button>
              </div>
            </div>
          )}

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
                    <label>
                      Tags (comma-separated)
                      <input
                        value={editTags}
                        onChange={(e) => setEditTags(e.target.value)}
                      />
                    </label>
                    <label>
                      Folder
                      <select
                        value={editing.folderId ?? ""}
                        onChange={(e) =>
                          setEditing({
                            ...editing,
                            folderId: e.target.value || null,
                          })
                        }
                      >
                        <option value="">None</option>
                        {folders.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="row" style={{ alignItems: "center", gap: "0.5rem" }}>
                      <input
                        type="checkbox"
                        checked={editing.oneTime}
                        onChange={(e) =>
                          setEditing({ ...editing, oneTime: e.target.checked })
                        }
                      />
                      One-time
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
                      status: <strong>{link.status}</strong>
                      {link.status === "quarantined" ? " (redirects blocked)" : ""}
                      {link.hasPassword ? " · password" : ""}
                      {link.oneTime ? " · one-time" : ""}
                    </p>
                    {link.tags.length > 0 && (
                      <p className="meta">
                        tags: {link.tags.map((t) => t.name).join(", ")}
                      </p>
                    )}
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
                        onClick={() => {
                          setEditing(link);
                          setEditTags(link.tags.map((t) => t.name).join(", "));
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        disabled={busy}
                        onClick={() => void loadPreview(link.slug)}
                      >
                        Preview
                      </button>
                      {link.status === "active" ? (
                        <button
                          type="button"
                          className="secondary"
                          disabled={busy}
                          onClick={() => void setStatus(link.slug, "quarantined")}
                        >
                          Quarantine
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="secondary"
                          disabled={busy}
                          onClick={() => void setStatus(link.slug, "active")}
                        >
                          Re-enable
                        </button>
                      )}
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
