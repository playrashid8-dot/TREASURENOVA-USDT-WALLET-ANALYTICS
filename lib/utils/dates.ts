import {
  format,
  formatDistanceToNowStrict,
  parseISO,
  isValid,
} from "date-fns";
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

export function formatDisplayDate(iso: string): string {
  const key = dateKeyUtc(iso);
  if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${key}T12:00:00.000Z`));
  }
  const d = parseISO(iso);
  if (!isValid(d)) return iso;
  return format(d, "MMM d, yyyy");
}

export function formatDisplayDateTime(iso: string): string {
  const d = parseISO(iso);
  if (!isValid(d)) return iso;
  return (
    new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone: "UTC",
    }).format(d) + " UTC"
  );
}

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const d = parseISO(iso);
  if (!isValid(d)) return "Unknown";
  return formatDistanceToNowStrict(d, { addSuffix: true });
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
