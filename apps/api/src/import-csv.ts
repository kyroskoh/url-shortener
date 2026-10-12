import { createLink, csvEscape } from "./links.js";

export type ImportRowResult = {
  row: number;
  ok: boolean;
  slug?: string;
  error?: string;
};

export type ImportResult = {
  dryRun: boolean;
  total: number;
  succeeded: number;
  failed: number;
  rows: ImportRowResult[];
};

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, "_");
}

/**
 * Import CSV with columns: slug, destination, notes, expires_at
 */
export async function importLinksCsv(
  csvText: string,
  dryRun: boolean,
): Promise<ImportResult> {
  const lines = csvText
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);

  if (!lines.length) {
    return { dryRun, total: 0, succeeded: 0, failed: 0, rows: [] };
  }

  const headerCells = parseCsvLine(lines[0]).map(normalizeHeader);
  const hasHeader =
    headerCells.includes("destination") || headerCells.includes("slug");
  const start = hasHeader ? 1 : 0;

  const idx = {
    slug: headerCells.indexOf("slug"),
    destination: headerCells.indexOf("destination"),
    notes: headerCells.indexOf("notes"),
    expiresAt: Math.max(
      headerCells.indexOf("expires_at"),
      headerCells.indexOf("expiresat"),
    ),
  };

  if (hasHeader && idx.destination < 0) {
    return {
      dryRun,
      total: 0,
      succeeded: 0,
      failed: 1,
      rows: [
        {
          row: 1,
          ok: false,
          error: "CSV header must include destination",
        },
      ],
    };
  }

  const results: ImportRowResult[] = [];
  let succeeded = 0;
  let failed = 0;

  for (let i = start; i < lines.length; i++) {
    const rowNum = i + 1;
    const cells = parseCsvLine(lines[i]);
    const get = (col: number, fallbackIndex: number) => {
      if (hasHeader && col >= 0) return cells[col]?.trim() ?? "";
      return cells[fallbackIndex]?.trim() ?? "";
    };

    const slug = get(idx.slug, 0);
    const destination = hasHeader
      ? get(idx.destination, 1)
      : cells.length >= 2
        ? cells[1]?.trim() ?? ""
        : cells[0]?.trim() ?? "";
    const notes = hasHeader ? get(idx.notes, 2) : cells[2]?.trim() ?? "";
    const expiresRaw = hasHeader
      ? get(idx.expiresAt, 3)
      : cells[3]?.trim() ?? "";

    const destValue = hasHeader ? destination : destination || slug;
    const slugValue = hasHeader
      ? slug || undefined
      : cells.length >= 2
        ? slug || undefined
        : undefined;

    if (!destValue) {
      failed++;
      results.push({ row: rowNum, ok: false, error: "Missing destination" });
      continue;
    }

    let expiresAt: string | null = null;
    if (expiresRaw) {
      const d = new Date(expiresRaw);
      if (Number.isNaN(d.getTime())) {
        failed++;
        results.push({
          row: rowNum,
          ok: false,
          error: "Invalid expires_at",
        });
        continue;
      }
      expiresAt = d.toISOString();
    }

    if (dryRun) {
      const { createLinkSchema, parseDestination } = await import("@blink/shared");
      const { config } = await import("./config.js");
      const parsed = createLinkSchema.safeParse({
        destination: destValue,
        slug: slugValue,
        notes: notes || null,
        expiresAt,
      });
      if (!parsed.success) {
        failed++;
        results.push({
          row: rowNum,
          ok: false,
          error: parsed.error.errors[0]?.message ?? "Invalid row",
        });
        continue;
      }
      const dest = parseDestination(parsed.data.destination, config.extraProtocols);
      if (!dest.ok) {
        failed++;
        results.push({ row: rowNum, ok: false, error: dest.error });
        continue;
      }
      succeeded++;
      results.push({ row: rowNum, ok: true, slug: slugValue });
      continue;
    }

    const result = await createLink({
      destination: destValue,
      slug: slugValue,
      notes: notes || null,
      expiresAt,
    });
    if (!result.ok) {
      failed++;
      results.push({ row: rowNum, ok: false, error: result.message });
    } else {
      succeeded++;
      results.push({ row: rowNum, ok: true, slug: result.link.slug });
    }
  }

  return {
    dryRun,
    total: results.length,
    succeeded,
    failed,
    rows: results,
  };
}

/** Re-export for tests that need escape parity with export. */
export { csvEscape };
