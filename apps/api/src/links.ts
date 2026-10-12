import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import {
  applyUtmParams,
  createLinkSchema,
  isReservedSlug,
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
import { linkTags, links, tags, type Link } from "./db/schema.js";
import { cacheDel, cacheGet, cacheSet, bumpHit, previewCacheDel } from "./redis.js";
import { randomSlug } from "./slug.js";
import {
  folderExists,
  setLinkTags,
  tagsForSlugs,
} from "./tags-folders.js";
import { checkDestinationUrl } from "./url-check.js";

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
};

export async function listLinks(filters: ListFilters = {}): Promise<LinkDto[]> {
  const { q, tag, folder } = filters;
  let rows: Link[];

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
    if (!slugList.length) return [];
    conditions.push(inArray(links.slug, slugList));
  }

  if (conditions.length) {
    rows = await db
      .select()
      .from(links)
      .where(and(...conditions))
      .orderBy(desc(links.createdAt));
  } else {
    rows = await db.select().from(links).orderBy(desc(links.createdAt));
  }

  const tagMap = await tagsForSlugs(rows.map((r) => r.slug));
  return Promise.all(rows.map((r) => toDto(r, tagMap.get(r.slug) ?? [])));
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
  if (isReservedSlug(slug)) return { status: "missing" };

  const [row] = await db.select().from(links).where(eq(links.slug, slug)).limit(1);
  if (!row) return { status: "missing" };
  if (row.status === "quarantined") {
    await cacheDel(slug);
    return { status: "quarantined" };
  }
  if (isExpired(row)) return { status: "expired" };

  if (row.passwordHash && !opts.gateUnlocked) {
    return { status: "password_required", slug };
  }

  const cacheable = !row.passwordHash && !row.oneTime;
  if (cacheable) {
    const cached = await cacheGet(slug);
    if (cached) {
      void bumpHit(slug);
      return { status: "ok", destination: cached, oneTime: false, slug };
    }
  }

  if (cacheable) {
    await cacheSet(slug, row.destination);
  }
  void bumpHit(slug);
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
    "slug,destination,notes,status,hits,lastHitAt,expiresAt,createdAt,shortUrl,oneTime,hasPassword,folderId,tags";
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
