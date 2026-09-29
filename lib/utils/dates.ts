import type { DateRange, DateRangePreset } from "@/types/analytics";

/** Daily grouping timezone: UTC (blockchain timestamps stored as UTC). */
export const DAILY_TIMEZONE = "UTC";

export function toIsoUtc(date: Date): string {
  return date.toISOString();
}

export function blockTimestampToIso(unixSeconds: number | string): string {
  const n =
    typeof unixSeconds === "string"
      ? Number.parseInt(unixSeconds, 10)
      : unixSeconds;
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Invalid block timestamp: ${unixSeconds}`);
  }
  return new Date(n * 1000).toISOString();
}

/** UTC calendar date key YYYY-MM-DD (never local timezone). */
export function dateKeyUtc(isoOrDate: string | Date): string {
  if (typeof isoOrDate === "string") {
    const trimmed = isoOrDate.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    const d = new Date(trimmed);
    if (Number.isNaN(d.getTime())) return "";
    return d.toISOString().slice(0, 10);
  }
  if (Number.isNaN(isoOrDate.getTime())) return "";
  return isoOrDate.toISOString().slice(0, 10);
}

/** Current UTC calendar date YYYY-MM-DD. */
export function utcTodayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * A UTC calendar day is completed only after the full 24h day has ended.
 * Today's date is always live/running — never treat it as final.
 */
export function isCompletedUtcDate(
  dateKey: string,
  now: Date = new Date(),
): boolean {
  const key = dateKeyUtc(dateKey);
  if (!key) return false;
  return key < utcTodayKey(now);
}

export function isLiveUtcDate(
  dateKey: string,
  now: Date = new Date(),
): boolean {
  const key = dateKeyUtc(dateKey);
  if (!key) return false;
  return key === utcTodayKey(now);
}

export function utcStartOfDayIso(dateKey: string): string {
  return `${dateKeyUtc(dateKey)}T00:00:00.000Z`;
}

export function utcEndOfDayIso(dateKey: string): string {
  return `${dateKeyUtc(dateKey)}T23:59:59.999Z`;
}

export function addUtcDays(dateKey: string, days: number): string {
  const key = dateKeyUtc(dateKey);
  const d = new Date(`${key}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Latest N fully completed UTC calendar dates (excludes today).
 * Order: most recent completed day first (yesterday, …).
 */
export function lastCompletedUtcDateKeys(
  count: number,
  now: Date = new Date(),
): string[] {
  const n = Math.max(0, Math.floor(count));
  const today = utcTodayKey(now);
  const keys: string[] = [];
  for (let i = 1; i <= n; i++) {
    keys.push(addUtcDays(today, -i));
  }
  return keys;
}

/** Inclusive UTC timestamp range covering the latest N completed UTC days. */
export function lastCompletedUtcRange(
  count: number,
  now: Date = new Date(),
): { from: string; to: string; dateKeys: string[] } {
  const dateKeys = lastCompletedUtcDateKeys(count, now);
  if (dateKeys.length === 0) {
    const today = utcTodayKey(now);
    const yesterday = addUtcDays(today, -1);
    return {
      from: utcStartOfDayIso(yesterday),
      to: utcEndOfDayIso(yesterday),
      dateKeys: [yesterday],
    };
  }
  const newest = dateKeys[0];
  const oldest = dateKeys[dateKeys.length - 1];
  return {
    from: utcStartOfDayIso(oldest),
    to: utcEndOfDayIso(newest),
    dateKeys,
  };
}

/** e.g. "Sep 27, 2026" (UTC calendar). */
export function formatDisplayDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

/** e.g. "14:23:11 UTC" */
export function formatDisplayTimeUtc(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const timePart = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(d);
  return `${timePart} UTC`;
}

/** e.g. "Sep 27, 2026 • 14:23:11 UTC" */
export function formatDisplayDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${formatDisplayDate(iso)} • ${formatDisplayTimeUtc(iso)}`;
}

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown";
  const seconds = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** Date ranges use UTC calendar days to match daily_stats.date. */
export function resolveDateRange(
  preset: DateRangePreset,
  customFrom?: string | null,
  customTo?: string | null,
  now: Date = new Date(),
): DateRange {
  const today = utcTodayKey(now);

  if (preset === "all") {
    return { from: null, to: null, preset: "all" };
  }

  if (preset === "custom") {
    const fromKey = customFrom ? dateKeyUtc(customFrom) : null;
    const toKey = customTo ? dateKeyUtc(customTo) : null;
    return {
      from: fromKey ? utcStartOfDayIso(fromKey) : null,
      to: toKey ? utcEndOfDayIso(toKey) : null,
      preset: "custom",
    };
  }

  let fromKey: string;
  switch (preset) {
    case "today":
      fromKey = today;
      break;
    case "7d":
      fromKey = addUtcDays(today, -6);
      break;
    case "30d":
      fromKey = addUtcDays(today, -29);
      break;
    case "90d":
      fromKey = addUtcDays(today, -89);
      break;
    default:
      fromKey = addUtcDays(today, -29);
  }

  return {
    from: utcStartOfDayIso(fromKey),
    to: utcEndOfDayIso(today),
    preset,
  };
}

export function parsePreset(value: string | null | undefined): DateRangePreset {
  const allowed: DateRangePreset[] = [
    "today",
    "7d",
    "30d",
    "90d",
    "all",
    "custom",
  ];
  if (value && (allowed as string[]).includes(value)) {
    return value as DateRangePreset;
  }
  return "30d";
}
