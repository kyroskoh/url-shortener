import { asc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { FolderDto, TagDto } from "@blink/shared";
import { db } from "./db/client.js";
import { folders, linkTags, tags } from "./db/schema.js";

export async function listTags(): Promise<TagDto[]> {
  const rows = await db.select().from(tags).orderBy(asc(tags.name));
  return rows.map((r) => ({ id: r.id, name: r.name }));
}

export async function createTag(name: string): Promise<TagDto | { error: string }> {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 64) {
    return { error: "Tag name must be 1–64 characters" };
  }
  const existing = await db.select().from(tags).where(eq(tags.name, trimmed)).limit(1);
  if (existing[0]) return { id: existing[0].id, name: existing[0].name };
  const id = randomUUID();
  const [row] = await db.insert(tags).values({ id, name: trimmed }).returning();
  return { id: row.id, name: row.name };
}

export async function deleteTag(id: string): Promise<boolean> {
  const result = await db.delete(tags).where(eq(tags.id, id)).returning();
  return result.length > 0;
}

export async function listFolders(): Promise<FolderDto[]> {
  const rows = await db.select().from(folders).orderBy(asc(folders.name));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    parentId: r.parentId,
  }));
}

export async function createFolder(
  name: string,
  parentId?: string | null,
): Promise<FolderDto | { error: string }> {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 128) {
    return { error: "Folder name must be 1–128 characters" };
  }
  if (parentId) {
    const [parent] = await db.select().from(folders).where(eq(folders.id, parentId)).limit(1);
    if (!parent) return { error: "Parent folder not found" };
  }
  const existing = await db.select().from(folders).where(eq(folders.name, trimmed)).limit(1);
  if (existing[0]) {
    return {
      id: existing[0].id,
      name: existing[0].name,
      parentId: existing[0].parentId,
    };
  }
  const id = randomUUID();
  const [row] = await db
    .insert(folders)
    .values({ id, name: trimmed, parentId: parentId ?? null })
    .returning();
  return { id: row.id, name: row.name, parentId: row.parentId };
}

export async function deleteFolder(id: string): Promise<boolean> {
  const result = await db.delete(folders).where(eq(folders.id, id)).returning();
  return result.length > 0;
}

export async function tagsForSlugs(
  slugs: string[],
): Promise<Map<string, TagDto[]>> {
  const map = new Map<string, TagDto[]>();
  if (!slugs.length) return map;
  const rows = await db
    .select({
      slug: linkTags.slug,
      id: tags.id,
      name: tags.name,
    })
    .from(linkTags)
    .innerJoin(tags, eq(linkTags.tagId, tags.id));
  for (const row of rows) {
    if (!slugs.includes(row.slug)) continue;
    const list = map.get(row.slug) ?? [];
    list.push({ id: row.id, name: row.name });
    map.set(row.slug, list);
  }
  return map;
}

export async function setLinkTags(
  slug: string,
  opts: { tagIds?: string[]; tagNames?: string[] },
): Promise<void> {
  const ids = new Set<string>(opts.tagIds ?? []);
  for (const name of opts.tagNames ?? []) {
    const created = await createTag(name);
    if ("error" in created) continue;
    ids.add(created.id);
  }
  await db.delete(linkTags).where(eq(linkTags.slug, slug));
  for (const tagId of ids) {
    await db.insert(linkTags).values({ slug, tagId });
  }
}

export async function folderExists(id: string | null | undefined): Promise<boolean> {
  if (id == null) return true;
  const [row] = await db.select().from(folders).where(eq(folders.id, id)).limit(1);
  return Boolean(row);
}
