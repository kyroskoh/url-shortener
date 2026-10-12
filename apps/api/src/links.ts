import { desc, eq, ilike, or, sql } from "drizzle-orm";
import {
  createLinkSchema,
  isReservedSlug,
  linkStatusSchema,
  parseDestination,
  updateLinkSchema,
  type CreateLinkInput,
  type LinkDto,
  type LinkStatus,
  type UpdateLinkInput,
} from "@blink/shared";
import { config, shortUrl } from "./config.js";
import { db } from "./db/client.js";
import { links, type Link } from "./db/schema.js";
import { cacheDel, cacheGet, cacheSet, bumpHit } from "./redis.js";
import { randomSlug } from "./slug.js";
import { checkDestinationUrl } from "./url-check.js";

function toDto(row: Link): LinkDto {
  const status = (row.status === "quarantined" ? "quarantined" : "active") as LinkStatus;
  return {
    slug: row.slug,
    destination: row.destination,
    notes: row.notes,
    status,
    hits: Number(row.hits),
    lastHitAt: row.lastHitAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    shortUrl: shortUrl(row.slug),
  };
}

function isExpired(row: Link): boolean {
  return Boolean(row.expiresAt && row.expiresAt.getTime() <= Date.now());
}

export async function listLinks(q?: string): Promise<LinkDto[]> {
  let rows: Link[];
  if (q && q.trim()) {
    const pattern = `%${q.trim()}%`;
    rows = await db
      .select()
      .from(links)
      .where(
        or(
          ilike(links.slug, pattern),
          ilike(links.destination, pattern),
          ilike(links.notes, pattern),
        ),
      )
      .orderBy(desc(links.createdAt));
  } else {
    rows = await db.select().from(links).orderBy(desc(links.createdAt));
  }
  return rows.map(toDto);
}

export async function getLink(slug: string): Promise<LinkDto | null> {
  const [row] = await db.select().from(links).where(eq(links.slug, slug)).limit(1);
  return row ? toDto(row) : null;
}

export async function findDuplicates(destination: string): Promise<string[]> {
  const rows = await db
    .select({ slug: links.slug })
    .from(links)
    .where(eq(links.destination, destination));
  return rows.map((r) => r.slug);
}

export type CreateResult =
  | { ok: true; link: LinkDto; warnings: string[] }
  | { ok: false; status: number; error: string; message: string };

export async function createLink(input: CreateLinkInput): Promise<CreateResult> {
  const parsed = createLinkSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      error: "validation_error",
      message: parsed.error.errors[0]?.message ?? "Invalid input",
    };
  }

  const dest = parseDestination(parsed.data.destination, config.extraProtocols);
  if (!dest.ok) {
    return { ok: false, status: 400, error: "invalid_destination", message: dest.error };
  }

  const urlCheck = await checkDestinationUrl(dest.url);
  if (!urlCheck.ok) {
    return {
      ok: false,
      status: 400,
      error: "url_check_failed",
      message: urlCheck.reason,
    };
  }

  let slug = parsed.data.slug?.trim() || randomSlug();
  if (isReservedSlug(slug)) {
    return {
      ok: false,
      status: 400,
      error: "reserved_slug",
      message: "This slug is reserved",
    };
  }

  const existing = await getLink(slug);
  if (existing) {
    if (parsed.data.slug) {
      return {
        ok: false,
        status: 409,
        error: "slug_taken",
        message: "Slug already exists",
      };
    }
    for (let i = 0; i < 5; i++) {
      slug = randomSlug();
      if (!(await getLink(slug))) break;
    }
  }

  const warnings: string[] = [];
  const dupes = await findDuplicates(dest.url);
  if (dupes.length) warnings.push("duplicate_destination");

  const expiresAt = parsed.data.expiresAt
    ? new Date(parsed.data.expiresAt)
    : null;

  const [row] = await db
    .insert(links)
    .values({
      slug,
      destination: dest.url,
      notes: parsed.data.notes ?? null,
      status: "active",
      expiresAt,
    })
    .returning();

  return { ok: true, link: toDto(row), warnings };
}

export async function updateLink(
  slug: string,
  input: UpdateLinkInput,
): Promise<CreateResult> {
  const parsed = updateLinkSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      error: "validation_error",
      message: parsed.error.errors[0]?.message ?? "Invalid input",
    };
  }

  const current = await getLink(slug);
  if (!current) {
    return { ok: false, status: 404, error: "not_found", message: "Link not found" };
  }

  let destination = current.destination;
  if (parsed.data.destination !== undefined) {
    const dest = parseDestination(parsed.data.destination, config.extraProtocols);
    if (!dest.ok) {
      return { ok: false, status: 400, error: "invalid_destination", message: dest.error };
    }
    const urlCheck = await checkDestinationUrl(dest.url);
    if (!urlCheck.ok) {
      return {
        ok: false,
        status: 400,
        error: "url_check_failed",
        message: urlCheck.reason,
      };
    }
    destination = dest.url;
  }

  const nextStatus = parsed.data.status ?? current.status;

  const [row] = await db
    .update(links)
    .set({
      destination,
      notes: parsed.data.notes === undefined ? undefined : parsed.data.notes,
      status: nextStatus,
      expiresAt:
        parsed.data.expiresAt === undefined
          ? undefined
          : parsed.data.expiresAt
            ? new Date(parsed.data.expiresAt)
            : null,
      updatedAt: new Date(),
    })
    .where(eq(links.slug, slug))
    .returning();

  await cacheDel(slug);
  return { ok: true, link: toDto(row), warnings: [] };
}

export async function setLinkStatus(
  slug: string,
  status: LinkStatus,
): Promise<CreateResult> {
  const parsed = linkStatusSchema.safeParse(status);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      error: "validation_error",
      message: "Status must be active or quarantined",
    };
  }
  return updateLink(slug, { status: parsed.data });
}

export async function deleteLink(slug: string): Promise<boolean> {
  const result = await db.delete(links).where(eq(links.slug, slug)).returning();
  await cacheDel(slug);
  return result.length > 0;
}

export type ResolveResult =
  | { status: "ok"; destination: string }
  | { status: "missing" }
  | { status: "expired" }
  | { status: "quarantined" };

export async function resolveRedirect(slug: string): Promise<ResolveResult> {
  if (isReservedSlug(slug)) return { status: "missing" };

  const [row] = await db.select().from(links).where(eq(links.slug, slug)).limit(1);
  if (!row) return { status: "missing" };
  if (row.status === "quarantined") {
    await cacheDel(slug);
    return { status: "quarantined" };
  }
  if (isExpired(row)) return { status: "expired" };

  const cached = await cacheGet(slug);
  if (cached) {
    void bumpHit(slug);
    return { status: "ok", destination: cached };
  }

  await cacheSet(slug, row.destination);
  void bumpHit(slug);
  return { status: "ok", destination: row.destination };
}

export async function flushHitCounters(counts: Map<string, number>): Promise<void> {
  for (const [slug, n] of counts) {
    await db
      .update(links)
      .set({
        hits: sql`${links.hits} + ${n}`,
        lastHitAt: new Date(),
      })
      .where(eq(links.slug, slug));
  }
}

export async function exportCsv(): Promise<string> {
  const rows = await listLinks();
  const header =
    "slug,destination,notes,status,hits,lastHitAt,expiresAt,createdAt,shortUrl";
  const lines = rows.map((r) =>
    [
      r.slug,
      csvEscape(r.destination),
      csvEscape(r.notes ?? ""),
      r.status,
      r.hits,
      r.lastHitAt ?? "",
      r.expiresAt ?? "",
      r.createdAt,
      r.shortUrl,
    ].join(","),
  );
  return [header, ...lines].join("\n");
}

function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
