import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { dateRangeFromSearchParams } from "@/lib/analytics/filters";
import {
  enforceRateLimit,
  jsonError,
  jsonOk,
  withRateLimitHeaders,
} from "@/lib/api/response";
import type { DailyStatRow } from "@/types/analytics";
import { getPrimaryConfigError } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limited = enforceRateLimit(request, "daily-stats", 60, 60_000);
  if (!limited.ok) return limited.response;

  const configError = getPrimaryConfigError();
  const { searchParams } = new URL(request.url);
  const range = dateRangeFromSearchParams(searchParams);

  if (!isSupabaseConfigured()) {
    return withRateLimitHeaders(
      jsonOk({ data: [], dateRange: range, configError: configError || "Database not configured." }),
      limited.result,
    );
  }

  try {
    const supabase = getSupabaseAdmin();
    let query = supabase
      .from("daily_stats")
      .select(
        "date, deposit_amount, withdrawal_amount, net_cash_flow, deposit_count, withdrawal_count",
      )
      .order("date", { ascending: false });

    if (range.from) {
      query = query.gte("date", range.from.slice(0, 10));
    }
    if (range.to) {
      query = query.lte("date", range.to.slice(0, 10));
    }

    const { data, error } = await query;
    if (error) {
      return jsonError("Historical indexer is syncing or unavailable.", 503);
    }

    const rows: DailyStatRow[] = (data ?? []).map((r) => ({
      date: r.date,
      depositAmount: Number(r.deposit_amount) || 0,
      withdrawalAmount: Number(r.withdrawal_amount) || 0,
      netCashFlow: Number(r.net_cash_flow) || 0,
      depositCount: Number(r.deposit_count) || 0,
      withdrawalCount: Number(r.withdrawal_count) || 0,
    }));

    return withRateLimitHeaders(
      jsonOk({ data: rows, dateRange: range, configError }),
      limited.result,
    );
  } catch (err) {
    console.error("[api/daily-stats]", err);
    return jsonError("Blockchain data temporarily unavailable.", 503);
  }
}
