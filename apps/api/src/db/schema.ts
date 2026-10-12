import {
  bigint,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const links = pgTable("links", {
  slug: varchar("slug", { length: 64 }).primaryKey(),
  destination: text("destination").notNull(),
  notes: text("notes"),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  hits: bigint("hits", { mode: "number" }).notNull().default(0),
  lastHitAt: timestamp("last_hit_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Link = typeof links.$inferSelect;
export type NewLink = typeof links.$inferInsert;
