import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { getLinkRow } from "./links.js";
import { previewCacheGet, previewCacheSet } from "./redis.js";

export type PreviewResult =
  | { ok: true; title: string | null; favicon: string | null; cached: boolean }
  | { ok: false; status: number; error: string; message: string };

const PRIVATE_RANGES = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^::1$/,
  /^fc/i,
  /^fd/i,
  /^fe80:/i,
];

export function isPrivateIp(ip: string): boolean {
  return PRIVATE_RANGES.some((re) => re.test(ip));
}

async function assertSafeUrl(raw: string): Promise<
  { ok: true; url: URL } | { ok: false; message: string }
> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, message: "Invalid destination URL" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, message: "Preview only supports http(s) destinations" };
  }
  const host = url.hostname;
  if (host === "localhost" || host.endsWith(".localhost")) {
    return { ok: false, message: "Preview blocked for private hosts" };
  }
  if (isIP(host)) {
    if (isPrivateIp(host)) {
      return { ok: false, message: "Preview blocked for private IP" };
    }
  } else {
    try {
      const records = await lookup(host, { all: true });
      for (const r of records) {
        if (isPrivateIp(r.address)) {
          return { ok: false, message: "Preview blocked for private IP" };
        }
      }
    } catch {
      return { ok: false, message: "Could not resolve destination host" };
    }
  }
  return { ok: true, url };
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function parseTitle(html: string): string | null {
  const og =
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(html) ||
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i.exec(html);
  if (og?.[1]) {
    const t = decodeEntities(og[1]);
    if (t) return t;
  }
  const m = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
  if (!m) return null;
  return decodeEntities(m[1]) || null;
}

function parseFavicon(html: string, base: URL): string | null {
  const icon =
    /<link[^>]+rel=["'](?:shortcut )?icon["'][^>]*>/i.exec(html) ||
    /<link[^>]+rel=["']apple-touch-icon["'][^>]*>/i.exec(html);
  if (icon) {
    const href = /href=["']([^"']+)["']/i.exec(icon[0]);
    if (href?.[1]) {
      try {
        return new URL(href[1], base).toString();
      } catch {
        /* fall through */
      }
    }
  }
  return new URL("/favicon.ico", base).toString();
}

function isHtmlContentType(ct: string | null): boolean {
  if (!ct) return true;
  return /text\/html|application\/xhtml\+xml/i.test(ct);
}

export async function getLinkPreview(slug: string): Promise<PreviewResult> {
  const cached = await previewCacheGet(slug);
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as {
        title: string | null;
        favicon: string | null;
      };
      return {
        ok: true,
        title: parsed.title,
        favicon: parsed.favicon,
        cached: true,
      };
    } catch {
      /* refetch */
    }
  }

  const row = await getLinkRow(slug);
  if (!row) {
    return { ok: false, status: 404, error: "not_found", message: "Link not found" };
  }

  const safe = await assertSafeUrl(row.destination);
  if (!safe.ok) {
    return { ok: false, status: 400, error: "preview_blocked", message: safe.message };
  }

  let html = "";
  let pageUrl = safe.url;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(safe.url.toString(), {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        // Browser-like UA — many hosts 404/403 custom bot agents
        "user-agent":
          "Mozilla/5.0 (compatible; BlinkPreview/0.3; +https://layurl.com)",
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
      },
    });
    clearTimeout(timer);

    const finalUrl = new URL(res.url);
    const finalSafe = await assertSafeUrl(finalUrl.toString());
    if (!finalSafe.ok) {
      return {
        ok: false,
        status: 400,
        error: "preview_blocked",
        message: finalSafe.message,
      };
    }
    pageUrl = finalSafe.url;

    // Soft-fail: still unfurl HTML from 4xx/5xx error pages when present
    if (!res.ok && !isHtmlContentType(res.headers.get("content-type"))) {
      const payload = {
        title: safe.url.hostname,
        favicon: new URL("/favicon.ico", safe.url).toString(),
      };
      await previewCacheSet(slug, JSON.stringify(payload));
      return { ok: true, ...payload, cached: false };
    }

    html = await res.text();
    if (html.length > 512_000) html = html.slice(0, 512_000);
  } catch {
    // Network failure — still return a useful hostname fallback
    const payload = {
      title: safe.url.hostname,
      favicon: new URL("/favicon.ico", safe.url).toString(),
    };
    await previewCacheSet(slug, JSON.stringify(payload));
    return { ok: true, ...payload, cached: false };
  }

  const title = parseTitle(html) ?? pageUrl.hostname;
  const favicon = parseFavicon(html, pageUrl);
  const payload = { title, favicon };
  await previewCacheSet(slug, JSON.stringify(payload));
  return { ok: true, ...payload, cached: false };
}
