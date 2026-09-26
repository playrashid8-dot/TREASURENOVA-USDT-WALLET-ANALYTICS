import {
  format,
  formatDistanceToNowStrict,
  startOfDay,
  endOfDay,
  subDays,
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

export function dateKeyUtc(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  return format(d, "yyyy-MM-dd");
}

export function formatDisplayDate(iso: string): string {
  const d = parseISO(iso);
  if (!isValid(d)) return iso;
  return format(d, "MMM d, yyyy");
}

export function formatDisplayDateTime(iso: string): string {
  const d = parseISO(iso);
  if (!isValid(d)) return iso;
  return format(d, "MMM d, yyyy HH:mm:ss") + " UTC";
}

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const d = parseISO(iso);
  if (!isValid(d)) return "Unknown";
  return formatDistanceToNowStrict(d, { addSuffix: true });
}

export function resolveDateRange(
  preset: DateRangePreset,
  customFrom?: string | null,
  customTo?: string | null,
): DateRange {
  const now = new Date();

  if (preset === "all") {
    return { from: null, to: null, preset: "all" };
  }

  if (preset === "custom") {
    const from = customFrom
      ? startOfDay(parseISO(customFrom)).toISOString()
      : null;
    const to = customTo ? endOfDay(parseISO(customTo)).toISOString() : null;
    return { from, to, preset: "custom" };
  }

  let fromDate: Date;
  switch (preset) {
    case "today":
      fromDate = startOfDay(now);
      break;
    case "7d":
      fromDate = startOfDay(subDays(now, 6));
      break;
    case "30d":
      fromDate = startOfDay(subDays(now, 29));
      break;
    case "90d":
      fromDate = startOfDay(subDays(now, 89));
      break;
    default:
      fromDate = startOfDay(subDays(now, 29));
  }

  return {
    from: fromDate.toISOString(),
    to: endOfDay(now).toISOString(),
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
