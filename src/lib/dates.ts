// Coupon dates are calendar days in the business's timezone. These helpers convert between
// those days and the UTC instants stored in the database, without a date library.

export function isValidTimeZone(tz: string): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function safeTimeZone(tz: string | null | undefined): string {
  return tz && isValidTimeZone(tz) ? tz : "UTC";
}

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function zonedParts(instantMs: number, tz: string) {
  let fmt = partsFormatters.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partsFormatters.set(tz, fmt);
  }
  const parts = fmt.formatToParts(new Date(instantMs));
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

function offsetMs(instantMs: number, tz: string): number {
  const p = zonedParts(instantMs, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instantMs / 1000) * 1000;
}

export const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function zonedWallTimeToUtc(day: string, hour: number, minute: number, second: number, tz: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  const wall = Date.UTC(y, m - 1, d, hour, minute, second);
  let ts = wall - offsetMs(wall, tz);
  ts = wall - offsetMs(ts, tz);
  return new Date(ts);
}

export function startOfDayInZone(day: string, tz: string): Date {
  return zonedWallTimeToUtc(day, 0, 0, 0, safeTimeZone(tz));
}

export function endOfDayInZone(day: string, tz: string): Date {
  return zonedWallTimeToUtc(day, 23, 59, 59, safeTimeZone(tz));
}

// "YYYY-MM-DD" for the calendar day this instant falls on in the timezone.
export function dayInZone(instant: Date | string | number, tz: string): string {
  const p = zonedParts(new Date(instant).getTime(), safeTimeZone(tz));
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function formatDay(instant: Date | string | number, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: safeTimeZone(tz),
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(instant));
}

export const EXPIRING_SOON_MS = 3 * 24 * 60 * 60 * 1000;
