import {
  resolveImportTimezone,
  wallTimeInZoneToUtc,
  type ImportTimezoneMode,
} from "@blink/shared";
import { createLink, csvEscape } from "./links.js";

export { resolveImportTimezone, IMPORT_TIMEZONE_REFERENCE } from "@blink/shared";
// re-export under previous test name
export const parseImportTimezone = resolveImportTimezone;

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

function wallFromMode(
  y: number,
  mo: number,
  day: number,
  hh: number,
  mm: number,
  ss: number,
  ms: number,
  timezone: ImportTimezoneMode,
): Date | null {
  if (timezone.kind === "local") {
    const d = new Date(y, mo - 1, day, hh, mm, ss, ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (timezone.kind === "utc") {
    const d = new Date(Date.UTC(y, mo - 1, day, hh, mm, ss, ms));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return wallTimeInZoneToUtc(y, mo, day, hh, mm, ss, ms, timezone.iana);
}

/**
 * Parse import datetimes. Accepts ISO-8601 and common non-ISO forms.
 * `timezone` applies when the value has no explicit offset (`Z` / ±HH:MM).
 * Ambiguous locales (MM/DD vs DD/MM) are rejected.
 */
export function parseImportDateTime(
  raw: string,
  timezone: ImportTimezoneMode = { kind: "utc" },
): Date | null {
  const s = raw.trim();
  if (!s) return null;

  // Unix epoch: always absolute UTC instant (timezone column ignored)
  if (/^\d{10}$/.test(s)) {
    const d = new Date(Number(s) * 1000);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (/^\d{13}$/.test(s)) {
    const d = new Date(Number(s));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // YYYY-MM-DD or YYYY/MM/DD
  const dateOnly = /^(\d{4})[-/](\d{2})[-/](\d{2})$/.exec(s);
  if (dateOnly) {
    const y = Number(dateOnly[1]);
    const m = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    return wallFromMode(y, m, day, 0, 0, 0, 0, timezone);
  }

  // YYYY-MM-DD[ T]HH:mm[:ss][.sss] with optional Z / ±HH:MM
  const loose =
    /^(\d{4})[-/](\d{2})[-/](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:?\d{2})?$/i.exec(
      s,
    );
  if (loose) {
    const y = Number(loose[1]);
    const mo = Number(loose[2]);
    const day = Number(loose[3]);
    const hh = Number(loose[4]);
    const mm = Number(loose[5]);
    const ss = Number(loose[6] ?? "0");
    const ms = Number((loose[7] ?? "0").padEnd(3, "0"));
    const tz = loose[8];
    if (tz) {
      const iso = `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}.${String(ms).padStart(3, "0")}${tz === "Z" || tz === "z" ? "Z" : tz}`;
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    return wallFromMode(y, mo, day, hh, mm, ss, ms, timezone);
  }

  // Reject ambiguous numeric slash dates (MM/DD/YYYY or DD/MM/YYYY)
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(s)) {
    return null;
  }

  // Full ISO / RFC 2823 — explicit offsets honored by Date
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d;
  return null;
}

function parseOptionalDate(
  raw: string,
  field: string,
  timezone: ImportTimezoneMode,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (!raw.trim()) return { ok: true, value: null };
  const d = parseImportDateTime(raw, timezone);
  if (!d) {
    return {
      ok: false,
      error: `Invalid ${field} (use ISO-8601, YYYY-MM-DD, YYYY-MM-DD HH:mm:ss, or unix epoch; timezone: UTC, Local, SGT, Asia/Singapore, …)`,
    };
  }
  return { ok: true, value: d.toISOString() };
}

/**
 * Import CSV columns: slug, destination, notes, expires_at, active_at, timezone, max_hits
 * `timezone` = UTC | Local (default UTC) for naive datetimes on that row.
 * status is not imported — pause/quarantine remain admin actions.
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
    activeAt: Math.max(
      headerCells.indexOf("active_at"),
      headerCells.indexOf("activeat"),
    ),
    maxHits: Math.max(
      headerCells.indexOf("max_hits"),
      headerCells.indexOf("maxhits"),
    ),
    timezone: Math.max(
      headerCells.indexOf("timezone"),
      headerCells.indexOf("tz"),
      headerCells.indexOf("time_zone"),
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
    const activeRaw = hasHeader ? get(idx.activeAt, 4) : cells[4]?.trim() ?? "";
    const timezoneRaw = hasHeader
      ? get(idx.timezone, 5)
      : cells[5]?.trim() ?? "";
    const maxHitsRaw = hasHeader
      ? get(idx.maxHits, 6)
      : cells[6]?.trim() ?? "";

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

    const tzParsed = parseImportTimezone(timezoneRaw);
    if (!tzParsed.ok) {
      failed++;
      results.push({ row: rowNum, ok: false, error: tzParsed.error });
      continue;
    }

    const expiresParsed = parseOptionalDate(
      expiresRaw,
      "expires_at",
      tzParsed.value,
    );
    if (!expiresParsed.ok) {
      failed++;
      results.push({ row: rowNum, ok: false, error: expiresParsed.error });
      continue;
    }
    const activeParsed = parseOptionalDate(
      activeRaw,
      "active_at",
      tzParsed.value,
    );
    if (!activeParsed.ok) {
      failed++;
      results.push({ row: rowNum, ok: false, error: activeParsed.error });
      continue;
    }

    let maxHits: number | null | undefined = undefined;
    if (maxHitsRaw) {
      const n = Number(maxHitsRaw);
      if (!Number.isFinite(n) || n < 1) {
        failed++;
        results.push({ row: rowNum, ok: false, error: "Invalid max_hits" });
        continue;
      }
      maxHits = Math.floor(n);
    }

    const createBody = {
      destination: destValue,
      slug: slugValue,
      notes: notes || null,
      expiresAt: expiresParsed.value,
      activeAt: activeParsed.value,
      maxHits,
    };

    if (dryRun) {
      const { createLinkSchema, parseDestination } = await import("@blink/shared");
      const { config } = await import("./config.js");
      const parsed = createLinkSchema.safeParse(createBody);
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

    const result = await createLink(createBody);
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
