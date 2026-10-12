const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** e.g. 12 Oct 2026, 10:36:45 */
function formatParts(
  year: number,
  monthIndex: number,
  day: number,
  hours: number,
  minutes: number,
  seconds: number,
): string {
  return `${day} ${MONTHS[monthIndex]} ${year}, ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function formatInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";

  const monthRaw = get("month");
  const month =
    MONTHS.find((m) => m.toLowerCase() === monthRaw.toLowerCase().slice(0, 3)) ??
    monthRaw.slice(0, 3);

  return `${Number(get("day"))} ${month} ${get("year")}, ${get("hour")}:${get("minute")}:${get("second")}`;
}

/**
 * Ambiguity-safe timestamp: month as MMM, both UTC and local.
 * Example: "12 Oct 2026, 02:36:00 UTC · 12 Oct 2026, 10:36:00 local (GMT+8)"
 */
export function formatDateTimeBoth(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  const utc = formatParts(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
  );

  const localZone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "local";
  const local = formatInTimeZone(date, localZone);

  let offsetLabel = "local";
  try {
    const offset =
      new Intl.DateTimeFormat("en-US", {
        timeZone: localZone,
        timeZoneName: "shortOffset",
      })
        .formatToParts(date)
        .find((p) => p.type === "timeZoneName")?.value ?? "";
    offsetLabel = offset ? `local (${offset})` : `local (${localZone})`;
  } catch {
    offsetLabel = `local (${localZone})`;
  }

  return `${utc} UTC · ${local} ${offsetLabel}`;
}
