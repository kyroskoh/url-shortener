import { config } from "./config.js";

function formatAbuseContactHtml(raw: string): string {
  const contact = raw.trim();
  if (!contact) return "";
  if (/^https?:\/\//i.test(contact)) {
    const href = escapeHtml(contact);
    return `<a href="${href}">${href}</a>`;
  }
  if (/^mailto:/i.test(contact)) {
    const href = escapeHtml(contact);
    const label = escapeHtml(contact.replace(/^mailto:/i, ""));
    return `<a href="${href}">${label}</a>`;
  }
  if (contact.includes("@") && !/\s/.test(contact)) {
    const esc = escapeHtml(contact);
    return `<a href="mailto:${esc}">${esc}</a>`;
  }
  return escapeHtml(contact);
}

function abuseContactBlock(): string {
  const contact = config.abuseContact.trim();
  if (!contact) return "";
  return `<p style="margin-top:1rem;color:var(--muted);line-height:1.5">To report abuse: ${formatAbuseContactHtml(contact)}</p>`;
}

function page(
  title: string,
  headline: string,
  detail: string,
  opts?: { showAbuseContact?: boolean },
): string {
  const abuse =
    opts?.showAbuseContact && config.abuseContact.trim()
      ? abuseContactBlock()
      : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} · ${config.siteTitle}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=Source+Sans+3:wght@400;600&display=swap" rel="stylesheet" />
  <style>
    :root {
      --bg: #0f1c17;
      --fg: #e8f0eb;
      --muted: #9bb0a4;
      --accent: #3d9b6a;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh; display: grid; place-items: center;
      font-family: "Source Sans 3", system-ui, sans-serif;
      color: var(--fg);
      background:
        radial-gradient(ellipse 80% 50% at 20% 0%, #1a3d2e 0%, transparent 55%),
        radial-gradient(ellipse 60% 40% at 90% 100%, #243528 0%, transparent 50%),
        var(--bg);
    }
    main { text-align: center; padding: 2rem; max-width: 28rem; }
    .brand { font-family: Fraunces, Georgia, serif; font-size: 2.5rem; letter-spacing: -0.02em; margin: 0 0 0.25rem; }
    .host { color: var(--muted); font-size: 0.95rem; margin-bottom: 2rem; }
    h1 { font-size: 1.35rem; font-weight: 600; margin: 0 0 0.75rem; }
    p { color: var(--muted); line-height: 1.5; margin: 0; }
    a { color: var(--accent); }
  </style>
</head>
<body>
  <main>
    <p class="brand">${escapeHtml(config.siteTitle)}</p>
    <p class="host">layurl.com</p>
    <h1>${escapeHtml(headline)}</h1>
    <p>${escapeHtml(detail)}</p>
    ${abuse}
    <p style="margin-top:1.5rem"><a href="${escapeHtml(config.baseUrl)}/admin/">Go home</a></p>
  </main>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function notFoundPage(): string {
  return page("Not found", "Link not found", "This short link does not exist or was removed.");
}

export function gonePage(): string {
  return page(
    "Expired",
    "Link expired",
    "This short link has expired and is no longer available.",
    { showAbuseContact: true },
  );
}

export function quarantinedPage(): string {
  return page(
    "Unavailable",
    "Link unavailable",
    "This short link has been disabled by an administrator and cannot be opened.",
    { showAbuseContact: true },
  );
}

export function pausedPage(): string {
  return page(
    "Paused",
    "Link paused",
    "This short link is temporarily paused and cannot be opened right now.",
    { showAbuseContact: true },
  );
}

export function notYetActivePage(): string {
  return page(
    "Not yet active",
    "Link not yet active",
    "This short link is scheduled and is not available yet.",
    { showAbuseContact: true },
  );
}

export function passwordGatePage(slug: string, error?: string): string {
  const action = `/api/r/${encodeURIComponent(slug)}/unlock`;
  const err = error
    ? `<p style="color:#e07a7a;margin:0 0 1rem">${escapeHtml(error)}</p>`
    : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Password · ${escapeHtml(config.siteTitle)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=Source+Sans+3:wght@400;600&display=swap" rel="stylesheet" />
  <style>
    :root {
      --bg: #0f1c17;
      --fg: #e8f0eb;
      --muted: #9bb0a4;
      --accent: #3d9b6a;
      --panel: #162820;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh; display: grid; place-items: center;
      font-family: "Source Sans 3", system-ui, sans-serif;
      color: var(--fg);
      background:
        radial-gradient(ellipse 80% 50% at 20% 0%, #1a3d2e 0%, transparent 55%),
        radial-gradient(ellipse 60% 40% at 90% 100%, #243528 0%, transparent 50%),
        var(--bg);
    }
    main { text-align: center; padding: 2rem; max-width: 28rem; width: 100%; }
    .brand { font-family: Fraunces, Georgia, serif; font-size: 2.5rem; letter-spacing: -0.02em; margin: 0 0 0.25rem; }
    .host { color: var(--muted); font-size: 0.95rem; margin-bottom: 2rem; }
    h1 { font-size: 1.35rem; font-weight: 600; margin: 0 0 0.75rem; }
    p { color: var(--muted); line-height: 1.5; margin: 0 0 1rem; }
    form {
      display: flex; flex-direction: column; gap: 0.75rem;
      background: var(--panel); padding: 1.25rem; border-radius: 0.75rem;
      text-align: left;
    }
    label { font-size: 0.9rem; color: var(--muted); }
    input {
      width: 100%; padding: 0.65rem 0.75rem; border-radius: 0.4rem;
      border: 1px solid #2a4a3a; background: #0f1c17; color: var(--fg);
      font: inherit;
    }
    button {
      margin-top: 0.25rem; padding: 0.7rem 1rem; border: 0; border-radius: 0.4rem;
      background: var(--accent); color: #04140c; font-weight: 600; font: inherit; cursor: pointer;
    }
    a { color: var(--accent); }
  </style>
</head>
<body>
  <main>
    <p class="brand">${escapeHtml(config.siteTitle)}</p>
    <p class="host">layurl.com</p>
    <h1>Password required</h1>
    <p>Enter the password to open this short link.</p>
    ${err}
    <form method="post" action="${escapeHtml(action)}">
      <label for="password">Password</label>
      <input id="password" name="password" type="password" required autocomplete="current-password" />
      <button type="submit">Continue</button>
    </form>
    <p style="margin-top:1.5rem"><a href="${escapeHtml(config.baseUrl)}/admin/">Go home</a></p>
  </main>
</body>
</html>`;
}