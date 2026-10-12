import { config } from "./config.js";

function page(title: string, headline: string, detail: string): string {
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
    <p style="margin-top:1.5rem"><a href="${escapeHtml(config.baseUrl)}/">Go home</a></p>
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
  return page("Expired", "Link expired", "This short link has expired and is no longer available.");
}

export function quarantinedPage(): string {
  return page(
    "Unavailable",
    "Link unavailable",
    "This short link has been disabled by an administrator and cannot be opened.",
  );
}
