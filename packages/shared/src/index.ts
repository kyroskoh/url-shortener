import { z } from "zod";

export const RESERVED_SLUGS = new Set([
  "api",
  "admin",
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

export const createLinkSchema = z.object({
  destination: z.string().min(1).max(8192),
  slug: slugSchema.optional(),
  notes: z.string().max(2000).optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
  turnstileToken: z.string().optional(),
});

export const updateLinkSchema = z.object({
  destination: z.string().min(1).max(8192).optional(),
  notes: z.string().max(2000).optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
});

export type CreateLinkInput = z.infer<typeof createLinkSchema>;
export type UpdateLinkInput = z.infer<typeof updateLinkSchema>;

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

export type LinkDto = {
  slug: string;
  destination: string;
  notes: string | null;
  hits: number;
  lastHitAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  shortUrl: string;
};
