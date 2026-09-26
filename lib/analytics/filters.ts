import { z } from "zod";
import { parsePreset, resolveDateRange } from "@/lib/utils/dates";
import type { DateRange } from "@/types/analytics";
import {
  MAX_TRANSACTION_PAGE_SIZE,
  MIN_DISPLAY_USDT_AMOUNT,
} from "@/lib/config";

export const dateRangeQuerySchema = z.object({
  preset: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const transactionsQuerySchema = z.object({
  preset: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  type: z.enum(["deposit", "withdraw", "all"]).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_TRANSACTION_PAGE_SIZE).optional(),
  search: z.string().max(128).optional(),
});

export function dateRangeFromSearchParams(
  params: URLSearchParams,
): DateRange {
  const preset = parsePreset(params.get("preset"));
  return resolveDateRange(preset, params.get("from"), params.get("to"));
}

export function applyTimestampFilter<
  T extends { gte: (col: string, val: string) => T; lte: (col: string, val: string) => T },
>(query: T, range: DateRange, column = "timestamp"): T {
  let q = query;
  if (range.from) {
    q = q.gte(column, range.from);
  }
  if (range.to) {
    q = q.lte(column, range.to);
  }
  return q;
}

/** True when a transaction amount should appear in user-facing lists. */
export function meetsMinDisplayUsdtAmount(
  amountUsdt: number,
  minAmount = MIN_DISPLAY_USDT_AMOUNT,
): boolean {
  return Number.isFinite(amountUsdt) && amountUsdt >= minAmount;
}

/** Apply the display-only >= MIN_DISPLAY_USDT_AMOUNT filter before pagination. */
export function applyMinDisplayAmountFilter<
  T extends { gte: (col: string, val: number | string) => T },
>(query: T, column = "amount_usdt"): T {
  return query.gte(column, MIN_DISPLAY_USDT_AMOUNT);
}
