function bool(v: string | undefined, fallback: boolean): boolean {
  if (v === undefined || v === "") return fallback;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

function int(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  port: int(process.env.PORT, 3000),
  baseUrl: (process.env.BLINK_BASE_URL ?? "http://localhost").replace(/\/$/, ""),
  siteTitle: process.env.BLINK_SITE_TITLE ?? "Blink",
  password: process.env.BLINK_PASSWORD ?? "changeme",
  apiKey: process.env.BLINK_API_KEY ?? "changeme-api-key",
  publicMode: bool(process.env.BLINK_PUBLIC_MODE, false),
  disableFrontend: bool(process.env.BLINK_DISABLE_FRONTEND, false),
  extraProtocols: (process.env.BLINK_EXTRA_PROTOCOLS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  slugLength: int(process.env.BLINK_SLUG_LENGTH, 8),
  rateLimitMax: int(process.env.BLINK_RATE_LIMIT_MAX, 120),
  rateLimitWindowSec: int(process.env.BLINK_RATE_LIMIT_WINDOW_SEC, 60),
  cacheTtlSec: int(process.env.BLINK_CACHE_TTL_SEC, 300),
  sessionSecret: process.env.BLINK_SESSION_SECRET ?? "dev-session-secret-change-me",
  turnstileSiteKey: process.env.BLINK_TURNSTILE_SITE_KEY ?? "",
  turnstileSecretKey: process.env.BLINK_TURNSTILE_SECRET_KEY ?? "",
  turnstileForce: bool(process.env.BLINK_TURNSTILE_FORCE, false),
  urlCheckProvider: (process.env.BLINK_URL_CHECK_PROVIDER ?? "none").toLowerCase() as
    | "none"
    | "blocklist"
    | "http",
  urlCheckBlocklistPath: process.env.BLINK_URL_CHECK_BLOCKLIST_PATH ?? "",
  urlCheckHttpUrl: process.env.BLINK_URL_CHECK_HTTP_URL ?? "",
  landingPage: process.env.BLINK_LANDING_PAGE ?? "",
  previewTtlSec: int(process.env.BLINK_PREVIEW_TTL_SEC, 3600),
  databaseUrl:
    process.env.DATABASE_URL ?? "postgres://blink:blink@localhost:5432/blink",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
};

export function shortUrl(slug: string): string {
  return `${config.baseUrl}/${slug}`;
}
