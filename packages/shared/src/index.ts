import { z } from "zod";

export const RESERVED_SLUGS = new Set([
  // App / API routes
  "api",
  "admin",
  "app",
  "auth",
  "login",
  "logout",
  "config",
  "links",
  "tags",
  "folders",
  "r",
  "docs",
  "health",
  "healthz",
  "ready",
  "readyz",
  "metrics",
  "prometheus",
  "site-home",
  // Static / SEO / well-known
  "assets",
  "static",
  "public",
  "css",
  "js",
  "img",
  "images",
  "media",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
  "well-known",
  // Brand / product paths
  "blink",
  "layurl",
  "lay",
  "url",
  "urls",
  "direct",
  "redirect",
  "short",
  "shorten",
  "shortener",
  "link",
  "go",
  "out",
  "click",
  "jump",
  // Auth / account
  "oauth",
  "sso",
  "callback",
  "account",
  "accounts",
  "user",
  "users",
  "me",
  "session",
  "sessions",
  "register",
  "registration",
  "signup",
  "sign-up",
  "signin",
  "sign-in",
  "signout",
  "sign-out",
  "join",
  "subscribe",
  "unsubscribe",
  "password",
  "passwd",
  "reset",
  "forgot",
  "forgot-password",
  "reset-password",
  "change-password",
  "verify",
  "verification",
  "confirm",
  "confirmation",
  "activate",
  "activation",
  "invite",
  "invitation",
  "profile",
  "profiles",
  "member",
  "members",
  "membership",
  "billing",
  "checkout",
  "pricing",
  "plans",
  "onboarding",
  "welcome",

  // Ops / marketing pages operators often want
  "status",
  "dashboard",
  "console",
  "panel",
  "settings",
  "help",
  "support",
  "about",
  "contact",
  "terms",
  "privacy",
  "legal",
  "tos",
  "blog",
  "news",
  "press",
  // Integrations / features
  "webhook",
  "webhooks",
  "hooks",
  "qr",
  "preview",
  "stats",
  "analytics",
  "export",
  "import",
  "swagger",
  "openapi",
  // Common probes / traps
  "www",
  "home",
  "index",
  "null",
  "undefined",
  "wp-admin",
  "wordpress",
  ".git",
  "env",
  "",
]);

export const DANGEROUS_SCHEMES = new Set([
  "javascript",
  "data",
  "vbscript",
  "file",
  "about",
  "blob",
]);

export const DEFAULT_PROTOCOLS = new Set(["http", "https", "ftp", "magnet"]);

/** Allowed slug characters: letters, digits, hyphen, underscore only. */
export const SLUG_PATTERN = /^[a-zA-Z0-9_-]+$/;

export function isValidSlug(slug: string): boolean {
  return (
    typeof slug === "string" &&
    slug.length >= 1 &&
    slug.length <= 64 &&
    SLUG_PATTERN.test(slug)
  );
}

export const slugSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(SLUG_PATTERN, "Slug may only contain letters, numbers, hyphens, and underscores");

const utmField = z.string().max(256).optional().nullable();

export const createLinkSchema = z.object({
  destination: z.string().min(1).max(8192),
  slug: slugSchema.optional(),
  notes: z.string().max(2000).optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
  turnstileToken: z.string().optional(),
  utmSource: utmField,
  utmMedium: utmField,
  utmCampaign: utmField,
  utmTerm: utmField,
  utmContent: utmField,
  password: z.string().min(1).max(256).optional().nullable(),
  oneTime: z.boolean().optional(),
  maxHits: z.number().int().min(1).max(1_000_000).optional().nullable(),
  tagNames: z.array(z.string().min(1).max(64)).max(50).optional(),
  tagIds: z.array(z.string().uuid()).max(50).optional(),
  folderId: z.string().uuid().optional().nullable(),
});

export const linkStatusSchema = z.enum(["active", "quarantined"]);

export const updateLinkSchema = z.object({
  destination: z.string().min(1).max(8192).optional(),
  notes: z.string().max(2000).optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
  status: linkStatusSchema.optional(),
  password: z.string().min(1).max(256).optional().nullable(),
  clearPassword: z.boolean().optional(),
  oneTime: z.boolean().optional(),
  maxHits: z.number().int().min(1).max(1_000_000).optional().nullable(),
  tagNames: z.array(z.string().min(1).max(64)).max(50).optional(),
  tagIds: z.array(z.string().uuid()).max(50).optional(),
  folderId: z.string().uuid().optional().nullable(),
});

export type CreateLinkInput = z.infer<typeof createLinkSchema>;
export type UpdateLinkInput = z.infer<typeof updateLinkSchema>;
export type LinkStatus = z.infer<typeof linkStatusSchema>;

export type UtmParams = {
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmTerm?: string | null;
  utmContent?: string | null;
};

/** Merge UTM query params into an http(s) destination without dropping existing query keys. */
export function applyUtmParams(destination: string, utm: UtmParams): string {
  const map: [string, string | null | undefined][] = [
    ["utm_source", utm.utmSource],
    ["utm_medium", utm.utmMedium],
    ["utm_campaign", utm.utmCampaign],
    ["utm_term", utm.utmTerm],
    ["utm_content", utm.utmContent],
  ];
  const hasAny = map.some(([, v]) => v != null && String(v).trim() !== "");
  if (!hasAny) return destination;

  let url: URL;
  try {
    url = new URL(destination);
  } catch {
    return destination;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return destination;
  }
  for (const [key, value] of map) {
    if (value != null && String(value).trim() !== "") {
      url.searchParams.set(key, String(value).trim());
    }
  }
  return url.toString();
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.toLowerCase());
}

export function parseDestination(
  raw: string,
  extraProtocols: string[] = [],
): { ok: true; url: string; scheme: string } | { ok: false; error: string } {
  const trimmed = raw.trim();
  let scheme = "";
  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(trimmed);
  if (schemeMatch) {
    scheme = schemeMatch[1].toLowerCase();
  } else {
    return { ok: false, error: "Destination must include a URL scheme" };
  }

  if (DANGEROUS_SCHEMES.has(scheme)) {
    return { ok: false, error: `Scheme not allowed: ${scheme}` };
  }

  const allowed = new Set([
    ...DEFAULT_PROTOCOLS,
    ...extraProtocols.map((p) => p.trim().toLowerCase()).filter(Boolean),
  ]);

  if (!allowed.has(scheme)) {
    return { ok: false, error: `Scheme not allowed: ${scheme}` };
  }

  if (scheme === "http" || scheme === "https") {
    try {
      const u = new URL(trimmed);
      if (!u.hostname) {
        return { ok: false, error: "Invalid URL host" };
      }
      return { ok: true, url: u.toString(), scheme };
    } catch {
      return { ok: false, error: "Invalid URL" };
    }
  }

  return { ok: true, url: trimmed, scheme };
}

export type TagDto = {
  id: string;
  name: string;
};

export type FolderDto = {
  id: string;
  name: string;
  parentId: string | null;
};

export type LinkDto = {
  slug: string;
  destination: string;
  notes: string | null;
  status: LinkStatus;
  hits: number;
  lastHitAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  shortUrl: string;
  hasPassword: boolean;
  oneTime: boolean;
  maxHits: number | null;
  folderId: string | null;
  tags: TagDto[];
};
