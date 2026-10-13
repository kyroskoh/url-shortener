import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  api,
  type Config,
  type Folder,
  type InstanceStats,
  type Link,
  type Tag,
} from "./api";
import { IMPORT_TIMEZONE_REFERENCE } from "@blink/shared";
import { formatDateTimeBoth } from "./datetime";

const BULK_IMPORT_TEMPLATE = `slug,destination,notes,expires_at,active_at,timezone,max_hits
hello,https://example.com/welcome,Welcome link,,,UTC,
promo,https://example.com/sale,Summer promo,2026-12-31T23:59:59.000Z,2026-06-01T00:00:00.000Z,UTC,1000
launch,https://example.com/go,Goes live later,,2026-07-01 09:00:00,UTC,
localdemo,https://example.com/local,Host-local evening,2026-12-31 23:59:59,,Local,
sgtdemo,https://example.com/sg,Singapore wall time,2026-12-31 23:59:59,,SGT,
`;

function isoToDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
        },
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
  const [activeAt, setActiveAt] = useState("");
  const [utmSource, setUtmSource] = useState("");
  const [utmMedium, setUtmMedium] = useState("");
  const [utmCampaign, setUtmCampaign] = useState("");
  const [utmTerm, setUtmTerm] = useState("");
  const [utmContent, setUtmContent] = useState("");
  const [linkPassword, setLinkPassword] = useState("");
  const [oneTime, setOneTime] = useState(false);
  const [maxHits, setMaxHits] = useState("");
  const [tagNames, setTagNames] = useState("");
  const [folderId, setFolderId] = useState("");
  const [filter, setFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [folderFilter, setFolderFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "paused" | "quarantined"
  >("all");
  const [links, setLinks] = useState<Link[]>([]);
  const turnstileWidgetId = useRef<string | null>(null);
  const turnstileRetryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
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
  const [editMaxHitsBaseline, setEditMaxHitsBaseline] = useState<number | null>(
    null,
  );
  const [editExpiresAt, setEditExpiresAt] = useState("");
  const [editActiveAt, setEditActiveAt] = useState("");
  const [preview, setPreview] = useState<{
    slug: string;
    title: string | null;
    favicon: string | null;
    cached: boolean;
  } | null>(null);
  const [hitChart, setHitChart] = useState<{
    slug: string;
    points: { t: string; hits: number }[];
    totalHits: number;
  } | null>(null);
  const [importCsv, setImportCsv] = useState("");
  const [importResult, setImportResult] = useState<string>("");
  const [instanceStats, setInstanceStats] = useState<InstanceStats | null>(null);
  const [newTag, setNewTag] = useState("");
  const [newFolder, setNewFolder] = useState("");
  const [openQrSlugs, setOpenQrSlugs] = useState<Set<string>>(() => new Set());

  function toggleQr(slug: string) {
    setOpenQrSlugs((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  function loadBulkImportTemplate() {
    setImportCsv(BULK_IMPORT_TEMPLATE);
    setImportResult("");
  }

  function downloadBulkImportTemplate() {
    const blob = new Blob([BULK_IMPORT_TEMPLATE], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bulk-import.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function downloadQr(slug: string) {
    setError("");
    try {
      const res = await fetch(api.qrUrl(slug), { credentials: "include" });
      if (!res.ok) {
        setError(`QR download failed (${res.status})`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `blink-${slug}.png`;
      a.click();
      URL.revokeObjectURL(url);
      setInfo(`Downloaded QR for ${slug}`);
    } catch {
      setError("QR download failed");
    }
  }

  const refreshAuth = useCallback(async () => {
    const me = await api.me();
    setAuthed(me.status === 200 && me.data?.authenticated === true);
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
      setNextCursor(null);
      setInstanceStats(null);
      return;
    }
    const [res, statsRes] = await Promise.all([
      api.list({
        q: filter || undefined,
        tag: tagFilter || undefined,
        folder: folderFilter || undefined,
        limit: 50,
      }),
      api.stats(),
    ]);
    if (res.data) {
      setLinks(res.data.links);
      setNextCursor(res.data.nextCursor);
    }
    if (statsRes.data) setInstanceStats(statsRes.data);
  }, [authed, filter, tagFilter, folderFilter]);

  async function loadMoreLinks() {
    if (!authed || !nextCursor) return;
    const res = await api.list({
      q: filter || undefined,
      tag: tagFilter || undefined,
      folder: folderFilter || undefined,
      cursor: nextCursor,
      limit: 50,
    });
    if (res.data) {
      setLinks((prev) => [...prev, ...res.data!.links]);
      setNextCursor(res.data.nextCursor);
    }
  }

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
    return () => {
      if (turnstileRetryTimer.current) {
        clearTimeout(turnstileRetryTimer.current);
        turnstileRetryTimer.current = null;
      }
    };
  }, [config, authed]);

  function resetTurnstile() {
    setTurnstileToken("");
    if (turnstileWidgetId.current && window.turnstile) {
      try {
        window.turnstile.reset(turnstileWidgetId.current);
      } catch {
        /* widget may already be gone */
      }
    }
  }

  function renderTurnstile(sitekey: string, attempt = 0) {
    const el = document.getElementById("turnstile-box");
    if (!el || !window.turnstile) {
      // Cap retries (~5s) so a missing script/box cannot poll forever.
      if (attempt >= 25) return;
      if (turnstileRetryTimer.current) clearTimeout(turnstileRetryTimer.current);
      turnstileRetryTimer.current = setTimeout(
        () => renderTurnstile(sitekey, attempt + 1),
        200,
      );
      return;
    }
    el.innerHTML = "";
    turnstileWidgetId.current = window.turnstile.render(el, {
      sitekey,
      callback: (token) => setTurnstileToken(token),
      "expired-callback": () => setTurnstileToken(""),
      "error-callback": () => setTurnstileToken(""),
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
    setActiveAt("");
    setUtmSource("");
    setUtmMedium("");
    setUtmCampaign("");
    setUtmTerm("");
    setUtmContent("");
    setLinkPassword("");
    setOneTime(false);
    setMaxHits("");
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
        activeAt: activeAt ? new Date(activeAt).toISOString() : null,
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
      if (maxHits.trim()) {
        const n = Number(maxHits);
        if (Number.isFinite(n) && n >= 1) body.maxHits = Math.floor(n);
      }
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
        if (!authed && config?.turnstileRequired) resetTurnstile();
        return;
      }
      if (res.data) {
        setCreated(res.data.link);
        setWarnings(res.data.warnings ?? []);
        resetCreateForm();
        if (!authed && config?.turnstileRequired) resetTurnstile();
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
    setError("");
    try {
      if (
        editing.maxHits != null &&
        editMaxHitsBaseline != null &&
        editing.maxHits < editMaxHitsBaseline
      ) {
        setError("Max redirects can only be increased or cleared");
        return;
      }
      const res = await api.update(editing.slug, {
        destination: editing.destination,
        notes: editing.notes,
        expiresAt: editExpiresAt
          ? new Date(editExpiresAt).toISOString()
          : null,
        activeAt: editActiveAt ? new Date(editActiveAt).toISOString() : null,
        oneTime: editing.oneTime,
        maxHits: editing.maxHits,
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
      setEditMaxHitsBaseline(null);
      setEditExpiresAt("");
      setEditActiveAt("");
      setInfo("Link updated");
      await refreshLinks();
      await refreshMeta();
    } finally {
      setBusy(false);
    }
  }

  async function loadHits(slug: string, totalHits = 0) {
    setBusy(true);
    setError("");
    try {
      const res = await api.hits(slug);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.data) {
        setHitChart({ slug, points: res.data.points, totalHits });
      }
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

  async function setStatus(
    slug: string,
    status: "active" | "paused" | "quarantined",
  ) {
    setBusy(true);
    setError("");
    try {
      const res = await api.setStatus(slug, status);
      if (res.error) {
        setError(res.error);
        return;
      }
      setInfo(
        status === "quarantined"
          ? "Link quarantined"
          : status === "paused"
            ? "Link paused"
            : "Link re-enabled",
      );
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
      {authed && (
        <div className="auth-bar">
          <a className="btn secondary" href={api.exportUrl}>
            Export CSV
          </a>
          <button type="button" className="secondary" onClick={() => void onLogout()}>
            Sign out
          </button>
        </div>
      )}

      <header className="hero">
        <p className="brand">{config?.siteTitle ?? "Blink"}</p>
        <p className="tagline">Short links. Instant redirects.</p>
        <p className="host">layurl.com</p>
      </header>

      {!authed && (
        <section className="panel login-panel" aria-label="Admin sign in">
          <p className="login-eyebrow">Admin</p>
          <h2 className="login-title">Sign in</h2>
          <p className="login-copy">Manage links, quarantine abuse, and export CSV.</p>
          <form className="login-form" onSubmit={(e) => void onLogin(e)}>
            <label>
              Password
              <input
                type="password"
                placeholder="Admin password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-label="Admin password"
                autoComplete="current-password"
              />
            </label>
            <button type="submit">Sign in</button>
            {error && <p className="msg error">{error}</p>}
          </form>
        </section>
      )}

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
                onChange={(e) =>
                  setSlug(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ""))
                }
                placeholder="my-link"
                pattern="[A-Za-z0-9_-]+"
                maxLength={64}
                title="Letters, numbers, hyphens, and underscores only"
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
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={oneTime}
                    onChange={(e) => setOneTime(e.target.checked)}
                  />
                  <span>One-time (burn after first redirect)</span>
                </label>
                <label>
                  Max redirects (optional)
                  <input
                    type="number"
                    min={1}
                    max={1_000_000}
                    value={maxHits}
                    onChange={(e) => setMaxHits(e.target.value)}
                    placeholder="Unlimited"
                  />
                </label>
                <label>
                  Active at (optional)
                  <input
                    type="datetime-local"
                    value={activeAt}
                    onChange={(e) => setActiveAt(e.target.value)}
                  />
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
              <div className="turnstile-wrap">
                {(config.turnstileForce || config.turnstileRequired) && (
                  <p className="meta">Public create requires verification.</p>
                )}
                <div id="turnstile-box" aria-label="Cloudflare Turnstile challenge" />
              </div>
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
                    (!config?.turnstileSiteKey || !turnstileToken))
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
              </div>
              {authed && (
                <QrControls
                  slug={created.slug}
                  open={openQrSlugs.has(created.slug)}
                  onToggle={() => toggleQr(created.slug)}
                  onDownload={() => void downloadQr(created.slug)}
                />
              )}
            </div>
          )}
        </section>
      )}

      {!canCreate && (
        <section className="panel">
          <p className="msg">Sign in to create short links, or enable public mode.</p>
        </section>
      )}

      {error && authed && <p className="msg error">{error}</p>}
      {info && <p className="msg ok">{info}</p>}

      {authed && (
        <>
          <section className="panel">
            <h2 style={{ marginTop: 0 }}>Bulk import</h2>
            <p className="meta">
              CSV columns: <code>slug</code>, <code>destination</code>,{" "}
              <code>notes</code>, <code>expires_at</code>, <code>active_at</code>,{" "}
              <code>timezone</code> (<code>UTC</code>, <code>Local</code>,{" "}
              <code>SGT</code>, or IANA e.g. <code>Asia/Singapore</code>),{" "}
              <code>max_hits</code>. Hover the timezone tip by the template
              buttons for the full abbreviation table. Use{" "}
              <strong>Dry-run</strong> first.
            </p>
            <textarea
              rows={5}
              value={importCsv}
              onChange={(e) => setImportCsv(e.target.value)}
              placeholder={
                "slug,destination,notes,expires_at,active_at,timezone,max_hits\nhello,https://example.com,,,,SGT,"
              }
            />
            <div className="import-actions">
              <div className="row import-actions-buttons">
                <div className="tz-ref-wrap">
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={loadBulkImportTemplate}
                  >
                    Load template
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={downloadBulkImportTemplate}
                  >
                    Download template
                  </button>
                  <span
                    className="tz-ref-tip"
                    tabIndex={0}
                    aria-label="Timezone reference table"
                  >
                    Timezone ?
                    <div className="tz-ref-popover" role="tooltip">
                      <p className="tz-ref-title">Timezone column values</p>
                      <p className="tz-ref-note">
                        Naive dates use this zone. Explicit <code>Z</code> /
                        offsets and unix epoch ignore it. Full IANA names also
                        work (e.g. <code>Asia/Singapore</code>).
                      </p>
                      <div className="tz-ref-scroll">
                        <table className="tz-ref-table">
                          <thead>
                            <tr>
                              <th>Code</th>
                              <th>IANA</th>
                              <th>Label</th>
                            </tr>
                          </thead>
                          <tbody>
                            {IMPORT_TIMEZONE_REFERENCE.map((row) => (
                              <tr key={row.code}>
                                <td>
                                  <code>{row.code}</code>
                                </td>
                                <td>
                                  <code>{row.iana}</code>
                                </td>
                                <td>
                                  {row.label}
                                  {row.note ? (
                                    <span className="tz-ref-row-note">
                                      {" "}
                                      — {row.note}
                                    </span>
                                  ) : null}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </span>
                </div>
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

          {instanceStats && (
            <div className="stats-strip" aria-label="Instance summary">
              <span>
                <strong>{instanceStats.totalLinks}</strong> links
              </span>
              <span>
                <strong>{instanceStats.activeLinks}</strong> active
              </span>
              {instanceStats.pausedLinks != null && (
                <span>
                  <strong>{instanceStats.pausedLinks}</strong> paused
                </span>
              )}
              <span>
                <strong>{instanceStats.quarantinedLinks}</strong> quarantined
              </span>
              <span>
                <strong>{instanceStats.hitsToday}</strong> hits today
              </span>
              <span>
                <strong>{instanceStats.hits7d}</strong> hits (7d)
              </span>
              {instanceStats.topSlugs.length > 0 && (
                <span className="stats-strip-top">
                  Top:{" "}
                  {instanceStats.topSlugs
                    .slice(0, 3)
                    .map((t) => `${t.slug} (${t.hits})`)
                    .join(", ")}
                </span>
              )}
            </div>
          )}

          <div className="toolbar">
            <h2 className="toolbar-title">Your links</h2>
            <input
              className="toolbar-filter toolbar-filter-q"
              placeholder="Filter slug, URL, notes"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <input
              className="toolbar-filter toolbar-filter-tag"
              placeholder="Tag filter"
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              list="tag-list"
            />
            <datalist id="tag-list">
              {tags.map((t) => (
                <option key={t.id} value={t.name} />
              ))}
            </datalist>
            <select
              className="toolbar-filter toolbar-filter-folder"
              value={folderFilter}
              onChange={(e) => setFolderFilter(e.target.value)}
              aria-label="Folder filter"
            >
              <option value="">All folders</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <select
              className="toolbar-filter toolbar-filter-status"
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(
                  e.target.value as "all" | "active" | "paused" | "quarantined",
                )
              }
              aria-label="Status filter"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="quarantined">Quarantined</option>
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

          {hitChart && (
            <div className="panel hits-panel" style={{ marginBottom: "1rem" }}>
              <div className="hits-panel-head">
                <div>
                  <h3 className="hits-panel-title">
                    Hits · <code>{hitChart.slug}</code>
                  </h3>
                  <p className="meta" style={{ margin: 0 }}>
                    Last 24 hours (UTC hourly buckets)
                  </p>
                </div>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setHitChart(null)}
                >
                  Close
                </button>
              </div>
              <HitsChart
                points={hitChart.points}
                lifetimeHits={hitChart.totalHits}
              />
            </div>
          )}

          <div className="list">
            {links
              .filter(
                (link) => statusFilter === "all" || link.status === statusFilter,
              )
              .map((link) => (
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
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={Boolean(editing.oneTime)}
                        onChange={(e) =>
                          setEditing({ ...editing, oneTime: e.target.checked })
                        }
                      />
                      <span>One-time (burn after first redirect)</span>
                    </label>
                    <label>
                      Max redirects
                      <input
                        type="number"
                        min={editMaxHitsBaseline ?? 1}
                        max={1_000_000}
                        value={editing.maxHits ?? ""}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === "") {
                            setEditing({ ...editing, maxHits: null });
                            return;
                          }
                          const n = Number(raw);
                          if (!Number.isFinite(n)) return;
                          setEditing({ ...editing, maxHits: Math.floor(n) });
                        }}
                        placeholder="Unlimited"
                      />
                      <span className="meta">
                        Can only increase or clear (not decrease).
                      </span>
                    </label>
                    <label>
                      Expires at
                      <input
                        type="datetime-local"
                        value={editExpiresAt}
                        onChange={(e) => setEditExpiresAt(e.target.value)}
                      />
                    </label>
                    <label>
                      Active at
                      <input
                        type="datetime-local"
                        value={editActiveAt}
                        onChange={(e) => setEditActiveAt(e.target.value)}
                      />
                    </label>
                    <div className="row">
                      <button type="submit" disabled={busy}>
                        Save
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => {
                          setEditing(null);
                          setEditMaxHitsBaseline(null);
                          setEditExpiresAt("");
                          setEditActiveAt("");
                        }}
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
                      <span
                        className={
                          link.status === "quarantined"
                            ? "status-badge status-quarantined"
                            : link.status === "paused"
                              ? "status-badge status-paused"
                              : "status-badge status-active"
                        }
                      >
                        {link.status === "quarantined"
                          ? "quarantined · redirects blocked"
                          : link.status === "paused"
                            ? "paused · redirects blocked"
                            : "active"}
                      </span>
                      {link.hasPassword ? " · password" : ""}
                      {link.oneTime ? " · one-time" : ""}
                      {link.maxHits != null ? ` · max ${link.maxHits}` : ""}
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
                    {link.activeAt && (
                      <p className="meta">
                        active from {formatDateTimeBoth(link.activeAt)}
                      </p>
                    )}
                    <div className="row">
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => {
                          setEditing(link);
                          setEditMaxHitsBaseline(link.maxHits);
                          setEditTags(link.tags.map((t) => t.name).join(", "));
                          setEditExpiresAt(isoToDatetimeLocal(link.expiresAt));
                          setEditActiveAt(isoToDatetimeLocal(link.activeAt));
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
                      <button
                        type="button"
                        className="secondary"
                        disabled={busy}
                        onClick={() => void loadHits(link.slug, link.hits)}
                      >
                        Hits
                      </button>
                      {link.status === "active" && (
                        <>
                          <button
                            type="button"
                            className="secondary"
                            disabled={busy}
                            onClick={() => void setStatus(link.slug, "paused")}
                          >
                            Pause
                          </button>
                          <button
                            type="button"
                            className="secondary"
                            disabled={busy}
                            onClick={() => void setStatus(link.slug, "quarantined")}
                          >
                            Quarantine
                          </button>
                        </>
                      )}
                      {link.status === "paused" && (
                        <>
                          <button
                            type="button"
                            className="secondary"
                            disabled={busy}
                            onClick={() => void setStatus(link.slug, "active")}
                          >
                            Resume
                          </button>
                          <button
                            type="button"
                            className="secondary"
                            disabled={busy}
                            onClick={() => void setStatus(link.slug, "quarantined")}
                          >
                            Quarantine
                          </button>
                        </>
                      )}
                      {link.status === "quarantined" && (
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
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => toggleQr(link.slug)}
                        aria-expanded={openQrSlugs.has(link.slug)}
                      >
                        {openQrSlugs.has(link.slug) ? "Hide QR" : "Show QR"}
                      </button>
                    </div>
                    {openQrSlugs.has(link.slug) && (
                      <QrControls
                        slug={link.slug}
                        open
                        onToggle={() => toggleQr(link.slug)}
                        onDownload={() => void downloadQr(link.slug)}
                        hideToggle
                      />
                    )}
                  </>
                )}
              </article>
            ))}
            {!links.length && <p className="meta">No links yet.</p>}
            {links.length > 0 &&
              statusFilter !== "all" &&
              !links.some((l) => l.status === statusFilter) && (
                <p className="meta">No links match this status filter.</p>
              )}
          </div>
          {nextCursor && (
            <div className="row" style={{ marginTop: "1rem" }}>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => void loadMoreLinks()}
              >
                Load more
              </button>
            </div>
          )}
        </>
      )}

      <footer className="footer">
        Blink · hosted on layurl.com · by{" "}
        <a
          href="https://github.com/kyroskoh"
          target="_blank"
          rel="noopener noreferrer"
        >
          @kyroskoh
        </a>{" "}
        · privacy-respecting redirects
      </footer>
    </div>
  );
}

function QrControls({
  slug,
  open,
  onToggle,
  onDownload,
  hideToggle = false,
}: {
  slug: string;
  open: boolean;
  onToggle: () => void;
  onDownload: () => void;
  hideToggle?: boolean;
}) {
  return (
    <div className="qr-block">
      {!hideToggle && (
        <div className="row">
          <button
            type="button"
            className="secondary"
            onClick={onToggle}
            aria-expanded={open}
          >
            {open ? "Hide QR" : "Show QR"}
          </button>
          {open && (
            <button type="button" className="secondary" onClick={onDownload}>
              Download PNG
            </button>
          )}
        </div>
      )}
      {open && (
        <div className="qr-preview">
          <img
            className="qr"
            src={api.qrUrl(slug)}
            alt={`QR code for ${slug}`}
          />
          {hideToggle && (
            <button type="button" className="secondary" onClick={onDownload}>
              Download PNG
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function hourKeyUtc(d: Date): string {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours()),
  ).toISOString();
}

/** Fill the last 24 UTC hours so sparse aggregates still read as a timeline. */
function fillLast24Hours(
  points: { t: string; hits: number }[],
): { t: string; hits: number; label: string }[] {
  const byHour = new Map(
    points.map((p) => [hourKeyUtc(new Date(p.t)), Number(p.hits) || 0]),
  );
  const end = new Date();
  end.setUTCMinutes(0, 0, 0);
  const out: { t: string; hits: number; label: string }[] = [];
  for (let i = 23; i >= 0; i--) {
    const bucket = new Date(end.getTime() - i * 60 * 60 * 1000);
    const t = hourKeyUtc(bucket);
    const hits = byHour.get(t) ?? 0;
    const hh = String(bucket.getUTCHours()).padStart(2, "0");
    out.push({ t, hits, label: `${hh}:00` });
  }
  return out;
}

function HitsChart({
  points,
  lifetimeHits,
}: {
  points: { t: string; hits: number }[];
  lifetimeHits: number;
}) {
  const series = fillLast24Hours(points);
  const windowTotal = series.reduce((sum, p) => sum + p.hits, 0);
  const peak = series.reduce(
    (best, p) => (p.hits > best.hits ? p : best),
    series[0],
  );
  const max = Math.max(...series.map((p) => p.hits), 1);
  const chartH = 140;

  return (
    <div className="hits-chart-wrap">
      <div className="hits-stats">
        <div className="hits-stat">
          <span className="hits-stat-value">{windowTotal}</span>
          <span className="hits-stat-label">last 24h</span>
        </div>
        <div className="hits-stat">
          <span className="hits-stat-value">{lifetimeHits}</span>
          <span className="hits-stat-label">lifetime</span>
        </div>
        <div className="hits-stat">
          <span className="hits-stat-value">
            {peak.hits > 0 ? peak.hits : "—"}
          </span>
          <span className="hits-stat-label">
            {peak.hits > 0 ? `peak ${peak.label} UTC` : "peak hour"}
          </span>
        </div>
      </div>

      {windowTotal === 0 ? (
        <p className="meta hits-empty">
          No redirects recorded in the last 24 hours
          {lifetimeHits > 0
            ? " (lifetime hits may predate this window or still be flushing)."
            : "."}
        </p>
      ) : (
        <>
          <div
            className="hits-bars"
            role="img"
            aria-label={`Hourly hits for the last 24 hours, total ${windowTotal}`}
          >
            {series.map((p) => {
              const pct = Math.max((p.hits / max) * 100, p.hits > 0 ? 6 : 0);
              const hour = p.label.slice(0, 2);
              const isTick = Number(hour) % 2 === 0;
              const tip = `${p.label} UTC · ${p.hits} hit${p.hits === 1 ? "" : "s"}`;
              return (
                <div
                  className={`hits-bar-col${p.hits > 0 ? " has-hits" : ""}`}
                  key={p.t}
                  data-tip={tip}
                  tabIndex={0}
                  aria-label={tip}
                >
                  <div className="hits-bar-track" style={{ height: chartH }}>
                    {p.hits > 0 && (
                      <span className="hits-bar-count">{p.hits}</span>
                    )}
                    <div
                      className={`hits-bar${p.hits > 0 ? " is-active" : ""}`}
                      style={{ height: `${pct}%` }}
                    />
                  </div>
                  <span
                    className={`hits-bar-label${isTick ? " is-tick" : ""}`}
                  >
                    {hour}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="meta hits-axis-hint">UTC hour →</p>
        </>
      )}
    </div>
  );
}
