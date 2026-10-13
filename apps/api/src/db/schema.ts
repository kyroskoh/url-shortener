import {
  bigint,
  boolean,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const folders = pgTable("folders", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull().unique(),
  parentId: uuid("parent_id"),
});

export const tags = pgTable("tags", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull().unique(),
});

export const links = pgTable("links", {
  slug: varchar("slug", { length: 64 }).primaryKey(),
  destination: text("destination").notNull(),
  notes: text("notes"),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  hits: bigint("hits", { mode: "number" }).notNull().default(0),
  lastHitAt: timestamp("last_hit_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  activeAt: timestamp("active_at", { withTimezone: true }),
  passwordHash: text("password_hash"),
  oneTime: boolean("one_time").notNull().default(false),
  maxHits: integer("max_hits"),
  folderId: uuid("folder_id").references(() => folders.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const linkTags = pgTable(
  "link_tags",
  {
    slug: varchar("slug", { length: 64 })
      .notNull()
      .references(() => links.slug, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.slug, t.tagId] }),
  }),
);

export const hitAggregates = pgTable(
  "hit_aggregates",
  {
    slug: varchar("slug", { length: 64 })
      .notNull()
      .references(() => links.slug, { onDelete: "cascade" }),
    bucketStart: timestamp("bucket_start", { withTimezone: true }).notNull(),
    hits: bigint("hits", { mode: "number" }).notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.slug, t.bucketStart] }),
  }),
);

export type Link = typeof links.$inferSelect;
export type NewLink = typeof links.$inferInsert;
export type Folder = typeof folders.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type HitAggregate = typeof hitAggregates.$inferSelect;
