/**
 * Bulk-import timezone reference: abbreviations and IANA names for the
 * `timezone` CSV column. Keep in sync with admin UI hover table.
 */

export type ImportTimezoneMode =
  | { kind: "utc" }
  | { kind: "local" }
  | { kind: "iana"; iana: string };

export type TimezoneReferenceRow = {
  /** Value accepted in CSV (case-insensitive for abbreviations) */
  code: string;
  /** IANA zone, or special for UTC/Local */
  iana: string;
  label: string;
  /** Shown in UI; note DST / ambiguity when relevant */
  note?: string;
};

/** Curated reference — abbreviations map to IANA; DST rules come from the zone. */
export const IMPORT_TIMEZONE_REFERENCE: TimezoneReferenceRow[] = [
  { code: "UTC", iana: "UTC", label: "Coordinated Universal Time", note: "Default when column empty" },
  { code: "GMT", iana: "UTC", label: "Greenwich Mean Time", note: "Treated as UTC" },
  { code: "Local", iana: "Local", label: "API host local timezone", note: "Uses server/container TZ" },
  { code: "SGT", iana: "Asia/Singapore", label: "Singapore Time", note: "UTC+8, no DST" },
  { code: "MYT", iana: "Asia/Kuala_Lumpur", label: "Malaysia Time", note: "UTC+8" },
  { code: "ICT", iana: "Asia/Bangkok", label: "Indochina Time", note: "UTC+7" },
  { code: "WIB", iana: "Asia/Jakarta", label: "Western Indonesia Time", note: "UTC+7" },
  { code: "PHT", iana: "Asia/Manila", label: "Philippine Time", note: "UTC+8" },
  { code: "HKT", iana: "Asia/Hong_Kong", label: "Hong Kong Time", note: "UTC+8" },
  { code: "CST", iana: "Asia/Shanghai", label: "China Standard Time", note: "UTC+8 — not US Central" },
  { code: "JST", iana: "Asia/Tokyo", label: "Japan Standard Time", note: "UTC+9" },
  { code: "KST", iana: "Asia/Seoul", label: "Korea Standard Time", note: "UTC+9" },
  { code: "IST", iana: "Asia/Kolkata", label: "India Standard Time", note: "UTC+5:30" },
  { code: "AEST", iana: "Australia/Sydney", label: "Australian Eastern", note: "DST via Australia/Sydney" },
  { code: "AEDT", iana: "Australia/Sydney", label: "Australian Eastern (DST label)", note: "Use AEST or Australia/Sydney" },
  { code: "NZST", iana: "Pacific/Auckland", label: "New Zealand", note: "DST via Pacific/Auckland" },
  { code: "BST", iana: "Europe/London", label: "British Summer / UK", note: "DST via Europe/London" },
  { code: "CET", iana: "Europe/Paris", label: "Central European", note: "DST via Europe/Paris" },
  { code: "CEST", iana: "Europe/Paris", label: "Central European (DST label)", note: "Use CET or Europe/Paris" },
  { code: "EET", iana: "Europe/Bucharest", label: "Eastern European", note: "DST via zone" },
  { code: "EST", iana: "America/New_York", label: "US Eastern", note: "DST via America/New_York" },
  { code: "EDT", iana: "America/New_York", label: "US Eastern (DST label)", note: "Use EST or America/New_York" },
  { code: "CST-US", iana: "America/Chicago", label: "US Central", note: "Use CST-US or America/Chicago (CST alone = China)" },
  { code: "CT", iana: "America/Chicago", label: "US Central", note: "DST via America/Chicago" },
  { code: "MST", iana: "America/Denver", label: "US Mountain", note: "DST via America/Denver" },
  { code: "PST", iana: "America/Los_Angeles", label: "US Pacific", note: "DST via America/Los_Angeles" },
  { code: "PDT", iana: "America/Los_Angeles", label: "US Pacific (DST label)", note: "Use PST or America/Los_Angeles" },
  { code: "HST", iana: "Pacific/Honolulu", label: "Hawaii", note: "UTC-10, no DST" },
];

const ALIAS_TO_IANA = new Map<string, string>();
for (const row of IMPORT_TIMEZONE_REFERENCE) {
  if (row.iana !== "UTC" && row.iana !== "Local") {
    ALIAS_TO_IANA.set(row.code.toLowerCase(), row.iana);
  }
}
// Extra aliases not shown as primary rows
ALIAS_TO_IANA.set("sst", "Asia/Singapore"); // Singapore Standard (same as SGT)
ALIAS_TO_IANA.set("sg", "Asia/Singapore");

export function isValidIanaTimeZone(iana: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: iana });
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve CSV timezone cell. Accepts UTC/Local, curated abbreviations (SGT, …),
 * or any IANA name supported by the runtime (e.g. Asia/Singapore).
 */
export function resolveImportTimezone(
  raw: string | undefined,
): { ok: true; value: ImportTimezoneMode } | { ok: false; error: string } {
  const s = (raw ?? "").trim();
  if (!s) return { ok: true, value: { kind: "utc" } };

  const lower = s.toLowerCase();
  if (lower === "utc" || lower === "z" || lower === "gmt") {
    return { ok: true, value: { kind: "utc" } };
  }
  if (lower === "local" || lower === "server" || lower === "host") {
    return { ok: true, value: { kind: "local" } };
  }

  const aliased = ALIAS_TO_IANA.get(lower);
  if (aliased) {
    return { ok: true, value: { kind: "iana", iana: aliased } };
  }

  // IANA paths contain '/' (or Etc/UTC etc.)
  if (s.includes("/") && isValidIanaTimeZone(s)) {
    return { ok: true, value: { kind: "iana", iana: s } };
  }

  // Case-sensitive retry for IANA if user used odd casing
  if (isValidIanaTimeZone(s)) {
    return { ok: true, value: { kind: "iana", iana: s } };
  }

  return {
    ok: false,
    error:
      "Invalid timezone (use UTC, Local, an abbreviation like SGT, or IANA e.g. Asia/Singapore — see timezone reference)",
  };
}

/** Offset (ms) to add to UTC instant to get wall clock in zone… actually returns zoneOffset = local - UTC equivalent. */
function getOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - date.getTime();
}

/** Convert wall-clock components in `timeZone` to a UTC Date. */
export function wallTimeInZoneToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  ms: number,
  timeZone: string,
): Date | null {
  if (!isValidIanaTimeZone(timeZone)) return null;
  // Initial guess: treat wall as UTC, then correct by zone offset (iterate for DST).
  let utcMs = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  for (let i = 0; i < 3; i++) {
    const offset = getOffsetMs(new Date(utcMs), timeZone);
    utcMs = Date.UTC(year, month - 1, day, hour, minute, second, ms) - offset;
  }
  const result = new Date(utcMs);
  if (Number.isNaN(result.getTime())) return null;

  // Verify wall components round-trip
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(result);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? "-1");
  if (
    get("year") !== year ||
    get("month") !== month ||
    get("day") !== day ||
    get("hour") !== hour ||
    get("minute") !== minute ||
    get("second") !== second
  ) {
    // Ambiguous/nonexistent DST wall time
    return null;
  }
  return result;
}
