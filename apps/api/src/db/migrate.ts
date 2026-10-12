import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { queryClient } from "./client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function migrate(): Promise<void> {
  await queryClient`
    CREATE TABLE IF NOT EXISTS blink_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  const drizzleDir = join(__dirname, "../../drizzle");
  let files: string[] = [];
  try {
    files = readdirSync(drizzleDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
  } catch {
    // No migrations directory yet — apply bootstrapped SQL below
  }

  if (files.length === 0) {
    await applyBootstrap();
    return;
  }

  for (const file of files) {
    const applied = await queryClient`
      SELECT 1 FROM blink_migrations WHERE id = ${file}
    `;
    if (applied.length > 0) continue;
    const sql = readFileSync(join(drizzleDir, file), "utf8");
    await queryClient.unsafe(sql);
    await queryClient`INSERT INTO blink_migrations (id) VALUES (${file})`;
  }
}

async function applyBootstrap(): Promise<void> {
  const id = "0000_bootstrap.sql";
  const applied = await queryClient`
    SELECT 1 FROM blink_migrations WHERE id = ${id}
  `;
  if (applied.length > 0) return;

  await queryClient`
    CREATE TABLE IF NOT EXISTS links (
      slug VARCHAR(64) PRIMARY KEY,
      destination TEXT NOT NULL,
      notes TEXT,
      hits BIGINT NOT NULL DEFAULT 0,
      last_hit_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await queryClient`CREATE INDEX IF NOT EXISTS links_destination_idx ON links (destination)`;
  await queryClient`INSERT INTO blink_migrations (id) VALUES (${id})`;
}
