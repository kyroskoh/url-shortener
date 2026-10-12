import { readFileSync, existsSync } from "node:fs";

export type UrlCheckResult =
  | { ok: true }
  | { ok: false; reason: string };

type Provider = "none" | "blocklist" | "http";

function provider(): Provider {
  const v = (process.env.BLINK_URL_CHECK_PROVIDER ?? "none").toLowerCase();
  if (v === "blocklist" || v === "http") return v;
  return "none";
}

function blocklistPath(): string {
  return process.env.BLINK_URL_CHECK_BLOCKLIST_PATH ?? "";
}

function httpUrl(): string {
  return process.env.BLINK_URL_CHECK_HTTP_URL ?? "";
}

function httpTimeoutMs(): number {
  const raw = Number(process.env.BLINK_URL_CHECK_HTTP_TIMEOUT_MS ?? "5000");
  if (!Number.isFinite(raw) || raw < 100) return 5000;
  return Math.min(raw, 60_000);
}

let blocklistCache: { path: string; hosts: Set<string>; loadedAt: number } | null =
  null;

function loadBlocklist(): Set<string> {
  const path = blocklistPath();
  if (!path) return new Set();
  const now = Date.now();
  if (
    blocklistCache &&
    blocklistCache.path === path &&
    now - blocklistCache.loadedAt < 60_000
  ) {
    return blocklistCache.hosts;
  }
  if (!existsSync(path)) {
    blocklistCache = { path, hosts: new Set(), loadedAt: now };
    return blocklistCache.hosts;
  }
  const hosts = new Set(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((l) => l.trim().toLowerCase())
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => l.replace(/^https?:\/\//, "").split("/")[0] ?? "")
      .filter(Boolean),
  );
  blocklistCache = { path, hosts, loadedAt: now };
  return hosts;
}

function hostnameOf(destination: string): string | null {
  try {
    return new URL(destination).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isIpLiteral(host: string): boolean {
  // IPv4 or bracket-stripped IPv6
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  if (host.includes(":")) return true;
  return false;
}

/** True if host equals a blocked entry or is a subdomain of one (not for IP literals). */
export function hostMatchesBlocklist(host: string, blocked: Set<string>): boolean {
  const h = host.toLowerCase();
  if (blocked.has(h)) return true;
  if (isIpLiteral(h)) return false;
  for (const entry of blocked) {
    if (!entry || isIpLiteral(entry)) continue;
    if (h === entry || h.endsWith(`.${entry}`)) return true;
  }
  return false;
}

/** Check destination against configured provider before create/edit. */
export async function checkDestinationUrl(
  destination: string,
): Promise<UrlCheckResult> {
  const mode = provider();
  if (mode === "none") return { ok: true };

  const host = hostnameOf(destination);

  if (mode === "blocklist") {
    if (!blocklistPath()) {
      return {
        ok: false,
        reason:
          "URL blocklist provider enabled but BLINK_URL_CHECK_BLOCKLIST_PATH is empty",
      };
    }
    const list = loadBlocklist();
    if (host && hostMatchesBlocklist(host, list)) {
      return { ok: false, reason: `Destination host is blocklisted: ${host}` };
    }
    return { ok: true };
  }

  if (mode === "http") {
    if (!httpUrl()) {
      return {
        ok: false,
        reason: "HTTP URL check enabled but BLINK_URL_CHECK_HTTP_URL is empty",
      };
    }
    const timeoutMs = httpTimeoutMs();
    try {
      const res = await fetch(httpUrl(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: destination, host }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        return { ok: false, reason: `URL check provider returned HTTP ${res.status}` };
      }
      const data = (await res.json()) as {
        ok?: boolean;
        allowed?: boolean;
        reason?: string;
      };
      const allowed = data.ok === true || data.allowed === true;
      if (!allowed) {
        return {
          ok: false,
          reason: data.reason ?? "Destination rejected by URL check provider",
        };
      }
      return { ok: true };
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "TimeoutError" || name === "AbortError") {
        return {
          ok: false,
          reason: `URL check provider timed out after ${timeoutMs}ms`,
        };
      }
      return {
        ok: false,
        reason: `URL check provider request failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  return { ok: true };
}

export function clearBlocklistCache(): void {
  blocklistCache = null;
}
