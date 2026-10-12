import { z } from "zod";

export const RESERVED_SLUGS = new Set([
  "api",
  "admin",
  "app",
  "login",
  "logout",
  "healthz",
  "readyz",
  "docs",
  "assets",
  "static",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
  "site-home",
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

export const slugSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9_-]+$/, "Slug must be alphanumeric, hyphen, or underscore");

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
  folderId: string | null;
  tags: TagDto[];
};
