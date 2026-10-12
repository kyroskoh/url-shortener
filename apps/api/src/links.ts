import { and, asc, desc, eq, gte, ilike, inArray, lt, lte, or, sql } from "drizzle-orm";
import {
  applyUtmParams,
  createLinkSchema,
  isReservedSlug,
  isValidSlug,
  linkStatusSchema,
  parseDestination,
  updateLinkSchema,
  type CreateLinkInput,
  type LinkDto,
  type LinkStatus,
  type TagDto,
  type UpdateLinkInput,
} from "@blink/shared";
import { hashLinkPassword } from "./auth.js";
import { config, shortUrl } from "./config.js";
import { db } from "./db/client.js";
import { hitAggregates, linkTags, links, tags, type Link } from "./db/schema.js";
import {
  cacheDel,
  cacheGet,
  cacheSet,
  bumpHit,
  pendingHits,
  previewCacheDel,
} from "./redis.js";
import { cacheHitsTotal, cacheMissesTotal, redirectsTotal } from "./metrics.js";
import { randomSlug } from "./slug.js";
import {
  folderExists,
  setLinkTags,
  tagsForSlugs,
} from "./tags-folders.js";
import { checkDestinationUrl } from "./url-check.js";
import { notifyHitWebhook } from "./webhooks.js";

async function toDto(row: Link, tagList?: TagDto[]): Promise<LinkDto> {
  const status = (row.status === "quarantined" ? "quarantined" : "active") as LinkStatus;
  const resolvedTags =
    tagList ??
    (await tagsForSlugs([row.slug])).get(row.slug) ??
    [];
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
    hasPassword: Boolean(row.passwordHash),
    oneTime: Boolean(row.oneTime),
    maxHits: row.maxHits ?? null,
    folderId: row.folderId,
    tags: resolvedTags,
  };
}

function isExpired(row: Link): boolean {
  return Boolean(row.expiresAt && row.expiresAt.getTime() <= Date.now());
}

export type ListFilters = {
  q?: string;
  tag?: string;
  folder?: string;
  cursor?: string;
  limit?: number;
};

export type ListResult = {
  links: LinkDto[];
  nextCursor: string | null;
};

const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 100;

export function encodeListCursor(createdAt: Date, slug: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${slug}`, "utf8").toString(
    "base64url",
  );
}

export function decodeListCursor(
  cursor: string,
): { createdAt: Date; slug: string } | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const idx = raw.indexOf("|");
    if (idx < 0) return null;
    const createdAt = new Date(raw.slice(0, idx));
    const slug = raw.slice(idx + 1);
    if (!slug || Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, slug };
  } catch {
    return null;
  }
}

async function buildListConditions(
  filters: ListFilters,
): Promise<ReturnType<typeof and> | undefined | "empty"> {
  const { q, tag, folder, cursor } = filters;
  const conditions = [];

  if (q && q.trim()) {
    const pattern = `%${q.trim()}%`;
    conditions.push(
      or(
        ilike(links.slug, pattern),
        ilike(links.destination, pattern),
        ilike(links.notes, pattern),
      ),
    );
  }
  if (folder && folder.trim()) {
    conditions.push(eq(links.folderId, folder.trim()));
  }

  if (tag && tag.trim()) {
    const tagName = tag.trim();
    const tagged = await db
      .select({ slug: linkTags.slug })
      .from(linkTags)
      .innerJoin(tags, eq(linkTags.tagId, tags.id))
      .where(or(eq(tags.name, tagName), eq(tags.id, tagName)));
    const slugList = tagged.map((t) => t.slug);
    if (!slugList.length) return "empty";
    conditions.push(inArray(links.slug, slugList));
  }

  if (cursor && cursor.trim()) {
    const decoded = decodeListCursor(cursor.trim());
    if (!decoded) return "empty";
    conditions.push(
      or(
        lt(links.createdAt, decoded.createdAt),
        and(eq(links.createdAt, decoded.createdAt), lt(links.slug, decoded.slug)),
      ),
    );
  }

  if (!conditions.length) return undefined;
  return and(...conditions);
}

export async function listLinks(filters: ListFilters = {}): Promise<ListResult> {
  const limitRaw = filters.limit ?? DEFAULT_PAGE_LIMIT;
  const limit = Math.min(
    MAX_PAGE_LIMIT,
    Math.max(1, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : DEFAULT_PAGE_LIMIT),
  );

  const where = await buildListConditions(filters);
  if (where === "empty") {
    return { links: [], nextCursor: null };
  }

  const rows = await db
    .select()
    .from(links)
    .where(where)
    .orderBy(desc(links.createdAt), desc(links.slug))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const tagMap = await tagsForSlugs(page.map((r) => r.slug));
  const dtos = await Promise.all(
    page.map((r) => toDto(r, tagMap.get(r.slug) ?? [])),
  );

  let nextCursor: string | null = null;
  if (rows.length > limit) {
    const last = page[page.length - 1];
    nextCursor = encodeListCursor(last.createdAt, last.slug);
  }

  return { links: dtos, nextCursor };
}

/** Walk all pages for export / internal full dumps. */
export async function listAllLinks(
  filters: Omit<ListFilters, "cursor" | "limit"> = {},
): Promise<LinkDto[]> {
  const out: LinkDto[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await listLinks({ ...filters, cursor, limit: MAX_PAGE_LIMIT });
    out.push(...page.links);
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return out;
}

export async function getLink(slug: string): Promise<LinkDto | null> {
  const [row] = await db.select().from(links).where(eq(links.slug, slug)).limit(1);
  return row ? toDto(row) : null;
}

export async function getLinkRow(slug: string): Promise<Link | null> {
  const [row] = await db.select().from(links).where(eq(links.slug, slug)).limit(1);
  return row ?? null;
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

async function resolveFolderId(
  folderId: string | null | undefined,
): Promise<{ ok: true; folderId: string | null } | { ok: false; message: string }> {
  if (folderId === undefined) return { ok: true, folderId: null };
  if (folderId === null) return { ok: true, folderId: null };
  if (!(await folderExists(folderId))) {
    return { ok: false, message: "Folder not found" };
  }
  return { ok: true, folderId };
}

function hourBucketUtc(d = new Date()): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours()),
  );
}

export async function getHitSeries(
  slug: string,
  from?: Date,
  to?: Date,
): Promise<{ points: { t: string; hits: number }[] } | null> {
  const row = await getLinkRow(slug);
  if (!row) return null;

  const end = to ?? new Date();
  const start = from ?? new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);

  const rows = await db
    .select()
    .from(hitAggregates)
    .where(
      and(
        eq(hitAggregates.slug, slug),
        gte(hitAggregates.bucketStart, start),
        lte(hitAggregates.bucketStart, end),
      ),
    )
    .orderBy(asc(hitAggregates.bucketStart));

  return {
    points: rows.map((r) => ({
      t: r.bucketStart.toISOString(),
      hits: Number(r.hits),
    })),
  };
}

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

  const withUtm = applyUtmParams(dest.url, {
    utmSource: parsed.data.utmSource,
    utmMedium: parsed.data.utmMedium,
    utmCampaign: parsed.data.utmCampaign,
    utmTerm: parsed.data.utmTerm,
    utmContent: parsed.data.utmContent,
  });

  const urlCheck = await checkDestinationUrl(withUtm);
  if (!urlCheck.ok) {
    return {
      ok: false,
      status: 400,
      error: "url_check_failed",
      message: urlCheck.reason,
    };
  }

  let slug = parsed.data.slug?.trim() || randomSlug();
  if (parsed.data.slug != null && !isValidSlug(slug)) {
    return {
      ok: false,
      status: 400,
      error: "invalid_slug",
      message: "Slug may only contain letters, numbers, hyphens, and underscores",
    };
  }
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

  const folder = await resolveFolderId(parsed.data.folderId);
  if (!folder.ok) {
    return { ok: false, status: 400, error: "invalid_folder", message: folder.message };
  }

  const warnings: string[] = [];
  const dupes = await findDuplicates(withUtm);
  if (dupes.length) warnings.push("duplicate_destination");

  const expiresAt = parsed.data.expiresAt
    ? new Date(parsed.data.expiresAt)
    : null;

  let passwordHash: string | null = null;
  if (parsed.data.password) {
    passwordHash = await hashLinkPassword(parsed.data.password);
  }

  const maxHits =
    parsed.data.maxHits === undefined ? null : parsed.data.maxHits;

  const [row] = await db
    .insert(links)
    .values({
      slug,
      destination: withUtm,
      notes: parsed.data.notes ?? null,
      status: "active",
      expiresAt,
      passwordHash,
      oneTime: parsed.data.oneTime ?? false,
      maxHits,
      folderId: folder.folderId,
    })
    .returning();

  if (parsed.data.tagIds?.length || parsed.data.tagNames?.length) {
    await setLinkTags(slug, {
      tagIds: parsed.data.tagIds,
      tagNames: parsed.data.tagNames,
    });
  }

  return { ok: true, link: await toDto(row), warnings };
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

  const currentRow = await getLinkRow(slug);
  if (!currentRow) {
    return { ok: false, status: 404, error: "not_found", message: "Link not found" };
  }
  const current = await toDto(currentRow);

  if (parsed.data.maxHits !== undefined) {
    const next = parsed.data.maxHits;
    const prev = currentRow.maxHits;
    if (prev != null && next != null && next < prev) {
      return {
        ok: false,
        status: 400,
        error: "max_hits_decrease",
        message: "Max redirects can only be increased or cleared",
      };
    }
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

  let passwordHash: string | null | undefined = undefined;
  if (parsed.data.clearPassword) {
    passwordHash = null;
  } else if (parsed.data.password) {
    passwordHash = await hashLinkPassword(parsed.data.password);
  }

  let folderId: string | null | undefined = undefined;
  if (parsed.data.folderId !== undefined) {
    const folder = await resolveFolderId(parsed.data.folderId);
    if (!folder.ok) {
      return { ok: false, status: 400, error: "invalid_folder", message: folder.message };
    }
    folderId = folder.folderId;
  }

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
      passwordHash,
      oneTime: parsed.data.oneTime === undefined ? undefined : parsed.data.oneTime,
      maxHits: parsed.data.maxHits === undefined ? undefined : parsed.data.maxHits,
      folderId,
      updatedAt: new Date(),
    })
    .where(eq(links.slug, slug))
    .returning();

  if (parsed.data.tagIds !== undefined || parsed.data.tagNames !== undefined) {
    await setLinkTags(slug, {
      tagIds: parsed.data.tagIds,
      tagNames: parsed.data.tagNames,
    });
  }

  await cacheDel(slug);
  await previewCacheDel(slug);
  return { ok: true, link: await toDto(row), warnings: [] };
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
  await previewCacheDel(slug);
  return result.length > 0;
}

export type ResolveResult =
  | { status: "ok"; destination: string; oneTime: boolean; slug: string }
  | { status: "missing" }
  | { status: "expired" }
  | { status: "quarantined" }
  | { status: "password_required"; slug: string };

export async function resolveRedirect(
  slug: string,
  opts: { gateUnlocked?: boolean } = {},
): Promise<ResolveResult> {
  if (!isValidSlug(slug) || isReservedSlug(slug)) return { status: "missing" };

  const [row] = await db.select().from(links).where(eq(links.slug, slug)).limit(1);
  if (!row) return { status: "missing" };
  if (row.status === "quarantined") {
    await cacheDel(slug);
    return { status: "quarantined" };
  }
  if (isExpired(row)) return { status: "expired" };

  if (row.maxHits != null) {
    const pending = await pendingHits(slug);
    if (Number(row.hits) + pending >= row.maxHits) {
      return { status: "expired" };
    }
  }

  if (row.passwordHash && !opts.gateUnlocked) {
    return { status: "password_required", slug };
  }

  const cacheable = !row.passwordHash && !row.oneTime && row.maxHits == null;
  if (cacheable) {
    const cached = await cacheGet(slug);
    if (cached) {
      void bumpHit(slug);
      cacheHitsTotal.inc();
      redirectsTotal.inc();
      notifyHitWebhook(slug);
      return { status: "ok", destination: cached, oneTime: false, slug };
    }
  }

  cacheMissesTotal.inc();
  if (cacheable) {
    await cacheSet(slug, row.destination);
  }
  void bumpHit(slug);
  redirectsTotal.inc();
  notifyHitWebhook(slug);
  return {
    status: "ok",
    destination: row.destination,
    oneTime: Boolean(row.oneTime),
    slug,
  };
}

export async function burnOneTimeLink(slug: string): Promise<void> {
  await deleteLink(slug);
}

export async function flushHitCounters(counts: Map<string, number>): Promise<void> {
  const bucket = hourBucketUtc();
  for (const [slug, n] of counts) {
    await db
      .update(links)
      .set({
        hits: sql`${links.hits} + ${n}`,
        lastHitAt: new Date(),
      })
      .where(eq(links.slug, slug));

    await db
      .insert(hitAggregates)
      .values({ slug, bucketStart: bucket, hits: n })
      .onConflictDoUpdate({
        target: [hitAggregates.slug, hitAggregates.bucketStart],
        set: { hits: sql`${hitAggregates.hits} + ${n}` },
      });
  }
}

export async function exportCsv(): Promise<string> {
  const rows = await listAllLinks();
  const header =
    "slug,destination,notes,status,hits,maxHits,lastHitAt,expiresAt,createdAt,shortUrl,oneTime,hasPassword,folderId,tags";
  const lines = rows.map((r) =>
    [
      r.slug,
      csvEscape(r.destination),
      csvEscape(r.notes ?? ""),
      r.status,
      r.hits,
      r.maxHits ?? "",
      r.lastHitAt ?? "",
      r.expiresAt ?? "",
      r.createdAt,
      r.shortUrl,
      r.oneTime ? "true" : "false",
      r.hasPassword ? "true" : "false",
      r.folderId ?? "",
      csvEscape(r.tags.map((t) => t.name).join("|")),
    ].join(","),
  );
  return [header, ...lines].join("\n");
}

export function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
